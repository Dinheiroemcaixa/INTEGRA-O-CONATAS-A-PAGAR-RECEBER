import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { criarContaPagar, refreshToken as refreshCA, listarContasFinanceiras, buscarOuCriarContato, listarCategorias } from '@/lib/conta-azul/api'

export const runtime = 'nodejs'
export const maxDuration = 60

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface RequestBody {
  empresa_id: string
  contas_ids?: string[]
  limite?: number
}

export async function POST(req: NextRequest) {
  try {
    const body: RequestBody = await req.json()
    const { empresa_id, contas_ids, limite = 5 } = body

    if (!empresa_id) {
      return NextResponse.json({ error: 'empresa_id obrigatório' }, { status: 400 })
    }

    // 1. Buscar empresa e tokens
    const { data: empresa, error: errEmp } = await supabaseAdmin
      .from('empresas')
      .select('*')
      .eq('id', empresa_id)
      .single()

    if (errEmp || !empresa) {
      return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 })
    }

    let accessToken = empresa.access_token_conta_azul
    const expiracao = empresa.data_expiracao_token ? new Date(empresa.data_expiracao_token) : null
    const agora = new Date()
    const tokenExpirado = expiracao && expiracao <= new Date(agora.getTime() + 5 * 60 * 1000)

    if (tokenExpirado && empresa.refresh_token_conta_azul) {
      try {
        const novosTokens = await refreshCA(
          empresa.refresh_token_conta_azul,
          process.env.CONTA_AZUL_CLIENT_ID!,
          process.env.CONTA_AZUL_CLIENT_SECRET!
        )
        accessToken = novosTokens.access_token
        await supabaseAdmin
          .from('empresas')
          .update({
            access_token_conta_azul: novosTokens.access_token,
            refresh_token_conta_azul: novosTokens.refresh_token,
            data_expiracao_token: new Date(Date.now() + novosTokens.expires_in * 1000).toISOString(),
          })
          .eq('id', empresa_id)
      } catch (errRefresh) {
        return NextResponse.json({ error: 'Token expirado. Reconecte.' }, { status: 401 })
      }
    }

    // 2. Carregar Categorias e Contas do Conta Azul
    let todasCategorias: any[] = []
    let todasContasFinanceiras: any[] = []
    try {
      [todasCategorias, todasContasFinanceiras] = await Promise.all([
        listarCategorias(accessToken),
        listarContasFinanceiras(accessToken)
      ])
    } catch (e) {
      console.error('[ca/enviar] erro ao carregar metadados:', e)
    }

    if (todasCategorias.length === 0) {
      return NextResponse.json({ error: 'Nenhuma categoria no Conta Azul' }, { status: 400 })
    }

    const categoriaPadraoId = todasCategorias[0].id
    const contaPadraoId = todasContasFinanceiras.length > 0 ? todasContasFinanceiras[0].id : null

    // 3. Buscar contas pendentes
    let query = supabaseAdmin
      .from('contas_pagar_importadas')
      .select('*')
      .eq('empresa_id', empresa_id)
      .eq('status', 'pendente')
      .limit(limite)

    if (contas_ids && contas_ids.length > 0) {
      query = query.in('id', contas_ids)
    }

    const { data: contas, error: errContas } = await query
    if (errContas) throw errContas
    if (!contas || contas.length === 0) {
      return NextResponse.json({ enviados: 0, mensagem: 'Sem contas' })
    }

    let enviados = 0
    let erros = 0
    const resultados: any[] = []

    // 4. Processar cada conta
    for (const conta of contas) {
      let payloadFinal: any = null
      try {
        // Fornecedor
        const contatoId = (await buscarOuCriarContato(accessToken, conta.fornecedor)) || null

        // Categoria (Match Inteligente)
        let catId = categoriaPadraoId
        if (conta.categoria) {
          const busca = conta.categoria.toLowerCase().trim()
          const buscaLimpa = busca.replace(/^[\d.]+\s*-\s*/, '').trim()
          const match = todasCategorias.find(c => {
            const n = c.nome.toLowerCase().trim()
            return n === busca || n === buscaLimpa || n.includes(buscaLimpa) || buscaLimpa.includes(n)
          })
          if (match) catId = match.id
        }

        // Conta Bancária
        let bancoId = contaPadraoId
        if (conta.conta_financeira) {
          const busca = conta.conta_financeira.toLowerCase().trim()
          const match = todasContasFinanceiras.find(c => {
            const d = c.descricao.toLowerCase().trim()
            return d === busca || d.includes(busca) || busca.includes(d)
          })
          if (match) bancoId = match.id
        }

        const valorNum = Number(conta.valor)
        const dataCompetencia = conta.emissao || conta.vencimento

        // Payload EVENTOS (v2 oficial)
        payloadFinal = {
          data_competencia: dataCompetencia,
          valor: valorNum,
          descricao: conta.descricao || `Pagamento - ${conta.fornecedor}`,
          observacao: conta.descricao || `Pagamento - ${conta.fornecedor}`,
          contato: contatoId || undefined,
          conta_financeira: bancoId || undefined,
          rateio: [{
            id_categoria: catId,
            valor: valorNum
          }],
          condicao_pagamento: {
            parcelas: [{
              descricao: conta.descricao || conta.fornecedor,
              data_vencimento: conta.vencimento,
              conta_financeira: bancoId || undefined, // CRUCIAL
              detalhe_valor: {
                valor_bruto: valorNum,
                valor_liquido: valorNum,
                multa: 0, juros: 0, desconto: 0, taxa: 0
              }
            }]
          }
        }

        const resposta = await criarContaPagar(accessToken, payloadFinal)

        await supabaseAdmin
          .from('contas_pagar_importadas')
          .update({
            status: 'enviado',
            conta_azul_id: resposta.protocolId || 'enviado',
            erro_mensagem: null,
            tentativas: (conta.tentativas || 0) + 1,
          })
          .eq('id', conta.id)

        enviados++
        resultados.push({ id: conta.id, status: 'sucesso' })

      } catch (errLoop: any) {
        erros++
        const msg = errLoop instanceof Error ? errLoop.message : String(errLoop)
        
        await supabaseAdmin
          .from('contas_pagar_importadas')
          .update({
            status: 'erro',
            erro_mensagem: msg,
            tentativas: (conta.tentativas || 0) + 1,
          })
          .eq('id', conta.id)

        await supabaseAdmin.from('logs_integracao').insert({
          empresa_id,
          conta_pagar_id: conta.id,
          acao: 'enviar_conta_azul',
          status: 'erro',
          detalhes: { erro: msg, payload: payloadFinal },
        })

        resultados.push({ id: conta.id, status: 'erro', detalhe: msg })
      }
    }

    const { count: pendentesRestantes } = await supabaseAdmin
      .from('contas_pagar_importadas')
      .select('*', { count: 'exact', head: true })
      .eq('empresa_id', empresa_id)
      .eq('status', 'pendente')

    return NextResponse.json({
      enviados,
      erros,
      total: contas.length,
      pendentes_restantes: pendentesRestantes || 0,
      resultados,
    })
  } catch (err) {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
