import { NextRequest, NextResponse } from 'next/server'
import { listarContasFinanceiras } from '@/lib/conta-azul/api'
import { getValidToken } from '@/lib/conta-azul/token-manager'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const empresa_id = searchParams.get('empresa_id')

  if (!empresa_id) {
    return NextResponse.json({ contas: [] })
  }

  try {
    const result = await getValidToken(empresa_id)
    const contas = await listarContasFinanceiras(result.accessToken)
    return NextResponse.json({ contas })
  } catch (err: any) {
    console.warn(`[contas-financeiras] Empresa ${empresa_id} não possui token ativo:`, err?.message || err)
    return NextResponse.json({ contas: [], aviso: 'Empresa sem conexão direta ao Conta Azul' })
  }
}
