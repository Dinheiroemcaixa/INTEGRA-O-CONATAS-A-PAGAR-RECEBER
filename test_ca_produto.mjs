import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testCA() {
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
    nome: 'TESTE_PRODUTO_SKU',
    codigo: 'MEU_SKU_TESTE',
    valor: 15.50,
    situacao: 'ATIVO',
    tipo: 'PRODUTO',
    fiscal: {
      unidade_medida: 'UN'
    }
  };

  console.log('Criando Produto...');
  const resp = await fetch('https://api-v2.contaazul.com/v1/produtos', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  
  console.log('Status:', resp.status);
  const data = await resp.json();
  console.log('Body:', JSON.stringify(data, null, 2));

  // Tentar buscar o produto pelo id para ver se o código foi salvo e como retorna
  if (data && data.id) {
    console.log('\nBuscando produto recém-criado...');
    const resp2 = await fetch(`https://api-v2.contaazul.com/v1/produtos/${data.id}`, {
      headers
    });
    const data2 = await resp2.json();
    console.log('Produto recuperado:', JSON.stringify(data2, null, 2));
  }
}

testCA().catch(console.error);
