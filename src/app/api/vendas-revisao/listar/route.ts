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
 * Lista OS da tabela vendas_revisao para uma empresa.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const empresa_id = searchParams.get('empresa_id')
    const status = searchParams.get('status') // opcional: filtrar por status

    if (!empresa_id) {
      return NextResponse.json({ error: 'empresa_id é obrigatório' }, { status: 400 })
    }

    let query = supabaseAdmin
      .from('vendas_revisao')
      .select('*')
      .eq('empresa_id', empresa_id)
      .order('created_at', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    } else {
      // Por padrão, mostra pendentes e aprovadas
      query = query.in('status', ['pendente', 'aprovado', 'erro'])
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ vendas: data ?? [] })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * Atualiza o status de uma OS na revisão (ex: ignorar, aprovar).
 */
export async function PATCH(req: NextRequest) {
  try {
    const { id, status, empresa_id } = await req.json()

    if (!id || !status || !empresa_id) {
      return NextResponse.json({ error: 'id, status e empresa_id são obrigatórios' }, { status: 400 })
    }

    const statusValidos = ['pendente', 'aprovado', 'ignorado']
    if (!statusValidos.includes(status)) {
      return NextResponse.json({ error: `Status inválido. Use: ${statusValidos.join(', ')}` }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('vendas_revisao')
      .update({ status })
      .eq('id', id)
      .eq('empresa_id', empresa_id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
