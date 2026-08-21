const { createClient } = require('@supabase/supabase-js');

async function run() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  
  const { data: empresa } = await supabase.from('empresas').select('*').not('access_token_conta_azul', 'is', null).limit(1).single();
  const token = empresa.access_token_conta_azul;
  const BASE = 'https://api-v2.contaazul.com/v1';

  // Buscar notas fiscais do último mês
  const hoje = new Date();
  const dtFim = hoje.toISOString().split('T')[0];
  const trintaDiasAtras = new Date();
  trintaDiasAtras.setDate(hoje.getDate() - 30);
  const dtIni = trintaDiasAtras.toISOString().split('T')[0];

  console.log(`Buscando NFes de ${dtIni} até ${dtFim}`);

  const url = `${BASE}/notas-fiscais?data_inicial=${dtIni}&data_final=${dtFim}&tamanho_pagina=100`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('Erro:', res.status, errorText);
    return;
  }

  const data = await res.json();
  console.log('Paginação:', data.paginacao);
  if (data.itens && data.itens.length > 0) {
    console.log('Exemplo da primeira NFe:', JSON.stringify(data.itens[0], null, 2));
  } else {
    console.log('Nenhuma NFe encontrada nesse período.');
  }
}

run().catch(console.error);
