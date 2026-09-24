import { NextRequest, NextResponse } from 'next/server'
import { buscarHistoricoDivergencia } from '@/lib/auditoria-categorias/servico'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const empresa_id = searchParams.get('empresa_id')
    const conta_azul_id = searchParams.get('conta_azul_id')

    if (!empresa_id || !conta_azul_id) {
      return NextResponse.json(
        { error: 'Os parâmetros empresa_id e conta_azul_id são obrigatórios.' },
        { status: 400 }
      )
    }

    const historico = await buscarHistoricoDivergencia({
      empresaId: empresa_id.trim(),
      contaAzulId: conta_azul_id.trim()
    })

    return NextResponse.json({ historico })
  } catch (error: any) {
    console.error('[API /api/auditoria-categorias/historico] Erro:', error)
    return NextResponse.json(
      { error: error?.message || 'Erro ao buscar histórico de auditoria.' },
      { status: 500 }
    )
  }
}
