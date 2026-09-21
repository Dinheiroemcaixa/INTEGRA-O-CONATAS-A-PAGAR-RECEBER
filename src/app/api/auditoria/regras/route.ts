import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * GET: Lista as regras ativas de governança contábil da empresa
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const empresa_id = searchParams.get('empresa_id')

    if (!empresa_id) {
      return NextResponse.json({ error: 'empresa_id é obrigatório' }, { status: 400 })
    }

    const { data: regras, error } = await supabaseAdmin
      .from('fornecedor_regras')
      .select('*')
      .eq('empresa_id', empresa_id)
      .eq('ativo', true)
      .order('prioridade', { ascending: false })

    if (error) {
      // Se a tabela ainda não tiver sido criada no Supabase pelo usuário, retorna array vazio graciosamente
      return NextResponse.json({ success: true, regras: [], total: 0 })
    }

    return NextResponse.json({ success: true, regras: regras || [], total: regras?.length || 0 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erro ao listar regras' }, { status: 500 })
  }
}

/**
 * POST: Cria ou atualiza uma regra contábil validada pelo usuário
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
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
        { error: 'Campos obrigatórios ausentes: empresa_id, fornecedor_nome e categoria_nome são obrigatórios' },
        { status: 400 }
      )
    }

    // Se for regra PADRAO, desativa regras anteriores do mesmo fornecedor para evitar duplicatas conflitantes
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
 * DELETE: Desativa ou remove uma regra de governança
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
      .update({ ativo: false, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      throw new Error(`Erro ao desativar regra: ${error.message}`)
    }

    return NextResponse.json({ success: true, message: 'Regra desativada com sucesso' })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erro ao excluir regra' }, { status: 500 })
  }
}
