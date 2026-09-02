/**
 * Gerenciador centralizado de tokens OAuth do Conta Azul.
 * 
 * Substitui o bloco duplicado de ~20 linhas que existia em cada rota de API.
 * Responsável por:
 *  1. Buscar a empresa no banco (Supabase)
 *  2. Verificar se o access_token está prestes a expirar (margem de 5 min)
 *  3. Se expirado, renovar via refresh_token e salvar os novos tokens
 *  4. Retornar o accessToken válido
 *  5. Proteger contra concorrência (Race Conditions) com fila/lock em memória e re-checagem no banco
 */

import { createClient } from '@supabase/supabase-js'
import { refreshToken } from './api'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/** Fila/Lock em memória para evitar renovações simultâneas da mesma empresa */
const refreshPromises = new Map<string, Promise<ValidTokenResult>>()

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
 * renova automaticamente usando o refresh_token de forma segura e sincronizada.
 * 
 * @param empresaId - UUID da empresa no Supabase
 * @param modulo - 'financeiro' ou 'vendas'
 * @param forceRefresh - Forçar renovação imediata
 * @returns O accessToken válido e os dados da empresa
 * @throws TokenError se a empresa não existe, não tem token, ou não consegue renovar
 */
export async function getValidToken(
  empresaId: string,
  modulo: 'financeiro' | 'vendas' = 'financeiro',
  forceRefresh: boolean = false
): Promise<ValidTokenResult> {
  const lockKey = `${empresaId}:${modulo}`

  // Se já houver uma renovação em andamento para esta empresa/módulo, aguarda a mesma Promise
  if (!forceRefresh && refreshPromises.has(lockKey)) {
    console.log(`[token-manager] Aguardando renovação em andamento para ${lockKey}...`)
    return await refreshPromises.get(lockKey)!
  }

  const promise = (async () => {
    try {
      return await executeGetValidToken(empresaId, modulo, forceRefresh)
    } finally {
      refreshPromises.delete(lockKey)
    }
  })()

  refreshPromises.set(lockKey, promise)
  return await promise
}

async function executeGetValidToken(
  empresaId: string,
  modulo: 'financeiro' | 'vendas',
  forceRefresh: boolean
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
  const isVendas = modulo === 'vendas'
  const tokenKey = isVendas ? 'access_token_conta_azul_vendas' : 'access_token_conta_azul'
  const refreshKey = isVendas ? 'refresh_token_conta_azul_vendas' : 'refresh_token_conta_azul'
  const expiracaoKey = isVendas ? 'data_expiracao_token_vendas' : 'data_expiracao_token'

  let targetEmpresa = empresa
  const rawToken = empresa[tokenKey]

  if (!rawToken) {
    throw new TokenError(
      `Empresa "${empresa.nome}" não está conectada ao Conta Azul (${modulo === 'vendas' ? 'Vendas' : 'Financeiro'}). Acesse Empresas e conecte a Conta Azul.`,
      401
    )
  }

  // 2. Verificar expiração (margem de 5 minutos)
  let accessToken = rawToken
  const expiracao = targetEmpresa[expiracaoKey] ? new Date(targetEmpresa[expiracaoKey]) : null
  const agora = new Date()
  const tokenExpirado = expiracao && expiracao <= new Date(agora.getTime() + 5 * 60 * 1000)

  // 3. Se expirado (e não forçado), faz uma re-checagem no banco para ver se outro processo acabou de renovar
  if (tokenExpirado && !forceRefresh) {
    const { data: latestEmpresa } = await supabaseAdmin
      .from('empresas')
      .select('*')
      .eq('id', empresaId)
      .single()

    if (latestEmpresa) {
      const latestExp = latestEmpresa[expiracaoKey] ? new Date(latestEmpresa[expiracaoKey]) : null
      if (latestExp && latestExp > new Date(Date.now() + 5 * 60 * 1000) && latestEmpresa[tokenKey]) {
        console.log(`[token-manager] Token (${modulo}) já foi renovado por outro processo para empresa ${latestEmpresa.nome || empresaId}`)
        return { accessToken: latestEmpresa[tokenKey], empresa: latestEmpresa }
      }
      targetEmpresa = latestEmpresa
    }
  }

  // 4. Renovar se necessário ou se solicitado (forceRefresh)
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

      const { error: errUpdate } = await supabaseAdmin
        .from('empresas')
        .update(updateData)
        .eq('id', targetEmpresa.id)

      if (errUpdate) {
        console.error('[token-manager] Falha ao salvar novos tokens:', errUpdate.message)
      }

      console.log(`[token-manager] Token (${modulo}) renovado com sucesso para empresa ${targetEmpresa.nome || targetEmpresa.id}`)
      targetEmpresa = { ...targetEmpresa, ...updateData }
    } catch (errRefresh) {
      console.error('[token-manager] Falha ao renovar token:', errRefresh)
      // Limpa os tokens expirados/inválidos no Supabase para que a interface reflita o status real (Vermelho)
      const updateDataClear: Record<string, any> = isVendas ? {
        access_token_conta_azul_vendas: null,
        refresh_token_conta_azul_vendas: null,
        data_expiracao_token_vendas: null,
        conta_azul_vendas_connected: false,
      } : {
        access_token_conta_azul: null,
        refresh_token_conta_azul: null,
        data_expiracao_token: null,
        conta_azul_connected: false,
      }
      await supabaseAdmin.from('empresas').update(updateDataClear).eq('id', targetEmpresa.id)

      throw new TokenError(
        `Sua conexão com a Conta Azul (${modulo}) expirou. Por favor, acesse Empresas e reconecte a Conta Azul.`,
        401
      )
    }
  }

  return { accessToken, empresa: targetEmpresa }
}
