/**
 * DCX LINK — MÓDULO CONTAS A RECEBER (ETAPA 1C)
 * Interpretador oficial homologado para a planilha CSV de recebimentos da STONE
 * e motor de conferência bancária e preparação de lançamentos em memória.
 *
 * REGRAS DE SEGURANÇA IMPLEMENTADAS:
 * 1. Preservação integral das 6 casas decimais da Stone (escala micro = 1.000.000) sem ponto flutuante IEEE-754.
 * 2. Chave única composta (nunca usa STONE ID isoladamente).
 * 3. Separação estrita entre DATA DA VENDA, DATA DE VENCIMENTO e DATA DE VENCIMENTO ORIGINAL.
 * 4. Segregação estrita entre Venda Normal, Antecipação, Cobrança, Balanceamento de Saldo e Estornos.
 * 5. Apenas parcelas com ÚLTIMO STATUS = "Pago" compõem o valor líquido recebido para conferência bancária.
 */

import type {
  AvaliacaoPeriodoContaAzulStoneDTO,
  BandeiraCartao,
  ClassificacaoLinhaStone,
  EstadoConferenciaGrupoStone,
  FiltrosOperacionaisStone,
  GrupoConciliacaoStone,
  LancamentoExistenteContaAzulDTO,
  LinhaExtratoStone,
  ModalidadeCartao,
  ModalidadeSiglaStone,
  MovimentacaoReceberCanonica,
  NaturezaMovimentacaoReceber,
  OrigemConferenciaGrupoStone,
  PreviaLancamentosMemoriaStone,
  ResultadoConciliacaoGrupoStone,
  ResultadoConferenciaBancariaStone,
  StatusParcelaStone,
  SubtipoProdutoStone,
  TotaisFiltradosStone,
} from '@/types/contas-receber'
import { formatarCentavosBRL, reaisParaCentavos } from './validador-financeiro'

export const CABECALHO_ESPERADO_STONE = [
  'DOCUMENTO',
  'STONECODE',
  'CATEGORIA',
  'DATA DA VENDA',
  'DATA DE VENCIMENTO',
  'DATA DE VENCIMENTO ORIGINAL',
  'BANDEIRA',
  'PRODUTO',
  'STONE ID',
  'QTD DE PARCELAS',
  'Nº DA PARCELA',
  'VALOR BRUTO',
  'VALOR LÍQUIDO',
  'DESCONTO DE MDR',
  'DESCONTO DE ANTECIPAÇÃO',
  'DESCONTO UNIFICADO',
  'ÚLTIMO STATUS',
  'DATA DO ÚLTIMO STATUS',
  'ENTRADAS BRUTAS',
  'SAÍDAS BRUTAS',
] as const

/**
 * Converte string numérica brasileira com até 6 casas decimais (ex: "1.350,000000" ou "-3,148875")
 * em inteiro de micro-reais (1 R$ = 1.000.000 micro-reais), sem erro de ponto flutuante.
 */
export function parseDecimalStoneParaMicro(valorStr: string): number {
  const limpo = String(valorStr ?? '')
    .trim()
    .replace(/^R\$\s*/i, '')
    .replace(/\s+/g, '')

  if (!limpo) return 0

  const negativo = limpo.startsWith('-')
  const semSinal = limpo.replace(/^[+-]/, '')

  // Formato brasileiro: pontos como separador de milhar e vírgula como separador decimal
  const normalizado = semSinal.replace(/\./g, '')
  const partes = normalizado.split(',')

  if (partes.length > 2) {
    throw new Error(`Valor decimal Stone inválido: "${valorStr}"`)
  }

  const parteInteiraStr = partes[0] || '0'
  const parteFracionariaRaw = partes[1] || ''

  if (!/^\d+$/.test(parteInteiraStr) || (parteFracionariaRaw && !/^\d+$/.test(parteFracionariaRaw))) {
    throw new Error(`Valor numérico Stone inválido: "${valorStr}"`)
  }

  const parteFracionaria6 = parteFracionariaRaw.padEnd(6, '0').slice(0, 6)
  const setimoDigito = parteFracionariaRaw.length > 6 ? Number(parteFracionariaRaw[6]) : 0

  const microAbsoluto =
    Number(parteInteiraStr) * 1_000_000 +
    Number(parteFracionaria6) +
    (setimoDigito >= 5 ? 1 : 0)

  if (microAbsoluto === 0) return 0
  return negativo ? -microAbsoluto : microAbsoluto
}

/**
 * Converte micro-reais (escala 1.000.000) para centavos inteiros (escala 100)
 * utilizando arredondamento monetário simétrico (half-away-from-zero).
 */
export function microParaCentavos(valorMicro: number): number {
  if (!Number.isFinite(valorMicro) || valorMicro === 0) return 0
  const sinal = valorMicro < 0 ? -1 : 1
  return sinal * Math.round(Math.abs(valorMicro) / 10_000)
}

/**
 * Formata um valor em micro-reais (6 casas decimais) para exibição de auditoria exata.
 */
export function formatarMicroBRL(valorMicro: number, casasDecimais: 2 | 6 = 2): string {
  if (!Number.isFinite(valorMicro)) return 'R$ 0,00'
  if (casasDecimais === 2) {
    const centavos = microParaCentavos(valorMicro)
    const reais = centavos / 100
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(reais)
  }

  const reaisExatos = valorMicro / 1_000_000
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 6,
    maximumFractionDigits: 6,
  }).format(reaisExatos)
}

/**
 * Converte data brasileira "DD/MM/YYYY" ou "DD/MM/YYYY HH:mm:ss" para ISO "YYYY-MM-DD".
 */
export function parseDataBrParaIso(dataStr: string): string | null {
  const limpo = String(dataStr ?? '').trim()
  if (!limpo) return null

  const apenasData = limpo.split(' ')[0]
  const partes = apenasData.split('/')
  if (partes.length !== 3) return null

  const [dia, mes, ano] = partes
  if (dia.length !== 2 || mes.length !== 2 || ano.length !== 4) return null

  return `${ano}-${mes}-${dia}`
}

/**
 * Classifica o ÚLTIMO STATUS da parcela na planilha Stone.
 * Regra obrigatória: Não considerar parcelas em aberto ou agendadas como recebidas ("Pago").
 */
export function classificarStatusParcelaStone(ultimoStatus: string): StatusParcelaStone {
  const norm = String(ultimoStatus ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  if (norm === 'PAGO' || norm === 'LIQUIDADO' || norm === 'RECEBIDO') {
    return 'PAGO'
  }
  if (norm.includes('ABERT')) {
    return 'ABERTO'
  }
  if (norm.includes('AGENDAD') || norm.includes('PREVIST')) {
    return 'AGENDADO'
  }
  return 'OUTRO'
}

/**
 * Classifica a natureza operacional da linha da Stone para impedir que
 * antecipações, cobranças, balanceamento de saldo ou estornos sejam somados como MDR normal.
 */
export function classificarLinhaStone(params: {
  categoria: string
  valorBrutoMicro: number
  descontoAntecipacaoAbsolutoMicro: number
}): {
  classificacao: ClassificacaoLinhaStone
  ehVendaOperacional: boolean
} {
  const catNorm = String(params.categoria ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  if (catNorm === 'VENDA') {
    if (params.valorBrutoMicro < 0) {
      return {
        classificacao: 'ESTORNO_CANCELAMENTO',
        ehVendaOperacional: false,
      }
    }
    if (params.descontoAntecipacaoAbsolutoMicro > 0) {
      return {
        classificacao: 'VENDA_COM_ANTECIPACAO',
        ehVendaOperacional: true,
      }
    }
    return {
      classificacao: 'VENDA_NORMAL',
      ehVendaOperacional: true,
    }
  }

  if (catNorm.includes('COBRANCA') || catNorm.includes('ALUGUEL') || catNorm.includes('TARIFA')) {
    return {
      classificacao: 'AJUSTE_COBRANCA',
      ehVendaOperacional: false,
    }
  }

  if (catNorm.includes('BALANCEAMENTO')) {
    return {
      classificacao: 'AJUSTE_BALANCEAMENTO_SALDO',
      ehVendaOperacional: false,
    }
  }

  if (catNorm.includes('ESTORNO') || catNorm.includes('CANCELAMENTO') || catNorm.includes('CHARGEBACK')) {
    return {
      classificacao: 'ESTORNO_CANCELAMENTO',
      ehVendaOperacional: false,
    }
  }

  return {
    classificacao: 'OUTRA_CATEGORIA',
    ehVendaOperacional: false,
  }
}

export interface ResultadoInterpretacaoStoneCSV {
  sucesso: boolean
  mensagem: string
  linhas: LinhaExtratoStone[]
  datas_vencimento_original_unicas: string[]
  bandeiras_unicas: string[]
  produtos_unicos: string[]
  erros_linhas: string[]
}

/**
 * Interpreta o conteúdo textual completo de um arquivo CSV da Stone (; delimitado).
 */
export function interpretarCsvStone(conteudoCsv: string): ResultadoInterpretacaoStoneCSV {
  const textoSemBom = String(conteudoCsv ?? '').replace(/^\uFEFF/, '')
  const linhasRaw = textoSemBom
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  if (linhasRaw.length < 2) {
    return {
      sucesso: false,
      mensagem: 'O arquivo CSV está vazio ou não possui linhas de dados.',
      linhas: [],
      datas_vencimento_original_unicas: [],
      bandeiras_unicas: [],
      produtos_unicos: [],
      erros_linhas: ['Arquivo sem linhas de movimentação.'],
    }
  }

  const cabecalhoCols = linhasRaw[0].split(';').map((c) => c.trim().replace(/^"|"$/g, ''))
  const mapaIndices = new Map<string, number>()
  cabecalhoCols.forEach((col, idx) => {
    mapaIndices.set(col.toUpperCase(), idx)
  })

  // Verificar colunas obrigatórias da Stone
  const colunasFaltantes = CABECALHO_ESPERADO_STONE.filter(
    (col) => !mapaIndices.has(col.toUpperCase())
  )

  if (colunasFaltantes.length > 0) {
    return {
      sucesso: false,
      mensagem: `Layout CSV incompatível com a planilha de recebimentos da Stone. Colunas ausentes: ${colunasFaltantes.join(', ')}`,
      linhas: [],
      datas_vencimento_original_unicas: [],
      bandeiras_unicas: [],
      produtos_unicos: [],
      erros_linhas: [`Colunas ausentes: ${colunasFaltantes.join(', ')}`],
    }
  }

  const getCol = (cols: string[], nomeColuna: (typeof CABECALHO_ESPERADO_STONE)[number]): string => {
    const idx = mapaIndices.get(nomeColuna.toUpperCase())
    if (idx === undefined || idx >= cols.length) return ''
    return cols[idx].trim().replace(/^"|"$/g, '')
  }

  const linhasInterpretadas: LinhaExtratoStone[] = []
  const errosLinhas: string[] = []

  for (let i = 1; i < linhasRaw.length; i++) {
    const numeroLinhaCsv = i + 1
    const cols = linhasRaw[i].split(';')

    if (cols.length < 15) {
      errosLinhas.push(`Linha ${numeroLinhaCsv}: quantidade insuficiente de colunas (${cols.length}).`)
      continue
    }

    try {
      const documento = getCol(cols, 'DOCUMENTO')
      const stonecode = getCol(cols, 'STONECODE')
      const categoria = getCol(cols, 'CATEGORIA')
      const dataVendaStr = getCol(cols, 'DATA DA VENDA')
      const dataVencimentoStr = getCol(cols, 'DATA DE VENCIMENTO')
      const dataVencimentoOriginalStr = getCol(cols, 'DATA DE VENCIMENTO ORIGINAL')
      const bandeira = getCol(cols, 'BANDEIRA')
      const produto = getCol(cols, 'PRODUTO')
      const stoneId = getCol(cols, 'STONE ID')
      const qtdParcelas = parseInt(getCol(cols, 'QTD DE PARCELAS') || '1', 10) || 1
      const numeroParcela = parseInt(getCol(cols, 'Nº DA PARCELA') || '1', 10) || 1

      const valorBrutoMicro = parseDecimalStoneParaMicro(getCol(cols, 'VALOR BRUTO'))
      const valorLiquidoMicro = parseDecimalStoneParaMicro(getCol(cols, 'VALOR LÍQUIDO'))
      const descontoMdrMicro = parseDecimalStoneParaMicro(getCol(cols, 'DESCONTO DE MDR'))
      const descontoAntecipacaoMicro = parseDecimalStoneParaMicro(getCol(cols, 'DESCONTO DE ANTECIPAÇÃO'))
      const descontoUnificadoMicro = parseDecimalStoneParaMicro(getCol(cols, 'DESCONTO UNIFICADO'))
      const entradasBrutasMicro = parseDecimalStoneParaMicro(getCol(cols, 'ENTRADAS BRUTAS'))
      const saidasBrutasMicro = parseDecimalStoneParaMicro(getCol(cols, 'SAÍDAS BRUTAS'))

      const ultimoStatus = getCol(cols, 'ÚLTIMO STATUS')
      const dataUltimoStatusStr = getCol(cols, 'DATA DO ÚLTIMO STATUS')

      // Na planilha da Stone, os descontos vêm com sinal negativo (ex: -10,395000).
      // Convertido em valor absoluto positivo para representar a taxa/despesa:
      const descontoMdrAbsolutoMicro = Math.abs(descontoMdrMicro)
      const descontoAntecipacaoAbsolutoMicro = Math.abs(descontoAntecipacaoMicro)

      const dataVendaIso = parseDataBrParaIso(dataVendaStr)
      const dataVencimentoIso = parseDataBrParaIso(dataVencimentoStr) || ''
      const dataVencimentoOriginalIso = parseDataBrParaIso(dataVencimentoOriginalStr) || ''

      const statusClassificado = classificarStatusParcelaStone(ultimoStatus)
      const { classificacao, ehVendaOperacional } = classificarLinhaStone({
        categoria,
        valorBrutoMicro,
        descontoAntecipacaoAbsolutoMicro,
      })

      // Validação da equação na linha: VALOR BRUTO - |MDR| - |ANTECIPAÇÃO| = VALOR LÍQUIDO
      const liquidoEsperadoMicro =
        valorBrutoMicro - descontoMdrAbsolutoMicro - descontoAntecipacaoAbsolutoMicro
      const diferencaEquacaoMicro = valorLiquidoMicro - liquidoEsperadoMicro
      const equacaoMicroConsistente = Math.abs(diferencaEquacaoMicro) <= 10 // tolerância de 0,000010 R$

      // Chave única composta: NUNCA usar apenas STONE ID (há parcelas distintas da mesma venda e ajustes sem STONE ID)
      const chaveUnicaComposta = [
        documento,
        stonecode,
        stoneId || `SEM_STONE_ID_L${numeroLinhaCsv}`,
        `${numeroParcela}/${qtdParcelas}`,
        dataVendaStr || 'SEM_DATA_VENDA',
        dataVencimentoOriginalStr,
         dataVencimentoStr,
        categoria,
        bandeira,
        produto,
        String(valorBrutoMicro),
        String(valorLiquidoMicro),
      ].join('|')

      linhasInterpretadas.push({
        numero_linha_csv: numeroLinhaCsv,
        chave_unica_composta: chaveUnicaComposta,
        documento,
        stonecode,
        categoria,
        data_venda_original_str: dataVendaStr,
        data_venda_iso: dataVendaIso,
        data_vencimento_str: dataVencimentoStr,
        data_vencimento_iso: dataVencimentoIso,
        data_vencimento_original_str: dataVencimentoOriginalStr,
        data_vencimento_original_iso: dataVencimentoOriginalIso,
        bandeira,
        produto,
        stone_id: stoneId,
        qtd_parcelas: qtdParcelas,
        numero_parcela: numeroParcela,
        valor_bruto_micro: valorBrutoMicro,
        valor_liquido_micro: valorLiquidoMicro,
        desconto_mdr_micro: descontoMdrMicro,
        desconto_mdr_absoluto_micro: descontoMdrAbsolutoMicro,
        desconto_antecipacao_micro: descontoAntecipacaoMicro,
        desconto_antecipacao_absoluto_micro: descontoAntecipacaoAbsolutoMicro,
        desconto_unificado_micro: descontoUnificadoMicro,
        entradas_brutas_micro: entradasBrutasMicro,
        saidas_brutas_micro: saidasBrutasMicro,
        valor_bruto_centavos: microParaCentavos(valorBrutoMicro),
        valor_liquido_centavos: microParaCentavos(valorLiquidoMicro),
        desconto_mdr_absoluto_centavos: microParaCentavos(descontoMdrAbsolutoMicro),
        desconto_antecipacao_absoluto_centavos: microParaCentavos(descontoAntecipacaoAbsolutoMicro),
        ultimo_status: ultimoStatus,
        status_classificado: statusClassificado,
        data_ultimo_status_str: dataUltimoStatusStr,
        classificacao,
        eh_venda_operacional: ehVendaOperacional,
        equacao_micro_consistente: equacaoMicroConsistente,
        diferenca_equacao_micro: diferencaEquacaoMicro,
      })
    } catch (err) {
      errosLinhas.push(
        `Linha ${numeroLinhaCsv}: ${err instanceof Error ? err.message : 'Erro desconhecido ao ler linha'}`
      )
    }
  }

  // Extrair opções únicas para os 3 filtros sequenciais (ordenadas)
  const datasMap = new Map<string, string>()
  const bandeirasSet = new Set<string>()
  const produtosSet = new Set<string>()

  for (const l of linhasInterpretadas) {
    if (l.data_vencimento_original_str) {
      datasMap.set(l.data_vencimento_original_str, l.data_vencimento_original_iso)
    }
    if (l.bandeira) bandeirasSet.add(l.bandeira)
    if (l.produto) produtosSet.add(l.produto)
  }

  // Ordenar datas da mais recente para a mais antiga (igual à planilha da Stone)
  const datasUnicas = Array.from(datasMap.entries())
    .sort((a, b) => b[1].localeCompare(a[1]))
    .map(([dataBr]) => dataBr)

  const bandeirasUnicas = Array.from(bandeirasSet).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  const produtosUnicos = Array.from(produtosSet).sort((a, b) => a.localeCompare(b, 'pt-BR'))

  return {
    sucesso: linhasInterpretadas.length > 0,
    mensagem:
      errosLinhas.length === 0
        ? `Planilha Stone interpretada com sucesso: ${linhasInterpretadas.length} registros carregados.`
        : `Planilha interpretada com ${linhasInterpretadas.length} registros válidos e ${errosLinhas.length} avisos.`,
    linhas: linhasInterpretadas,
    datas_vencimento_original_unicas: datasUnicas,
    bandeiras_unicas: bandeirasUnicas,
    produtos_unicos: produtosUnicos,
    erros_linhas: errosLinhas,
  }
}

/**
 * Aplica os filtros combinados na sequência operacional do usuário:
 * 1º DATA DE VENCIMENTO ORIGINAL
 * 2º BANDEIRA
 * 3º PRODUTO
 */
export function filtrarLinhasStone(
  linhas: LinhaExtratoStone[],
  filtros: FiltrosOperacionaisStone
): LinhaExtratoStone[] {
  return linhas.filter((linha) => {
    if (
      filtros.data_vencimento_original &&
      linha.data_vencimento_original_str !== filtros.data_vencimento_original
    ) {
      return false
    }
    if (filtros.bandeira && linha.bandeira !== filtros.bandeira) {
      return false
    }
    if (filtros.produto && linha.produto !== filtros.produto) {
      return false
    }
    if (filtros.apenas_vendas_pagas) {
      return linha.eh_venda_operacional && linha.status_classificado === 'PAGO'
    }
    return true
  })
}

/**
 * Calcula todos os totais exigidos para o conjunto filtrado da Stone,
 * separando estritamente:
 * - Parcelas pagas vs. abertas vs. agendadas
 * - Vendas operacionais vs. ajustes/cobranças/balanceamentos/estornos
 */
export function calcularTotaisFiltradosStone(
  linhasFiltradas: LinhaExtratoStone[]
): TotaisFiltradosStone {
  let qtdPagas = 0
  let qtdAbertas = 0
  let qtdAgendadas = 0

  let qtdVendasOperacionais = 0
  let qtdAjustes = 0

  let brutoMicro = 0
  let mdrMicro = 0
  let antecipacaoMicro = 0
  let liquidoMicro = 0

  let totalAjustesNaoOperacionaisMicro = 0

  for (const linha of linhasFiltradas) {
    if (linha.status_classificado === 'PAGO') {
      qtdPagas++
    } else if (linha.status_classificado === 'ABERTO') {
      qtdAbertas++
    } else if (linha.status_classificado === 'AGENDADO') {
      qtdAgendadas++
    }

    if (linha.eh_venda_operacional) {
      qtdVendasOperacionais++
      // Regra de segurança: Somente parcelas PAGAS compõem o valor líquido recebido para o banco
      if (linha.status_classificado === 'PAGO') {
        brutoMicro += linha.valor_bruto_micro
        mdrMicro += linha.desconto_mdr_absoluto_micro
        antecipacaoMicro += linha.desconto_antecipacao_absoluto_micro
        liquidoMicro += linha.valor_liquido_micro
      }
    } else {
      qtdAjustes++
      if (linha.status_classificado === 'PAGO') {
        totalAjustesNaoOperacionaisMicro += linha.valor_liquido_micro
      }
    }
  }

  const valorBrutoCentavos = microParaCentavos(brutoMicro)
  const descontoMdrCentavos = microParaCentavos(mdrMicro)
  const descontoAntecipacaoCentavos = microParaCentavos(antecipacaoMicro)
  const valorLiquidoCentavos = microParaCentavos(liquidoMicro)

  // Verifica se há 1 centavo de diferença de arredondamento entre (Bruto - Líquido - Antecipação) e MDR arredondado isoladamente
  const mdrParaFecharCentavos =
    valorBrutoCentavos - valorLiquidoCentavos - descontoAntecipacaoCentavos
  const diferencaArredondamentoCentavos = mdrParaFecharCentavos - descontoMdrCentavos

  return {
    quantidade_registros_total: linhasFiltradas.length,
    quantidade_vendas_operacionais: qtdVendasOperacionais,
    quantidade_ajustes_cobrancas_estornos: qtdAjustes,
    quantidade_parcelas_pagas: qtdPagas,
    quantidade_parcelas_abertas: qtdAbertas,
    quantidade_parcelas_agendadas: qtdAgendadas,
    valor_bruto_micro: brutoMicro,
    desconto_mdr_micro: mdrMicro,
    desconto_antecipacao_micro: antecipacaoMicro,
    valor_liquido_micro: liquidoMicro,
    valor_bruto_centavos: valorBrutoCentavos,
    desconto_mdr_centavos: descontoMdrCentavos,
    desconto_antecipacao_centavos: descontoAntecipacaoCentavos,
    valor_liquido_centavos: valorLiquidoCentavos,
    desconto_mdr_ajustado_centavos: mdrParaFecharCentavos,
    diferenca_arredondamento_centavos: diferencaArredondamentoCentavos,
    total_ajustes_nao_operacionais_micro: totalAjustesNaoOperacionaisMicro,
    total_ajustes_nao_operacionais_centavos: microParaCentavos(
      totalAjustesNaoOperacionaisMicro
    ),
  }
}

/**
 * Compara o VALOR LÍQUIDO DA STONE (das parcelas pagas filtradas) com o VALOR DO EXTRATO BANCÁRIO.
 * Regra estrita:
 * - Nunca assumir que valores "próximos" são iguais.
 * - Quando exatamente iguais ao centavo: Conferência Aprovada.
 * - Quando diferentes: exibe a diferença exata em reais e bloqueia a marcação como conferida.
 */
export function conferirValorLiquidoComExtratoBancario(
  totaisStone: TotaisFiltradosStone,
  valorExtratoBancarioInput: string | number | null | undefined
): ResultadoConferenciaBancariaStone {
  const liquidoStoneCentavos = totaisStone.valor_liquido_centavos
  const liquidoStoneMicro = totaisStone.valor_liquido_micro

  if (totaisStone.quantidade_parcelas_pagas === 0 || liquidoStoneCentavos <= 0) {
    return {
      valor_liquido_stone_centavos: liquidoStoneCentavos,
      valor_liquido_stone_micro: liquidoStoneMicro,
      valor_extrato_bancario_centavos: null,
      diferenca_centavos: 0,
      conferencia_aprovada: false,
      bloqueada_para_conferencia: true,
      status_codigo: 'SEM_REGISTROS_PAGOS',
      status_conferencia: 'SEM_REGISTROS_PAGOS',
      mensagem:
        'Nenhuma venda paga encontrada para os filtros selecionados. Selecione Data de Vencimento Original, Bandeira e Produto com parcelas pagas.',
    }
  }

  const inputStr = String(valorExtratoBancarioInput ?? '').trim()
  if (!inputStr) {
    return {
      valor_liquido_stone_centavos: liquidoStoneCentavos,
      valor_liquido_stone_micro: liquidoStoneMicro,
      valor_extrato_bancario_centavos: null,
      diferenca_centavos: 0,
      conferencia_aprovada: false,
      bloqueada_para_conferencia: true,
      status_codigo: 'AGUARDANDO_VALOR_BANCO',
      status_conferencia: 'AGUARDANDO_VALOR_BANCO',
      mensagem:
        'Informe o valor líquido depositado no extrato bancário para realizar a conferência.',
    }
  }

  let bancoCentavos: number
  try {
    bancoCentavos = reaisParaCentavos(valorExtratoBancarioInput as string | number)
  } catch {
    return {
      valor_liquido_stone_centavos: liquidoStoneCentavos,
      valor_liquido_stone_micro: liquidoStoneMicro,
      valor_extrato_bancario_centavos: null,
      diferenca_centavos: 0,
      conferencia_aprovada: false,
      bloqueada_para_conferencia: true,
      status_codigo: 'AGUARDANDO_VALOR_BANCO',
      status_conferencia: 'AGUARDANDO_VALOR_BANCO',
      mensagem: 'Formato de valor bancário inválido. Digite o valor em reais (ex: 1.339,61).',
    }
  }

  const diferencaCentavos = bancoCentavos - liquidoStoneCentavos

  if (diferencaCentavos === 0) {
    return {
      valor_liquido_stone_centavos: liquidoStoneCentavos,
      valor_liquido_stone_micro: liquidoStoneMicro,
      valor_extrato_bancario_centavos: bancoCentavos,
      diferenca_centavos: 0,
      conferencia_aprovada: true,
      bloqueada_para_conferencia: false,
      status_codigo: 'APROVADA_EXATA',
      status_conferencia: 'CONFERIDO_EXATO',
      mensagem:
        'Conferência Aprovada (CONFERIDO_EXATO): O valor líquido da Stone corresponde exatamente ao lançamento do extrato bancário.',
    }
  }

  const diffAbsReais = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Math.abs(diferencaCentavos) / 100)

  const sentido =
    diferencaCentavos > 0
      ? `o extrato bancário está ${diffAbsReais} ACIMA do líquido da Stone`
      : `o extrato bancário está ${diffAbsReais} ABAIXO do líquido da Stone`

  return {
    valor_liquido_stone_centavos: liquidoStoneCentavos,
    valor_liquido_stone_micro: liquidoStoneMicro,
    valor_extrato_bancario_centavos: bancoCentavos,
    diferenca_centavos: diferencaCentavos,
    conferencia_aprovada: false,
    bloqueada_para_conferencia: true,
    status_codigo: 'DIVERGENTE_BLOQUEADA',
    status_conferencia: 'DIVERGENTE_BLOQUEADA',
    mensagem: `Divergência detectada de ${diffAbsReais} (${sentido}). A operação está bloqueada e não pode ser marcada como conferida.`,
  }
}

/**
 * Prepara em memória a prévia dos lançamentos do Conta Azul:
 * A) RECEITA: Valor bruto da operação -> Categoria sugerida: "Receitas de Vendas"
 * B) DESPESA: Valor correspondente ao MDR -> Categoria sugerida: "Tarifas de Cartão de Créditos"
 * C) RESULTADO: Valor líquido esperado, comparação com o banco e situação da conferência.
 */
export function gerarPreviaLancamentosMemoriaStone(params: {
  filtros: FiltrosOperacionaisStone
  totais: TotaisFiltradosStone
  conferencia: ResultadoConferenciaBancariaStone
}): PreviaLancamentosMemoriaStone {
  const { filtros, totais, conferencia } = params
  const dataLabel = filtros.data_vencimento_original || 'Todas as Datas'
  const bandeiraLabel = filtros.bandeira || 'Todas as Bandeiras'
  const produtoLabel = filtros.produto || 'Todos os Produtos'

  const sufixoDescricao = `Stone ${bandeiraLabel} ${produtoLabel} — Venc. Orig. ${dataLabel} (${totais.quantidade_parcelas_pagas} parc.)`

  const mdrContabilCentavos = totais.desconto_mdr_ajustado_centavos

  return {
    disponivel: conferencia.conferencia_aprovada,
    motivo_indisponibilidade: conferencia.conferencia_aprovada
      ? undefined
      : conferencia.mensagem,
    filtros_aplicados: {
      data_vencimento_original: dataLabel,
      bandeira: bandeiraLabel,
      produto: produtoLabel,
    },
    receita: {
      tipo: 'RECEITA',
      categoria_sugerida: 'Receitas de Vendas',
      valor_centavos: totais.valor_bruto_centavos,
      valor_micro: totais.valor_bruto_micro,
      descricao_sugerida: `Recebimento Cartão ${sufixoDescricao}`,
    },
    despesa_mdr: {
      tipo: 'DESPESA',
      categoria_sugerida: 'Tarifas de Cartão de Créditos',
      valor_centavos: mdrContabilCentavos,
      valor_micro: totais.desconto_mdr_micro,
      descricao_sugerida: `Taxa MDR ${sufixoDescricao}`,
    },
    resultado: {
      valor_bruto_centavos: totais.valor_bruto_centavos,
      desconto_mdr_centavos: mdrContabilCentavos,
      desconto_antecipacao_centavos: totais.desconto_antecipacao_centavos,
      valor_liquido_esperado_centavos: totais.valor_liquido_centavos,
      valor_deposito_bancario_centavos:
        conferencia.valor_extrato_bancario_centavos ?? 0,
      diferenca_centavos: conferencia.diferenca_centavos,
      situacao_conferencia: conferencia.conferencia_aprovada
        ? 'CONFERENCIA_APROVADA'
        : 'BLOQUEADA_POR_DIVERGENCIA',
    },
  }
}

/**
 * Mapeia uma LinhaExtratoStone para MovimentacaoReceberCanonica (integração com a Fundação 1A).
 */
export function converterLinhaStoneParaCanonica(
  empresaId: string,
  linha: LinhaExtratoStone
): MovimentacaoReceberCanonica {
    const banInfo = classificarBandeiraStoneCanonica(linha.bandeira)
  const prodInfo = classificarProdutoModalidadeStone(
    linha.produto,
    linha.bandeira,
    linha.qtd_parcelas
  )
  const bandeiraCanonica: BandeiraCartao = banInfo.bandeiraCanonica
  let modalidadeCanonica: ModalidadeCartao = 'OUTRA'
  if (prodInfo.modalidadeSigla === 'DB') {
    modalidadeCanonica = 'DEBITO'
  } else if (prodInfo.modalidadeSigla === 'CD') {
    modalidadeCanonica =
      prodInfo.subtipoProduto === 'CREDITO_PARCELADO' || linha.qtd_parcelas > 1
        ? 'CREDITO_PARCELADO'
        : 'CREDITO_VISTA'
  }

  let naturezaCanonica: NaturezaMovimentacaoReceber = 'LIQUIDACAO_VENDA_NORMAL'
  if (linha.classificacao === 'VENDA_COM_ANTECIPACAO') {
    naturezaCanonica = 'ANTECIPACAO_RECEBIVEIS'
  } else if (linha.classificacao === 'ESTORNO_CANCELAMENTO') {
    naturezaCanonica = 'ESTORNO_CANCELAMENTO'
  } else if (
    linha.classificacao === 'AJUSTE_COBRANCA' ||
    linha.classificacao === 'AJUSTE_BALANCEAMENTO_SALDO'
  ) {
    naturezaCanonica = 'AJUSTE_ALUGUEL_TARIFA'
  }

  const mdrAjustado =
    linha.valor_bruto_centavos -
    linha.valor_liquido_centavos -
    linha.desconto_antecipacao_absoluto_centavos

  return {
    id_interno: linha.chave_unica_composta,
    empresa_id: empresaId,
    frente: 'CARTOES_ADQUIRENTE',
    origem: 'STONE',
    natureza: naturezaCanonica,
    data_competencia:
      linha.data_venda_iso || linha.data_vencimento_original_iso,
    data_recebimento: linha.data_vencimento_original_iso,
    valor_bruto_centavos:
      naturezaCanonica === 'AJUSTE_ALUGUEL_TARIFA'
        ? 0
        : linha.valor_bruto_centavos,
    taxa_mdr_centavos:
      naturezaCanonica === 'AJUSTE_ALUGUEL_TARIFA' ? 0 : mdrAjustado,
    taxa_antecipacao_centavos: linha.desconto_antecipacao_absoluto_centavos,
    taxa_total_centavos:
      naturezaCanonica === 'AJUSTE_ALUGUEL_TARIFA'
        ? Math.abs(linha.valor_liquido_centavos)
        : mdrAjustado + linha.desconto_antecipacao_absoluto_centavos,
    valor_liquido_centavos: linha.valor_liquido_centavos,
    estabelecimento_codigo: linha.stonecode,
    nsu_tid: linha.stone_id || null,
    bandeira: bandeiraCanonica,
    modalidade_cartao: modalidadeCanonica,
    parcela_numero: linha.numero_parcela,
    total_parcelas: linha.qtd_parcelas,
    descricao_original: `${linha.categoria} | ${linha.bandeira} ${linha.produto} (${linha.numero_parcela}/${linha.qtd_parcelas})`,
  }
}

// ============================================================================
// ETAPA 1F-A — CONCILIAÇÃO STONE POR DATA + BANDEIRA + MODALIDADE (CD/DB)
// ============================================================================

function normalizarTokenStone(texto: string | null | undefined): string {
  return String(texto || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

export interface ClassificacaoBandeiraStoneCanonica {
  bandeiraCanonica: BandeiraCartao
  siglaContaAzul: string
  tokensAceitosCA: string[]
}

/**
 * Classifica de forma canônica a bandeira da Stone e define a sigla exata utilizada
 * nos lançamentos do Conta Azul (ex: MASTERCARD -> MAST, VISA -> VISA, HIPERCARD -> HIPER).
 */
export function classificarBandeiraStoneCanonica(
  bandeiraRaw: string | null | undefined
): ClassificacaoBandeiraStoneCanonica {
  const norm = normalizarTokenStone(bandeiraRaw)
  if (!norm) {
    return {
      bandeiraCanonica: 'OUTRAS',
      siglaContaAzul: 'OUTRAS',
      tokensAceitosCA: [],
    }
  }

  // Verificar Voucher/Benefício antes para não confundir com bandeiras de crédito/débito padrão
  if (
    /\b(ALELO|SODEXO|PLUXEE|TICKET|VR|VALE|VOUCHER|BEN)\b/.test(norm)
  ) {
    const tokenLimpo = norm.replace(/[^A-Z0-9]/g, '') || 'VOUCHER'
    return {
      bandeiraCanonica: 'OUTRAS',
      siglaContaAzul: tokenLimpo,
      tokensAceitosCA: [tokenLimpo],
    }
  }

  if (/\bVISA\b/.test(norm) || norm.includes('VISA')) {
    return {
      bandeiraCanonica: 'VISA',
      siglaContaAzul: 'VISA',
      tokensAceitosCA: ['VISA'],
    }
  }

  if (
    /\b(MAST|MASTER|MASTERCARD|MAESTRO)\b/.test(norm) ||
    norm.includes('MASTER') ||
    norm.includes('MAST')
  ) {
    return {
      bandeiraCanonica: 'MASTERCARD',
      siglaContaAzul: 'MAST',
      tokensAceitosCA: ['MAST', 'MASTERCARD', 'MASTER'],
    }
  }

  if (/\bELO\b/.test(norm) || norm === 'ELO') {
    return {
      bandeiraCanonica: 'ELO',
      siglaContaAzul: 'ELO',
      tokensAceitosCA: ['ELO'],
    }
  }

  if (
    /\b(AMEX|AMERICAN EXPRESS|AMERICAN)\b/.test(norm) ||
    norm.includes('AMEX') ||
    norm.includes('AMERICAN')
  ) {
    return {
      bandeiraCanonica: 'AMEX',
      siglaContaAzul: 'AMEX',
      tokensAceitosCA: ['AMEX', 'AMERICAN EXPRESS', 'AMERICAN'],
    }
  }

  if (/\b(HIPER|HIPERCARD)\b/.test(norm) || norm.includes('HIPER')) {
    return {
      bandeiraCanonica: 'HIPERCARD',
      siglaContaAzul: 'HIPER',
      tokensAceitosCA: ['HIPER', 'HIPERCARD'],
    }
  }

  if (/\bCABAL\b/.test(norm) || norm.includes('CABAL')) {
    return {
      bandeiraCanonica: 'OUTRAS',
      siglaContaAzul: 'CABAL',
      tokensAceitosCA: ['CABAL'],
    }
  }

  const tokenGenerico = norm.replace(/[^A-Z0-9]/g, '') || 'OUTRAS'
  return {
    bandeiraCanonica: 'OUTRAS',
    siglaContaAzul: tokenGenerico,
    tokensAceitosCA: [tokenGenerico],
  }
}

export interface ClassificacaoProdutoModalidadeStone {
  modalidadeSigla: ModalidadeSiglaStone
  subtipoProduto: SubtipoProdutoStone
  compativelConciliacaoPadraoCdDb: boolean
  descricaoModalidade: string
}

/**
 * Normaliza produtos de crédito para CD e débito para DB, preservando distinções relevantes
 * entre Crédito à vista, Crédito parcelado, Débito, Débito Pré-Pago e outros produtos.
 * NUNCA classifica Voucher, PIX ou produtos incompatíveis como CD/DB.
 */
export function classificarProdutoModalidadeStone(
  produtoRaw: string | null | undefined,
  bandeiraRaw?: string | null | undefined,
  qtdParcelas?: number
): ClassificacaoProdutoModalidadeStone {
  const prodNorm = normalizarTokenStone(produtoRaw)
  const bandNorm = normalizarTokenStone(bandeiraRaw)

  if (!prodNorm) {
    return {
      modalidadeSigla: 'NAO_APLICAVEL',
      subtipoProduto: 'OUTRO',
      compativelConciliacaoPadraoCdDb: false,
      descricaoModalidade: 'Produto não informado',
    }
  }

  // 1. Bloquear estritamente Voucher / Vale / Refeição / Alimentação / Benefício como NAO_APLICAVEL
  if (
    /\b(VOUCHER|VALE|REFEICAO|ALIMENTACAO|BENEFICIO|CULTURA|COMBUSTIVEL|FROTA|ALELO|SODEXO|PLUXEE|TICKET|VR)\b/.test(
      prodNorm
    ) ||
    /\b(VOUCHER|ALELO|SODEXO|PLUXEE|TICKET|VR)\b/.test(bandNorm)
  ) {
    return {
      modalidadeSigla: 'NAO_APLICAVEL',
      subtipoProduto: 'VOUCHER',
      compativelConciliacaoPadraoCdDb: false,
      descricaoModalidade: 'Voucher / Benefício (Não aplicável a CD/DB)',
    }
  }

  // 2. Bloquear PIX / QR Code como NAO_APLICAVEL para conciliação CD/DB de cartão
  if (/\b(PIX|QR CODE|QRCODE)\b/.test(prodNorm) || /\bPIX\b/.test(bandNorm)) {
    return {
      modalidadeSigla: 'NAO_APLICAVEL',
      subtipoProduto: 'PIX',
      compativelConciliacaoPadraoCdDb: false,
      descricaoModalidade: 'PIX (Não aplicável a CD/DB)',
    }
  }

  // 3. Débito e Débito Pré-Pago -> DB
  if (/\b(DEBITO|DB)\b/.test(prodNorm) || prodNorm.includes('DEBITO')) {
    const ehPrePago =
      prodNorm.includes('PRE-PAGO') ||
      prodNorm.includes('PRE PAGO') ||
      prodNorm.includes('PREPAGO')
    return {
      modalidadeSigla: 'DB',
      subtipoProduto: ehPrePago ? 'DEBITO_PRE_PAGO' : 'DEBITO',
      compativelConciliacaoPadraoCdDb: true,
      descricaoModalidade: ehPrePago ? 'Débito Pré-Pago (DB)' : 'Débito (DB)',
    }
  }

  // 4. Crédito, Crédito à vista e Crédito parcelado -> CD
  if (/\b(CREDITO|CD)\b/.test(prodNorm) || prodNorm.includes('CREDITO')) {
    const mencionaParcelado =
      prodNorm.includes('PARCELADO') || prodNorm.includes('PARC')
    const mencionaVista = prodNorm.includes('VISTA')

    let subtipo: SubtipoProdutoStone = 'CREDITO_GENERICO'
    let descricao = 'Crédito (CD)'

    if (mencionaParcelado) {
      subtipo = 'CREDITO_PARCELADO'
      descricao = 'Crédito Parcelado (CD)'
    } else if (mencionaVista) {
      subtipo = 'CREDITO_A_VISTA'
      descricao = 'Crédito à Vista (CD)'
    } else if (typeof qtdParcelas === 'number' && qtdParcelas > 1) {
      subtipo = 'CREDITO_PARCELADO'
      descricao = 'Crédito Parcelado (CD)'
    }

    return {
      modalidadeSigla: 'CD',
      subtipoProduto: subtipo,
      compativelConciliacaoPadraoCdDb: true,
      descricaoModalidade: descricao,
    }
  }

  return {
    modalidadeSigla: 'NAO_APLICAVEL',
    subtipoProduto: 'OUTRO',
    compativelConciliacaoPadraoCdDb: false,
    descricaoModalidade: `Outro Produto (${produtoRaw})`,
  }
}

/**
 * Monta o rótulo canônico de lançamento esperado no Conta Azul para um grupo Stone:
 * Ex: "STONE VISA CD", "STONE MAST CD", "STONE VISA DB", "STONE MAST DB".
 */
export function montarRotuloGrupoStoneContaAzul(
  bandeiraRaw: string,
  produtoRaw: string
): string {
  const banInfo = classificarBandeiraStoneCanonica(bandeiraRaw)
  const prodInfo = classificarProdutoModalidadeStone(produtoRaw, bandeiraRaw)
  if (
    prodInfo.compativelConciliacaoPadraoCdDb &&
    (prodInfo.modalidadeSigla === 'CD' || prodInfo.modalidadeSigla === 'DB')
  ) {
    return `STONE ${banInfo.siglaContaAzul} ${prodInfo.modalidadeSigla}`
  }
  return `STONE ${banInfo.siglaContaAzul} ${normalizarTokenStone(produtoRaw) || 'OUTRO'}`
}

/**
 * Gera a chave canônica determinística de um grupo Stone a partir de Data de Vencimento Original (BR ou ISO),
 * Bandeira e Produto.
 */
export function gerarChaveGrupoStone(params: {
  dataVencimentoOriginal: string
  bandeira: string
  produto: string
}): string {
  const dataRaw = String(params.dataVencimentoOriginal || '').trim()
  const dataIso =
    (/^\d{4}-\d{2}-\d{2}$/.test(dataRaw)
      ? dataRaw
      : parseDataBrParaIso(dataRaw)) || dataRaw
  const banInfo = classificarBandeiraStoneCanonica(params.bandeira)
  const prodInfo = classificarProdutoModalidadeStone(
    params.produto,
    params.bandeira
  )
  const prodNorm = normalizarTokenStone(params.produto)
  return `${dataIso}|${banInfo.siglaContaAzul}|${prodInfo.modalidadeSigla}|${prodNorm}`
}

/**
 * Agrupa as linhas do CSV da Stone de forma independente por:
 * Data de Vencimento Original + Bandeira + Modalidade (CD/DB) + Produto (preservando distinções relevantes).
 * Cada grupo possui seus próprios totais em micro e centavos, além de todas as 3 datas do CSV.
 */
export function agruparLinhasStonePorDataBandeiraModalidade(
  linhas: LinhaExtratoStone[],
  opcoes?: {
    apenasComParcelasPagas?: boolean
    agruparSubprodutosDaMesmaModalidade?: boolean
  }
): GrupoConciliacaoStone[] {
  const apenasPagas = opcoes?.apenasComParcelasPagas ?? true
  const agruparSubprodutos =
    opcoes?.agruparSubprodutosDaMesmaModalidade ?? false

  const mapaGrupos = new Map<string, LinhaExtratoStone[]>()
  const produtosPorDataBandeiraModalidade = new Map<string, Set<string>>()

  for (const linha of linhas) {
    if (!linha.data_vencimento_original_iso || !linha.bandeira || !linha.produto) {
      continue
    }

    const banInfo = classificarBandeiraStoneCanonica(linha.bandeira)
    const prodInfo = classificarProdutoModalidadeStone(
      linha.produto,
      linha.bandeira,
      linha.qtd_parcelas
    )
    const prodNorm = normalizarTokenStone(linha.produto)
    const chaveDataBandMod = `${linha.data_vencimento_original_iso}|${banInfo.siglaContaAzul}|${prodInfo.modalidadeSigla}`

    let conjProdutos = produtosPorDataBandeiraModalidade.get(chaveDataBandMod)
    if (!conjProdutos) {
      conjProdutos = new Set<string>()
      produtosPorDataBandeiraModalidade.set(chaveDataBandMod, conjProdutos)
    }
    conjProdutos.add(prodNorm)

    const chaveGrupo = agruparSubprodutos
      ? `${chaveDataBandMod}|*`
      : `${chaveDataBandMod}|${prodNorm}`

    const bucket = mapaGrupos.get(chaveGrupo)
    if (bucket) {
      bucket.push(linha)
    } else {
      mapaGrupos.set(chaveGrupo, [linha])
    }
  }

  const grupos: GrupoConciliacaoStone[] = []

  for (const [chaveGrupo, linhasGrupo] of mapaGrupos.entries()) {
    const totais = calcularTotaisFiltradosStone(linhasGrupo)
    if (apenasPagas && totais.quantidade_parcelas_pagas === 0) {
      continue
    }

    const primeira = linhasGrupo[0]
    const banInfo = classificarBandeiraStoneCanonica(primeira.bandeira)
    const prodInfo = classificarProdutoModalidadeStone(
      primeira.produto,
      primeira.bandeira,
      primeira.qtd_parcelas
    )
    const chaveDataBandMod = `${primeira.data_vencimento_original_iso}|${banInfo.siglaContaAzul}|${prodInfo.modalidadeSigla}`
    const conjProdutos =
      produtosPorDataBandeiraModalidade.get(chaveDataBandMod) || new Set()

    const datasVendaIsoSet = new Set<string>()
    const datasVencBrSet = new Set<string>()
    const datasVencIsoSet = new Set<string>()
    const datasStatusBrSet = new Set<string>()
    const datasStatusIsoSet = new Set<string>()

    for (const l of linhasGrupo) {
      if (l.data_venda_iso) datasVendaIsoSet.add(l.data_venda_iso)
      if (l.data_vencimento_str) datasVencBrSet.add(l.data_vencimento_str)
      if (l.data_vencimento_iso) datasVencIsoSet.add(l.data_vencimento_iso)
      if (l.data_ultimo_status_str) {
        datasStatusBrSet.add(l.data_ultimo_status_str)
        const isoStatus = parseDataBrParaIso(l.data_ultimo_status_str)
        if (isoStatus) datasStatusIsoSet.add(isoStatus)
      }
    }

    const datasVencIso = Array.from(datasVencIsoSet).sort()
    const datasStatusIso = Array.from(datasStatusIsoSet).sort()
    const dataVencOrigIso = primeira.data_vencimento_original_iso

    const possuiLiquidacaoDistinta =
      datasVencIso.some((d) => d !== dataVencOrigIso) ||
      datasStatusIso.some((d) => d !== dataVencOrigIso)

    const rotuloEsperado = montarRotuloGrupoStoneContaAzul(
      primeira.bandeira,
      primeira.produto
    )

    grupos.push({
      chave_grupo: chaveGrupo,
      chave_data_bandeira_modalidade: chaveDataBandMod,
      rotulo_conta_azul_esperado: rotuloEsperado,
      data_vencimento_original_br: primeira.data_vencimento_original_str,
      data_vencimento_original_iso: dataVencOrigIso,
      datas_venda_iso: Array.from(datasVendaIsoSet).sort(),
      datas_vencimento_br: Array.from(datasVencBrSet),
      datas_vencimento_iso: datasVencIso,
      datas_ultimo_status_br: Array.from(datasStatusBrSet),
      datas_ultimo_status_iso: datasStatusIso,
      possui_liquidacao_em_data_distinta: possuiLiquidacaoDistinta,
      bandeira_original: primeira.bandeira,
      bandeira_canonica: banInfo.bandeiraCanonica,
      bandeira_sigla_conta_azul: banInfo.siglaContaAzul,
      modalidade_sigla: prodInfo.modalidadeSigla,
      subtipo_produto: prodInfo.subtipoProduto,
      produto_original: agruparSubprodutos
        ? Array.from(new Set(linhasGrupo.map((l) => l.produto))).join(' + ')
        : primeira.produto,
      compativel_conciliacao_padrao_cd_db:
        prodInfo.compativelConciliacaoPadraoCdDb,
      possui_multiplos_produtos_na_mesma_modalidade: conjProdutos.size > 1,
      linhas: linhasGrupo,
      totais,
    })
  }

  return grupos.sort((a, b) => {
    const cmpData = a.data_vencimento_original_iso.localeCompare(
      b.data_vencimento_original_iso
    )
    if (cmpData !== 0) return cmpData
    const cmpBand = a.bandeira_sigla_conta_azul.localeCompare(
      b.bandeira_sigla_conta_azul
    )
    if (cmpBand !== 0) return cmpBand
    const cmpMod = a.modalidade_sigla.localeCompare(b.modalidade_sigla)
    if (cmpMod !== 0) return cmpMod
    return a.produto_original.localeCompare(b.produto_original, 'pt-BR')
  })
}

/**
 * Calcula a janela de consulta GET para a Conta Azul cobrindo as 3 datas do CSV:
 * - data_vencimento_original_iso
 * - data_vencimento_iso
 * - data_ultimo_status_iso
 * Garante que o intervalo [minIso, maxIso] nunca ultrapasse o limite de 15 dias da API Conta Azul.
 */
export function calcularJanelaConsultaContaAzulStone(
  linhas: LinhaExtratoStone[],
  dataVencimentoOriginalFiltroBr?: string
): {
  minIso: string
  maxIso: string
  datasVencimentoOriginalIso: string[]
  datasLiquidacaoEfetivaIso: string[]
} | null {
  if (!linhas || linhas.length === 0) return null

  const filtroDataBr = String(dataVencimentoOriginalFiltroBr || '').trim()
  const baseLinhas = filtroDataBr
    ? linhas.filter((l) => l.data_vencimento_original_str === filtroDataBr)
    : linhas

  const datasVencOrigSet = new Set<string>()
  const datasLiqSet = new Set<string>()
  const todasDatasSet = new Set<string>()

  for (const l of baseLinhas) {
    if (
      l.data_vencimento_original_iso &&
      /^\d{4}-\d{2}-\d{2}$/.test(l.data_vencimento_original_iso)
    ) {
      datasVencOrigSet.add(l.data_vencimento_original_iso)
      todasDatasSet.add(l.data_vencimento_original_iso)
    }
    if (l.data_vencimento_iso && /^\d{4}-\d{2}-\d{2}$/.test(l.data_vencimento_iso)) {
      datasLiqSet.add(l.data_vencimento_iso)
      todasDatasSet.add(l.data_vencimento_iso)
    }
    if (l.data_ultimo_status_str) {
      const isoStatus = parseDataBrParaIso(l.data_ultimo_status_str)
      if (isoStatus && /^\d{4}-\d{2}-\d{2}$/.test(isoStatus)) {
        datasLiqSet.add(isoStatus)
        todasDatasSet.add(isoStatus)
      }
    }
  }

  const todasDatas = Array.from(todasDatasSet).sort()
  if (todasDatas.length === 0) return null

  const minRaw = todasDatas[0]
  const maxRaw = todasDatas[todasDatas.length - 1]

  // Respeitar estritamente o limite máximo de 15 dias da API Conta Azul (diferença <= 14 dias)
  const msPorDia = 24 * 60 * 60 * 1000
  const dtMin = new Date(`${minRaw}T00:00:00Z`)
  const dtMax = new Date(`${maxRaw}T00:00:00Z`)
  const diffDias = Math.round((dtMax.getTime() - dtMin.getTime()) / msPorDia)

  let minIso = minRaw
  let maxIso = maxRaw

  if (diffDias > 14) {
    const datasOrig = Array.from(datasVencOrigSet).sort()
    const ancoraIso = datasOrig[0] || minRaw
    const dtAncora = new Date(`${ancoraIso}T00:00:00Z`)
    const dtLimite = new Date(dtAncora.getTime() + 14 * msPorDia)
    minIso = ancoraIso
    maxIso =
      dtMax.getTime() <= dtLimite.getTime()
        ? maxRaw
        : dtLimite.toISOString().slice(0, 10)
  }

  return {
    minIso,
    maxIso,
    datasVencimentoOriginalIso: Array.from(datasVencOrigSet).sort(),
    datasLiquidacaoEfetivaIso: Array.from(datasLiqSet).sort(),
  }
}

export interface AssinaturaStoneLancamentoContaAzul {
  ehLancamentoStone: boolean
  bandeiraCanonica: BandeiraCartao | null
  bandeiraSiglaContaAzul: string | null
  modalidadeSigla: ModalidadeSiglaStone | null
  subtipoProdutoExplicito: SubtipoProdutoStone | null
  ehReceitaBrutaGeradaDcx: boolean
  ehDespesaMdrGeradaDcx: boolean
}

/**
 * Extrai a assinatura operacional (STONE + Bandeira + Modalidade CD/DB) de um lançamento
 * existente retornado pela Conta Azul (ex: "STONE VISA CD", "STONE MAST CD", "STONE VISA DB").
 * Nunca confunde bandeiras nem trata igualdade de valor isoladamente como correspondência.
 */
export function extrairAssinaturaStoneLancamentoContaAzul(
  lancamento: Pick<
    LancamentoExistenteContaAzulDTO,
    | 'descricao'
    | 'observacao'
    | 'contato_nome'
    | 'numero_documento'
    | 'tipo_lancamento'
  >
): AssinaturaStoneLancamentoContaAzul {
  const descNorm = normalizarTokenStone(lancamento.descricao)
  const obsNorm = normalizarTokenStone(lancamento.observacao)
  const contatoNorm = normalizarTokenStone(lancamento.contato_nome)
  const docNorm = normalizarTokenStone(lancamento.numero_documento)

  const textoPrincipal = `${descNorm} ${docNorm}`.trim()
  const textoCompleto = `${descNorm} ${obsNorm} ${contatoNorm} ${docNorm}`.trim()

  const ehLancamentoStone =
    /\bSTONE\b/.test(textoCompleto) || textoCompleto.includes('STONE')

  const ehReceitaBrutaGeradaDcx =
    descNorm.includes('RECEBIMENTO CARTAO STONE') ||
    obsNorm.includes('RECEITA_BRUTA_1FA')

  const ehDespesaMdrGeradaDcx =
    descNorm.includes('TAXA MDR STONE') || obsNorm.includes('DESPESA_MDR_1FA')

  // Identificar bandeira com prioridade para a descrição principal do lançamento
  let bandeiraCanonica: BandeiraCartao | null = null
  let bandeiraSiglaContaAzul: string | null = null

  const detectarBandeiraEm = (alvo: string) => {
    const temVisa = /\bVISA\b/.test(alvo)
    const temMast = /\b(MAST|MASTERCARD|MASTER|MAESTRO)\b/.test(alvo)
    const temElo = /\bELO\b/.test(alvo)
    const temAmex = /\b(AMEX|AMERICAN EXPRESS|AMERICAN)\b/.test(alvo)
    const temHiper = /\b(HIPER|HIPERCARD)\b/.test(alvo)
    const temCabal = /\bCABAL\b/.test(alvo)

    const qtdBandeiras = [
      temVisa,
      temMast,
      temElo,
      temAmex,
      temHiper,
      temCabal,
    ].filter(Boolean).length

    // Se o texto mencionar mais de uma bandeira ao mesmo tempo, não assumimos bandeira única
    if (qtdBandeiras !== 1) return null

    if (temVisa) return { canon: 'VISA' as BandeiraCartao, sigla: 'VISA' }
    if (temMast) return { canon: 'MASTERCARD' as BandeiraCartao, sigla: 'MAST' }
    if (temElo) return { canon: 'ELO' as BandeiraCartao, sigla: 'ELO' }
    if (temAmex) return { canon: 'AMEX' as BandeiraCartao, sigla: 'AMEX' }
    if (temHiper) return { canon: 'HIPERCARD' as BandeiraCartao, sigla: 'HIPER' }
    if (temCabal) return { canon: 'OUTRAS' as BandeiraCartao, sigla: 'CABAL' }
    return null
  }

  const bandDetectada =
    detectarBandeiraEm(textoPrincipal) || detectarBandeiraEm(textoCompleto)
  if (bandDetectada) {
    bandeiraCanonica = bandDetectada.canon
    bandeiraSiglaContaAzul = bandDetectada.sigla
  }

  // Identificar modalidade (CD vs DB) sem confundir com Voucher/PIX
  let modalidadeSigla: ModalidadeSiglaStone | null = null
  let subtipoProdutoExplicito: SubtipoProdutoStone | null = null

  const detectarModalidadeEm = (alvo: string) => {
    if (/\b(VOUCHER|VALE|REFEICAO|ALIMENTACAO|PIX)\b/.test(alvo)) {
      return {
        mod: 'NAO_APLICAVEL' as ModalidadeSiglaStone,
        sub: /\bPIX\b/.test(alvo)
          ? ('PIX' as SubtipoProdutoStone)
          : ('VOUCHER' as SubtipoProdutoStone),
      }
    }

    const temCredito = /\b(CD|CREDITO|CRED)\b/.test(alvo)
    const temDebito = /\b(DB|DEBITO|DEB)\b/.test(alvo)

    if (temCredito && !temDebito) {
      let sub: SubtipoProdutoStone | null = null
      if (alvo.includes('PARCELADO') || alvo.includes('PARC')) {
        sub = 'CREDITO_PARCELADO'
      } else if (alvo.includes('VISTA')) {
        sub = 'CREDITO_A_VISTA'
      }
      return { mod: 'CD' as ModalidadeSiglaStone, sub }
    }

    if (temDebito && !temCredito) {
      let sub: SubtipoProdutoStone | null = null
      if (
        alvo.includes('PRE-PAGO') ||
        alvo.includes('PRE PAGO') ||
        alvo.includes('PREPAGO')
      ) {
        sub = 'DEBITO_PRE_PAGO'
      } else if (alvo.includes('DEBITO')) {
        sub = 'DEBITO'
      }
      return { mod: 'DB' as ModalidadeSiglaStone, sub }
    }

    return null
  }

  const modDetectada =
    detectarModalidadeEm(textoPrincipal) || detectarModalidadeEm(textoCompleto)
  if (modDetectada) {
    modalidadeSigla = modDetectada.mod
    subtipoProdutoExplicito = modDetectada.sub
  }

  return {
    ehLancamentoStone,
    bandeiraCanonica,
    bandeiraSiglaContaAzul,
    modalidadeSigla,
    subtipoProdutoExplicito,
    ehReceitaBrutaGeradaDcx,
    ehDespesaMdrGeradaDcx,
  }
}

/**
 * Verifica se as datas de um lançamento da Conta Azul correspondem a qualquer uma das 3 datas
 * válidas do grupo Stone (Data de Vencimento Original, Data de Vencimento ou Data do Último Status).
 */
export function verificarCorrespondenciaDataGrupoStone(
  grupo: Pick<
    GrupoConciliacaoStone,
    | 'data_vencimento_original_iso'
    | 'datas_vencimento_iso'
    | 'datas_ultimo_status_iso'
  >,
  lancamento: Pick<
    LancamentoExistenteContaAzulDTO,
    'data_vencimento' | 'data_competencia' | 'data_pagamento'
  >
): {
  corresponde: boolean
  dataCorrespondenciaIso: string | null
  campoDataCorrespondencia:
    | 'DATA_VENCIMENTO_ORIGINAL'
    | 'DATA_VENCIMENTO'
    | 'DATA_ULTIMO_STATUS'
    | null
} {
  const datasLancamento = [
    lancamento.data_vencimento,
    lancamento.data_pagamento || '',
    lancamento.data_competencia || '',
  ]
    .map((d) => String(d || '').slice(0, 10))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))

  if (datasLancamento.includes(grupo.data_vencimento_original_iso)) {
    return {
      corresponde: true,
      dataCorrespondenciaIso: grupo.data_vencimento_original_iso,
      campoDataCorrespondencia: 'DATA_VENCIMENTO_ORIGINAL',
    }
  }

  for (const dtVenc of grupo.datas_vencimento_iso) {
    if (datasLancamento.includes(dtVenc)) {
      return {
        corresponde: true,
        dataCorrespondenciaIso: dtVenc,
        campoDataCorrespondencia: 'DATA_VENCIMENTO',
      }
    }
  }

  for (const dtStatus of grupo.datas_ultimo_status_iso) {
    if (datasLancamento.includes(dtStatus)) {
      return {
        corresponde: true,
        dataCorrespondenciaIso: dtStatus,
        campoDataCorrespondencia: 'DATA_ULTIMO_STATUS',
      }
    }
  }

  return {
    corresponde: false,
    dataCorrespondenciaIso: null,
    campoDataCorrespondencia: null,
  }
}

/**
 * Executa a conciliação individual de um único grupo Stone (Data + Bandeira + Modalidade CD/DB)
 * contra os lançamentos retornados pela Conta Azul (GET) e/ou conferência manual daquele grupo.
 *
 * Estados suportados por grupo:
 * - CONFERIDO_EXATO
 * - DIVERGENTE_BLOQUEADA
 * - AUSENTE_CONTA_AZUL
 * - DUPLICIDADE_AMBIGUA_CA
 * - AGUARDANDO_CONFERENCIA
 */
export function conciliarGrupoStoneComContaAzul(params: {
  grupo: GrupoConciliacaoStone
  avaliacaoPeriodoCA?: AvaliacaoPeriodoContaAzulStoneDTO | null
  valorManualGrupoInput?: string | number | null
  gruposIrmaosMesmaModalidade?: GrupoConciliacaoStone[]
}): ResultadoConciliacaoGrupoStone {
  const {
    grupo,
    avaliacaoPeriodoCA = null,
    valorManualGrupoInput = null,
    gruposIrmaosMesmaModalidade = [],
  } = params

  const liquidoStoneCentavos = grupo.totais.valor_liquido_centavos
  const liquidoStoneMicro = grupo.totais.valor_liquido_micro
  const rotulo = grupo.rotulo_conta_azul_esperado

  // 1. Bloquear produtos incompatíveis com a conciliação padrão CD/DB (ex: Voucher, PIX)
  if (
    !grupo.compativel_conciliacao_padrao_cd_db ||
    (grupo.modalidade_sigla !== 'CD' && grupo.modalidade_sigla !== 'DB')
  ) {
    return {
      chave_grupo: grupo.chave_grupo,
      rotulo_grupo: rotulo,
      estado_grupo: 'DIVERGENTE_BLOQUEADA',
      origem_conferencia: 'NAO_CONFERIDO',
      valor_liquido_stone_centavos: liquidoStoneCentavos,
      valor_liquido_stone_micro: liquidoStoneMicro,
      valor_extrato_bancario_centavos: null,
      diferenca_centavos: 0,
      conferencia_aprovada: false,
      bloqueada_para_conferencia: true,
      status_codigo: 'DIVERGENTE_BLOQUEADA',
      status_conferencia: 'DIVERGENTE_BLOQUEADA',
      lancamento_conta_azul_correspondente: null,
      candidatos_conta_azul: [],
      data_correspondencia_iso: null,
      campo_data_correspondencia: null,
      mensagem: `Produto "${grupo.produto_original}" (${grupo.bandeira_original}) não pertence às modalidades padrão de Crédito (CD) ou Débito (DB) e está bloqueado para conciliação automática CD/DB.`,
    }
  }

  // 2. Sem parcelas pagas no grupo
  if (grupo.totais.quantidade_parcelas_pagas === 0 || liquidoStoneCentavos <= 0) {
    return {
      chave_grupo: grupo.chave_grupo,
      rotulo_grupo: rotulo,
      estado_grupo: 'AGUARDANDO_CONFERENCIA',
      origem_conferencia: 'NAO_CONFERIDO',
      valor_liquido_stone_centavos: liquidoStoneCentavos,
      valor_liquido_stone_micro: liquidoStoneMicro,
      valor_extrato_bancario_centavos: null,
      diferenca_centavos: 0,
      conferencia_aprovada: false,
      bloqueada_para_conferencia: true,
      status_codigo: 'SEM_REGISTROS_PAGOS',
      status_conferencia: 'SEM_REGISTROS_PAGOS',
      lancamento_conta_azul_correspondente: null,
      candidatos_conta_azul: [],
      data_correspondencia_iso: null,
      campo_data_correspondencia: null,
      mensagem: `Nenhuma parcela paga encontrada para o grupo ${rotulo} (${grupo.produto_original}) em ${grupo.data_vencimento_original_br}.`,
    }
  }

  // 3. Se houve consulta GET à Conta Azul, buscar candidatos com a assinatura EXATA do grupo:
  //    STONE + Bandeira Canônica + Modalidade (CD/DB) + Data compatível (3 datas do CSV)
  if (avaliacaoPeriodoCA) {
    const receitasCA = avaliacaoPeriodoCA.receitas_no_periodo || []

    const candidatosAssinaturaData: Array<{
      lancamento: LancamentoExistenteContaAzulDTO
      dataCorrespondenciaIso: string
      campoDataCorrespondencia:
        | 'DATA_VENCIMENTO_ORIGINAL'
        | 'DATA_VENCIMENTO'
        | 'DATA_ULTIMO_STATUS'
      assinatura: AssinaturaStoneLancamentoContaAzul
    }> = []

    for (const rec of receitasCA) {
      if (rec.tipo_lancamento && rec.tipo_lancamento !== 'RECEITA') continue

      const assinatura = extrairAssinaturaStoneLancamentoContaAzul(rec)
      // Ignorar lançamentos que já sejam a Receita Bruta gerada pelo próprio DCX LINK
      if (assinatura.ehReceitaBrutaGeradaDcx) continue

      // Exigir obrigatoriamente STONE + mesma Bandeira + mesma Modalidade (CD ou DB)
      // NUNCA aceitar igualdade de valor isoladamente nem trocar bandeira/modalidade!
      if (!assinatura.ehLancamentoStone) continue
      if (assinatura.bandeiraSiglaContaAzul !== grupo.bandeira_sigla_conta_azul) {
        continue
      }
      if (assinatura.modalidadeSigla !== grupo.modalidade_sigla) {
        continue
      }

      // Se o lançamento da Conta Azul explicitar um subtipo de produto diferente (ex: vista vs parcelado), respeitar a distinção
      if (
        assinatura.subtipoProdutoExplicito &&
        grupo.subtipo_produto !== 'CREDITO_GENERICO' &&
        assinatura.subtipoProdutoExplicito !== grupo.subtipo_produto
      ) {
        continue
      }

      const matchData = verificarCorrespondenciaDataGrupoStone(grupo, rec)
      if (!matchData.corresponde || !matchData.dataCorrespondenciaIso || !matchData.campoDataCorrespondencia) {
        continue
      }

      candidatosAssinaturaData.push({
        lancamento: rec,
        dataCorrespondenciaIso: matchData.dataCorrespondenciaIso,
        campoDataCorrespondencia: matchData.campoDataCorrespondencia,
        assinatura,
      })
    }

    // Se houver múltiplos subprodutos na mesma modalidade no CSV (ex: Crédito à vista e Crédito parcelado no mesmo dia)
    // e mais de um candidato na Conta Azul sem distinção textual de subproduto, podemos filtrar pelo valor exato
    // SOMENTE se houver exatamente 1 candidato com o valor exato deste grupo e nenhum grupo irmão tiver o mesmo valor.
    let candidatosFinais = candidatosAssinaturaData
    if (
      candidatosAssinaturaData.length > 1 &&
      grupo.possui_multiplos_produtos_na_mesma_modalidade
    ) {
      const comValorExato = candidatosAssinaturaData.filter(
        (c) => c.lancamento.valor_total_centavos === liquidoStoneCentavos
      )
      const irmaoComMesmoValor = gruposIrmaosMesmaModalidade.some(
        (irmao) =>
          irmao.chave_grupo !== grupo.chave_grupo &&
          irmao.chave_data_bandeira_modalidade ===
            grupo.chave_data_bandeira_modalidade &&
          irmao.totais.valor_liquido_centavos === liquidoStoneCentavos
      )
      if (comValorExato.length === 1 && !irmaoComMesmoValor) {
        candidatosFinais = comValorExato
      }
    }

    // Proteção extra: se apenas 1 candidato genérico na Conta Azul (ex: STONE VISA CD) é disputado por 2 grupos irmãos
    // que possuem exatamente o MESMO valor líquido, bloquear por ambiguidade!
    const irmaoDeMesmoValorDisputandoMesmoCandidato =
      candidatosFinais.length === 1 &&
      gruposIrmaosMesmaModalidade.some(
        (irmao) =>
          irmao.chave_grupo !== grupo.chave_grupo &&
          irmao.chave_data_bandeira_modalidade ===
            grupo.chave_data_bandeira_modalidade &&
          irmao.totais.valor_liquido_centavos === liquidoStoneCentavos
      )

    if (
      candidatosFinais.length > 1 ||
      irmaoDeMesmoValorDisputandoMesmoCandidato
    ) {
      return {
        chave_grupo: grupo.chave_grupo,
        rotulo_grupo: rotulo,
        estado_grupo: 'DUPLICIDADE_AMBIGUA_CA',
        origem_conferencia: 'NAO_CONFERIDO',
        valor_liquido_stone_centavos: liquidoStoneCentavos,
        valor_liquido_stone_micro: liquidoStoneMicro,
        valor_extrato_bancario_centavos: null,
        diferenca_centavos: 0,
        conferencia_aprovada: false,
        bloqueada_para_conferencia: true,
        status_codigo: 'DUPLICIDADE_AMBIGUA_CA',
        status_conferencia: 'DUPLICIDADE_AMBIGUA_CA',
        lancamento_conta_azul_correspondente: null,
        candidatos_conta_azul: candidatosFinais.map((c) => c.lancamento),
        data_correspondencia_iso: null,
        campo_data_correspondencia: null,
        mensagem: `Duplicidade ou ambiguidade detectada na Conta Azul para ${rotulo}: foram encontrados ${candidatosFinais.length} lançamentos candidatos no período. Aprovação automática e manual bloqueada até revisão.`,
      }
    }

    if (candidatosFinais.length === 1) {
      const unico = candidatosFinais[0]
      const valorContaAzulCentavos = unico.lancamento.valor_total_centavos
      const diffCA = valorContaAzulCentavos - liquidoStoneCentavos

      // Se o usuário também preencheu valor manual e ele diverge do líquido da Stone, bloquear
      const inputManualStr = String(valorManualGrupoInput ?? '').trim()
      if (inputManualStr) {
        try {
          const manualCentavos = reaisParaCentavos(
            valorManualGrupoInput as string | number
          )
          if (manualCentavos !== liquidoStoneCentavos) {
            const diffManual = manualCentavos - liquidoStoneCentavos
            const diffReais = formatarCentavosBRL(Math.abs(diffManual))
            return {
              chave_grupo: grupo.chave_grupo,
              rotulo_grupo: rotulo,
              estado_grupo: 'DIVERGENTE_BLOQUEADA',
              origem_conferencia: 'MANUAL_POR_GRUPO',
              valor_liquido_stone_centavos: liquidoStoneCentavos,
              valor_liquido_stone_micro: liquidoStoneMicro,
              valor_extrato_bancario_centavos: manualCentavos,
              diferenca_centavos: diffManual,
              conferencia_aprovada: false,
              bloqueada_para_conferencia: true,
              status_codigo: 'DIVERGENTE_BLOQUEADA',
              status_conferencia: 'DIVERGENTE_BLOQUEADA',
              lancamento_conta_azul_correspondente: unico.lancamento,
              candidatos_conta_azul: [unico.lancamento],
              data_correspondencia_iso: unico.dataCorrespondenciaIso,
              campo_data_correspondencia: unico.campoDataCorrespondencia,
              mensagem: `Divergência de ${diffReais} no valor manual informado para o grupo ${rotulo}. Operação bloqueada.`,
            }
          }
        } catch {
          // Segue avaliação pelo lançamento da Conta Azul se o input manual for inválido
        }
      }

      if (diffCA === 0) {
        return {
          chave_grupo: grupo.chave_grupo,
          rotulo_grupo: rotulo,
          estado_grupo: 'CONFERIDO_EXATO',
          origem_conferencia: 'AUTOMATICA_GET_CONTA_AZUL',
          valor_liquido_stone_centavos: liquidoStoneCentavos,
          valor_liquido_stone_micro: liquidoStoneMicro,
          valor_extrato_bancario_centavos: valorContaAzulCentavos,
          diferenca_centavos: 0,
          conferencia_aprovada: true,
          bloqueada_para_conferencia: false,
          status_codigo: 'APROVADA_EXATA',
          status_conferencia: 'CONFERIDO_EXATO',
          lancamento_conta_azul_correspondente: unico.lancamento,
          candidatos_conta_azul: [unico.lancamento],
          data_correspondencia_iso: unico.dataCorrespondenciaIso,
          campo_data_correspondencia: unico.campoDataCorrespondencia,
          mensagem: `Conferência Aprovada (${rotulo}): valor líquido da Stone (${formatarCentavosBRL(liquidoStoneCentavos)}) confere exatamente com o lançamento "${unico.lancamento.descricao}" na Conta Azul.`,
        }
      }

      const diffAbsReais = formatarCentavosBRL(Math.abs(diffCA))
      const sentido =
        diffCA > 0
          ? `o lançamento na Conta Azul (${formatarCentavosBRL(valorContaAzulCentavos)}) está ${diffAbsReais} ACIMA do líquido da Stone (${formatarCentavosBRL(liquidoStoneCentavos)})`
          : `o lançamento na Conta Azul (${formatarCentavosBRL(valorContaAzulCentavos)}) está ${diffAbsReais} ABAIXO do líquido da Stone (${formatarCentavosBRL(liquidoStoneCentavos)})`

      return {
        chave_grupo: grupo.chave_grupo,
        rotulo_grupo: rotulo,
        estado_grupo: 'DIVERGENTE_BLOQUEADA',
        origem_conferencia: 'AUTOMATICA_GET_CONTA_AZUL',
        valor_liquido_stone_centavos: liquidoStoneCentavos,
        valor_liquido_stone_micro: liquidoStoneMicro,
        valor_extrato_bancario_centavos: valorContaAzulCentavos,
        diferenca_centavos: diffCA,
        conferencia_aprovada: false,
        bloqueada_para_conferencia: true,
        status_codigo: 'DIVERGENTE_BLOQUEADA',
        status_conferencia: 'DIVERGENTE_BLOQUEADA',
        lancamento_conta_azul_correspondente: unico.lancamento,
        candidatos_conta_azul: [unico.lancamento],
        data_correspondencia_iso: unico.dataCorrespondenciaIso,
        campo_data_correspondencia: unico.campoDataCorrespondencia,
        mensagem: `Divergência detectada no grupo ${rotulo}: ${sentido}. O grupo está bloqueado.`,
      }
    }

    // candidatosFinais.length === 0 na Conta Azul:
    // Permite conferência manual por grupo caso o usuário informe o valor líquido daquele grupo;
    // caso contrário, permanece como AUSENTE_CONTA_AZUL (nunca aprova automaticamente!).
    const inputManualStr = String(valorManualGrupoInput ?? '').trim()
    if (inputManualStr) {
      const confManual = conferirValorLiquidoComExtratoBancario(
        grupo.totais,
        valorManualGrupoInput
      )
      const estadoManual: EstadoConferenciaGrupoStone =
        confManual.conferencia_aprovada
          ? 'CONFERIDO_EXATO'
          : confManual.status_codigo === 'DIVERGENTE_BLOQUEADA'
            ? 'DIVERGENTE_BLOQUEADA'
            : 'AUSENTE_CONTA_AZUL'

      return {
        ...confManual,
        chave_grupo: grupo.chave_grupo,
        rotulo_grupo: rotulo,
        estado_grupo: estadoManual,
        origem_conferencia: confManual.conferencia_aprovada
          ? 'MANUAL_POR_GRUPO'
          : 'MANUAL_POR_GRUPO',
        lancamento_conta_azul_correspondente: null,
        candidatos_conta_azul: [],
        data_correspondencia_iso: null,
        campo_data_correspondencia: null,
        mensagem: confManual.conferencia_aprovada
          ? `Conferência Manual por Grupo Aprovada (${rotulo}): valor líquido da Stone (${formatarCentavosBRL(liquidoStoneCentavos)}) conferido individualmente (lançamento não localizado no GET automático da Conta Azul).`
          : `${confManual.mensagem} (Grupo: ${rotulo})`,
      }
    }

    return {
      chave_grupo: grupo.chave_grupo,
      rotulo_grupo: rotulo,
      estado_grupo: 'AUSENTE_CONTA_AZUL',
      origem_conferencia: 'NAO_CONFERIDO',
      valor_liquido_stone_centavos: liquidoStoneCentavos,
      valor_liquido_stone_micro: liquidoStoneMicro,
      valor_extrato_bancario_centavos: null,
      diferenca_centavos: 0,
      conferencia_aprovada: false,
      bloqueada_para_conferencia: true,
      status_codigo: 'AUSENTE_CONTA_AZUL',
      status_conferencia: 'AUSENTE_CONTA_AZUL',
      lancamento_conta_azul_correspondente: null,
      candidatos_conta_azul: [],
      data_correspondencia_iso: null,
      campo_data_correspondencia: null,
      mensagem: `Nenhum lançamento "${rotulo}" foi localizado na Conta Azul para as datas deste grupo (${grupo.data_vencimento_original_br}). Verifique na Conta Azul ou informe o valor manual deste grupo.`,
    }
  }

  // 4. Sem consulta GET à Conta Azul: avaliar conferência manual individual do grupo (se preenchida)
  const inputManualStr = String(valorManualGrupoInput ?? '').trim()
  if (inputManualStr) {
    const confManual = conferirValorLiquidoComExtratoBancario(
      grupo.totais,
      valorManualGrupoInput
    )
    const estadoManual: EstadoConferenciaGrupoStone =
      confManual.conferencia_aprovada
        ? 'CONFERIDO_EXATO'
        : confManual.status_codigo === 'DIVERGENTE_BLOQUEADA'
          ? 'DIVERGENTE_BLOQUEADA'
          : 'AGUARDANDO_CONFERENCIA'

    return {
      ...confManual,
      chave_grupo: grupo.chave_grupo,
      rotulo_grupo: rotulo,
      estado_grupo: estadoManual,
      origem_conferencia: 'MANUAL_POR_GRUPO',
      lancamento_conta_azul_correspondente: null,
      candidatos_conta_azul: [],
      data_correspondencia_iso: null,
      campo_data_correspondencia: null,
      mensagem: confManual.conferencia_aprovada
        ? `Conferência por Grupo Aprovada (${rotulo}): valor líquido da Stone (${formatarCentavosBRL(liquidoStoneCentavos)}) conferido exatamente para este grupo.`
        : `${confManual.mensagem} (Grupo: ${rotulo})`,
    }
  }

  return {
    chave_grupo: grupo.chave_grupo,
    rotulo_grupo: rotulo,
    estado_grupo: 'AGUARDANDO_CONFERENCIA',
    origem_conferencia: 'NAO_CONFERIDO',
    valor_liquido_stone_centavos: liquidoStoneCentavos,
    valor_liquido_stone_micro: liquidoStoneMicro,
    valor_extrato_bancario_centavos: null,
    diferenca_centavos: 0,
    conferencia_aprovada: false,
    bloqueada_para_conferencia: true,
    status_codigo: 'AGUARDANDO_VALOR_BANCO',
    status_conferencia: 'AGUARDANDO_CONFERENCIA',
    lancamento_conta_azul_correspondente: null,
    candidatos_conta_azul: [],
    data_correspondencia_iso: null,
    campo_data_correspondencia: null,
    mensagem: `Aguardando conferência do grupo ${rotulo} (${formatarCentavosBRL(liquidoStoneCentavos)}). Consulte o período na Conta Azul (GET) ou informe o valor líquido deste grupo.`,
  }
}

/**
 * Concilia uma lista completa de grupos Stone preservando o mapa de valores conferidos
 * individualmente por `chave_grupo`.
 */
export function conciliarListaGruposStone(params: {
  grupos: GrupoConciliacaoStone[]
  avaliacaoPeriodoCA?: AvaliacaoPeriodoContaAzulStoneDTO | null
  valoresManuaisPorGrupo?: Record<string, string>
}): Record<string, ResultadoConciliacaoGrupoStone> {
  const {
    grupos,
    avaliacaoPeriodoCA = null,
    valoresManuaisPorGrupo = {},
  } = params

  const resultadoPorChave: Record<string, ResultadoConciliacaoGrupoStone> = {}

  for (const grupo of grupos) {
    const valorManual = valoresManuaisPorGrupo[grupo.chave_grupo] ?? null
    resultadoPorChave[grupo.chave_grupo] = conciliarGrupoStoneComContaAzul({
      grupo,
      avaliacaoPeriodoCA,
      valorManualGrupoInput: valorManual,
      gruposIrmaosMesmaModalidade: grupos,
    })
  }

  return resultadoPorChave
}

/**
 * Atualiza de forma imutável o mapa de valores conferidos por grupo, garantindo que a
 * navegação entre Data, Bandeira e Produto preserve integralmente os valores já conferidos
 * nos demais grupos.
 */
export function atualizarValorConferenciaPorGrupo(
  mapaAtual: Record<string, string>,
  chaveGrupo: string,
  novoValor: string
): Record<string, string> {
  if (!chaveGrupo) return mapaAtual
  return {
    ...mapaAtual,
    [chaveGrupo]: novoValor,
  }
}
