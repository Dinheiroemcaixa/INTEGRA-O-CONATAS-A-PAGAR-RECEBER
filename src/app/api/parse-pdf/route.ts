import { NextRequest, NextResponse } from 'next/server'
import { parseCurrency, parseDate } from '@/lib/utils'
import type { ContaPagarPreview, ResultadoImportacao } from '@/types'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 })
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || ''

    if (ext === 'pdf') {
      return await processarPDF(file)
    } else if (['png', 'jpg', 'jpeg', 'webp', 'bmp'].includes(ext)) {
      return await processarImagem(file)
    }

    return NextResponse.json({ error: 'Formato não suportado' }, { status: 400 })
  } catch (err) {
    console.error('[parse-pdf]', err)
    return NextResponse.json({ error: 'Erro interno ao processar arquivo' }, { status: 500 })
  }
}

async function processarPDF(file: File): Promise<NextResponse> {
  try {
    // Usar pdfjs-dist para extrair texto
    const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist')
    // @ts-expect-error - worker path
    GlobalWorkerOptions.workerSrc = false

    const buffer = await file.arrayBuffer()
    const uint8 = new Uint8Array(buffer)
    const pdf = await getDocument({ data: uint8, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true }).promise

    let textoCompleto = ''
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p)
      const content = await page.getTextContent()
      const linhas = content.items
        .map((item: unknown) => (item as { str: string }).str)
        .join(' ')
      textoCompleto += linhas + '\n'
    }

    const dados = extrairDadosDoTexto(textoCompleto)
    return NextResponse.json(dados)
  } catch (err) {
    console.error('[processarPDF]', err)
    return NextResponse.json({
      total: 0, validos: 0, invalidos: 0, dados: [],
      aviso: 'Não foi possível extrair texto do PDF automaticamente. Tente converter para Excel/CSV.'
    })
  }
}

async function processarImagem(file: File): Promise<NextResponse> {
  // Para imagens, usamos análise de texto via padrões (sem OCR externo)
  // Em produção, pode integrar Tesseract.js ou Google Vision API
  return NextResponse.json({
    total: 0,
    validos: 0,
    invalidos: 0,
    dados: [],
    aviso: 'Para imagens, recomendamos converter para Excel (.xlsx) para melhor precisão. Ou ative a integração com OCR nas configurações.',
  })
}

function extrairDadosDoTexto(texto: string): ResultadoImportacao {
  const linhas = texto.split('\n').map((l) => l.trim()).filter(Boolean)
  const dados: ContaPagarPreview[] = []

  // Padrão DataCar no PDF: NF ... FORNECEDOR ... VENCIMENTO ... VALOR
  // Regex para capturar padrões monetários e datas
  const regexValor = /R\$\s*([\d.,]+)|([\d]{1,3}(?:\.[\d]{3})*,[\d]{2})/g
  const regexData = /\b(\d{2}[\/\-]\d{2}[\/\-]\d{4}|\d{4}[\/\-]\d{2}[\/\-]\d{2})\b/g

  let linhaAtual = 0
  while (linhaAtual < linhas.length) {
    const linha = linhas[linhaAtual]

    // Detectar linha com valor monetário (provavelmente dado de conta)
    const valoresMatch = [...linha.matchAll(regexValor)]
    const datasMatch = [...linha.matchAll(regexData)]

    if (valoresMatch.length > 0 || datasMatch.length > 0) {
      const valorStr = valoresMatch[0]?.[1] || valoresMatch[0]?.[2] || ''
      const dataStr = datasMatch[0]?.[1] || ''
      const valor = parseCurrency(valorStr)
      const vencimento = parseDate(dataStr)

      // Tentar encontrar fornecedor nas linhas próximas
      let fornecedor = ''
      for (let j = Math.max(0, linhaAtual - 3); j <= linhaAtual; j++) {
        const l = linhas[j]
        if (l.length > 5 && !/^\d+$/.test(l) && !l.includes('R$')) {
          fornecedor = l.substring(0, 60).trim()
        }
      }

      if (valor > 0 && fornecedor) {
        const erros: string[] = []
        if (!vencimento) erros.push('Vencimento não identificado — verifique manualmente')
        dados.push({
          fornecedor,
          valor,
          vencimento: vencimento || '',
          valido: erros.length === 0,
          erros: erros.length > 0 ? erros : undefined,
          linha_original: `Linha ~${linhaAtual + 1}`,
        })
      }
    }
    linhaAtual++
  }

  return {
    total: dados.length,
    validos: dados.filter((d) => d.valido).length,
    invalidos: dados.filter((d) => !d.valido).length,
    dados,
  }
}
