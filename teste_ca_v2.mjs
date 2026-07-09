import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';

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
  
  // Test 1: NCM
  const resNcm = await fetch('https://api-v2.contaazul.com/v1/ncm?codigo=84149010', { headers: { Authorization: 'Bearer ' + token }});
  console.log('NCM search status:', resNcm.status);
  console.log('NCM search body:', await resNcm.text());

  const resNcm2 = await fetch('https://api-v2.contaazul.com/v1/ncm?search=84149010', { headers: { Authorization: 'Bearer ' + token }});
  console.log('NCM search2 status:', resNcm2.status);
  console.log('NCM search2 body:', await resNcm2.text());

  // Test 3: endpoints fiscais
  const resFiscal = await fetch('https://api-v2.contaazul.com/v1/fiscal/ncms?codigo=84149010', { headers: { Authorization: 'Bearer ' + token }});
  console.log('NCM search3 status:', resFiscal.status);
  console.log('NCM search3 body:', await resFiscal.text());

  const resFiscal2 = await fetch('https://api-v2.contaazul.com/v1/fiscal/cest?codigo=0100100', { headers: { Authorization: 'Bearer ' + token }});
  console.log('CEST status:', resFiscal2.status);
  console.log('CEST body:', await resFiscal2.text());
})();
