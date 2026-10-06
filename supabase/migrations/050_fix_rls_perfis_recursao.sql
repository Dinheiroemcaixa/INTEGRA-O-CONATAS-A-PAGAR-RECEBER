-- ============================================================
-- Migration 050: Correção de Recursão Infinita no RLS de perfis_usuario
-- ============================================================

-- 1. Função SECURITY DEFINER para verificar se o usuário é MASTER sem acionar RLS recursivo
CREATE OR REPLACE FUNCTION public.is_master_user(user_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  IF user_uuid IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.perfis_usuario
    WHERE user_id = user_uuid AND is_master = true
  );
END;
$$;

-- Conceder permissão de execução aos usuários autenticados
GRANT EXECUTE ON FUNCTION public.is_master_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_master_user(uuid) TO service_role;

-- 2. Recriar policies de perfis_usuario usando a função sem recursão
DROP POLICY IF EXISTS "Master pode ver todos os perfis" ON public.perfis_usuario;
CREATE POLICY "Master pode ver todos os perfis"
  ON public.perfis_usuario FOR SELECT
  TO authenticated
  USING (public.is_master_user(auth.uid()));

DROP POLICY IF EXISTS "Master pode atualizar perfis" ON public.perfis_usuario;
CREATE POLICY "Master pode atualizar perfis"
  ON public.perfis_usuario FOR UPDATE
  TO authenticated
  USING (public.is_master_user(auth.uid()));

-- 3. Recriar policy de auditoria usando a função sem recursão
DROP POLICY IF EXISTS "Master pode ler auditoria" ON public.auditoria_usuarios_log;
CREATE POLICY "Master pode ler auditoria"
  ON public.auditoria_usuarios_log FOR SELECT
  TO authenticated
  USING (public.is_master_user(auth.uid()));
