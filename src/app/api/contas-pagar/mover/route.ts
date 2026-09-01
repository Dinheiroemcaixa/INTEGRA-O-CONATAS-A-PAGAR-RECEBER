import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { ids, empresa_origem_id, empresa_destino_id } = await req.json()

    if (!empresa_destino_id) {
      return NextResponse.json({ error: 'empresa_destino_id é obrigatório' }, { status: 400 })
    }

    // 1. Buscar a empresa de destino
    const { data: destino, error: errDestino } = await supabaseAdmin
      .from('empresas')
      .select('id, nome')
      .eq('id', empresa_destino_id)
      .single()

    if (errDestino || !destino) {
      return NextResponse.json({ error: 'Empresa de destino não encontrada' }, { status: 404 })
    }

    // 2. Buscar contas de origem para mover
    let queryOrigem = supabaseAdmin
      .from('contas_pagar_importadas')
      .select('*')

    if (ids && Array.isArray(ids) && ids.length > 0) {
      queryOrigem = queryOrigem.in('id', ids)
    } else if (empresa_origem_id) {
      queryOrigem = queryOrigem.eq('empresa_id', empresa_origem_id).eq('status', 'pendente')
    } else {
      return NextResponse.json({ error: 'Informe ids ou empresa_origem_id' }, { status: 400 })
    }

    const { data: contasOrigem, error: errOrigem } = await queryOrigem
    if (errOrigem) throw errOrigem

    if (!contasOrigem || contasOrigem.length === 0) {
      return NextResponse.json({ message: 'Nenhuma conta encontrada para mover', movidas: 0 })
    }

    let movidasCount = 0

    // 3. Processar cada conta individualmente para prevenir erro de constraint 23505 (duplicidade)
    for (const c of contasOrigem) {
      // Verificar se já existe uma conta idêntica na empresa destino
      let queryExistente = supabaseAdmin
        .from('contas_pagar_importadas')
        .select('id')
        .eq('empresa_id', empresa_destino_id)
        .eq('fornecedor', c.fornecedor)
        .eq('valor', c.valor)

      if (c.vencimento) queryExistente = queryExistente.eq('vencimento', c.vencimento)
      if (c.doc) queryExistente = queryExistente.eq('doc', c.doc)

      const { data: existentes } = await queryExistente

      if (existentes && existentes.length > 0) {
        // Já existe registro correspondente no destino:
        // Mantém a do destino como pendente e exclui a duplicata da origem
        await supabaseAdmin
          .from('contas_pagar_importadas')
          .update({
            categoria: c.categoria || 'Materiais para Revenda',
            status: 'pendente',
            descricao: c.descricao || null,
          })
          .eq('id', existentes[0].id)

        await supabaseAdmin
          .from('contas_pagar_importadas')
          .delete()
          .eq('id', c.id)
      } else {
        // Não existe no destino: atualiza com segurança o empresa_id
        await supabaseAdmin
          .from('contas_pagar_importadas')
          .update({
            empresa_id: empresa_destino_id,
            status: 'pendente',
          })
          .eq('id', c.id)
      }

      movidasCount++
    }

    return NextResponse.json({
      success: true,
      movidas: movidasCount,
      destino_nome: destino.nome,
      message: `${movidasCount} lançamento(s) transferido(s) para ${destino.nome} com sucesso!`
    })
  } catch (error: any) {
    console.error('[contas-pagar/mover] Erro:', error)
    return NextResponse.json({ error: error.message || 'Erro ao mover contas' }, { status: 500 })
  }
}
