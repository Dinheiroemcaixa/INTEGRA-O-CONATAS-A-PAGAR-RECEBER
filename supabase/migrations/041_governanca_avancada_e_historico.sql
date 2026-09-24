-- ============================================================
-- MIGRATION: 041_governanca_avancada_e_historico.sql
-- 1. Segregação de papéis na tabela auditoria_divergencias_status
-- 2. Criação da tabela imutável auditoria_divergencias_historico
-- 3. Trigger para registro automático de histórico a cada inserção/atualização
-- 4. RLS seguro (gravação restrita a authenticated e service_role, sem anon)
-- ============================================================

DO $$
BEGIN
  -- 1. Expansão de colunas de autoria em auditoria_divergencias_status
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'auditoria_divergencias_status' 
      AND column_name = 'justificado_por_email'
  ) THEN
    ALTER TABLE public.auditoria_divergencias_status 
      ADD COLUMN justificado_por_email TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'auditoria_divergencias_status' 
      AND column_name = 'justificado_em'
  ) THEN
    ALTER TABLE public.auditoria_divergencias_status 
      ADD COLUMN justificado_em TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'auditoria_divergencias_status' 
      AND column_name = 'validado_por_email'
  ) THEN
    ALTER TABLE public.auditoria_divergencias_status 
      ADD COLUMN validado_por_email TEXT;
  END IF;
END $$;

-- Migração de dados legados
UPDATE public.auditoria_divergencias_status
SET 
  justificado_por_email = COALESCE(justificado_por_email, usuario_email),
  justificado_em = COALESCE(justificado_em, atualizado_em)
WHERE status_divergencia IN ('JUSTIFICADA', 'CORRIGIDA') AND justificado_por_email IS NULL;

UPDATE public.auditoria_divergencias_status
SET 
  validado_por_email = COALESCE(validado_por_email, usuario_email)
WHERE status_divergencia = 'VALIDADA' AND validado_por_email IS NULL;

-- 2. Tabela de Trilha de Auditoria Imutável (Append-Only)
CREATE TABLE IF NOT EXISTS public.auditoria_divergencias_historico (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  conta_azul_id         TEXT NOT NULL,
  status_anterior       TEXT,
  status_novo           TEXT NOT NULL,
  categoria_original    TEXT NOT NULL,
  categoria_sugerida    TEXT,
  motivo_justificativa  TEXT,
  usuario_email         TEXT NOT NULL,
  acao                  TEXT NOT NULL,
  criado_em             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices de consulta de histórico
CREATE INDEX IF NOT EXISTS idx_divergencias_hist_busca
  ON public.auditoria_divergencias_historico (empresa_id, conta_azul_id, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_divergencias_hist_usuario
  ON public.auditoria_divergencias_historico (empresa_id, usuario_email);

-- 3. Trigger para gravação automática de histórico
CREATE OR REPLACE FUNCTION public.fn_registrar_historico_divergencia()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.auditoria_divergencias_historico (
    empresa_id,
    conta_azul_id,
    status_anterior,
    status_novo,
    categoria_original,
    categoria_sugerida,
    motivo_justificativa,
    usuario_email,
    acao
  ) VALUES (
    NEW.empresa_id,
    NEW.conta_azul_id,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.status_divergencia ELSE NULL END,
    NEW.status_divergencia,
    NEW.categoria_original,
    NEW.categoria_sugerida,
    NEW.motivo_justificativa,
    COALESCE(
      CASE 
        WHEN NEW.status_divergencia = 'VALIDADA' THEN NEW.validado_por_email 
        ELSE NEW.justificado_por_email 
      END,
      NEW.usuario_email,
      'auditor@connecta.ai'
    ),
    CASE 
      WHEN NEW.status_divergencia = 'VALIDADA' THEN 'VALIDAR'
      WHEN NEW.status_divergencia = 'JUSTIFICADA' THEN 'JUSTIFICAR'
      WHEN NEW.status_divergencia = 'CORRIGIDA' THEN 'CORRIGIR'
      WHEN NEW.status_divergencia = 'PENDENTE' THEN 'REABRIR'
      ELSE 'ALTERAR_STATUS'
    END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_registrar_historico_divergencia ON public.auditoria_divergencias_status;
CREATE TRIGGER trg_registrar_historico_divergencia
  AFTER INSERT OR UPDATE ON public.auditoria_divergencias_status
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_registrar_historico_divergencia();

-- 4. RLS Seguro (Sem gravação para anon)
ALTER TABLE public.auditoria_divergencias_historico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir leitura auditoria_divergencias_historico" ON public.auditoria_divergencias_historico;
CREATE POLICY "Permitir leitura auditoria_divergencias_historico"
  ON public.auditoria_divergencias_historico FOR SELECT
  TO authenticated, service_role, anon USING (true);

DROP POLICY IF EXISTS "Permitir gravacao auditoria_divergencias_historico" ON public.auditoria_divergencias_historico;
CREATE POLICY "Permitir gravacao auditoria_divergencias_historico"
  ON public.auditoria_divergencias_historico FOR INSERT
  TO authenticated, service_role WITH CHECK (true);

-- Atualização das políticas de auditoria_divergencias_status para remover gravação direta por anon
DROP POLICY IF EXISTS "Permitir gravacao auditoria_divergencias_status" ON public.auditoria_divergencias_status;
CREATE POLICY "Permitir gravacao auditoria_divergencias_status"
  ON public.auditoria_divergencias_status FOR ALL
  TO authenticated, service_role
  USING (true)
  WITH CHECK (true);
