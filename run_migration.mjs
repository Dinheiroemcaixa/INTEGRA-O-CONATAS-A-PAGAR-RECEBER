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
  const sql = `
    ALTER TABLE public.empresa_config_fiscal
    ADD COLUMN IF NOT EXISTS aliquota_simples_nacional NUMERIC(5,2),
    ADD COLUMN IF NOT EXISTS aliquota_issqn NUMERIC(5,2);
  `;
  
  console.log('Running migration 021...');
  const { error } = await supabase.rpc('exec_sql', { sql });
  if (error) {
    console.error('Error running 021:', error);
  } else {
    console.log('021 done.');
  }
}

run();
