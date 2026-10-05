-- ============================================================
-- Migration 049: Central Mestre, Permissões por Card e Aprovação de Usuários
-- ============================================================

-- 1. Estender public.perfis_usuario com campos de governança e controle de acesso
ALTER TABLE public.perfis_usuario
ADD COLUMN IF NOT EXISTS email text,
ADD COLUMN IF NOT EXISTS is_master boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'PENDENTE',
ADD COLUMN IF NOT EXISTS permissoes jsonb NOT NULL DEFAULT '{"dashboard":true,"gestao_pagamentos":true,"conciliacao":true,"contas_pagar":true,"contas_receber":false,"vendas":true,"conta_azul":true,"fiscal":true,"relatorios":true,"configuracoes":true}'::jsonb,
ADD COLUMN IF NOT EXISTS forcar_troca_senha boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS ultimo_acesso timestamptz,
ADD COLUMN IF NOT EXISTS criado_em timestamptz DEFAULT now();

-- Garantir constraint de status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'perfis_usuario_status_check'
  ) THEN
    ALTER TABLE public.perfis_usuario
    ADD CONSTRAINT perfis_usuario_status_check
    CHECK (status IN ('PENDENTE', 'APROVADO', 'BLOQUEADO', 'REJEITADO'));
  END IF;
END $$;

-- 2. Tabela de Auditoria de Ações Administrativas de Usuários
CREATE TABLE IF NOT EXISTS public.auditoria_usuarios_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_responsavel_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  usuario_responsavel_email text NOT NULL,
  usuario_alvo_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  usuario_alvo_email text NOT NULL,
  acao text NOT NULL,
  detalhes jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- 3. Índices de Performance
CREATE INDEX IF NOT EXISTS idx_perfis_usuario_user_id ON public.perfis_usuario(user_id);
CREATE INDEX IF NOT EXISTS idx_perfis_usuario_is_master ON public.perfis_usuario(is_master);
CREATE INDEX IF NOT EXISTS idx_perfis_usuario_status ON public.perfis_usuario(status);
CREATE INDEX IF NOT EXISTS idx_auditoria_usuarios_log_created_at ON public.auditoria_usuarios_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_usuarios_log_alvo ON public.auditoria_usuarios_log(usuario_alvo_id);

-- 4. Função e Trigger para Novos Cadastros (status inicial = PENDENTE, is_master = false)
CREATE OR REPLACE FUNCTION public.handle_new_user_perfil()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.perfis_usuario (
    user_id,
    email,
    is_master,
    status,
    permissoes,
    forcar_troca_senha,
    criado_em,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    false,
    'PENDENTE',
    '{"dashboard":true,"gestao_pagamentos":false,"conciliacao":false,"contas_pagar":false,"contas_receber":false,"vendas":false,"conta_azul":false,"fiscal":false,"relatorios":false,"configuracoes":false}'::jsonb,
    false,
    now(),
    now()
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Associar trigger ao auth.users (caso não exista)
DROP TRIGGER IF EXISTS on_auth_user_created_perfil ON auth.users;
CREATE TRIGGER on_auth_user_created_perfil
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_perfil();

-- 5. Inicialização dos Usuários Existentes com Regra de Segurança Máxima
-- Inserir registros de perfis faltantes para todos os usuários em auth.users
INSERT INTO public.perfis_usuario (user_id, email, is_master, status, permissoes, forcar_troca_senha, criado_em, updated_at)
SELECT 
  u.id,
  u.email,
  CASE WHEN lower(u.email) = 'ramoncardosobiologo@gmail.com' THEN true ELSE false END as is_master,
  'APROVADO' as status,
  '{"dashboard":true,"gestao_pagamentos":true,"conciliacao":true,"contas_pagar":true,"contas_receber":true,"vendas":true,"conta_azul":true,"fiscal":true,"relatorios":true,"configuracoes":true}'::jsonb as permissoes,
  false as forcar_troca_senha,
  COALESCE(u.created_at, now()) as criado_em,
  now() as updated_at
FROM auth.users u
ON CONFLICT (user_id) DO UPDATE
SET 
  email = EXCLUDED.email,
  -- Apenas o proprietário recebe MASTER = TRUE. Outros mantêm o valor ou recebem false.
  is_master = CASE WHEN lower(EXCLUDED.email) = 'ramoncardosobiologo@gmail.com' THEN true ELSE public.perfis_usuario.is_master END,
  -- Todos os usuários existentes são preservados como APROVADO
  status = COALESCE(public.perfis_usuario.status, 'APROVADO'),
  permissoes = COALESCE(public.perfis_usuario.permissoes, EXCLUDED.permissoes);

-- Garantir especificamente que ramoncardosobiologo@gmail.com seja MASTER = TRUE e APROVADO
UPDATE public.perfis_usuario
SET is_master = true, status = 'APROVADO'
WHERE lower(email) = 'ramoncardosobiologo@gmail.com'
   OR user_id IN (SELECT id FROM auth.users WHERE lower(email) = 'ramoncardosobiologo@gmail.com');

-- 6. Políticas de RLS
ALTER TABLE public.perfis_usuario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria_usuarios_log ENABLE ROW LEVEL SECURITY;

-- Leitura do próprio perfil pelo usuário autenticado
DROP POLICY IF EXISTS "Usuário pode ver seu próprio perfil" ON public.perfis_usuario;
CREATE POLICY "Usuário pode ver seu próprio perfil"
  ON public.perfis_usuario FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Master pode ver todos os perfis
DROP POLICY IF EXISTS "Master pode ver todos os perfis" ON public.perfis_usuario;
CREATE POLICY "Master pode ver todos os perfis"
  ON public.perfis_usuario FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.perfis_usuario p
      WHERE p.user_id = auth.uid() AND p.is_master = true
    )
  );

-- Master pode atualizar perfis
DROP POLICY IF EXISTS "Master pode atualizar perfis" ON public.perfis_usuario;
CREATE POLICY "Master pode atualizar perfis"
  ON public.perfis_usuario FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.perfis_usuario p
      WHERE p.user_id = auth.uid() AND p.is_master = true
    )
  );

-- Usuário pode atualizar campos estéticos do seu próprio perfil (tema, accent_color, nome_exibicao)
DROP POLICY IF EXISTS "Usuário pode atualizar preferências próprias" ON public.perfis_usuario;
CREATE POLICY "Usuário pode atualizar preferências próprias"
  ON public.perfis_usuario FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Master pode consultar auditoria
DROP POLICY IF EXISTS "Master pode ler auditoria" ON public.auditoria_usuarios_log;
CREATE POLICY "Master pode ler auditoria"
  ON public.auditoria_usuarios_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.perfis_usuario p
      WHERE p.user_id = auth.uid() AND p.is_master = true
    )
  );

-- Service Role tem acesso irrestrito
DROP POLICY IF EXISTS "Service role acesso irrestrito perfis" ON public.perfis_usuario;
CREATE POLICY "Service role acesso irrestrito perfis"
  ON public.perfis_usuario FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role acesso irrestrito auditoria" ON public.auditoria_usuarios_log;
CREATE POLICY "Service role acesso irrestrito auditoria"
  ON public.auditoria_usuarios_log FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
