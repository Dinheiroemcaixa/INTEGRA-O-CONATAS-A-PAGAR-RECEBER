import { SupabaseClient } from '@supabase/supabase-js'

export interface ConsistenciaOptions {
  empresa_id: string
  periodo?: '3m' | '6m' | '12m' | 'todos'
  marco_zero?: string | null
  confianca_minima?: number // Default: 80 (%)
  amostra_minima?: number // Default: 3
}

export interface LancamentoDivergente {
  id: string
  doc: string | null
  descricao: string | null
  vencimento: string | null
  valor: number
  categoria_atual: string
  categoria_esperada: string
  confianca: number
  status: string
  criticidade: 'ATENCAO' | 'ALTA' | 'CRITICA'
  motivo: string
  faixa_valor: 'Micro (< R$ 150)' | 'Médio (R$ 150 - R$ 3k)' | 'Alto (> R$ 3k)'
}

export interface FornecedorConsistenciaAudit {
  fornecedor_original: string
  fornecedor_normalizado: string
  total_lancamentos: number
  total_valor: number
  categoria_predominante: string
  categoria_padrao_oficial: string | null
  confianca_percentual: number
  is_multiescopo: boolean
  is_pessoal_rh: boolean
  distribuicao_categorias: {
    categoria: string
    quantidade: number
    valor_total: number
    score_ponderado: number
    percentual: number
  }[]
  divergencias: LancamentoDivergente[]
}

export interface ConsistenciaResult {
  resumo: {
    total_lancamentos_auditados: number
    total_fornecedores_auditados: number
    fornecedores_consistentes: number
    fornecedores_com_divergencia: number
    fornecedores_multiescopo: number
    valor_total_auditado: number
    valor_total_divergente: number
    percentual_risco_financeiro: number
    taxa_conformidade_cadastral: number
  }
  fornecedores_divergentes: FornecedorConsistenciaAudit[]
  fornecedores_multiescopo: FornecedorConsistenciaAudit[]
  fornecedores_consistentes_amostra: FornecedorConsistenciaAudit[]
}

const PALAVRAS_CHAVE_PESSOAL = [
  'SALARIO', 'SALÁRIO', 'FERIAS', 'FÉRIAS', '13', 'DECIMO', 'DÉCIMO',
  'ADIANTAMENTO', 'PRO-LABORE', 'PRO LABORE', 'PRÓ-LABORE', 'GRATIFICACAO',
  'GRATIFICAÇÃO', 'RESCISAO', 'RESCISÃO', 'INSS', 'FGTS', 'VALE',
  'ALIMENTACAO', 'ALIMENTAÇÃO', 'REFEICAO', 'REFEIÇÃO', 'TRANSPORTE',
  'FOLHA', 'COMISSAO', 'COMISSÃO', 'BENEFICIO', 'BENEFÍCIO'
]

export function normalizarTexto(str: string | null | undefined): string {
  if (!str) return ''
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
}

function classificarFaixaValor(valor: number): 'Micro (< R$ 150)' | 'Médio (R$ 150 - R$ 3k)' | 'Alto (> R$ 3k)' {
  if (valor < 150) return 'Micro (< R$ 150)'
  if (valor <= 3000) return 'Médio (R$ 150 - R$ 3k)'
  return 'Alto (> R$ 3k)'
}

function calcularPesoRecencia(vencimento: string | null, hoje: Date): number {
  if (!vencimento) return 1.0
  const dataVenc = new Date(vencimento)
  if (isNaN(dataVenc.getTime())) return 1.0
  const diffDias = Math.floor((hoje.getTime() - dataVenc.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDias <= 60) return 4.0
  if (diffDias <= 180) return 2.0
  return 1.0
}

function calcularPesoStatus(status: string | null): number {
  if (!status) return 1.0
  const st = status.toLowerCase()
  if (st === 'enviado' || st === 'concluido' || st === 'pago') return 2.5
  if (st === 'pendente') return 1.0
  return 0.0 // erro, cancelado ou outros
}

export async function executarConsistencia(
  supabase: SupabaseClient,
  options: ConsistenciaOptions
): Promise<ConsistenciaResult> {
  const {
    empresa_id,
    periodo = '12m',
    marco_zero = null,
    confianca_minima = 80,
    amostra_minima = 3
  } = options

  const hoje = new Date()

  // 1. Determinar filtro de data baseado no período
  let dataInicio: Date | null = null
  if (periodo === '3m') {
    dataInicio = new Date()
    dataInicio.setMonth(hoje.getMonth() - 3)
  } else if (periodo === '6m') {
    dataInicio = new Date()
    dataInicio.setMonth(hoje.getMonth() - 6)
  } else if (periodo === '12m') {
    dataInicio = new Date()
    dataInicio.setMonth(hoje.getMonth() - 12)
  }

  // 2. Query de lançamentos históricos na tabela contas_pagar_importadas
  let query = supabase
    .from('contas_pagar_importadas')
    .select('id, doc, descricao, vencimento, valor, categoria, status, fornecedor')
    .eq('empresa_id', empresa_id)

  if (marco_zero) {
    query = query.gte('vencimento', marco_zero)
  }
  if (dataInicio) {
    const dataIso = dataInicio.toISOString().split('T')[0]
    query = query.gte('vencimento', dataIso)
  }

  const { data: lancamentosRaw, error: errLancamentos } = await query

  if (errLancamentos) {
    throw new Error(`Erro ao buscar lançamentos: ${errLancamentos.message}`)
  }

  const lancamentos = (lancamentosRaw || []).filter(
    (l) => l.fornecedor && l.categoria && Number(l.valor) > 0
  )

  // 3. Buscar categorias padrão oficiais em fornecedores_contaazul
  const { data: fornecedoresContaAzul } = await supabase
    .from('fornecedores_contaazul')
    .select('nome, categoria_padrao, cnpj')
    .eq('empresa_id', empresa_id)

  const mapaCategoriasPadrao = new Map<string, string>()
  if (fornecedoresContaAzul) {
    for (const f of fornecedoresContaAzul) {
      if (f.nome && f.categoria_padrao) {
        mapaCategoriasPadrao.set(normalizarTexto(f.nome), f.categoria_padrao)
      }
    }
  }

  // 4. Agrupar lançamentos por fornecedor normalizado
  const gruposFornecedor = new Map<
    string,
    {
      nomeOriginal: string
      nomeNormalizado: string
      items: typeof lancamentos
    }
  >()

  for (const l of lancamentos) {
    const norm = normalizarTexto(l.fornecedor)
    if (!norm) continue

    let grupo = gruposFornecedor.get(norm)
    if (!grupo) {
      grupo = {
        nomeOriginal: l.fornecedor,
        nomeNormalizado: norm,
        items: []
      }
      gruposFornecedor.set(norm, grupo)
    }
    grupo.items.push(l)
  }

  // 5. Analisar cada fornecedor
  const divergentes: FornecedorConsistenciaAudit[] = []
  const multiescopos: FornecedorConsistenciaAudit[] = []
  const consistentesAmostra: FornecedorConsistenciaAudit[] = []

  let totalLancamentosAuditados = 0
  let totalFornecedoresAuditados = 0
  let fornecedoresConsistentesCount = 0
  let valorTotalAuditado = 0
  let valorTotalDivergente = 0

  for (const [normKey, grupo] of gruposFornecedor.entries()) {
    const countItems = grupo.items.length
    const valorSomaGrupo = grupo.items.reduce((acc, item) => acc + Number(item.valor || 0), 0)

    totalLancamentosAuditados += countItems
    totalFornecedoresAuditados++
    valorTotalAuditado += valorSomaGrupo

    // Se não atinge a amostra mínima, não gera divergência estatística confiável
    if (countItems < amostra_minima) {
      fornecedoresConsistentesCount++
      continue
    }

    const catPadraoOficial = mapaCategoriasPadrao.get(normKey) || null

    // Verificar se fornecedor ou lançamentos pertencem à macrofamília DESPESAS_COM_PESSOAL
    const isPessoalRh =
      PALAVRAS_CHAVE_PESSOAL.some((kw) => normKey.includes(kw)) ||
      grupo.items.some((item) =>
        PALAVRAS_CHAVE_PESSOAL.some(
          (kw) =>
            normalizarTexto(item.descricao).includes(kw) ||
            normalizarTexto(item.categoria).includes(kw)
        )
      )

    // Agrupar categorias com score ponderado
    const statsPorCategoria = new Map<
      string,
      {
        categoria: string
        quantidade: number
        valorTotal: number
        scorePonderado: number
      }
    >()

    for (const item of grupo.items) {
      const cat = item.categoria.trim()
      const pRecencia = calcularPesoRecencia(item.vencimento, hoje)
      const pStatus = calcularPesoStatus(item.status)
      const pesoItem = pRecencia * (pStatus > 0 ? pStatus : 0.5)

      let stat = statsPorCategoria.get(cat)
      if (!stat) {
        stat = {
          categoria: cat,
          quantidade: 0,
          valorTotal: 0,
          scorePonderado: 0
        }
        statsPorCategoria.set(cat, stat)
      }
      stat.quantidade++
      stat.valorTotal += Number(item.valor || 0)
      stat.scorePonderado += pesoItem
    }

    // Aplicar bônus da Categoria Padrão Oficial do Conta Azul (+20% se houver)
    let scoreTotalPonderado = 0
    for (const stat of statsPorCategoria.values()) {
      if (catPadraoOficial && normalizarTexto(stat.categoria) === normalizarTexto(catPadraoOficial)) {
        stat.scorePonderado *= 1.2
      }
      scoreTotalPonderado += stat.scorePonderado
    }

    // Ordenar categorias por score ponderado
    const distribuicao = Array.from(statsPorCategoria.values()).map((stat) => ({
      categoria: stat.categoria,
      quantidade: stat.quantidade,
      valor_total: stat.valorTotal,
      score_ponderado: stat.scorePonderado,
      percentual: scoreTotalPonderado > 0 ? Math.round((stat.scorePonderado / scoreTotalPonderado) * 100) : 0
    }))
    distribuicao.sort((a, b) => b.score_ponderado - a.score_ponderado)

    const catPredominanteObj = distribuicao[0]
    const confiancaPredominante = catPredominanteObj ? catPredominanteObj.percentual : 0

    // Detecção de Multiescopo: 3 ou mais categorias e nenhuma atinge 75%
    const isMultiescopo = distribuicao.length >= 3 && confiancaPredominante < 75

    const auditData: FornecedorConsistenciaAudit = {
      fornecedor_original: grupo.nomeOriginal,
      fornecedor_normalizado: normKey,
      total_lancamentos: countItems,
      total_valor: valorSomaGrupo,
      categoria_predominante: catPredominanteObj ? catPredominanteObj.categoria : 'Indefinida',
      categoria_padrao_oficial: catPadraoOficial,
      confianca_percentual: confiancaPredominante,
      is_multiescopo: isMultiescopo,
      is_pessoal_rh: isPessoalRh,
      distribuicao_categorias: distribuicao,
      divergencias: []
    }

    if (isMultiescopo) {
      multiescopos.push(auditData)
      continue
    }

    // Se a confiança atinge o mínimo (default 80%), detectar lançamentos divergentes
    if (confiancaPredominante >= confianca_minima) {
      for (const item of grupo.items) {
        const catItem = item.categoria.trim()
        if (catItem !== catPredominanteObj.categoria) {
          // Macrofamília de Pessoal: se for folha/benefícios/salário, não considerar divergência
          if (isPessoalRh) {
            const descNorm = normalizarTexto(item.descricao)
            const isDescRh = PALAVRAS_CHAVE_PESSOAL.some((kw) => descNorm.includes(kw))
            if (isDescRh) continue
          }

          let criticidade: 'ATENCAO' | 'ALTA' | 'CRITICA' = 'ATENCAO'
          if (confiancaPredominante > 97) criticidade = 'CRITICA'
          else if (confiancaPredominante >= 90) criticidade = 'ALTA'

          const faixa = classificarFaixaValor(Number(item.valor || 0))
          const divergencia: LancamentoDivergente = {
            id: item.id,
            doc: item.doc,
            descricao: item.descricao,
            vencimento: item.vencimento,
            valor: Number(item.valor || 0),
            categoria_atual: catItem,
            categoria_esperada: catPredominanteObj.categoria,
            confianca: confiancaPredominante,
            status: item.status || 'pendente',
            criticidade,
            motivo: `Histórico possui ${confiancaPredominante}% de concentração em "${catPredominanteObj.categoria}" (${catPredominanteObj.quantidade} lançamentos).`,
            faixa_valor: faixa
          }

          auditData.divergencias.push(divergencia)
          valorTotalDivergente += divergencia.valor
        }
      }
    }

    if (auditData.divergencias.length > 0) {
      divergentes.push(auditData)
    } else {
      fornecedoresConsistentesCount++
      if (consistentesAmostra.length < 15) {
        consistentesAmostra.push(auditData)
      }
    }
  }

  // Ordenar divergentes por valor total divergente decrescente
  divergentes.sort((a, b) => {
    const somaA = a.divergencias.reduce((acc, d) => acc + d.valor, 0)
    const somaB = b.divergencias.reduce((acc, d) => acc + d.valor, 0)
    return somaB - somaA
  })

  const percentualRisco =
    valorTotalAuditado > 0 ? Number(((valorTotalDivergente / valorTotalAuditado) * 100).toFixed(2)) : 0
  const taxaConformidade =
    totalFornecedoresAuditados > 0
      ? Number(((fornecedoresConsistentesCount / totalFornecedoresAuditados) * 100).toFixed(1))
      : 100

  return {
    resumo: {
      total_lancamentos_auditados: totalLancamentosAuditados,
      total_fornecedores_auditados: totalFornecedoresAuditados,
      fornecedores_consistentes: fornecedoresConsistentesCount,
      fornecedores_com_divergencia: divergentes.length,
      fornecedores_multiescopo: multiescopos.length,
      valor_total_auditado: valorTotalAuditado,
      valor_total_divergente: valorTotalDivergente,
      percentual_risco_financeiro: percentualRisco,
      taxa_conformidade_cadastral: taxaConformidade
    },
    fornecedores_divergentes: divergentes,
    fornecedores_multiescopo: multiescopos,
    fornecedores_consistentes_amostra: consistentesAmostra
  }
}
