/**
 * Script para testar as credenciais do Datacar e validar o idOperador
 * Testa o endpoint /empresas com cada combinação de token + codEmp + idOperador
 */

const DATACAR_BASE_URL = 'https://datalog.com.br/datacarapi'
const ID_OPERADOR = '21331'

const empresas = [
  {
    nome: 'Stock Locadora',
    codEmp: '1366',
    token: 'R4ip8lHo0X4R7wr1R3XC0f9kykW/EahxAl2wJ+VXDP6Q+2pJbV5MJlKdxAEIoaCHrfaPWgTJJeyuut+XIORZ146ZW+mgFDVjNU95j5GBmKA=',
  },
  {
    nome: 'Stock Pneus Barao',
    codEmp: '1162',
    token: 'R4ip8lHo0X4R7wr1R3XC0f9kykW/Eahxz6Z5YngmpLx72EBjlKDuZPiZSl1EtP4+VlMq1TcaK7eFNdlo491rzf0n0NCDwOqAJfjqkbq2kq/BJZEUE5Y3EXT9b+Uw1wLI',
  },
  {
    nome: 'Stock Pneus Barreiro',
    codEmp: '1409',
    token: 'R4ip8lHo0X4R7wr1R3XC0f9kykW/EahxuBTosbxJFmh9uh4HBcmFS1bNsvjb9pg4txd1C2yEkyOCt627GQGT1NK6HfQ7ZqOBlaQD34yYTwU0w5XVLnRNMbHOkrV6u4Wa',
  },
  {
    nome: 'Stock Pneus Pedro II',
    codEmp: '1161',
    token: 'R4ip8lHo0X4R7wr1R3XC0f9kykW/Eahxz6Z5YngmpLzQczSi/Y6H6wXKJhPhjmCqRKnpK0Gpx9ZJSVW0GIv/qaWovoniotZf/lf6WKo9XTmBpmZObtGiBXnMAlv0Ew8K',
  },
]

async function testarCredencial(empresa) {
  const params = new URLSearchParams({
    token: empresa.token,
    codEmp: empresa.codEmp,
    idOperador: ID_OPERADOR,
  })

  const url = `${DATACAR_BASE_URL}/empresas?${params.toString()}`

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })

    const text = await res.text()

    if (res.ok) {
      let dados
      try {
        dados = JSON.parse(text)
      } catch {
        dados = text
      }
      console.log(`\n✅ ${empresa.nome} (codEmp: ${empresa.codEmp})`)
      console.log(`   Status: ${res.status} OK`)
      console.log(`   Resposta:`, JSON.stringify(dados, null, 2))
    } else {
      console.log(`\n❌ ${empresa.nome} (codEmp: ${empresa.codEmp})`)
      console.log(`   Status: ${res.status} ${res.statusText}`)
      console.log(`   Resposta: ${text}`)
    }
  } catch (err) {
    console.log(`\n💥 ${empresa.nome} (codEmp: ${empresa.codEmp})`)
    console.log(`   Erro de conexão: ${err.message}`)
  }
}

console.log('='.repeat(60))
console.log('TESTE DE CREDENCIAIS DATACAR')
console.log(`idOperador testado: ${ID_OPERADOR}`)
console.log('='.repeat(60))

for (const empresa of empresas) {
  await testarCredencial(empresa)
}

console.log('\n' + '='.repeat(60))
console.log('TESTE CONCLUÍDO')
console.log('='.repeat(60))
