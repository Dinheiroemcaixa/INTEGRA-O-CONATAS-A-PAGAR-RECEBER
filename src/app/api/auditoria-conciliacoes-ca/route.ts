import { NextRequest, NextResponse } from 'next/server';
import { executarAuditoriaConciliacoesCA } from '@/lib/auditoria-conciliacoes-ca/servico';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/auditoria-conciliacoes-ca
 * Executa auditoria 100% READ-ONLY sobre lançamentos já conciliados no Conta Azul.
 * Parâmetros de busca (Query Params):
 * - empresa_id (obrigatório): UUID da empresa
 * - data_inicio (opcional): Data de início (YYYY-MM-DD)
 * - data_fim (opcional): Data final (YYYY-MM-DD)
 * - limite (opcional): Limite de registros (padrão 1000)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const empresaId = searchParams.get('empresa_id');
    const dataInicio = searchParams.get('data_inicio') || undefined;
    const dataFim = searchParams.get('data_fim') || undefined;
    const limiteParam = searchParams.get('limite');
    const limite = limiteParam ? parseInt(limiteParam, 10) : 1000;

    if (!empresaId) {
      return NextResponse.json(
        { error: 'Parâmetro obrigatório ausente: empresa_id.' },
        { status: 400 }
      );
    }

    const resultado = await executarAuditoriaConciliacoesCA({
      empresaId,
      dataInicio,
      dataFim,
      limite
    });

    return NextResponse.json(resultado);
  } catch (error: any) {
    console.error('[API /api/auditoria-conciliacoes-ca] Erro na auditoria:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao processar a auditoria de conciliações.' },
      { status: 500 }
    );
  }
}
