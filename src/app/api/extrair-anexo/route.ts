import { NextRequest, NextResponse } from 'next/server';
import { extrairDocumentoAvulso } from '@/lib/parsers/geminiExtractor';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'Leitura automática por IA não está configurada neste ambiente (GEMINI_API_KEY necessária).' },
        { status: 500 }
      );
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 });
    }

    const dados = await extrairDocumentoAvulso(file);
    return NextResponse.json({ dados });
  } catch (error) {
    console.error('[extrair-anexo] Falha ao extrair com IA:', error);
    return NextResponse.json(
      { error: 'Não foi possível ler o documento automaticamente. Preencha os campos manualmente.' },
      { status: 500 }
    );
  }
}
