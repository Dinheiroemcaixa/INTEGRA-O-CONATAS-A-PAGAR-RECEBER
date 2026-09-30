-- ============================================================
-- CONNECTA AI — MIGRAÇÃO SATÉLITE: 045
-- MÓDULO: Auditoria Inteligente de Conciliação Bancária
-- FINALIDADE:
--   Criar tabela satélite auditoria_conciliacao_cache_ca para cache
--   resiliente das consultas à API Conta Azul v2 (somente leitura).
--   Protege contra limites de taxa (Rate Limit 429 / Spike Arrest)
--   e acelera reanálises e reclassificações sem latência de rede externa.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.auditoria_conciliacao_cache_ca (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id              UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  conta_financeira_id     TEXT NOT NULL,
  periodo_inicio          DATE NOT NULL,
  periodo_fim             DATE NOT NULL,
  tipo_registro           TEXT NOT NULL CHECK (tipo_registro IN ('CONTAS_PAGAR', 'CONTAS_RECEBER', 'TRANSFERENCIAS', 'PARCELA_DETALHE')),
  chave_registro          TEXT NOT NULL, -- UUID da parcela ou hash do filtro de consulta
  dados_json              JSONB NOT NULL,
  sincronizado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expira_em               TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  
  CONSTRAINT uq_audit_ca_cache_unique UNIQUE (empresa_id, conta_financeira_id, tipo_registro, chave_registro)
);

-- Índices de Alta Performance
CREATE INDEX IF NOT EXISTS idx_audit_conc_cache_lookup 
  ON public.auditoria_conciliacao_cache_ca (empresa_id, conta_financeira_id, tipo_registro, expira_em);

CREATE INDEX IF NOT EXISTS idx_audit_conc_cache_chave 
  ON public.auditoria_conciliacao_cache_ca (empresa_id, chave_registro);

-- ============================================================
-- POLÍTICAS RLS MULTI-TENANT ESTRITAS
-- ============================================================
ALTER TABLE public.auditoria_conciliacao_cache_ca ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cache_conciliacao_select" ON public.auditoria_conciliacao_cache_ca;
CREATE POLICY "cache_conciliacao_select" ON public.auditoria_conciliacao_cache_ca
  FOR SELECT TO authenticated, service_role
  USING (
    auth.role() = 'service_role' OR
    empresa_id IN (
      SELECT ue.empresa_id FROM public.usuarios_empresas ue WHERE ue.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "cache_conciliacao_insert" ON public.auditoria_conciliacao_cache_ca;
CREATE POLICY "cache_conciliacao_insert" ON public.auditoria_conciliacao_cache_ca
  FOR INSERT TO authenticated, service_role
  WITH CHECK (
    auth.role() = 'service_role' OR
    empresa_id IN (
      SELECT ue.empresa_id FROM public.usuarios_empresas ue WHERE ue.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "cache_conciliacao_update" ON public.auditoria_conciliacao_cache_ca;
CREATE POLICY "cache_conciliacao_update" ON public.auditoria_conciliacao_cache_ca
  FOR UPDATE TO authenticated, service_role
  USING (
    auth.role() = 'service_role' OR
    empresa_id IN (
      SELECT ue.empresa_id FROM public.usuarios_empresas ue WHERE ue.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.role() = 'service_role' OR
    empresa_id IN (
      SELECT ue.empresa_id FROM public.usuarios_empresas ue WHERE ue.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "cache_conciliacao_delete" ON public.auditoria_conciliacao_cache_ca;
CREATE POLICY "cache_conciliacao_delete" ON public.auditoria_conciliacao_cache_ca
  FOR DELETE TO authenticated, service_role
  USING (
    auth.role() = 'service_role' OR
    empresa_id IN (
      SELECT ue.empresa_id FROM public.usuarios_empresas ue WHERE ue.user_id = auth.uid()
    )
  );
