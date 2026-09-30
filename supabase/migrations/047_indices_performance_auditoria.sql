-- ============================================================
-- CONNECTA AI — MIGRAÇÃO SATÉLITE: 047
-- MÓDULO: Auditoria Inteligente de Conciliação Bancária
-- FINALIDADE:
--   Índices compostos de alta performance para suportar
--   as rotas de API e consultas do Dashboard Dark Fintech (Fase 4):
--   - Paginação e ordenação por Score de Confiança
--   - Filtros por Status de Auditoria e Cronologia
--   - Filtros do Fluxo de Governança (Pendentes, Justificadas, Validadas)
--   - Purge otimizado de cache expirado
-- ============================================================

-- 1. Índice para ordenação rápida por Score de Confiança (Filtro por Risco)
CREATE INDEX IF NOT EXISTS idx_audit_conc_itens_score 
  ON public.auditoria_conciliacao_itens (sessao_id, score_confianca ASC);

-- 2. Índice composto para filtro por Status de Auditoria + Cronologia
CREATE INDEX IF NOT EXISTS idx_audit_conc_itens_status_data 
  ON public.auditoria_conciliacao_itens (sessao_id, status_auditoria, data_transacao ASC);

-- 3. Índice para filtros do fluxo de Governança
CREATE INDEX IF NOT EXISTS idx_audit_conc_itens_governanca 
  ON public.auditoria_conciliacao_itens (sessao_id, status_governanca);

-- 4. Índice para deleção/limpeza periódica de cache expirado (Purge Job)
CREATE INDEX IF NOT EXISTS idx_audit_ca_cache_expira 
  ON public.auditoria_conciliacao_cache_ca (expira_em);
