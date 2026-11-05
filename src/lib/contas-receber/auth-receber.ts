/**
 * DCX LINK — MÓDULO CONTAS A RECEBER
 * Autenticação e Autorização Estrita no Servidor para Endpoints de Contas a Receber.
 *
 * Reutiliza integralmente os padrões reais do DCX LINK:
 * - Sessão do usuário via `supabase.auth.getUser()` (SSR Cookies ou Bearer token).
 * - Perfil em `public.perfis_usuario`: exige `status === 'APROVADO'` e (`is_master === true` ou `permissoes.contas_receber === true`).
 * - Vínculo multi-tenant à empresa/loja solicitada:
 *   1. Confirma existência da empresa em `public.empresas`.
 *   2. Para usuários não-master, exige acesso comprovado (`created_by = auth.uid()`, vínculo em `public.usuarios_empresas`
 *      ou visibilidade autorizada via RLS em `public.empresas`).
 */

import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const PERMISSOES_PADRAO_RECEBER_AUTH: Record<string, boolean> = {
  dashboard: true,
  gestao_pagamentos: true,
  conciliacao: true,
  contas_pagar: true,
  contas_receber: false,
  vendas: true,
  conta_azul: true,
  relatorios: true,
  fiscal: true,
  configuracoes: true,
}

export interface EmpresaAutorizadaReceberDTO {
  id: string
  nome: string
  cnpj: string | null
  conta_azul_connected: boolean
  email_login?: string | null
}

export interface ResultadoAutorizacaoReceber {
  autorizado: boolean
  statusHttp: 200 | 400 | 401 | 403 | 404 | 500
  codigoErro?:
    | 'NAO_AUTENTICADO'
    | 'PERFIL_NAO_APROVADO'
    | 'SEM_PERMISSAO_CONTAS_RECEBER'
    | 'EMPRESA_OBRIGATORIA'
    | 'EMPRESA_NAO_ENCONTRADA'
    | 'EMPRESA_NAO_AUTORIZADA'
    | 'ERRO_INTERNO_AUTH'
  mensagemErro?: string
  usuario?: {
    id: string
    email: string
    isMaster: boolean
  }
  empresaAutorizada?: EmpresaAutorizadaReceberDTO
}

export interface DependenciasAutenticacaoReceber {
  obterUsuarioAutenticado?: (req?: NextRequest) => Promise<{
    id: string
    email?: string | null
  } | null>
  buscarPerfilUsuario?: (userId: string) => Promise<{
    user_id: string
    email?: string | null
    is_master?: boolean | null
    status?: string | null
    permissoes?: Record<string, boolean> | null
  } | null>
  verificarAcessoEmpresaUsuario?: (params: {
    userId: string
    empresaId: string
    isMaster: boolean
  }) => Promise<{
    acessoPermitido: boolean
    empresa: EmpresaAutorizadaReceberDTO | null
  }>
}

/**
 * Cria as dependências padrão conectadas ao Supabase SSR (`createClient`) e Admin (`createAdminClient`),
 * acionando o cliente administrativo SOMENTE após confirmar a identidade do usuário autenticado.
 */
export function criarDependenciasAutenticacaoReceberPadrao(): Required<DependenciasAutenticacaoReceber> {
  return {
    async obterUsuarioAutenticado(req?: NextRequest) {
      // 1. Tenta primeiro via cabeçalho Authorization Bearer (mesma ordem canônica de validar-master.ts)
      const authHeader = req?.headers?.get('authorization')
      if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
        const token = authHeader.substring(7).trim()
        if (token) {
          const admin = createAdminClient()
          const { data, error } = await admin.auth.getUser(token)
          if (!error && data?.user?.id) {
            return {
              id: data.user.id,
              email: data.user.email || null,
            }
          }
        }
      }

      // 2. Se não houver Bearer token válido, tenta via cookies da sessão SSR do Next.js
      try {
        const { createClient: createServerClient } = await import(
          '@/lib/supabase/server'
        )
        const supabaseSsr = createServerClient()
        const { data, error } = await supabaseSsr.auth.getUser()
        if (!error && data?.user?.id) {
          return {
            id: data.user.id,
            email: data.user.email || null,
          }
        }
      } catch {
        // Ignora erro de leitura de cookie fora de request context
      }

      return null
    },

    async buscarPerfilUsuario(userId: string) {
      const admin = createAdminClient()
      const { data, error } = await admin
        .from('perfis_usuario')
        .select('user_id, email, is_master, status, permissoes')
        .eq('user_id', userId)
        .maybeSingle()

      if (error) {
        throw new Error(
          `Erro ao consultar perfil de permissões do usuário: ${error.message}`
        )
      }

      return data || null
    },

    async verificarAcessoEmpresaUsuario({ userId, empresaId, isMaster }) {
      const admin = createAdminClient()

      // 1. Busca autoritativa da empresa no banco
      const { data: empresaRow, error: errEmpresa } = await admin
        .from('empresas')
        .select('id, nome, cnpj, conta_azul_connected, email_login, created_by')
        .eq('id', empresaId)
        .maybeSingle()

      if (errEmpresa) {
        throw new Error(
          `Erro ao consultar cadastro da empresa solicitada: ${errEmpresa.message}`
        )
      }

      if (!empresaRow) {
        return { acessoPermitido: false, empresa: null }
      }

      const empresaDto: EmpresaAutorizadaReceberDTO = {
        id: String(empresaRow.id),
        nome: String(empresaRow.nome || '').trim(),
        cnpj: empresaRow.cnpj ? String(empresaRow.cnpj) : null,
        conta_azul_connected: Boolean(empresaRow.conta_azul_connected),
        email_login: empresaRow.email_login
          ? String(empresaRow.email_login)
          : null,
      }

      // Administrador Master devidamente validado tem acesso multi-empresa
      if (isMaster) {
        return { acessoPermitido: true, empresa: empresaDto }
      }

      // 2. Verifica se o usuário é o criador direto da empresa (regra de 004_fix_rls_empresas.sql / 011_revert_rls_isolation.sql)
      if (
        empresaRow.created_by &&
        String(empresaRow.created_by) === String(userId)
      ) {
        return { acessoPermitido: true, empresa: empresaDto }
      }

      // 3. Verifica vínculo explícito na tabela multi-tenant `public.usuarios_empresas`
      const { data: vinculoRow, error: errVinculo } = await admin
        .from('usuarios_empresas')
        .select('id, user_id, empresa_id')
        .eq('user_id', userId)
        .eq('empresa_id', empresaId)
        .maybeSingle()

      if (errVinculo) {
        throw new Error(
          `Erro ao verificar vínculo do usuário com a empresa: ${errVinculo.message}`
        )
      }

      if (vinculoRow?.id) {
        return { acessoPermitido: true, empresa: empresaDto }
      }

      // 4. Verifica também via cliente SSR sujeito às policies RLS ativas de `public.empresas`
      try {
        const { createClient: createServerClient } = await import(
          '@/lib/supabase/server'
        )
        const supabaseSsr = createServerClient()
        const { data: empresaRls } = await supabaseSsr
          .from('empresas')
          .select('id')
          .eq('id', empresaId)
          .maybeSingle()

        if (empresaRls?.id === empresaId) {
          return { acessoPermitido: true, empresa: empresaDto }
        }
      } catch {
        // Ignora erro de cookie SSR caso esteja em ambiente de teste sem request store
      }

      return { acessoPermitido: false, empresa: empresaDto }
    },
  }
}

/**
 * Valida sessão, aprovação do perfil, permissão `contas_receber` (ou `is_master`)
 * e acesso autorizado à `empresa_id` solicitada no servidor.
 */
export async function validarAutorizacaoContasReceber(
  params: {
    req?: NextRequest
    empresaId: string
  },
  depsCustom?: DependenciasAutenticacaoReceber
): Promise<ResultadoAutorizacaoReceber> {
  const depsPadrao = criarDependenciasAutenticacaoReceberPadrao()
  const deps: Required<DependenciasAutenticacaoReceber> = {
    obterUsuarioAutenticado:
      depsCustom?.obterUsuarioAutenticado || depsPadrao.obterUsuarioAutenticado,
    buscarPerfilUsuario:
      depsCustom?.buscarPerfilUsuario || depsPadrao.buscarPerfilUsuario,
    verificarAcessoEmpresaUsuario:
      depsCustom?.verificarAcessoEmpresaUsuario ||
      depsPadrao.verificarAcessoEmpresaUsuario,
  }

  try {
    // 1. Validar sessão do usuário (HTTP 401 se não autenticado)
    const user = await deps.obterUsuarioAutenticado(params.req)
    if (!user || !user.id) {
      return {
        autorizado: false,
        statusHttp: 401,
        codigoErro: 'NAO_AUTENTICADO',
        mensagemErro:
          'Não autenticado. Faça login no DCX LINK para acessar o módulo Contas a Receber.',
      }
    }

    // 2. Validar perfil em `perfis_usuario` (status APROVADO e permissão `contas_receber` ou `is_master`)
    const perfil = await deps.buscarPerfilUsuario(user.id)
    if (!perfil) {
      return {
        autorizado: false,
        statusHttp: 403,
        codigoErro: 'PERFIL_NAO_APROVADO',
        mensagemErro:
          'Acesso negado: perfil de usuário não localizado na Central Mestre.',
      }
    }

    const statusPerfil = String(perfil.status || 'PENDENTE').toUpperCase()
    const isMaster = Boolean(perfil.is_master)

    if (!isMaster && statusPerfil !== 'APROVADO') {
      return {
        autorizado: false,
        statusHttp: 403,
        codigoErro: 'PERFIL_NAO_APROVADO',
        mensagemErro: `Acesso negado: seu cadastro encontra-se com status "${statusPerfil}" e requer aprovação na Central Mestre.`,
      }
    }

    const permissoesEfetivas = {
      ...PERMISSOES_PADRAO_RECEBER_AUTH,
      ...(perfil.permissoes || {}),
    }

    const temPermissaoContasReceber =
      isMaster || Boolean(permissoesEfetivas.contas_receber)

    if (!temPermissaoContasReceber) {
      return {
        autorizado: false,
        statusHttp: 403,
        codigoErro: 'SEM_PERMISSAO_CONTAS_RECEBER',
        mensagemErro:
          'Acesso negado: seu usuário não possui permissão ativa para o módulo Contas a Receber.',
      }
    }

    // 3. Validar empresa solicitada e vínculo de acesso do usuário
    const empresaIdLimpo = String(params.empresaId || '').trim()
    if (!empresaIdLimpo || empresaIdLimpo === 'emp-demo') {
      return {
        autorizado: false,
        statusHttp: 400,
        codigoErro: 'EMPRESA_OBRIGATORIA',
        mensagemErro:
          'A loja/empresa ativa (empresa_id) é obrigatória e deve corresponder a uma empresa real cadastrada.',
      }
    }

    const resultadoEmpresa = await deps.verificarAcessoEmpresaUsuario({
      userId: user.id,
      empresaId: empresaIdLimpo,
      isMaster,
    })

    if (!resultadoEmpresa.empresa) {
      return {
        autorizado: false,
        statusHttp: 403,
        codigoErro: 'EMPRESA_NAO_ENCONTRADA',
        mensagemErro:
          'Acesso negado: a loja/empresa solicitada não existe ou você não possui autorização para acessá-la.',
      }
    }

    if (!resultadoEmpresa.acessoPermitido) {
      return {
        autorizado: false,
        statusHttp: 403,
        codigoErro: 'EMPRESA_NAO_AUTORIZADA',
        mensagemErro: `Acesso negado: seu usuário não possui vínculo de acesso autorizado para a loja "${resultadoEmpresa.empresa.nome}".`,
      }
    }

    return {
      autorizado: true,
      statusHttp: 200,
      usuario: {
        id: user.id,
        email: String(user.email || perfil.email || ''),
        isMaster,
      },
      empresaAutorizada: resultadoEmpresa.empresa,
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      autorizado: false,
      statusHttp: 500,
      codigoErro: 'ERRO_INTERNO_AUTH',
      mensagemErro: `Erro ao validar autenticação e autorização no servidor: ${msg}`,
    }
  }
}
