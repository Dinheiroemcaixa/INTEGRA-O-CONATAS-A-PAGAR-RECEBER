import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export interface ValidacaoMasterResult {
  autorizado: boolean
  user?: any
  perfil?: any
  responseError?: NextResponse
}

export async function validarSessaoMaster(): Promise<ValidacaoMasterResult> {
  try {
    const supabase = createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return {
        autorizado: false,
        responseError: NextResponse.json(
          { error: 'Não autenticado. Faça login para continuar.' },
          { status: 401 }
        ),
      }
    }

    const admin = createAdminClient()
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
