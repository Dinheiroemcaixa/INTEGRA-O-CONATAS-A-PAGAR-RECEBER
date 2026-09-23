-- ============================================================
-- TABELA: auditoria_divergencias_status
-- Armazena o status de governanca e justificativa de divergencias
-- Modelagem satelite isolada - Nao altera contas_pagar_contaazul_espelho
-- ============================================================

CREATE TABLE IF NOT EXISTS public.auditoria_divergencias_status (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  conta_azul_id         TEXT NOT NULL,
  fornecedor_nome       TEXT NOT NULL,
  categoria_original    TEXT NOT NULL,
  categoria_sugerida    TEXT,
  status_divergencia    TEXT NOT NULL DEFAULT 'PENDENTE'
                        CHECK (status_divergencia IN ('PENDENTE', 'JUSTIFICADA', 'CORRIGIDA')),
  motivo_justificativa  TEXT,
  usuario_email         TEXT,
  criado_em             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_divergencia_empresa_conta UNIQUE (empresa_id, conta_azul_id)
);

CREATE INDEX IF NOT EXISTS idx_divergencias_status_busca
  ON public.auditoria_divergencias_status (empresa_id, conta_azul_id);

CREATE INDEX IF NOT EXISTS idx_divergencias_status_filtro
  ON public.auditoria_divergencias_status (empresa_id, status_divergencia);

ALTER TABLE public.auditoria_divergencias_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir leitura auditoria_divergencias_status" ON public.auditoria_divergencias_status;
CREATE POLICY "Permitir leitura auditoria_divergencias_status"
  ON public.auditoria_divergencias_status
  FOR SELECT
  TO authenticated, service_role, anon
  USING (true);

DROP POLICY IF EXISTS "Permitir gravacao auditoria_divergencias_status" ON public.auditoria_divergencias_status;
CREATE POLICY "Permitir gravacao auditoria_divergencias_status"
  ON public.auditoria_divergencias_status
  FOR ALL
  TO authenticated, service_role, anon
  USING (true)
  WITH CHECK (true);
