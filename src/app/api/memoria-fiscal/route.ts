import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * Salva/atualiza a Memória Fiscal dos produtos de uma venda.
 * Recebe um array de itens com seus dados fiscais e persiste no banco.
 * Usa UPSERT: se o produto (empresa_id + codigo) já existe, atualiza. Se não, cria.
 */
export async function POST(req: NextRequest) {
  try {
    const { empresa_id, itens } = await req.json()

    if (!empresa_id || !itens || !Array.isArray(itens)) {
      return NextResponse.json({ error: 'empresa_id e itens são obrigatórios' }, { status: 400 })
    }

    let salvos = 0
    let erros = 0

    for (const item of itens) {
      const codigo = String(item.codigo || '').trim()
      if (!codigo) continue

      // Só salva se tem pelo menos um dado fiscal preenchido
      const temDadoFiscal = item.ncm || item.cest || item.tipo_produto || item.origem || item.unidade_medida
      if (!temDadoFiscal) continue

      const { error } = await supabaseAdmin
        .from('memoria_fiscal')
        .upsert({
          empresa_id,
          codigo,
          descricao: item.descricao || null,
          ncm: item.ncm || null,
          cest: item.cest || null,
          tipo_produto: item.tipo_produto || null,
          origem: item.origem || null,
          unidade_medida: item.unidade_medida || null,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'empresa_id,codigo'
        })

      if (error) {
        console.error(`[memoria-fiscal] Erro ao salvar ${codigo}:`, error)
        erros++
      } else {
        salvos++
      }
    }

    return NextResponse.json({ salvos, erros })
  } catch (err: unknown) {
    console.error('[memoria-fiscal] Erro:', err)
    const msg = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * Busca a Memória Fiscal para uma lista de códigos de produtos.
 * Retorna um mapa de código -> dados fiscais.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const empresa_id = searchParams.get('empresa_id')
    const codigos = searchParams.get('codigos') // Códigos separados por vírgula

    if (!empresa_id) {
      return NextResponse.json({ error: 'empresa_id é obrigatório' }, { status: 400 })
    }

    let query = supabaseAdmin
      .from('memoria_fiscal')
      .select('codigo, descricao, ncm, cest, tipo_produto, origem, unidade_medida')
      .eq('empresa_id', empresa_id)

    if (codigos) {
      const lista = codigos.split(',').map(c => c.trim()).filter(Boolean)
      query = query.in('codigo', lista)
    }

    const { data, error } = await query

    if (error) {
      console.error('[memoria-fiscal] Erro na busca:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Retorna como mapa para fácil lookup
    const mapa: Record<string, any> = {}
    for (const item of (data || [])) {
      mapa[item.codigo] = item
    }

    return NextResponse.json({ memoria: mapa })
  } catch (err: unknown) {
    console.error('[memoria-fiscal] Erro:', err)
    const msg = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
