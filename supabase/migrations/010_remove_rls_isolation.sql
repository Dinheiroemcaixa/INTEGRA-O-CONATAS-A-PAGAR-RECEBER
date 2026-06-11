-- ============================================================
-- Migration 010: Remover isolamento de empresas por usuário
-- Permite que todos os usuários autenticados vejam e acessem
-- todas as empresas cadastradas no sistema.
-- ============================================================

-- 1. Empresas
DROP POLICY IF EXISTS "usuarios_veem_suas_empresas" ON public.empresas;
CREATE POLICY "usuarios_veem_suas_empresas" ON public.empresas 
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "usuarios_atualizam_suas_empresas" ON public.empresas;
CREATE POLICY "usuarios_atualizam_suas_empresas" ON public.empresas 
  FOR UPDATE USING (auth.uid() IS NOT NULL);

-- 2. Contas a Pagar
DROP POLICY IF EXISTS "contas_pagar_por_empresa" ON public.contas_pagar_importadas;
CREATE POLICY "contas_pagar_por_empresa" ON public.contas_pagar_importadas 
  FOR ALL USING (auth.uid() IS NOT NULL);

-- 3. Importações
DROP POLICY IF EXISTS "importacoes_por_empresa" ON public.importacoes;
CREATE POLICY "importacoes_por_empresa" ON public.importacoes 
  FOR ALL USING (auth.uid() IS NOT NULL);

-- 4. Logs
DROP POLICY IF EXISTS "logs_por_empresa" ON public.logs_integracao;
CREATE POLICY "logs_por_empresa" ON public.logs_integracao 
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- 5. Fornecedores Conta Azul
DROP POLICY IF EXISTS "usuarios_veem_fornecedores_da_empresa" ON public.fornecedores_contaazul;
CREATE POLICY "usuarios_veem_fornecedores_da_empresa" ON public.fornecedores_contaazul 
  FOR ALL USING (auth.uid() IS NOT NULL);
