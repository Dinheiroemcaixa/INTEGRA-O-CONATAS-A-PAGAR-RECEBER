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

    // Buscar empresa com tokens
    const { data: empresa, error: errEmp } = await supabaseAdmin
      .from('empresas')
      .select('*')
      .eq('id', empresa_id)
      .single()

    if (errEmp || !empresa) {
      return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 })
    }

    if (!empresa.access_token_conta_azul) {
      return NextResponse.json({
        error: 'Esta empresa não está conectada ao Conta Azul. Configure em Empresas > Integrações.'
      }, { status: 400 })
    }

    // Verificar/renovar token se necessário
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
        console.error('[refresh token]', errRefresh)
        return NextResponse.json({
          error: 'Token do Conta Azul expirado. Reconecte a integração em Empresas.'
        }, { status: 401 })
      }
    }

    // Buscar conta financeira UMA VEZ só (não por lançamento)
    let contaFinanceiraId: string | null = null
    try {
      const contas = await listarContasFinanceiras(accessToken)
      if (contas && contas.length > 0) {
        contaFinanceiraId = contas[0].id
      }
    } catch (e) {
      console.warn('[conta_financeira] não foi possível buscar:', e)
    }

    // Buscar categorias financeiras UMA VEZ só
    let categoriaPadraoId: string | null = null
    try {
      const categorias = await listarCategorias(accessToken)
      if (categorias && categorias.length > 0) {
        categoriaPadraoId = categorias[0].id
      }
    } catch (e) {
      console.warn('[categorias] não foi possível buscar:', e)
    }

    // Buscar contas pendentes - limitar para evitar timeout
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
      return NextResponse.json({ enviados: 0, erros: 0, mensagem: 'Nenhuma conta pendente' })
    }

    let enviados = 0
    let erros = 0
    const resultados: { id: string; status: 'sucesso' | 'erro'; detalhe?: string }[] = []

    for (const conta of contas) {
      try {
        // Buscar ou criar contato para este fornecedor
        let contatoId: string | null = null
        try {
          contatoId = (await buscarOuCriarContato(accessToken, conta.fornecedor)) ?? null
        } catch (e) {
          console.warn('[contato] não foi possível buscar/criar:', e)
        }

        const dataCompetencia = conta.emissao || conta.vencimento
        const payload: Record<string, any> = {
          data_competencia: dataCompetencia,
          valor: Number(conta.valor),
          observacao: conta.descricao || `Pagamento - ${conta.fornecedor}`,
          descricao: conta.descricao || `Pagamento - ${conta.fornecedor}`,
          condicao_pagamento: {
            parcelas: [{
              descricao: conta.descricao || conta.fornecedor,
              data_vencimento: conta.vencimento,
              nota: conta.descricao || '',
              detalhe_valor: {
                valor_bruto: Number(conta.valor),
                valor_liquido: Number(conta.valor)
              }
            }]
          }
        }

        // Adicionar rateio obrigatório (v2)
        if (categoriaPadraoId) {
          payload.rateio = [{
            categoria_id: categoriaPadraoId,
            valor: Number(conta.valor)
          }]
        }

        if (contatoId) payload.contato = contatoId
        if (contaFinanceiraId) payload.conta_financeira = contaFinanceiraId

        const resposta = await criarContaPagar(accessToken, payload as never)

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

        await supabaseAdmin.from('logs_integracao').insert({
          empresa_id,
          conta_pagar_id: conta.id,
          acao: 'enviar_conta_azul',
          status: 'sucesso',
          detalhes: { valor: conta.valor },
        })
      } catch (errEnvio: unknown) {
        const msg = errEnvio instanceof Error ? errEnvio.message : String(errEnvio)

        await supabaseAdmin
          .from('contas_pagar_importadas')
          .update({
            status: 'erro',
            erro_mensagem: msg,
            tentativas: (conta.tentativas || 0) + 1,
          })
          .eq('id', conta.id)

        erros++
        resultados.push({ id: conta.id, status: 'erro', detalhe: msg })

        await supabaseAdmin.from('logs_integracao').insert({
          empresa_id,
          conta_pagar_id: conta.id,
          acao: 'enviar_conta_azul',
          status: 'erro',
          detalhes: { erro: msg, valor: conta.valor },
        })
      }
    }

    // Contar quantos ainda ficaram pendentes
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
    console.error('[conta-azul/enviar]', err)
    const msg = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
