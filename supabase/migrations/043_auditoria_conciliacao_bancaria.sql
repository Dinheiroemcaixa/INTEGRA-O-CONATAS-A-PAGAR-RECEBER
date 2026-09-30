-- ============================================================
-- CONNECTA AI — MIGRAÇÃO SATÉLITE: 043
-- MÓDULO: Auditoria Inteligente de Conciliação Bancária
-- ISOLAMENTO: 100% Satélite (Sem impacto em tabelas ou módulos existentes)
-- ============================================================

-- 1. TABELA: auditoria_conciliacao_sessoes (Estrutura Inicial)
CREATE TABLE IF NOT EXISTS public.auditoria_conciliacao_sessoes (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id              UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  conta_financeira_id     TEXT NOT NULL,
  banco_nome              TEXT NOT NULL,
  arquivo_nome            TEXT NOT NULL,
  arquivo_tipo            TEXT NOT NULL CHECK (arquivo_tipo IN ('EXCEL', 'CSV')),
  periodo_inicio          DATE NOT NULL,
  periodo_fim             DATE NOT NULL,
  total_transacoes        INT NOT NULL DEFAULT 0,
  total_debitos           INT NOT NULL DEFAULT 0,
  total_creditos          INT NOT NULL DEFAULT 0,
  valor_total_debitos     NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  valor_total_creditos    NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  
  status_auditoria        TEXT NOT NULL DEFAULT 'ABERTA' 
                          CHECK (status_auditoria IN ('ABERTA', 'FINALIZADA', 'REABERTA')),
  data_finalizacao        TIMESTAMPTZ,
  finalizado_por          TEXT,
  
  saude_conciliacao       NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  gap_desconciliado       NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  total_riscos_contabeis  INT NOT NULL DEFAULT 0,
  valor_divergencias      NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  
  criado_por              TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. TABELA: auditoria_conciliacao_itens (Estrutura Inicial)
CREATE TABLE IF NOT EXISTS public.auditoria_conciliacao_itens (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sessao_id               UUID NOT NULL REFERENCES public.auditoria_conciliacao_sessoes(id) ON DELETE CASCADE,
  empresa_id              UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  
  data_transacao          DATE NOT NULL,
  descricao_extrato       TEXT NOT NULL,
  descricao_sanitizada    TEXT NOT NULL,
  documento_extrato       TEXT,
  tipo_transacao          TEXT NOT NULL CHECK (tipo_transacao IN ('DEBITO', 'CREDITO')),
  valor_extrato           NUMERIC(14,2) NOT NULL,
  
  conta_azul_parcela_id   TEXT,
  conta_azul_evento_id    TEXT,
  conta_azul_baixa_id     TEXT,
  id_reconciliacao_ca     TEXT,
  conciliado_no_ca        BOOLEAN NOT NULL DEFAULT false,
  fornecedor_cliente_ca   TEXT,
  fornecedor_ca_id        TEXT,
  categoria_ca            TEXT,
  categoria_ca_id         TEXT,
  valor_ca                NUMERIC(14,2),
  data_pagamento_ca       DATE,
  metodo_pagamento_ca     TEXT,
  
  status_auditoria        TEXT NOT NULL CHECK (status_auditoria IN (
                            'CONFORME',
                            'NAO_CONCILIADO',
                            'FORNECEDOR_INCORRETO',
                            'CATEGORIA_INCORRETA',
                            'LANCAMENTO_AUSENTE',
                            'DUPLICIDADE',
                            'DIVERGENCIA_VALOR',
                            'CONCILIADO_BAIXA_CONFIANCA'
                          )),
                          
  score_confianca         NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  score_fornecedor        NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  score_categoria         NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  diferenca_valor         NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  detalhes_diagnostico    JSONB,
  
  status_governanca       TEXT NOT NULL DEFAULT 'PENDENTE' 
                          CHECK (status_governanca IN ('PENDENTE', 'JUSTIFICADA', 'CORRIGIDA', 'VALIDADA')),
  motivo_justificativa    TEXT,
  justificado_por         TEXT,
  justificado_em          TIMESTAMPTZ,
  
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_conc_sessoes_empresa 
  ON public.auditoria_conciliacao_sessoes (empresa_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_conc_itens_sessao 
  ON public.auditoria_conciliacao_itens (sessao_id, status_auditoria);

CREATE INDEX IF NOT EXISTS idx_audit_conc_itens_ca_parcela 
  ON public.auditoria_conciliacao_itens (empresa_id, conta_azul_parcela_id)
  WHERE conta_azul_parcela_id IS NOT NULL;

ALTER TABLE public.auditoria_conciliacao_sessoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria_conciliacao_itens ENABLE ROW LEVEL SECURITY;
