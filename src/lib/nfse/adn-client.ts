/**
 * Cliente HTTP REST com mTLS para o Ambiente de Dados Nacional (ADN) da NFS-e
 * Receita Federal / Comitê Gestor da NFS-e
 */
import https from 'https'
import zlib from 'zlib'

export interface TransmitirDpsParams {
  dpsXmlAssinado: string
  certPem: string
  keyPem: string
  ambiente?: 'homologacao' | 'producao'
  timeoutMs?: number
}

export interface AdnRespostaEmissao {
  sucesso: boolean
  chaveAcesso?: string
  numeroNfse?: string
  codigoVerificacao?: string
  dataEmissao?: string
  xmlNfse?: string
  mensagem?: string
  statusCode?: number
  erros?: Array<{ codigo: string; mensagem: string; correcao?: string }>
  rawResponse?: string
}

/**
 * Compacta o XML assinado da DPS em formato GZIP e converte para Base64
 * exigido pelo protocolo oficial do ADN (campo dpsXmlGZipB64).
 */
export function compactarDpsGzipBase64(xmlString: string): string {
  const bufferXml = Buffer.from(xmlString, 'utf8')
  const bufferGzip = zlib.gzipSync(bufferXml)
  return bufferGzip.toString('base64')
}

/**
 * Descompacta uma string GZIP Base64 retornada pelo ADN
 */
export function descompactarGzipBase64(base64String: string): string {
  try {
    const bufferGzip = Buffer.from(base64String, 'base64')
    const bufferXml = zlib.gunzipSync(bufferGzip)
    return bufferXml.toString('utf8')
  } catch (err) {
    // Se não for gzip válido, pode já ser texto puro
    return base64String
  }
}

/**
 * Transmite a DPS assinada para o Ambiente Nacional da NFS-e via mTLS.
 */
export async function transmitirDpsAdn(params: TransmitirDpsParams): Promise<AdnRespostaEmissao> {
  const {
    dpsXmlAssinado,
    certPem,
    keyPem,
    ambiente = 'homologacao',
    timeoutMs = 25000
  } = params

  if (!dpsXmlAssinado) {
    return { sucesso: false, mensagem: 'XML da DPS assinado não foi fornecido.' }
  }
  if (!certPem || !keyPem) {
    return { sucesso: false, mensagem: 'Certificado digital e chave privada são obrigatórios para mTLS.' }
  }

  // Hosts Oficiais do Ambiente Nacional da NFS-e
  const host = ambiente === 'homologacao'
    ? 'adn.producaorestrita.nfse.gov.br'
    : 'adn.nfse.gov.br'

  // Endpoint oficial de recepção de DPS
  const pathUrl = '/contribuintes/v1/nfse'

  // Prepara o payload JSON com o XML compactado em GZIP e codificado em Base64
  const dpsXmlGZipB64 = compactarDpsGzipBase64(dpsXmlAssinado)
  const requestBody = JSON.stringify({
    dpsXmlGZipB64
  })

  return new Promise((resolve) => {
    try {
      // Agente mTLS com autenticação mútua via Certificado Digital ICP-Brasil A1
      const agent = new https.Agent({
        cert: certPem,
        key: keyPem,
        rejectUnauthorized: false, // Permite cadeias intermediárias da ICP-Brasil
      })

      const req = https.request({
        hostname: host,
        port: 443,
        path: pathUrl,
        method: 'POST',
        agent,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Content-Length': Buffer.byteLength(requestBody),
          'User-Agent': 'ConnectaAI-NFS-e/1.0',
        },
        timeout: timeoutMs,
      }, (res) => {
        let responseData = ''
        res.on('data', (chunk) => { responseData += chunk })
        res.on('end', () => {
          const status = res.statusCode || 500
          try {
            // Tenta interpretar o retorno JSON da Receita Federal
            let jsonRes: any = null
            try {
              jsonRes = JSON.parse(responseData)
            } catch {
              // Resposta não é JSON
            }

            if (status >= 200 && status < 300) {
              // Sucesso na emissão da NFS-e
              const chaveAcesso = jsonRes?.chaveAcesso || jsonRes?.chNFSe || jsonRes?.chave || ''
              const numeroNfse = String(jsonRes?.numeroNfse || jsonRes?.numero || jsonRes?.nNFSe || '')
              const codigoVerificacao = jsonRes?.codigoVerificacao || ''
              
              // Se o XML da NFS-e vier compactado no campo nfseXmlGZipB64
              let xmlNfse = jsonRes?.xml || ''
              if (jsonRes?.nfseXmlGZipB64) {
                xmlNfse = descompactarGzipBase64(jsonRes.nfseXmlGZipB64)
              }

              resolve({
                sucesso: true,
                statusCode: status,
                chaveAcesso,
                numeroNfse,
                codigoVerificacao,
                dataEmissao: jsonRes?.dataEmissao || new Date().toISOString(),
                xmlNfse: xmlNfse || dpsXmlAssinado,
                mensagem: jsonRes?.mensagem || `NFS-e #${numeroNfse} autorizada com sucesso pelo ADN.`,
                rawResponse: responseData
              })
            } else {
              // Rejeição ou Erro da Receita Federal
              let msgErro = `Erro HTTP ${status} retornado pelo ADN.`
              const listaErros: Array<{ codigo: string; mensagem: string; correcao?: string }> = []

              if (jsonRes?.erros && Array.isArray(jsonRes.erros)) {
                jsonRes.erros.forEach((e: any) => {
                  listaErros.push({
                    codigo: e.codigo || '',
                    mensagem: e.mensagem || e.descricao || '',
                    correcao: e.correcao || ''
                  })
                })
                msgErro = listaErros.map(e => `[${e.codigo}] ${e.mensagem}`).join('; ')
              } else if (jsonRes?.mensagem) {
                msgErro = jsonRes.mensagem
              } else if (responseData) {
                msgErro = responseData.slice(0, 300)
              }

              resolve({
                sucesso: false,
                statusCode: status,
                mensagem: msgErro,
                erros: listaErros,
                rawResponse: responseData
              })
            }
          } catch (parseErr: any) {
            resolve({
              sucesso: false,
              statusCode: status,
              mensagem: `Falha ao processar retorno do ADN: ${parseErr.message}`,
              rawResponse: responseData
            })
          }
        })
      })

      req.on('timeout', () => {
        req.destroy()
        resolve({
          sucesso: false,
          mensagem: `Tempo limite de conexão (${timeoutMs / 1000}s) esgotado com o servidor do ADN (${host}).`
        })
      })

      req.on('error', (reqErr: any) => {
        resolve({
          sucesso: false,
          mensagem: `Falha de comunicação mTLS com o ADN (${host}): ${reqErr.message}`
        })
      })

      // Envia o payload
      req.write(requestBody)
      req.end()

    } catch (agentErr: any) {
      resolve({
        sucesso: false,
        mensagem: `Erro ao inicializar conexão segura mTLS: ${agentErr.message}`
      })
    }
  })
}
