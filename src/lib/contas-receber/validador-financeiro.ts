/**
 * DCX LINK — MÓDULO CONTAS A RECEBER (ETAPA 1A: FUNDAÇÃO ISOLADA)
 * Funções matemáticas puras e determinísticas em centavos inteiros.
 * Separa validações por natureza da movimentação:
 * - LIQUIDACAO_VENDA_NORMAL
 * - ANTECIPACAO_RECEBIVEIS
 * - ESTORNO_CANCELAMENTO
 * - AJUSTE_ALUGUEL_TARIFA
 * - OUTRO_RECEBIMENTO_DEPENDENTE_REGRA
 */

import type {
  MovimentacaoReceberCanonica,
  OrigemRecebimento,
  ResultadoValidacaoBaixaParcela,
  ResultadoValidacaoMatematica,
  ResumoConsolidadoDia,
} from '@/types/contas-receber'

/**
 * Converte um valor em Reais (number ou string formatada) para centavos inteiros seguros.
 */
export function reaisParaCentavos(valor: number | string): number {
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) {
      throw new Error('Valor monetário inválido (NaN ou Infinito).')
    }
    return Math.round((valor + Number.EPSILON) * 100)
  }

  const texto = String(valor || '').trim()
  if (!texto) return 0

  const limpo = texto
    .replace(/[R$\s]/g, '')
    .replace(/\.(?=\d{3}(?:[.,]|$))/g, '')
    .replace(',', '.')

  const numero = Number(limpo)
  if (!Number.isFinite(numero)) {
    throw new Error(`Não foi possível converter "${valor}" para centavos.`)
  }

  return Math.round((numero + Number.EPSILON) * 100)
}

/**
 * Converte centavos inteiros para Reais com 2 casas decimais.
 */
export function centavosParaReais(centavos: number): number {
  if (!Number.isFinite(centavos)) return 0
  return Math.round(centavos) / 100
}

/**
 * Formata centavos inteiros no padrão monetário brasileiro (R$ 1.234,56).
 */
export function formatarCentavosBRL(centavos: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(centavosParaReais(centavos))
}

/**
 * Valida uma movimentação individual aplicando a regra matemática correspondente à sua natureza.
 */
export function validarMovimentacaoReceber(
  mov: Pick<
    MovimentacaoReceberCanonica,
    | 'natureza'
    | 'valor_bruto_centavos'
    | 'taxa_mdr_centavos'
    | 'taxa_antecipacao_centavos'
    | 'taxa_total_centavos'
    | 'valor_liquido_centavos'
  >
): ResultadoValidacaoMatematica {
  const bruto = Math.round(mov.valor_bruto_centavos)
  const mdr = Math.round(mov.taxa_mdr_centavos)
  const antecipacao = Math.round(mov.taxa_antecipacao_centavos)
  const taxaTotalInformada = Math.round(mov.taxa_total_centavos)
  const liquido = Math.round(mov.valor_liquido_centavos)

  // 1. Outros recebimentos (ex: PIX) sem regra operacional definida permanecem bloqueados
  if (mov.natureza === 'OUTRO_RECEBIMENTO_DEPENDENTE_REGRA') {
    return {
      valido: false,
      natureza: mov.natureza,
      valor_bruto_centavos: bruto,
      taxa_mdr_centavos: mdr,
      taxa_antecipacao_centavos: antecipacao,
      taxa_total_centavos: taxaTotalInformada,
      valor_liquido_informado_centavos: liquido,
      valor_liquido_esperado_centavos: liquido,
      diferenca_centavos: 0,
      codigo_erro: 'REGRA_OPERACIONAL_NAO_DEFINIDA',
      mensagem:
        'Modalidade aguarda definição explícita das regras operacionais pelo responsável do projeto.',
    }
  }

  // 2. Liquidação de Venda Normal: Bruto > 0, MDR >= 0, Antecipação == 0, Bruto - MDR == Líquido
  if (mov.natureza === 'LIQUIDACAO_VENDA_NORMAL') {
    if (bruto <= 0 || mdr < 0 || antecipacao < 0 || taxaTotalInformada < 0) {
      return {
        valido: false,
        natureza: mov.natureza,
        valor_bruto_centavos: bruto,
        taxa_mdr_centavos: mdr,
        taxa_antecipacao_centavos: antecipacao,
        taxa_total_centavos: taxaTotalInformada,
        valor_liquido_informado_centavos: liquido,
        valor_liquido_esperado_centavos: bruto - taxaTotalInformada,
        diferenca_centavos: bruto - taxaTotalInformada - liquido,
        codigo_erro: 'VALOR_NEGATIVO_INVALIDO',
        mensagem:
          'Liquidação normal exige valor bruto positivo e taxas não negativas.',
      }
    }

    if (antecipacao > 0) {
      return {
        valido: false,
        natureza: mov.natureza,
        valor_bruto_centavos: bruto,
        taxa_mdr_centavos: mdr,
        taxa_antecipacao_centavos: antecipacao,
        taxa_total_centavos: taxaTotalInformada,
        valor_liquido_informado_centavos: liquido,
        valor_liquido_esperado_centavos: bruto - (mdr + antecipacao),
        diferenca_centavos: bruto - (mdr + antecipacao) - liquido,
        codigo_erro: 'NATUREZA_INCOMPATIVEL',
        mensagem:
          'Movimentação com taxa de antecipação deve ser classificada como ANTECIPACAO_RECEBIVEIS.',
      }
    }

    const taxaTotalReal = mdr > 0 ? mdr : taxaTotalInformada
    if (taxaTotalInformada !== taxaTotalReal) {
      return {
        valido: false,
        natureza: mov.natureza,
        valor_bruto_centavos: bruto,
        taxa_mdr_centavos: mdr,
        taxa_antecipacao_centavos: 0,
        taxa_total_centavos: taxaTotalInformada,
        valor_liquido_informado_centavos: liquido,
        valor_liquido_esperado_centavos: bruto - taxaTotalReal,
        diferenca_centavos: taxaTotalInformada - taxaTotalReal,
        codigo_erro: 'DIVERGENCIA_BRUTO_TAXA_LIQUIDO',
        mensagem:
          'Divergência entre taxa MDR e taxa total informada na liquidação normal.',
      }
    }

    if (taxaTotalReal > bruto) {
      return {
        valido: false,
        natureza: mov.natureza,
        valor_bruto_centavos: bruto,
        taxa_mdr_centavos: mdr,
        taxa_antecipacao_centavos: 0,
        taxa_total_centavos: taxaTotalReal,
        valor_liquido_informado_centavos: liquido,
        valor_liquido_esperado_centavos: bruto - taxaTotalReal,
        diferenca_centavos: bruto - taxaTotalReal - liquido,
        codigo_erro: 'TAXA_MAIOR_QUE_BRUTO',
        mensagem: 'Taxa descontada excede o valor bruto da venda.',
      }
    }

    const liquidoEsperado = bruto - taxaTotalReal
    const diferenca = liquidoEsperado - liquido

    return {
      valido: diferenca === 0,
      natureza: mov.natureza,
      valor_bruto_centavos: bruto,
      taxa_mdr_centavos: taxaTotalReal,
      taxa_antecipacao_centavos: 0,
      taxa_total_centavos: taxaTotalReal,
      valor_liquido_informado_centavos: liquido,
      valor_liquido_esperado_centavos: liquidoEsperado,
      diferenca_centavos: diferenca,
      codigo_erro:
        diferenca === 0 ? undefined : 'DIVERGENCIA_BRUTO_TAXA_LIQUIDO',
      mensagem:
        diferenca === 0
          ? 'Conferência matemática aprovada (Valor Bruto - Taxas = Valor Líquido).'
          : `Divergência matemática detectada: Bruto (${formatarCentavosBRL(bruto)}) - Taxas (${formatarCentavosBRL(taxaTotalReal)}) = ${formatarCentavosBRL(liquidoEsperado)}, mas o líquido informado é ${formatarCentavosBRL(liquido)} (diferença de ${formatarCentavosBRL(Math.abs(diferenca))}).`,
    }
  }

  // 3. Antecipação de Recebíveis: Bruto - (MDR + Taxa Antecipação) == Líquido
  if (mov.natureza === 'ANTECIPACAO_RECEBIVEIS') {
    if (bruto <= 0 || mdr < 0 || antecipacao <= 0) {
      return {
        valido: false,
        natureza: mov.natureza,
        valor_bruto_centavos: bruto,
        taxa_mdr_centavos: mdr,
        taxa_antecipacao_centavos: antecipacao,
        taxa_total_centavos: taxaTotalInformada,
        valor_liquido_informado_centavos: liquido,
        valor_liquido_esperado_centavos: bruto - (mdr + antecipacao),
        diferenca_centavos: bruto - (mdr + antecipacao) - liquido,
        codigo_erro: 'NATUREZA_INCOMPATIVEL',
        mensagem:
          'Antecipação exige valor bruto positivo e taxa de antecipação maior que zero.',
      }
    }

    const somaTaxas = mdr + antecipacao
    if (taxaTotalInformada !== somaTaxas) {
      return {
        valido: false,
        natureza: mov.natureza,
        valor_bruto_centavos: bruto,
        taxa_mdr_centavos: mdr,
        taxa_antecipacao_centavos: antecipacao,
        taxa_total_centavos: taxaTotalInformada,
        valor_liquido_informado_centavos: liquido,
        valor_liquido_esperado_centavos: bruto - somaTaxas,
        diferenca_centavos: taxaTotalInformada - somaTaxas,
        codigo_erro: 'DIVERGENCIA_BRUTO_TAXA_LIQUIDO',
        mensagem:
          'Soma de Taxa MDR + Taxa de Antecipação difere da Taxa Total informada.',
      }
    }

    if (somaTaxas > bruto) {
      return {
        valido: false,
        natureza: mov.natureza,
        valor_bruto_centavos: bruto,
        taxa_mdr_centavos: mdr,
        taxa_antecipacao_centavos: antecipacao,
        taxa_total_centavos: somaTaxas,
        valor_liquido_informado_centavos: liquido,
        valor_liquido_esperado_centavos: bruto - somaTaxas,
        diferenca_centavos: bruto - somaTaxas - liquido,
        codigo_erro: 'TAXA_MAIOR_QUE_BRUTO',
        mensagem: 'Soma das taxas de MDR e antecipação excede o valor bruto.',
      }
    }

    const liquidoEsperado = bruto - somaTaxas
    const diferenca = liquidoEsperado - liquido

    return {
      valido: diferenca === 0,
      natureza: mov.natureza,
      valor_bruto_centavos: bruto,
      taxa_mdr_centavos: mdr,
      taxa_antecipacao_centavos: antecipacao,
      taxa_total_centavos: somaTaxas,
      valor_liquido_informado_centavos: liquido,
      valor_liquido_esperado_centavos: liquidoEsperado,
      diferenca_centavos: diferenca,
      codigo_erro:
        diferenca === 0 ? undefined : 'DIVERGENCIA_BRUTO_TAXA_LIQUIDO',
      mensagem:
        diferenca === 0
          ? 'Conferência de antecipação aprovada (Bruto - [MDR + Antecipação] = Líquido).'
          : `Divergência na antecipação: esperado ${formatarCentavosBRL(liquidoEsperado)}, informado ${formatarCentavosBRL(liquido)}.`,
    }
  }

  // 4. Estorno ou Cancelamento (Chargeback): impacto líquido deve ser negativo (< 0)
  if (mov.natureza === 'ESTORNO_CANCELAMENTO') {
    if (liquido >= 0) {
      return {
        valido: false,
        natureza: mov.natureza,
        valor_bruto_centavos: bruto,
        taxa_mdr_centavos: mdr,
        taxa_antecipacao_centavos: antecipacao,
        taxa_total_centavos: taxaTotalInformada,
        valor_liquido_informado_centavos: liquido,
        valor_liquido_esperado_centavos: -Math.abs(liquido),
        diferenca_centavos: liquido,
        codigo_erro: 'ESTORNO_POSITIVO_INVALIDO',
        mensagem:
          'Estorno/cancelamento deve possuir impacto líquido negativo (débito na agenda).',
      }
    }

    return {
      valido: true,
      natureza: mov.natureza,
      valor_bruto_centavos: bruto,
      taxa_mdr_centavos: mdr,
      taxa_antecipacao_centavos: antecipacao,
      taxa_total_centavos: taxaTotalInformada,
      valor_liquido_informado_centavos: liquido,
      valor_liquido_esperado_centavos: liquido,
      diferenca_centavos: 0,
      mensagem: 'Estorno/cancelamento validado separadamente das receitas brutas.',
    }
  }

  // 5. Ajuste / Aluguel de POS / Tarifa Operacional: sem receita bruta de venda (bruto == 0) e líquido < 0
  if (mov.natureza === 'AJUSTE_ALUGUEL_TARIFA') {
    if (bruto !== 0 || liquido >= 0) {
      return {
        valido: false,
        natureza: mov.natureza,
        valor_bruto_centavos: bruto,
        taxa_mdr_centavos: mdr,
        taxa_antecipacao_centavos: antecipacao,
        taxa_total_centavos: taxaTotalInformada,
        valor_liquido_informado_centavos: liquido,
        valor_liquido_esperado_centavos: liquido,
        diferenca_centavos: bruto,
        codigo_erro: 'AJUSTE_COM_VENDA_BRUTA_INVALIDA',
        mensagem:
          'Ajuste ou tarifa de aluguel de máquina não pode ter valor bruto de venda e deve representar saída (líquido negativo).',
      }
    }

    return {
      valido: true,
      natureza: mov.natureza,
      valor_bruto_centavos: 0,
      taxa_mdr_centavos: mdr,
      taxa_antecipacao_centavos: antecipacao,
      taxa_total_centavos: taxaTotalInformada,
      valor_liquido_informado_centavos: liquido,
      valor_liquido_esperado_centavos: liquido,
      diferenca_centavos: 0,
      mensagem: 'Ajuste/tarifa operacional validado separadamente.',
    }
  }

  return {
    valido: false,
    natureza: mov.natureza,
    valor_bruto_centavos: bruto,
    taxa_mdr_centavos: mdr,
    taxa_antecipacao_centavos: antecipacao,
    taxa_total_centavos: taxaTotalInformada,
    valor_liquido_informado_centavos: liquido,
    valor_liquido_esperado_centavos: liquido,
    diferenca_centavos: 0,
    codigo_erro: 'NATUREZA_INCOMPATIVEL',
    mensagem: 'Natureza financeira desconhecida.',
  }
}

/**
 * Valida se uma parcela do Conta Azul comporta uma nova baixa (integral, parcial ou dividida),
 * permitindo múltiplas baixas legítimas na mesma parcela desde que não excedam o saldo em aberto.
 */
export function validarCapacidadeBaixaParcela(params: {
  parcela_id: string
  saldo_aberto_centavos: number
  valor_baixa_centavos: number
}): ResultadoValidacaoBaixaParcela {
  const saldoAberto = Math.round(params.saldo_aberto_centavos)
  const valorBaixa = Math.round(params.valor_baixa_centavos)

  if (saldoAberto <= 0) {
    return {
      permitido: false,
      tipo_baixa: 'BLOQUEADA',
      parcela_id: params.parcela_id,
      saldo_aberto_anterior_centavos: saldoAberto,
      valor_baixa_solicitado_centavos: valorBaixa,
      saldo_remanescente_centavos: saldoAberto,
      codigo_bloqueio: 'PARCELA_JA_QUITADA',
      mensagem: `A parcela ${params.parcela_id} já se encontra integralmente quitada (saldo em aberto R$ 0,00).`,
    }
  }

  if (valorBaixa <= 0) {
    return {
      permitido: false,
      tipo_baixa: 'BLOQUEADA',
      parcela_id: params.parcela_id,
      saldo_aberto_anterior_centavos: saldoAberto,
      valor_baixa_solicitado_centavos: valorBaixa,
      saldo_remanescente_centavos: saldoAberto,
      codigo_bloqueio: 'VALOR_BAIXA_ZERO_OU_NEGATIVO',
      mensagem: 'O valor da baixa deve ser estritamente maior que zero.',
    }
  }

  if (valorBaixa > saldoAberto) {
    return {
      permitido: false,
      tipo_baixa: 'BLOQUEADA',
      parcela_id: params.parcela_id,
      saldo_aberto_anterior_centavos: saldoAberto,
      valor_baixa_solicitado_centavos: valorBaixa,
      saldo_remanescente_centavos: saldoAberto - valorBaixa,
      codigo_bloqueio: 'VALOR_EXCEDE_SALDO_ABERTO',
      mensagem: `O valor solicitado para baixa (${formatarCentavosBRL(valorBaixa)}) excede o saldo em aberto da parcela (${formatarCentavosBRL(saldoAberto)}).`,
    }
  }

  const saldoRemanescente = saldoAberto - valorBaixa
  const ehIntegral = saldoRemanescente === 0

  return {
    permitido: true,
    tipo_baixa: ehIntegral ? 'INTEGRAL' : 'PARCIAL',
    parcela_id: params.parcela_id,
    saldo_aberto_anterior_centavos: saldoAberto,
    valor_baixa_solicitado_centavos: valorBaixa,
    saldo_remanescente_centavos: saldoRemanescente,
    mensagem: ehIntegral
      ? `Baixa integral aprovada (${formatarCentavosBRL(valorBaixa)}). Parcela será quitada.`
      : `Baixa parcial aprovada (${formatarCentavosBRL(valorBaixa)}). Saldo remanescente em aberto: ${formatarCentavosBRL(saldoRemanescente)}.`,
  }
}

/**
 * Consolida as movimentações de um dia mantendo vendas normais, antecipações, estornos e ajustes separados.
 */
export function consolidarDiaPorNatureza(
  dataRecebimento: string,
  origem: OrigemRecebimento,
  movimentacoes: MovimentacaoReceberCanonica[]
): ResumoConsolidadoDia {
  let qtdVendasNormais = 0
  let qtdAntecipacoes = 0
  let qtdEstornos = 0
  let qtdAjustes = 0

  let brutoVendas = 0
  let taxaMdrTotal = 0
  let taxaAntecipacaoTotal = 0
  let taxaTotal = 0
  let liquidoVendas = 0
  let totalEstornos = 0
  let totalAjustes = 0

  const divergencias: string[] = []

  for (let i = 0; i < movimentacoes.length; i++) {
    const mov = movimentacoes[i]
    const validacao = validarMovimentacaoReceber(mov)
    if (!validacao.valido) {
      divergencias.push(`Item #${i + 1} (${mov.natureza}): ${validacao.mensagem}`)
    }

    if (mov.natureza === 'LIQUIDACAO_VENDA_NORMAL') {
      qtdVendasNormais++
      brutoVendas += Math.round(mov.valor_bruto_centavos)
      taxaMdrTotal += Math.round(mov.taxa_mdr_centavos)
      taxaTotal += Math.round(mov.taxa_total_centavos)
      liquidoVendas += Math.round(mov.valor_liquido_centavos)
    } else if (mov.natureza === 'ANTECIPACAO_RECEBIVEIS') {
      qtdAntecipacoes++
      brutoVendas += Math.round(mov.valor_bruto_centavos)
      taxaMdrTotal += Math.round(mov.taxa_mdr_centavos)
      taxaAntecipacaoTotal += Math.round(mov.taxa_antecipacao_centavos)
      taxaTotal += Math.round(mov.taxa_total_centavos)
      liquidoVendas += Math.round(mov.valor_liquido_centavos)
    } else if (mov.natureza === 'ESTORNO_CANCELAMENTO') {
      qtdEstornos++
      totalEstornos += Math.round(mov.valor_liquido_centavos) // negativo
    } else if (mov.natureza === 'AJUSTE_ALUGUEL_TARIFA') {
      qtdAjustes++
      totalAjustes += Math.round(mov.valor_liquido_centavos) // negativo
    }
  }

  // Conferência agregada das vendas (normais + antecipadas): Bruto - Taxas === Líquido de Vendas
  if (brutoVendas - taxaTotal !== liquidoVendas) {
    divergencias.push(
      `Divergência no totalizador de vendas do dia ${dataRecebimento}: Bruto (${formatarCentavosBRL(brutoVendas)}) - Taxas (${formatarCentavosBRL(taxaTotal)}) != Líquido Vendas (${formatarCentavosBRL(liquidoVendas)}).`
    )
  }

  const liquidoEfetivoDeposito = liquidoVendas + totalEstornos + totalAjustes

  return {
    data_recebimento: dataRecebimento,
    origem,
    quantidade_vendas_normais: qtdVendasNormais,
    quantidade_antecipacoes: qtdAntecipacoes,
    quantidade_estornos: qtdEstornos,
    quantidade_ajustes: qtdAjustes,
    bruto_vendas_centavos: brutoVendas,
    taxa_mdr_total_centavos: taxaMdrTotal,
    taxa_antecipacao_total_centavos: taxaAntecipacaoTotal,
    taxa_total_centavos: taxaTotal,
    liquido_vendas_centavos: liquidoVendas,
    total_estornos_centavos: totalEstornos,
    total_ajustes_tarifas_centavos: totalAjustes,
    liquido_efetivo_deposito_centavos: liquidoEfetivoDeposito,
    consistente: divergencias.length === 0,
    divergencias,
  }
}
