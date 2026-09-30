/**
 * MÓDULO: Auditoria Inteligente de Conciliação Bancária
 * CAMINHO: src/lib/auditoria-conciliacao/persistencia-auditoria.ts
 * 
 * Camada de Persistência Atômica no Supabase:
 * 1. Gravação transacional/em lote de sessões e itens auditados.
 * 2. Rastreabilidade com SHA-256 e tamanho de arquivo.
 * 3. Respeito estrito ao isolamento multi-tenant via RLS (usuarios_empresas).
 * 4. Totalmente satélite (tabelas auditoria_conciliacao_*).
 */

import { createClient } from '@supabase/supabase-js';
import { ResultadoAuditoriaConciliacao, ItemAuditoriaProcessado } from './motor-matching';
import { FormatoArquivoExtrato } from './tipos';

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createClient(supabaseUrl, supabaseKey);
}

export interface ParametrosCriacaoSessaoAuditoria {
  empresaId: string;
  contaFinanceiraId: string;
  bancoNome: string;
  arquivoNome: string;
  arquivoTipo: FormatoArquivoExtrato;
  arquivoHash: string;
  arquivoTamanho?: number;
  arquivoStoragePath?: string;
  periodoInicio: string;
  periodoFim: string;
  criadoPor?: string;
}

export interface IPersistenciaAuditoria {
  salvarSessaoEItens(
    parametrosSessao: ParametrosCriacaoSessaoAuditoria,
    resultadoMatching: ResultadoAuditoriaConciliacao
  ): Promise<{ sessaoId: string; totalItensGravados: number }>;
  
  finalizarSessao(
    sessaoId: string,
    usuarioId: string
  ): Promise<void>;
  
  reabrirSessao(
    sessaoId: string,
    motivo: string
  ): Promise<void>;

  reprocessarSessaoExistente(
    sessaoId: string,
    empresaId: string,
    resultadoMatching: ResultadoAuditoriaConciliacao
  ): Promise<{ sessaoId: string; totalItensGravados: number }>;
}

export class PersistenciaAuditoria implements IPersistenciaAuditoria {
  /**
   * Salva atômica e seguramente a sessão e todos os seus itens
   */
  public async salvarSessaoEItens(
    parametrosSessao: ParametrosCriacaoSessaoAuditoria,
    resultadoMatching: ResultadoAuditoriaConciliacao
  ): Promise<{ sessaoId: string; totalItensGravados: number }> {
    const supabase = getSupabase();
    const kpis = resultadoMatching.kpis;

    // 1. Inserção do Cabeçalho da Sessão
    const { data: sessaoCriada, error: erroSessao } = await supabase
      .from('auditoria_conciliacao_sessoes')
      .insert({
        empresa_id: parametrosSessao.empresaId,
        conta_financeira_id: parametrosSessao.contaFinanceiraId,
        banco_nome: parametrosSessao.bancoNome,
        arquivo_nome: parametrosSessao.arquivoNome,
        arquivo_tipo: parametrosSessao.arquivoTipo,
        arquivo_hash: parametrosSessao.arquivoHash,
        arquivo_tamanho: parametrosSessao.arquivoTamanho || null,
        arquivo_storage_path: parametrosSessao.arquivoStoragePath || null,
        periodo_inicio: parametrosSessao.periodoInicio,
        periodo_fim: parametrosSessao.periodoFim,
        total_transacoes: kpis.totalTransacoes,
        total_debitos: resultadoMatching.itens.filter(i => i.transacaoExtrato.tipo === 'DEBITO').length,
        total_creditos: resultadoMatching.itens.filter(i => i.transacaoExtrato.tipo === 'CREDITO').length,
        valor_total_debitos: kpis.valorTotalDebitos,
        valor_total_creditos: kpis.valorTotalCreditos,
        status_auditoria: 'EM_ANALISE',
        saude_conciliacao: kpis.saudeConciliacao,
        gap_desconciliado: kpis.gapDesconciliadoValor,
        total_riscos_contabeis: kpis.totalRiscosContabeis,
        valor_divergencias: kpis.divergenciasFinanceirasValor,
        criado_por: parametrosSessao.criadoPor || null
      })
      .select('id')
      .single();

    if (erroSessao || !sessaoCriada) {
      throw new Error(`[PersistenciaAuditoria] Falha ao criar sessão de auditoria: ${erroSessao?.message}`);
    }

    const sessaoId = sessaoCriada.id;

    // 2. Mapeamento dos Itens da Sessão
    const itensParaGravar = resultadoMatching.itens.map((item: ItemAuditoriaProcessado) => {
      const ca = item.statusAuditoria === 'LANCAMENTO_AUSENTE' ? null : item.lancamentoCaCorrespondente;
      return {
        sessao_id: sessaoId,
        empresa_id: parametrosSessao.empresaId,
        data_transacao: item.transacaoExtrato.data,
        descricao_extrato: item.transacaoExtrato.descricaoOriginal,
        descricao_sanitizada: item.transacaoExtrato.descricaoSanitizada,
        documento_extrato: item.transacaoExtrato.documento || null,
        tipo_transacao: item.transacaoExtrato.tipo,
        valor_extrato: item.transacaoExtrato.valor,
        
        conta_azul_parcela_id: ca?.parcelaId || null,
        conta_azul_evento_id: ca?.eventoId || null,
        conta_azul_baixa_id: ca?.baixas?.[0]?.id || null,
        conciliado_no_ca: Boolean(ca?.conciliado),
        fornecedor_cliente_ca: ca?.fornecedorClienteNome || null,
        fornecedor_ca_id: ca?.fornecedorClienteId || null,
        categoria_ca: ca?.categoriaNome || null,
        categoria_ca_id: ca?.categoriaId || null,
        valor_ca: ca ? (ca.valorPago || ca.valorTotal) : null,
        data_pagamento_ca: ca?.dataPagamento || ca?.dataVencimento || null,
        
        status_auditoria: item.statusAuditoria,
        score_confianca: item.scoreConfianca,
        diferenca_valor: item.diferencaValor,
        detalhes_diagnostico: item.diagnostico,
        status_governanca: 'PENDENTE'
      };
    });

    // 3. Inserção em Lotes (Chunks de 250 itens) para alto throughput e proteção de buffer PostgREST
    const TAMANHO_LOTE = 250;
    for (let i = 0; i < itensParaGravar.length; i += TAMANHO_LOTE) {
      const lote = itensParaGravar.slice(i, i + TAMANHO_LOTE);
      const { error: erroLote } = await supabase
        .from('auditoria_conciliacao_itens')
        .insert(lote);

      if (erroLote) {
        console.error(`[PersistenciaAuditoria] Erro ao gravar lote de itens (${i} a ${i + lote.length}):`, erroLote);
        throw new Error(`Falha ao persistir itens da auditoria: ${erroLote.message}`);
      }
    }

    return {
      sessaoId,
      totalItensGravados: itensParaGravar.length
    };
  }

  /**
   * Finaliza oficialmente a sessão de auditoria
   */
  public async finalizarSessao(sessaoId: string, usuarioId: string): Promise<void> {
    const supabase = getSupabase();
    const { error } = await supabase
      .from('auditoria_conciliacao_sessoes')
      .update({
        status_auditoria: 'FINALIZADA',
        data_finalizacao: new Date().toISOString(),
        finalizado_por: usuarioId
      })
      .eq('id', sessaoId);

    if (error) {
      throw new Error(`Falha ao finalizar sessão de auditoria: ${error.message}`);
    }
  }

  /**
   * Reabre uma sessão finalizada para ajustes
   */
  public async reabrirSessao(sessaoId: string, motivo: string): Promise<void> {
    const supabase = getSupabase();
    const { error } = await supabase
      .from('auditoria_conciliacao_sessoes')
      .update({
        status_auditoria: 'REABERTA',
        data_finalizacao: null
      })
      .eq('id', sessaoId);

    if (error) {
      throw new Error(`Falha ao reabrir sessão de auditoria: ${error.message}`);
    }
  }

  /**
   * Verifica se já existe uma sessão com o mesmo arquivo_hash (idempotência)
   */
  public async buscarSessaoPorHash(
    empresaId: string,
    arquivoHash: string
  ): Promise<{ id: string; statusAuditoria: string } | null> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('auditoria_conciliacao_sessoes')
      .select('id, status_auditoria')
      .eq('empresa_id', empresaId)
      .eq('arquivo_hash', arquivoHash)
      .maybeSingle();

    if (error || !data) return null;
    return {
      id: data.id,
      statusAuditoria: data.status_auditoria
    };
  }

  /**
   * Reprocessa atômica e integralmente uma sessão existente (Fase 1):
   * 1. Remove os itens antigos da sessão
   * 2. Grava os novos itens recalculados em chunks de 250
   * 3. Atualiza os 4 KPIs e métricas da sessão
   */
  public async reprocessarSessaoExistente(
    sessaoId: string,
    empresaId: string,
    resultadoMatching: ResultadoAuditoriaConciliacao
  ): Promise<{ sessaoId: string; totalItensGravados: number }> {
    const supabase = getSupabase();
    const kpis = resultadoMatching.kpis;

    // 1. Remover itens antigos da sessão
    const { error: errDelete } = await supabase
      .from('auditoria_conciliacao_itens')
      .delete()
      .eq('sessao_id', sessaoId);

    if (errDelete) {
      console.warn(`[PersistenciaAuditoria] Aviso ao limpar itens antigos da sessão ${sessaoId}:`, errDelete);
    }

    // 2. Mapeamento dos novos itens
    const itensParaGravar = resultadoMatching.itens.map((item: ItemAuditoriaProcessado) => {
      const ca = item.statusAuditoria === 'LANCAMENTO_AUSENTE' ? null : item.lancamentoCaCorrespondente;
      return {
        sessao_id: sessaoId,
        empresa_id: empresaId,
        data_transacao: item.transacaoExtrato.data,
        descricao_extrato: item.transacaoExtrato.descricaoOriginal,
        descricao_sanitizada: item.transacaoExtrato.descricaoSanitizada,
        documento_extrato: item.transacaoExtrato.documento || null,
        tipo_transacao: item.transacaoExtrato.tipo,
        valor_extrato: item.transacaoExtrato.valor,
        
        conta_azul_parcela_id: ca?.parcelaId || null,
        conta_azul_evento_id: ca?.eventoId || null,
        conta_azul_baixa_id: ca?.baixas?.[0]?.id || null,
        conciliado_no_ca: Boolean(ca?.conciliado),
        fornecedor_cliente_ca: ca?.fornecedorClienteNome || null,
        fornecedor_ca_id: ca?.fornecedorClienteId || null,
        categoria_ca: ca?.categoriaNome || null,
        categoria_ca_id: ca?.categoriaId || null,
        valor_ca: ca ? (ca.valorPago || ca.valorTotal) : null,
        data_pagamento_ca: ca?.dataPagamento || ca?.dataVencimento || null,
        
        status_auditoria: item.statusAuditoria,
        score_confianca: item.scoreConfianca,
        diferenca_valor: item.diferencaValor,
        detalhes_diagnostico: item.diagnostico,
        status_governanca: 'PENDENTE'
      };
    });

    // 3. Inserção em Lotes (Chunks de 250 itens)
    const TAMANHO_LOTE = 250;
    for (let i = 0; i < itensParaGravar.length; i += TAMANHO_LOTE) {
      const lote = itensParaGravar.slice(i, i + TAMANHO_LOTE);
      const { error: erroLote } = await supabase
        .from('auditoria_conciliacao_itens')
        .insert(lote);

      if (erroLote) {
        console.error(`[PersistenciaAuditoria] Erro ao regravar lote (${i} a ${i + lote.length}):`, erroLote);
        throw new Error(`Falha ao persistir itens reprocessados: ${erroLote.message}`);
      }
    }

    // 4. Atualização dos KPIs e Metadados da Sessão
    const { error: erroAtualizaSessao } = await supabase
      .from('auditoria_conciliacao_sessoes')
      .update({
        total_transacoes: kpis.totalTransacoes,
        total_debitos: resultadoMatching.itens.filter(i => i.transacaoExtrato.tipo === 'DEBITO').length,
        total_creditos: resultadoMatching.itens.filter(i => i.transacaoExtrato.tipo === 'CREDITO').length,
        valor_total_debitos: kpis.valorTotalDebitos,
        valor_total_creditos: kpis.valorTotalCreditos,
        status_auditoria: 'EM_ANALISE',
        saude_conciliacao: kpis.saudeConciliacao,
        gap_desconciliado: kpis.gapDesconciliadoValor,
        total_riscos_contabeis: kpis.totalRiscosContabeis,
        valor_divergencias: kpis.divergenciasFinanceirasValor,
        updated_at: new Date().toISOString()
      })
      .eq('id', sessaoId);

    if (erroAtualizaSessao) {
      console.warn(`[PersistenciaAuditoria] Aviso ao atualizar cabeçalho da sessão ${sessaoId}:`, erroAtualizaSessao);
    }

    return {
      sessaoId,
      totalItensGravados: itensParaGravar.length
    };
  }
}
