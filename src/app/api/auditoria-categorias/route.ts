import { NextRequest, NextResponse } from 'next/server'
import { executarAuditoriaCategorias } from '@/lib/auditoria-categorias/servico'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { empresa_id, data_inicio, data_fim } = body

    if (!empresa_id) {
      return NextResponse.json(
        { error: 'Parâmetro empresa_id é obrigatório.' },
        { status: 400 }
      )
    }

    if (!data_inicio || !data_fim) {
      return NextResponse.json(
        { error: 'Os campos data_inicio e data_fim são obrigatórios (formato AAAA-MM-DD).' },
        { status: 400 }
      )
    }

    const resultado = await executarAuditoriaCategorias({
      empresaId: empresa_id,
      dataInicio: data_inicio,
      dataFim: data_fim
    })

    return NextResponse.json(resultado)
  } catch (error: any) {
    console.error('[API /api/auditoria-categorias] Erro:', error)
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao processar auditoria de categorias.' },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const empresa_id = searchParams.get('empresa_id')
    const data_inicio = searchParams.get('data_inicio')
    const data_fim = searchParams.get('data_fim')

    if (!empresa_id || !data_inicio || !data_fim) {
      return NextResponse.json(
        { error: 'Parâmetros empresa_id, data_inicio e data_fim são obrigatórios.' },
        { status: 400 }
      )
    }

    const resultado = await executarAuditoriaCategorias({
      empresaId: empresa_id,
      dataInicio: data_inicio,
      dataFim: data_fim
    })

    return NextResponse.json(resultado)
  } catch (error: any) {
    console.error('[API /api/auditoria-categorias GET] Erro:', error)
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao consultar auditoria de categorias.' },
      { status: 500 }
    )
  }
}
