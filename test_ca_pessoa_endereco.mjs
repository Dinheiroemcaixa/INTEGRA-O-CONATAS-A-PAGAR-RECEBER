import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testCAPessoa() {
  const { data: empresa } = await supabase
    .from('empresas')
    .select('access_token_conta_azul')
    .not('access_token_conta_azul', 'is', null)
    .limit(1)
    .single();

  if (!empresa) {
    console.log('No company found');
    return;
  }

  const accessToken = empresa.access_token_conta_azul;
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  const body = {
    nome: 'CLIENTE TESTE ENDERECO 2',
    tipo_pessoa: 'Física',
    perfis: [{ tipo_perfil: 'Cliente' }],
    ativo: true,
    enderecos: [
      {
        logradouro: 'RUA CONSUL WALTER',
        numero: '400',
        bairro: 'BURITIS',
        cidade: 'BELO HORIZONTE',
        estado: 'MG',
        cep: '30575-140',
        pais: 'Brasil'
      }
    ]
  };

  console.log('Criando Pessoa...', JSON.stringify(body, null, 2));
  const resp = await fetch('https://api-v2.contaazul.com/v1/pessoas', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  
  console.log('Status:', resp.status);
  const data = await resp.json();
  console.log('Body:', JSON.stringify(data, null, 2));
}

testCAPessoa().catch(console.error);
