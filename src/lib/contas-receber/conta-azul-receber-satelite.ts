/**
 * DCX LINK — MÓDULO CONTAS A RECEBER (ETAPA 1E)
 * Cliente Satélite Exclusivo do Conta Azul v2 — ESTRITAMENTE SOMENTE LEITURA (GET).
 *
 * REGRAS DE PROTEÇÃO E SEGURANÇA:
 * 1. Não altera e não interfere em src/lib/conta-azul/api.ts nem em src/lib/conta-azul/token-manager.ts.
 * 2. Executa EXCLUSIVAMENTE requisições HTTP GET (qualquer outro método é bloqueado por construção).
 * 3. Não cria receitas, não cria despesas, não registra baixas e não concilia lançamentos.
 * 4. Identifica categorias de RECEITA e DESPESA dinamicamente para a empresa ativa, sem fixar UUIDs.
 * 5. Aplica regras estritas de identificação: valor + data nunca autorizam vínculo ou baixa automática.
 */

import { listarCategorias } from '@/lib/conta-azul/api'
import type {
  AvaliacaoPeriodoContaAzulStoneDTO,
  CategoriaFinanceiraReceberDTO,
  ContaFinanceiraReceberDTO,
  LancamentoExistenteContaAzulDTO,
  ResultadoTriagemItemLoteCA,
} from '@/types/contas-receber'
import { formatarCentavosBRL, reaisParaCentavos } from './validador-financeiro'

const BASE_URL = 'https://api-v2.contaazul.com/v1'
const DEFAULT_TIMEOUT_MS = 15_000

/**
 * Helper HTTP exclusivamente GET para o cliente satélite de Contas a Receber.
 * Bloqueia por construção qualquer método diferente de GET.
 */
async function fetchSateliteGet(
  url: string,
  accessToken: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const maxTentativas = 2
  const delayRetryMs = 1500
  let ultimaResposta: Response | null = null

  for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    try {
      ultimaResposta = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
        signal: controller.signal,
        cache: 'no-store',
      })
      clearTimeout(timeoutId)

      if (ultimaResposta.status < 500 && ultimaResposta.status !== 429) {
        return ultimaResposta
      }

      const ehTransitorio =
        ultimaResposta.status === 429 ||
        ultimaResposta.status === 502 ||
        ultimaResposta.status === 503 ||
        ultimaResposta.status === 504

      if (ehTransitorio && tentativa < maxTentativas) {
        await new Promise((r) => setTimeout(r, delayRetryMs))
        continue
      }

      return ultimaResposta
    } catch (err: unknown) {
      clearTimeout(timeoutId)
      const msg = err instanceof Error ? err.message : String(err)
      const ehTimeoutOuRede =
        (err instanceof Error && err.name === 'AbortError') ||
        /timeout|econnreset|econnrefused|fetch failed/i.test(msg)

      if (ehTimeoutOuRede && tentativa < maxTentativas) {
        await new Promise((r) => setTimeout(r, delayRetryMs))
        continue
      }
      throw err
    }
  }

  return ultimaResposta!
}

/**
 * Normaliza texto para comparação semântica de nomes de categorias (sem acentos, lowercase).
 */
export function normalizarTextoComparacao(texto: string | null | undefined): string {
  return String(texto ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

/**
 * 1. Consulta Contas Financeiras ativas da empresa no Conta Azul (SOMENTE GET).
 */
export async function listarContasFinanceirasSatelite(
  accessToken: string
): Promise<ContaFinanceiraReceberDTO[]> {
  const todasContas = new Map<string, ContaFinanceiraReceberDTO>()
  const queryCompleta =
    'pagina=1&tamanho_pagina=200&apenas_ativo=true&mostrar_caixinha=true&esconde_conta_digital=false'

  const endpoints = [
    `${BASE_URL}/conta-financeira?${queryCompleta}`,
    `${BASE_URL}/conta-financeira?pagina=1&tamanho_pagina=100`,
  ]

  for (const endpoint of endpoints) {
    try {
      const res = await fetchSateliteGet(endpoint, accessToken)
      if (!res.ok) {
        if (res.status === 401) throw new Error('TOKEN_EXPIRADO')
        continue
      }

      const data = await res.json()
      const listaRaw: Record<string, unknown>[] = Array.isArray(data)
        ? data
        : (data.itens || data.items || data.content || data.data || [])

      for (const item of listaRaw) {
        const id = String(
          item.id || item.uuid || item.bankAccountId || item.guid || ''
        ).trim()
        const nomeBase = String(
          item.nome || item.descricao || item.name || item.description || ''
        ).trim()
        const bancoRaw =
          typeof item.banco === 'string' ? item.banco.replace(/_/g, ' ') : null

        if (id && nomeBase && !todasContas.has(id)) {
          let descFinal = nomeBase
          if (
            bancoRaw &&
            !descFinal.toUpperCase().includes(bancoRaw.toUpperCase())
          ) {
            descFinal = `${descFinal} (${bancoRaw})`
          }
          todasContas.set(id, {
            id,
            descricao: descFinal.toUpperCase(),
            tipo: typeof item.tipo === 'string' ? item.tipo : null,
            banco: bancoRaw,
          })
        }
      }

      if (todasContas.size > 0) break
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'TOKEN_EXPIRADO') throw err
    }
  }

  return Array.from(todasContas.values())
}

/**
 * Achata árvore recursiva de categorias e subcategorias da API v2 do Conta Azul.
 */
function achatarArvoreCategorias(
  itens: Record<string, unknown>[],
  tipoForcado?: 'RECEITA' | 'DESPESA'
): Array<{ id: string; nome: string; tipoRaw: string }> {
  let resultado: Array<{ id: string; nome: string; tipoRaw: string }> = []

  for (const item of itens) {
    const id = String(
      item.id || item.uuid || item.categoryId || item.guid || ''
    ).trim()
    const nome = String(
      item.nome || item.name || item.descricao || item.description || ''
    ).trim()
    const tipoRaw = String(
      tipoForcado || item.tipo || item.type || item.natureza || ''
    )
      .trim()
      .toUpperCase()

    const filhos = (item.children ||
      item.sub_categories ||
      item.subcategorias ||
      item.itens ||
      item.items ||
      item.nodes) as Record<string, unknown>[] | undefined

    if (filhos && Array.isArray(filhos) && filhos.length > 0) {
      resultado = resultado.concat(achatarArvoreCategorias(filhos, tipoForcado))
    } else if (id && nome) {
      resultado.push({ id, nome, tipoRaw })
    }
  }

  return resultado
}

/**
 * Localiza dinamicamente a melhor categoria correspondente para "Receitas de Vendas"
 * e "Tarifas de Cartão de Créditos" sem fixar UUIDs.
 */
export function identificarCategoriasSugeridasStone(params: {
  categoriasReceita: CategoriaFinanceiraReceberDTO[]
  categoriasDespesa: CategoriaFinanceiraReceberDTO[]
}): {
  sugestaoReceitaVendas: CategoriaFinanceiraReceberDTO | null
  sugestaoDespesaMdr: CategoriaFinanceiraReceberDTO | null
} {
  const { categoriasReceita, categoriasDespesa } = params

  // 1. Buscar "Receitas de Vendas" (ou variações equivalentes) nas categorias de RECEITA
  const prioridadesReceita = [
    'receitas de vendas',
    'receita de vendas',
    'receitas de venda',
    'receita de venda',
    'vendas de mercadorias',
    'vendas de produtos',
    'receita operacional',
  ]

  let sugestaoReceitaVendas: CategoriaFinanceiraReceberDTO | null = null
  for (const termo of prioridadesReceita) {
    const exata = categoriasReceita.find(
      (c) => normalizarTextoComparacao(c.nome) === termo
    )
    if (exata) {
      sugestaoReceitaVendas = exata
      break
    }
    const parcial = categoriasReceita.find((c) =>
      normalizarTextoComparacao(c.nome).includes(termo)
    )
    if (parcial) {
      sugestaoReceitaVendas = parcial
      break
    }
  }

  // 2. Buscar "Tarifas de Cartão de Créditos" / "Tarifas de Cartões de Crédito" nas categorias de DESPESA
  const prioridadesDespesaMdr = [
    'tarifas de cartao de creditos',
    'tarifas de cartoes de credito',
    'tarifa de cartao de credito',
    'tarifas de cartao',
    'tarifas de cartoes',
    'taxa de cartao',
    'taxas de cartao',
  ]

  let sugestaoDespesaMdr: CategoriaFinanceiraReceberDTO | null = null
  for (const termo of prioridadesDespesaMdr) {
    const exata = categoriasDespesa.find(
      (c) => normalizarTextoComparacao(c.nome) === termo
    )
    if (exata) {
      sugestaoDespesaMdr = exata
      break
    }
    const parcial = categoriasDespesa.find((c) =>
      normalizarTextoComparacao(c.nome).includes(termo)
    )
    if (parcial) {
      sugestaoDespesaMdr = parcial
      break
    }
  }

  return {
    sugestaoReceitaVendas,
    sugestaoDespesaMdr,
  }
}

/**
 * 2. Consulta Categorias de RECEITA e de DESPESA separadamente no Conta Azul (SOMENTE GET).
 * Compartilha a mesma consulta unificada de listarCategorias (sem permite_apenas_filhos=true).
 */
export async function listarCategoriasReceitaEDespesaSatelite(
  accessToken: string
): Promise<{
  categorias_receita: CategoriaFinanceiraReceberDTO[]
  categorias_despesa: CategoriaFinanceiraReceberDTO[]
  sugestao_categoria_receita_vendas: CategoriaFinanceiraReceberDTO | null
  sugestao_categoria_despesa_mdr: CategoriaFinanceiraReceberDTO | null
}> {
  const mapaReceitas = new Map<string, CategoriaFinanceiraReceberDTO>()
  const mapaDespesas = new Map<string, CategoriaFinanceiraReceberDTO>()

  try {
    const [receitasUnificadas, despesasUnificadas] = await Promise.all([
      listarCategorias(accessToken, { tipo: 'RECEITA' }),
      listarCategorias(accessToken, { tipo: 'DESPESA' }),
    ])

    for (const r of receitasUnificadas) {
      if (r.id && r.nome) {
        mapaReceitas.set(r.id, { id: r.id, nome: r.nome, tipo: 'RECEITA' })
      }
    }
    for (const d of despesasUnificadas) {
      if (d.id && d.nome) {
        mapaDespesas.set(d.id, { id: d.id, nome: d.nome, tipo: 'DESPESA' })
      }
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'TOKEN_EXPIRADO') throw err
  }

  const carregarPorTipo = async (tipoAlvo: 'RECEITA' | 'DESPESA') => {
    if (
      (tipoAlvo === 'RECEITA' && mapaReceitas.size > 0) ||
      (tipoAlvo === 'DESPESA' && mapaDespesas.size > 0)
    ) {
      return
    }

    const endpoints = [
      `${BASE_URL}/categorias?tipo=${tipoAlvo}`,
      `${BASE_URL}/categorias?tipo=${tipoAlvo}&permite_apenas_filhos=false`,
    ]

    for (const endpoint of endpoints) {
      try {
        for (let page = 1; page <= 15; page++) {
          const url = `${endpoint}&pagina=${page}&tamanho_pagina=100`
          const res = await fetchSateliteGet(url, accessToken)
          if (!res.ok) {
            if (res.status === 401) throw new Error('TOKEN_EXPIRADO')
            break
          }

          const data = await res.json()
          const listaRaw: Record<string, unknown>[] = Array.isArray(data)
            ? data
            : (data.itens || data.items || data.content || data.data || [])

          if (listaRaw.length === 0) break

          const achatadas = achatarArvoreCategorias(listaRaw, tipoAlvo)
          for (const cat of achatadas) {
            const ehReceitaExplicita =
              cat.tipoRaw === 'RECEITA' ||
              cat.tipoRaw === 'REVENUE' ||
              cat.tipoRaw === 'INCOME'
            const ehDespesaExplicita =
              cat.tipoRaw === 'DESPESA' ||
              cat.tipoRaw === 'EXPENSE'

            if (tipoAlvo === 'RECEITA' && (ehReceitaExplicita || !ehDespesaExplicita)) {
              if (!mapaReceitas.has(cat.id)) {
                mapaReceitas.set(cat.id, {
                  id: cat.id,
                  nome: cat.nome,
                  tipo: 'RECEITA',
                })
              }
            } else if (tipoAlvo === 'DESPESA' && (ehDespesaExplicita || !ehReceitaExplicita)) {
              if (!mapaDespesas.has(cat.id)) {
                mapaDespesas.set(cat.id, {
                  id: cat.id,
                  nome: cat.nome,
                  tipo: 'DESPESA',
                })
              }
            }
          }

          const totalItensApi = Number(
            (data as Record<string, unknown>)?.itens_totais ??
              (data as Record<string, unknown>)?.total_itens ??
              0
          )
          if (
            listaRaw.length < 100 ||
            (totalItensApi > 0 && page * 100 >= totalItensApi)
          ) {
            break
          }
        }

        if (
          (tipoAlvo === 'RECEITA' && mapaReceitas.size > 0) ||
          (tipoAlvo === 'DESPESA' && mapaDespesas.size > 0)
        ) {
          break
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.message === 'TOKEN_EXPIRADO') throw err
      }
    }
  }

  await Promise.all([carregarPorTipo('RECEITA'), carregarPorTipo('DESPESA')])

  const categoriasReceita = Array.from(mapaReceitas.values()).sort((a, b) =>
    a.nome.localeCompare(b.nome, 'pt-BR')
  )
  const categoriasDespesa = Array.from(mapaDespesas.values()).sort((a, b) =>
    a.nome.localeCompare(b.nome, 'pt-BR')
  )

  const { sugestaoReceitaVendas, sugestaoDespesaMdr } =
    identificarCategoriasSugeridasStone({
      categoriasReceita,
      categoriasDespesa,
    })

  return {
    categorias_receita: categoriasReceita,
    categorias_despesa: categoriasDespesa,
    sugestao_categoria_receita_vendas: sugestaoReceitaVendas,
    sugestao_categoria_despesa_mdr: sugestaoDespesaMdr,
  }
}

/**
 * Converte um registro bruto retornado por /contas-a-receber/buscar ou /contas-a-pagar/buscar
 * para o contrato padronizado LancamentoExistenteContaAzulDTO.
 */
function normalizarItemBuscaFinanceiraCA(
  item: Record<string, any>,
  tipoLancamento: 'RECEITA' | 'DESPESA'
): LancamentoExistenteContaAzulDTO {
  let valorTotalReais = 0
  if (typeof item.total === 'number') valorTotalReais = item.total
  else if (typeof item.valor === 'number') valorTotalReais = item.valor
  else if (typeof item.valor_total_liquido === 'number')
    valorTotalReais = item.valor_total_liquido
  else if (typeof item.pago === 'number' || typeof item.nao_pago === 'number') {
    valorTotalReais = (Number(item.pago) || 0) + (Number(item.nao_pago) || 0)
  } else if (item.evento && typeof item.evento.valor === 'number') {
    valorTotalReais = item.evento.valor
  }

  const valorPagoReais =
    typeof item.pago === 'number'
      ? item.pago
      : typeof item.valor_pago === 'number'
        ? item.valor_pago
        : 0

  const statusUpper = String(item.status || 'DESCONHECIDO')
    .trim()
    .toUpperCase()
  const jaQuitadoPorStatus =
    statusUpper === 'QUITADO' ||
    statusUpper === 'PAGO' ||
    statusUpper === 'RECEBIDO' ||
    statusUpper === 'LIQUIDADO'

  const valorTotalCentavos = reaisParaCentavos(valorTotalReais)
  const valorPagoCentavos = jaQuitadoPorStatus
    ? Math.max(reaisParaCentavos(valorPagoReais), valorTotalCentavos)
    : reaisParaCentavos(valorPagoReais)

  const valorAbertoCentavos =
    typeof item.nao_pago === 'number'
      ? reaisParaCentavos(item.nao_pago)
      : Math.max(0, valorTotalCentavos - valorPagoCentavos)

  const contatoObj =
    item.cliente ||
    item.fornecedor ||
    item.contato ||
    item.evento?.cliente ||
    item.evento?.fornecedor ||
    item.evento?.contato ||
    null

  const catObj =
    (Array.isArray(item.categorias) && item.categorias[0]) ||
    item.categoria ||
    item.evento?.categoria ||
    (Array.isArray(item.rateios) && item.rateios[0]) ||
    null

  const contaFinObj =
    item.conta_financeira || item.evento?.conta_financeira || null

  return {
    id: String(item.id || item.uuid || ''),
    evento_id: item.evento?.id ? String(item.evento.id) : null,
    tipo_lancamento: tipoLancamento,
    data_vencimento: String(item.data_vencimento || item.vencimento || '').slice(
      0,
      10
    ),
    data_competencia: item.data_competencia || item.evento?.data_competencia || null,
    data_pagamento: item.data_pagamento || item.pagamento || null,
    valor_total_centavos: valorTotalCentavos,
    valor_pago_centavos: valorPagoCentavos,
    valor_aberto_centavos: valorAbertoCentavos,
    status: statusUpper,
    descricao: String(
      item.descricao || item.observacao || contatoObj?.nome || 'Lançamento Conta Azul'
    ).trim(),
    observacao: item.observacao || item.nota || item.evento?.observacao || null,
    numero_documento:
      item.numero_documento ||
      item.documento ||
      item.evento?.numero_documento ||
      null,
    conta_financeira_id:
      typeof contaFinObj === 'string'
        ? contaFinObj
        : contaFinObj?.id || null,
    conta_financeira_nome:
      typeof contaFinObj === 'object' && contaFinObj
        ? contaFinObj.nome || contaFinObj.descricao || null
        : null,
    categoria_id: catObj?.id || catObj?.id_categoria || null,
    categoria_nome: catObj?.nome || catObj?.nome_categoria || null,
    contato_id: contatoObj?.id || null,
    contato_nome: contatoObj?.nome || null,
    contato_cpf_cnpj:
      contatoObj?.cpf_cnpj || contatoObj?.cnpj || contatoObj?.cpf || null,
  }
}

/**
 * 3. Consulta Contas a Receber ou Contas a Pagar existentes no Conta Azul dentro do período informado (SOMENTE GET).
 */
export async function buscarLancamentosPorPeriodoSatelite(params: {
  accessToken: string
  tipo: 'RECEITA' | 'DESPESA'
  dataVencimentoDe: string // YYYY-MM-DD
  dataVencimentoAte: string // YYYY-MM-DD
}): Promise<LancamentoExistenteContaAzulDTO[]> {
  const { accessToken, tipo, dataVencimentoDe, dataVencimentoAte } = params
  const sufixoRota =
    tipo === 'RECEITA' ? 'contas-a-receber/buscar' : 'contas-a-pagar/buscar'
  const endpoint = `${BASE_URL}/financeiro/eventos-financeiros/${sufixoRota}`

  const resultados: LancamentoExistenteContaAzulDTO[] = []
  const TAMANHO_PAGINA = 100
  const MAX_PAGINAS = 10

  for (let page = 1; page <= MAX_PAGINAS; page++) {
    const url = `${endpoint}?pagina=${page}&tamanho_pagina=${TAMANHO_PAGINA}&data_vencimento_de=${encodeURIComponent(
      dataVencimentoDe
    )}&data_vencimento_ate=${encodeURIComponent(dataVencimentoAte)}`

    const res = await fetchSateliteGet(url, accessToken)
    if (!res.ok) {
      if (res.status === 401) throw new Error('TOKEN_EXPIRADO')
      break
    }

    const data = await res.json()
    const lista: Record<string, any>[] = data.itens || data.items || []
    if (lista.length === 0) break

    for (const raw of lista) {
      const normalizado = normalizarItemBuscaFinanceiraCA(raw, tipo)
      if (normalizado.id) {
        resultados.push(normalizado)
      }
    }

    if (lista.length < TAMANHO_PAGINA) break
  }

  return resultados
}

/**
 * 4. Avalia possíveis correspondências, duplicidades e ambiguidades para um valor esperado do lote Stone,
 * respeitando estritamente todas as regras da seção 7 da Etapa 1E:
 * - Valor e data isoladamente NUNCA autorizam vínculo ou baixa automática.
 * - Se encontrar identificador determinístico correspondente, apresenta a correspondência.
 * - Se encontrar mais de um candidato, apresenta todos e não escolhe automaticamente.
 * - Se encontrar lançamento já quitado, informa e impede que seja tratado como novo recebimento.
 * - Se não encontrar lançamento, informa que não foi localizado no período consultado.
 */
export function avaliarCandidatosLoteStoneNoContaAzul(params: {
  rotuloAlvo: string // Ex: "Receita Bruta (R$ 1.445,00)", "Despesa MDR (R$ 11,13)" ou "Depósito Líquido (R$ 1.433,87)"
  valorEsperadoCentavos: number
  dataAlvoIso: string // YYYY-MM-DD
  periodoDeIso: string // YYYY-MM-DD
  periodoAteIso: string // YYYY-MM-DD
  lancamentosNoPeriodo: LancamentoExistenteContaAzulDTO[]
  identificadoresDeterministicos?: string[] // Ex: stonecode, DCX-STONE, stone_ids
}): ResultadoTriagemItemLoteCA {
  const {
    rotuloAlvo,
    valorEsperadoCentavos,
    periodoDeIso,
    periodoAteIso,
    lancamentosNoPeriodo,
    identificadoresDeterministicos = [],
  } = params

  const formatarIsoBr = (iso: string) => {
    const partes = String(iso || '').split('-')
    return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : iso
  }

  const periodoLabel = `${formatarIsoBr(periodoDeIso)} a ${formatarIsoBr(periodoAteIso)}`

  if (valorEsperadoCentavos <= 0) {
    return {
      classificacao: 'NAO_LOCALIZADO_NO_PERIODO',
      autoriza_vinculo_automatico: false,
      ja_quitado: false,
      candidatos: [],
      mensagem: `Valor esperado igual a R$ 0,00 para ${rotuloAlvo}.`,
    }
  }

  // Filtrar lançamentos com o mesmo valor exato em centavos no período consultado
  const candidatosMesmoValor = lancamentosNoPeriodo.filter(
    (l) => l.valor_total_centavos === valorEsperadoCentavos
  )

  if (candidatosMesmoValor.length === 0) {
    return {
      classificacao: 'NAO_LOCALIZADO_NO_PERIODO',
      autoriza_vinculo_automatico: false,
      ja_quitado: false,
      candidatos: [],
      mensagem: `Nenhum lançamento de ${formatarCentavosBRL(
        valorEsperadoCentavos
      )} (${rotuloAlvo}) foi localizado no período consultado (${periodoLabel}). Observação: esta resposta reflete exclusivamente os limites do período consultado.`,
    }
  }

  // Verificar se algum candidato possui identificador determinístico na descrição, observação ou número de documento
  const idsValidos = identificadoresDeterministicos
    .map((id) => String(id || '').trim().toUpperCase())
    .filter((id) => id.length >= 4)

  const candidatosComIdDeterministico = candidatosMesmoValor.filter((cand) => {
    if (idsValidos.length === 0) return false
    const textoCompleto = [
      cand.descricao,
      cand.observacao,
      cand.numero_documento,
    ]
      .filter(Boolean)
      .join(' ')
      .toUpperCase()

    return idsValidos.some((idForte) => textoCompleto.includes(idForte))
  })

  if (candidatosComIdDeterministico.length === 1) {
    const unico = candidatosComIdDeterministico[0]
    const quitado =
      unico.status === 'QUITADO' ||
      unico.status === 'PAGO' ||
      unico.status === 'RECEBIDO' ||
      unico.valor_aberto_centavos <= 0

    if (quitado) {
      return {
        classificacao: 'JA_QUITADO_BLOQUEADO',
        autoriza_vinculo_automatico: false,
        ja_quitado: true,
        candidatos: [unico],
        mensagem: `Lançamento com identificador correspondente localizado (${unico.id}), porém já consta como ${unico.status} no Conta Azul. Impedido de ser tratado como novo recebimento para evitar duplicidade.`,
      }
    }

    return {
      classificacao: 'CORRESPONDENCIA_DETERMINISTICA',
      autoriza_vinculo_automatico: true,
      ja_quitado: false,
      candidatos: [unico],
      mensagem: `Correspondência determinística localizada (${unico.id}) para ${rotuloAlvo} com saldo em aberto no Conta Azul.`,
    }
  }

  // Se houver múltiplos candidatos (com ou sem identificador), apresentar todos e NUNCA escolher automaticamente
  if (candidatosMesmoValor.length > 1) {
    const algumQuitado = candidatosMesmoValor.some(
      (c) =>
        c.status === 'QUITADO' ||
        c.status === 'PAGO' ||
        c.valor_aberto_centavos <= 0
    )
    return {
      classificacao: 'MULTIPLOS_CANDIDATOS_CONFERENCIA_HUMANA',
      autoriza_vinculo_automatico: false,
      ja_quitado: algumQuitado,
      candidatos: candidatosMesmoValor,
      mensagem: `Foram encontrados ${candidatosMesmoValor.length} lançamentos candidatos de ${formatarCentavosBRL(
        valorEsperadoCentavos
      )} no período consultado (${periodoLabel}). Como há múltiplos candidatos, nenhum é escolhido automaticamente — todos estão listados abaixo para conferência humana.`,
    }
  }

  // Exatamente 1 candidato apenas por coincidência de Valor + Data (sem identificador determinístico)
  const candidatoUnicoValorData = candidatosMesmoValor[0]
  const quitado =
    candidatoUnicoValorData.status === 'QUITADO' ||
    candidatoUnicoValorData.status === 'PAGO' ||
    candidatoUnicoValorData.status === 'RECEBIDO' ||
    candidatoUnicoValorData.valor_aberto_centavos <= 0

  if (quitado) {
    return {
      classificacao: 'JA_QUITADO_BLOQUEADO',
      autoriza_vinculo_automatico: false,
      ja_quitado: true,
      candidatos: [candidatoUnicoValorData],
      mensagem: `Atenção (Possível Duplicidade): Foi localizado 1 lançamento de mesmo valor (${formatarCentavosBRL(
        valorEsperadoCentavos
      )}) na data ${formatarIsoBr(
        candidatoUnicoValorData.data_vencimento
      )} que JÁ ESTÁ ${candidatoUnicoValorData.status} no Conta Azul ("${candidatoUnicoValorData.descricao}"). Impedido de ser tratado automaticamente como novo recebimento.`,
    }
  }

  return {
    classificacao: 'CANDIDATO_VALOR_DATA_CONFERENCIA_HUMANA',
    autoriza_vinculo_automatico: false,
    ja_quitado: false,
    candidatos: [candidatoUnicoValorData],
    mensagem: `Possível correspondência apenas por Valor e Data ("${candidatoUnicoValorData.descricao}"). Como valor e data isoladamente não confirmam a identidade do lançamento, exige conferência humana obrigatória.`,
  }
}

/**
 * 5. Consolida a avaliação somente-leitura do período no Conta Azul para o filtro atual da Stone.
 */
export async function consultarAvaliacaoPeriodoStoneSatelite(params: {
  accessToken: string
  dataDeIso: string
  dataAteIso: string
  valorBrutoEsperadoCentavos?: number
  valorMdrEsperadoCentavos?: number
  valorLiquidoEsperadoCentavos?: number
  identificadoresDeterministicos?: string[]
}): Promise<AvaliacaoPeriodoContaAzulStoneDTO> {
  const {
    accessToken,
    dataDeIso,
    dataAteIso,
    valorBrutoEsperadoCentavos = 0,
    valorMdrEsperadoCentavos = 0,
    valorLiquidoEsperadoCentavos = 0,
    identificadoresDeterministicos = [],
  } = params

  const [receitas, despesas] = await Promise.all([
    buscarLancamentosPorPeriodoSatelite({
      accessToken,
      tipo: 'RECEITA',
      dataVencimentoDe: dataDeIso,
      dataVencimentoAte: dataAteIso,
    }),
    buscarLancamentosPorPeriodoSatelite({
      accessToken,
      tipo: 'DESPESA',
      dataVencimentoDe: dataDeIso,
      dataVencimentoAte: dataAteIso,
    }),
  ])

  const triagemReceitaBruta =
    valorBrutoEsperadoCentavos > 0
      ? avaliarCandidatosLoteStoneNoContaAzul({
          rotuloAlvo: 'Receita Bruta da Stone',
          valorEsperadoCentavos: valorBrutoEsperadoCentavos,
          dataAlvoIso: dataDeIso,
          periodoDeIso: dataDeIso,
          periodoAteIso: dataAteIso,
          lancamentosNoPeriodo: receitas,
          identificadoresDeterministicos,
        })
      : null

  const triagemDespesaMdr =
    valorMdrEsperadoCentavos > 0
      ? avaliarCandidatosLoteStoneNoContaAzul({
          rotuloAlvo: 'Despesa de MDR da Stone',
          valorEsperadoCentavos: valorMdrEsperadoCentavos,
          dataAlvoIso: dataDeIso,
          periodoDeIso: dataDeIso,
          periodoAteIso: dataAteIso,
          lancamentosNoPeriodo: despesas,
          identificadoresDeterministicos,
        })
      : null

  const triagemDepositoLiquido =
    valorLiquidoEsperadoCentavos > 0
      ? avaliarCandidatosLoteStoneNoContaAzul({
          rotuloAlvo: 'Valor Líquido Depositado (Receita pelo Líquido)',
          valorEsperadoCentavos: valorLiquidoEsperadoCentavos,
          dataAlvoIso: dataDeIso,
          periodoDeIso: dataDeIso,
          periodoAteIso: dataAteIso,
          lancamentosNoPeriodo: receitas,
          identificadoresDeterministicos,
        })
      : null

  return {
    periodo_consultado: {
      data_de: dataDeIso,
      data_ate: dataAteIso,
    },
    total_receitas_no_periodo: receitas.length,
    total_despesas_no_periodo: despesas.length,
    receitas_no_periodo: receitas,
    despesas_no_periodo: despesas,
    triagem_receita_bruta: triagemReceitaBruta,
    triagem_despesa_mdr: triagemDespesaMdr,
    triagem_deposito_liquido: triagemDepositoLiquido,
  }
}
