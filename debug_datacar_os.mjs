/**
 * Script de diagnóstico: busca 1 OS do Datacar e mostra a estrutura completa
 * para verificar os nomes dos campos de produtos/servicos/valores
 */

const DATACAR_BASE_URL = 'https://datalog.com.br/datacarapi'

const empresas = [
  {
    nome: 'Stock Pneus Barao',
    codEmp: '1162',
    token: 'R4ip8lHo0X4R7wr1R3XC0f9kykW/Eahxz6Z5YngmpLx72EBjlKDuZPiZSl1EtP4+VlMq1TcaK7eFNdlo491rzf0n0NCDwOqAJfjqkbq2kq/BJZEUE5Y3EXT9b+Uw1wLI',
    idOperador: '21331',
  },
  {
    nome: 'Stock Pneus Barreiro',
    codEmp: '1409',
    token: 'R4ip8lHo0X4R7wr1R3XC0f9kykW/EahxuBTosbxJFmh9uh4HBcmFS1bNsvjb9pg4txd1C2yEkyOCt627GQGT1NK6HfQ7ZqOBlaQD34yYTwU0w5XVLnRNMbHOkrV6u4Wa',
    idOperador: '21331',
  },
  {
    nome: 'Stock Pneus Pedro II',
    codEmp: '1161',
    token: 'R4ip8lHo0X4R7wr1R3XC0f9kykW/Eahxz6Z5YngmpLzQczSi/Y6H6wXKJhPhjmCqRKnpK0Gpx9ZJSVW0GIv/qaWovoniotZf/lf6WKo9XTmBpmZObtGiBXnMAlv0Ew8K',
    idOperador: '21331',
  },
];

async function diagnosticar() {
  for (const emp of empresas) {
  console.log(`\n\n========== EMPRESA: ${emp.nome} (codEmp=${emp.codEmp}) ==========`)
  const params = new URLSearchParams({
    token: emp.token,
    codEmp: emp.codEmp,
    idOperador: emp.idOperador,
    tipoPeriodo: 'encerramento',
    dtIni: '25/06/2026',
    dtFim: '25/06/2026',
    noPagina: '1',
  })

  const url = `${DATACAR_BASE_URL}/ospedido?${params.toString()}`
  console.log('=== Buscando OS/Pedidos ===')
  console.log('URL:', url.replace(emp.token, 'TOKEN_HIDDEN'))

  const res = await fetch(url, { headers: { 'Accept': 'application/json' } })
  
  if (!res.ok) {
    console.error('Erro HTTP:', res.status, await res.text())
    return
  }

  const data = await res.json()
  
  console.log('\n=== Total de registros:', data.length, '===')
  
  if (data.length > 0) {
    // Mostrar a estrutura completa do primeiro registro
    const primeiro = data[0]
    console.log('\n=== PRIMEIRO REGISTRO COMPLETO ===')
    console.log(JSON.stringify(primeiro, null, 2))
    
    // Listar TODAS as chaves do primeiro nível
    console.log('\n=== CHAVES DE PRIMEIRO NÍVEL ===')
    console.log(Object.keys(primeiro))
    
    // Verificar campos de produtos
    console.log('\n=== CAMPO "produtos" ===')
    console.log('Tipo:', typeof primeiro.produtos)
    console.log('É array?', Array.isArray(primeiro.produtos))
    if (Array.isArray(primeiro.produtos) && primeiro.produtos.length > 0) {
      console.log('Primeiro produto:', JSON.stringify(primeiro.produtos[0], null, 2))
      console.log('Chaves produto:', Object.keys(primeiro.produtos[0]))
    } else {
      console.log('Array vazio ou não existe')
    }
    
    // Verificar campos de servicos
    console.log('\n=== CAMPO "servicos" ===')
    console.log('Tipo:', typeof primeiro.servicos)
    console.log('É array?', Array.isArray(primeiro.servicos))
    if (Array.isArray(primeiro.servicos) && primeiro.servicos.length > 0) {
      console.log('Primeiro serviço:', JSON.stringify(primeiro.servicos[0], null, 2))
      console.log('Chaves serviço:', Object.keys(primeiro.servicos[0]))
    } else {
      console.log('Array vazio ou não existe')
    }

    // Verificar campos de recebimentos
    console.log('\n=== CAMPO "recebimentos" ===')
    console.log('Tipo:', typeof primeiro.recebimentos)
    console.log('É array?', Array.isArray(primeiro.recebimentos))
    if (Array.isArray(primeiro.recebimentos) && primeiro.recebimentos.length > 0) {
      console.log('Primeiro recebimento:', JSON.stringify(primeiro.recebimentos[0], null, 2))
      console.log('Chaves recebimento:', Object.keys(primeiro.recebimentos[0]))
    } else {
      console.log('Array vazio ou não existe')
    }

    // Verificar qualquer campo que contenha "valor" ou "total"
    console.log('\n=== CAMPOS COM "valor" OU "total" NO NOME ===')
    for (const key of Object.keys(primeiro)) {
      if (key.toLowerCase().includes('valor') || key.toLowerCase().includes('total') || key.toLowerCase().includes('preco') || key.toLowerCase().includes('vl')) {
        console.log(`  ${key}:`, primeiro[key])
      }
    }
    
    // Mostrar segundo registro se existir
    if (data.length > 1) {
      const segundo = data[1]
      console.log('\n=== SEGUNDO REGISTRO (resumo) ===')
      console.log('venda_Numero:', segundo.venda_Numero)
      console.log('cliente_Nome:', segundo.cliente_Nome)
      console.log('produtos:', Array.isArray(segundo.produtos) ? `${segundo.produtos.length} itens` : segundo.produtos)
      console.log('servicos:', Array.isArray(segundo.servicos) ? `${segundo.servicos.length} itens` : segundo.servicos)
      console.log('frete_Valor:', segundo.frete_Valor)
    }
    }
  } // end for empresas
}

diagnosticar().catch(console.error)
