/**
 * MÓDULO: Auditoria Inteligente de Conciliação Bancária
 * CAMINHO: src/lib/auditoria-conciliacao/feature-flags.ts
 * 
 * Gerenciador de Kill Switch e Feature Flags:
 * 1. Persistência e leitura direta da tabela `feature_flags` no Supabase.
 * 2. Permite desligamento operacional imediato da Auditoria sem necessidade de deploy.
 * 3. Cache em memória de alta performance (TTL 30s) para evitar sobrecarga no banco.
 * 4. Fallback defensivo para variáveis de ambiente caso o banco esteja indisponível.
 */

import { createClient } from '@supabase/supabase-js';

const FLAG_AUDITORIA_KEY = 'AUDITORIA_CONCILIACAO_ENABLED';
const CACHE_TTL_MS = 30 * 1000; // 30 segundos

interface FlagCacheEntry {
  valor: boolean;
  expiraEm: number;
}

let memoryCacheFlag: FlagCacheEntry | null = null;

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createClient(supabaseUrl, supabaseKey);
}

/**
 * Lê o estado da variável de ambiente como fallback
 */
function getFallbackEnvValue(): boolean {
  const envVal = process.env.AUDITORIA_CONCILIACAO_ENABLED;
  const publicEnvVal = process.env.NEXT_PUBLIC_AUDITORIA_CONCILIACAO_ENABLED;

  if (envVal === 'false' || publicEnvVal === 'false') {
    return false;
  }
  return true;
}

/**
 * Verifica se a Auditoria está habilitada via Kill Switch persistido em banco.
 * Respeita cache em memória de 30s.
 */
export async function isAuditoriaConciliacaoHabilitada(): Promise<boolean> {
  const agora = Date.now();

  // 1. Checa cache em memória
  if (memoryCacheFlag && agora < memoryCacheFlag.expiraEm) {
    return memoryCacheFlag.valor;
  }

  // 2. Consulta banco de dados
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('feature_flags')
      .select('habilitado')
      .eq('chave', FLAG_AUDITORIA_KEY)
      .maybeSingle();

    if (error || !data) {
      // Se não encontrar ou tabela estiver inacessível, usa fallback de ambiente
      const fallbackVal = getFallbackEnvValue();
      memoryCacheFlag = {
        valor: fallbackVal,
        expiraEm: agora + CACHE_TTL_MS
      };
      return fallbackVal;
    }

    const valorHabilitado = Boolean(data.habilitado);
    memoryCacheFlag = {
      valor: valorHabilitado,
      expiraEm: agora + CACHE_TTL_MS
    };

    return valorHabilitado;
  } catch (err) {
    console.warn('[feature-flags] Falha ao consultar Kill Switch no banco, adotando fallback de ambiente:', err);
    const fallbackVal = getFallbackEnvValue();
    memoryCacheFlag = {
      valor: fallbackVal,
      expiraEm: agora + CACHE_TTL_MS
    };
    return fallbackVal;
  }
}

/**
 * Atualiza o status do Kill Switch diretamente no banco (Operação de Emergência)
 */
export async function setAuditoriaConciliacaoKillSwitch(habilitado: boolean): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('feature_flags')
    .upsert(
      {
        chave: FLAG_AUDITORIA_KEY,
        habilitado,
        descricao: 'Kill switch operacional para o módulo de Auditoria Inteligente de Conciliação Bancária.',
        atualizado_em: new Date().toISOString()
      },
      { onConflict: 'chave' }
    );

  if (error) {
    throw new Error(`Falha ao atualizar Kill Switch no banco: ${error.message}`);
  }

  // Invalida cache local imediatamente
  memoryCacheFlag = {
    valor: habilitado,
    expiraEm: Date.now() + CACHE_TTL_MS
  };
}

/**
 * Limpa o cache em memória das feature flags
 */
export function limparCacheFeatureFlags(): void {
  memoryCacheFlag = null;
}
