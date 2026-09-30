/**
 * MÓDULO: Auditoria Inteligente de Conciliação Bancária
 * CAMINHO: src/lib/auditoria-conciliacao/cache.ts
 * 
 * Gerenciador de cache satélite no Supabase para consultas à API Conta Azul v2.
 * Evita rate limit 429 / Spike Arrest e viabiliza reanálises ultra-rápidas.
 */

import { createClient } from '@supabase/supabase-js';
import { TipoRegistroCacheContaAzul } from './tipos';

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createClient(supabaseUrl, supabaseKey);
}

/**
 * Busca registro em cache se ainda não tiver expirado
 */
export async function obterCacheContaAzul<T = any>(
  empresaId: string,
  contaFinanceiraId: string,
  tipoRegistro: TipoRegistroCacheContaAzul,
  chaveRegistro: string
): Promise<T | null> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('auditoria_conciliacao_cache_ca')
    .select('dados_json, expira_em')
    .eq('empresa_id', empresaId)
    .eq('conta_financeira_id', contaFinanceiraId)
    .eq('tipo_registro', tipoRegistro)
    .eq('chave_registro', chaveRegistro)
    .gt('expira_em', new Date().toISOString())
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data.dados_json as T;
}

/**
 * Salva ou atualiza registro no cache satélite com expiração de 24 horas
 */
export async function salvarCacheContaAzul(
  empresaId: string,
  contaFinanceiraId: string,
  periodoInicio: string,
  periodoFim: string,
  tipoRegistro: TipoRegistroCacheContaAzul,
  chaveRegistro: string,
  dadosJson: any,
  horasValidade: number = 24
): Promise<void> {
  const supabase = getSupabase();
  const expiraEm = new Date(Date.now() + horasValidade * 3600 * 1000).toISOString();

  await supabase
    .from('auditoria_conciliacao_cache_ca')
    .upsert(
      {
        empresa_id: empresaId,
        conta_financeira_id: contaFinanceiraId,
        periodo_inicio: periodoInicio,
        periodo_fim: periodoFim,
        tipo_registro: tipoRegistro,
        chave_registro: chaveRegistro,
        dados_json: dadosJson,
        sincronizado_em: new Date().toISOString(),
        expira_em: expiraEm
      },
      {
        onConflict: 'empresa_id,conta_financeira_id,tipo_registro,chave_registro'
      }
    );
}

/**
 * Invalida/remove registros do cache satélite no Supabase para forçar reprocessamento com dados frescos
 */
export async function invalidarCacheContaAzul(
  empresaId: string,
  contaFinanceiraId?: string,
  chaveRegistro?: string
): Promise<void> {
  const supabase = getSupabase();
  let query = supabase
    .from('auditoria_conciliacao_cache_ca')
    .delete()
    .eq('empresa_id', empresaId);

  if (contaFinanceiraId) {
    query = query.eq('conta_financeira_id', contaFinanceiraId);
  }

  if (chaveRegistro) {
    query = query.eq('chave_registro', chaveRegistro);
  }

  const { error } = await query;
  if (error) {
    console.warn('[invalidarCacheContaAzul] Aviso ao invalidar cache satélite:', error.message);
  } else {
    console.log(`[invalidarCacheContaAzul] Cache satélite invalidado com sucesso para empresa ${empresaId}.`);
  }
}
