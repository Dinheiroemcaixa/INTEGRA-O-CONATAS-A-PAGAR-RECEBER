-- ============================================================
-- CONNECTA AI — MIGRAÇÃO SATÉLITE: 044
-- MÓDULO: Auditoria Inteligente de Conciliação Bancária
-- FINALIDADE:
--   1. Adicionar colunas de rastreabilidade do arquivo importado (storage_path, hash, tamanho)
--   2. Expandir ciclo de vida da auditoria para incluir status 'EM_ANALISE'
--   3. Implementar políticas RLS multi-tenant estritas (usuarios_empresas + service_role, sem anon)
-- ============================================================

-- 1. Expansão de colunas em auditoria_conciliacao_sessoes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'auditoria_conciliacao_sessoes' 
      AND column_name = 'arquivo_hash'
  ) THEN
    ALTER TABLE public.auditoria_conciliacao_sessoes 
      ADD COLUMN arquivo_hash TEXT NOT NULL DEFAULT 'LEGACY_HASH';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'auditoria_conciliacao_sessoes' 
      AND column_name = 'arquivo_storage_path'
  ) THEN
    ALTER TABLE public.auditoria_conciliacao_sessoes 
      ADD COLUMN arquivo_storage_path TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'auditoria_conciliacao_sessoes' 
      AND column_name = 'arquivo_tamanho'
  ) THEN
    ALTER TABLE public.auditoria_conciliacao_sessoes 
      ADD COLUMN arquivo_tamanho INT;
  END IF;
END $$;

-- 2. Atualização da constraint de status_auditoria para incluir 'EM_ANALISE'
DO $$
BEGIN
  -- Remove constraint antiga se existir
  ALTER TABLE public.auditoria_conciliacao_sessoes 
    DROP CONSTRAINT IF EXISTS auditoria_conciliacao_sessoes_status_auditoria_check;

  -- Adiciona nova constraint com 'EM_ANALISE'
  ALTER TABLE public.auditoria_conciliacao_sessoes 
    ADD CONSTRAINT auditoria_conciliacao_sessoes_status_auditoria_check 
    CHECK (status_auditoria IN ('ABERTA', 'EM_ANALISE', 'FINALIZADA', 'REABERTA'));
END $$;

-- 3. Índice para busca e integridade por arquivo_hash
CREATE INDEX IF NOT EXISTS idx_audit_conc_sessoes_hash 
  ON public.auditoria_conciliacao_sessoes (empresa_id, arquivo_hash);

-- ============================================================
-- 4. POLÍTICAS RLS MULTI-TENANT ESTRITAS (Connecta AI Standard)
-- Isolamento por empresa vinculada em public.usuarios_empresas
-- Acesso irrestrito apenas para o backend service_role do Next.js
-- Bloqueio total de inserção/mutação não autorizada
-- ============================================================

-- ─── A. auditoria_conciliacao_sessoes ────────────────────────
DROP POLICY IF EXISTS "sessoes_conciliacao_select" ON public.auditoria_conciliacao_sessoes;
CREATE POLICY "sessoes_conciliacao_select" ON public.auditoria_conciliacao_sessoes
  FOR SELECT TO authenticated, service_role
  USING (
    auth.role() = 'service_role' OR
    empresa_id IN (
      SELECT ue.empresa_id FROM public.usuarios_empresas ue WHERE ue.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "sessoes_conciliacao_insert" ON public.auditoria_conciliacao_sessoes;
CREATE POLICY "sessoes_conciliacao_insert" ON public.auditoria_conciliacao_sessoes
  FOR INSERT TO authenticated, service_role
  WITH CHECK (
    auth.role() = 'service_role' OR
    empresa_id IN (
      SELECT ue.empresa_id FROM public.usuarios_empresas ue WHERE ue.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "sessoes_conciliacao_update" ON public.auditoria_conciliacao_sessoes;
CREATE POLICY "sessoes_conciliacao_update" ON public.auditoria_conciliacao_sessoes
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

DROP POLICY IF EXISTS "sessoes_conciliacao_delete" ON public.auditoria_conciliacao_sessoes;
CREATE POLICY "sessoes_conciliacao_delete" ON public.auditoria_conciliacao_sessoes
  FOR DELETE TO authenticated, service_role
  USING (
    auth.role() = 'service_role' OR
    empresa_id IN (
      SELECT ue.empresa_id FROM public.usuarios_empresas ue WHERE ue.user_id = auth.uid()
    )
  );

-- ─── B. auditoria_conciliacao_itens ──────────────────────────
DROP POLICY IF EXISTS "itens_conciliacao_select" ON public.auditoria_conciliacao_itens;
CREATE POLICY "itens_conciliacao_select" ON public.auditoria_conciliacao_itens
  FOR SELECT TO authenticated, service_role
  USING (
    auth.role() = 'service_role' OR
    empresa_id IN (
      SELECT ue.empresa_id FROM public.usuarios_empresas ue WHERE ue.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "itens_conciliacao_insert" ON public.auditoria_conciliacao_itens;
CREATE POLICY "itens_conciliacao_insert" ON public.auditoria_conciliacao_itens
  FOR INSERT TO authenticated, service_role
  WITH CHECK (
    auth.role() = 'service_role' OR
    empresa_id IN (
      SELECT ue.empresa_id FROM public.usuarios_empresas ue WHERE ue.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "itens_conciliacao_update" ON public.auditoria_conciliacao_itens;
CREATE POLICY "itens_conciliacao_update" ON public.auditoria_conciliacao_itens
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

DROP POLICY IF EXISTS "itens_conciliacao_delete" ON public.auditoria_conciliacao_itens;
CREATE POLICY "itens_conciliacao_delete" ON public.auditoria_conciliacao_itens
  FOR DELETE TO authenticated, service_role
  USING (
    auth.role() = 'service_role' OR
    empresa_id IN (
      SELECT ue.empresa_id FROM public.usuarios_empresas ue WHERE ue.user_id = auth.uid()
    )
  );
