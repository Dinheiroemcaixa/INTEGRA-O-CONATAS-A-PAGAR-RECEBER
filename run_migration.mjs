import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const sql = `
    ALTER TABLE public.vendas_importadas DROP CONSTRAINT IF EXISTS vendas_importadas_empresa_id_os_numero_key;
    ALTER TABLE public.vendas_importadas ADD CONSTRAINT vendas_importadas_empresa_id_os_numero_key UNIQUE (empresa_id, os_numero);
    ALTER TABLE public.contas_pagar_importadas DROP CONSTRAINT IF EXISTS contas_pagar_importadas_unique_key;
    ALTER TABLE public.contas_pagar_importadas ADD CONSTRAINT contas_pagar_importadas_unique_key UNIQUE (empresa_id, fornecedor, valor, vencimento, doc);
  `;
  const { error } = await supabase.rpc('exec_sql', { sql });
  if (error) {
    console.error('Error running migration via rpc:', error);
  } else {
    console.log('Migration completed.');
  }
}

run();
