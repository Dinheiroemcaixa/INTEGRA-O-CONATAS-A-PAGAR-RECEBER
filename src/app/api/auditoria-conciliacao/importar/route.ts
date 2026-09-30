import { NextRequest, NextResponse } from 'next/server';
import { processarExtratoBancario } from '@/lib/auditoria-conciliacao/extrato-parser';
import { isAuditoriaConciliacaoHabilitada } from '@/lib/auditoria-conciliacao/feature-flags';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/auditoria-conciliacao/importar
 * 
 * Recebe arquivo de extrato bancário (Excel .xlsx/.xls ou CSV via multipart/form-data),
 * valida kill switch, sanitiza descrições, calcula SHA-256 e extrai transações canônicas.
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Verificação do Kill Switch Persistido
    const habilitado = await isAuditoriaConciliacaoHabilitada();
    if (!habilitado) {
      return NextResponse.json(
        { erro: 'O módulo de Auditoria de Conciliação Bancária está desativado pelo administrador via Kill Switch.' },
        { status: 503 }
      );
    }

    const formData = await req.formData();
    const arquivo = formData.get('arquivo') as File | null;
    const empresaId = formData.get('empresaId') as string | null;
    const bancoNome = formData.get('bancoNome') as string | undefined;

    if (!arquivo) {
      return NextResponse.json({ erro: 'Nenhum arquivo enviado.' }, { status: 400 });
    }

    if (!empresaId) {
      return NextResponse.json({ erro: 'ID da empresa é obrigatório.' }, { status: 400 });
    }

    const nomeArquivo = arquivo.name;

    // 2. Conversão para Buffer e Parsing Canônico
    const arrayBuffer = await arquivo.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const resultadoParsing = await processarExtratoBancario(buffer, nomeArquivo, bancoNome);

    if (!resultadoParsing.sucesso || resultadoParsing.transacoes.length === 0) {
      return NextResponse.json(
        { erro: resultadoParsing.erro || 'Nenhuma transação financeira válida foi identificada no arquivo de extrato fornecido.' },
        { status: 422 }
      );
    }

    // 3. Retorno do Preview Estruturado
    return NextResponse.json({
      sucesso: true,
      arquivo: {
        nome: resultadoParsing.arquivoNome,
        formato: resultadoParsing.formato,
        tamanhoBytes: resultadoParsing.arquivoTamanho,
        hashSha256: resultadoParsing.arquivoHash
      },
      resumo: {
        totalTransacoes: resultadoParsing.totalTransacoes,
        totalDebitos: resultadoParsing.totalDebitos,
        totalCreditos: resultadoParsing.totalCreditos,
        valorTotalDebitos: resultadoParsing.valorTotalDebitos,
        valorTotalCreditos: resultadoParsing.valorTotalCreditos,
        periodoInicio: resultadoParsing.periodoInicio,
        periodoFim: resultadoParsing.periodoFim
      },
      preview: resultadoParsing.transacoes.slice(0, 15),
      transacoes: resultadoParsing.transacoes
    });

  } catch (error: any) {
    console.error('[API /auditoria-conciliacao/importar] Erro na importação:', error);
    return NextResponse.json(
      { erro: error?.message || 'Falha ao processar arquivo de extrato bancário.' },
      { status: 500 }
    );
  }
}
