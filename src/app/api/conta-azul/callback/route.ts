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

  const renderHtml = (titulo: string, mensagem: string, isError = false) => {
    const cor = isError ? '#ef4444' : '#10b981' // red-500 ou emerald-500
    return new NextResponse(
      `<!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>${titulo}</title>
          <style>
            body { margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; font-family: system-ui, -apple-system, sans-serif; background-color: #09090b; color: #fafafa; }
            .card { background: #18181b; padding: 2rem 3rem; border-radius: 1rem; border: 1px solid #27272a; text-align: center; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5); max-width: 400px; width: 90%; }
            h1 { color: ${cor}; margin-top: 0; }
            p { color: #a1a1aa; line-height: 1.5; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>${titulo}</h1>
            <p>${mensagem}</p>
          </div>
        </body>
      </html>`,
      { status: isError ? 400 : 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    )
  }

  if (error) {
    return renderHtml('Autorização Negada', 'Você não concedeu permissão de acesso à Conta Azul. Pode fechar esta aba e tentar novamente se desejar.', true)
  }

  if (!code || !state) {
    return renderHtml('Parâmetros Inválidos', 'Ocorreu um erro no link de autorização. Parâmetros inválidos.', true)
  }

  try {
    const tokens = await getTokenComCodigo(
      code,
      process.env.CONTA_AZUL_REDIRECT_URI!,
      process.env.CONTA_AZUL_CLIENT_ID!,
      process.env.CONTA_AZUL_CLIENT_SECRET!
    )

    const expires_in = tokens.expires_in || 3600
    const expiracao = new Date(Date.now() + expires_in * 1000).toISOString()

    const { error: errUpdate } = await supabaseAdmin
      .from('empresas')
      .update({
        access_token_conta_azul: tokens.access_token,
        refresh_token_conta_azul: tokens.refresh_token,
        data_expiracao_token: expiracao,
        conta_azul_connected: true
      })
      .eq('id', state)
      
    if (errUpdate) throw new Error(`Falha ao salvar token: ${errUpdate.message}`)

    await supabaseAdmin.from('logs_integracao').insert({
      empresa_id: state,
      acao: 'conectar_conta_azul',
      status: 'sucesso',
      detalhes: { expiracao },
    })

    return renderHtml('Autenticado com sucesso!', 'A integração com a Conta Azul foi concluída com sucesso. Você já pode fechar esta página com segurança.')
  } catch (err) {
    console.error('[conta-azul/callback]', err)
    const msg = err instanceof Error ? err.message : 'erro_desconhecido'
    return renderHtml('Erro na Integração', 'Ocorreu um erro ao processar a autorização da Conta Azul: ' + msg, true)
  }
}
