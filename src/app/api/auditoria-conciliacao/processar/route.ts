import { NextRequest, NextResponse } from 'next/server';
import { isAuditoriaConciliacaoHabilitada } from '@/lib/auditoria-conciliacao/feature-flags';
import { sincronizarLancamentosContaAzul } from '@/lib/auditoria-conciliacao/sincronizador';
import { MotorMatching } from '@/lib/auditoria-conciliacao/motor-matching';
import { PersistenciaAuditoria } from '@/lib/auditoria-conciliacao/persistencia-auditoria';
import { TransacaoExtratoCanonica, FormatoArquivoExtrato } from '@/lib/auditoria-conciliacao/tipos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RequestProcessamentoAuditoria {
  empresaId: string;
  contaFinanceiraId: string;
  bancoNome: string;
  arquivoNome: string;
  arquivoTipo: FormatoArquivoExtrato;
  arquivoHash: string;
  arquivoTamanho?: number;
  periodoInicio: string;
  periodoFim: string;
  transacoes: TransacaoExtratoCanonica[];
  toleranciaDias?: number;
  toleranciaValorCentavos?: number;
  somenteCache?: boolean;
  orcamentoRequisicoes?: number;
  forcarReprocessamento?: boolean;
}

export async function POST(req: NextRequest) {
  try {
    // 1. Verificação de Kill Switch
    const habilitado = await isAuditoriaConciliacaoHabilitada();
    if (!habilitado) {
      return NextResponse.json(
        { erro: 'O módulo de Auditoria de Conciliação Bancária está desativado pelo administrador via Kill Switch.' },
        { status: 503 }
      );
    }

    const body = (await req.json()) as RequestProcessamentoAuditoria;

    if (!body.empresaId || !body.contaFinanceiraId || !body.arquivoHash || !body.transacoes?.length) {
      return NextResponse.json(
        { erro: 'Parâmetros obrigatórios ausentes: empresaId, contaFinanceiraId, arquivoHash e transacoes.' },
        { status: 400 }
      );
    }

    const persistencia = new PersistenciaAuditoria();

    // 2. Verificação de Idempotência (Hash do Arquivo)
    if (!body.forcarReprocessamento) {
      const sessaoExistente = await persistencia.buscarSessaoPorHash(body.empresaId, body.arquivoHash);
      if (sessaoExistente) {
        return NextResponse.json({
          aviso: 'Este arquivo de extrato já foi auditado para esta empresa.',
          sessaoId: sessaoExistente.id,
          statusAuditoria: sessaoExistente.statusAuditoria,
          jaProcessado: true
        });
      }
    }

    // 3. Sincronização Segura e Somente-Leitura com a API Conta Azul
    console.log(`[API /auditoria-conciliacao/processar] Sincronizando ERP para conta ${body.contaFinanceiraId} (${body.periodoInicio} a ${body.periodoFim})...`);
    
    let caItens: any[] = [];
    try {
      caItens = await sincronizarLancamentosContaAzul(
        body.empresaId,
        body.contaFinanceiraId,
        body.periodoInicio,
        body.periodoFim,
        {
          modoCacheOnly: body.somenteCache ?? false,
          limiteRequisicoes: body.orcamentoRequisicoes ?? 60
        }
      );
    } catch (syncError: any) {
      console.warn('[API /auditoria-conciliacao/processar] Aviso na sincronização Conta Azul:', syncError?.message);
      // Se falhar e não for erro fatal de validação, continua com os lançamentos disponíveis do cache
    }

    // 4. Execução do Motor de Matching O(N)
    console.log(`[API /auditoria-conciliacao/processar] Executando cruzamento analítico (${body.transacoes.length} extrato x ${caItens.length} ERP)...`);
    const motor = new MotorMatching();
    const resultadoMatching = motor.executarCruzamento(body.transacoes, caItens, {
      toleranciaDias: body.toleranciaDias ?? 3,
      toleranciaValorCentavos: body.toleranciaValorCentavos ?? 0.05
    });

    // 5. Persistência Atômica no Supabase em Lotes
    const { sessaoId, totalItensGravados } = await persistencia.salvarSessaoEItens(
      {
        empresaId: body.empresaId,
        contaFinanceiraId: body.contaFinanceiraId,
        bancoNome: body.bancoNome || 'Conta Financeira',
        arquivoNome: body.arquivoNome,
        arquivoTipo: body.arquivoTipo,
        arquivoHash: body.arquivoHash,
        arquivoTamanho: body.arquivoTamanho,
        periodoInicio: body.periodoInicio,
        periodoFim: body.periodoFim
      },
      resultadoMatching
    );

    return NextResponse.json({
      sucesso: true,
      sessaoId,
      totalItensGravados,
      totalContaAzulConsultado: caItens.length,
      kpis: resultadoMatching.kpis
    });

  } catch (error: any) {
    console.error('[API /auditoria-conciliacao/processar] Falha ao processar conciliação:', error);
    return NextResponse.json(
      { erro: error?.message || 'Falha ao processar e salvar auditoria de conciliação bancária.' },
      { status: 500 }
    );
  }
}
