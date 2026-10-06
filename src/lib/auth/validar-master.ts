import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export interface ValidacaoMasterResult {
  autorizado: boolean
  user?: any
  perfil?: any
  responseError?: NextResponse
}

export async function validarSessaoMaster(req?: NextRequest): Promise<ValidacaoMasterResult> {
  try {
    const admin = createAdminClient()
    let user: any = null

    // 1. Tentar validar via Bearer token no cabeçalho Authorization
    const authHeader = req?.headers?.get('authorization')
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim()
      if (token) {
        const { data, error } = await admin.auth.getUser(token)
        if (!error && data?.user) {
          user = data.user
        }
      }
    }

    // 2. Se não encontrou por Header, tentar via Cookies da sessão SSR
    if (!user) {
      try {
        const supabase = createClient()
        const { data, error } = await supabase.auth.getUser()
        if (!error && data?.user) {
          user = data.user
        }
      } catch (cookieErr) {
        // Ignora erro de leitura de cookie para seguir fluxo seguro
      }
    }

    if (!user) {
      return {
        autorizado: false,
        responseError: NextResponse.json(
          { error: 'Não autenticado. Faça login para continuar.' },
          { status: 401 }
        ),
      }
    }

    const { data: perfil, error: perfilError } = await admin
      .from('perfis_usuario')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()

    if (perfilError || !perfil) {
      return {
        autorizado: false,
        responseError: NextResponse.json(
          { error: 'Perfil de usuário não encontrado.' },
          { status: 403 }
        ),
      }
    }

    if (!perfil.is_master) {
      return {
        autorizado: false,
        responseError: NextResponse.json(
          { error: 'Acesso restrito. Este módulo requer permissões MASTER.' },
          { status: 403 }
        ),
      }
    }

    return {
      autorizado: true,
      user,
      perfil,
    }
  } catch (err: any) {
    return {
      autorizado: false,
      responseError: NextResponse.json(
        { error: 'Erro interno ao validar permissão: ' + err.message },
        { status: 500 }
      ),
    }
  }
}

export async function registrarAuditoria({
  responsavelId,
  responsavelEmail,
  alvoId,
  alvoEmail,
  acao,
  detalhes = {},
}: {
  responsavelId: string
  responsavelEmail: string
  alvoId?: string | null
  alvoEmail: string
  acao: string
  detalhes?: Record<string, any>
}) {
  try {
    const admin = createAdminClient()
    await admin.from('auditoria_usuarios_log').insert({
      usuario_responsavel_id: responsavelId,
      usuario_responsavel_email: responsavelEmail,
      usuario_alvo_id: alvoId || null,
      usuario_alvo_email: alvoEmail,
      acao,
      detalhes,
      created_at: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[Auditoria] Falha ao registrar log:', err)
  }
}
