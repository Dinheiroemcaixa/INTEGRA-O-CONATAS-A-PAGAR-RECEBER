import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * GET: Lista as regras cadastradas da empresa
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const empresa_id = searchParams.get('empresa_id')
    const apenasAtivas = searchParams.get('apenas_ativas') !== 'false'

    if (!empresa_id) {
      return NextResponse.json({ error: 'empresa_id é obrigatório' }, { status: 400 })
    }

    let query = supabaseAdmin
      .from('fornecedor_regras')
      .select('*')
      .eq('empresa_id', empresa_id)

    if (apenasAtivas) {
      query = query.eq('ativo', true)
    }

    query = query.order('prioridade', { ascending: false }).order('created_at', { ascending: false })

    const { data: regras, error } = await query

    if (error) {
      return NextResponse.json({ success: true, regras: [], total: 0 })
    }

    return NextResponse.json({ success: true, regras: regras || [], total: regras?.length || 0 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erro ao listar regras' }, { status: 500 })
  }
}

/**
 * POST: Cria regra unitária ou aprova fornecedores em lote (Aprovação em Massa)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // 1. Caso LOTE (Aprovação em Massa)
    if (body.regras && Array.isArray(body.regras)) {
      const listaRegras = body.regras
      if (listaRegras.length === 0) {
        return NextResponse.json({ error: 'Array de regras vazio' }, { status: 400 })
      }

      const empresa_id = listaRegras[0].empresa_id
      if (!empresa_id) {
        return NextResponse.json({ error: 'empresa_id é obrigatório nas regras' }, { status: 400 })
      }

      const novosRegistros = listaRegras.map((r: any) => ({
        empresa_id,
        fornecedor_id_conta_azul: r.fornecedor_id_conta_azul || null,
        fornecedor_nome: r.fornecedor_nome.trim(),
        categoria_nome: r.categoria_nome.trim(),
        tipo_regra: r.tipo_regra || 'PADRAO',
        valor_regra: r.valor_regra ? String(r.valor_regra).trim() : null,
        prioridade: Number(r.prioridade) || 10,
        ativo: true,
        observacao: r.observacao || 'Homologação em lote',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }))

      // Desativar regras PADRAO anteriores desses mesmos fornecedores
      const nomes = novosRegistros.map((r: any) => r.fornecedor_nome)
      await supabaseAdmin
        .from('fornecedor_regras')
        .update({ ativo: false, updated_at: new Date().toISOString() })
        .eq('empresa_id', empresa_id)
        .eq('tipo_regra', 'PADRAO')
        .in('fornecedor_nome', nomes)

      const { data, error } = await supabaseAdmin
        .from('fornecedor_regras')
        .insert(novosRegistros)
        .select()

      if (error) {
        throw new Error(`Falha na inserção em lote: ${error.message}`)
      }

      return NextResponse.json({ success: true, total: data?.length || 0, regras: data })
    }

    // 2. Caso UNITÁRIO
    const {
      empresa_id,
      fornecedor_id_conta_azul,
      fornecedor_nome,
      categoria_nome,
      tipo_regra = 'PADRAO',
      valor_regra = null,
      prioridade = 10,
      observacao = null
    } = body

    if (!empresa_id || !fornecedor_nome || !categoria_nome) {
      return NextResponse.json(
        { error: 'Campos obrigatórios ausentes: empresa_id, fornecedor_nome e categoria_nome' },
        { status: 400 }
      )
    }

    if (tipo_regra === 'PADRAO') {
      let queryDesativar = supabaseAdmin
        .from('fornecedor_regras')
        .update({ ativo: false, updated_at: new Date().toISOString() })
        .eq('empresa_id', empresa_id)
        .eq('tipo_regra', 'PADRAO')

      if (fornecedor_id_conta_azul) {
        queryDesativar = queryDesativar.eq('fornecedor_id_conta_azul', fornecedor_id_conta_azul)
      } else {
        queryDesativar = queryDesativar.ilike('fornecedor_nome', fornecedor_nome.trim())
      }
      await queryDesativar
    }

    const novaRegra = {
      empresa_id,
      fornecedor_id_conta_azul: fornecedor_id_conta_azul || null,
      fornecedor_nome: fornecedor_nome.trim(),
      categoria_nome: categoria_nome.trim(),
      tipo_regra,
      valor_regra: valor_regra ? String(valor_regra).trim() : null,
      prioridade: Number(prioridade) || 10,
      ativo: true,
      observacao: observacao || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    const { data, error } = await supabaseAdmin
      .from('fornecedor_regras')
      .insert(novaRegra)
      .select()
      .single()

    if (error) {
      throw new Error(`Falha ao salvar regra contábil: ${error.message}`)
    }

    return NextResponse.json({ success: true, regra: data })
  } catch (err: any) {
    console.error('Erro na criação de regra de fornecedor:', err)
    return NextResponse.json(
      { error: err.message || 'Erro interno ao salvar regra' },
      { status: 500 }
    )
  }
}

/**
 * PUT: Edita uma regra existente (altera categoria, prioridade ou ativa/desativa)
 */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, categoria_nome, prioridade, tipo_regra, valor_regra, ativo } = body

    if (!id) {
      return NextResponse.json({ error: 'id da regra é obrigatório' }, { status: 400 })
    }

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString()
    }

    if (categoria_nome !== undefined) updates.categoria_nome = categoria_nome.trim()
    if (prioridade !== undefined) updates.prioridade = Number(prioridade)
    if (tipo_regra !== undefined) updates.tipo_regra = tipo_regra
    if (valor_regra !== undefined) updates.valor_regra = valor_regra ? String(valor_regra).trim() : null
    if (ativo !== undefined) updates.ativo = Boolean(ativo)

    const { data, error } = await supabaseAdmin
      .from('fornecedor_regras')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      throw new Error(`Erro ao atualizar regra: ${error.message}`)
    }

    return NextResponse.json({ success: true, regra: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erro ao atualizar regra' }, { status: 500 })
  }
}

/**
 * DELETE: Remove uma regra
 */
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'id da regra é obrigatório' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('fornecedor_regras')
      .delete()
      .eq('id', id)

    if (error) {
      throw new Error(`Erro ao excluir regra: ${error.message}`)
    }

    return NextResponse.json({ success: true, message: 'Regra excluída com sucesso' })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erro ao excluir regra' }, { status: 500 })
  }
}
