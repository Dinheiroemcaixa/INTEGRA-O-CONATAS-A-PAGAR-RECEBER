import { NextRequest, NextResponse } from 'next/server'
import { listarCategorias } from '@/lib/conta-azul/api'
import { getValidToken, TokenError } from '@/lib/conta-azul/token-manager'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const empresa_id = searchParams.get('empresa_id')

  if (!empresa_id) {
    return NextResponse.json({ categorias: [] })
  }

  try {
    const result = await getValidToken(empresa_id)
    try {
      const categorias = await listarCategorias(result.accessToken)
      return NextResponse.json({ categorias, connected: true, status_conexao: 'CONECTADA', reconectar: false })
    } catch (firstErr: any) {
      if (firstErr?.message === 'TOKEN_EXPIRADO' || /401|unauthorized|token_expirado/i.test(firstErr?.message || '')) {
        const refreshed = await getValidToken(empresa_id, 'financeiro', true)
        const categorias = await listarCategorias(refreshed.accessToken)
        return NextResponse.json({ categorias, connected: true, status_conexao: 'CONECTADA', reconectar: false })
      }
      throw firstErr
    }
  } catch (err: any) {
    console.warn(`[categorias-api] Falha para empresa ${empresa_id}:`, err?.message || err)
    if (err instanceof TokenError && err.statusCode === 401) {
      return NextResponse.json({
        categorias: [],
        connected: false,
        status_conexao: 'DESCONECTADA',
        reconectar: true,
        aviso: err.message,
      })
    }
    return NextResponse.json({
      categorias: [],
      connected: true,
      status_conexao: 'ATENCAO',
      reconectar: false,
      aviso: err?.message || 'Falha temporária ao carregar categorias do Conta Azul',
    })
  }
}
