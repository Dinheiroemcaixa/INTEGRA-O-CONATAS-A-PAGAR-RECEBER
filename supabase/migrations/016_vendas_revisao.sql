-- Migration 016: Tabela de Revisão de Vendas (Fluxo Intermediário)
-- As OS/Pedidos do Datacar são salvas aqui para revisão antes de ir ao Conta Azul.

CREATE TABLE IF NOT EXISTS vendas_revisao (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id       UUID REFERENCES empresas(id) ON DELETE CASCADE,
  os_numero        TEXT,
  cliente          TEXT NOT NULL,
  cliente_cpf_cnpj TEXT,          -- CPF ou CNPJ vindo do Datacar
  valor_total      NUMERIC(15,2) NOT NULL,
  data_venda       DATE,
  forma_pagamento  TEXT,
  itens            JSONB DEFAULT '[]',
  erros            JSONB DEFAULT '[]',
  vendedor         TEXT,
  veiculo          TEXT,
  -- Status do fluxo:
  -- 'pendente'  → salvo para revisão, ainda não enviado ao CA
  -- 'aprovado'  → usuário revisou e aprovou
  -- 'enviado'   → enviado e aceito pelo Conta Azul com sucesso
  -- 'erro'      → tentativa de envio falhou
  -- 'ignorado'  → usuário decidiu não enviar esta OS
  status           TEXT NOT NULL DEFAULT 'pendente',
  conta_azul_id    TEXT,
  erro_envio       TEXT,
  datacar_raw      JSONB,          -- Guarda os dados brutos do Datacar para auditoria
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para consultas frequentes
CREATE INDEX IF NOT EXISTS idx_vendas_revisao_empresa_id ON vendas_revisao(empresa_id);
CREATE INDEX IF NOT EXISTS idx_vendas_revisao_status     ON vendas_revisao(status);
CREATE INDEX IF NOT EXISTS idx_vendas_revisao_os_numero  ON vendas_revisao(os_numero);

-- Evitar duplicatas: mesma empresa + mesma OS não pode estar pendente duas vezes
CREATE UNIQUE INDEX IF NOT EXISTS idx_vendas_revisao_empresa_os_pendente
  ON vendas_revisao(empresa_id, os_numero)
  WHERE status IN ('pendente', 'aprovado');

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vendas_revisao_updated_at ON vendas_revisao;
CREATE TRIGGER trg_vendas_revisao_updated_at
  BEFORE UPDATE ON vendas_revisao
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS: cada empresa só vê suas próprias vendas em revisão
ALTER TABLE vendas_revisao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vendas_revisao: empresa acessa os proprios dados"
  ON vendas_revisao
  USING (
    empresa_id IN (
      SELECT id FROM empresas
      WHERE auth.uid() = user_id OR auth.role() = 'service_role'
    )
  );
