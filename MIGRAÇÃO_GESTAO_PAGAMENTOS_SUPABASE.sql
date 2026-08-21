-- ============================================================
-- MIGRAÇÃO DE CONSOLIDAÇÃO DA GESTÃO DE PAGAMENTOS (BPO)
-- Cole este script no SQL Editor do Supabase Ativo (rowxsmseenutpcxeyssj) e clique em RUN
-- ============================================================

-- 1. TABELA DE GRUPOS DE EMPRESAS
CREATE TABLE IF NOT EXISTS public.grupos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. ADICIONAR COLUNAS DE GESTÃO DE PAGAMENTOS NA TABELA EMPRESAS
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS grupo_id UUID REFERENCES public.grupos(id) ON DELETE SET NULL;
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS saldo_caixa NUMERIC(15, 2) DEFAULT 0.00;
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS grupo_adicionado_em TIMESTAMPTZ;
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS ordem_no_grupo INTEGER DEFAULT 0;

-- 3. ADICIONAR E ADEQUAR CAMPOS NA TABELA AGENDAMENTOS
ALTER TABLE public.agendamentos DROP CONSTRAINT IF EXISTS agendamentos_tipo_check;
ALTER TABLE public.agendamentos DROP CONSTRAINT IF EXISTS agendamentos_empresa_id_tipo_key;

ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS fornecedor TEXT;
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS valor NUMERIC(15, 2) DEFAULT 0;
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS data_vencimento DATE;
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'aberto';
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS descricao TEXT;
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS chave_pix TEXT;
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS cpf_cnpj TEXT;
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS categoria TEXT;
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS conta_pagamento TEXT;
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS anexo_url TEXT;
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS competencia TEXT;
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS transferencia_id TEXT;
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS data_pagamento DATE;
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS codigo_barras TEXT;
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS data_lancamento TIMESTAMPTZ DEFAULT now();

-- 4. TABELA DE DDA (Débito Direto Autorizado)
CREATE TABLE IF NOT EXISTS public.pagamentos_dda (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    beneficiario TEXT NOT NULL,
    documento TEXT NOT NULL,
    valor NUMERIC(15, 2) NOT NULL DEFAULT 0,
    data_vencimento DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'aberto',
    categoria TEXT,
    descricao TEXT,
    competencia TEXT,
    conta_pagamento TEXT,
    data_pagamento DATE,
    codigo_barras TEXT,
    data_lancamento TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. ÍNDICES DE PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_empresas_grupo_id ON public.empresas(grupo_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_empresa_id ON public.agendamentos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_data_vencimento ON public.agendamentos(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_pagamentos_dda_empresa_id ON public.pagamentos_dda(empresa_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_dda_data_vencimento ON public.pagamentos_dda(data_vencimento);

-- 6. DESABILITAR RESTRIÇÃO RLS (PADRÃO DO PROJETO COM NEXT.JS)
ALTER TABLE public.grupos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagamentos_dda ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access grupos" ON public.grupos;
CREATE POLICY "Allow all access grupos" ON public.grupos FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access agendamentos" ON public.agendamentos;
CREATE POLICY "Allow all access agendamentos" ON public.agendamentos FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access pagamentos_dda" ON public.pagamentos_dda;
CREATE POLICY "Allow all access pagamentos_dda" ON public.pagamentos_dda FOR ALL USING (true) WITH CHECK (true);

-- 7. COLUNAS PARA CONTA AZUL VENDAS (TOKENS SEPARADOS DE VENDAS E EMISSÃO DE NFE)
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS access_token_conta_azul_vendas TEXT;
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS refresh_token_conta_azul_vendas TEXT;
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS data_expiracao_token_vendas TIMESTAMPTZ;
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS conta_azul_vendas_connected BOOLEAN DEFAULT FALSE;
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS email_login_vendas TEXT;

-- ============================================================
-- CONCLUÍDO!
-- ============================================================
