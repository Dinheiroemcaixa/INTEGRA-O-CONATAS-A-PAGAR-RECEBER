import { NextRequest, NextResponse } from 'next/server'
import { validarSessaoMaster, registrarAuditoria } from '@/lib/auth/validar-master'
import { createAdminClient } from '@/lib/supabase/admin'
import { PERMISSOES_PADRAO } from '@/contexts/UserPermissionsContext'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const check = await validarSessaoMaster(req)
  if (!check.autorizado) return check.responseError!

  try {
    const admin = createAdminClient()

    // 1. Obter usuários do Auth
    const { data: authData, error: authError } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    })

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 500 })
    }

    // 2. Obter perfis
    const { data: perfis, error: perfisError } = await admin
      .from('perfis_usuario')
      .select('*')

    if (perfisError) {
      return NextResponse.json({ error: perfisError.message }, { status: 500 })
    }

    const perfisMap = new Map((perfis || []).map(p => [p.user_id, p]))

    // 3. Montar lista consolidada
    const listaUsuarios = authData.users.map(u => {
      const p = perfisMap.get(u.id)
      return {
        id: u.id,
        email: u.email || p?.email || '',
        nome: p?.nome_exibicao || u.user_metadata?.nome || u.user_metadata?.name || u.email?.split('@')[0] || 'Usuário',
        is_master: !!p?.is_master,
        status: p?.status || 'APROVADO',
        permissoes: p?.permissoes || PERMISSOES_PADRAO,
        forcar_troca_senha: !!p?.forcar_troca_senha,
        criado_em: p?.criado_em || u.created_at,
        ultimo_acesso: u.last_sign_in_at || p?.ultimo_acesso || null,
      }
    })

    // Ordenar: primeiro Pendentes, depois por data de criação desc
    listaUsuarios.sort((a, b) => {
      if (a.status === 'PENDENTE' && b.status !== 'PENDENTE') return -1
      if (a.status !== 'PENDENTE' && b.status === 'PENDENTE') return 1
      return new Date(b.criado_em || 0).getTime() - new Date(a.criado_em || 0).getTime()
    })

    return NextResponse.json({
      sucesso: true,
      usuarios: listaUsuarios,
      total: listaUsuarios.length,
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Erro ao listar usuários: ' + err.message },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  const check = await validarSessaoMaster(req)
  if (!check.autorizado) return check.responseError!

  const admin = createAdminClient()
  const masterUser = check.user!

  try {
    const body = await req.json()
    const { acao, usuarioId, ...dados } = body

    if (!acao || !usuarioId) {
      return NextResponse.json(
        { error: 'Parâmetros "acao" e "usuarioId" são obrigatórios.' },
        { status: 400 }
      )
    }

    // Buscar usuário alvo
    const { data: usuarioAlvoAuth, error: authGetError } = await admin.auth.admin.getUserById(usuarioId)
    if (authGetError || !usuarioAlvoAuth.user) {
      return NextResponse.json(
        { error: 'Usuário alvo não encontrado no Auth.' },
        { status: 404 }
      )
    }
    const alvoEmail = usuarioAlvoAuth.user.email || 'sem-email'

    // Garantir que existe registro em perfis_usuario
    const { data: perfilAlvo } = await admin
      .from('perfis_usuario')
      .select('*')
      .eq('user_id', usuarioId)
      .maybeSingle()

    if (!perfilAlvo) {
      await admin.from('perfis_usuario').insert({
        user_id: usuarioId,
        email: alvoEmail,
        is_master: false,
        status: 'PENDENTE',
        permissoes: PERMISSOES_PADRAO,
        forcar_troca_senha: false,
      })
    }

    switch (acao) {
      case 'APROVAR': {
        const { error } = await admin
          .from('perfis_usuario')
          .update({
            status: 'APROVADO',
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', usuarioId)

        if (error) throw error

        await registrarAuditoria({
          responsavelId: masterUser.id,
          responsavelEmail: masterUser.email,
          alvoId: usuarioId,
          alvoEmail,
          acao: 'APROVAR_USUARIO',
          detalhes: { statusAnterior: perfilAlvo?.status },
        })

        return NextResponse.json({ sucesso: true, mensagem: 'Usuário aprovado com sucesso!' })
      }

      case 'REJEITAR': {
        if (usuarioId === masterUser.id) {
          return NextResponse.json({ error: 'Você não pode rejeitar sua própria conta.' }, { status: 400 })
        }

        const { error } = await admin
          .from('perfis_usuario')
          .update({
            status: 'REJEITADO',
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', usuarioId)

        if (error) throw error

        await registrarAuditoria({
          responsavelId: masterUser.id,
          responsavelEmail: masterUser.email,
          alvoId: usuarioId,
          alvoEmail,
          acao: 'REJEITAR_USUARIO',
          detalhes: { motivo: dados.motivo || 'Rejeitado pelo administrador' },
        })

        return NextResponse.json({ sucesso: true, mensagem: 'Usuário rejeitado.' })
      }

      case 'BLOQUEAR': {
        if (usuarioId === masterUser.id) {
          return NextResponse.json({ error: 'Você não pode bloquear sua própria conta.' }, { status: 400 })
        }

        const { error } = await admin
          .from('perfis_usuario')
          .update({
            status: 'BLOQUEADO',
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', usuarioId)

        if (error) throw error

        // Encerrar sessões ativas do usuário bloqueado
        try {
          await admin.auth.admin.signOut(usuarioId, 'global')
        } catch (e) {
          console.warn('Erro ao encerrar sessões:', e)
        }

        await registrarAuditoria({
          responsavelId: masterUser.id,
          responsavelEmail: masterUser.email,
          alvoId: usuarioId,
          alvoEmail,
          acao: 'BLOQUEAR_USUARIO',
          detalhes: { motivo: dados.motivo || 'Bloqueado pelo administrador' },
        })

        return NextResponse.json({ sucesso: true, mensagem: 'Usuário bloqueado e sessões encerradas.' })
      }

      case 'DESBLOQUEAR': {
        const { error } = await admin
          .from('perfis_usuario')
          .update({
            status: 'APROVADO',
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', usuarioId)

        if (error) throw error

        await registrarAuditoria({
          responsavelId: masterUser.id,
          responsavelEmail: masterUser.email,
          alvoId: usuarioId,
          alvoEmail,
          acao: 'DESBLOQUEAR_USUARIO',
          detalhes: {},
        })

        return NextResponse.json({ sucesso: true, mensagem: 'Usuário desbloqueado com sucesso!' })
      }

      case 'ATUALIZAR_PERMISSOES': {
        const novasPermissoes = dados.permissoes
        if (!novasPermissoes || typeof novasPermissoes !== 'object') {
          return NextResponse.json({ error: 'Permissões inválidas.' }, { status: 400 })
        }

        const { error } = await admin
          .from('perfis_usuario')
          .update({
            permissoes: novasPermissoes,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', usuarioId)

        if (error) throw error

        await registrarAuditoria({
          responsavelId: masterUser.id,
          responsavelEmail: masterUser.email,
          alvoId: usuarioId,
          alvoEmail,
          acao: 'ALTERAR_PERMISSOES',
          detalhes: {
            antes: perfilAlvo?.permissoes,
            depois: novasPermissoes,
          },
        })

        return NextResponse.json({ sucesso: true, mensagem: 'Permissões atualizadas com sucesso!' })
      }

      case 'COPIAR_PERMISSOES': {
        const { usuarioModeloId } = dados
        if (!usuarioModeloId) {
          return NextResponse.json({ error: 'Usuário modelo não informado.' }, { status: 400 })
        }

        const { data: perfilModelo, error: errModelo } = await admin
          .from('perfis_usuario')
          .select('permissoes, email')
          .eq('user_id', usuarioModeloId)
          .maybeSingle()

        if (errModelo || !perfilModelo) {
          return NextResponse.json({ error: 'Usuário modelo não encontrado.' }, { status: 404 })
        }

        const { error } = await admin
          .from('perfis_usuario')
          .update({
            permissoes: perfilModelo.permissoes,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', usuarioId)

        if (error) throw error

        await registrarAuditoria({
          responsavelId: masterUser.id,
          responsavelEmail: masterUser.email,
          alvoId: usuarioId,
          alvoEmail,
          acao: 'COPIAR_PERMISSOES',
          detalhes: {
            modeloId: usuarioModeloId,
            modeloEmail: perfilModelo.email,
            permissoesCopiadas: perfilModelo.permissoes,
          },
        })

        return NextResponse.json({
          sucesso: true,
          mensagem: `Permissões copiadas com sucesso de ${perfilModelo.email || 'usuário modelo'}!`,
        })
      }

      case 'FORCAR_TROCA_SENHA': {
        const forcar = dados.forcar !== undefined ? !!dados.forcar : true
        const { error } = await admin
          .from('perfis_usuario')
          .update({
            forcar_troca_senha: forcar,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', usuarioId)

        if (error) throw error

        await registrarAuditoria({
          responsavelId: masterUser.id,
          responsavelEmail: masterUser.email,
          alvoId: usuarioId,
          alvoEmail,
          acao: 'FORCAR_TROCA_SENHA',
          detalhes: { forcar },
        })

        return NextResponse.json({
          sucesso: true,
          mensagem: forcar
            ? 'O usuário deverá alterar a senha no próximo acesso.'
            : 'Exigência de troca de senha desativada.',
        })
      }

      case 'ENCERRAR_SESSOES': {
        try {
          await admin.auth.admin.signOut(usuarioId, 'global')
        } catch (e: any) {
          return NextResponse.json({ error: 'Falha ao encerrar sessões: ' + e.message }, { status: 500 })
        }

        await registrarAuditoria({
          responsavelId: masterUser.id,
          responsavelEmail: masterUser.email,
          alvoId: usuarioId,
          alvoEmail,
          acao: 'ENCERRAR_SESSOES',
          detalhes: {},
        })

        return NextResponse.json({ sucesso: true, mensagem: 'Todas as sessões ativas foram encerradas.' })
      }

      case 'SET_MASTER': {
        if (usuarioId === masterUser.id && !dados.is_master) {
          return NextResponse.json({ error: 'Você não pode revogar seu próprio acesso MASTER.' }, { status: 400 })
        }

        const { error } = await admin
          .from('perfis_usuario')
          .update({
            is_master: !!dados.is_master,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', usuarioId)

        if (error) throw error

        await registrarAuditoria({
          responsavelId: masterUser.id,
          responsavelEmail: masterUser.email,
          alvoId: usuarioId,
          alvoEmail,
          acao: dados.is_master ? 'CONCEDER_MASTER' : 'REVOGAR_MASTER',
          detalhes: { novoStatusMaster: !!dados.is_master },
        })

        return NextResponse.json({ sucesso: true, mensagem: 'Status MASTER atualizado com sucesso!' })
      }

      default:
        return NextResponse.json({ error: `Ação "${acao}" não reconhecida.` }, { status: 400 })
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Erro ao processar ação: ' + err.message },
      { status: 500 }
    )
  }
}
