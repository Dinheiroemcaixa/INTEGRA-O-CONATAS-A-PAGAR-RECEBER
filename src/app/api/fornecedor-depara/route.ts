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
    const { empresa_id, nome_original, nome_original_normalizado, nome_corrigido } = await req.json()

    if (!empresa_id || !nome_original || !nome_original_normalizado || !nome_corrigido) {
      return NextResponse.json({ error: 'Campos obrigatórios: empresa_id, nome_original, nome_original_normalizado, nome_corrigido' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('fornecedor_depara')
      .upsert({
        empresa_id,
        nome_original,
        nome_original_normalizado,
        nome_corrigido,
        updated_at: new Date().toISOString(),
      }, {
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

// Route GET para buscar as regras (evita cache e RLS problemáticos)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const empresa_id = searchParams.get('empresa_id')

  if (!empresa_id) {
    return NextResponse.json({ error: 'empresa_id obrigatório' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('fornecedor_depara')
    .select('nome_original_normalizado, nome_corrigido')
    .eq('empresa_id', empresa_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}
