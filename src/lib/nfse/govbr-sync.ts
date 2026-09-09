import https from 'https'
import { DOMParser } from '@xmldom/xmldom'

export interface NfseGovBrItem {
  numeroNfse: string
  chaveAcesso: string
  dataEmissao: string
  dataCompetencia: string
  clienteNome: string
  clienteCpfCnpj: string
  valorTotal: number
  aliquota: number
  descricao: string
  status: 'autorizada' | 'cancelada'
  xmlRaw?: string
}

export interface ConsultaDfeResult {
  sucesso: boolean
  notas: NfseGovBrItem[]
  mensagem?: string
  ultimoNsu?: string
}

/**
 * Realiza a consulta de DF-e de NFS-e Nacional via mTLS utilizando o certificado A1 da empresa.
 */
export async function consultarDfeGovBr(params: {
  cnpj: string
  certPem: string
  keyPem: string
  dataInicio?: string
  dataFim?: string
  nsuInicial?: string
  ambiente?: 'producao' | 'homologacao'
}): Promise<ConsultaDfeResult> {
  const { cnpj, certPem, keyPem, dataInicio, dataFim, ambiente = 'producao' } = params
  const cnpjLimpo = cnpj.replace(/\D/g, '')

  if (!cnpjLimpo) {
    return { sucesso: false, notas: [], mensagem: 'CNPJ inválido ou não informado.' }
  }

  // URLs do Ambiente Nacional da NFS-e (ADN - Ambiente de Dados Nacional da Receita Federal)
  // Produção: https://sefin.nfse.gov.br/dfe/v1/distribuicao
  // Homologação: https://sefin.producaorestrita.nfse.gov.br/dfe/v1/distribuicao
  const host = ambiente === 'homologacao' 
    ? 'sefin.producaorestrita.nfse.gov.br'
    : 'sefin.nfse.gov.br'
  
  const pathUrl = `/dfe/v1/distribuicao?cnpj=${cnpjLimpo}${dataInicio ? `&dtInicio=${dataInicio}` : ''}${dataFim ? `&dtFim=${dataFim}` : ''}`

  return new Promise((resolve) => {
    try {
      const agent = new https.Agent({
        cert: certPem,
        key: keyPem,
        rejectUnauthorized: false, // Permitir certificados de cadeia intermediária ICP-Brasil
      })

      const req = https.request({
        hostname: host,
        port: 443,
        path: pathUrl,
        method: 'GET',
        agent: agent,
        headers: {
          'Accept': 'application/json, application/xml',
          'User-Agent': 'Integracao-ERP-NFS-e/1.0',
        },
        timeout: 15000,
      }, (res) => {
        let rawData = ''
        res.on('data', (chunk) => { rawData += chunk })
        res.on('end', () => {
          try {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              const parsedNotas = parseRespostaGovBr(rawData)
              resolve({
                sucesso: true,
                notas: parsedNotas,
                mensagem: `${parsedNotas.length} notas encontradas no Gov.br.`,
              })
            } else {
              // Quando o portal nacional estiver indisponível ou retornar formato alternativo
              resolve({
                sucesso: false,
                notas: [],
                mensagem: `Gov.br retornou status ${res.statusCode}: ${rawData.substring(0, 200)}`,
              })
            }
          } catch (err: any) {
            resolve({
              sucesso: false,
              notas: [],
              mensagem: `Erro ao interpretar resposta do Gov.br: ${err.message}`,
            })
          }
        })
      })

      req.on('timeout', () => {
        req.destroy()
        resolve({
          sucesso: false,
          notas: [],
          mensagem: 'Tempo limite esgotado ao consultar os servidores do Gov.br.',
        })
      })

      req.on('error', (err) => {
        resolve({
          sucesso: false,
          notas: [],
          mensagem: `Não foi possível conectar ao portal nacional da NFS-e: ${err.message}`,
        })
      })

      req.end()
    } catch (err: any) {
      resolve({
        sucesso: false,
        notas: [],
        mensagem: `Falha na configuração SSL/mTLS com o certificado: ${err.message}`,
      })
    }
  })
}

/**
 * Faz o parser do documento retornado pelo Gov.br (JSON ou XML)
 */
function parseRespostaGovBr(rawContent: string): NfseGovBrItem[] {
  const itens: NfseGovBrItem[] = []

  // 1. Tenta parsear como JSON
  try {
    const json = JSON.parse(rawContent)
    const list = Array.isArray(json) ? json : (json.notas || json.documentos || json.dfe || [])
    for (const d of list) {
      if (d.numeroNfse || d.chaveAcesso || d.numero) {
        itens.push({
          numeroNfse: String(d.numeroNfse || d.numero || ''),
          chaveAcesso: String(d.chaveAcesso || d.chave || ''),
          dataEmissao: d.dataEmissao || d.dhEmi || new Date().toISOString(),
          dataCompetencia: d.dataCompetencia || d.dCompet || new Date().toISOString(),
          clienteNome: d.tomador?.nome || d.clienteNome || 'Cliente Não Informado',
          clienteCpfCnpj: d.tomador?.cpfCnpj || d.clienteCpfCnpj || '',
          valorTotal: Number(d.valorTotal || d.vServ || 0),
          aliquota: Number(d.aliquota || d.vAliq || 0),
          descricao: d.descricao || d.discriminacao || 'Serviços Prestados',
          status: d.cancelada ? 'cancelada' : 'autorizada',
          xmlRaw: d.xml || undefined,
        })
      }
    }
    if (itens.length > 0) return itens
  } catch {
    // Não é JSON, tenta parsear como XML
  }

  // 2. Tenta parsear como XML
  try {
    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(rawContent, 'text/xml')
    const nfseNodes = xmlDoc.getElementsByTagName('NFSe') || xmlDoc.getElementsByTagName('CompNfse')

    for (let i = 0; i < nfseNodes.length; i++) {
      const node = nfseNodes[i]
      const getVal = (tagName: string) => {
        const el = node.getElementsByTagName(tagName)[0]
        return el ? el.textContent || '' : ''
      }

      const num = getVal('nNFSe') || getVal('Numero') || getVal('nDPS')
      const chave = getVal('chNFSe') || getVal('Id') || `NFS${Date.now()}${i}`
      const dtEmi = getVal('dhEmi') || getVal('DataEmissao') || new Date().toISOString()
      const dtComp = getVal('dCompet') || getVal('Competencia') || dtEmi
      const tomadorNome = getVal('xNome') || getVal('RazaoSocial') || 'Cliente'
      const tomadorDoc = getVal('CNPJ') || getVal('CPF') || ''
      const vServ = parseFloat(getVal('vServ') || getVal('ValorServicos') || '0')
      const vAliq = parseFloat(getVal('pAliq') || getVal('Aliquota') || '0')
      const desc = getVal('xDisc') || getVal('Discriminacao') || 'Serviços'

      if (num || chave) {
        itens.push({
          numeroNfse: num || `${i + 1}`,
          chaveAcesso: chave,
          dataEmissao: dtEmi,
          dataCompetencia: dtComp,
          clienteNome: tomadorNome,
          clienteCpfCnpj: tomadorDoc,
          valorTotal: isNaN(vServ) ? 0 : vServ,
          aliquota: isNaN(vAliq) ? 0 : vAliq,
          descricao: desc,
          status: 'autorizada',
          xmlRaw: node.toString(),
        })
      }
    }
  } catch {
    // Silêncio se XML for inválido
  }

  return itens
}
