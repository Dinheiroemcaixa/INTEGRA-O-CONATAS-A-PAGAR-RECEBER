-- ============================================================
-- Migration 023: Adiciona constraints e campos necessários
-- para salvar e preservar categorias de fornecedores
-- ============================================================

-- 1. Adicionar campo categoria_padrao se ainda não existir
ALTER TABLE public.fornecedores_contaazul
  ADD COLUMN IF NOT EXISTS categoria_padrao TEXT;

-- 2. Adicionar índice ÚNICO em (empresa_id, nome_normalizado)
--    necessário para o UPSERT funcionar corretamente e não duplicar registros
CREATE UNIQUE INDEX IF NOT EXISTS idx_fornecedores_empresa_nome
  ON public.fornecedores_contaazul(empresa_id, nome_normalizado);
