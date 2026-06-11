import { NextRequest, NextResponse } from 'next/server'

/**
 * Rota de autorização do Conta Azul — PASSO 1 de 2.
 * 
 * Fluxo completo:
 * 1. ESTA rota → redireciona para auth.contaazul.com/logout (limpa sessão Cognito)
 * 2. Cognito limpa cookies → redireciona para /api/conta-azul/autorizar/redirect
 * 3. A rota redirect → redireciona para auth.contaazul.com/oauth2/authorize (tela de login limpa)
 * 
 * Isso resolve o bug de "auto-login" onde o Cognito reaproveitava a sessão
 * da empresa anterior ao conectar uma nova empresa.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const empresaId = searchParams.get('empresa_id')

  if (!empresaId) {
    return NextResponse.json({ error: 'empresa_id obrigatório' }, { status: 400 })
  }

  const clientId = process.env.CONTA_AZUL_CLIENT_ID
  const redirectUri = process.env.CONTA_AZUL_REDIRECT_URI

  if (!clientId || !redirectUri) {
    return NextResponse.json({
      error: 'Integração com Conta Azul não configurada. Configure CONTA_AZUL_CLIENT_ID e CONTA_AZUL_REDIRECT_URI no ambiente.'
    }, { status: 500 })
  }

  // Construir a URL da rota redirect (passo 2) usando o origin da própria requisição
  // Isso funciona tanto em localhost quanto em qualquer domínio Vercel
  const origin = new URL(req.url).origin
  const redirectAfterLogout = `${origin}/api/conta-azul/autorizar/redirect?empresa_id=${empresaId}`

  // Passo 1: Redirecionar para o logout do Cognito
  // Quando o logout terminar, o Cognito redireciona para logout_uri (nossa rota redirect)
  const logoutUrl = `https://auth.contaazul.com/logout?client_id=${clientId}&logout_uri=${encodeURIComponent(redirectAfterLogout)}`

  return NextResponse.redirect(logoutUrl)
}
