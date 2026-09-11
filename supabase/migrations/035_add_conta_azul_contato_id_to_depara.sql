-- ============================================================
-- Migration 035: Adicionar conta_azul_contato_id à tabela fornecedor_depara
-- Permite armazenar o ID externo do contato retornado pela API Conta Azul v2,
-- eliminando requisições repetitivas de busca de fornecedor em lotes.
-- ============================================================

-- 1. Adiciona coluna anulável (O(1) no Postgres, sem lock de tabela e sem reescrever linhas)
ALTER TABLE public.fornecedor_depara 
  ADD COLUMN IF NOT EXISTS conta_azul_contato_id TEXT;

-- 2. Índice composto otimizado com filtro parcial para acelerar buscas por tenant
CREATE INDEX IF NOT EXISTS idx_depara_conta_azul_contato_id 
  ON public.fornecedor_depara(empresa_id, conta_azul_contato_id)
  WHERE conta_azul_contato_id IS NOT NULL;

-- Comentário de documentação de schema no Postgres
COMMENT ON COLUMN public.fornecedor_depara.conta_azul_contato_id IS 
  'Identificador UUID do contato/fornecedor retornado pela API v2 do Conta Azul';

-- ============================================================
-- ROLLBACK SCRIPT (Para referência DevOps caso necessário):
-- DROP INDEX IF EXISTS public.idx_depara_conta_azul_contato_id;
-- ALTER TABLE public.fornecedor_depara DROP COLUMN IF EXISTS conta_azul_contato_id;
-- ============================================================
