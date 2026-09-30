import { NextRequest, NextResponse } from 'next/server';
import { isAuditoriaConciliacaoHabilitada } from '@/lib/auditoria-conciliacao/feature-flags';
import { sincronizarLancamentosContaAzul } from '@/lib/auditoria-conciliacao/sincronizador';
import { invalidarCacheContaAzul } from '@/lib/auditoria-conciliacao/cache';
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
  ignorarCache?: boolean;
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
    const sessaoExistente = await persistencia.buscarSessaoPorHash(body.empresaId, body.arquivoHash);
    if (sessaoExistente && !body.forcarReprocessamento) {
      return NextResponse.json({
        aviso: 'Este arquivo de extrato já foi auditado para esta empresa.',
        sessaoId: sessaoExistente.id,
        statusAuditoria: sessaoExistente.statusAuditoria,
        jaProcessado: true
      });
    }

    // FASE 1: Se solicitado forçar reprocessamento ou ignorar cache, invalida o cache satélite
    const deveForcarAtualizacao = Boolean(body.forcarReprocessamento || body.ignorarCache);
    if (deveForcarAtualizacao) {
      console.log(`[API /auditoria-conciliacao/processar] Reprocessamento completo solicitado. Invalidando cache satélite para empresa ${body.empresaId}...`);
      await invalidarCacheContaAzul(body.empresaId, body.contaFinanceiraId);
    }

    // 3. Sincronização Segura e Somente-Leitura com a API Conta Azul
    console.log(`[API /auditoria-conciliacao/processar] Sincronizando ERP para conta ${body.contaFinanceiraId} (${body.periodoInicio} a ${body.periodoFim}) [forcarAtualizacao=${deveForcarAtualizacao}]...`);
    
    let caItens: any[] = [];
    try {
      caItens = await sincronizarLancamentosContaAzul(
        body.empresaId,
        body.contaFinanceiraId,
        body.periodoInicio,
        body.periodoFim,
        {
          modoCacheOnly: body.somenteCache ?? false,
          forcarAtualizacao: deveForcarAtualizacao,
          limiteRequisicoes: body.orcamentoRequisicoes ?? 60
        }
      );
    } catch (syncError: any) {
      console.warn('[API /auditoria-conciliacao/processar] Aviso na sincronização Conta Azul:', syncError?.message);
    }

    // 4. Carregar regras de De-Para (Fornecedores e Categorias)
    const supabaseAdmin = (await import('@supabase/supabase-js')).createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const mapaDeparaFornecedores = new Map<string, string>();
    const mapaDeparaCategorias = new Map<string, string>();

    try {
      const [
        { data: regrasFornEmpresa },
        { data: regrasFornGlobais },
        { data: regrasCatEmpresa }
      ] = await Promise.all([
        supabaseAdmin.from('fornecedor_depara').select('nome_original, nome_original_normalizado, nome_corrigido').eq('empresa_id', body.empresaId),
        supabaseAdmin.from('fornecedor_depara').select('nome_original, nome_original_normalizado, nome_corrigido').neq('empresa_id', body.empresaId),
        supabaseAdmin.from('fornecedor_regras').select('fornecedor_nome, categoria_nome').eq('empresa_id', body.empresaId).eq('ativo', true)
      ]);

      // Regras Globais de Fornecedor
      (regrasFornGlobais || []).forEach(r => {
        if (r.nome_original) mapaDeparaFornecedores.set(r.nome_original.trim().toUpperCase(), r.nome_corrigido.trim().toUpperCase());
        if (r.nome_original_normalizado) mapaDeparaFornecedores.set(r.nome_original_normalizado.trim().toUpperCase(), r.nome_corrigido.trim().toUpperCase());
      });

      // Regras da Empresa de Fornecedor (prioridade)
      (regrasFornEmpresa || []).forEach(r => {
        if (r.nome_original) mapaDeparaFornecedores.set(r.nome_original.trim().toUpperCase(), r.nome_corrigido.trim().toUpperCase());
        if (r.nome_original_normalizado) mapaDeparaFornecedores.set(r.nome_original_normalizado.trim().toUpperCase(), r.nome_corrigido.trim().toUpperCase());
      });

      // Regras de Categoria aprendidas
      (regrasCatEmpresa || []).forEach(r => {
        if (r.fornecedor_nome && r.categoria_nome) {
          mapaDeparaCategorias.set(r.fornecedor_nome.trim().toUpperCase(), r.categoria_nome.trim());
        }
      });
    } catch (errDepara) {
      console.warn('[API /auditoria-conciliacao/processar] Aviso ao carregar De-Para:', errDepara);
    }

    // 5. Execução do Motor de Matching O(N) com os 6 campos críticos e De-Para
    console.log(`[API /auditoria-conciliacao/processar] Executando cruzamento analítico (${body.transacoes.length} extrato x ${caItens.length} ERP | ${mapaDeparaFornecedores.size} regras Forn | ${mapaDeparaCategorias.size} regras Cat)...`);
    const motor = new MotorMatching();
    const resultadoMatching = motor.executarCruzamento(body.transacoes, caItens, {
      toleranciaDias: body.toleranciaDias ?? 3,
      toleranciaValorCentavos: body.toleranciaValorCentavos ?? 0.05,
      deparaFornecedores: mapaDeparaFornecedores,
      deparaCategorias: mapaDeparaCategorias,
      contaFinanceiraIdAuditada: body.contaFinanceiraId,
      nomeContaFinanceiraAuditada: body.bancoNome
    });

    // 6. Persistência Atômica no Supabase: Reprocessamento ou Nova Sessão
    let sessaoIdFinal: string;
    let totalGravados: number;

    if (sessaoExistente && body.forcarReprocessamento) {
      console.log(`[API /auditoria-conciliacao/processar] Atualizando sessão existente ${sessaoExistente.id} com novo resultado recalculado...`);
      const resReproc = await persistencia.reprocessarSessaoExistente(
        sessaoExistente.id,
        body.empresaId,
        resultadoMatching
      );
      sessaoIdFinal = resReproc.sessaoId;
      totalGravados = resReproc.totalItensGravados;
    } else {
      const resNova = await persistencia.salvarSessaoEItens(
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
      sessaoIdFinal = resNova.sessaoId;
      totalGravados = resNova.totalItensGravados;
    }

    return NextResponse.json({
      sucesso: true,
      sessaoId: sessaoIdFinal,
      totalItensGravados: totalGravados,
      totalContaAzulConsultado: caItens.length,
      reprocessado: Boolean(sessaoExistente && body.forcarReprocessamento),
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
