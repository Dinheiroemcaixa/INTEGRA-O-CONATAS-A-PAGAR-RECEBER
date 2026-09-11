import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/** Salva regra De-Para de fornecedor (nome do Datacar → nome do Conta Azul) */
export async function POST(req: NextRequest) {
  try {
    const { empresa_id, nome_original, nome_original_normalizado, nome_corrigido, conta_azul_contato_id } = await req.json()

    if (!empresa_id || !nome_original || !nome_original_normalizado || !nome_corrigido) {
      return NextResponse.json({ error: 'Campos obrigatórios: empresa_id, nome_original, nome_original_normalizado, nome_corrigido' }, { status: 400 })
    }

    const payloadUpsert: Record<string, any> = {
      empresa_id,
      nome_original,
      nome_original_normalizado,
      nome_corrigido,
      updated_at: new Date().toISOString(),
    }
    if (conta_azul_contato_id) {
      payloadUpsert.conta_azul_contato_id = conta_azul_contato_id
    }

    const { error } = await supabaseAdmin
      .from('fornecedor_depara')
      .upsert(payloadUpsert, {
        onConflict: 'empresa_id,nome_original_normalizado',
      })

    if (error) {
      console.error('Erro ao salvar regra De-Para:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Erro inesperado ao salvar regra De-Para:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// Route GET para buscar as regras com fallback entre lojas do mesmo grupo
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const empresa_id = searchParams.get('empresa_id')

  if (!empresa_id) {
    return NextResponse.json({ error: 'empresa_id obrigatório' }, { status: 400 })
  }

  // 1. Regras específicas da empresa atual
  const { data: regrasEmpresa, error: errEmpresa } = await supabaseAdmin
    .from('fornecedor_depara')
    .select('id, nome_original, nome_original_normalizado, nome_corrigido, conta_azul_contato_id, updated_at, empresa_id')
    .eq('empresa_id', empresa_id)
    .order('updated_at', { ascending: false })

  if (errEmpresa) {
    return NextResponse.json({ error: errEmpresa.message }, { status: 500 })
  }

  // 2. Regras aprendidas em outras lojas (fallback global do grupo)
  const { data: todasRegras } = await supabaseAdmin
    .from('fornecedor_depara')
    .select('id, nome_original, nome_original_normalizado, nome_corrigido, conta_azul_contato_id, updated_at, empresa_id')
    .neq('empresa_id', empresa_id)
    .order('updated_at', { ascending: false })

  const mapRegras = new Map<string, any>()
  
  // Primeiro insere fallback
  todasRegras?.forEach(r => {
    if (r.nome_original_normalizado) {
      mapRegras.set(r.nome_original_normalizado, r)
    }
  })

  // Sobrescreve com as regras da empresa atual (prioridade máxima)
  regrasEmpresa?.forEach(r => {
    if (r.nome_original_normalizado) {
      mapRegras.set(r.nome_original_normalizado, r)
    }
  })

  return NextResponse.json({ data: Array.from(mapRegras.values()) })
}

// Route DELETE para remover regra específica pelo ID
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'ID da regra obrigatório' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('fornecedor_depara')
      .delete()
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Erro ao excluir regra De-Para:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
