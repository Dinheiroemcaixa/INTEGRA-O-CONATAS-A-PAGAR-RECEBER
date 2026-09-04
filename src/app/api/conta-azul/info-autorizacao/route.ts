import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const empresaId = searchParams.get('empresa_id')
  const modulo = (searchParams.get('modulo') || 'financeiro').toLowerCase()

  if (!empresaId) {
    return NextResponse.json({ error: 'empresa_id obrigatorio' }, { status: 400 })
  }

  try {
    const { data: empresa, error } = await supabaseAdmin
      .from('empresas')
      .select('id, nome, razao_social, nome_fantasia, cnpj, access_token_conta_azul, access_token_conta_azul_vendas, email_login, email_login_vendas')
      .eq('id', empresaId)
      .single()

    if (error || !empresa) {
      return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 404 })
    }

    const isFinanceiro = modulo === 'financeiro'
    const nomeBase = (empresa.nome_fantasia || empresa.nome || 'Empresa').trim()
    
    const nomeEsperadoCa = isFinanceiro
      ? (nomeBase.toLowerCase().startsWith('fin') ? nomeBase : 'Fin. ' + nomeBase)
      : (nomeBase.toLowerCase().startsWith('fin.') || nomeBase.toLowerCase().startsWith('fin ') ? nomeBase.replace(/^fin\.?\s*/i, '') : nomeBase)

    return NextResponse.json({
      empresa_id: empresa.id,
      nome: empresa.nome,
      razao_social: empresa.razao_social || empresa.nome,
      nome_fantasia: empresa.nome_fantasia,
      cnpj: empresa.cnpj,
      modulo: isFinanceiro ? 'financeiro' : 'vendas',
      modulo_label: isFinanceiro ? 'Conta Azul Financeiro (Contas a Pagar / Receber)' : 'Conta Azul Vendas / Emissao de NF-e',
      modulo_tipo: isFinanceiro ? 'Financeiro' : 'Vendas / NF-e',
      nome_esperado_ca: nomeEsperadoCa,
      ja_conectado: isFinanceiro ? Boolean(empresa.access_token_conta_azul) : Boolean(empresa.access_token_conta_azul_vendas),
      email_login_existente: isFinanceiro ? empresa.email_login : empresa.email_login_vendas
    })
  } catch (err: any) {
    console.error('[info-autorizacao]', err)
    return NextResponse.json({ error: 'Erro ao consultar empresa' }, { status: 500 })
  }
}
