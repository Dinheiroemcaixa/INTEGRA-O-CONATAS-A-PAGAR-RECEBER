import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    const { empresa_origem_id, empresa_destino_id, modulo } = await request.json()

    if (!empresa_origem_id || !empresa_destino_id || !modulo) {
      return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })
    }

    if (empresa_origem_id === empresa_destino_id) {
      return NextResponse.json({ error: 'Empresas de origem e destino devem ser diferentes' }, { status: 400 })
    }

    // 1. Buscar a empresa de origem
    const { data: origem, error: errOrigem } = await supabaseAdmin
      .from('empresas')
      .select('*')
      .eq('id', empresa_origem_id)
      .single()

    if (errOrigem || !origem) {
      return NextResponse.json({ error: 'Empresa de origem não encontrada' }, { status: 404 })
    }

    // 2. Montar objeto de atualização para a empresa destino
    const updatePayload: Record<string, any> = {}

    if (modulo === 'financeiro' || modulo === 'ambos') {
      if (!origem.access_token_conta_azul) {
        return NextResponse.json({ error: 'Empresa de origem não possui conexão CA Financeiro ativa' }, { status: 400 })
      }
      updatePayload.access_token_conta_azul = origem.access_token_conta_azul
      updatePayload.refresh_token_conta_azul = origem.refresh_token_conta_azul
      updatePayload.email_login = origem.email_login || null
    }

    if (modulo === 'vendas' || modulo === 'ambos') {
      const tokenVendas = origem.access_token_conta_azul_vendas || origem.access_token_conta_azul
      const refreshVendas = origem.refresh_token_conta_azul_vendas || origem.refresh_token_conta_azul
      const emailVendas = origem.email_login_vendas || origem.email_login

      if (!tokenVendas) {
        return NextResponse.json({ error: 'Empresa de origem não possui conexão CA Vendas ativa' }, { status: 400 })
      }
      updatePayload.access_token_conta_azul_vendas = tokenVendas
      updatePayload.refresh_token_conta_azul_vendas = refreshVendas
      updatePayload.email_login_vendas = emailVendas || null
    }

    // 3. Atualizar empresa destino
    const { error: errUpdate } = await supabaseAdmin
      .from('empresas')
      .update(updatePayload)
      .eq('id', empresa_destino_id)

    if (errUpdate) {
      console.error('[espelhar-conexao] Erro ao atualizar:', errUpdate)
      return NextResponse.json({ error: errUpdate.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: `Conexão do Conta Azul (${modulo}) espelhada com sucesso!`
    })
  } catch (error: any) {
    console.error('[espelhar-conexao] Exceção:', error)
    return NextResponse.json({ error: error.message || 'Erro interno ao espelhar conexão' }, { status: 500 })
  }
}
