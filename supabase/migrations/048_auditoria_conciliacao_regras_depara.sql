-- ============================================================
-- CONNECTA AI — MIGRAÇÃO SATÉLITE: 048
-- MÓDULO: Auditoria Inteligente de Conciliação Bancária (Fase 3)
-- FINALIDADE:
--   Tabela de persistência e aprendizagem contínua de De/Para:
--   - Fornecedor do extrato X = Fornecedor Conta Azul Y
--   - Categoria do extrato X = Categoria Conta Azul Y
--   - Centro de Custo do extrato X = Centro de Custo Conta Azul Y
--   - RLS multi-tenant segregado por empresa
-- ============================================================

CREATE TABLE IF NOT EXISTS public.auditoria_conciliacao_regras (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id                UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  tipo_regra                TEXT NOT NULL CHECK (tipo_regra IN ('FORNECEDOR', 'CATEGORIA', 'CENTRO_CUSTO')),
  termo_extrato             TEXT NOT NULL,
  termo_extrato_normalizado TEXT NOT NULL,
  valor_erp                 TEXT NOT NULL,
  conta_azul_id             TEXT,
  ativo                     BOOLEAN NOT NULL DEFAULT true,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

-- Índice único por empresa, tipo de regra e termo normalizado
CREATE UNIQUE INDEX IF NOT EXISTS idx_regras_conc_empresa_tipo_termo 
  ON public.auditoria_conciliacao_regras(empresa_id, tipo_regra, termo_extrato_normalizado);

-- Índice composto para consultas do motor de matching
CREATE INDEX IF NOT EXISTS idx_regras_conc_busca 
  ON public.auditoria_conciliacao_regras(empresa_id, tipo_regra, ativo);

-- RLS: Usuários só visualizam e gerenciam regras das suas empresas vinculadas
ALTER TABLE public.auditoria_conciliacao_regras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usuarios_gerenciam_regras_conciliacao" ON public.auditoria_conciliacao_regras;
CREATE POLICY "usuarios_gerenciam_regras_conciliacao" ON public.auditoria_conciliacao_regras
  FOR ALL USING (
    empresa_id IN (
      SELECT empresa_id FROM public.usuarios_empresas
      WHERE user_id = auth.uid()
    )
  );
