import { NextRequest, NextResponse } from 'next/server';
import { parseDDAFromOCR, parseFolhaFromOCR } from '@/lib/parsers/ocrParsers';
import { extrairDDAComGemini, extrairFolhaComGemini, ItemDDA } from '@/lib/parsers/geminiExtractor';

export const runtime = 'nodejs';
export const maxDuration = 120;

async function enriquecerBeneficiariosPorCnpj(dados: ItemDDA[]): Promise<ItemDDA[]> {
  const regexCnpjDoc = /(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/

  const cnpjsUnicos = new Set<string>()
  for (const item of dados) {
    const doc = item.documento || ''
    const matchDoc = doc.match(regexCnpjDoc)
    if (matchDoc) cnpjsUnicos.add(matchDoc[1])

    if (item.cpf_cnpj) {
      const matchCpfCnpj = item.cpf_cnpj.match(regexCnpjDoc)
      if (matchCpfCnpj) cnpjsUnicos.add(matchCpfCnpj[1])
    }
  }

  const cacheCnpj: Record<string, string> = {}

  if (cnpjsUnicos.size > 0) {
    console.log(`[DDA] Consultando ${cnpjsUnicos.size} CNPJ(s)...`)
  }

  for (const item of dados) {
    let cnpjEncontrado = ''
    const doc = item.documento || ''
    const matchDoc = doc.match(regexCnpjDoc)
    if (matchDoc) cnpjEncontrado = matchDoc[1]

    if (!cnpjEncontrado && item.cpf_cnpj) {
      const matchCpf = item.cpf_cnpj.match(regexCnpjDoc)
      if (matchCpf) cnpjEncontrado = matchCpf[1]
    }

    if (cnpjEncontrado && cacheCnpj[cnpjEncontrado]) {
      item.beneficiario = cacheCnpj[cnpjEncontrado]
    }
  }

  return dados
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const tipo = formData.get('tipo') as string;

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 });
    }

    if (process.env.GEMINI_API_KEY) {
      try {
        if (tipo === 'dda') {
          const dados = await extrairDDAComGemini(file)
          const dadosEnriquecidos = await enriquecerBeneficiariosPorCnpj(dados)
          return NextResponse.json({ dados: dadosEnriquecidos, fonte: 'gemini' });
        } else {
          const resultado = await extrairFolhaComGemini(file)
          return NextResponse.json({
            dados: resultado.dados,
            tipoCalculo: resultado.tipoCalculo,
            fonte: 'gemini',
          });
        }
      } catch (geminiError) {
        console.warn('[Gemini] Falha ao extrair com IA, usando fallback OCR:', geminiError)
      }
    }

    let parsedText = ''
    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    
    if (ext === 'pdf') {
       const { extrairTextoPDF } = await import('@/lib/parsers/pdfExtractor')
       parsedText = await extrairTextoPDF(file)
    } else {
       if (!process.env.OCR_SPACE_API_KEY) {
         return NextResponse.json({ error: 'Chave GEMINI_API_KEY ou OCR_SPACE_API_KEY não configurada.' }, { status: 500 });
       }
   
       const apiFormData = new FormData();
       apiFormData.append('apikey', process.env.OCR_SPACE_API_KEY || '');
       apiFormData.append('file', file);
       apiFormData.append('language', 'por');
       apiFormData.append('isTable', 'true');
       apiFormData.append('OCREngine', '2');
       apiFormData.append('scale', 'true');
   
       const response = await fetch('https://api.ocr.space/parse/image', {
         method: 'POST',
         headers: { 'apikey': process.env.OCR_SPACE_API_KEY },
         body: apiFormData
       });
   
       if (!response.ok) {
         const errorText = await response.text();
         return NextResponse.json({ error: 'Falha ao processar arquivo.', detalhes: errorText }, { status: response.status });
       }
   
       const jsonResult = await response.json();
       parsedText = jsonResult.ParsedResults?.[0]?.ParsedText || '';
    }

    if (!parsedText.trim()) {
       return NextResponse.json({ error: 'Nenhum texto foi encontrado no arquivo.' }, { status: 400 });
    }

    try {
      if (tipo === 'dda') {
          const dados = parseDDAFromOCR(parsedText);
          const dadosEnriquecidos = await enriquecerBeneficiariosPorCnpj(dados);
          return NextResponse.json({ dados: dadosEnriquecidos, fonte: 'ocr-space' });
      } else {
          const resultado = parseFolhaFromOCR(parsedText);
          return NextResponse.json({
              dados: resultado.dados,
              tipoCalculo: resultado.tipoCalculo,
              fonte: 'ocr-space'
          });
      }
    } catch (parseError) {
      console.error('Erro ao fazer parse do texto OCR:', parseError);
      return NextResponse.json({ error: 'Falha ao estruturar os dados extraídos.' }, { status: 500 });
    }

  } catch (error) {
    console.error('Erro interno na rota do conversor:', error);
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
  }
}
