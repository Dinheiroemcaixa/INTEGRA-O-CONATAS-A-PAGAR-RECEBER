import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTokenComCodigo } from '@/lib/conta-azul/api'

export const runtime = 'nodejs'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state') // empresa_id
  const error = searchParams.get('error')

  // Usar a URL da própria requisição como base (funciona em qualquer domínio Vercel)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || origin

  if (error) {
    return NextResponse.redirect(`${appUrl}/empresas?erro=autorizacao_negada`)
  }

  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/empresas?erro=parametros_invalidos`)
  }

  try {
    const tokens = await getTokenComCodigo(
      code,
      process.env.CONTA_AZUL_REDIRECT_URI!,
      process.env.CONTA_AZUL_CLIENT_ID!,
      process.env.CONTA_AZUL_CLIENT_SECRET!
    )

    const expiracao = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    await supabaseAdmin
      .from('empresas')
      .update({
        access_token_conta_azul: tokens.access_token,
        refresh_token_conta_azul: tokens.refresh_token,
        data_expiracao_token: expiracao,
      })
      .eq('id', state)

    await supabaseAdmin.from('logs_integracao').insert({
      empresa_id: state,
      acao: 'conectar_conta_azul',
      status: 'sucesso',
      detalhes: { expiracao },
    })

    return NextResponse.redirect(`${appUrl}/empresas?sucesso=conta_azul_conectado`)
  } catch (err) {
    console.error('[conta-azul/callback]', err)
    const msg = err instanceof Error ? err.message : 'erro_desconhecido'
    return NextResponse.redirect(`${appUrl}/empresas?erro=${encodeURIComponent(msg)}`)
  }
}
