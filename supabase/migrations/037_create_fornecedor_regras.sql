-- ============================================================
-- TABELA: fornecedor_regras
-- Armazena a memória contábil validada pelo usuário (Governança)
-- Prioriza fornecedor_id_conta_azul como chave principal
-- ============================================================

CREATE TABLE IF NOT EXISTS public.fornecedor_regras (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id                UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  fornecedor_id_conta_azul  TEXT,
  fornecedor_nome           TEXT NOT NULL,
  categoria_nome            TEXT NOT NULL,
  tipo_regra                TEXT NOT NULL CHECK (tipo_regra IN ('PADRAO', 'DIA_DO_MES', 'MES_DO_ANO', 'FAIXA_VALOR')),
  valor_regra               TEXT,
  prioridade                INT NOT NULL DEFAULT 10,
  ativo                     BOOLEAN NOT NULL DEFAULT true,
  observacao                TEXT,
  criado_por                TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices de alta performance
CREATE INDEX IF NOT EXISTS idx_fornecedor_regras_empresa_ca_id
  ON public.fornecedor_regras (empresa_id, fornecedor_id_conta_azul)
  WHERE ativo = true;

CREATE INDEX IF NOT EXISTS idx_fornecedor_regras_empresa_nome
  ON public.fornecedor_regras (empresa_id, fornecedor_nome)
  WHERE ativo = true;

CREATE INDEX IF NOT EXISTS idx_fornecedor_regras_lookup
  ON public.fornecedor_regras (empresa_id, ativo, prioridade DESC);
