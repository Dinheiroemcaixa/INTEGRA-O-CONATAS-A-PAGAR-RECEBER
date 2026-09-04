import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// ─── GET: Retornar XML / ZIP oficial da NF-e por Chave de Acesso ───────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const empresa_id = searchParams.get('empresa_id')
    const chaveRaw = searchParams.get('chave') || searchParams.get('chave_acesso')

    if (!empresa_id || !chaveRaw) {
      return NextResponse.json({ error: 'empresa_id e chave sao obrigatorios' }, { status: 400 })
    }

    const chave = chaveRaw.replace(/\D/g, '')

    if (chave.length !== 44) {
      return NextResponse.json({ 
        error: 'Chave de acesso invalida. A chave deve conter 44 digitos numericos.' 
      }, { status: 400 })
    }

    const { getValidToken } = await import('@/lib/conta-azul/token-manager')

    let accessToken: string
    try {
      const tokenRes = await getValidToken(empresa_id, 'vendas')
      accessToken = tokenRes.accessToken
    } catch {
      const tokenRes = await getValidToken(empresa_id, 'financeiro')
      accessToken = tokenRes.accessToken
    }

    const CA_BASE = 'https://api-v2.contaazul.com/v1'
    const url = CA_BASE + '/notas-fiscais/' + chave

    console.log('[notas-emitidas/xml] Baixando XML/ZIP oficial da chave:', chave)

    const resCa = await fetch(url, {
      headers: { 'Authorization': 'Bearer ' + accessToken }
    })

    if (!resCa.ok) {
      const errTxt = await resCa.text().catch(() => '')
      console.error('[notas-emitidas/xml] Erro CA na chave ' + chave + ':', resCa.status, errTxt)
      return NextResponse.json({ 
        error: 'Conta Azul (' + resCa.status + '): ' + (errTxt || 'Nota fiscal nao encontrada para esta chave.') 
      }, { status: resCa.status })
    }

    const contentType = resCa.headers.get('content-type') || 'application/xml'
    const isZip = contentType.includes('zip') || contentType.includes('octet-stream')
    const filename = 'NFe_' + chave + '.' + (isZip ? 'zip' : 'xml')

    const arrayBuffer = await resCa.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': 'attachment; filename="' + filename + '"',
        'Cache-Control': 'public, max-age=86400'
      }
    })
  } catch (err: any) {
    console.error('[notas-emitidas/xml] Erro fatal:', err)
    return NextResponse.json({ error: err.message || 'Erro interno ao consultar XML' }, { status: 500 })
  }
}
