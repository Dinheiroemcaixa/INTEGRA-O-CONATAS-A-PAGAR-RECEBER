const DATACAR_BASE_URL = 'https://datalog.com.br/datacarapi'

async function checkAddress() {
  const params = new URLSearchParams({
    token: 'R4ip8lHo0X4R7wr1R3XC0f9kykW/Eahxz6Z5YngmpLx72EBjlKDuZPiZSl1EtP4+VlMq1TcaK7eFNdlo491rzf0n0NCDwOqAJfjqkbq2kq/BJZEUE5Y3EXT9b+Uw1wLI',
    codEmp: '1162',
    idOperador: '21331',
    tipoPeriodo: 'encerramento',
    dtIni: '25/06/2026',
    dtFim: '25/06/2026',
    noPagina: '1',
  })

  const url = `${DATACAR_BASE_URL}/ospedido?${params.toString()}`
  const res = await fetch(url)
  const data = await res.json()
  
  if (data.length > 0) {
    const keys = Object.keys(data[0])
    const clienteKeys = keys.filter(k => k.toLowerCase().includes('cliente') || k.toLowerCase().includes('end'))
    console.log('Keys related to cliente or address:', clienteKeys)
    clienteKeys.forEach(k => console.log(k, data[0][k]))
  }
}

checkAddress()
