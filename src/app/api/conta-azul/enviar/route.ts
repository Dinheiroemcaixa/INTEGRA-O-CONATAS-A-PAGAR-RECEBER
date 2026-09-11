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
      console.warn('[ca/enviar] Erro ao carregar metadados na 1ª tentativa, tentando renovar token:', e?.message || e)
      try {
        const resultForcado = await getValidToken(empresa_id, 'financeiro', true)
        accessToken = resultForcado.accessToken;
        [todasCategorias, todasContasFinanceiras] = await Promise.all([
          listarCategorias(accessToken),
          listarContasFinanceiras(accessToken)
        ])
      } catch (retryErr: any) {
        const msgErro = retryErr instanceof Error ? retryErr.message : String(retryErr)
        console.error('[ca/enviar] ERRO ao carregar metadados após renovação:', msgErro)
        return NextResponse.json({ error: 'Sua conexão com a Conta Azul precisa ser renovada. Acesse Empresas e reconecte.' }, { status: 401 })
      }
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
      return NextResponse.json({ enviados: 0, erros: 0, total: 0, pendentes_restantes: 0, mensagem: 'Sem contas' })
    }

    let enviados = 0
    let erros = 0
    const resultados: any[] = []
    const contatosCache = new Map<string, string>()

    // Pré-popular cache com identificadores já persistidos no De-Para
    try {
      const { data: regrasDepara } = await supabaseAdmin
        .from('fornecedor_depara')
        .select('nome_original, nome_original_normalizado, nome_corrigido, conta_azul_contato_id')
        .eq('empresa_id', empresa_id)

      if (regrasDepara && regrasDepara.length > 0) {
        for (const r of regrasDepara) {
          if (r.conta_azul_contato_id) {
            if (r.nome_original) contatosCache.set(r.nome_original.trim().toUpperCase(), r.conta_azul_contato_id)
            if (r.nome_original_normalizado) contatosCache.set(r.nome_original_normalizado.trim().toUpperCase(), r.conta_azul_contato_id)
            if (r.nome_corrigido) contatosCache.set(r.nome_corrigido.trim().toUpperCase(), r.conta_azul_contato_id)
          }
        }
      }
    } catch (errDepara) {
      console.warn('[ca/enviar] Aviso ao carregar cache de contatos persistido:', errDepara)
    }

    // Helper defensivo para obter e persistir o ID de contato
    const resolverContatoId = async (fornecedorNome: string): Promise<string | null> => {
      const nomeLimpo = (fornecedorNome || '').trim()
      const chaveNorm = nomeLimpo.toUpperCase()
      if (!chaveNorm || chaveNorm === 'NÃO INFORMADO' || chaveNorm === 'NÃO IDENTIFICADO') {
        return null
      }

      if (contatosCache.has(chaveNorm)) {
        return contatosCache.get(chaveNorm) || null
      }

      try {
        const resContato = await buscarOuCriarContato(accessToken, nomeLimpo)
        if (resContato) {
          contatosCache.set(chaveNorm, resContato)
          // Persistência assíncrona na tabela fornecedor_depara
          try {
            await supabaseAdmin
              .from('fornecedor_depara')
              .update({
                conta_azul_contato_id: resContato,
                updated_at: new Date().toISOString()
              })
              .eq('empresa_id', empresa_id)
              .eq('nome_original_normalizado', chaveNorm)
          } catch (errPersist) {
            console.warn('[ca/enviar] Aviso ao persistir conta_azul_contato_id em fornecedor_depara:', errPersist)
          }
          return resContato
        }
      } catch (errContato) {
        console.error(`[ca/enviar] Erro ao buscar/criar contato ${nomeLimpo}:`, errContato)
      }

      return null
    }

    // 4. Processar contas em lotes com concorrência controlada (Chunk Size = 3)
    const CHUNK_SIZE = 3
    for (let i = 0; i < contas.length; i += CHUNK_SIZE) {
      const chunk = contas.slice(i, i + CHUNK_SIZE)
      await Promise.all(
        chunk.map(async (conta) => {
      let payloadFinal: any = null
      try {
        // Fornecedor (com cache em memória e persistência em fornecedor_depara)
        const fornecedorNome = (conta.fornecedor || '').trim()
        const contatoId = await resolverContatoId(fornecedorNome)

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
        // Prioridade 1: Match exato
        let match = todasCategorias.find(c => {
          return c.nome.toLowerCase().trim() === categoriaOriginal.toLowerCase().trim()
        })

        // Prioridade 2: Match exato após limpeza profunda
        if (!match) {
          match = todasCategorias.find(c => {
            return limpar(c.nome) === buscaLimpa
          })
        }

        // Prioridade 3: Começa com o nome pesquisado
        if (!match) {
          match = todasCategorias.find(c => {
            return c.nome.toLowerCase().trim().startsWith(categoriaOriginal.toLowerCase().trim())
          })
        }

        // Prioridade 4: Contém o nome pesquisado
        if (!match) {
          match = todasCategorias.find(c => {
            return c.nome.toLowerCase().trim().includes(categoriaOriginal.toLowerCase().trim())
          })
        }
        
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

        // Obter link de anexo (se houver)
        const urlAnexo = conta.metadata?.anexo_url || (conta as any).anexo_url || null
        let textoObs = conta.descricao || `Pagamento - ${conta.fornecedor}`
        if (urlAnexo) {
          textoObs = `${textoObs}\n📎 Anexo/Comprovante: ${urlAnexo}`
        }

        // Payload EVENTOS (v2 oficial)
        payloadFinal = {
          data_competencia: dataCompetencia,
          valor: valorNum,
          descricao: conta.descricao || `Pagamento - ${conta.fornecedor}`,
          observacao: textoObs,
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
    })
  )
}

    // Limpar do banco os registros "enviados" com mais de 2 horas para evitar sobrecarregar
    try {
      const duasHorasAtras = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
      await supabaseAdmin
        .from('contas_pagar_importadas')
        .delete()
        .eq('empresa_id', empresa_id)
        .eq('status', 'enviado')
        .lt('created_at', duasHorasAtras)
    } catch (errCleanup) {
      console.warn('[ca/enviar] Erro na limpeza automatica de enviados:', errCleanup)
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
