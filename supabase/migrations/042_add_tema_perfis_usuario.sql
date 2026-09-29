-- ============================================================
-- Migration 042: Adicionar suporte a tema tri-modal (light, dark, system)
-- ============================================================

ALTER TABLE public.perfis_usuario
ADD COLUMN IF NOT EXISTS tema text
DEFAULT 'system'
CHECK (tema IN ('light', 'dark', 'system'));

COMMENT ON COLUMN public.perfis_usuario.tema IS 'Preferência visual do usuário: light, dark ou system (sincronizado com SO)';
