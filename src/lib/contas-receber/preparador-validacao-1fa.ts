/**
 * DCX LINK — MÓDULO CONTAS A RECEBER (ETAPA 1F-A)
 * Motor puro de Preparação e Validação dos Lançamentos de Receita Bruta e Despesa MDR
 * na Conta Azul — ESTRITAMENTE SEM TRANSMISSÃO E SEM GRAVAÇÃO FINANCEIRA.
 *
 * REGRAS OBRIGATÓRIAS DESTA ETAPA (1F-A):
 * 1. Receita Bruta: categoria obrigatória "Receitas de Vendas" (tipo RECEITA).
 * 2. Despesa MDR: categoria obrigatória "Tarifas de Cartão de Créditos" (tipo DESPESA).
 * 3. Utilizar a conta financeira selecionada para a loja ativa.
 * 4. Exigir conferência bancária estrita `CONFERIDO_EXATO`.
 * 5. Validar valores, datas, empresa, loja, conta financeira e categorias.
 * 6. Aplicar as proteções de idempotência e prevenção de duplicidades já existentes.
 * 7. Identificar lançamentos já existentes na Conta Azul e bloquear duplicidades/ambiguidades.
 * 8. Gerar prévia clara dos lançamentos que seriam criados, sem realizar POST/PUT/PATCH/DELETE.
 */

import type {
  AvaliacaoPeriodoContaAzulStoneDTO,
  CategoriaFinanceiraReceberDTO,
  ClassificacaoTriagemLancamentoCA,
  ContaFinanceiraReceberDTO,
  FiltrosOperacionaisStone,
  ItemPreviaLancamento1FADTO,
  MotivoBloqueioPreparacao1FA,
  PayloadEventoFinanceiroContaAzul1FADTO,
  ResultadoConferenciaBancariaStone,
  ResultadoPreparacaoValidacao1FADTO,
  TotaisFiltradosStone,
} from '@/types/contas-receber'
import { normalizarTextoComparacao } from './conta-azul-receber-satelite'
import {
  type RegistroOperacaoReceberExistente,
  classificarIdempotenciaOperacoesReceber,
  normalizarTextoChaveReceber,
} from './import-dedup-receber'
import {
  classificarBandeiraStoneCanonica,
  classificarProdutoModalidadeStone,
  extrairAssinaturaStoneLancamentoContaAzul,
  formatarMicroBRL,
  montarRotuloGrupoStoneContaAzul,
  parseDataBrParaIso,
} from './stone-csv-parser'
import { centavosParaReais, formatarCentavosBRL } from './validador-financeiro'

/**
 * Verifica se o nome da categoria selecionada corresponde semanticamente a "Receitas de Vendas".
 */
export function ehCategoriaReceitasDeVendasValida(
  categoria: CategoriaFinanceiraReceberDTO | null | undefined
): boolean {
  if (!categoria || !categoria.id || categoria.tipo !== 'RECEITA') {
    return false
  }
  const nomeNorm = normalizarTextoComparacao(categoria.nome)
  const termosValidos = [
    'receitas de vendas',
    'receita de vendas',
    'receitas de venda',
    'receita de venda',
  ]
  return termosValidos.some(
    (termo) => nomeNorm === termo || nomeNorm.includes(termo)
  )
}

/**
 * Verifica se o nome da categoria selecionada corresponde semanticamente a "Tarifas de Cartão de Créditos".
 */
export function ehCategoriaTarifasCartaoMdrValida(
  categoria: CategoriaFinanceiraReceberDTO | null | undefined
): boolean {
  if (!categoria || !categoria.id || categoria.tipo !== 'DESPESA') {
    return false
  }
  const nomeNorm = normalizarTextoComparacao(categoria.nome)
  const termosValidos = [
    'tarifas de cartao de creditos',
    'tarifas de cartoes de credito',
    'tarifa de cartao de credito',
    'tarifa de cartao de creditos',
    'tarifas de cartao',
    'tarifas de cartoes',
  ]
  return termosValidos.some(
    (termo) => nomeNorm === termo || nomeNorm.includes(termo)
  )
}

/**
 * Gera as chaves determinísticas de idempotência para o lote e para os 2 lançamentos (Receita Bruta e Despesa MDR)
 * da Etapa 1F-A, impedindo duplicidade de criação para a mesma loja, data, bandeira, produto, conta e valores.
 */
export function gerarChavesIdempotenciaLoteStone1FA(params: {
  empresaId: string
  dataVencimentoOriginalIso: string
  bandeira: string
  produto: string
  contaFinanceiraId: string
  valorBrutoCentavos: number
  valorMdrCentavos: number
  valorLiquidoCentavos: number
}): {
  chaveLote: string
  chaveReceitaBruta: string
  chaveDespesaMdr: string
} {
  const emp = String(params.empresaId || '').trim()
  const dt = String(params.dataVencimentoOriginalIso || '').slice(0, 10)
  const band = normalizarTextoChaveReceber(params.bandeira || 'TODAS')
  const prod = normalizarTextoChaveReceber(params.produto || 'TODOS')
  const conta = String(params.contaFinanceiraId || '').trim()
  const bruto = Math.round(params.valorBrutoCentavos)
  const mdr = Math.round(params.valorMdrCentavos)
  const liq = Math.round(params.valorLiquidoCentavos)

  const base = `${emp}|STONE|${dt}|${band}|${prod}|${conta}`
  return {
    chaveLote: `LOTE_1FA|${base}|${bruto}|${mdr}|${liq}`,
    chaveReceitaBruta: `RECEITA_BRUTA_1FA|${base}|${bruto}`,
    chaveDespesaMdr: `DESPESA_MDR_1FA|${base}|${mdr}`,
  }
}

export interface ParametrosPreparacao1FA {
  empresaId: string
  empresaNome: string
  filtros: FiltrosOperacionaisStone
  totais: TotaisFiltradosStone
  conferencia: ResultadoConferenciaBancariaStone
  contaFinanceiraSelecionada: ContaFinanceiraReceberDTO | null | undefined
  categoriaReceitaSelecionada: CategoriaFinanceiraReceberDTO | null | undefined
  categoriaDespesaMdrSelecionada: CategoriaFinanceiraReceberDTO | null | undefined
  avaliacaoPeriodoCA?: AvaliacaoPeriodoContaAzulStoneDTO | null
  operacoesExistentesIdempotencia?: RegistroOperacaoReceberExistente[]
}

/**
 * Executa a preparação completa e validação rigorosa de pré-voo da Etapa 1F-A
 * para os lançamentos de Receita Bruta e Despesa MDR na Conta Azul.
 *
 * IMPORTANTE: Função 100% pura e determinística. Não realiza chamadas de rede nem escrita em banco.
 */
export function prepararEValidarLancamentosEtapa1FA(
  params: ParametrosPreparacao1FA
): ResultadoPreparacaoValidacao1FADTO {
  const {
    empresaId,
    empresaNome,
    filtros,
    totais,
    conferencia,
    contaFinanceiraSelecionada,
    categoriaReceitaSelecionada,
    categoriaDespesaMdrSelecionada,
    avaliacaoPeriodoCA = null,
    operacoesExistentesIdempotencia = [],
  } = params

  const bloqueios: MotivoBloqueioPreparacao1FA[] = []
  const avisos: string[] = []

  const empresaIdLimpo = String(empresaId || '').trim()
  const empresaNomeLimpo = String(empresaNome || '').trim()

  // 1. Validar Empresa / Loja ativa (bloquear loja demo ou vazia)
  const empresaValida =
    empresaIdLimpo.length > 0 &&
    empresaIdLimpo !== 'emp-demo' &&
    empresaNomeLimpo.length > 0

  if (!empresaValida) {
    bloqueios.push({
      codigo: 'EMPRESA_OU_LOJA_INVALIDA',
      campo: 'empresa_loja',
      titulo: 'Empresa / Loja ativa não selecionada ou inválida',
      detalhe:
        'Selecione uma loja real conectada ao Conta Azul antes de preparar os lançamentos de Contas a Receber.',
    })
  }

  // 2. Exigir conferência bancária estrita `CONFERIDO_EXATO`
  const statusConferenciaAtual =
    conferencia.status_conferencia ||
    (conferencia.conferencia_aprovada &&
    conferencia.status_codigo === 'APROVADA_EXATA' &&
    conferencia.diferenca_centavos === 0
      ? 'CONFERIDO_EXATO'
      : conferencia.status_codigo === 'DIVERGENTE_BLOQUEADA'
        ? 'DIVERGENTE_BLOQUEADA'
        : conferencia.status_codigo === 'SEM_REGISTROS_PAGOS'
          ? 'SEM_REGISTROS_PAGOS'
          : 'AGUARDANDO_VALOR_BANCO')

  const conferenciaExataAprovada =
    statusConferenciaAtual === 'CONFERIDO_EXATO' &&
    conferencia.conferencia_aprovada === true &&
    conferencia.diferenca_centavos === 0 &&
    conferencia.valor_extrato_bancario_centavos !== null &&
    conferencia.valor_extrato_bancario_centavos ===
      totais.valor_liquido_centavos

  if (!conferenciaExataAprovada) {
    bloqueios.push({
      codigo: 'CONFERENCIA_NAO_EXATA',
      campo: 'conferencia_bancaria',
      titulo: 'Conferência bancária exige status CONFERIDO_EXATO',
      detalhe:
        conferencia.mensagem ||
        `Status atual da conferência: "${statusConferenciaAtual}". O valor líquido da Stone deve ser exatamente igual ao valor do extrato bancário (diferença R$ 0,00).`,
    })
  }

  // 3. Validar Data da Operação (Data de Vencimento Original obrigatória e em formato válido)
  const dataBr = String(filtros.data_vencimento_original || '').trim()
  const dataIso = parseDataBrParaIso(dataBr) || ''
  const dataValida = Boolean(dataBr && /^\d{4}-\d{2}-\d{2}$/.test(dataIso))

  if (!dataValida) {
    bloqueios.push({
      codigo: 'DATA_OPERACAO_INVALIDA',
      campo: 'datas',
      titulo: 'Data de Vencimento Original não selecionada ou inválida',
      detalhe:
        'Selecione uma Data de Vencimento Original específica (DD/MM/AAAA) no Passo 1 para definir a competência e o vencimento exatos dos lançamentos.',
    })
  }

  // 3B. Exigir seleção de grupo individual (Bandeira + Produto/Modalidade CD ou DB) — proibido conciliar somatório geral do período
  const bandeiraRaw = String(filtros.bandeira || '').trim()
  const produtoRaw = String(filtros.produto || '').trim()
  const bandeiraSelecionadaValida =
    bandeiraRaw.length > 0 &&
    bandeiraRaw.toUpperCase() !== 'TODAS' &&
    bandeiraRaw.toUpperCase() !== 'TODAS AS BANDEIRAS'
  const produtoSelecionadoValido =
    produtoRaw.length > 0 &&
    produtoRaw.toUpperCase() !== 'TODOS' &&
    produtoRaw.toUpperCase() !== 'TODOS OS PRODUTOS'

  if (!bandeiraSelecionadaValida || !produtoSelecionadoValido) {
    bloqueios.push({
      codigo: 'GRUPO_BANDEIRA_MODALIDADE_OBRIGATORIO',
      campo: 'conferencia_bancaria',
      titulo:
        'Conciliação individual por Bandeira e Modalidade (CD/DB) obrigatória',
      detalhe:
        'Selecione individualmente a Bandeira (ex: Visa, MasterCard, Elo) e o Produto/Modalidade (Crédito CD ou Débito DB). A conciliação e a preparação não podem ser executadas sobre o somatório geral do período.',
    })
  } else {
    const classifProd = classificarProdutoModalidadeStone(
      produtoRaw,
      bandeiraRaw
    )
    const classifBand = classificarBandeiraStoneCanonica(bandeiraRaw)
    if (
      !classifProd.compativelConciliacaoPadraoCdDb ||
      classifBand.bandeiraCanonica === 'OUTRAS' &&
        classifProd.subtipoProduto === 'VOUCHER'
    ) {
      bloqueios.push({
        codigo: 'PRODUTO_INCOMPATIVEL_CONCILIACAO_CD_DB',
        campo: 'conferencia_bancaria',
        titulo:
          'Produto não compatível com a conciliação padrão de Crédito (CD) / Débito (DB)',
        detalhe: `O produto "${produtoRaw}" (${bandeiraRaw}) foi classificado como "${classifProd.descricaoModalidade}" e não pode ser processado como lançamento padrão CD/DB sem regra específica.`,
      })
    }
  }

  // 4. Validar Conta Financeira selecionada para a loja ativa
  const contaId = String(contaFinanceiraSelecionada?.id || '').trim()
  const contaNome = String(contaFinanceiraSelecionada?.descricao || '').trim()
  const contaValida = contaId.length > 0 && contaNome.length > 0

  if (!contaValida) {
    bloqueios.push({
      codigo: 'CONTA_FINANCEIRA_NAO_SELECIONADA',
      campo: 'conta_financeira',
      titulo: 'Conta financeira não selecionada para a loja ativa',
      detalhe:
        'Selecione a conta financeira ativa da loja onde o depósito líquido da Stone foi creditado.',
    })
  }

  // 5. Validar Categorias ("Receitas de Vendas" e "Tarifas de Cartão de Créditos")
  const catReceitaValida = ehCategoriaReceitasDeVendasValida(
    categoriaReceitaSelecionada
  )
  if (!catReceitaValida) {
    bloqueios.push({
      codigo: 'CATEGORIA_RECEITA_VENDAS_INVALIDA',
      campo: 'categoria_receita',
      titulo: 'Categoria de Receita Bruta inválida ou ausente',
      detalhe: categoriaReceitaSelecionada?.nome
        ? `A categoria selecionada ("${categoriaReceitaSelecionada.nome}") não corresponde à categoria exigida "Receitas de Vendas" (tipo RECEITA).`
        : 'A categoria "Receitas de Vendas" não foi selecionada ou não foi localizada para a loja ativa.',
    })
  }

  const mdrCentavos = Math.round(totais.desconto_mdr_ajustado_centavos)
  const mdrDispensadoPorZero = mdrCentavos === 0 && totais.valor_bruto_centavos > 0
  const catDespesaMdrValida = ehCategoriaTarifasCartaoMdrValida(
    categoriaDespesaMdrSelecionada
  )

  if (!catDespesaMdrValida && !mdrDispensadoPorZero) {
    bloqueios.push({
      codigo: 'CATEGORIA_DESPESA_MDR_INVALIDA',
      campo: 'categoria_despesa_mdr',
      titulo: 'Categoria de Despesa MDR inválida ou ausente',
      detalhe: categoriaDespesaMdrSelecionada?.nome
        ? `A categoria selecionada ("${categoriaDespesaMdrSelecionada.nome}") não corresponde à categoria exigida "Tarifas de Cartão de Créditos" (tipo DESPESA).`
        : 'A categoria "Tarifas de Cartão de Créditos" não foi selecionada ou não foi localizada para a loja ativa.',
    })
  }

  // 6. Validar Valores e Equação Matemática (Bruto, MDR, Antecipação, Líquido)
  const brutoCentavos = Math.round(totais.valor_bruto_centavos)
  const antecipacaoCentavos = Math.round(totais.desconto_antecipacao_centavos)
  const liquidoCentavos = Math.round(totais.valor_liquido_centavos)

  if (brutoCentavos <= 0 || totais.quantidade_parcelas_pagas <= 0) {
    bloqueios.push({
      codigo: 'VALOR_BRUTO_INVALIDO',
      campo: 'valores',
      titulo: 'Valor Bruto de vendas pagas inválido ou zerado',
      detalhe:
        'O lote filtrado deve possuir pelo menos uma parcela paga com Valor Bruto estritamente positivo (> R$ 0,00).',
    })
  }

  if (mdrCentavos < 0 || mdrCentavos >= brutoCentavos) {
    bloqueios.push({
      codigo: 'VALOR_MDR_INVALIDO',
      campo: 'valores',
      titulo: 'Valor de Despesa MDR inválido',
      detalhe: `O desconto de MDR (${formatarCentavosBRL(mdrCentavos)}) não pode ser negativo nem maior ou igual ao Valor Bruto (${formatarCentavosBRL(brutoCentavos)}).`,
    })
  }

  const equacaoFechadaSemAntecipacao =
    brutoCentavos - mdrCentavos === liquidoCentavos
  const equacaoFechadaComAntecipacao =
    brutoCentavos - mdrCentavos - antecipacaoCentavos === liquidoCentavos

  // Na Etapa 1F-A, o fluxo cria Receita Bruta e Despesa MDR. Se houver desconto de antecipação > 0,
  // Receita Bruta - Despesa MDR não fecharia com o líquido depositado sem o tratamento da antecipação.
  const equacaoMatematicaValida =
    brutoCentavos > 0 &&
    mdrCentavos >= 0 &&
    antecipacaoCentavos === 0 &&
    equacaoFechadaSemAntecipacao

  if (!equacaoMatematicaValida) {
    if (antecipacaoCentavos > 0 && equacaoFechadaComAntecipacao) {
      bloqueios.push({
        codigo: 'EQUACAO_MATEMATICA_DIVERGENTE',
        campo: 'valores',
        titulo:
          'Lote contém Taxa de Antecipação (RAV) que exige segregação específica',
        detalhe: `Este filtro possui ${formatarCentavosBRL(antecipacaoCentavos)} de Desconto de Antecipação. Como a Etapa 1F-A prepara exclusivamente Receita Bruta (${formatarCentavosBRL(brutoCentavos)}) e Despesa MDR (${formatarCentavosBRL(mdrCentavos)}), a diferença de antecipação impediria o fechamento exato com o líquido bancário (${formatarCentavosBRL(liquidoCentavos)}).`,
      })
    } else {
      bloqueios.push({
        codigo: 'EQUACAO_MATEMATICA_DIVERGENTE',
        campo: 'valores',
        titulo: 'Divergência na equação Receita Bruta - Despesa MDR = Líquido',
        detalhe: `Receita Bruta (${formatarCentavosBRL(brutoCentavos)}) - Despesa MDR (${formatarCentavosBRL(mdrCentavos)}) = ${formatarCentavosBRL(brutoCentavos - mdrCentavos)}, que difere do Valor Líquido (${formatarCentavosBRL(liquidoCentavos)}).`,
      })
    }
  }

  if (totais.diferenca_arredondamento_centavos !== 0) {
    avisos.push(
      `Ajuste de arredondamento de ${formatarCentavosBRL(totais.diferenca_arredondamento_centavos)} aplicado sobre o MDR acumulado de 6 casas decimais (${formatarMicroBRL(totais.desconto_mdr_micro, 6)}) para fechamento contábil exato ao centavo.`
    )
  }

  // 7. Proteções de Idempotência e Prevenção de Duplicidades Locais
  const { chaveLote, chaveReceitaBruta, chaveDespesaMdr } =
    gerarChavesIdempotenciaLoteStone1FA({
      empresaId: empresaIdLimpo,
      dataVencimentoOriginalIso: dataIso || 'SEM_DATA',
      bandeira: filtros.bandeira || 'TODAS',
      produto: filtros.produto || 'TODOS',
      contaFinanceiraId: contaId || 'SEM_CONTA',
      valorBrutoCentavos: brutoCentavos,
      valorMdrCentavos: mdrCentavos,
      valorLiquidoCentavos: liquidoCentavos,
    })

  const candidatasIdempotencia = [
    { chave_idempotencia: chaveLote, tipo: 'LOTE' as const },
    { chave_idempotencia: chaveReceitaBruta, tipo: 'RECEITA_BRUTA' as const },
    ...(mdrCentavos > 0
      ? [{ chave_idempotencia: chaveDespesaMdr, tipo: 'DESPESA_MDR' as const }]
      : []),
  ]

  const resultadoIdemp = classificarIdempotenciaOperacoesReceber(
    candidatasIdempotencia,
    operacoesExistentesIdempotencia
  )

  const possuiConflitoIdempotencia =
    resultadoIdemp.bloqueadasDuplicadasOuAmbiguas.length > 0 ||
    resultadoIdemp.apenasBaixarReceitaJaCriada.length > 0

  if (possuiConflitoIdempotencia) {
    const motivosIdemp = [
      ...resultadoIdemp.bloqueadasDuplicadasOuAmbiguas.map((b) => b.motivo),
      ...resultadoIdemp.apenasBaixarReceitaJaCriada.map(
        (a) =>
          `Operação parcial anterior detectada (${a.existente.status} — parcela ${a.existente.conta_azul_parcela_id}). Bloqueado para evitar recriação duplicada.`
      ),
    ].join(' ')

    bloqueios.push({
      codigo: 'IDEMPOTENCIA_JA_EXECUTADA_OU_AMBIGUA',
      campo: 'idempotencia',
      titulo: 'Bloqueio por Idempotência / Prevenção de Duplicidade',
      detalhe: motivosIdemp,
    })
  }

  // 8. Identificação de Lançamentos Já Existentes na Conta Azul (Etapa 1E)
  const triagemReceitaCA = avaliacaoPeriodoCA?.triagem_receita_bruta ?? null
  const triagemDespesaMdrCA = avaliacaoPeriodoCA?.triagem_despesa_mdr ?? null
  const triagemLiquidoCA = avaliacaoPeriodoCA?.triagem_deposito_liquido ?? null

  if (!avaliacaoPeriodoCA) {
    avisos.push(
      'A consulta de lançamentos existentes no período na Conta Azul (Passo 4 · GET) ainda não foi executada para este filtro. Recomenda-se consultar antes de avançar para a Etapa 1F-B.'
    )
  } else {
    const avaliarTriagemParaBloqueio = (
      rotulo: string,
      classificacao: ClassificacaoTriagemLancamentoCA | undefined,
      mensagemTriagem: string | undefined
    ) => {
      if (!classificacao || classificacao === 'NAO_LOCALIZADO_NO_PERIODO') {
        return
      }
      if (
        classificacao === 'JA_QUITADO_BLOQUEADO' ||
        classificacao === 'CORRESPONDENCIA_DETERMINISTICA'
      ) {
        bloqueios.push({
          codigo: 'LANCAMENTO_JA_EXISTENTE_CONTA_AZUL',
          campo: 'conta_azul_existentes',
          titulo: `${rotulo} já existente na Conta Azul`,
          detalhe:
            mensagemTriagem ||
            `Foi identificado lançamento correspondente para ${rotulo} na Conta Azul (${classificacao}). Criação bloqueada para impedir duplicidade.`,
        })
      } else if (
        classificacao === 'MULTIPLOS_CANDIDATOS_CONFERENCIA_HUMANA' ||
        classificacao === 'CANDIDATO_VALOR_DATA_CONFERENCIA_HUMANA'
      ) {
        bloqueios.push({
          codigo: 'CANDIDATOS_AMBIGUOS_CONTA_AZUL',
          campo: 'conta_azul_existentes',
          titulo: `Possível duplicidade detectada para ${rotulo} na Conta Azul`,
          detalhe:
            mensagemTriagem ||
            `Existem lançamentos de mesmo valor no período consultado para ${rotulo} (${classificacao}). Criação automática bloqueada até conferência humana.`,
        })
      }
    }

    avaliarTriagemParaBloqueio(
      'Receita Bruta',
      triagemReceitaCA?.classificacao,
      triagemReceitaCA?.mensagem
    )
    if (mdrCentavos > 0) {
      avaliarTriagemParaBloqueio(
        'Despesa MDR',
        triagemDespesaMdrCA?.classificacao,
        triagemDespesaMdrCA?.mensagem
      )
    }

    // Se a conferência foi aprovada e o único candidato de triagemLiquidoCA corresponde ao próprio
    // lançamento líquido do grupo (ex: "STONE VISA CD" único e sem ambiguidade, via conciliação automática GET
    // ou candidato único com assinatura Stone compatível com a Bandeira + Modalidade CD/DB do grupo),
    // registramos como aviso de vínculo conciliado; em qualquer outro caso (múltiplos candidatos, descrição genérica
    // ou lançamento de outro grupo), mantém o bloqueio estrito contra duplicidade.
    const candidatosLiquido = triagemLiquidoCA?.candidatos || []
    const unicoCandidatoLiquido =
      candidatosLiquido.length === 1 ? candidatosLiquido[0] : null

    const classifBandGrupo = bandeiraSelecionadaValida
      ? classificarBandeiraStoneCanonica(bandeiraRaw)
      : null
    const classifProdGrupo =
      bandeiraSelecionadaValida && produtoSelecionadoValido
        ? classificarProdutoModalidadeStone(produtoRaw, bandeiraRaw)
        : null

    const assinaturaUnicoCandidatoLiquido = unicoCandidatoLiquido
      ? extrairAssinaturaStoneLancamentoContaAzul(unicoCandidatoLiquido)
      : null

    const candidatoUnicoPossuiAssinaturaDoGrupo = Boolean(
      unicoCandidatoLiquido &&
        assinaturaUnicoCandidatoLiquido &&
        assinaturaUnicoCandidatoLiquido.ehLancamentoStone &&
        !assinaturaUnicoCandidatoLiquido.ehReceitaBrutaGeradaDcx &&
        !assinaturaUnicoCandidatoLiquido.ehDespesaMdrGeradaDcx &&
        classifBandGrupo &&
        classifProdGrupo &&
        classifProdGrupo.compativelConciliacaoPadraoCdDb &&
        assinaturaUnicoCandidatoLiquido.bandeiraSiglaContaAzul ===
          classifBandGrupo.siglaContaAzul &&
        assinaturaUnicoCandidatoLiquido.modalidadeSigla ===
          classifProdGrupo.modalidadeSigla
    )

    const conferenciaAutomaticaValidaParaUnicoCandidato =
      conferencia.origem_conferencia === 'AUTOMATICA_GET_CONTA_AZUL' &&
      candidatosLiquido.length <= 1 &&
      (Boolean(conferencia.lancamento_conta_azul_correspondente?.id) ||
        Boolean(unicoCandidatoLiquido?.id)) &&
      (!unicoCandidatoLiquido?.id ||
        !conferencia.lancamento_conta_azul_correspondente?.id ||
        unicoCandidatoLiquido.id ===
          conferencia.lancamento_conta_azul_correspondente.id)

    const liquidoEhProprioLancamentoConciliadoDoGrupo =
      conferencia.conferencia_aprovada === true &&
      triagemLiquidoCA?.classificacao !==
        'MULTIPLOS_CANDIDATOS_CONFERENCIA_HUMANA' &&
      (conferenciaAutomaticaValidaParaUnicoCandidato ||
        candidatoUnicoPossuiAssinaturaDoGrupo)

    if (liquidoEhProprioLancamentoConciliadoDoGrupo) {
      const descricaoConciliada =
        conferencia.lancamento_conta_azul_correspondente?.descricao ||
        unicoCandidatoLiquido?.descricao ||
        'STONE'
      avisos.push(
        `Grupo conciliado com o lançamento líquido "${descricaoConciliada}" (${formatarCentavosBRL(liquidoCentavos)}) localizado na Conta Azul.`
      )
    } else {
      avaliarTriagemParaBloqueio(
        'Depósito Líquido (Receita pelo Líquido)',
        triagemLiquidoCA?.classificacao,
        triagemLiquidoCA?.mensagem
      )
    }
  }

  // 9. Construção das Prévias e Payloads Simulados (100% em memória, zero transmissão)
  const bandeiraLabel = filtros.bandeira || 'Todas as Bandeiras'
  const produtoLabel = filtros.produto || 'Todos os Produtos'
  const dataLabel = dataBr || 'Data não selecionada'
  const rotuloGrupoContaAzul =
    bandeiraSelecionadaValida && produtoSelecionadoValido
      ? montarRotuloGrupoStoneContaAzul(bandeiraLabel, produtoLabel)
      : 'STONE'
  const sufixoPadrao = `Stone ${bandeiraLabel} ${produtoLabel} [${rotuloGrupoContaAzul}] — Venc. Orig. ${dataLabel} (${totais.quantidade_parcelas_pagas} parc.)`

  const descricaoReceita = `Recebimento Cartão ${sufixoPadrao}`
  const observacaoReceita = [
    `[DCX LINK · Etapa 1F-A · Prévia Validada]`,
    `Loja: ${empresaNomeLimpo || 'Não selecionada'}`,
    `Grupo Conta Azul: ${rotuloGrupoContaAzul} | Operadora: STONE | Bandeira: ${bandeiraLabel} | Produto: ${produtoLabel}`,
    `Data Vencimento Original: ${dataLabel} | Parcelas Pagas: ${totais.quantidade_parcelas_pagas}`,
    `Valor Bruto: ${formatarCentavosBRL(brutoCentavos)} | MDR: ${formatarCentavosBRL(mdrCentavos)} | Líquido Banco: ${formatarCentavosBRL(liquidoCentavos)}`,
    `Chave Idempotência: ${chaveReceitaBruta}`,
  ].join('\n')

  const descricaoDespesaMdr = `Taxa MDR ${sufixoPadrao}`
  const observacaoDespesaMdr = [
    `[DCX LINK · Etapa 1F-A · Prévia Validada]`,
    `Loja: ${empresaNomeLimpo || 'Não selecionada'}`,
    `Grupo Conta Azul: ${rotuloGrupoContaAzul} | Operadora: STONE | Bandeira: ${bandeiraLabel} | Produto: ${produtoLabel}`,
    `Data Vencimento Original: ${dataLabel} | Parcelas Pagas: ${totais.quantidade_parcelas_pagas}`,
    `Desconto MDR (2 casas): ${formatarCentavosBRL(mdrCentavos)} | MDR Exato (6 casas): ${formatarMicroBRL(totais.desconto_mdr_micro, 6)}`,
    `Chave Idempotência: ${chaveDespesaMdr}`,
  ].join('\n')

  const motivosBloqueioReceita = bloqueios
    .filter((b) => b.campo !== 'categoria_despesa_mdr')
    .map((b) => `${b.titulo}: ${b.detalhe}`)

  const motivosBloqueioDespesa = bloqueios
    .filter((b) => b.campo !== 'categoria_receita')
    .map((b) => `${b.titulo}: ${b.detalhe}`)

  const valorBrutoReais = centavosParaReais(brutoCentavos)
  const valorMdrReais = centavosParaReais(mdrCentavos)

  const payloadReceitaSimulado: PayloadEventoFinanceiroContaAzul1FADTO | null =
    dataValida && contaValida && catReceitaValida && brutoCentavos > 0
      ? {
          data_competencia: dataIso,
          valor: valorBrutoReais,
          descricao: descricaoReceita,
          observacao: observacaoReceita,
          conta_financeira: contaId,
          rateio: [
            {
              id_categoria: categoriaReceitaSelecionada!.id,
              valor: valorBrutoReais,
            },
          ],
          condicao_pagamento: {
            parcelas: [
              {
                descricao: descricaoReceita,
                data_vencimento: dataIso,
                conta_financeira: contaId,
                nota: `Chave: ${chaveReceitaBruta}`,
                detalhe_valor: {
                  valor_bruto: valorBrutoReais,
                  valor_liquido: valorBrutoReais,
                  multa: 0,
                  juros: 0,
                  desconto: 0,
                  taxa: 0,
                },
              },
            ],
          },
        }
      : null

  const payloadDespesaMdrSimulado: PayloadEventoFinanceiroContaAzul1FADTO | null =
    dataValida && contaValida && catDespesaMdrValida && mdrCentavos > 0
      ? {
          data_competencia: dataIso,
          valor: valorMdrReais,
          descricao: descricaoDespesaMdr,
          observacao: observacaoDespesaMdr,
          conta_financeira: contaId,
          rateio: [
            {
              id_categoria: categoriaDespesaMdrSelecionada!.id,
              valor: valorMdrReais,
            },
          ],
          condicao_pagamento: {
            parcelas: [
              {
                descricao: descricaoDespesaMdr,
                data_vencimento: dataIso,
                conta_financeira: contaId,
                nota: `Chave: ${chaveDespesaMdr}`,
                detalhe_valor: {
                  valor_bruto: valorMdrReais,
                  valor_liquido: valorMdrReais,
                  multa: 0,
                  juros: 0,
                  desconto: 0,
                  taxa: 0,
                },
              },
            ],
          },
        }
      : null

  const lancamentoReceitaBruta: ItemPreviaLancamento1FADTO = {
    papel: 'RECEITA_BRUTA',
    tipo_evento: 'RECEITA',
    endpoint_previsto_futuro:
      '/v1/financeiro/eventos-financeiros/contas-a-receber',
    chave_idempotencia: chaveReceitaBruta,
    dispensado_por_valor_zero: false,
    bloqueado: motivosBloqueioReceita.length > 0,
    motivos_bloqueio: motivosBloqueioReceita,
    categoria_esperada: 'Receitas de Vendas',
    categoria_selecionada_id: categoriaReceitaSelecionada?.id || '',
    categoria_selecionada_nome: categoriaReceitaSelecionada?.nome || '',
    categoria_compativel: catReceitaValida,
    conta_financeira_id: contaId,
    conta_financeira_nome: contaNome,
    data_competencia_iso: dataIso,
    data_vencimento_iso: dataIso,
    valor_centavos: brutoCentavos,
    valor_micro: totais.valor_bruto_micro,
    valor_reais: valorBrutoReais,
    descricao: descricaoReceita,
    observacao: observacaoReceita,
    status_triagem_conta_azul:
      triagemReceitaCA?.classificacao || 'NAO_CONSULTADO',
    lancamentos_existentes_identificados: triagemReceitaCA?.candidatos || [],
    payload_simulado_conta_azul: payloadReceitaSimulado,
  }

  const lancamentoDespesaMdr: ItemPreviaLancamento1FADTO = {
    papel: 'DESPESA_MDR',
    tipo_evento: 'DESPESA',
    endpoint_previsto_futuro:
      '/v1/financeiro/eventos-financeiros/contas-a-pagar',
    chave_idempotencia: chaveDespesaMdr,
    dispensado_por_valor_zero: mdrDispensadoPorZero,
    bloqueado: !mdrDispensadoPorZero && motivosBloqueioDespesa.length > 0,
    motivos_bloqueio: mdrDispensadoPorZero ? [] : motivosBloqueioDespesa,
    categoria_esperada: 'Tarifas de Cartão de Créditos',
    categoria_selecionada_id: categoriaDespesaMdrSelecionada?.id || '',
    categoria_selecionada_nome: categoriaDespesaMdrSelecionada?.nome || '',
    categoria_compativel: catDespesaMdrValida,
    conta_financeira_id: contaId,
    conta_financeira_nome: contaNome,
    data_competencia_iso: dataIso,
    data_vencimento_iso: dataIso,
    valor_centavos: mdrCentavos,
    valor_micro: totais.desconto_mdr_micro,
    valor_reais: valorMdrReais,
    descricao: descricaoDespesaMdr,
    observacao: observacaoDespesaMdr,
    status_triagem_conta_azul:
      triagemDespesaMdrCA?.classificacao || 'NAO_CONSULTADO',
    lancamentos_existentes_identificados: triagemDespesaMdrCA?.candidatos || [],
    payload_simulado_conta_azul: payloadDespesaMdrSimulado,
  }

  return {
    etapa: '1F-A',
    modo_execucao: 'SIMULACAO_VALIDACAO_SEM_TRANSMISSAO',
    transmissao_executada: false,
    pronto_para_etapa_1fb: bloqueios.length === 0,
    status_conferencia_exigido: 'CONFERIDO_EXATO',
    status_conferencia_atual: statusConferenciaAtual,
    conferencia_exata_aprovada: conferenciaExataAprovada,
    empresa_id: empresaIdLimpo,
    empresa_nome: empresaNomeLimpo,
    filtros_operacionais: {
      data_vencimento_original_br: dataBr,
      data_vencimento_original_iso: dataIso,
      bandeira: filtros.bandeira || 'Todas as Bandeiras',
      produto: filtros.produto || 'Todos os Produtos',
      quantidade_parcelas_pagas: totais.quantidade_parcelas_pagas,
    },
    conta_financeira: {
      id: contaId,
      descricao: contaNome,
      valida: contaValida,
    },
    validacao_matematica: {
      valor_bruto_centavos: brutoCentavos,
      desconto_mdr_centavos: mdrCentavos,
      desconto_antecipacao_centavos: antecipacaoCentavos,
      valor_liquido_esperado_centavos: liquidoCentavos,
      valor_extrato_bancario_centavos:
        conferencia.valor_extrato_bancario_centavos,
      diferenca_centavos: conferencia.diferenca_centavos,
      equacao_valida: equacaoMatematicaValida,
    },
    validacao_idempotencia: {
      chave_lote: chaveLote,
      chave_receita_bruta: chaveReceitaBruta,
      chave_despesa_mdr: chaveDespesaMdr,
      possui_conflito_idempotencia: possuiConflitoIdempotencia,
      detalhe: possuiConflitoIdempotencia
        ? 'Operação bloqueada por registro pré-existente ou ambíguo no controle de idempotência.'
        : 'Chaves de idempotência inéditas e livres para preparação.',
    },
    bloqueios,
    avisos,
    lancamento_receita_bruta: lancamentoReceitaBruta,
    lancamento_despesa_mdr: lancamentoDespesaMdr,
  }
}
