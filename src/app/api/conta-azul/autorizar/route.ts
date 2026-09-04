import { NextRequest, NextResponse } from 'next/server'
import { getUrlAutorizacao } from '@/lib/conta-azul/api'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const empresaId = searchParams.get('empresa_id')
  const modulo = searchParams.get('modulo') || 'financeiro'
  const direto = searchParams.get('direto') === 'true'

  if (!empresaId) {
    return NextResponse.json({ error: 'empresa_id obrigatorio' }, { status: 400 })
  }

  if (!direto) {
    const origin = req.nextUrl.origin
    return NextResponse.redirect(origin + '/conectar?empresa_id=' + empresaId + '&modulo=' + modulo)
  }

  const clientId = process.env.CONTA_AZUL_CLIENT_ID
  const redirectUri = process.env.CONTA_AZUL_REDIRECT_URI

  if (!clientId || !redirectUri) {
    return NextResponse.json({
      error: 'Integracao com Conta Azul nao configurada. Configure CONTA_AZUL_CLIENT_ID e CONTA_AZUL_REDIRECT_URI no ambiente.'
    }, { status: 500 })
  }

  const statePayload = empresaId + ':' + modulo
  const url = getUrlAutorizacao(clientId, redirectUri, statePayload)
  return NextResponse.redirect(url)
}
