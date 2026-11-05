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
  BandeiraCartao,
  ClassificacaoLinhaStone,
  FiltrosOperacionaisStone,
  LinhaExtratoStone,
  ModalidadeCartao,
  MovimentacaoReceberCanonica,
  NaturezaMovimentacaoReceber,
  PreviaLancamentosMemoriaStone,
  ResultadoConferenciaBancariaStone,
  StatusParcelaStone,
  TotaisFiltradosStone,
} from '@/types/contas-receber'
import { reaisParaCentavos } from './validador-financeiro'

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
  const banUpper = linha.bandeira.toUpperCase()
  let bandeiraCanonica: BandeiraCartao = 'OUTRAS'
  if (banUpper.includes('VISA')) bandeiraCanonica = 'VISA'
  else if (banUpper.includes('MASTER')) bandeiraCanonica = 'MASTERCARD'
  else if (banUpper.includes('ELO')) bandeiraCanonica = 'ELO'
  else if (banUpper.includes('AMERICAN') || banUpper.includes('AMEX'))
    bandeiraCanonica = 'AMEX'
  else if (banUpper.includes('HIPER')) bandeiraCanonica = 'HIPERCARD'

  const prodUpper = linha.produto
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  let modalidadeCanonica: ModalidadeCartao = 'OUTRA'
  if (prodUpper.includes('DEBITO')) modalidadeCanonica = 'DEBITO'
  else if (prodUpper.includes('CREDITO')) {
    modalidadeCanonica =
      linha.qtd_parcelas > 1 ? 'CREDITO_PARCELADO' : 'CREDITO_VISTA'
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
