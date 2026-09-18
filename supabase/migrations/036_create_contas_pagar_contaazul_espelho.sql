-- ============================================================
-- TABELA: contas_pagar_contaazul_espelho
-- Armazena o espelho dos lançamentos de contas a pagar do Conta Azul
-- ============================================================

CREATE TABLE IF NOT EXISTS public.contas_pagar_contaazul_espelho (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id              UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  conta_azul_id           TEXT NOT NULL,
  fornecedor_id           TEXT,
  fornecedor_nome         TEXT NOT NULL,
  fornecedor_cnpj_cpf     TEXT,
  valor                   NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  data_vencimento         DATE NOT NULL,
  data_competencia        DATE,
  data_pagamento          DATE,
  status                  TEXT NOT NULL DEFAULT 'PENDENTE',
  numero_documento        TEXT,
  descricao               TEXT,
  categoria_id            TEXT,
  categoria_nome          TEXT,
  centro_custo_nome       TEXT,
  raw_data                JSONB,
  sincronizado_em         TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unq_cp_ca_empresa_conta_azul_id UNIQUE (empresa_id, conta_azul_id)
);

-- Índices de alta performance para auditoria e filtros
CREATE INDEX IF NOT EXISTS idx_cp_ca_espelho_empresa_venc 
  ON public.contas_pagar_contaazul_espelho (empresa_id, data_vencimento);

CREATE INDEX IF NOT EXISTS idx_cp_ca_espelho_forn 
  ON public.contas_pagar_contaazul_espelho (empresa_id, fornecedor_nome);

CREATE INDEX IF NOT EXISTS idx_cp_ca_espelho_cat 
  ON public.contas_pagar_contaazul_espelho (empresa_id, categoria_nome);
