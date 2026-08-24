import { parseCurrency, parseDate } from '../utils'

export interface DadosDocumentoExtraido {
  fornecedor?: string
  descricao?: string
  data_vencimento?: string
  data_pagamento?: string
  data_documento?: string
  valor?: number
  categoria?: string
  tipo?: string
  chave_pix?: string
  codigo_barras?: string
  documento?: string
}

/**
 * Leitor especializado para texto nativo extraído de PDFs (GFD - FGTS Digital, GRRF, DAS, DARF, Boletos)
 */
export function extrairDadosDeTextoNativo(texto: string): DadosDocumentoExtraido {
  const res: DadosDocumentoExtraido = {}
  const textoUpper = texto.toUpperCase()
  const hoje = new Date().toISOString().split('T')[0]

  res.data_pagamento = hoje
  res.data_documento = hoje

  // ─── 1. GUIA DO FGTS DIGITAL (GFD) / GRRF / FGTS RESCISÓRIO ───────────────────
  if (textoUpper.includes('FGTS DIGITAL') || textoUpper.includes('GFD - GUIA') || textoUpper.includes('FUNDO DE GARANTIA DO TEMPO DE SERVICO') || textoUpper.includes('GRRF')) {
    res.tipo = 'PIX'

    // a) Verificar se é FGTS Rescisório / GRRF / Indenização Compensatória
    const ehRescisorio = textoUpper.includes('GRRF') || 
                         textoUpper.includes('FGTS RESCISORIO') || 
                         textoUpper.includes('INDENIZACAO COMPENSATORIA') || 
                         textoUpper.includes('INDENIZAÇÃO COMPENSATÓRIA')

    // b) Extrair a Tag do Colaborador (ex: Tag GRRF - LEANDRO LIMA DE OLIVEIRA)
    const matchTag = texto.match(/Tag[\s\S]*?GRRF\s*[\:\-]?\s*([A-ZÀ-Ú\s]{3,60})/i) ||
                     texto.match(/Tag\s*[\:\-]?\s*([A-ZÀ-Ú\s]{3,60})/i) ||
                     texto.match(/GRRF\s*[\:\-]?\s*([A-ZÀ-Ú\s]{3,60})/i)

    let nomeColaborador = ''
    if (matchTag && matchTag[1]) {
      nomeColaborador = matchTag[1]
        .replace(/^GRRF\s*[\:\-]?\s*/i, '')
        .split('\n')[0]
        .replace(/PAGAR ESTE DOCUMENTO.*/i, '')
        .replace(/VALOR A RECOLHER.*/i, '')
        .replace(/COMPOSIÇÃO DO DOCUMENTO.*/i, '')
        .trim()
        .toUpperCase()
    }

    if (ehRescisorio) {
      res.categoria = 'Multa de FGTS'
      if (nomeColaborador) {
        res.fornecedor = nomeColaborador
        res.descricao = `RESCISÃO - ${nomeColaborador}`
      } else {
        const matchEmpregador = texto.match(/Nome\/Razão Social do Empregador\s*\n?\s*([^\n]+)/i) ||
                                texto.match(/Empregador\s*\n?\s*([^\n]+)/i)
        const empregador = matchEmpregador ? matchEmpregador[1].trim().toUpperCase() : 'FGTS'
        res.fornecedor = empregador
        res.descricao = `FGTS RESCISÓRIO - ${empregador}`
      }
    } else {
      res.categoria = 'FGTS'
      const matchEmpregador = texto.match(/Nome\/Razão Social do Empregador\s*\n?\s*([^\n]+)/i) ||
                              texto.match(/Empregador\s*\n?\s*([^\n]+)/i)
      const empregador = matchEmpregador ? matchEmpregador[1].trim().toUpperCase() : 'FGTS'
      res.fornecedor = empregador
      
      const matchComp = texto.match(/Competência\s*\n?\s*(\d{2}\/\d{4})/i) || texto.match(/(\d{2}\/\d{4})/)
      const comp = matchComp ? matchComp[1] : ''
      res.descricao = comp ? `FGTS MENSAL - ${comp}` : `FGTS MENSAL - ${empregador}`
    }

    // c) Vencimento: "Pagar este documento até 26/08/2026"
    const matchVenc = texto.match(/Pagar este documento até\s*\n?\s*(\d{2}\/\d{2}\/\d{4})/i) ||
                      texto.match(/Vencimento\s*[\:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i) ||
                      texto.match(/(\d{2}\/\d{2}\/\d{4})/)
    if (matchVenc) {
      res.data_vencimento = parseDate(matchVenc[1]) || matchVenc[1].split('/').reverse().join('-')
    }

    // d) Valor a recolher: "Valor a recolher 3.846,47" ou "Total da Guia: 3.846,47"
    const matchValor = texto.match(/Valor a recolher\s*\n?\s*([0-9\.\,]+)/i) ||
                       texto.match(/Total da Guia\s*[\:\-]?\s*([0-9\.\,]+)/i) ||
                       texto.match(/(?:R\$)?\s*([0-9]{1,3}(?:\.[0-9]{3})*\,[0-9]{2})/)
    if (matchValor) {
      res.valor = parseCurrency(matchValor[1])
    }

    // e) PIX Copia e Cola / Payload Location (colocar em codigo_barras e chave_pix)
    const matchPix = texto.match(/(000201010212[^\s\n]+)/) ||
                     texto.match(/(pix-qrcode\.caixa\.gov\.br[^\s\n]+)/)
    if (matchPix) {
      res.codigo_barras = matchPix[1]
      res.chave_pix = matchPix[1]
    }

    return res
  }

  // ─── 2. GUIA DE IMPOSTO GERAL (DAS, DARF, SIMPLES NACIONAL) ───────────────────
  if (textoUpper.includes('DAS') || textoUpper.includes('SIMPLES NACIONAL') || textoUpper.includes('DARF') || textoUpper.includes('MINISTÉRIO DA FAZENDA')) {
    res.tipo = 'Imposto'
    res.categoria = 'Impostos'

    if (textoUpper.includes('DAS') || textoUpper.includes('SIMPLES NACIONAL')) {
      res.fornecedor = 'RECEITA FEDERAL / DAS'
      const matchComp = texto.match(/Apuração\s*[\:\-]?\s*(\d{2}\/\d{4})/i) || texto.match(/(\d{2}\/\d{4})/)
      res.descricao = matchComp ? `DAS - SIMPLES NACIONAL ${matchComp[1]}` : 'DAS - SIMPLES NACIONAL'
    } else {
      res.fornecedor = 'RECEITA FEDERAL / DARF'
      res.descricao = 'DARF - IMPOSTO FEDERAL'
    }

    const matchVenc = texto.match(/Pagar até\s*\n?\s*(\d{2}\/\d{2}\/\d{4})/i) ||
                      texto.match(/Data de Vencimento\s*\n?\s*(\d{2}\/\d{2}\/\d{4})/i) ||
                      texto.match(/Vencimento\s*[\:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i)
    if (matchVenc) {
      res.data_vencimento = parseDate(matchVenc[1]) || matchVenc[1].split('/').reverse().join('-')
    }

    const matchValor = texto.match(/Valor Total\s*\n?\s*([0-9\.\,]+)/i) ||
                       texto.match(/Valor a Pagar\s*\n?\s*([0-9\.\,]+)/i) ||
                       texto.match(/(?:R\$)?\s*([0-9]{1,3}(?:\.[0-9]{3})*\,[0-9]{2})/)
    if (matchValor) {
      res.valor = parseCurrency(matchValor[1])
    }

    const matchLinha = texto.match(/(\d{5}\.\d{5}\s+\d{5}\.\d{6}\s+\d{5}\.\d{6}\s+\d\s+\d{14})/) ||
                       texto.match(/(\d{47,48})/)
    if (matchLinha) {
      res.codigo_barras = matchLinha[1].replace(/\s+/g, '')
    }

    return res
  }

  // ─── 3. BOLETOS BANCÁRIOS (GERAL) ───────────────────
  const matchLinhaDigitavel = texto.match(/(\d{5}\.\d{5}\s+\d{5}\.\d{6}\s+\d{5}\.\d{6}\s+\d\s+\d{14})/) ||
                              texto.match(/(\d{47,48})/) ||
                              texto.match(/(\d{11,12}\s+\d{11,12}\s+\d{11,12}\s+\d{11,12})/)

  if (matchLinhaDigitavel) {
    res.codigo_barras = matchLinhaDigitavel[1].replace(/\s+/g, '')
    res.tipo = 'Boleto'
  }

  const matchVenc = texto.match(/Vencimento\s*[\:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i) ||
                    texto.match(/Data de Vencimento\s*[\:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i) ||
                    texto.match(/(\d{2}\/\d{2}\/\d{4})/)
  if (matchVenc) {
    res.data_vencimento = parseDate(matchVenc[1]) || matchVenc[1].split('/').reverse().join('-')
  }

  const matchValor = texto.match(/Valor do Documento\s*[\:\-]?\s*([0-9\.\,]+)/i) ||
                     texto.match(/Valor Cobrado\s*[\:\-]?\s*([0-9\.\,]+)/i) ||
                     texto.match(/(?:R\$)?\s*([0-9]{1,3}(?:\.[0-9]{3})*\,[0-9]{2})/)
  if (matchValor) {
    res.valor = parseCurrency(matchValor[1])
  }

  const matchBeneficiario = texto.match(/Beneficiário\s*[\:\-]?\s*([^\n\r]+)/i) ||
                            texto.match(/Nome do Beneficiário\s*[\:\-]?\s*([^\n\r]+)/i) ||
                            texto.match(/Cedente\s*[\:\-]?\s*([^\n\r]+)/i)
  if (matchBeneficiario) {
    res.fornecedor = matchBeneficiario[1].trim().toUpperCase()
    res.descricao = `BOLETO - ${res.fornecedor}`
  }

  return res
}
