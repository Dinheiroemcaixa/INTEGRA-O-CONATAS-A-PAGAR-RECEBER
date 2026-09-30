-- ============================================================
-- CONNECTA AI — MIGRAÇÃO SATÉLITE: 046
-- MÓDULO: Auditoria Inteligente de Conciliação Bancária
-- FINALIDADE:
--   1. Criar tabela unificada de feature_flags persistida em banco.
--   2. Implementar Kill Switch 'AUDITORIA_CONCILIACAO_ENABLED' para desativação imediata sem deploy.
--   3. Configurar RLS seguro (leitura para usuários autenticados, mutação via service_role/admin).
-- ============================================================

-- 1. Criação da tabela feature_flags (se não existir)
CREATE TABLE IF NOT EXISTS public.feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chave TEXT UNIQUE NOT NULL,
  habilitado BOOLEAN NOT NULL DEFAULT true,
  descricao TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Registro do Kill Switch da Auditoria
INSERT INTO public.feature_flags (chave, habilitado, descricao)
VALUES (
  'AUDITORIA_CONCILIACAO_ENABLED',
  true,
  'Kill switch operacional para o módulo de Auditoria Inteligente de Conciliação Bancária. Quando falso, suspende imediatamente execuções de auditoria sem necessidade de deploy.'
)
ON CONFLICT (chave) DO UPDATE
SET descricao = EXCLUDED.descricao,
    atualizado_em = now();

-- 3. Índices para consulta ultra-rápida por chave
CREATE INDEX IF NOT EXISTS idx_feature_flags_chave 
  ON public.feature_flags (chave);

-- 4. Habilitação de RLS
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

-- 5. Políticas RLS
DROP POLICY IF EXISTS "feature_flags_select_autenticados" ON public.feature_flags;
CREATE POLICY "feature_flags_select_autenticados"
  ON public.feature_flags
  FOR SELECT
  TO authenticated, anon, service_role
  USING (true);

DROP POLICY IF EXISTS "feature_flags_modificacao_service_role" ON public.feature_flags;
CREATE POLICY "feature_flags_modificacao_service_role"
  ON public.feature_flags
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
