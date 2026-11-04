/**
 * DCX LINK — MÓDULO CONTAS A RECEBER (ETAPA 1A: FUNDAÇÃO ISOLADA)
 * Tipagens estritas e contratos estruturais para as duas frentes independentes:
 * 1. CARTOES_ADQUIRENTE (Stone, Rede, Getnet, InfinitePay)
 * 2. OUTROS_RECEBIMENTOS (PIX e demais modalidades sob definição gradual)
 */

export type FrenteRecebimento = 'CARTOES_ADQUIRENTE' | 'OUTROS_RECEBIMENTOS'

export type OperadoraCartao = 'STONE' | 'REDE' | 'GETNET' | 'INFINITEPAY'

export type OrigemOutroRecebimento =
  | 'PIX'
  | 'TRANSFERENCIA_BANCARIA'
  | 'BOLETO'
  | 'DINHEIRO'
  | 'OUTRO'

export type OrigemRecebimento = OperadoraCartao | OrigemOutroRecebimento

export type BandeiraCartao =
  | 'VISA'
  | 'MASTERCARD'
  | 'ELO'
  | 'AMEX'
  | 'HIPERCARD'
  | 'CABAL'
  | 'PIX_MAQUININHA'
  | 'VOUCHER'
  | 'OUTRAS'

export type ModalidadeCartao =
  | 'DEBITO'
  | 'CREDITO_VISTA'
  | 'CREDITO_PARCELADO'
  | 'ANTECIPACAO'
  | 'PIX'
  | 'VOUCHER'
  | 'OUTRA'

/**
 * Natureza financeira da movimentação.
 * Movimentações de naturezas diferentes possuem equações e regras distintas.
 */
export type NaturezaMovimentacaoReceber =
  | 'LIQUIDACAO_VENDA_NORMAL'
  | 'ANTECIPACAO_RECEBIVEIS'
  | 'ESTORNO_CANCELAMENTO'
  | 'AJUSTE_ALUGUEL_TARIFA'
  | 'OUTRO_RECEBIMENTO_DEPENDENTE_REGRA'

export type MetodoPagamentoContaAzul =
  | 'CARTAO_CREDITO'
  | 'CARTAO_DEBITO'
  | 'PIX_PAGAMENTO_INSTANTANEO'
  | 'BOLETO_BANCARIO'
  | 'TRANSFERENCIA_BANCARIA'
  | 'DINHEIRO'
  | 'OUTRO'

/**
 * Representação canônica de uma movimentação financeira em centavos inteiros.
 */
export interface MovimentacaoReceberCanonica {
  id_interno?: string
  empresa_id: string
  frente: FrenteRecebimento
  origem: OrigemRecebimento
  natureza: NaturezaMovimentacaoReceber

  data_competencia: string // YYYY-MM-DD (data da venda ou emissão)
  data_recebimento: string // YYYY-MM-DD (data da liquidação/crédito efetivo)

  // Valores em centavos inteiros (ex: R$ 500,00 = 50000)
  valor_bruto_centavos: number
  taxa_mdr_centavos: number
  taxa_antecipacao_centavos: number
  taxa_total_centavos: number
  valor_liquido_centavos: number

  // Dados específicos de Cartões (Frente 1)
  estabelecimento_codigo?: string | null
  nsu_tid?: string | null
  codigo_autorizacao?: string | null
  bandeira?: BandeiraCartao | null
  modalidade_cartao?: ModalidadeCartao | null
  parcela_numero?: number | null
  total_parcelas?: number | null

  // Dados específicos de Outros Recebimentos / PIX (Frente 2)
  identificador_transacao_bancaria?: string | null // EndToEndId, TxId, Nosso Número
  documento_referencia?: string | null // Número OS, NF ou documento vinculado
  pagador_nome?: string | null
  pagador_cpf_cnpj?: string | null
  descricao_original?: string | null
}

/**
 * Resultado da validação matemática de uma movimentação ou lote.
 */
export interface ResultadoValidacaoMatematica {
  valido: boolean
  natureza: NaturezaMovimentacaoReceber
  valor_bruto_centavos: number
  taxa_mdr_centavos: number
  taxa_antecipacao_centavos: number
  taxa_total_centavos: number
  valor_liquido_informado_centavos: number
  valor_liquido_esperado_centavos: number
  diferenca_centavos: number
  codigo_erro?:
    | 'DIVERGENCIA_BRUTO_TAXA_LIQUIDO'
    | 'VALOR_NEGATIVO_INVALIDO'
    | 'TAXA_MAIOR_QUE_BRUTO'
    | 'NATUREZA_INCOMPATIVEL'
    | 'ESTORNO_POSITIVO_INVALIDO'
    | 'AJUSTE_COM_VENDA_BRUTA_INVALIDA'
    | 'REGRA_OPERACIONAL_NAO_DEFINIDA'
  mensagem: string
}

/**
 * Resultado da validação de saldo para baixa parcial, dividida ou integral em uma parcela.
 */
export interface ResultadoValidacaoBaixaParcela {
  permitido: boolean
  tipo_baixa: 'INTEGRAL' | 'PARCIAL' | 'BLOQUEADA'
  parcela_id: string
  saldo_aberto_anterior_centavos: number
  valor_baixa_solicitado_centavos: number
  saldo_remanescente_centavos: number
  codigo_bloqueio?:
    | 'PARCELA_JA_QUITADA'
    | 'VALOR_BAIXA_ZERO_OU_NEGATIVO'
    | 'VALOR_EXCEDE_SALDO_ABERTO'
  mensagem: string
}

/**
 * Resumo consolidado de um lote diário separado por natureza financeira.
 */
export interface ResumoConsolidadoDia {
  data_recebimento: string
  origem: OrigemRecebimento
  quantidade_vendas_normais: number
  quantidade_antecipacoes: number
  quantidade_estornos: number
  quantidade_ajustes: number
  bruto_vendas_centavos: number
  taxa_mdr_total_centavos: number
  taxa_antecipacao_total_centavos: number
  taxa_total_centavos: number
  liquido_vendas_centavos: number
  total_estornos_centavos: number // Valor negativo ou zero representando saída/retenção
  total_ajustes_tarifas_centavos: number // Valor negativo ou zero
  liquido_efetivo_deposito_centavos: number
  consistente: boolean
  divergencias: string[]
}

/**
 * Contratos oficiais de leitura da API Conta Azul v2 (sem execução na Etapa 1A).
 */
export interface ParcelaBuscaContaAzulDTO {
  id: string // UUID da parcela no Conta Azul
  evento_id?: string | null // UUID do evento financeiro pai, quando presente
  descricao: string
  data_vencimento: string // YYYY-MM-DD
  data_competencia?: string | null
  status: 'ABERTO' | 'PARCIAL' | 'QUITADO' | 'ATRASADO' | 'PERDIDO' | string
  total: number // Valor em reais (ex: 500.00)
  pago: number // Valor já pago/baixado em reais
  nao_pago: number // Saldo em aberto em reais
  numero_documento?: string | null
  nsu?: string | null
  cliente?: {
    id: string
    nome: string
    cpf_cnpj?: string | null
  } | null
}

export interface BaixaParcelaContaAzulDTO {
  id: string // UUID da baixa
  versao: number
  data_pagamento: string // YYYY-MM-DD
  conta_financeira: string // UUID da conta financeira
  metodo_pagamento: MetodoPagamentoContaAzul | string
  nsu?: string | null
  observacao?: string | null
  composicao_valor: {
    valor_baixado: number
    valor_bruto?: number
    taxa?: number
    multa?: number
    juros?: number
    desconto?: number
    acrescimo?: number
  }
}

/**
 * Preservação do vínculo quádruplo com o Conta Azul.
 */
export interface VinculoContaAzul {
  conta_azul_evento_id: string | null
  conta_azul_parcela_id: string | null
  conta_azul_baixa_id: string | null
  conta_financeira_id: string
}

/**
 * Classificação de confiança para correspondência com receitas existentes no Conta Azul.
 * Valor + Data isolados NUNCA têm confiança suficiente para baixa automática.
 */
export type NivelConfiancaMatch =
  | 'EXATO_IDENTIFICADOR'
  | 'ALTO_DOCUMENTO_E_CLIENTE'
  | 'AMBIGUO_MULTIPLOS_CANDIDATOS'
  | 'INSUFICIENTE_APENAS_VALOR_DATA'
  | 'SEM_CORRESPONDENCIA'

export type AcaoTriagemRecebimento =
  | 'BAIXAR_PARCELA_EXISTENTE_AUTOMATICO'
  | 'REQUER_CONFERENCIA_MANUAL'
  | 'CRIAR_NOVA_RECEITA_E_BAIXAR'
  | 'BLOQUEAR_PARCELA_JA_QUITADA'
  | 'BLOQUEAR_AGUARDANDO_REGRA_MODALIDADE'

export interface ResultadoCorrespondenciaReceita {
  nivel_confianca: NivelConfiancaMatch
  acao_recomendada: AcaoTriagemRecebimento
  autoriza_baixa_automatica: boolean
  parcela_candidata_id: string | null
  candidatos_encontrados: number
  motivo: string
}

/**
 * Contrato estrutural para os Adapters de Extratos das Adquirentes (Stone, Rede, Getnet, InfinitePay).
 */
export interface ResultadoParserAdquirente {
  status: 'SUCESSO' | 'LAYOUT_PENDENTE_AMOSTRA_REAL' | 'ARQUIVO_INVALIDO'
  operadora: OperadoraCartao
  movimentacoes: MovimentacaoReceberCanonica[]
  mensagem: string
}

export interface AdquirenteParserAdapter {
  readonly operadora: OperadoraCartao
  readonly homologadoComAmostraReal: boolean
  detectarCabecalho(colunas: string[]): boolean
  interpretarLinhas(
    empresaId: string,
    linhasBrutas: Array<Record<string, unknown>>
  ): ResultadoParserAdquirente
}

// ============================================================================
// ETAPA 1C — TIPAGENS ESPECÍFICAS DA PLANILHA STONE E CONFERÊNCIA BANCÁRIA
// ============================================================================

export type StatusParcelaStone = 'PAGO' | 'ABERTO' | 'AGENDADO' | 'OUTRO'

export type ClassificacaoLinhaStone =
  | 'VENDA_NORMAL'
  | 'VENDA_COM_ANTECIPACAO'
  | 'AJUSTE_COBRANCA'
  | 'AJUSTE_BALANCEAMENTO_SALDO'
  | 'ESTORNO_CANCELAMENTO'
  | 'OUTRA_CATEGORIA'

/**
 * Representa uma linha individual interpretada fielmente do CSV da Stone (20 colunas).
 * Mantém tanto os valores originais em micro-reais (6 casas decimais = x 1.000.000)
 * quanto a conversão monetária em centavos (2 casas decimais = x 100).
 */
export interface LinhaExtratoStone {
  numero_linha_csv: number
  chave_unica_composta: string

  // 20 colunas originais do CSV da Stone
  documento: string
  stonecode: string
  categoria: string
  data_venda_original_str: string
  data_venda_iso: string | null // YYYY-MM-DD
  data_vencimento_str: string // DD/MM/YYYY
  data_vencimento_iso: string // YYYY-MM-DD
  data_vencimento_original_str: string // DD/MM/YYYY — Coluna principal do 1º filtro operacional
  data_vencimento_original_iso: string // YYYY-MM-DD
  bandeira: string
  produto: string
  stone_id: string
  qtd_parcelas: number
  numero_parcela: number

  // Valores em micro-reais (escala 1.000.000 para preservar as 6 casas decimais da Stone sem erro IEEE-754)
  valor_bruto_micro: number
  valor_liquido_micro: number
  desconto_mdr_micro: number // Valor original da planilha (negativo quando há desconto, ex: -10395000)
  desconto_mdr_absoluto_micro: number // Valor positivo do desconto MDR para cálculo de despesa
  desconto_antecipacao_micro: number
  desconto_antecipacao_absoluto_micro: number
  desconto_unificado_micro: number
  entradas_brutas_micro: number
  saidas_brutas_micro: number

  // Valores monetários padrão em centavos (escala 100)
  valor_bruto_centavos: number
  valor_liquido_centavos: number
  desconto_mdr_absoluto_centavos: number
  desconto_antecipacao_absoluto_centavos: number

  ultimo_status: string
  status_classificado: StatusParcelaStone
  data_ultimo_status_str: string

  // Classificação operacional segura
  classificacao: ClassificacaoLinhaStone
  eh_venda_operacional: boolean
  equacao_micro_consistente: boolean
  diferenca_equacao_micro: number
}

export interface FiltrosOperacionaisStone {
  data_vencimento_original: string // '' para Todas ou 'DD/MM/YYYY'
  bandeira: string // '' para Todas ou ex: 'Visa', 'MasterCard', 'Elo'
  produto: string // '' para Todos ou ex: 'Debito', 'Credito', 'Debito Pre-pago'
  apenas_vendas_pagas?: boolean
}

export interface TotaisFiltradosStone {
  quantidade_registros_total: number
  quantidade_vendas_operacionais: number
  quantidade_ajustes_cobrancas_estornos: number

  // Contadores de status exigidos na Etapa 1C
  quantidade_parcelas_pagas: number
  quantidade_parcelas_abertas: number
  quantidade_parcelas_agendadas: number

  // Totais das vendas operacionais PAGAS (base para o lançamento bancário, Receita Bruta e Despesa MDR)
  valor_bruto_micro: number
  desconto_mdr_micro: number // Positivo representando o total de MDR descontado
  desconto_antecipacao_micro: number // Positivo representando o total de antecipação descontada
  valor_liquido_micro: number

  // Equivalentes monetários arredondados em centavos (2 casas decimais — R$)
  valor_bruto_centavos: number
  desconto_mdr_centavos: number
  desconto_antecipacao_centavos: number
  valor_liquido_centavos: number

  // Ajuste de arredondamento de centavos se (Bruto_centavos - MDR_centavos - Antecip_centavos !== Liquido_centavos)
  desconto_mdr_ajustado_centavos: number
  diferenca_arredondamento_centavos: number

  // Totais segregados de itens que NÃO são venda normal/MDR (Cobrança, Balanceamento de Saldo, Estornos)
  total_ajustes_nao_operacionais_micro: number
  total_ajustes_nao_operacionais_centavos: number
}

export interface ResultadoConferenciaBancariaStone {
  valor_liquido_stone_centavos: number
  valor_liquido_stone_micro: number
  valor_extrato_bancario_centavos: number | null
  diferenca_centavos: number
  conferencia_aprovada: boolean
  bloqueada_para_conferencia: boolean
  status_codigo:
    | 'AGUARDANDO_VALOR_BANCO'
    | 'SEM_REGISTROS_PAGOS'
    | 'APROVADA_EXATA'
    | 'DIVERGENTE_BLOQUEADA'
  mensagem: string
}

export interface PreviaLancamentosMemoriaStone {
  disponivel: boolean
  motivo_indisponibilidade?: string
  filtros_aplicados: {
    data_vencimento_original: string
    bandeira: string
    produto: string
  }
  receita: {
    tipo: 'RECEITA'
    categoria_sugerida: 'Receitas de Vendas'
    valor_centavos: number
    valor_micro: number
    descricao_sugerida: string
  }
  despesa_mdr: {
    tipo: 'DESPESA'
    categoria_sugerida: 'Tarifas de Cartão de Créditos'
    valor_centavos: number
    valor_micro: number
    descricao_sugerida: string
  }
  resultado: {
    valor_bruto_centavos: number
    desconto_mdr_centavos: number
    desconto_antecipacao_centavos: number
    valor_liquido_esperado_centavos: number
    valor_deposito_bancario_centavos: number
    diferenca_centavos: number
    situacao_conferencia: 'CONFERENCIA_APROVADA' | 'BLOQUEADA_POR_DIVERGENCIA'
  }
}

// ============================================================================
// ETAPA 1E — TIPAGENS DA INTEGRAÇÃO SATÉLITE CONTA AZUL (SOMENTE LEITURA / GET)
// ============================================================================

export interface ContaFinanceiraReceberDTO {
  id: string
  descricao: string
  tipo?: string | null
  banco?: string | null
}

export interface CategoriaFinanceiraReceberDTO {
  id: string
  nome: string
  tipo: 'RECEITA' | 'DESPESA'
}

export interface LancamentoExistenteContaAzulDTO {
  id: string // UUID da parcela ou evento retornado na busca
  evento_id?: string | null
  tipo_lancamento: 'RECEITA' | 'DESPESA'
  data_vencimento: string // YYYY-MM-DD
  data_competencia?: string | null
  data_pagamento?: string | null
  valor_total_centavos: number
  valor_pago_centavos: number
  valor_aberto_centavos: number
  status: string // ABERTO, QUITADO, PARCIAL, ATRASADO, etc.
  descricao: string
  observacao?: string | null
  numero_documento?: string | null
  conta_financeira_id?: string | null
  conta_financeira_nome?: string | null
  categoria_id?: string | null
  categoria_nome?: string | null
  contato_id?: string | null
  contato_nome?: string | null
  contato_cpf_cnpj?: string | null
}

export type ClassificacaoTriagemLancamentoCA =
  | 'CORRESPONDENCIA_DETERMINISTICA'
  | 'JA_QUITADO_BLOQUEADO'
  | 'MULTIPLOS_CANDIDATOS_CONFERENCIA_HUMANA'
  | 'CANDIDATO_VALOR_DATA_CONFERENCIA_HUMANA'
  | 'NAO_LOCALIZADO_NO_PERIODO'

export interface ResultadoTriagemItemLoteCA {
  classificacao: ClassificacaoTriagemLancamentoCA
  autoriza_vinculo_automatico: boolean
  ja_quitado: boolean
  candidatos: LancamentoExistenteContaAzulDTO[]
  mensagem: string
}

export interface AvaliacaoPeriodoContaAzulStoneDTO {
  periodo_consultado: {
    data_de: string // YYYY-MM-DD
    data_ate: string // YYYY-MM-DD
  }
  total_receitas_no_periodo: number
  total_despesas_no_periodo: number
  receitas_no_periodo: LancamentoExistenteContaAzulDTO[]
  despesas_no_periodo: LancamentoExistenteContaAzulDTO[]
  triagem_receita_bruta?: ResultadoTriagemItemLoteCA | null
  triagem_despesa_mdr?: ResultadoTriagemItemLoteCA | null
  triagem_deposito_liquido?: ResultadoTriagemItemLoteCA | null
}

export interface RespostaContextoContaAzulReceberDTO {
  connected: boolean
  status_conexao: 'CONECTADA' | 'DESCONECTADA' | 'ATENCAO'
  reconectar: boolean
  empresa_id: string
  aviso?: string | null
  contas_financeiras: ContaFinanceiraReceberDTO[]
  categorias_receita: CategoriaFinanceiraReceberDTO[]
  categorias_despesa: CategoriaFinanceiraReceberDTO[]
  sugestao_categoria_receita_vendas: CategoriaFinanceiraReceberDTO | null
  sugestao_categoria_despesa_mdr: CategoriaFinanceiraReceberDTO | null
  avaliacao_periodo?: AvaliacaoPeriodoContaAzulStoneDTO | null
}


