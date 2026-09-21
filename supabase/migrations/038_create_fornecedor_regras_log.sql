-- ============================================================
-- TABELA: fornecedor_regras_log
-- Histórico e rastreabilidade de ações de governança contábil
-- ============================================================

CREATE TABLE IF NOT EXISTS public.fornecedor_regras_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  regra_id         UUID REFERENCES public.fornecedor_regras(id) ON DELETE SET NULL,
  fornecedor_nome  TEXT NOT NULL,
  acao             TEXT NOT NULL, -- 'CRIACAO', 'HOMOLOGACAO_MASSA', 'EDICAO', 'ATIVACAO', 'DESATIVACAO', 'EXCLUSAO'
  categoria_antiga TEXT,
  categoria_nova   TEXT NOT NULL,
  usuario_email    TEXT,
  detalhes         TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para busca ágil de logs
CREATE INDEX IF NOT EXISTS idx_fornecedor_regras_log_empresa
  ON public.fornecedor_regras_log (empresa_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fornecedor_regras_log_fornecedor
  ON public.fornecedor_regras_log (empresa_id, fornecedor_nome);
