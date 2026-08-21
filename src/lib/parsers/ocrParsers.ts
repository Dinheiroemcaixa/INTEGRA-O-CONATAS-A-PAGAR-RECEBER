import { parseCurrency, parseDate } from '../utils'

export function parseDDAFromOCR(texto: string) {
  const linhas = texto.split('\n').map(l => l.trim()).filter(Boolean)
  const resultados: any[] = []
  
  const regexValor = /(?:R\$)?\s*(\d{1,3}(?:\.\d{3})*,\d{2})/
  const regexData = /(\d{2}\/\d{2}\/\d{4})/
  const regexCNPJ = /(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/
  const regexCNPJSemFormato = /\b(\d{13,14})\b/

  let beneficiarioAtual = ''
  let cnpjAtual = ''
  
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i]
    
    const matchValor = linha.match(regexValor)
    const matchData = linha.match(regexData)
    
    if (matchValor && matchData) {
      const valorStr = matchValor[1]
      const dataStr = matchData[1]
      
      const valor = parseCurrency(valorStr)
      const data_vencimento = parseDate(dataStr) || dataStr.split('/').reverse().join('-')
      
      let resto = linha.replace(matchValor[0], '').replace(matchData[0], '').trim()
      
      let cpfCnpj = ''
      const matchCnpj = linha.match(regexCNPJ)
      const matchCnpjSF = linha.match(regexCNPJSemFormato)
      
      if (matchCnpj) {
          cpfCnpj = matchCnpj[1]
          resto = resto.replace(matchCnpj[0], '').trim()
      } else if (matchCnpjSF) {
          let d = matchCnpjSF[1]
          if (d.length === 13) d = '0' + d
          cpfCnpj = `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12,14)}`
          resto = resto.replace(matchCnpjSF[0], '').trim()
      } else if (cnpjAtual) {
          cpfCnpj = cnpjAtual
      } else {
          if (i + 1 < linhas.length) {
              const linhaSeguinte = linhas[i+1]
              const matchCnpjSeguinte = linhaSeguinte.match(regexCNPJ)
              const matchCnpjSFSeguinte = linhaSeguinte.match(regexCNPJSemFormato)
              if (matchCnpjSeguinte) {
                  cpfCnpj = matchCnpjSeguinte[1]
              } else if (matchCnpjSFSeguinte) {
                  let d = matchCnpjSFSeguinte[1]
                  if (d.length === 13) d = '0' + d
                  cpfCnpj = `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12,14)}`
              }
          }
      }

      let documento = ''
      const matchNumDoc = resto.match(/\b(NF\s*\d+|\d{3,})\b/)
      if (matchNumDoc) {
          documento = matchNumDoc[1]
          resto = resto.replace(matchNumDoc[0], '').trim()
      }
      
      let beneficiarioLixo = resto.replace(/Pagar hoje|Pagar no vencimento/gi, '').trim()
      beneficiarioLixo = beneficiarioLixo.replace(/\b(\d{2}\/\d{2}\/\d{4})\b/g, '').trim()
      beneficiarioLixo = beneficiarioLixo.replace(/^(O|0|X)\s*/, '').trim()
      
      let beneficiarioFinal = beneficiarioAtual || beneficiarioLixo
      let docFinal = documento
      if (cpfCnpj) {
          docFinal = docFinal ? `${docFinal} - CNPJ: ${cpfCnpj}` : `CNPJ: ${cpfCnpj}`
      }
      
      if (valor > 0) {
          resultados.push({
              beneficiario: beneficiarioFinal || 'Não identificado',
              documento: docFinal || 'S/N',
              cpf_cnpj: cpfCnpj || '',
              valor,
              data_vencimento
          })
          beneficiarioAtual = ''
          cnpjAtual = ''
      }
    } else {
        if (linha.length > 5 && !linha.includes('R$') && !linha.match(regexData)) {
            let linhaLimpa = linha
            const matchCnpj = linha.match(regexCNPJ)
            const matchCnpjSF = linha.match(regexCNPJSemFormato)
            
            if (matchCnpj) {
                cnpjAtual = matchCnpj[1]
                linhaLimpa = linhaLimpa.replace(matchCnpj[0], '').trim()
            } else if (matchCnpjSF) {
                let d = matchCnpjSF[1]
                if (d.length === 13) d = '0' + d
                cnpjAtual = `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12,14)}`
                linhaLimpa = linhaLimpa.replace(matchCnpjSF[0], '').trim()
            }
            
            linhaLimpa = linhaLimpa.replace(/^(O|0|X)\s*/, '').trim()
            if (linhaLimpa.length > 2) {
                beneficiarioAtual = linhaLimpa
            }
        }
    }
  }
  
  return resultados
}

export function parseFolhaFromOCR(texto: string) {
    const linhas = texto.split('\n').map(l => l.trim()).filter(Boolean)
    const resultados = []
    let tipoCalculo = 'Folha Mensal'
    
    for (const linha of linhas) {
        if (linha.toLowerCase().includes('cálculo:')) {
            if (linha.toLowerCase().includes('adiantamento')) {
                tipoCalculo = 'Adiantamento'
            } else if (linha.toLowerCase().includes('folha')) {
                tipoCalculo = 'Folha Mensal'
            }
        }
    }
    
    const regexLinhaDinheiro = /(?:R\$)?\s*(\d{1,3}(?:\.\d{3})*,\d{2})$/

    for (let i = 0; i < linhas.length; i++) {
        const linha = linhas[i]
        let fornecedor = ''
        let cpf = ''
        let valorStr = ''
        
        const matchValor = linha.match(regexLinhaDinheiro)
        if (matchValor) {
            valorStr = matchValor[1]
            let resto = linha.replace(matchValor[0], '').trim()
            const linhaLower = resto.toLowerCase()
            if (linhaLower.includes('total') || 
                linhaLower.includes('estagiários') || 
                linhaLower.includes('contribuintes') || 
                linhaLower.includes('líquidos') ||
                linhaLower.includes('bruto') ||
                linhaLower.includes('líquido') ||
                linhaLower.includes('empresa:')) {
                continue
            }
            
            const matchCpf = resto.match(/(\d{3}\.\d{3}\.\d{3}-\d{2})/)
            if (matchCpf) {
                cpf = matchCpf[1]
                resto = resto.replace(matchCpf[0], '').trim()
            }
            
            resto = resto.replace(/^(Empregados|Empregado|Empre)\s*/i, '').trim()
            resto = resto.replace(/^\d+\s+/, '').trim()
            fornecedor = resto
            
            if (!fornecedor && i > 0) {
                let linhaAnterior = linhas[i-1].trim()
                linhaAnterior = linhaAnterior.replace(/^(Empregados|Empregado|Empre)\s*/i, '').trim()
                linhaAnterior = linhaAnterior.replace(/^\d+\s+/, '').trim()
                if (!linhaAnterior.toLowerCase().includes('cpf') && !linhaAnterior.toLowerCase().includes('código')) {
                    fornecedor = linhaAnterior
                }
            }
        }
        
        if (fornecedor && valorStr) {
            const valor = parseCurrency(valorStr)
            if (valor > 0) {
                resultados.push({
                    fornecedor,
                    cpf_cnpj: cpf || '',
                    valor,
                    tipo: tipoCalculo,
                    descricao: tipoCalculo,
                    data_vencimento: ''
                })
            }
        }
    }
    
    return { tipoCalculo, dados: resultados }
}
