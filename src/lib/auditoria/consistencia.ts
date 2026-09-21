import { SupabaseClient } from '@supabase/supabase-js'

export interface FornecedorRegra {
  id: string
  empresa_id: string
  fornecedor_id_conta_azul?: string | null
  fornecedor_nome: string
  categoria_nome: string
  tipo_regra: 'PADRAO' | 'DIA_DO_MES' | 'MES_DO_ANO' | 'FAIXA_VALOR'
  valor_regra?: string | null
  prioridade: number
  ativo: boolean
  observacao?: string | null
  criado_por?: string | null
  created_at?: string
  updated_at?: string
}

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
  origem_decisao?: 'REGRA_DETERMINISTICA' | 'FALLBACK_ESTATISTICO'
  regra_id?: string | null
}

export interface FornecedorConsistenciaAudit {
  fornecedor_original: string
  fornecedor_normalizado: string
  fornecedor_id_conta_azul?: string | null
  total_lancamentos: number
  total_valor: number
  categoria_predominante: string
  categoria_padrao_oficial: string | null
  confianca_percentual: number
  is_multiescopo: boolean
  is_pessoal_rh: boolean
  status_governanca: 'VALIDADO' | 'PENDENTE' | 'DIVERGENTE'
  regra_ativa?: FornecedorRegra | null
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
  fonte_dados: 'CONTA_AZUL_ESPELHO' | 'IMPORTADAS_LOCAL'
  resumo: {
    total_lancamentos_auditados: number
    total_fornecedores_auditados: number
    fornecedores_consistentes: number
    fornecedores_com_divergencia: number
    fornecedores_pendentes: number
    fornecedores_multiescopo: number
    total_regras_ativas: number
    valor_total_auditado: number
    valor_total_divergente: number
    percentual_risco_financeiro: number
    taxa_conformidade_cadastral: number
  }
  fornecedores_divergentes: FornecedorConsistenciaAudit[]
  fornecedores_pendentes: FornecedorConsistenciaAudit[]
  fornecedores_validados: FornecedorConsistenciaAudit[]
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

export function normalizarTexto(texto: string | null | undefined): string {
  if (!texto) return ''
  return texto
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function classificarFaixaValor(valor: number): 'Micro (< R$ 150)' | 'Médio (R$ 150 - R$ 3k)' | 'Alto (> R$ 3k)' {
  if (valor < 150) return 'Micro (< R$ 150)'
  if (valor <= 3000) return 'Médio (R$ 150 - R$ 3k)'
  return 'Alto (> R$ 3k)'
}

/**
 * Avalia regras determinísticas cadastradas para o fornecedor
 * Prioridade 1: fornecedor_id_conta_azul
 * Prioridade 2: fornecedor_nome normalizado
 * Ordem de precedência de tipos: FAIXA_VALOR / DIA_DO_MES / MES_DO_ANO (prioridade alta) > PADRAO
 */
function avaliarRegraContextual(
  item: {
    fornecedor_id?: string | null
    fornecedor: string
    vencimento: string | null
    valor: number
  },
  regras: FornecedorRegra[],
  normKey: string
): FornecedorRegra | null {
  if (!regras || regras.length === 0) return null

  // Filtra regras ativas para este fornecedor
  const candidatas = regras.filter((r) => {
    if (item.fornecedor_id && r.fornecedor_id_conta_azul) {
      return r.fornecedor_id_conta_azul.trim() === item.fornecedor_id.trim()
    }
    const rNomeNorm = normalizarTexto(r.fornecedor_nome)
    return rNomeNorm === normKey || r.fornecedor_nome.toLowerCase().trim() === item.fornecedor.toLowerCase().trim()
  })

  if (candidatas.length === 0) return null

  // Itera pelas regras já ordenadas por prioridade decrescente
  for (const regra of candidatas) {
    if (regra.tipo_regra === 'DIA_DO_MES') {
      if (!item.vencimento) continue
      const dtParts = item.vencimento.split('T')[0].split('-')
      const dia = parseInt(dtParts[2], 10)
      if (isNaN(dia)) continue

      if (regra.valor_regra && regra.valor_regra.includes('-')) {
        const [dIniStr, dFimStr] = regra.valor_regra.split('-')
        const dIni = parseInt(dIniStr.trim(), 10)
        const dFim = parseInt(dFimStr.trim(), 10)
        if (!isNaN(dIni) && !isNaN(dFim) && dia >= dIni && dia <= dFim) {
          return regra
        }
      } else if (regra.valor_regra) {
        const diaAlvo = parseInt(regra.valor_regra.trim(), 10)
        if (dia === diaAlvo) return regra
      }
    } else if (regra.tipo_regra === 'MES_DO_ANO') {
      if (!item.vencimento) continue
      const dtParts = item.vencimento.split('T')[0].split('-')
      const mes = parseInt(dtParts[1], 10)
      if (isNaN(mes)) continue

      if (regra.valor_regra) {
        const mesesValidos = regra.valor_regra.split(',').map((m) => parseInt(m.trim(), 10))
        if (mesesValidos.includes(mes)) {
          return regra
        }
      }
    } else if (regra.tipo_regra === 'FAIXA_VALOR') {
      if (regra.valor_regra) {
        const valStr = regra.valor_regra.trim()
        if (valStr.startsWith('<=')) {
          const limite = parseFloat(valStr.replace('<=', '').trim())
          if (!isNaN(limite) && item.valor <= limite) return regra
        } else if (valStr.startsWith('<')) {
          const limite = parseFloat(valStr.replace('<', '').trim())
          if (!isNaN(limite) && item.valor < limite) return regra
        } else if (valStr.startsWith('>=')) {
          const limite = parseFloat(valStr.replace('>=', '').trim())
          if (!isNaN(limite) && item.valor >= limite) return regra
        } else if (valStr.startsWith('>')) {
          const limite = parseFloat(valStr.replace('>', '').trim())
          if (!isNaN(limite) && item.valor > limite) return regra
        }
      }
    } else if (regra.tipo_regra === 'PADRAO') {
      return regra
    }
  }

  return null
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

  // 1. Determinar intervalo da Base de Aprendizagem Histórica (dataInicioAprendizado)
  let dataInicioAprendizado: Date | null = null
  if (periodo === '3m') {
    dataInicioAprendizado = new Date()
    dataInicioAprendizado.setMonth(hoje.getMonth() - 3)
  } else if (periodo === '6m') {
    dataInicioAprendizado = new Date()
    dataInicioAprendizado.setMonth(hoje.getMonth() - 6)
  } else if (periodo === '12m') {
    dataInicioAprendizado = new Date()
    dataInicioAprendizado.setMonth(hoje.getMonth() - 12)
  }

  // 2. Parsear o Período Auditado (recebido via marco_zero como "YYYY-MM-DD" ou intervalo "YYYY-MM-DD:YYYY-MM-DD")
  let dataInicioAuditoria: string | null = null
  let dataFimAuditoria: string | null = null

  if (marco_zero && typeof marco_zero === 'string' && marco_zero.trim() !== '') {
    const limpo = marco_zero.trim()
    if (limpo.includes(':')) {
      const [ini, fim] = limpo.split(':')
      dataInicioAuditoria = ini && ini.trim() !== '' ? ini.trim() : null
      dataFimAuditoria = fim && fim.trim() !== '' ? fim.trim() : null
    } else if (limpo.includes('..')) {
      const [ini, fim] = limpo.split('..')
      dataInicioAuditoria = ini && ini.trim() !== '' ? ini.trim() : null
      dataFimAuditoria = fim && fim.trim() !== '' ? fim.trim() : null
    } else {
      dataInicioAuditoria = limpo
    }
  }

  // Helper para verificar se um lançamento pertence ao período a ser auditado
  const itemPertenceAoPeriodoAuditado = (vencimento: string | null): boolean => {
    if (!vencimento) return false
    if (!dataInicioAuditoria && !dataFimAuditoria) return true
    const dt = vencimento.split('T')[0]
    if (dataInicioAuditoria && dt < dataInicioAuditoria) return false
    if (dataFimAuditoria && dt > dataFimAuditoria) return false
    return true
  }

  // 3. Carregar Regras Ativas de Governança (Memória de Fornecedores)
  let regrasEmpresa: FornecedorRegra[] = []
  try {
    const { data: dadosRegras, error: errRegras } = await supabase
      .from('fornecedor_regras')
      .select('*')
      .eq('empresa_id', empresa_id)
      .eq('ativo', true)
      .order('prioridade', { ascending: false })

    if (!errRegras && dadosRegras) {
      regrasEmpresa = dadosRegras as FornecedorRegra[]
    }
  } catch (e) {
    console.warn('[consistencia] Tabela fornecedor_regras ainda não criada no Supabase, prosseguindo com fallback estatístico:', e)
  }

  // 4. Query prioritária: tabela espelho contas_pagar_contaazul_espelho
  let fonteUtilizada: 'CONTA_AZUL_ESPELHO' | 'IMPORTADAS_LOCAL' = 'CONTA_AZUL_ESPELHO'
  let lancamentosNormalizados: Array<{
    id: string
    doc: string | null
    descricao: string | null
    vencimento: string | null
    valor: number
    categoria: string
    status: string
    fornecedor: string
    fornecedor_id: string | null
  }> = []

    // 4. Query prioritária: tabela espelho contas_pagar_contaazul_espelho (com paginação e filtros diretamente no banco)
  const dadosEspelho: any[] = []
  const BATCH_SIZE = 1000
  let offsetEspelho = 0
  let temMaisEspelho = true
  let erroConsultaEspelho: any = null

  const dtInicioStr = dataInicioAprendizado ? dataInicioAprendizado.toISOString().split('T')[0] : null

  while (temMaisEspelho && offsetEspelho < 50000) {
    let q = supabase
      .from('contas_pagar_contaazul_espelho')
      .select('id, numero_documento, descricao, data_vencimento, valor, categoria_nome, status, fornecedor_nome, fornecedor_id')
      .eq('empresa_id', empresa_id)
      .gt('valor', 0)
      .not('categoria_nome', 'is', null)
      .order('data_vencimento', { ascending: false })
      .range(offsetEspelho, offsetEspelho + BATCH_SIZE - 1)

    if (dtInicioStr) {
      q = q.gte('data_vencimento', dtInicioStr)
    }

    const { data, error } = await q
    if (error) {
      erroConsultaEspelho = error
      break
    }

    if (data && data.length > 0) {
      dadosEspelho.push(...data)
      if (data.length < BATCH_SIZE) {
        temMaisEspelho = false
      } else {
        offsetEspelho += BATCH_SIZE
      }
    } else {
      temMaisEspelho = false
    }
  }

  if (!erroConsultaEspelho && dadosEspelho.length > 0) {
    fonteUtilizada = 'CONTA_AZUL_ESPELHO'
    lancamentosNormalizados = dadosEspelho
      .filter((l) => l.fornecedor_nome && l.categoria_nome && Number(l.valor) > 0)
      .map((l) => ({
        id: l.id,
        doc: l.numero_documento,
        descricao: l.descricao,
        vencimento: l.data_vencimento,
        valor: Number(l.valor),
        categoria: l.categoria_nome,
        status: l.status,
        fornecedor: l.fornecedor_nome,
        fornecedor_id: l.fornecedor_id || null
      }))
  } else {
    // Fallback gracioso para contas_pagar_importadas com paginação e filtros
    fonteUtilizada = 'IMPORTADAS_LOCAL'
    const dadosImportadas: any[] = []
    let offsetImp = 0
    let temMaisImp = true
    let erroConsultaImp: any = null

    while (temMaisImp && offsetImp < 50000) {
      let qImp = supabase
        .from('contas_pagar_importadas')
        .select('id, doc, descricao, vencimento, valor, categoria, status, fornecedor')
        .eq('empresa_id', empresa_id)
        .gt('valor', 0)
        .not('categoria', 'is', null)
        .order('vencimento', { ascending: false })
        .range(offsetImp, offsetImp + BATCH_SIZE - 1)

      if (dtInicioStr) {
        qImp = qImp.gte('vencimento', dtInicioStr)
      }

      const { data, error } = await qImp
      if (error) {
        erroConsultaImp = error
        break
      }

      if (data && data.length > 0) {
        dadosImportadas.push(...data)
        if (data.length < BATCH_SIZE) {
          temMaisImp = false
        } else {
          offsetImp += BATCH_SIZE
        }
      } else {
        temMaisImp = false
      }
    }

    if (erroConsultaImp) {
      throw new Error(`Erro ao carregar dados locais: ${erroConsultaImp.message}`)
    }

    lancamentosNormalizados = dadosImportadas
      .filter((l) => l.fornecedor && l.categoria && Number(l.valor) > 0)
      .map((l) => ({
        id: l.id,
        doc: l.doc,
        descricao: l.descricao,
        vencimento: l.vencimento,
        valor: Number(l.valor),
        categoria: l.categoria,
        status: l.status,
        fornecedor: l.fornecedor,
        fornecedor_id: null
      }))
  }

  // 5. Carregar categorias padrão oficiais de fornecedores_contaazul
  const { data: fornecedoresContaAzul } = await supabase
    .from('fornecedores_contaazul')
    .select('nome, categoria_padrao')
    .eq('empresa_id', empresa_id)

  const mapaCategoriasPadrao = new Map<string, string>()
  if (fornecedoresContaAzul) {
    for (const f of fornecedoresContaAzul) {
      if (f.nome && f.categoria_padrao) {
        mapaCategoriasPadrao.set(normalizarTexto(f.nome), f.categoria_padrao)
      }
    }
  }

  // 6. Agrupar lançamentos por fornecedor normalizado
  const gruposFornecedor = new Map<
    string,
    {
      nomeOriginal: string
      nomeNormalizado: string
      fornecedorId: string | null
      items: typeof lancamentosNormalizados
    }
  >()

  for (const l of lancamentosNormalizados) {
    const norm = normalizarTexto(l.fornecedor)
    if (!norm) continue

    let grupo = gruposFornecedor.get(norm)
    if (!grupo) {
      grupo = {
        nomeOriginal: l.fornecedor,
        nomeNormalizado: norm,
        fornecedorId: l.fornecedor_id || null,
        items: []
      }
      gruposFornecedor.set(norm, grupo)
    } else if (!grupo.fornecedorId && l.fornecedor_id) {
      grupo.fornecedorId = l.fornecedor_id
    }
    grupo.items.push(l)
  }

  // 7. Analisar cada fornecedor (GOVERNANÇA: 1. REGRA -> 2. ESTATÍSTICA -> 3. PENDENTE)
  const divergentes: FornecedorConsistenciaAudit[] = []
  const pendentes: FornecedorConsistenciaAudit[] = []
  const validados: FornecedorConsistenciaAudit[] = []
  const multiescopos: FornecedorConsistenciaAudit[] = []
  const consistentesAmostra: FornecedorConsistenciaAudit[] = []

  let totalLancamentosAuditados = 0
  let totalFornecedoresAuditados = 0
  let fornecedoresConsistentesCount = 0
  let valorTotalAuditado = 0
  let valorTotalDivergente = 0

  for (const [normKey, grupo] of gruposFornecedor.entries()) {
    const countItemsHistorico = grupo.items.length

    // Filtrar apenas os lançamentos que pertencem ao período auditado
    const itemsAuditados = grupo.items.filter((item) => itemPertenceAoPeriodoAuditado(item.vencimento))
    if (itemsAuditados.length === 0) {
      continue
    }

    const countItemsAuditados = itemsAuditados.length
    const valorSomaAuditado = itemsAuditados.reduce((acc, item) => acc + item.valor, 0)

    totalLancamentosAuditados += countItemsAuditados
    totalFornecedoresAuditados++
    valorTotalAuditado += valorSomaAuditado

    // Checar se há regras ativas cadastradas para este fornecedor
    const regrasDoFornecedor = regrasEmpresa.filter((r) => {
      if (grupo.fornecedorId && r.fornecedor_id_conta_azul) {
        return r.fornecedor_id_conta_azul.trim() === grupo.fornecedorId.trim()
      }
      const rNomeNorm = normalizarTexto(r.fornecedor_nome)
      return rNomeNorm === normKey || r.fornecedor_nome.toLowerCase().trim() === grupo.nomeOriginal.toLowerCase().trim()
    })

    const catPadraoOficial = mapaCategoriasPadrao.get(normKey) || null
    const isPessoalRh = PALAVRAS_CHAVE_PESSOAL.some((kw) => normKey.includes(kw))

    // Calcular estatística histórica como suporte/fallback
    const statsPorCategoria = new Map<
      string,
      {
        categoria: string
        quantidade: number
        valorTotal: number
        scorePonderado: number
      }
    >()

    let scoreTotalPonderado = 0
    for (const item of grupo.items) {
      const cat = item.categoria.trim()
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
      stat.valorTotal += item.valor

      let pesoItem = 1.0
      if (item.vencimento) {
        const diffMs = hoje.getTime() - new Date(item.vencimento).getTime()
        const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24))
        if (diffDias <= 90) pesoItem = 2.0
        else if (diffDias <= 180) pesoItem = 1.5
      }
      if (catPadraoOficial && normalizarTexto(cat) === normalizarTexto(catPadraoOficial)) {
        pesoItem *= 1.2
      }
      stat.scorePonderado += pesoItem
      scoreTotalPonderado += pesoItem
    }

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
    const isMultiescopo = distribuicao.length >= 3 && confiancaPredominante < 75

    // ============================================================
    // CASO 1: FORNECEDOR COM REGRA CONTÁBIL CADASTRADA (GOVERNANÇA)
    // ============================================================
    if (regrasDoFornecedor.length > 0) {
      const regraPadrao = regrasDoFornecedor.find((r) => r.tipo_regra === 'PADRAO') || regrasDoFornecedor[0]
      const auditData: FornecedorConsistenciaAudit = {
        fornecedor_original: grupo.nomeOriginal,
        fornecedor_normalizado: normKey,
        fornecedor_id_conta_azul: grupo.fornecedorId,
        total_lancamentos: countItemsAuditados,
        total_valor: valorSomaAuditado,
        categoria_predominante: regraPadrao.categoria_nome,
        categoria_padrao_oficial: catPadraoOficial,
        confianca_percentual: 100, // Regra validada pelo usuário = 100% certeza
        is_multiescopo: false,
        is_pessoal_rh: isPessoalRh,
        status_governanca: 'VALIDADO',
        regra_ativa: regraPadrao,
        distribuicao_categorias: distribuicao,
        divergencias: []
      }

      for (const item of itemsAuditados) {
        const regraAplicavel = avaliarRegraContextual(item, regrasDoFornecedor, normKey)
        const categoriaEsperada = regraAplicavel ? regraAplicavel.categoria_nome : regraPadrao.categoria_nome
        const catItem = item.categoria.trim()

        if (normalizarTexto(catItem) !== normalizarTexto(categoriaEsperada)) {
          const faixa = classificarFaixaValor(item.valor)
          const divergencia: LancamentoDivergente = {
            id: item.id,
            doc: item.doc,
            descricao: item.descricao,
            vencimento: item.vencimento,
            valor: item.valor,
            categoria_atual: catItem,
            categoria_esperada: categoriaEsperada,
            confianca: 100,
            status: item.status || 'pendente',
            criticidade: 'CRITICA', // Violação de regra aprovada = criticidade máxima
            motivo: regraAplicavel?.tipo_regra === 'PADRAO'
              ? `Regra Homologada: fornecedor possui categoria padrão "${categoriaEsperada}".`
              : `Regra de ${regraAplicavel?.tipo_regra} (${regraAplicavel?.valor_regra}): categoria esperada é "${categoriaEsperada}".`,
            faixa_valor: faixa,
            origem_decisao: 'REGRA_DETERMINISTICA',
            regra_id: regraAplicavel?.id || regraPadrao.id
          }

          auditData.divergencias.push(divergencia)
          valorTotalDivergente += divergencia.valor
        }
      }

      if (auditData.divergencias.length > 0) {
        auditData.status_governanca = 'DIVERGENTE'
        divergentes.push(auditData)
      } else {
        auditData.status_governanca = 'VALIDADO'
        validados.push(auditData)
        fornecedoresConsistentesCount++
      }
      continue
    }

    // ============================================================
    // CASO 2: SEM REGRA -> FALLBACK ESTATÍSTICO HEURÍSTICO
    // ============================================================
    const auditDataEstatistico: FornecedorConsistenciaAudit = {
      fornecedor_original: grupo.nomeOriginal,
      fornecedor_normalizado: normKey,
      fornecedor_id_conta_azul: grupo.fornecedorId,
      total_lancamentos: countItemsAuditados,
      total_valor: valorSomaAuditado,
      categoria_predominante: catPredominanteObj ? catPredominanteObj.categoria : 'Indefinida',
      categoria_padrao_oficial: catPadraoOficial,
      confianca_percentual: confiancaPredominante,
      is_multiescopo: isMultiescopo,
      is_pessoal_rh: isPessoalRh,
      status_governanca: 'PENDENTE',
      regra_ativa: null,
      distribuicao_categorias: distribuicao,
      divergencias: []
    }

    // Se histórico for insuficiente (< amostra_minima), entra como PENDENTE DE VALIDAÇÃO
    if (countItemsHistorico < amostra_minima) {
      auditDataEstatistico.status_governanca = 'PENDENTE'
      pendentes.push(auditDataEstatistico)
      continue
    }

    if (isMultiescopo) {
      multiescopos.push(auditDataEstatistico)
      continue
    }

    if (confiancaPredominante >= confianca_minima) {
      for (const item of itemsAuditados) {
        const catItem = item.categoria.trim()
        if (normalizarTexto(catItem) !== normalizarTexto(catPredominanteObj.categoria)) {
          if (isPessoalRh) {
            const descNorm = normalizarTexto(item.descricao)
            const isDescRh = PALAVRAS_CHAVE_PESSOAL.some((kw) => descNorm.includes(kw))
            if (isDescRh) continue
          }

          let criticidade: 'ATENCAO' | 'ALTA' | 'CRITICA' = 'ATENCAO'
          if (confiancaPredominante > 97) criticidade = 'CRITICA'
          else if (confiancaPredominante >= 90) criticidade = 'ALTA'

          const faixa = classificarFaixaValor(item.valor)
          const divergencia: LancamentoDivergente = {
            id: item.id,
            doc: item.doc,
            descricao: item.descricao,
            vencimento: item.vencimento,
            valor: item.valor,
            categoria_atual: catItem,
            categoria_esperada: catPredominanteObj.categoria,
            confianca: confiancaPredominante,
            status: item.status || 'pendente',
            criticidade,
            motivo: `Histórico possui ${confiancaPredominante}% de concentração em "${catPredominanteObj.categoria}" (${catPredominanteObj.quantidade} lançamentos).`,
            faixa_valor: faixa,
            origem_decisao: 'FALLBACK_ESTATISTICO'
          }

          auditDataEstatistico.divergencias.push(divergencia)
          valorTotalDivergente += divergencia.valor
        }
      }
    }

    if (auditDataEstatistico.divergencias.length > 0) {
      auditDataEstatistico.status_governanca = 'DIVERGENTE'
      divergentes.push(auditDataEstatistico)
    } else {
      // Se não tem regra formal mas teve consistência estatística, entra como pendente de homologação com sugestão
      auditDataEstatistico.status_governanca = 'PENDENTE'
      pendentes.push(auditDataEstatistico)
      fornecedoresConsistentesCount++
    }
  }

  divergentes.sort((a, b) => {
    const somaA = a.divergencias.reduce((acc, d) => acc + d.valor, 0)
    const somaB = b.divergencias.reduce((acc, d) => acc + d.valor, 0)
    return somaB - somaA
  })

  pendentes.sort((a, b) => b.total_valor - a.total_valor)

  const percentualRisco =
    valorTotalAuditado > 0 ? Number(((valorTotalDivergente / valorTotalAuditado) * 100).toFixed(2)) : 0
  const taxaConformidade =
    totalFornecedoresAuditados > 0
      ? Number(((fornecedoresConsistentesCount / totalFornecedoresAuditados) * 100).toFixed(1))
      : 100

  return {
    fonte_dados: fonteUtilizada,
    resumo: {
      total_lancamentos_auditados: totalLancamentosAuditados,
      total_fornecedores_auditados: totalFornecedoresAuditados,
      fornecedores_consistentes: fornecedoresConsistentesCount,
      fornecedores_com_divergencia: divergentes.length,
      fornecedores_pendentes: pendentes.length,
      fornecedores_multiescopo: multiescopos.length,
      total_regras_ativas: regrasEmpresa.length,
      valor_total_auditado: valorTotalAuditado,
      valor_total_divergente: valorTotalDivergente,
      percentual_risco_financeiro: percentualRisco,
      taxa_conformidade_cadastral: taxaConformidade
    },
    fornecedores_divergentes: divergentes,
    fornecedores_pendentes: pendentes,
    fornecedores_validados: validados,
    fornecedores_multiescopo: multiescopos,
    fornecedores_consistentes_amostra: consistentesAmostra
  }
}
