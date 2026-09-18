import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getValidToken, TokenError } from '@/lib/conta-azul/token-manager'
import { buscarContasPagarPorPeriodo } from '@/lib/conta-azul/api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/** Consulta o status da tabela espelho para a empresa */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const empresa_id = searchParams.get('empresa_id')

    if (!empresa_id) {
      return NextResponse.json({ error: 'empresa_id é obrigatório' }, { status: 400 })
    }

    const { count, error: errCount } = await supabaseAdmin
      .from('contas_pagar_contaazul_espelho')
      .select('*', { count: 'exact', head: true })
      .eq('empresa_id', empresa_id)

    if (errCount) {
      // Se a tabela ainda não existir no schema local, retorna 0 com segurança
      return NextResponse.json({
        total_espelhados: 0,
        ultima_sincronizacao: null
      })
    }

    const { data: ultimoReg } = await supabaseAdmin
      .from('contas_pagar_contaazul_espelho')
      .select('sincronizado_em')
      .eq('empresa_id', empresa_id)
      .order('sincronizado_em', { ascending: false })
      .limit(1)
      .maybeSingle()

    return NextResponse.json({
      success: true,
      total_espelhados: count || 0,
      ultima_sincronizacao: ultimoReg?.sincronizado_em || null
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

/** Dispara a sincronização paginada e idempotente dos lançamentos do Conta Azul */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { empresa_id, meses = 12 } = body

    if (!empresa_id) {
      return NextResponse.json({ error: 'empresa_id é obrigatório' }, { status: 400 })
    }

    // 1. Obter token válido via token-manager
    let accessToken: string
    try {
      const result = await getValidToken(empresa_id)
      accessToken = result.accessToken
    } catch (e: any) {
      if (e instanceof TokenError) {
        return NextResponse.json({ error: e.message }, { status: e.statusCode })
      }
      throw e
    }

    // 2. Determinar intervalo de datas
    const hoje = new Date()
    const dataInicio = new Date()
    dataInicio.setMonth(hoje.getMonth() - Number(meses))
    const dtIni = dataInicio.toISOString().split('T')[0]

    // Incluir margem futura de 60 dias para cobrir contas a pagar agendadas
    const dataFim = new Date()
    dataFim.setDate(hoje.getDate() + 60)
    const dtFim = dataFim.toISOString().split('T')[0]

    // 3. Buscar lançamentos via API v2 do Conta Azul
    const contasCa = await buscarContasPagarPorPeriodo(accessToken, dtIni, dtFim)

    if (contasCa.length === 0) {
      return NextResponse.json({
        success: true,
        total_sincronizados: 0,
        mensagem: 'Nenhum lançamento encontrado no Conta Azul para o período especificado.'
      })
    }

    // 4. Mapear para o formato da tabela espelho
    const registros = contasCa.map((c) => ({
      empresa_id,
      conta_azul_id: c.id,
      fornecedor_id: c.fornecedor_id || null,
      fornecedor_nome: c.fornecedor_nome || c.descricao || 'FORNECEDOR NÃO INFORMADO',
      fornecedor_cnpj_cpf: c.fornecedor_cnpj_cpf || null,
      valor: Number(c.valor || 0),
      data_vencimento: c.data_vencimento,
      data_competencia: c.data_competencia || null,
      data_pagamento: c.data_pagamento || null,
      status: (c.status || 'PENDENTE').toUpperCase(),
      numero_documento: c.numero_documento || null,
      descricao: c.descricao || null,
      categoria_id: c.categoria_id || null,
      categoria_nome: c.categoria_nome || null,
      centro_custo_nome: c.centro_custo_nome || null,
      raw_data: c.raw_data || null,
      sincronizado_em: new Date().toISOString()
    }))

    // 5. Batch Upsert atômico e idempotente no Supabase (blocos de 100)
    let totalGravados = 0
    for (let i = 0; i < registros.length; i += 100) {
      const lote = registros.slice(i, i + 100)
      const { error: errUpsert } = await supabaseAdmin
        .from('contas_pagar_contaazul_espelho')
        .upsert(lote, { onConflict: 'empresa_id,conta_azul_id' })

      if (errUpsert) {
        console.error('Erro no batch upsert da tabela espelho:', errUpsert)
        throw new Error(`Falha ao persistir lançamentos na tabela espelho: ${errUpsert.message}`)
      }
      totalGravados += lote.length
    }

    return NextResponse.json({
      success: true,
      total_sincronizados: totalGravados,
      periodo: { dtIni, dtFim },
      timestamp: new Date().toISOString()
    })
  } catch (err: any) {
    console.error('Erro na sincronização do Conta Azul:', err)
    return NextResponse.json(
      { error: err.message || 'Erro interno ao sincronizar contas a pagar do Conta Azul' },
      { status: 500 }
    )
  }
}
