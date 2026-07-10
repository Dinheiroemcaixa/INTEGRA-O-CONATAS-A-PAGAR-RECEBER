import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const sql18 = `
    CREATE TABLE IF NOT EXISTS memoria_fiscal (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      codigo VARCHAR(100) NOT NULL,
      descricao TEXT,
      ncm VARCHAR(20),
      cest VARCHAR(20),
      tipo_produto VARCHAR(100),
      origem VARCHAR(100),
      unidade_medida VARCHAR(20),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(empresa_id, codigo)
    );
    CREATE INDEX IF NOT EXISTS idx_memoria_fiscal_ncm ON memoria_fiscal(empresa_id, ncm);
    CREATE INDEX IF NOT EXISTS idx_memoria_fiscal_codigo ON memoria_fiscal(empresa_id, codigo);
  `;

  const sql19 = `
    CREATE TABLE IF NOT EXISTS memoria_fiscal_familia (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      empresa_id uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      palavra_chave text NOT NULL,
      ncm text,
      cest text,
      tipo_produto text,
      origem text,
      unidade_medida text,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      UNIQUE(empresa_id, palavra_chave)
    );
    CREATE INDEX IF NOT EXISTS idx_memoria_fiscal_familia_empresa ON memoria_fiscal_familia(empresa_id);
  `;
  
  console.log('Running migration 018...');
  const { error: err1 } = await supabase.rpc('exec_sql', { sql: sql18 });
  if (err1) {
    console.error('Error running 018:', err1);
  } else {
    console.log('018 done.');
  }

  console.log('Running migration 019...');
  const { error: err2 } = await supabase.rpc('exec_sql', { sql: sql19 });
  if (err2) {
    console.error('Error running 019:', err2);
  } else {
    console.log('019 done.');
  }
}

run();
