import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testCA() {
  const { data: empresa } = await supabase
    .from('empresas')
    .select('access_token_conta_azul')
    .eq('id', '9a009d18-971c-43bd-a37a-42cd2db3a39e') // Using the ID from earlier if possible, or I can just fetch the first one
    .limit(1)
    .single();

  if (!empresa) {
    console.log('No company found');
    return;
  }

  const accessToken = empresa.access_token_conta_azul;
  const nome = 'RAMON PINTO LOBO JUNIOR';
  
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  const CA_BASE = 'https://api-v2.contaazul.com/v1';

  console.log('1. Buscando...');
  const urlBusca = `${CA_BASE}/pessoas?pagina=1&tamanho_pagina=50&busca=${encodeURIComponent(nome)}`;
  const respBusca = await fetch(urlBusca, { headers });
  console.log('Busca status:', respBusca.status);
  console.log('Busca body:', await respBusca.text());

  console.log('2. Criando...');
  const respCriar = await fetch(`${CA_BASE}/pessoas`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ nome, tipo_pessoa: 'Fisica', tipo_perfil: 'Cliente', ativo: true }),
  });
  console.log('Criar status:', respCriar.status);
  console.log('Criar body:', await respCriar.text());

  console.log('3. Criando Legado...');
  const respLegado = await fetch(`${CA_BASE}/contatos`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ nome, tipo_pessoa: 'PF', ativo: true }),
  });
  console.log('Criar Legado status:', respLegado.status);
  console.log('Criar Legado body:', await respLegado.text());
}

testCA().catch(console.error);
