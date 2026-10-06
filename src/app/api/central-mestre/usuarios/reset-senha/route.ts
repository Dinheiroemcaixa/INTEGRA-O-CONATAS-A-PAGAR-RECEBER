import { NextRequest, NextResponse } from 'next/server'
import { validarSessaoMaster, registrarAuditoria } from '@/lib/auth/validar-master'
import { createAdminClient } from '@/lib/supabase/admin'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

function gerarSenhaTemporaria(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const simbolos = '@#$!'
  let senha = ''
  // 8 letras e numeros
  for (let i = 0; i < 8; i++) {
    senha += chars.charAt(crypto.randomInt(0, chars.length))
  }
  // 2 simbolos
  for (let i = 0; i < 2; i++) {
    senha += simbolos.charAt(crypto.randomInt(0, simbolos.length))
  }
  // 2 numeros extras
  senha += crypto.randomInt(10, 99)
  return 'Con#' + senha
}

export async function POST(req: NextRequest) {
  const check = await validarSessaoMaster(req)
  if (!check.autorizado) return check.responseError!

  const admin = createAdminClient()
  const masterUser = check.user!

  try {
    const { usuarioId, tipo } = await req.json()

    if (!usuarioId || !tipo) {
      return NextResponse.json(
        { error: 'Parâmetros "usuarioId" e "tipo" (TEMPORARIA | LINK) são obrigatórios.' },
        { status: 400 }
      )
    }

    const { data: usuarioAuth, error: authError } = await admin.auth.admin.getUserById(usuarioId)
    if (authError || !usuarioAuth.user) {
      return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 })
    }

    const alvoEmail = usuarioAuth.user.email || 'sem-email'

    if (tipo === 'TEMPORARIA') {
      const senhaTemporaria = gerarSenhaTemporaria()

      // Atualiza a senha no Supabase Auth
      const { error: updateError } = await admin.auth.admin.updateUserById(usuarioId, {
        password: senhaTemporaria,
      })

      if (updateError) {
        return NextResponse.json({ error: 'Erro ao redefinir senha: ' + updateError.message }, { status: 500 })
      }

      // Marca para forçar troca de senha no próximo login
      await admin
        .from('perfis_usuario')
        .update({
          forcar_troca_senha: true,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', usuarioId)

      await registrarAuditoria({
        responsavelId: masterUser.id,
        responsavelEmail: masterUser.email,
        alvoId: usuarioId,
        alvoEmail,
        acao: 'RESET_SENHA_TEMPORARIA',
        detalhes: { metodo: 'senha_provisoria_gerada' },
      })

      return NextResponse.json({
        sucesso: true,
        tipo: 'TEMPORARIA',
        senhaTemporaria,
        mensagem: 'Senha temporária gerada com sucesso. O usuário deverá alterá-la no próximo acesso.',
      })
    }

    if (tipo === 'LINK') {
      // Gerar link de recuperação oficial
      const origin = req.nextUrl.origin || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
        type: 'recovery',
        email: alvoEmail,
        options: {
          redirectTo: `${origin}/dashboard`,
        },
      })

      if (linkError) {
        return NextResponse.json({ error: 'Erro ao gerar link de recuperação: ' + linkError.message }, { status: 500 })
      }

      await registrarAuditoria({
        responsavelId: masterUser.id,
        responsavelEmail: masterUser.email,
        alvoId: usuarioId,
        alvoEmail,
        acao: 'GERAR_LINK_RESET_SENHA',
        detalhes: { metodo: 'link_recuperacao' },
      })

      return NextResponse.json({
        sucesso: true,
        tipo: 'LINK',
        linkRecuperacao: linkData.properties?.action_link || null,
        mensagem: 'Link de redefinição de senha gerado com sucesso.',
      })
    }

    return NextResponse.json({ error: 'Tipo inválido. Escolha "TEMPORARIA" ou "LINK".' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: 'Erro ao resetar senha: ' + err.message }, { status: 500 })
  }
}
