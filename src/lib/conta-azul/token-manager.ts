/**
 * Gerenciador centralizado de tokens OAuth do Conta Azul.
 * 
 * Substitui o bloco duplicado de ~20 linhas que existia em cada rota de API.
 * Responsável por:
 *  1. Buscar a empresa no banco (Supabase)
 *  2. Verificar se o access_token está prestes a expirar (margem de 5 min)
 *  3. Se expirado, renovar via refresh_token e salvar os novos tokens
 *  4. Retornar o accessToken válido
 */

import { createClient } from '@supabase/supabase-js'
import { refreshToken } from './api'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/** Erro específico de token para tratamento nas rotas */
export class TokenError extends Error {
  public statusCode: number
  constructor(message: string, statusCode = 401) {
    super(message)
    this.name = 'TokenError'
    this.statusCode = statusCode
  }
}

export interface ValidTokenResult {
  accessToken: string
  empresa: Record<string, any>
}

/**
 * Obtém um token de acesso válido para a empresa especificada.
 * Se o token estiver expirado (ou a menos de 5 min de expirar), 
 * renova automaticamente usando o refresh_token.
 * 
 * @param empresaId - UUID da empresa no Supabase
 * @returns O accessToken válido e os dados da empresa
 * @throws TokenError se a empresa não existe, não tem token, ou não consegue renovar
 */
export async function getValidToken(
  empresaId: string,
  modulo: 'financeiro' | 'vendas' = 'financeiro',
  forceRefresh: boolean = false
): Promise<ValidTokenResult> {
  // 1. Buscar empresa
  const { data: empresa, error: errEmp } = await supabaseAdmin
    .from('empresas')
    .select('*')
    .eq('id', empresaId)
    .single()

  if (errEmp || !empresa) {
    throw new TokenError('Empresa não encontrada', 404)
  }

  // Determinar qual conjunto de tokens usar
  const isVendas = modulo === 'vendas' && empresa.access_token_conta_azul_vendas
  const tokenKey = isVendas ? 'access_token_conta_azul_vendas' : 'access_token_conta_azul'
  const refreshKey = isVendas ? 'refresh_token_conta_azul_vendas' : 'refresh_token_conta_azul'
  const expiracaoKey = isVendas ? 'data_expiracao_token_vendas' : 'data_expiracao_token'

  let targetEmpresa = empresa
  let rawToken = empresa[tokenKey]

  // Fallback: Se a empresa não tem token próprio, buscar qualquer empresa do mesmo grupo que esteja conectada ao Conta Azul
  if (!rawToken && empresa.grupo_id) {
    const { data: grupoEmpresas } = await supabaseAdmin
      .from('empresas')
      .select('*')
      .eq('grupo_id', empresa.grupo_id)
      .not(tokenKey, 'is', null)

    if (grupoEmpresas && grupoEmpresas.length > 0) {
      targetEmpresa = grupoEmpresas[0]
      rawToken = grupoEmpresas[0][tokenKey]
    }
  }

  if (!rawToken) {
    throw new TokenError(
      `Empresa "${empresa.nome}" não está conectada ao Conta Azul (${modulo === 'vendas' ? 'Vendas' : 'Financeiro'}). Acesse Empresas e conecte ou espelhe a Conta Azul.`,
      401
    )
  }

  // 2. Verificar expiração (margem de 5 minutos)
  let accessToken = rawToken
  const expiracao = targetEmpresa[expiracaoKey] ? new Date(targetEmpresa[expiracaoKey]) : null
  const agora = new Date()
  const tokenExpirado = expiracao && expiracao <= new Date(agora.getTime() + 5 * 60 * 1000)

  // 3. Renovar se necessário ou se solicitado (forceRefresh)
  const currentRefreshToken = targetEmpresa[refreshKey]
  if ((tokenExpirado || forceRefresh) && currentRefreshToken) {
    try {
      const novosTokens = await refreshToken(
        currentRefreshToken,
        process.env.CONTA_AZUL_CLIENT_ID!,
        process.env.CONTA_AZUL_CLIENT_SECRET!
      )
      accessToken = novosTokens.access_token

      const updateData: Record<string, any> = {
        [tokenKey]: novosTokens.access_token,
        [refreshKey]: novosTokens.refresh_token || currentRefreshToken,
        [expiracaoKey]: new Date(Date.now() + (novosTokens.expires_in || 3600) * 1000).toISOString(),
      }

      if (isVendas) {
        updateData.conta_azul_vendas_connected = true
      } else {
        updateData.conta_azul_connected = true
      }

      let query = supabaseAdmin.from('empresas').update(updateData)
      if (targetEmpresa.email_login) {
        query = query.or(`id.eq.${targetEmpresa.id},email_login.eq.${targetEmpresa.email_login}`)
      } else if (targetEmpresa.grupo_id) {
        query = query.or(`id.eq.${targetEmpresa.id},grupo_id.eq.${targetEmpresa.grupo_id}`)
      } else {
        query = query.eq('id', targetEmpresa.id)
      }
      const { error: errUpdate } = await query

      if (errUpdate) {
        console.error('[token-manager] Falha ao salvar novos tokens:', errUpdate.message)
      }

      console.log(`[token-manager] Token (${modulo}) renovado com sucesso para empresa ${targetEmpresa.nome || targetEmpresa.id}`)
    } catch (errRefresh) {
      console.error('[token-manager] Falha ao renovar token:', errRefresh)
      throw new TokenError(
        `Sua conexão com a Conta Azul (${modulo}) expirou. Por favor, acesse Empresas e reconecte a Conta Azul.`,
        401
      )
    }
  }

  return { accessToken, empresa: targetEmpresa }
}
