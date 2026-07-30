import { NextRequest, NextResponse } from 'next/server'
import { getValidToken, TokenError } from '@/lib/conta-azul/token-manager'
import { buscarContasPagarPorPeriodo } from '@/lib/conta-azul/api'
import { normalizarNome } from '@/lib/parsers/fornecedores-contaazul'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { empresa_id, dtIni, dtFim } = body

    if (!empresa_id || !dtIni || !dtFim) {
      return NextResponse.json({ error: 'empresa_id, dtIni e dtFim são obrigatórios' }, { status: 400 })
    }

    // Obter token válido
    let accessToken: string
    try {
      const result = await getValidToken(empresa_id)
      accessToken = result.accessToken
    } catch (e) {
      if (e instanceof TokenError) {
        return NextResponse.json({ error: e.message }, { status: e.statusCode })
      }
      throw e
    }

    // Calcular data com tolerância de 3 dias para a busca no CA
    const dataInicial = new Date(dtIni)
    dataInicial.setDate(dataInicial.getDate() - 3)
    const dtIniCa = dataInicial.toISOString().split('T')[0]

    const dataFinal = new Date(dtFim)
    dataFinal.setDate(dataFinal.getDate() + 3)
    const dtFimCa = dataFinal.toISOString().split('T')[0]

    // Buscar as contas no Conta Azul
    const contasCa = await buscarContasPagarPorPeriodo(accessToken, dtIniCa, dtFimCa)

    // Opcional: Enriquecer com nomes de fornecedores (neste momento a API já tenta trazer `fornecedor_id` ou nome se tiver)
    // Se a API v2 não retorna o nome do contato diretamente no resumo, a busca de duplicidade vai se basear só em valor e data,
    // Mas a API V2 costuma retornar as propriedades expandidas dependendo de como é chamada.
    // Vamos garantir que devolvemos os dados pro frontend tratar
    return NextResponse.json({ success: true, contasCa })
  } catch (err: any) {
    console.error('Erro verificar duplicidades Conta Azul:', err)
    return NextResponse.json({ error: err.message || 'Erro ao verificar duplicidades' }, { status: 500 })
  }
}
