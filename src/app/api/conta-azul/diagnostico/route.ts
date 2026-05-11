import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { listarContasFinanceiras, buscarOuCriarContato } from '@/lib/conta-azul/api'

export const runtime = 'nodejs'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const empresa_id = searchParams.get('empresa_id')

  if (!empresa_id) {
    return NextResponse.json({ erro: 'Passe ?empresa_id=XXX na URL' })
  }

  const { data: empresa } = await supabaseAdmin
    .from('empresas')
    .select('id, nome, access_token_conta_azul')
    .eq('id', empresa_id)
    .single()

  if (!empresa?.access_token_conta_azul) {
    return NextResponse.json({ erro: 'Empresa nao encontrada ou sem token' })
  }

  const token = empresa.access_token_conta_azul

  let contasFinanceiras: unknown = null
  let erroCF: string | null = null
  try {
    contasFinanceiras = await listarContasFinanceiras(token)
  } catch (e) {
    erroCF = e instanceof Error ? e.message : String(e)
  }

  let contatoId: unknown = null
  let erroContato: string | null = null
  try {
    contatoId = await buscarOuCriarContato(token, 'TESTE DIAGNOSTICO BPO')
  } catch (e) {
    erroContato = e instanceof Error ? e.message : String(e)
  }

  const BASE_URL = 'https://api-v2.contaazul.com/v1'
  
  // Buscar categorias para o diagnóstico
  let categorias: any[] = []
  try {
    const resCat = await fetch(`${BASE_URL}/financeiro/categorias`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
    if (resCat.ok) {
      const dataCat = await resCat.json()
      categorias = Array.isArray(dataCat) ? dataCat : (dataCat.content ?? dataCat.items ?? [])
    }
  } catch (e) {
    console.warn('Erro ao buscar categorias no diagnóstico:', e)
  }

  const cfArray = Array.isArray(contasFinanceiras) ? contasFinanceiras as { id: string }[] : []
  const cfId = cfArray.length > 0 ? cfArray[0].id : undefined
  const catId = categorias.length > 0 ? categorias[0].id : undefined

  const payload = {
    data_competencia: '2026-05-01',
    valor: 1.00,
    observacao: 'TESTE DIAGNOSTICO BPO - pode apagar',
    descricao: 'TESTE DIAGNOSTICO BPO - pode apagar',
    ...(contatoId ? { contato: contatoId } : {}),
    ...(cfId ? { conta_financeira: cfId } : {}),
    condicao_pagamento: {
      parcelas: [{
        descricao: 'Parcela teste',
        data_vencimento: '2026-05-31',
        nota: 'nota teste',
        ...(cfId ? { conta_financeira: cfId } : {}),
        detalhe_valor: { 
          valor_bruto: 1.00,
          valor_liquido: 1.00
        },
      }],
    },
    ...(catId ? {
      rateio: [{
        categoria_id: catId,
        valor: 1.00
      }]
    } : {})
  }

  const res = await fetch(
    BASE_URL + '/financeiro/eventos-financeiros/contas-a-pagar',
    {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  )

  const statusCode = res.status
  const bodyRaw = await res.text()
  let bodyParsed: unknown = bodyRaw
  try { bodyParsed = JSON.parse(bodyRaw) } catch { bodyParsed = bodyRaw }

  return NextResponse.json({
    empresa: empresa.nome,
    contas_financeiras: contasFinanceiras,
    erro_contas_financeiras: erroCF,
    contato_id: contatoId,
    erro_contato: erroContato,
    payload_enviado: payload,
    api_status: statusCode,
    api_response: bodyParsed,
    sucesso: res.ok,
  })
}