-- ============================================================
-- Migration 034: Conta Azul Vendas (Tokens separados para Vendas / Emissão NFe)
-- ============================================================

ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS access_token_conta_azul_vendas TEXT;
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS refresh_token_conta_azul_vendas TEXT;
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS data_expiracao_token_vendas TIMESTAMPTZ;
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS conta_azul_vendas_connected BOOLEAN DEFAULT FALSE;
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS email_login_vendas TEXT;

COMMENT ON COLUMN public.empresas.access_token_conta_azul_vendas IS 'Access token específico para o Conta Azul Vendas / NFe';
COMMENT ON COLUMN public.empresas.email_login_vendas IS 'E-mail de login usado no Conta Azul Vendas para esta empresa';
