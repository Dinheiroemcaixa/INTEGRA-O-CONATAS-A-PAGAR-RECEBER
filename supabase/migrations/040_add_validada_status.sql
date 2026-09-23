-- ============================================================
-- MIGRATION: 040_add_validada_status.sql
-- Atualiza a constraint de status_divergencia para incluir 'VALIDADA'
-- Adiciona a coluna validado_em para auditoria e compliance
-- ============================================================

DO $$
BEGIN
  -- 1. Atualiza a constraint de status_divergencia
  ALTER TABLE public.auditoria_divergencias_status 
    DROP CONSTRAINT IF EXISTS auditoria_divergencias_status_status_divergencia_check;

  ALTER TABLE public.auditoria_divergencias_status 
    ADD CONSTRAINT auditoria_divergencias_status_status_divergencia_check 
    CHECK (status_divergencia IN ('PENDENTE', 'JUSTIFICADA', 'CORRIGIDA', 'VALIDADA'));

  -- 2. Adiciona coluna validado_em se ainda não existir
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'auditoria_divergencias_status' 
      AND column_name = 'validado_em'
  ) THEN
    ALTER TABLE public.auditoria_divergencias_status 
      ADD COLUMN validado_em TIMESTAMPTZ;
  END IF;
END $$;
