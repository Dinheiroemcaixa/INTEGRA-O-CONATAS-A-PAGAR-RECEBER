import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { criarContaPagar, listarContasFinanceiras, buscarOuCriarContato, listarCategorias } from '@/lib/conta-azul/api'
import { getValidToken, TokenError } from '@/lib/conta-azul/token-manager'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

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

    // 1. Buscar empresa e obter token válido (com renovação automática)
    let accessToken: string
    try {
      const result = await getValidToken(empresa_id)
      accessToken = result.accessToken
    } catch (e) {
      if (e instanceof TokenError) {
        return NextResponse.json({ error: e.message }, { status: e.statusCode })
      }
      throw e
    }

    // 2. Carregar Categorias e Contas do Conta Azul
    let todasCategorias: any[] = []
    let todasContasFinanceiras: any[] = []
    try {
      [todasCategorias, todasContasFinanceiras] = await Promise.all([
        listarCategorias(accessToken),
        listarContasFinanceiras(accessToken)
      ])
    } catch (e: any) {
      const msgErro = e instanceof Error ? e.message : String(e)
      console.error('[ca/enviar] ERRO ao carregar metadados:', msgErro)
      
      if (msgErro === 'TOKEN_EXPIRADO' || msgErro.includes('Token has expired') || msgErro.includes('TokenExpired')) {
        return NextResponse.json({ error: 'Sua conexão com a Conta Azul expirou. Por favor, acesse o painel (icone de engrenagem) e clique em "Conectar Conta Azul" novamente.' }, { status: 401 })
      }
      
      return NextResponse.json({ error: msgErro }, { status: 400 })
    }

    console.log(`[ca/enviar] Categorias carregadas: ${todasCategorias.length}`)
    console.log(`[ca/enviar] Contas financeiras carregadas: ${todasContasFinanceiras.length}`, JSON.stringify(todasContasFinanceiras.slice(0,5)))

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
        let contatoId = null
        try {
          contatoId = await buscarOuCriarContato(accessToken, conta.fornecedor)
        } catch (errContato) {
          console.error(`[ca/enviar] Erro ao buscar/criar contato ${conta.fornecedor}:`, errContato)
        }

        // Categoria (Match Inteligente)
        let catId = null
        const categoriaOriginal = conta.categoria || 'Materiais para Revenda'
        
        // Função para limpeza profunda (remove acentos, prefixos, espaços e caracteres especiais)
        const limpar = (t: string) => {
          if (!t) return ''
          return t.toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, "") // Remove acentos
            .replace(/^[\d.]+\s*[-]\s*/, '')                 // Remove "4.02 - "
            .replace(/^[\d.]+\s+/, '')                      // Remove "4.02 "
            .replace(/[^a-z0-9]/g, '')                      // Remove tudo não alfanumérico
            .trim()
        }

        const buscaLimpa = limpar(categoriaOriginal)
        
        // 1. Match Categoria
        const match = todasCategorias.find(c => {
          const n = c.nome.toLowerCase().trim()
          const nLimpa = limpar(n)
          return n === categoriaOriginal.toLowerCase().trim() || nLimpa === buscaLimpa || n.includes(categoriaOriginal.toLowerCase())
        })
        
        if (match) {
          catId = match.id
        } else {
          // Fallback: Busca "Materiais para Revenda"
          const mpr = todasCategorias.find(c => {
            const n = limpar(c.nome)
            return n.includes('materiaispararevenda') || n.includes('mercadoriaspararevenda')
          })
          if (mpr) catId = mpr.id
        }

        if (!catId) {
          const exemplo = todasCategorias.slice(0, 5).map(c => c.nome).join(', ')
          throw new Error(`Categoria '${categoriaOriginal}' não encontrada. (Total de ${todasCategorias.length} categorias lidas). Exemplo das que temos: ${exemplo}...`)
        }

        // 2. Match Conta Bancária
        let bancoId: string | null = null

        // Prioridade 1: usar o ID salvo diretamente (mais confiável)
        if (conta.conta_financeira_id) {
          bancoId = conta.conta_financeira_id
        } else {
          // Prioridade 2: match por nome
          const contaOriginal = conta.conta_financeira || ''
          const contaBuscaLimpa = limpar(contaOriginal)

          const bancoMatch = todasContasFinanceiras.find(b => {
            const n = (b.descricao || '').toLowerCase().trim()
            const nLimpa = limpar(n)
            return n === contaOriginal.toLowerCase().trim() || nLimpa === contaBuscaLimpa || n.includes(contaOriginal.toLowerCase())
          })

          if (bancoMatch) {
            bancoId = bancoMatch.id
          } else if (conta.conta_financeira) {
            // Log para diagnostico - nao bloqueia o envio
            console.warn(`[ca/enviar] Conta '${conta.conta_financeira}' nao encontrada por nome. Contas disponiveis: ${todasContasFinanceiras.map(b => b.descricao).join(', ')}`)
          }
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
