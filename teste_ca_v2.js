const { loadEnvConfig } = require('@next/env');
const { createClient } = require('@supabase/supabase-js');

const projectDir = process.cwd();
loadEnvConfig(projectDir);

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const { data, error } = await supabase.from('empresas').select('datacar_token').not('datacar_token', 'is', null).limit(1);
  if (error || !data || data.length === 0) {
    console.log('Sem token', error);
    return;
  }
  const token = data[0].datacar_token;
  console.log('Got token');
  
  // Teste NCM
  const resNcm = await fetch('https://api-v2.contaazul.com/v1/produtos/ncm?busca_textual=84149010', { headers: { Authorization: 'Bearer ' + token }});
  console.log('NCM status:', resNcm.status);
  console.log('NCM body:', await resNcm.text());

  // Teste CEST
  const resCest = await fetch('https://api-v2.contaazul.com/v1/produtos/cest?busca_textual=0100100', { headers: { Authorization: 'Bearer ' + token }});
  console.log('CEST status:', resCest.status);
  console.log('CEST body:', await resCest.text());
})();
