

async function run() {
  const { createClient } = require('@supabase/supabase-js');

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  
  const { data: empresa } = await supabase.from('empresas').select('*').not('access_token_conta_azul', 'is', null).limit(1).single();
  const token = empresa.access_token_conta_azul;
  const BASE = 'https://api-v2.contaazul.com/v1';

  console.log('Criando cliente...');
  const bodyCli = {
    nome: 'TESTE VENDA ' + Date.now(),
    tipo_pessoa: 'Física',
    perfis: [{ tipo_perfil: 'Cliente' }],
    ativo: true
  };
  const resCli = await fetch(BASE + '/pessoas', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(bodyCli) });
  const cliData = await resCli.json();
  console.log('Cliente criado:', cliData);

  const cliId = cliData.id || cliData.uuid;

  console.log('Tentando criar venda com id_cliente:', cliId);
  const payloadVenda = {
    id_cliente: cliId,
    situacao: 'APROVADO',
    data_venda: new Date().toISOString().split('T')[0],
    itens: [{ descricao: 'Item teste', quantidade: 1, valor: 10.0 }],
    condicao_pagamento: {
      tipo_pagamento: 'A_VISTA',
      opcao_condicao_pagamento: 'DINHEIRO',
      parcelas: [{ data_vencimento: new Date().toISOString().split('T')[0], valor: 10.0 }]
    }
  };

  const resVenda1 = await fetch(BASE + '/venda', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payloadVenda) });
  const vendaData1 = await resVenda1.text();
  console.log('Status /venda (id_cliente):', resVenda1.status, vendaData1);

  console.log('Tentando criar venda com cliente_id:', cliId);
  payloadVenda.cliente_id = cliId;
  delete payloadVenda.id_cliente;
  const resVenda2 = await fetch(BASE + '/venda', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payloadVenda) });
  const vendaData2 = await resVenda2.text();
  console.log('Status /venda (cliente_id):', resVenda2.status, vendaData2);

  // cleanup
  await fetch(BASE + '/pessoas/' + cliId, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
}
run();
