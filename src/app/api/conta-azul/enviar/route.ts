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

    // Buscar categorias financeiras UMA VEZ só
    let todasCategorias: Array<{ id: string; nome: string }> = []
    try {
      todasCategorias = await listarCategorias(accessToken)
    } catch (e) {
      console.warn('[categorias] não foi possível buscar:', e)
    }

    // Buscar contas financeiras UMA VEZ só
    let todasContasFinanceiras: Array<{ id: string; descricao: string }> = []
    try {
      todasContasFinanceiras = await listarContasFinanceiras(accessToken)
    } catch (e) {
      console.warn('[contas_financeiras] não foi possível buscar:', e)
    }

    if (todasCategorias.length === 0) {
      return NextResponse.json({
        error: 'Nenhuma categoria financeira encontrada no Conta Azul.'
      }, { status: 400 })
    }

    const categoriaPadraoId = todasCategorias[0].id
    const contaPadraoId = todasContasFinanceiras.length > 0 ? todasContasFinanceiras[0].id : null

    // Buscar contas pendentes
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
        console.log(`[enviar] Processando conta ${conta.id}: Fornecedor=${conta.fornecedor}, Categoria=${conta.categoria}, Conta=${conta.conta_financeira}`)

        // 1. Buscar ou criar contato (Fornecedor)
        let contatoId: string | null = null
        try {
          contatoId = (await buscarOuCriarContato(accessToken, conta.fornecedor)) ?? null
          console.log(`[enviar] Contato ID para ${conta.fornecedor}: ${contatoId}`)
        } catch (e) {
          console.warn(`[enviar] Erro ao buscar contato ${conta.fornecedor}:`, e)
        }

        // 2. Mapear CATEGORIA pelo nome
        let categoriaIdParaEstaConta = categoriaPadraoId
        if (conta.categoria) {
          const nomeBuscaOriginal = conta.categoria.toLowerCase().trim()
          // Tira códigos como "4.01.01 - " do início se houver
          const nomeBuscaLimpo = nomeBuscaOriginal.replace(/^[\d.]+\s*-\s*/, '').trim()
          
          const match = todasCategorias.find(c => {
            const nomeCA = c.nome.toLowerCase().trim()
            // Tenta match exato no nome limpo ou se um contém o outro
            return nomeCA === nomeBuscaLimpo || 
                   nomeCA === nomeBuscaOriginal ||
                   nomeCA.includes(nomeBuscaLimpo) || 
                   nomeBuscaLimpo.includes(nomeCA)
          })
          
          if (match) {
            categoriaIdParaEstaConta = match.id
            console.log(`[enviar] Categoria mapeada: ${conta.categoria} -> ${match.nome} (${match.id})`)
          } else {
            console.log(`[enviar] Categoria NÃO mapeada (usando padrão): ${conta.categoria}`)
          }
        }

        // 3. Mapear CONTA FINANCEIRA pelo nome
        let contaIdParaEstaConta = contaPadraoId
        if (conta.conta_financeira) {
          const nomeBusca = conta.conta_financeira.toLowerCase().trim()
          const match = todasContasFinanceiras.find(c => {
            const nomeCA = c.descricao.toLowerCase().trim()
            return nomeCA === nomeBusca || nomeCA.includes(nomeBusca) || nomeBusca.includes(nomeCA)
          })
          
          if (match) {
            contaIdParaEstaConta = match.id
            console.log(`[enviar] Conta financeira mapeada: ${conta.conta_financeira} -> ${match.descricao} (${match.id})`)
          } else {
            console.log(`[enviar] Conta financeira NÃO mapeada (usando padrão): ${conta.conta_financeira}`)
          }
        }

        const dataCompetencia = conta.emissao || conta.vencimento
        const valorNum = Number(conta.valor)
        
        // Payload 100% fiel à documentação oficial capturada
        const payload: any = {
          data_competencia: dataCompetencia,
          valor: valorNum,
          descricao: conta.descricao || `Pagamento - ${conta.fornecedor}`,
          observacao: conta.descricao || `Pagamento - ${conta.fornecedor}`,
          contato: contatoId || undefined,
          conta_financeira: contaIdParaEstaConta || undefined,
          rateio: [{
            id_categoria: categoriaIdParaEstaConta,
            valor: valorNum
          }],
          condicao_pagamento: {
            parcelas: [{
              descricao: conta.descricao || conta.fornecedor,
              data_vencimento: conta.vencimento,
              conta_financeira: contaIdParaEstaConta || undefined, // Obrigatório aqui também para vincular a conta bancária
              detalhe_valor: {
                valor_bruto: valorNum,
                valor_liquido: valorNum,
                multa: 0,
                juros: 0,
                desconto: 0,
                taxa: 0
              }
            }]
          }
        }

        console.log(`[enviar] payload conta ${conta.id}:`, JSON.stringify(payload).substring(0, 600))
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
