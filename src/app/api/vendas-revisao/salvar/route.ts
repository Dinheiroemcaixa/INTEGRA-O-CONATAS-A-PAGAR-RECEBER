import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 30
export const dynamic = 'force-dynamic'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * Salva OS/Pedidos do Datacar na tabela vendas_revisao para revisão antes de enviar ao CA.
 * Usa upsert para não duplicar OS já pendentes.
 */
export async function POST(req: NextRequest) {
  try {
    const { empresa_id, vendas } = await req.json()

    if (!empresa_id || !Array.isArray(vendas) || vendas.length === 0) {
      return NextResponse.json({ error: 'empresa_id e vendas são obrigatórios' }, { status: 400 })
    }

    const itens = vendas.map((v: any) => ({
      empresa_id,
      os_numero: v.os_numero || null,
      cliente: v.cliente,
      cliente_cpf_cnpj: v._datacar?.cliente_cpf_cnpj || null,
      valor_total: v.valor_total,
      data_venda: v.data_venda ? v.data_venda.split('T')[0] : null,
      forma_pagamento: v.forma_pagamento || null,
      itens: v.itens || [],
      erros: v.erros || [],
      vendedor: v._datacar?.vendedor || null,
      veiculo: v._datacar?.veiculo || null,
      status: 'pendente',
      datacar_raw: v._datacar || null,
    }))

    // Upsert: se a OS já está pendente/aprovada, atualiza os dados; senão insere
    const { data, error } = await supabaseAdmin
      .from('vendas_revisao')
      .upsert(itens, {
        onConflict: 'empresa_id,os_numero',
        ignoreDuplicates: false,
      })
      .select('id, os_numero, status')

    if (error) {
      console.error('[salvar-revisao] Erro no upsert:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      salvos: data?.length ?? 0,
      message: `${data?.length ?? 0} OS salvas para revisão.`,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
