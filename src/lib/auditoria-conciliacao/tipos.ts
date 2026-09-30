/**
 * MÓDULO: Auditoria Inteligente de Conciliação Bancária
 * CAMINHO: src/lib/auditoria-conciliacao/tipos.ts
 * 
 * Definições de Tipos TypeScript Estritos para o Módulo Satélite.
 * Zero acoplamento ou interferência em módulos existentes.
 */

export type TipoTransacaoBancaria = 'DEBITO' | 'CREDITO';
export type FormatoArquivoExtrato = 'EXCEL' | 'CSV';

/**
 * Ciclo de Vida da Sessão de Auditoria (Inclui EM_ANALISE)
 */
export type StatusAuditoriaSessao = 'ABERTA' | 'EM_ANALISE' | 'FINALIZADA' | 'REABERTA';

/**
 * Cenários de Auditoria Identificados pelo Motor
 */
export type StatusAuditoriaConciliacao = 
  | 'CONFORME'                    // 🟢 Perfeitamente conciliado no ERP com dados consistentes
  | 'NAO_CONCILIADO'              // 🟡 Baixado no ERP, mas pendente de conciliação com extrato
  | 'FORNECEDOR_INCORRETO'        // 🔵 Conciliado, mas beneficiário do extrato diverge do ERP
  | 'CATEGORIA_INCORRETA'         // ⚠️ Conciliado, mas categoria conflita com governança/DRE
  | 'LANCAMENTO_AUSENTE'          // 🔴 Movimentação no extrato sem contrapartida no ERP
  | 'DUPLICIDADE'                 // 🟣 Mais de um lançamento no ERP para uma saída bancária
  | 'DIVERGENCIA_VALOR'           // 🟠 Valor difere (centavos, juros ou tarifas retidas)
  | 'DIVERGENCIA_DATA'            // 📅 Data de baixa diverge além da tolerância bancária
  | 'DIVERGENCIA_CONTA'           // 🏦 Lançamento baixado em conta financeira diferente da auditada
  | 'DIVERGENCIA_CENTRO_CUSTO'    // 🏢 Centro de custo diverge ou está ausente
  | 'DIVERGENCIA_MULTIPLA'        // ⚡ Divergência simultânea em múltiplos campos críticos
  | 'CONCILIADO_BAIXA_CONFIANCA'; // ⚪ Conciliado no ERP, porém com score de confiança duvidoso

/**
 * Status de Governança e Justificativa Contábil
 */
export type StatusGovernancaConciliacao = 
  | 'PENDENTE'
  | 'JUSTIFICADA'
  | 'CORRIGIDA'
  | 'VALIDADA';

/**
 * Tipos de registros armazenados na tabela satélite de cache da Conta Azul
 */
export type TipoRegistroCacheContaAzul = 
  | 'CONTAS_PAGAR' 
  | 'CONTAS_RECEBER' 
  | 'TRANSFERENCIAS' 
  | 'PARCELA_DETALHE';

/**
 * Transação Canônica extraída do Extrato Bancário (Fonte da Verdade)
 */
export interface TransacaoExtratoCanonica {
  id: string; // Hash determinístico SHA-256
  data: string; // YYYY-MM-DD
  descricaoOriginal: string;
  descricaoSanitizada: string;
  documento?: string | null;
  valor: number; // Sempre positivo, float com 2 casas
  tipo: TipoTransacaoBancaria;
  saldoApos?: number | null;
}

/**
 * Dados de Baixa da Parcela no ERP Conta Azul v2
 */
export interface BaixaContaAzulAuditavel {
  id: string;
  dataPagamento: string;
  valor: number;
  idReconciliacao?: string | null;
  metodoPagamento?: string | null;
  origem?: string | null;
  observacao?: string | null;
  contaFinanceiraId?: string | null;
}

/**
 * Lançamento Financeiro baixado na Conta Azul v2 (Sistema Auditado)
 */
export interface LancamentoContaAzulAuditavel {
  parcelaId: string;
  eventoId: string;
  tipoEvento: 'RECEITA' | 'DESPESA';
  descricao: string;
  fornecedorClienteId?: string | null;
  fornecedorClienteNome: string;
  fornecedorCpfCnpj?: string | null;
  categoriaId?: string | null;
  categoriaNome: string;
  centroCustoNome?: string | null;
  contaFinanceiraId?: string | null;
  contaFinanceiraNome?: string | null;
  valorTotal: number;
  valorPago: number;
  dataVencimento: string;
  dataCompetencia?: string | null;
  dataPagamento?: string | null;
  status: string; // Ex: QUITADO, RECEBIDO
  conciliado: boolean;
  baixas: BaixaContaAzulAuditavel[];
}

/**
 * Campo divergente individual detectado na reconciliação
 */
export interface CampoDivergenteConciliacao {
  campo: 'VALOR' | 'DATA' | 'FORNECEDOR' | 'CATEGORIA' | 'CENTRO_CUSTO' | 'CONTA_FINANCEIRA';
  label: string;
  esperado: string;
  encontrado: string;
  detalhe?: string;
}

/**
 * Detalhes diagnósticos da reconciliação para rastreabilidade
 */
export interface DetalhesDiagnosticoConciliacao {
  motivo: string;
  categoriaEsperada?: string;
  categoriaAtual?: string;
  fornecedorEsperado?: string;
  fornecedorAtual?: string;
  contaFinanceiraEsperada?: string;
  contaFinanceiraAtual?: string;
  centroCustoEsperado?: string;
  centroCustoAtual?: string;
  dataEsperada?: string;
  dataAtual?: string;
  duplicidadesIds?: string[];
  diferencaDias?: number;
  diferencaValor?: number;
  justificativaHistorica?: string;
  tipoDivergencia?: string;
  camposDivergentes?: CampoDivergenteConciliacao[];
  regraDeparaAplicada?: string;
  tipoRegraDepara?: 'FORNECEDOR' | 'CATEGORIA' | 'CENTRO_CUSTO';
}

/**
 * Registro de Sessão / Lote de Auditoria no Supabase com Rastreabilidade
 */
export interface AuditoriaConciliacaoSessao {
  id: string;
  empresaId: string;
  contaFinanceiraId: string;
  bancoNome: string;
  arquivoNome: string;
  arquivoTipo: FormatoArquivoExtrato;
  arquivoTamanho?: number | null;
  arquivoHash: string; // SHA-256 para integridade e idempotência
  arquivoStoragePath?: string | null; // Caminho opcional no bucket Supabase Storage
  periodoInicio: string; // YYYY-MM-DD
  periodoFim: string; // YYYY-MM-DD
  totalTransacoes: number;
  totalDebitos: number;
  totalCreditos: number;
  valorTotalDebitos: number;
  valorTotalCreditos: number;
  
  // Ciclo de Vida da Auditoria
  statusAuditoria: StatusAuditoriaSessao;
  dataFinalizacao?: string | null;
  finalizadoPor?: string | null;
  
  // KPIs de Saúde
  saudeConciliacao: number; // 0.00 a 100.00%
  gapDesconciliado: number; // R$
  totalRiscosContabeis: number;
  valorDivergencias: number; // R$
  
  criadoPor?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Registro do Item Auditado no Supabase
 */
export interface AuditoriaConciliacaoItem {
  id: string;
  sessaoId: string;
  empresaId: string;
  
  // Extrato
  dataTransacao: string;
  descricaoExtrato: string;
  descricaoSanitizada: string;
  documentoExtrato?: string | null;
  tipoTransacao: TipoTransacaoBancaria;
  valorExtrato: number;
  
  // Conta Azul
  contaAzulParcelaId?: string | null;
  contaAzulEventoId?: string | null;
  contaAzulBaixaId?: string | null;
  idReconciliacaoCa?: string | null;
  conciliadoNoCa: boolean;
  fornecedorClienteCa?: string | null;
  fornecedorCaId?: string | null;
  categoriaCa?: string | null;
  categoriaCaId?: string | null;
  valorCa?: number | null;
  dataPagamentoCa?: string | null;
  metodoPagamentoCa?: string | null;
  
  // Análise e Scores
  statusAuditoria: StatusAuditoriaConciliacao;
  scoreConfianca: number; // 0 a 100
  scoreFornecedor: number; // 0 a 100
  scoreCategoria: number; // 0 a 100
  diferencaValor: number;
  detalhesDiagnostico?: DetalhesDiagnosticoConciliacao | null;
  
  // Governança
  statusGovernanca: StatusGovernancaConciliacao;
  motivoJustificativa?: string | null;
  justificadoPor?: string | null;
  justificadoEm?: string | null;
  
  createdAt: string;
}

/**
 * Registro de Cache Satélite da Conta Azul no Supabase
 */
export interface AuditoriaConciliacaoCaCache {
  id: string;
  empresaId: string;
  contaFinanceiraId: string;
  periodoInicio: string;
  periodoFim: string;
  tipoRegistro: TipoRegistroCacheContaAzul;
  chaveRegistro: string;
  dadosJson: any;
  sincronizadoEm: string;
  expiraEm: string;
}

/**
 * Resumo dos 4 KPIs Principais para o Dashboard Dark Fintech
 */
export interface ResumoKpisSaudeConciliacao {
  saudeConciliacao: number; // % (KPI Principal)
  gapDesconciliadoValor: number; // R$
  totalRiscosContabeis: number; // Qtd
  divergenciasFinanceirasValor: number; // R$
  
  // Totalizadores Auxiliares
  totalTransacoes: number;
  totalConformes: number;
  totalNaoConciliados: number;
  totalAusentesNoErp: number;
  totalDuplicidades: number;
  totalConciliadosBaixaConfianca: number;
  valorTotalDebitos: number;
  valorTotalCreditos: number;
  
  periodo: {
    inicio: string;
    fim: string;
  };
  
  statusSessao: StatusAuditoriaSessao;
  dataFinalizacao?: string | null;
}

/**
 * Opções de Configuração e Blindagem da Sincronização com Conta Azul
 */
export interface OpcoesSincronizacaoContaAzul {
  /** Força atualização buscando dados frescos e sobrescrevendo o cache */
  forcarAtualizacao?: boolean;
  /** Operação estritamente sobre o cache satélite, sem nenhuma chamada externa à API */
  modoCacheOnly?: boolean;
  /** Teto máximo de requisições externas permitidas nesta execução (padrão: 30) */
  limiteRequisicoes?: number;
}
