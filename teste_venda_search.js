const { createClient } = require('@supabase/supabase-js');

async function run() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  
  const { data: empresa } = await supabase.from('empresas').select('*').not('access_token_conta_azul', 'is', null).limit(1).single();
  const token = empresa.access_token_conta_azul;
  const BASE = 'https://api-v2.contaazul.com/v1';

  const hoje = new Date();
  const dtFim = hoje.toISOString().split('T')[0];
  const trintaDiasAtras = new Date();
  trintaDiasAtras.setDate(hoje.getDate() - 30);
  const dtIni = trintaDiasAtras.toISOString().split('T')[0];

  console.log(`Buscando Vendas de ${dtIni} até ${dtFim}`);

  const url = `${BASE}/venda?data_emissao_inicial=${dtIni}&data_emissao_final=${dtFim}&tamanho_pagina=100`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) {
    console.error('Erro:', res.status, await res.text());
    return;
  }

  const data = await res.json();
  console.log('Total Vendas:', data.itens ? data.itens.length : 0);
  if (data.itens && data.itens.length > 0) {
    console.log('Exemplo de Venda:', JSON.stringify(data.itens[0], null, 2));
    
    // Testar buscar NFe para a primeira venda
    const vendaId = data.itens[0].id;
    const urlNfe = `${BASE}/notas-fiscais?id_venda=${vendaId}`;
    const resNfe = await fetch(urlNfe, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (resNfe.ok) {
      const dataNfe = await resNfe.json();
      console.log('Notas Fiscais da Venda:', JSON.stringify(dataNfe, null, 2));
    }
  }
}

run().catch(console.error);
