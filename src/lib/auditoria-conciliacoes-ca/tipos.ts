/**
 * Tipagens Oficiais do Módulo de Auditoria Inteligente de Conciliações Conta Azul
 * Operação 100% READ-ONLY sobre lançamentos já conciliados no ERP.
 */

export type NivelCompatibilidadeFornecedor = 'COMPATIVEL' | 'SUSPEITA_MODERADA' | 'SUSPEITA_CRITICA';

export type OrigemCategoriaEsperada = 'CADASTRO_HOMOLOGADO' | 'DEPARA' | 'HISTORICO_PREDOMINANTE' | null;

export type TipoEscopoFornecedor = 'MONOESCOPO' | 'MULTIESCOPO' | 'NOVO_FORNECEDOR';

export interface ItemConciliadoAuditavel {
  id: string;
  conta_azul_id: string;
  descricao_banco: string;
  descricao_sanitizada: string;
  fornecedor_conciliado: string;
  fornecedor_normalizado: string;
  categoria_conciliada: string;
  valor: number;
  data_competencia: string | null;
  data_vencimento: string | null;
  data_pagamento: string | null;
  status: string;

  // Regra 1: Compatibilidade de Vínculo (Banco vs Fornecedor)
  score_compatibilidade_fornecedor: number; // 0 a 100
  status_fornecedor: NivelCompatibilidadeFornecedor;
  fornecedor_esperado_sugerido?: string | null;

  // Regra 2 & 3: Consistência e Dispersão de Categorias
  categoria_esperada: string | null;
  origem_categoria_esperada: OrigemCategoriaEsperada;
  divergencia_categoria: boolean;
  tipo_escopo_fornecedor: TipoEscopoFornecedor;
  confianca_categoria_percentual: number;

  // Diagnóstico Consolidado
  motivos_divergencia: string[];
  em_risco_financeiro: boolean;

  // Regra 4: Anomalia Recorrente
  padrao_recorrente_identificado?: string | null;
}

export interface RecorrenciaSuspeita {
  descricao_padrao: string;
  fornecedor_conciliado: string;
  ocorrencias: number;
  valor_total: number;
  sugestao: string;
}

export interface ResumoAuditoriaConciliacoesCA {
  empresa_id: string;
  periodo: {
    inicio: string;
    fim: string;
  };
  total_auditado: number;
  total_consistentes: number;
  divergencias_fornecedor: number;
  divergencias_categoria: number;
  total_divergencias_geral: number;
  taxa_conformidade_percentual: number;
  valor_total_auditado: number;
  valor_financeiro_em_risco: number;
  recorrencias_suspeitas: RecorrenciaSuspeita[];
  lista_detalhada: ItemConciliadoAuditavel[];
}

export interface ParametrosAuditoriaConciliacao {
  empresaId: string;
  dataInicio?: string;
  dataFim?: string;
  limite?: number;
}
