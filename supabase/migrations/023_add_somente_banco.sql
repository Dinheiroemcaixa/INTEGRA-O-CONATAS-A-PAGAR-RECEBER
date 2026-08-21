-- ============================================================
-- Migration 023: Adiciona a coluna somente_banco para empresas exclusivas de Gestão de Pagamentos
-- Execute no SQL Editor do Supabase se desejar persistência em coluna física dedicada
-- ============================================================

ALTER TABLE public.empresas 
ADD COLUMN IF NOT EXISTS somente_banco BOOLEAN DEFAULT false;
