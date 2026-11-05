-- ============================================================
-- DCX LINK — MIGRATION 051: Lock Atômico e Idempotência Persistente
-- Módulo: Contas a Receber (Etapa 1F-B)
-- ============================================================
-- OBJETIVO:
-- 1. Criar índice único parcial em `public.logs_integracao` para garantir
--    exclusividade atômica por `(empresa_id, acao, detalhes->>'chave_idempotencia')`
--    nos registros de lock de lote (`contas_receber_1fb_lock_lote`) e nos registros
--    definitivos de cada item (`contas_receber_1fb_lancamento`), impedindo que duas
--    instâncias concorrentes da Vercel processem ou dupliquem o mesmo lançamento.
-- 2. Criar índice de performance em `(empresa_id, acao, (detalhes->>'chave_idempotencia'))`
--    para consultas rápidas de idempotência sem risco de truncamento em 1.000 linhas.
-- ============================================================

-- 1. Índice de busca rápida por chave_idempotencia no JSONB de logs_integracao
CREATE INDEX IF NOT EXISTS idx_logs_integracao_receber_1fb_chave
  ON public.logs_integracao (
    empresa_id,
    acao,
    ((detalhes ->> 'chave_idempotencia'))
  )
  WHERE acao IN ('contas_receber_1fb_lancamento', 'contas_receber_1fb_lock_lote');

-- 2. Índice UNIQUE parcial para o Lock Atômico de Lote (impede 2 requisições simultâneas no mesmo lote)
CREATE UNIQUE INDEX IF NOT EXISTS uq_logs_integracao_receber_1fb_lock_ativo
  ON public.logs_integracao (
    empresa_id,
    acao,
    ((detalhes ->> 'chave_lote'))
  )
  WHERE acao = 'contas_receber_1fb_lock_lote'
    AND status = 'info';

-- 3. Índice UNIQUE parcial para Itens Definitivos (BAIXADO_COMPLETO ou RECONCILIACAO_NECESSARIA)
-- Impede duplicidade de gravação definitiva para a mesma empresa e chave_idempotencia
CREATE UNIQUE INDEX IF NOT EXISTS uq_logs_integracao_receber_1fb_item_definitivo
  ON public.logs_integracao (
    empresa_id,
    acao,
    ((detalhes ->> 'chave_idempotencia'))
  )
  WHERE acao = 'contas_receber_1fb_lancamento'
    AND ((detalhes ->> 'status_operacao') IN ('BAIXADO_COMPLETO', 'RECONCILIACAO_NECESSARIA'));
