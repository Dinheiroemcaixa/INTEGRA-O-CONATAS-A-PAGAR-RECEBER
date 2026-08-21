import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    const { empresa_id } = await request.json()

    if (!empresa_id) {
      return NextResponse.json({ error: 'empresa_id é obrigatório' }, { status: 400 })
    }

    // 1. Limpa registros dependentes em ordem com service role admin (bypassa RLS)
    await supabaseAdmin.from('usuarios_empresas').delete().eq('empresa_id', empresa_id)
    await supabaseAdmin.from('fornecedores_conta_azul').delete().eq('empresa_id', empresa_id)
    await supabaseAdmin.from('fornecedores_depara').delete().eq('empresa_id', empresa_id)
    await supabaseAdmin.from('logs_integracao').delete().eq('empresa_id', empresa_id)
    await supabaseAdmin.from('agendamentos_execucao').delete().eq('empresa_id', empresa_id)
    await supabaseAdmin.from('vendas_produtos').delete().eq('empresa_id', empresa_id)
    await supabaseAdmin.from('vendas_servicos').delete().eq('empresa_id', empresa_id)
    await supabaseAdmin.from('contas_pagar').delete().eq('empresa_id', empresa_id)

    // 2. Exclui a empresa
    const { error: errDelete } = await supabaseAdmin.from('empresas').delete().eq('id', empresa_id)

    if (errDelete) {
      console.error('[api/empresas/excluir] Erro:', errDelete)
      return NextResponse.json({ error: errDelete.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Empresa excluída com sucesso!' })
  } catch (error: any) {
    console.error('[api/empresas/excluir] Exceção:', error)
    return NextResponse.json({ error: error.message || 'Erro interno ao excluir empresa' }, { status: 500 })
  }
}
