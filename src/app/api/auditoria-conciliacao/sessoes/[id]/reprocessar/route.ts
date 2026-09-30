import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isAuditoriaConciliacaoHabilitada } from '@/lib/auditoria-conciliacao/feature-flags';
import { sincronizarLancamentosContaAzul } from '@/lib/auditoria-conciliacao/sincronizador';
import { invalidarCacheContaAzul } from '@/lib/auditoria-conciliacao/cache';
import { MotorMatching } from '@/lib/auditoria-conciliacao/motor-matching';
import { PersistenciaAuditoria } from '@/lib/auditoria-conciliacao/persistencia-auditoria';
import { TransacaoExtratoCanonica } from '@/lib/auditoria-conciliacao/tipos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const habilitado = await isAuditoriaConciliacaoHabilitada();
    if (!habilitado) {
      return NextResponse.json(
        { erro: 'O módulo de Auditoria de Conciliação Bancária está desativado pelo administrador via Kill Switch.' },
        { status: 503 }
      );
    }

    const sessaoId = params.id;
    if (!sessaoId) {
      return NextResponse.json({ erro: 'ID da sessão obrigatório' }, { status: 400 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. Buscar Cabeçalho da Sessão
    const { data: sessao, error: erroSessao } = await supabaseAdmin
      .from('auditoria_conciliacao_sessoes')
      .select('*')
      .eq('id', sessaoId)
      .single();

    if (erroSessao || !sessao) {
      return NextResponse.json({ erro: 'Sessão de auditoria não encontrada' }, { status: 404 });
    }

    // 2. Buscar Todos os Itens do Extrato dessa Sessão
    const { data: itensBanco, error: erroItens } = await supabaseAdmin
      .from('auditoria_conciliacao_itens')
      .select('id, data_transacao, descricao_extrato, descricao_sanitizada, documento_extrato, tipo_transacao, valor_extrato')
      .eq('sessao_id', sessaoId)
      .order('data_transacao', { ascending: true });

    if (erroItens || !itensBanco || itensBanco.length === 0) {
      return NextResponse.json({ erro: 'Nenhuma transação encontrada nesta sessão para reprocessamento' }, { status: 400 });
    }

    // Reconstruir transações canônicas do extrato
    const transacoes: TransacaoExtratoCanonica[] = itensBanco.map(it => ({
      id: it.id,
      data: it.data_transacao,
      descricaoOriginal: it.descricao_extrato,
      descricaoSanitizada: it.descricao_sanitizada || it.descricao_extrato,
      documento: it.documento_extrato || null,
      tipo: it.tipo_transacao as 'DEBITO' | 'CREDITO',
      valor: Number(it.valor_extrato)
    }));

    // 3. FASE 1: Invalidação de Cache Satélite
    console.log(`[API /sessoes/${sessaoId}/reprocessar] Invalidando cache satélite para empresa ${sessao.empresa_id}...`);
    await invalidarCacheContaAzul(sessao.empresa_id, sessao.conta_financeira_id);

    // 4. Reconsultar a API Conta Azul ao vivo (forcarAtualizacao: true)
    console.log(`[API /sessoes/${sessaoId}/reprocessar] Reconsultando lançamentos Conta Azul ao vivo (${sessao.periodo_inicio} a ${sessao.periodo_fim})...`);
    let caItens: any[] = [];
    try {
      caItens = await sincronizarLancamentosContaAzul(
        sessao.empresa_id,
        sessao.conta_financeira_id,
        sessao.periodo_inicio,
        sessao.periodo_fim,
        {
          forcarAtualizacao: true,
          limiteRequisicoes: 60
        }
      );
    } catch (syncError: any) {
      console.warn(`[API /sessoes/${sessaoId}/reprocessar] Aviso na consulta ao vivo Conta Azul:`, syncError?.message);
    }

    // 5. Carregar Regras Atualizadas de De-Para (Fornecedores e Categorias)
    const mapaDeparaFornecedores = new Map<string, string>();
    const mapaDeparaCategorias = new Map<string, string>();

    try {
      const [
        { data: regrasFornEmpresa },
        { data: regrasFornGlobais },
        { data: regrasCatEmpresa }
      ] = await Promise.all([
        supabaseAdmin.from('fornecedor_depara').select('nome_original, nome_original_normalizado, nome_corrigido').eq('empresa_id', sessao.empresa_id),
        supabaseAdmin.from('fornecedor_depara').select('nome_original, nome_original_normalizado, nome_corrigido').neq('empresa_id', sessao.empresa_id),
        supabaseAdmin.from('fornecedor_regras').select('fornecedor_nome, categoria_nome').eq('empresa_id', sessao.empresa_id).eq('ativo', true)
      ]);

      (regrasFornGlobais || []).forEach(r => {
        if (r.nome_original) mapaDeparaFornecedores.set(r.nome_original.trim().toUpperCase(), r.nome_corrigido.trim().toUpperCase());
        if (r.nome_original_normalizado) mapaDeparaFornecedores.set(r.nome_original_normalizado.trim().toUpperCase(), r.nome_corrigido.trim().toUpperCase());
      });

      (regrasFornEmpresa || []).forEach(r => {
        if (r.nome_original) mapaDeparaFornecedores.set(r.nome_original.trim().toUpperCase(), r.nome_corrigido.trim().toUpperCase());
        if (r.nome_original_normalizado) mapaDeparaFornecedores.set(r.nome_original_normalizado.trim().toUpperCase(), r.nome_corrigido.trim().toUpperCase());
      });

      (regrasCatEmpresa || []).forEach(r => {
        if (r.fornecedor_nome && r.categoria_nome) {
          mapaDeparaCategorias.set(r.fornecedor_nome.trim().toUpperCase(), r.categoria_nome.trim());
        }
      });
    } catch (errDepara) {
      console.warn(`[API /sessoes/${sessaoId}/reprocessar] Aviso ao carregar regras De-Para:`, errDepara);
    }

    // 6. Recalcular Matching, Scores e os 6 Campos Críticos
    const motor = new MotorMatching();
    const resultadoMatching = motor.executarCruzamento(transacoes, caItens, {
      toleranciaDias: 3,
      toleranciaValorCentavos: 0.05,
      deparaFornecedores: mapaDeparaFornecedores,
      deparaCategorias: mapaDeparaCategorias,
      contaFinanceiraIdAuditada: sessao.conta_financeira_id,
      nomeContaFinanceiraAuditada: sessao.banco_nome
    });

    // 7. Persistência Atômica do Reprocessamento no Banco
    const persistencia = new PersistenciaAuditoria();
    const resReproc = await persistencia.reprocessarSessaoExistente(
      sessaoId,
      sessao.empresa_id,
      resultadoMatching
    );

    // 8. Buscar sessão atualizada
    const { data: sessaoAtualizada } = await supabaseAdmin
      .from('auditoria_conciliacao_sessoes')
      .select('*')
      .eq('id', sessaoId)
      .single();

    return NextResponse.json({
      sucesso: true,
      sessaoId,
      totalItensGravados: resReproc.totalItensGravados,
      totalContaAzulConsultado: caItens.length,
      regrasFornecedorAplicadas: mapaDeparaFornecedores.size,
      regrasCategoriaAplicadas: mapaDeparaCategorias.size,
      kpis: resultadoMatching.kpis,
      sessao: sessaoAtualizada
    });

  } catch (err: any) {
    console.error(`[API /sessoes/[id]/reprocessar] Erro fatal:`, err);
    return NextResponse.json(
      { erro: err?.message || 'Falha ao reprocessar sessão de auditoria' },
      { status: 500 }
    );
  }
}
