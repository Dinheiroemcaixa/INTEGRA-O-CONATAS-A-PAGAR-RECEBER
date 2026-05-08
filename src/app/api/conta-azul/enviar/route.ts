import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { criarContaPagar, refreshToken as refreshCA } from '@/lib/conta-azul/api'
import { sleep } from '@/lib/utils'

export const runtime = 'nodejs'
export const maxDuration = 60

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface RequestBody {
  empresa_id: string
  contas_ids?: string[]
}

export async function POST(req: NextRequest) {
  try {
    const body: RequestBody = await req.json()
    const { empresa_id, contas_ids } = body

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
    const tokenExpirado = expiracao && expiracao <= new Date(agora.getTime() + 5 * 60 * 1000) // 5min de margem

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
          error: 'Token do Conta Azul expirado e não foi possível renovar. Reconecte a integração em Empresas.'
        }, { status: 401 })
      }
    }

    // Buscar contas pendentes
    let query = supabaseAdmin
      .from('contas_pagar_importadas')
      .select('*')
      .eq('empresa_id', empresa_id)
      .eq('status', 'pendente')

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
      await sleep(300) // Rate limiting: evitar flood na API

      try {
        // Payload formato API v2 Conta Azul (documentação oficial)
        const payload = {
          data_competencia: conta.emissao || conta.vencimento,
          valor: Number(conta.valor),
          observacao: conta.descricao || `Pagamento - ${conta.fornecedor}`,
          descricao: conta.descricao || `Pagamento - ${conta.fornecedor}`,
          condicao_pagamento: {
            parcelas: [{
              descricao: conta.descricao || `Parcela - ${conta.fornecedor}`,
              data_vencimento: conta.vencimento,
              nota: conta.descricao || `NF ${conta.fornecedor}`,
              detalhe_valor: {
                valor_bruto: Number(conta.valor),
              },
            }],
          },
        }

        const resposta = await criarContaPagar(accessToken, payload)

        // Marcar como enviado
        await supabaseAdmin
          .from('contas_pagar_importadas')
          .update({
            status: 'enviado',
            conta_azul_id: resposta.protocolId,
            erro_mensagem: null,
            tentativas: (conta.tentativas || 0) + 1,
          })
          .eq('id', conta.id)

        enviados++
        resultados.push({ id: conta.id, status: 'sucesso' })

        // Log
        await supabaseAdmin.from('logs_integracao').insert({
          empresa_id,
          conta_pagar_id: conta.id,
          acao: 'enviar_conta_azul',
          status: 'sucesso',
          detalhes: { conta_azul_id: resposta.protocolId, valor: conta.valor },
        })
      } catch (errEnvio: unknown) {
        const msg = errEnvio instanceof Error ? errEnvio.message : 'Erro desconhecido'

        // Se token expirou no meio do processo, renovar e tentar uma vez mais
        if (msg === 'TOKEN_EXPIRADO' && empresa.refresh_token_conta_azul) {
          try {
            const novosTokens = await refreshCA(
              empresa.refresh_token_conta_azul,
              process.env.CONTA_AZUL_CLIENT_ID!,
              process.env.CONTA_AZUL_CLIENT_SECRET!
            )
            accessToken = novosTokens.access_token
            await supabaseAdmin.from('empresas').update({
              access_token_conta_azul: novosTokens.access_token,
              refresh_token_conta_azul: novosTokens.refresh_token,
              data_expiracao_token: new Date(Date.now() + novosTokens.expires_in * 1000).toISOString(),
            }).eq('id', empresa_id)

            // Retry único
            const payload = {
              data_competencia: conta.emissao || conta.vencimento,
              valor: Number(conta.valor),
              observacao: conta.descricao || `Pagamento - ${conta.fornecedor}`,
              descricao: conta.descricao || `Pagamento - ${conta.fornecedor}`,
              condicao_pagamento: {
                parcelas: [{
                  descricao: conta.descricao || `Parcela - ${conta.fornecedor}`,
                  data_vencimento: conta.vencimento,
                  nota: conta.descricao || `NF ${conta.fornecedor}`,
                  detalhe_valor: {
                    valor_bruto: Number(conta.valor),
                  },
                }],
              },
            }
            const resposta = await criarContaPagar(accessToken, payload)
            await supabaseAdmin.from('contas_pagar_importadas').update({
              status: 'enviado',
              conta_azul_id: resposta.protocolId,
              erro_mensagem: null,
            }).eq('id', conta.id)
            enviados++
            resultados.push({ id: conta.id, status: 'sucesso' })
            continue
          } catch { /* cai no erro abaixo */ }
        }

        // Marcar como erro
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

    return NextResponse.json({
      enviados,
      erros,
      total: contas.length,
      resultados,
    })
  } catch (err) {
    const detail = err instanceof Error
      ? { message: err.message, stack: err.stack }
      : JSON.parse(JSON.stringify(err, Object.getOwnPropertyNames(err)))
    console.error('[conta-azul/enviar] DETALHE:', JSON.stringify(detail))
    return NextResponse.json({ error: detail }, { status: 500 })
  }
}
