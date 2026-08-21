import { GoogleGenerativeAI } from '@google/generative-ai'

export interface ItemDDA {
  beneficiario: string
  documento: string
  cpf_cnpj: string
  valor: number
  data_vencimento: string
}

export interface ItemFolha {
  fornecedor: string
  cpf_cnpj: string
  valor: number
  tipo: string
  descricao: string
  data_vencimento: string
}

export interface ItemAvulso {
  fornecedor: string
  descricao: string
  documento: string
  data_vencimento: string
  data_documento: string
  valor: number
  categoria: string
  tipo: string
  chave_pix: string
  codigo_barras: string
}

const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite'

async function fileParaBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  const buffer = Buffer.from(await file.arrayBuffer())
  return {
    base64: buffer.toString('base64'),
    mimeType: file.type || 'application/octet-stream',
  }
}

function extrairJSON(texto: string): any {
  const limpo = texto.replace(/```json/gi, '').replace(/```/g, '').trim()

  const idxColchete = limpo.indexOf('[')
  const idxChave = limpo.indexOf('{')

  let inicio: number
  if (idxColchete === -1) {
    inicio = idxChave
  } else if (idxChave === -1) {
    inicio = idxColchete
  } else {
    inicio = Math.min(idxColchete, idxChave)
  }

  const fim = Math.max(limpo.lastIndexOf(']'), limpo.lastIndexOf('}'))

  if (inicio === -1 || fim === -1 || fim < inicio) {
    throw new Error('Resposta da IA não contém JSON reconhecível: ' + limpo.slice(0, 200))
  }

  const jsonStr = limpo.slice(inicio, fim + 1)
  return JSON.parse(jsonStr)
}

function getModel() {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY não configurada.')
  }
  const genAI = new GoogleGenerativeAI(apiKey)
  return genAI.getGenerativeModel({ model: MODEL_NAME })
}

export async function extrairDDAComGemini(file: File): Promise<ItemDDA[]> {
  const { base64, mimeType } = await fileParaBase64(file)
  const model = getModel()

  const prompt = `Você é um especialista em ler boletos e telas de "Inclusão de pagamento"/DDA de bancos brasileiros (Itaú e outros).
Analise o documento anexado (pode ser uma foto, print de tela ou PDF) e extraia TODOS os pagamentos/boletos listados nele.

Para cada pagamento, devolva um objeto com exatamente estes campos:
- "beneficiario": nome do beneficiário/fornecedor (razão social, se disponível)
- "documento": número do documento/nota fiscal (ex: "NF 3224" ou o número do boleto). Se não houver, use "S/N"
- "cpf_cnpj": CNPJ ou CPF formatado (ex: "29.563.201/0001-89"). Deixe "" se não encontrar
- "valor": valor numérico, usando PONTO como separador decimal, sem "R$" e sem separador de milhar (ex: 1384.48)
- "data_vencimento": data de vencimento no formato "AAAA-MM-DD"

Responda APENAS com um array JSON válido, sem nenhum texto antes ou depois, sem markdown. Exemplo do formato exato:
[{"beneficiario":"GOMMA PNEUS LTDA","documento":"5961443","cpf_cnpj":"29.563.201/0001-89","valor":1384.48,"data_vencimento":"2026-07-30"}]

Se não conseguir identificar nenhum pagamento no documento, responda: []`

  const result = await model.generateContent([
    { text: prompt },
    { inlineData: { mimeType, data: base64 } },
  ])

  const texto = result.response.text()
  const dados = extrairJSON(texto)

  if (!Array.isArray(dados)) {
    throw new Error('IA não devolveu uma lista de pagamentos (DDA).')
  }

  return dados
    .map((item: any) => ({
      beneficiario: String(item.beneficiario || 'Não identificado').trim(),
      documento: String(item.documento || 'S/N').trim(),
      cpf_cnpj: String(item.cpf_cnpj || '').trim(),
      valor: Number(item.valor) || 0,
      data_vencimento: String(item.data_vencimento || '').trim(),
    }))
    .filter((item: ItemDDA) => item.valor > 0)
}

export async function extrairFolhaComGemini(
  file: File
): Promise<{ tipoCalculo: string; dados: ItemFolha[] }> {
  const { base64, mimeType } = await fileParaBase64(file)
  const model = getModel()

  const prompt = `Você é um especialista em ler relatórios de folha de pagamento / relação de líquidos de empresas brasileiras.
Analise o documento anexado (pode ser uma foto, print de tela ou PDF) e extraia TODOS os empregados/pagamentos listados nele.

Primeiro identifique o tipo de cálculo do documento: se mencionar "Adiantamento", use "Adiantamento". Caso contrário, use "Folha Mensal".

Para cada empregado, devolva um objeto com exatamente estes campos:
- "fornecedor": nome completo do empregado
- "cpf_cnpj": CPF formatado (ex: "010.866.866-59"). Deixe "" se não encontrar
- "valor": valor líquido numérico, usando PONTO como separador decimal, sem "R$" e sem separador de milhar
- "tipo": o tipo de cálculo identificado ("Folha Mensal" ou "Adiantamento")
- "descricao": igual ao campo "tipo"

Ignore linhas de total, cabeçalho ou rodapé (como "Total", "Estagiários", "Contribuintes", "Líquidos", "Empresa:").

Responda APENAS com um array JSON válido, sem texto antes ou depois, sem markdown. Exemplo:
[{"fornecedor":"ANDRE LUIS DOS SANTOS GOMES","cpf_cnpj":"010.866.866-59","valor":788.84,"tipo":"Folha Mensal","descricao":"Folha Mensal"}]

Se não conseguir identificar nenhum empregado, responda: []`

  const result = await model.generateContent([
    { text: prompt },
    { inlineData: { mimeType, data: base64 } },
  ])

  const texto = result.response.text()
  const dados = extrairJSON(texto)

  if (!Array.isArray(dados)) {
    throw new Error('IA não devolveu uma lista de empregados (Folha).')
  }

  let tipoCalculo = 'Folha Mensal'
  if (dados.length > 0 && dados[0].tipo) {
    tipoCalculo = String(dados[0].tipo)
  }

  const itens: ItemFolha[] = dados
    .map((item: any) => ({
      fornecedor: String(item.fornecedor || '').trim(),
      cpf_cnpj: String(item.cpf_cnpj || '').trim(),
      valor: Number(item.valor) || 0,
      tipo: String(item.tipo || tipoCalculo).trim(),
      descricao: String(item.descricao || item.tipo || tipoCalculo).trim(),
      data_vencimento: '',
    }))
    .filter((item: ItemFolha) => item.fornecedor && item.valor > 0)

  return { tipoCalculo, dados: itens }
}

function normalizarItemAvulso(item: any): ItemAvulso {
  return {
    fornecedor: String(item?.fornecedor || '').trim(),
    descricao: String(item?.descricao || '').trim(),
    documento: String(item?.documento || '').trim(),
    data_vencimento: String(item?.data_vencimento || '').trim(),
    data_documento: String(item?.data_documento || '').trim(),
    valor: Number(item?.valor) || 0,
    categoria: String(item?.categoria || '').trim(),
    tipo: String(item?.tipo || 'Outros').trim(),
    chave_pix: String(item?.chave_pix || '').trim(),
    codigo_barras: String(item?.codigo_barras || '').replace(/[^0-9]/g, '').trim(),
  }
}

export async function extrairDocumentoAvulso(file: File): Promise<ItemAvulso> {
  const { base64, mimeType } = await fileParaBase64(file)
  const model = getModel()

  const prompt = `Você é um especialista em ler documentos financeiros brasileiros: boletos, guias de imposto (DAS, DARF, GPS, FGTS, ICMS, ISS etc.), taxas, notas fiscais e comprovantes de pagamento.
Analise o documento anexado (imagem ou PDF) e extraia os dados do pagamento principal desse documento.

Devolva um objeto JSON com exatamente estes campos:
- "fornecedor": nome do beneficiário/fornecedor a quem o pagamento se destina
- "descricao": uma descrição curta do que é esse pagamento
- "documento": o número do documento/boleto/nota fiscal impresso nele. Deixe "" se não encontrar
- "data_vencimento": data de vencimento no formato "AAAA-MM-DD"
- "data_documento": a "data do documento" ou "data de emissão" impressa nele, no formato "AAAA-MM-DD". Deixe "" se não encontrar
- "valor": valor numérico total a pagar, usando PONTO como separador decimal, sem "R$" e sem separador de milhar
- "categoria": uma sugestão curta de categoria ("Impostos", "Fornecedores", "Salários", "Taxas", "Aluguel", "Outros")
- "tipo": o meio de pagamento identificado ("PIX", "Boleto", "TED", "Folha", "Imposto", "Outros")
- "chave_pix": se o documento tiver uma chave PIX visível. Caso contrário, deixe ""
- "codigo_barras": o código de barras ou a linha digitável do boleto/guia (apenas números). Se não houver, deixe ""

Responda APENAS com um objeto JSON válido, sem texto antes ou depois, sem markdown.`

  const result = await model.generateContent([
    { text: prompt },
    { inlineData: { mimeType, data: base64 } },
  ])

  const texto = result.response.text()
  const dados = extrairJSON(texto)
  const item = Array.isArray(dados) ? dados[0] : dados

  return normalizarItemAvulso(item)
}
