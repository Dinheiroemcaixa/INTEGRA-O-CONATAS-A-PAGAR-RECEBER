import { createClient } from '@supabase/supabase-js'

export type StatusJustificativa = 'PENDENTE' | 'JUSTIFICADA' | 'CORRIGIDA' | 'VALIDADA'

export interface ItemAuditoriaCategoria {
  id: string
  contaAzulId?: string | null
  fornecedor: string
  categoriaEsperada: string
  categoriaAtual: string
  percentualConfianca: number
  totalHistoricoFornecedor: number
  status: 'divergente' | 'consistente' | 'novo_fornecedor'
  valor: number
  dataCompetencia: string
  dataVencimento?: string | null
  descricao?: string | null
  statusDivergencia?: StatusJustificativa
  motivoJustificativa?: string | null
  justificadoPor?: string | null
  justificadoEm?: string | null
  validadoPor?: string | null
  validadoEm?: string | null
}

export interface ResumoAuditoriaCategorias {
  totalAuditado: number
  totalConsistentes: number
  totalDivergentes: number
  totalNovosFornecedores: number
  totalPendentes: number
  totalJustificadas: number
  totalCorrigidas: number
  totalValidadas: number
  valorTotalAuditado: number
  valorTotalDivergente: number
  taxaDivergencia: number
  periodoAuditado: {
    inicio: string
    fim: string
  }
  periodoHistoricoAprendizado: {
    inicio: string
    fim: string
  }
  itens: ItemAuditoriaCategoria[]
}

/**
 * Subtrai exatamente N meses de uma data no formato YYYY-MM-DD
 */
export function subtrairMeses(dataIso: string, meses: number): string {
  const [ano, mes, dia] = dataIso.split('-').map(Number)
  const d = new Date(ano, mes - 1 - meses, dia || 1)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/**
 * Normaliza nomes de strings para comparação confiável
 */
export function normalizarTexto(texto?: string | null): string {
  if (!texto) return ''
  return texto
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/**
 * Constantes de Whitelist para Redução de Falsos Positivos (Fase 1)
 */
export const WHITELIST_CAJU = [
  'vale-alimentacao',
  'vale alimentacao',
  'vale-transporte',
  'vale transporte',
  'gratificacoes',
  'gratificacao'
]

export const WHITELIST_CLT = [
  'salarios',
  'salario',
  'adiantamento salarial',
  'ferias',
  '13o salario - 1a parcela',
  '13o salario 1a parcela',
  '13 salario - 1 parcela',
  '13 salario 1 parcela',
  '13o salario',
  '13o salario - 2a parcela',
  '13o salario 2a parcela',
  '13 salario - 2 parcela',
  '13 salario 2 parcela',
  'rescisao',
  'rescisoes',
  'gratificacoes',
  'gratificacao',
  'vale-alimentacao',
  'vale alimentacao',
  'vale-transporte',
  'vale transporte',
  'fgts e multa de fgts',
  'fgts'
]

/**
 * Identifica se o fornecedor corresponde à plataforma de benefícios CAJU
 */
export function isCajuFornecedor(fornecedorNome?: string | null): boolean {
  if (!fornecedorNome) return false
  const norm = normalizarTexto(fornecedorNome)
  return /^caju(\s|$)/.test(norm) || /(\s|^)caju(\s|$)/.test(norm)
}

/**
 * Identifica se o fornecedor possui perfil de colaborador/funcionário CLT
 * através do histórico de categorias típicas de folha de pagamento
 */
export function isCltFornecedor(fornecedorNome?: string | null, categoriasHistorico?: string[]): boolean {
  if (!fornecedorNome || isCajuFornecedor(fornecedorNome)) return false
  if (categoriasHistorico && categoriasHistorico.length > 0) {
    for (const cat of categoriasHistorico) {
      const cNorm = normalizarTexto(cat)
      if (
        cNorm.includes('salario') ||
        cNorm.includes('adiantamento salarial') ||
        cNorm.includes('rescis') ||
        cNorm.includes('ferias') ||
        cNorm.includes('13')
      ) {
        return true
      }
    }
  }
  return false
}

/**
 * Extrai de forma segura o dia do mês de uma string no formato YYYY-MM-DD
 */
export function extrairDiaDoMes(dataIso?: string | null): number {
  if (!dataIso) return 0
  const partes = dataIso.split('-')
  if (partes.length >= 3) {
    return parseInt(partes[2], 10) || 0
  }
  return 0
}

/**
 * Constantes de Whitelist para Fase 2A (Multi-Tributos e Multi-Adquirentes)
 */
export const WHITELIST_RECEITA_FEDERAL = [
  'inss sobre salarios - gps',
  'inss sobre salarios',
  'inss',
  'pis/cofins',
  'pis / cofins',
  'pis',
  'cofins',
  'darf previdenciario',
  'darf prev',
  'darf',
  'irrf',
  'irrf sobre salarios'
]

export const WHITELIST_PREFEITURA_BH = [
  'taxas municipais',
  'taxa municipal',
  'retencao - iss servicos tomados',
  'retencao iss servicos tomados',
  'retencao iss',
  'retencao - iss',
  'iss retido'
]

export const WHITELIST_LILIAN_GEO = [
  'aluguel',
  'retencao - darf 3208 - irrf aluguel',
  'retencao darf 3208 irrf aluguel',
  'darf 3208'
]

export const WHITELIST_SISDEB_REDECARD = [
  'estornos e cancelamentos',
  'estorno e cancelamento',
  'tarifas bancarias',
  'tarifa bancaria'
]

export const WHITELIST_STONE = [
  'tarifas de cartoes de credito',
  'tarifa de cartao de credito',
  'tarifas de cartao de credito',
  'tarifas de antecipacoes de cartoes',
  'tarifa de antecipacao de cartao',
  'tarifas de antecipacao de cartoes',
  'antecipacao de cartoes'
]

/**
 * Identifica se o fornecedor é a Receita Federal ou guia tributária federal correlata
 */
export function isReceitaFederal(fornecedorNome?: string | null): boolean {
  if (!fornecedorNome) return false
  const norm = normalizarTexto(fornecedorNome)
  return norm.includes('receita federal') || norm.startsWith('darf') || norm.includes('recolhimento receita')
}

/**
 * Identifica se o fornecedor é a Prefeitura de Belo Horizonte
 */
export function isPrefeituraBeloHorizonte(fornecedorNome?: string | null): boolean {
  if (!fornecedorNome) return false
  const norm = normalizarTexto(fornecedorNome)
  return norm.includes('prefeitura') && (norm.includes('belo horizonte') || norm.includes('bh'))
}

/**
 * Identifica se o fornecedor é Lilian Geo Leite Soares
 */
export function isLilianGeo(fornecedorNome?: string | null): boolean {
  if (!fornecedorNome) return false
  const norm = normalizarTexto(fornecedorNome)
  return norm.includes('lilian geo')
}

/**
 * Identifica se o fornecedor é SISDEB REDECARD S A
 */
export function isSisdebRedecard(fornecedorNome?: string | null): boolean {
  if (!fornecedorNome) return false
  const norm = normalizarTexto(fornecedorNome)
  return norm.includes('sisdeb') && norm.includes('redecard')
}

/**
 * Identifica se o fornecedor é Adquirente STONE
 */
export function isStoneAdquirente(fornecedorNome?: string | null): boolean {
  if (!fornecedorNome) return false
  const norm = normalizarTexto(fornecedorNome)
  return norm.includes('stone')
}

/**
 * Constantes de Whitelist para Fase 2B (AME Negócios Digitais e Sócios)
 */
export const WHITELIST_RUTH_CARNEIRO = [
  'despesas pessoais dos socios',
  'despesa pessoal dos socios',
  'despesas pessoais',
  'antecipacao de lucros',
  'antecipacao de lucro'
]

export const WHITELIST_ELIAS_CARNEIRO = [
  'honorarios consultoria',
  'honorario consultoria',
  'combustiveis',
  'combustivel',
  'lanches e refeicoes',
  'lanches e refeicao'
]

/**
 * Identifica se o fornecedor é AME Negócios Digitais
 */
export function isAmeNegociosDigitais(fornecedorNome?: string | null): boolean {
  if (!fornecedorNome) return false
  const norm = normalizarTexto(fornecedorNome)
  return norm.includes('ame') && norm.includes('negocios')
}

/**
 * Identifica se o fornecedor é Ruth Carneiro Rodrigues
 */
export function isRuthCarneiro(fornecedorNome?: string | null): boolean {
  if (!fornecedorNome) return false
  const norm = normalizarTexto(fornecedorNome)
  return norm.includes('ruth') && norm.includes('carneiro')
}

/**
 * Identifica se o fornecedor é Elias Carneiro Rodrigues
 */
export function isEliasCarneiro(fornecedorNome?: string | null): boolean {
  if (!fornecedorNome) return false
  const norm = normalizarTexto(fornecedorNome)
  return norm.includes('elias') && norm.includes('carneiro')
}

/**
 * Identifica se a entidade/fornecedor representa uma Pessoa Física (Sócio, Colaborador, Favorecido PF)
 */
export function isPessoaFisica(fornecedorNome?: string | null): boolean {
  if (!fornecedorNome) return false
  const norm = normalizarTexto(fornecedorNome)
  const indicadoresPj = [
    'ltda', 's/a', 's.a.', 's a ', 'eireli', 'me ', 'epp', 'instituicao de pagamento',
    'banco', 'prefeitura', 'secretaria', 'receita federal', 'ministerio', 'cartorio', 'comercial', 'industria'
  ]
  if (indicadoresPj.some(ind => norm.includes(ind))) return false
  return true
}

/**
 * Executa a auditoria de consistência de categorias por fornecedor
 * 100% READ ONLY - Consulta exclusivamente a tabela public.contas_pagar_contaazul_espelho.
 * Não realiza nenhuma operação de escrita (INSERT, UPDATE ou UPSERT) no banco.
 */
export async function executarAuditoriaCategorias(params: {
  empresaId: string
  dataInicio: string
  dataFim: string
}): Promise<ResumoAuditoriaCategorias> {
  const { empresaId, dataInicio, dataFim } = params

  if (!empresaId) {
    throw new Error('O parâmetro empresaId é obrigatório.')
  }
  if (!dataInicio || !dataFim) {
    throw new Error('As datas de início e fim são obrigatórias.')
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const supabase = createClient(supabaseUrl, supabaseKey)

  // 1. Define janela de histórico de 6 meses anteriores ao início do período auditado
  const dataHistoricoInicio = subtrairMeses(dataInicio, 6)

  // 2. Busca lançamentos a auditar no período selecionado (exclusivamente SELECT em contas_pagar_contaazul_espelho)
  const { data: lancamentosAuditados, error: errAuditados } = await supabase
    .from('contas_pagar_contaazul_espelho')
    .select('*')
    .eq('empresa_id', empresaId)
    .gte('data_competencia', dataInicio)
    .lte('data_competencia', dataFim)
    .order('data_competencia', { ascending: false })
    .limit(50000)

  if (errAuditados) {
    console.error('[AuditoriaCategorias] Erro ao buscar lançamentos a auditar:', errAuditados)
    throw new Error(`Erro ao consultar base espelho do Conta Azul: ${errAuditados.message}`)
  }

  const registrosAuditados = lancamentosAuditados || []

  // Se não houver lançamentos no período
  if (registrosAuditados.length === 0) {
    return {
      totalAuditado: 0,
      totalConsistentes: 0,
      totalDivergentes: 0,
      totalNovosFornecedores: 0,
      totalPendentes: 0,
      totalJustificadas: 0,
      totalCorrigidas: 0,
      totalValidadas: 0,
      valorTotalAuditado: 0,
      valorTotalDivergente: 0,
      taxaDivergencia: 0,
      periodoAuditado: { inicio: dataInicio, fim: dataFim },
      periodoHistoricoAprendizado: { inicio: dataHistoricoInicio, fim: dataInicio },
      itens: []
    }
  }

  // 3. Identifica fornecedores distintos do período auditado
  const fornecedoresAuditados = Array.from(
    new Set(
      registrosAuditados
        .map(r => r.fornecedor_nome?.trim())
        .filter((nome): nome is string => Boolean(nome && nome.length > 0))
    )
  )

  // 4. Busca histórico de lançamentos dos últimos 6 meses anteriores (SELECT em contas_pagar_contaazul_espelho)
  const { data: historicoRows, error: errHistorico } = await supabase
    .from('contas_pagar_contaazul_espelho')
    .select('fornecedor_nome, categoria_nome, data_competencia')
    .eq('empresa_id', empresaId)
    .gte('data_competencia', dataHistoricoInicio)
    .lt('data_competencia', dataInicio)
    .in('fornecedor_nome', fornecedoresAuditados)
    .limit(50000)

  if (errHistorico) {
    console.warn('[AuditoriaCategorias] Aviso ao buscar histórico de fornecedores:', errHistorico.message)
  }

  // 5. Agrupa histórico por fornecedor e calcula categoria predominante 100% em memória
  const mapaHistorico = new Map<string, { total: number; categorias: Map<string, number> }>()

  for (const row of (historicoRows || [])) {
    const fn = (row.fornecedor_nome || '').trim()
    const cat = (row.categoria_nome || '').trim()
    if (!fn || !cat) continue

    if (!mapaHistorico.has(fn)) {
      mapaHistorico.set(fn, { total: 0, categorias: new Map() })
    }

    const info = mapaHistorico.get(fn)!
    info.total += 1
    info.categorias.set(cat, (info.categorias.get(cat) || 0) + 1)
  }

  // 6. Estrutura o aprendizado estatístico por fornecedor em memória
  interface PadraoFornecedor {
    categoriaPadrao: string
    percentualConfianca: number
    totalHistorico: number
    categoriasHistorico: string[]
  }

  const mapaPadrao = new Map<string, PadraoFornecedor>()

  for (const [fornecedorNome, info] of mapaHistorico.entries()) {
    let catMaisFrequente = ''
    let maxOcorrencias = 0

    for (const [catNome, count] of info.categorias.entries()) {
      if (count > maxOcorrencias) {
        maxOcorrencias = count
        catMaisFrequente = catNome
      }
    }

    const confianca = info.total > 0
      ? Math.round((maxOcorrencias / info.total) * 10000) / 100
      : 0

    mapaPadrao.set(fornecedorNome, {
      categoriaPadrao: catMaisFrequente,
      percentualConfianca: confianca,
      totalHistorico: info.total,
      categoriasHistorico: Array.from(info.categorias.keys())
    })
  }

  // 7. Classifica cada lançamento do período auditado em relação ao padrão histórico
  let totalConsistentes = 0
  let totalDivergentes = 0
  let totalNovos = 0
  let valorTotalAuditado = 0
  let valorTotalDivergente = 0

  const itens: ItemAuditoriaCategoria[] = registrosAuditados.map(r => {
    const fornecedorNome = (r.fornecedor_nome || 'NÃO INFORMADO').trim()
    const categoriaAtual = (r.categoria_nome || 'SEM CATEGORIA').trim()
    const valor = Number(r.valor) || 0
    valorTotalAuditado += valor

    const padrao = mapaPadrao.get(fornecedorNome)

    if (!padrao || padrao.totalHistorico === 0) {
      totalNovos += 1
      return {
        id: r.id,
        contaAzulId: r.conta_azul_id,
        fornecedor: fornecedorNome,
        categoriaEsperada: 'Sem Histórico Prévio (6 meses)',
        categoriaAtual: categoriaAtual,
        percentualConfianca: 0,
        totalHistoricoFornecedor: 0,
        status: 'novo_fornecedor',
        valor: valor,
        dataCompetencia: r.data_competencia || r.data_vencimento || '',
        dataVencimento: r.data_vencimento,
        descricao: r.descricao
      }
    }

    const catAtualNorm = normalizarTexto(categoriaAtual)
    const matchCategoria = catAtualNorm === normalizarTexto(padrao.categoriaPadrao)

    if (matchCategoria) {
      totalConsistentes += 1
      return {
        id: r.id,
        contaAzulId: r.conta_azul_id,
        fornecedor: fornecedorNome,
        categoriaEsperada: padrao.categoriaPadrao,
        categoriaAtual: categoriaAtual,
        percentualConfianca: padrao.percentualConfianca,
        totalHistoricoFornecedor: padrao.totalHistorico,
        status: 'consistente',
        valor: valor,
        dataCompetencia: r.data_competencia || r.data_vencimento || '',
        dataVencimento: r.data_vencimento,
        descricao: r.descricao
      }
    }

    // =========================================================================
    // FASE 1: REDUÇÃO DE FALSOS POSITIVOS (CAJU E FUNCIONÁRIOS CLT)
    // =========================================================================

    // Regra 1: CAJU (Benefícios Corporativos)
    if (isCajuFornecedor(fornecedorNome)) {
      const permitidaCaju = WHITELIST_CAJU.some(w => catAtualNorm.includes(w) || w.includes(catAtualNorm))
      if (permitidaCaju) {
        totalConsistentes += 1
        return {
          id: r.id,
          contaAzulId: r.conta_azul_id,
          fornecedor: fornecedorNome,
          categoriaEsperada: categoriaAtual,
          categoriaAtual: categoriaAtual,
          percentualConfianca: 100,
          totalHistoricoFornecedor: padrao.totalHistorico,
          status: 'consistente',
          valor: valor,
          dataCompetencia: r.data_competencia || r.data_vencimento || '',
          dataVencimento: r.data_vencimento,
          descricao: r.descricao
        }
      }
    }

    // Regra 2: Funcionários CLT (Whitelist e Regras Temporais)
    if (isCltFornecedor(fornecedorNome, padrao.categoriasHistorico)) {
      const permitidaClt = WHITELIST_CLT.some(w => catAtualNorm.includes(w) || w.includes(catAtualNorm))

      if (permitidaClt) {
        const diaVenc = extrairDiaDoMes(r.data_vencimento || r.data_competencia)

        // 2.1. Salários: vencimento deve estar entre dias 01 e 08 (5º dia útil / feriados bancários)
        const isSalario = catAtualNorm.includes('salario') && !catAtualNorm.includes('adiantamento') && !catAtualNorm.includes('13')
        if (isSalario) {
          if (diaVenc >= 1 && diaVenc <= 8) {
            totalConsistentes += 1
            return {
              id: r.id,
              contaAzulId: r.conta_azul_id,
              fornecedor: fornecedorNome,
              categoriaEsperada: categoriaAtual,
              categoriaAtual: categoriaAtual,
              percentualConfianca: 100,
              totalHistoricoFornecedor: padrao.totalHistorico,
              status: 'consistente',
              valor: valor,
              dataCompetencia: r.data_competencia || r.data_vencimento || '',
              dataVencimento: r.data_vencimento,
              descricao: r.descricao
            }
          } else {
            // Divergência temporal: Salário com vencimento fora do prazo legal (01 a 08)
            totalDivergentes += 1
            valorTotalDivergente += valor
            return {
              id: r.id,
              contaAzulId: r.conta_azul_id,
              fornecedor: fornecedorNome,
              categoriaEsperada: 'Salários (Vencimento esperado: dias 01 a 08)',
              categoriaAtual: categoriaAtual,
              percentualConfianca: padrao.percentualConfianca,
              totalHistoricoFornecedor: padrao.totalHistorico,
              status: 'divergente',
              valor: valor,
              dataCompetencia: r.data_competencia || r.data_vencimento || '',
              dataVencimento: r.data_vencimento,
              descricao: r.descricao
            }
          }
        }

        // 2.2. Adiantamento Salarial: vencimento deve estar entre dias 15 e 25 (quinzena padrão e compensações)
        const isAdiantamento = catAtualNorm.includes('adiantamento')
        if (isAdiantamento) {
          if (diaVenc >= 15 && diaVenc <= 25) {
            totalConsistentes += 1
            return {
              id: r.id,
              contaAzulId: r.conta_azul_id,
              fornecedor: fornecedorNome,
              categoriaEsperada: categoriaAtual,
              categoriaAtual: categoriaAtual,
              percentualConfianca: 100,
              totalHistoricoFornecedor: padrao.totalHistorico,
              status: 'consistente',
              valor: valor,
              dataCompetencia: r.data_competencia || r.data_vencimento || '',
              dataVencimento: r.data_vencimento,
              descricao: r.descricao
            }
          } else {
            // Divergência temporal: Adiantamento com vencimento fora da quinzena (15 a 25)
            totalDivergentes += 1
            valorTotalDivergente += valor
            return {
              id: r.id,
              contaAzulId: r.conta_azul_id,
              fornecedor: fornecedorNome,
              categoriaEsperada: 'Adiantamento Salarial (Vencimento esperado: dias 15 a 25)',
              categoriaAtual: categoriaAtual,
              percentualConfianca: padrao.percentualConfianca,
              totalHistoricoFornecedor: padrao.totalHistorico,
              status: 'divergente',
              valor: valor,
              dataCompetencia: r.data_competencia || r.data_vencimento || '',
              dataVencimento: r.data_vencimento,
              descricao: r.descricao
            }
          }
        }

        // 2.3. Demais eventos da whitelist CLT (Férias, 13º, Rescisões, Gratificações, VA, VT, FGTS)
        totalConsistentes += 1
        return {
          id: r.id,
          contaAzulId: r.conta_azul_id,
          fornecedor: fornecedorNome,
          categoriaEsperada: categoriaAtual,
          categoriaAtual: categoriaAtual,
          percentualConfianca: 100,
          totalHistoricoFornecedor: padrao.totalHistorico,
          status: 'consistente',
          valor: valor,
          dataCompetencia: r.data_competencia || r.data_vencimento || '',
          dataVencimento: r.data_vencimento,
          descricao: r.descricao
        }
      }
    }

    // =========================================================================
    // FASE 2A: MULTI_TRIBUTOS & MULTI_ADQUIRENTES
    // =========================================================================

    // 1. MULTI_TRIBUTOS: Receita Federal
    if (isReceitaFederal(fornecedorNome)) {
      const permitida = WHITELIST_RECEITA_FEDERAL.some(w => catAtualNorm.includes(w) || w.includes(catAtualNorm))
      if (permitida) {
        totalConsistentes += 1
        return {
          id: r.id,
          contaAzulId: r.conta_azul_id,
          fornecedor: fornecedorNome,
          categoriaEsperada: categoriaAtual,
          categoriaAtual: categoriaAtual,
          percentualConfianca: 100,
          totalHistoricoFornecedor: padrao.totalHistorico,
          status: 'consistente',
          valor: valor,
          dataCompetencia: r.data_competencia || r.data_vencimento || '',
          dataVencimento: r.data_vencimento,
          descricao: r.descricao
        }
      }
    }

    // 1. MULTI_TRIBUTOS: Prefeitura de Belo Horizonte
    if (isPrefeituraBeloHorizonte(fornecedorNome)) {
      const permitida = WHITELIST_PREFEITURA_BH.some(w => catAtualNorm.includes(w) || w.includes(catAtualNorm))
      if (permitida) {
        totalConsistentes += 1
        return {
          id: r.id,
          contaAzulId: r.conta_azul_id,
          fornecedor: fornecedorNome,
          categoriaEsperada: categoriaAtual,
          categoriaAtual: categoriaAtual,
          percentualConfianca: 100,
          totalHistoricoFornecedor: padrao.totalHistorico,
          status: 'consistente',
          valor: valor,
          dataCompetencia: r.data_competencia || r.data_vencimento || '',
          dataVencimento: r.data_vencimento,
          descricao: r.descricao
        }
      }
    }

    // 1. MULTI_TRIBUTOS: LILIAN GEO LEITE SOARES
    if (isLilianGeo(fornecedorNome)) {
      const permitida = WHITELIST_LILIAN_GEO.some(w => catAtualNorm.includes(w) || w.includes(catAtualNorm))
      if (permitida) {
        totalConsistentes += 1
        return {
          id: r.id,
          contaAzulId: r.conta_azul_id,
          fornecedor: fornecedorNome,
          categoriaEsperada: categoriaAtual,
          categoriaAtual: categoriaAtual,
          percentualConfianca: 100,
          totalHistoricoFornecedor: padrao.totalHistorico,
          status: 'consistente',
          valor: valor,
          dataCompetencia: r.data_competencia || r.data_vencimento || '',
          dataVencimento: r.data_vencimento,
          descricao: r.descricao
        }
      }
    }

    // 2. MULTI_ADQUIRENTES: SISDEB REDECARD S A
    if (isSisdebRedecard(fornecedorNome)) {
      const permitida = WHITELIST_SISDEB_REDECARD.some(w => catAtualNorm.includes(w) || w.includes(catAtualNorm))
      if (permitida) {
        totalConsistentes += 1
        return {
          id: r.id,
          contaAzulId: r.conta_azul_id,
          fornecedor: fornecedorNome,
          categoriaEsperada: categoriaAtual,
          categoriaAtual: categoriaAtual,
          percentualConfianca: 100,
          totalHistoricoFornecedor: padrao.totalHistorico,
          status: 'consistente',
          valor: valor,
          dataCompetencia: r.data_competencia || r.data_vencimento || '',
          dataVencimento: r.data_vencimento,
          descricao: r.descricao
        }
      }
    }

    // 2. MULTI_ADQUIRENTES: STONE
    if (isStoneAdquirente(fornecedorNome)) {
      const permitida = WHITELIST_STONE.some(w => catAtualNorm.includes(w) || w.includes(catAtualNorm))
      if (permitida) {
        totalConsistentes += 1
        return {
          id: r.id,
          contaAzulId: r.conta_azul_id,
          fornecedor: fornecedorNome,
          categoriaEsperada: categoriaAtual,
          categoriaAtual: categoriaAtual,
          percentualConfianca: 100,
          totalHistoricoFornecedor: padrao.totalHistorico,
          status: 'consistente',
          valor: valor,
          dataCompetencia: r.data_competencia || r.data_vencimento || '',
          dataVencimento: r.data_vencimento,
          descricao: r.descricao
        }
      }
    }

    // =========================================================================
    // FASE 2B: AME NEGÓCIOS DIGITAIS E SÓCIOS (RUTH E ELIAS)
    // =========================================================================

    // 1. AME NEGOCIOS DIGITAIS (Fase 2B e Fase 2C)
    if (isAmeNegociosDigitais(fornecedorNome)) {
      const descNorm = normalizarTexto(r.descricao)

      // 1.1. Telefonia e Internet (Fase 2B)
      const isTelefoniaInternet = catAtualNorm.includes('telefonia') && catAtualNorm.includes('internet')
      if (isTelefoniaInternet) {
        const matchValor = Math.abs(valor - 620) < 0.01
        const matchDescricao =
          descNorm.includes('atendimento') ||
          descNorm.includes('servico de atendimento') ||
          descNorm.includes('voip') ||
          descNorm.includes('pabx')

        if (matchValor || matchDescricao) {
          totalConsistentes += 1
          return {
            id: r.id,
            contaAzulId: r.conta_azul_id,
            fornecedor: fornecedorNome,
            categoriaEsperada: categoriaAtual,
            categoriaAtual: categoriaAtual,
            percentualConfianca: 100,
            totalHistoricoFornecedor: padrao.totalHistorico,
            status: 'consistente',
            valor: valor,
            dataCompetencia: r.data_competencia || r.data_vencimento || '',
            dataVencimento: r.data_vencimento,
            descricao: r.descricao
          }
        }
      }

      // 1.2. Insumos/Materiais de Oficina para Check-list ou Impressos (Fase 2C)
      const isInsumosOficina =
        catAtualNorm.includes('insumos') ||
        catAtualNorm.includes('materiais de oficina') ||
        catAtualNorm.includes('material de oficina')
      if (isInsumosOficina) {
        const matchChecklistOuImpressos =
          descNorm.includes('check list') ||
          descNorm.includes('checklist') ||
          descNorm.includes('impressos') ||
          descNorm.includes('impresso')

        if (matchChecklistOuImpressos) {
          totalConsistentes += 1
          return {
            id: r.id,
            contaAzulId: r.conta_azul_id,
            fornecedor: fornecedorNome,
            categoriaEsperada: categoriaAtual,
            categoriaAtual: categoriaAtual,
            percentualConfianca: 100,
            totalHistoricoFornecedor: padrao.totalHistorico,
            status: 'consistente',
            valor: valor,
            dataCompetencia: r.data_competencia || r.data_vencimento || '',
            dataVencimento: r.data_vencimento,
            descricao: r.descricao
          }
        }
      }
      // Casos como Limpeza predial (ex: LIMPEZA AR BARAO) permanecem divergentes
    }

    // 2. RUTH CARNEIRO RODRIGUES (Despesas Pessoais dos Sócios e Antecipação de Lucros)
    if (isRuthCarneiro(fornecedorNome)) {
      const permitida = WHITELIST_RUTH_CARNEIRO.some(w => catAtualNorm.includes(w) || w.includes(catAtualNorm))
      if (permitida) {
        totalConsistentes += 1
        return {
          id: r.id,
          contaAzulId: r.conta_azul_id,
          fornecedor: fornecedorNome,
          categoriaEsperada: categoriaAtual,
          categoriaAtual: categoriaAtual,
          percentualConfianca: 100,
          totalHistoricoFornecedor: padrao.totalHistorico,
          status: 'consistente',
          valor: valor,
          dataCompetencia: r.data_competencia || r.data_vencimento || '',
          dataVencimento: r.data_vencimento,
          descricao: r.descricao
        }
      }
    }

    // 3. ELIAS CARNEIRO RODRIGUES (Honorários Consultoria, Combustíveis, Lanches e Refeições)
    // NÃO inclui Antecipação de Lucros (RETIRADA SILAS - ELIAS BTG continua divergente)
    if (isEliasCarneiro(fornecedorNome)) {
      const permitida = WHITELIST_ELIAS_CARNEIRO.some(w => catAtualNorm.includes(w) || w.includes(catAtualNorm))
      if (permitida) {
        totalConsistentes += 1
        return {
          id: r.id,
          contaAzulId: r.conta_azul_id,
          fornecedor: fornecedorNome,
          categoriaEsperada: categoriaAtual,
          categoriaAtual: categoriaAtual,
          percentualConfianca: 100,
          totalHistoricoFornecedor: padrao.totalHistorico,
          status: 'consistente',
          valor: valor,
          dataCompetencia: r.data_competencia || r.data_vencimento || '',
          dataVencimento: r.data_vencimento,
          descricao: r.descricao
        }
      }
    }

    // =========================================================================
    // FASE 2C: REGRA DE REEMBOLSO CONTEXTUAL (POR DESCRIÇÃO "REEMBOLSO")
    // =========================================================================
    const descNormReembolso = normalizarTexto(r.descricao)
    if (descNormReembolso.includes('reembolso')) {
      const fornecedorNomeNorm = normalizarTexto(fornecedorNome)
      const isPessoaFisicaOuColaborador =
        fornecedorNomeNorm.includes('silas') ||
        fornecedorNomeNorm.includes('claudio leonardo') ||
        isPessoaFisica(fornecedorNome)

      const isCategoriaReembolsoValida =
        catAtualNorm.includes('confraternizac') ||
        catAtualNorm.includes('lanches e refeic') ||
        catAtualNorm.includes('insumos') ||
        catAtualNorm.includes('materiais de oficina') ||
        catAtualNorm.includes('combustiv')

      if (isPessoaFisicaOuColaborador && isCategoriaReembolsoValida) {
        totalConsistentes += 1
        return {
          id: r.id,
          contaAzulId: r.conta_azul_id,
          fornecedor: fornecedorNome,
          categoriaEsperada: categoriaAtual,
          categoriaAtual: categoriaAtual,
          percentualConfianca: 100,
          totalHistoricoFornecedor: padrao.totalHistorico,
          status: 'consistente',
          valor: valor,
          dataCompetencia: r.data_competencia || r.data_vencimento || '',
          dataVencimento: r.data_vencimento,
          descricao: r.descricao
        }
      }
    }

    // Regra 3: Categoria Única (demais fornecedores mantêm comportamento atual)
    totalDivergentes += 1
    valorTotalDivergente += valor
    return {
      id: r.id,
      contaAzulId: r.conta_azul_id,
      fornecedor: fornecedorNome,
      categoriaEsperada: padrao.categoriaPadrao,
      categoriaAtual: categoriaAtual,
      percentualConfianca: padrao.percentualConfianca,
      totalHistoricoFornecedor: padrao.totalHistorico,
      status: 'divergente',
      valor: valor,
      dataCompetencia: r.data_competencia || r.data_vencimento || '',
      dataVencimento: r.data_vencimento,
      descricao: r.descricao
    }
  })

  // 8. Consulta status de governanca e justificativas registradas no Supabase
  const idsDivergentes = itens
    .filter(function(i) { return i.status === 'divergente' && i.contaAzulId; })
    .map(function(i) { return i.contaAzulId; });

  const mapaStatusJustificativa = new Map();

  if (idsDivergentes.length > 0) {
    try {
      const { data: rowsStatus, error: errStatus } = await supabase
        .from('auditoria_divergencias_status')
        .select('conta_azul_id, status_divergencia, motivo_justificativa, usuario_email, atualizado_em, justificado_por_email, justificado_em, validado_por_email, validado_em')
        .eq('empresa_id', empresaId)
        .in('conta_azul_id', idsDivergentes);

      if (!errStatus && rowsStatus) {
        for (const row of rowsStatus) {
          mapaStatusJustificativa.set(row.conta_azul_id, {
            status: row.status_divergencia,
            motivo: row.motivo_justificativa,
            usuarioEmail: row.usuario_email,
            atualizadoEm: row.atualizado_em,
            justificadoPor: (row as any).justificado_por_email || row.usuario_email,
            justificadoEm: (row as any).justificado_em || row.atualizado_em,
            validadoPor: (row as any).validado_por_email || (row.status_divergencia === 'VALIDADA' ? row.usuario_email : null),
            validadoEm: (row as any).validado_em || null
          });
        }
      }
    } catch (e) {
      console.warn('[AuditoriaCategorias] Tabela de justificativas pendente ou erro na busca:', e);
    }
  }

  let totalPendentes = 0;
  let totalJustificadas = 0;
  let totalCorrigidas = 0;
  let totalValidadas = 0;

  for (const item of itens) {
    if (item.status === 'divergente') {
      const just = item.contaAzulId ? mapaStatusJustificativa.get(item.contaAzulId) : undefined;
      if (just) {
        item.statusDivergencia = just.status;
        item.motivoJustificativa = just.motivo;
        item.justificadoPor = just.justificadoPor;
        item.justificadoEm = just.justificadoEm;
        item.validadoPor = just.validadoPor;
        item.validadoEm = just.validadoEm;
      } else {
        item.statusDivergencia = 'PENDENTE';
      }

      if (item.statusDivergencia === 'JUSTIFICADA') totalJustificadas++;
      else if (item.statusDivergencia === 'CORRIGIDA') totalCorrigidas++;
      else if (item.statusDivergencia === 'VALIDADA') totalValidadas++;
      else totalPendentes++;
    }
  }

  const totalAuditado = itens.length;
  const taxaDivergencia = totalAuditado > 0
    ? Math.round((totalDivergentes / totalAuditado) * 10000) / 100
    : 0;

  return {
    totalAuditado,
    totalConsistentes,
    totalDivergentes,
    totalNovosFornecedores: totalNovos,
    totalPendentes,
    totalJustificadas,
    totalCorrigidas,
    totalValidadas,
    valorTotalAuditado: Math.round(valorTotalAuditado * 100) / 100,
    valorTotalDivergente: Math.round(valorTotalDivergente * 100) / 100,
    taxaDivergencia,
    periodoAuditado: { inicio: dataInicio, fim: dataFim },
    periodoHistoricoAprendizado: { inicio: dataHistoricoInicio, fim: dataInicio },
    itens
  };
}

export interface LancamentoHistoricoItem {
  id: string
  contaAzulId?: string | null
  categoria: string
  valor: number
  dataCompetencia: string
  dataVencimento?: string | null
  descricao?: string | null
  status?: string | null
}

export interface CategoriaDistribuicaoItem {
  categoria: string
  quantidade: number
  valorTotal: number
  percentual: number
}

export interface HistoricoFornecedorDetalhado {
  fornecedor: string
  totalHistorico: number
  distribuicaoCategorias: CategoriaDistribuicaoItem[]
  ultimosLancamentos: LancamentoHistoricoItem[]
}

/**
 * Consulta o histórico completo e os últimos lançamentos de um fornecedor
 * 100% READ ONLY - Consulta apenas a base espelho do Conta Azul.
 */
export async function buscarHistoricoFornecedor(params: {
  empresaId: string
  fornecedor: string
  limite?: number
}): Promise<HistoricoFornecedorDetalhado> {
  const { empresaId, fornecedor, limite = 20 } = params

  if (!empresaId) {
    throw new Error('O parâmetro empresaId é obrigatório.')
  }
  if (!fornecedor || fornecedor.trim() === '') {
    throw new Error('O parâmetro fornecedor é obrigatório.')
  }

  const fornecedorNome = fornecedor.trim()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const supabase = createClient(supabaseUrl, supabaseKey)

  // 1. Busca os últimos lançamentos do fornecedor
  const { data: ultimosRows, error: errUltimos } = await supabase
    .from('contas_pagar_contaazul_espelho')
    .select('id, conta_azul_id, fornecedor_nome, categoria_nome, valor, data_competencia, data_vencimento, descricao, status')
    .eq('empresa_id', empresaId)
    .eq('fornecedor_nome', fornecedorNome)
    .order('data_competencia', { ascending: false })
    .limit(limite)

  if (errUltimos) {
    console.error('[AuditoriaCategorias] Erro ao buscar últimos lançamentos:', errUltimos)
    throw new Error(`Erro ao consultar histórico: ${errUltimos.message}`)
  }

  // 2. Busca todos os lançamentos para distribuição de categorias
  const { data: todasRows, error: errTodas } = await supabase
    .from('contas_pagar_contaazul_espelho')
    .select('categoria_nome, valor')
    .eq('empresa_id', empresaId)
    .eq('fornecedor_nome', fornecedorNome)
    .limit(10000)

  if (errTodas) {
    console.warn('[AuditoriaCategorias] Aviso ao buscar distribuição de categorias:', errTodas.message)
  }

  const rows = todasRows || []
  const totalHistorico = rows.length

  const mapaCategorias = new Map<string, { quantidade: number; valorTotal: number }>()
  for (const r of rows) {
    const cat = (r.categoria_nome || 'SEM CATEGORIA').trim()
    const v = Number(r.valor) || 0
    const atual = mapaCategorias.get(cat) || { quantidade: 0, valorTotal: 0 }
    atual.quantidade += 1
    atual.valorTotal += v
    mapaCategorias.set(cat, atual)
  }

  const distribuicaoCategorias: CategoriaDistribuicaoItem[] = Array.from(mapaCategorias.entries())
    .map(([categoria, dados]) => ({
      categoria,
      quantidade: dados.quantidade,
      valorTotal: Math.round(dados.valorTotal * 100) / 100,
      percentual: totalHistorico > 0 ? Math.round((dados.quantidade / totalHistorico) * 10000) / 100 : 0
    }))
    .sort((a, b) => b.quantidade - a.quantidade)

  const ultimosLancamentos: LancamentoHistoricoItem[] = (ultimosRows || []).map(r => ({
    id: r.id,
    contaAzulId: r.conta_azul_id,
    categoria: r.categoria_nome || 'SEM CATEGORIA',
    valor: Number(r.valor) || 0,
    dataCompetencia: r.data_competencia || r.data_vencimento || '',
    dataVencimento: r.data_vencimento,
    descricao: r.descricao,
    status: r.status
  }))

  return {
    fornecedor: fornecedorNome,
    totalHistorico,
    distribuicaoCategorias,
    ultimosLancamentos
  }
}

export interface SalvarJustificativaParams {
  empresaId: string;
  contaAzulId: string;
  fornecedorNome: string;
  categoriaOriginal: string;
  categoriaSugerida?: string | null;
  statusDivergencia: StatusJustificativa;
  motivoJustificativa?: string | null;
  usuarioEmail?: string | null;
}

/**
 * Salva ou atualiza a justificativa/governanca de uma divergencia contábil
 */
export async function salvarJustificativaDivergencia(params: SalvarJustificativaParams) {
  const {
    empresaId,
    contaAzulId,
    fornecedorNome,
    categoriaOriginal,
    categoriaSugerida,
    statusDivergencia,
    motivoJustificativa,
    usuarioEmail
  } = params;

  if (!empresaId) throw new Error('O parametro empresaId e obrigatorio.');
  if (!contaAzulId) throw new Error('O parametro contaAzulId e obrigatorio.');
  if (!statusDivergencia) throw new Error('O parametro statusDivergencia e obrigatorio.');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const agoraIso = new Date().toISOString();
  const payload: any = {
    empresa_id: empresaId,
    conta_azul_id: contaAzulId,
    fornecedor_nome: fornecedorNome,
    categoria_original: categoriaOriginal,
    categoria_sugerida: categoriaSugerida || null,
    status_divergencia: statusDivergencia,
    motivo_justificativa: motivoJustificativa ? motivoJustificativa.trim() : null,
    usuario_email: usuarioEmail || null,
    atualizado_em: agoraIso
  };

  if (statusDivergencia === 'JUSTIFICADA' || statusDivergencia === 'CORRIGIDA') {
    payload.justificado_por_email = usuarioEmail || 'auditor@connecta.ai';
    payload.justificado_em = agoraIso;
  } else if (statusDivergencia === 'VALIDADA') {
    payload.validado_por_email = usuarioEmail || 'auditor@connecta.ai';
    payload.validado_em = agoraIso;
  }

  const { data, error } = await supabase
    .from('auditoria_divergencias_status')
    .upsert(payload, { onConflict: 'empresa_id,conta_azul_id' })
    .select()
    .single();

  if (error) {
    console.error('[AuditoriaCategorias] Erro ao salvar justificativa:', error);
    throw new Error('Erro ao salvar justificativa no banco: ' + error.message);
  }

  return data;
}

export interface ValidarCorrecaoParams {
  empresaId: string;
  contaAzulId: string;
  usuarioEmail?: string | null;
}

export interface ResultadoValidacaoCorrecao {
  success: boolean;
  validado: boolean;
  status: 'VALIDADA' | 'DIVERGENTE_PERSISTE';
  categoriaEncontrada: string;
  categoriaSugerida: string;
  mensagem: string;
}

/**
 * Consulta a API do Conta Azul para a parcela específica,
 * verifica se o usuário corrigiu a categoria contábil e,
 * se confirmada a alteração, atualiza o espelho local e marca como VALIDADA.
 */
export async function validarCorrecaoContaAzul(params: ValidarCorrecaoParams): Promise<ResultadoValidacaoCorrecao> {
  const { empresaId, contaAzulId, usuarioEmail } = params;

  if (!empresaId) throw new Error('O parametro empresaId e obrigatorio.');
  if (!contaAzulId) throw new Error('O parametro contaAzulId e obrigatorio.');

  // 1. Obter token válido via token-manager
  const { getValidToken } = await import('@/lib/conta-azul/token-manager');
  const { accessToken } = await getValidToken(empresaId, 'financeiro');

  // 2. Consultar o lançamento diretamente na API do Conta Azul
  const urlParcela = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/parcelas/${contaAzulId}`;
  const resApi = await fetch(urlParcela, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });

  if (!resApi.ok) {
    const errText = await resApi.text();
    throw new Error(`Falha ao consultar parcela no Conta Azul (${resApi.status}): ${errText}`);
  }

  const parcelaData = await resApi.json();

  // 3. Extrair categoria contábil atual no Conta Azul (localizada em evento.rateio)
  const rateioPrincipal = parcelaData.evento?.rateio?.[0];
  const categoriaIdApi = rateioPrincipal?.id_categoria || null;
  const categoriaNomeApi = (rateioPrincipal?.nome_categoria || parcelaData.categoria?.nome || '').trim();

  if (!categoriaNomeApi) {
    throw new Error('Não foi possível identificar a categoria do lançamento na resposta do Conta Azul.');
  }

  // 4. Buscar a categoria sugerida / esperada e dados do registro no Supabase
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: divergenciaRow } = await supabase
    .from('auditoria_divergencias_status')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('conta_azul_id', contaAzulId)
    .maybeSingle();

  const { data: espelhoRow } = await supabase
    .from('contas_pagar_contaazul_espelho')
    .select('fornecedor_nome, categoria_nome')
    .eq('empresa_id', empresaId)
    .eq('conta_azul_id', contaAzulId)
    .maybeSingle();

  const fornecedorNome = divergenciaRow?.fornecedor_nome || espelhoRow?.fornecedor_nome || 'FORNECEDOR';
  const categoriaOriginal = divergenciaRow?.categoria_original || espelhoRow?.categoria_nome || '';
  const categoriaSugerida = divergenciaRow?.categoria_sugerida || '';

  if (!categoriaSugerida) {
    throw new Error('Categoria sugerida não localizada para este lançamento. Registre ou consulte a auditoria primeiro.');
  }

  // 5. Comparação heurística insensível a maiúsculas e acentos
  const coincide = normalizarTexto(categoriaNomeApi) === normalizarTexto(categoriaSugerida);

  const agoraIso = new Date().toISOString();
  const agoraFormatada = `${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}`;

  if (coincide) {
    // 6. SUCESSO: Atualiza a tabela espelho local de forma atômica
    await supabase
      .from('contas_pagar_contaazul_espelho')
      .update({
        categoria_id: categoriaIdApi,
        categoria_nome: categoriaNomeApi,
        sincronizado_em: agoraIso
      })
      .eq('empresa_id', empresaId)
      .eq('conta_azul_id', contaAzulId);

    // 7. Atualiza o status para VALIDADA na tabela de governança com segregação de auditor
    const motivoAtualizado = `Validação automática confirmada via API Conta Azul em ${agoraFormatada}. Categoria no ERP atualizada para "${categoriaNomeApi}".`;

    await supabase
      .from('auditoria_divergencias_status')
      .upsert({
        empresa_id: empresaId,
        conta_azul_id: contaAzulId,
        fornecedor_nome: fornecedorNome,
        categoria_original: categoriaOriginal,
        categoria_sugerida: categoriaSugerida,
        status_divergencia: 'VALIDADA',
        motivo_justificativa: motivoAtualizado,
        usuario_email: usuarioEmail || null,
        validado_por_email: usuarioEmail || 'auditor@connecta.ai',
        validado_em: agoraIso,
        atualizado_em: agoraIso
      }, { onConflict: 'empresa_id,conta_azul_id' });

    return {
      success: true,
      validado: true,
      status: 'VALIDADA',
      categoriaEncontrada: categoriaNomeApi,
      categoriaSugerida: categoriaSugerida,
      mensagem: `Correção confirmada com sucesso! A categoria no Conta Azul agora é "${categoriaNomeApi}".`
    };
  } else {
    // 8. DIVERGÊNCIA PERSISTE: Informa claramente ao usuário
    return {
      success: true,
      validado: false,
      status: 'DIVERGENTE_PERSISTE',
      categoriaEncontrada: categoriaNomeApi,
      categoriaSugerida: categoriaSugerida,
      mensagem: `No Conta Azul a categoria ainda consta como "${categoriaNomeApi}". Altere para "${categoriaSugerida}" no ERP antes de validar.`
    };
  }
}

export interface HistoricoDivergenciaItem {
  id: string;
  empresaId: string;
  contaAzulId: string;
  statusAnterior: string | null;
  statusNovo: string;
  categoriaOriginal: string;
  categoriaSugerida: string | null;
  motivoJustificativa: string | null;
  usuarioEmail: string;
  acao: string;
  criadoEm: string;
}

/**
 * Consulta a trilha de auditoria completa da divergência (imutável)
 */
export async function buscarHistoricoDivergencia(params: {
  empresaId: string;
  contaAzulId: string;
}): Promise<HistoricoDivergenciaItem[]> {
  const { empresaId, contaAzulId } = params;

  if (!empresaId || !contaAzulId) return [];

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase
    .from('auditoria_divergencias_historico')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('conta_azul_id', contaAzulId)
    .order('criado_em', { ascending: false });

  if (error) {
    console.warn('[AuditoriaCategorias] Erro ao buscar histórico de auditoria:', error);
    return [];
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    empresaId: row.empresa_id,
    contaAzulId: row.conta_azul_id,
    statusAnterior: row.status_anterior,
    statusNovo: row.status_novo,
    categoriaOriginal: row.categoria_original,
    categoriaSugerida: row.categoria_sugerida,
    motivoJustificativa: row.motivo_justificativa,
    usuarioEmail: row.usuario_email,
    acao: row.acao,
    criadoEm: row.criado_em
  }));
}
