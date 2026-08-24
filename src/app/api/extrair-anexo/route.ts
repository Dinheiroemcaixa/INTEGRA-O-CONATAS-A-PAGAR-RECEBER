import { NextRequest, NextResponse } from 'next/server';
import { extrairTextoPDF } from '@/lib/parsers/pdfExtractor';
import { extrairDadosDeTextoNativo } from '@/lib/parsers/nativeDocumentParser';
import { extrairDocumentoAvulso } from '@/lib/parsers/geminiExtractor';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 });
    }

    let dadosNativos: any = {}

    // 1. Tentar primeiro o extrator local nativo de PDF (0 chamadas de API externa)
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      try {
        const textoNativo = await extrairTextoPDF(file)
        if (textoNativo && textoNativo.trim().length > 10) {
          dadosNativos = extrairDadosDeTextoNativo(textoNativo)
        }
      } catch (errPdf) {
        console.warn('[extrair-anexo] Leitura nativa de PDF ignorada, tentando fallback IA:', errPdf)
      }
    }

    // Se a leitura nativa encontrou os dados principais (fornecedor, valor e vencimento)
    if (dadosNativos?.fornecedor || (dadosNativos?.valor && dadosNativos?.data_vencimento)) {
      return NextResponse.json({ dados: dadosNativos });
    }

    // 2. Fallback: Se o Gemini estiver configurado, usa IA para ler imagem ou PDF escaneado
    if (process.env.GEMINI_API_KEY) {
      try {
        const dadosGemini = await extrairDocumentoAvulso(file);
        const resultadoFinal = { ...dadosNativos, ...dadosGemini }
        return NextResponse.json({ dados: resultadoFinal });
      } catch (errGemini) {
        console.error('[extrair-anexo] Falha na leitura IA Gemini:', errGemini);
      }
    }

    // Retorna o que conseguiu extrair localmente ou objeto limpo sem dar erro 500
    return NextResponse.json({ dados: dadosNativos });

  } catch (error) {
    console.error('[extrair-anexo] Erro geral ao processar anexo:', error);
    return NextResponse.json(
      { error: 'Não foi possível ler o documento automaticamente. Preencha os campos manualmente.' },
      { status: 200 }
    );
  }
}
