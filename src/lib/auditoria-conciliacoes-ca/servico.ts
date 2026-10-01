/**
 * SERVIÇO PRINCIPAL DE AUDITORIA INTELIGENTE DE CONCILIAÇÕES CONTA AZUL
 * 100% READ-ONLY: Executa leitura exclusiva de tabelas locais espelhadas.
 * Não altera dados no Conta Azul e não executa mutação no Supabase.
 */

import { createClient } from '@supabase/supabase-js';
import {
  ItemConciliadoAuditavel,
  ParametrosAuditoriaConciliacao,
  RecorrenciaSuspeita,
  ResumoAuditoriaConciliacoesCA
} from './tipos';
import {
  avaliarCompatibilidadeFornecedor,
  normalizarTextoBasico,
  sanitizarDescricaoBancaria
} from './motor-compatibilidade';
import {
  avaliarCategoriaConciliada,
  compilarHistoricoCategorias
} from './motor-categorias';

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Configurações de conexão Supabase ausentes no ambiente.');
  }
  return createClient(supabaseUrl, supabaseKey);
}

/**
 * Subtrai N meses de uma data no formato YYYY-MM-DD
 */
function subtrairMeses(dataIso: string, meses: number): string {
  const [ano, mes, dia] = dataIso.split('-').map(Number);
  const d = new Date(ano, mes - 1 - meses, dia || 1);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Executa a auditoria inteligente de conciliações já existentes no Conta Azul
 */
export async function executarAuditoriaConciliacoesCA(
  params: ParametrosAuditoriaConciliacao
): Promise<ResumoAuditoriaConciliacoesCA> {
  const { empresaId, dataInicio, dataFim, limite = 10000 } = params;

  if (!empresaId) {
    throw new Error('O parâmetro empresaId é obrigatório para executar a auditoria.');
  }

  const supabase = getSupabaseClient();
  const hoje = new Date().toISOString().split('T')[0];
  const dtFim = dataFim || hoje;
  const dtIni = dataInicio || subtrairMeses(dtFim, 3); // Padrão: últimos 90 dias
  const dtHistoricoIni = subtrairMeses(dtIni, 6);       // Janela histórica de 6 meses

  // 1. Buscar regras de De-Para e normalização de fornecedores (READ-ONLY)
  const { data: deparaRows } = await supabase
    .from('fornecedor_depara')
    .select('nome_original_normalizado, nome_corrigido, categoria_padrao')
    .eq('empresa_id', empresaId);

  const mapaDeparaNomes = new Map<string, string>();
  const mapaDeparaCategorias = new Map<string, string>();

  (deparaRows || []).forEach(r => {
    if (r.nome_original_normalizado && r.nome_corrigido) {
      mapaDeparaNomes.set(normalizarTextoBasico(r.nome_original_normalizado), r.nome_corrigido);
    }
    if (r.nome_original_normalizado && r.categoria_padrao) {
      mapaDeparaCategorias.set(normalizarTextoBasico(r.nome_original_normalizado), r.categoria_padrao);
    }
  });

  // 2. Buscar categorias padrão oficiais em fornecedores_contaazul (READ-ONLY)
  const { data: fornecedoresCaRows } = await supabase
    .from('fornecedores_contaazul')
    .select('nome_normalizado, categoria_padrao')
    .eq('empresa_id', empresaId)
    .not('categoria_padrao', 'is', null);

  const mapaCategoriasPadrao = new Map<string, string>();
  (fornecedoresCaRows || []).forEach(f => {
    if (f.nome_normalizado && f.categoria_padrao) {
      mapaCategoriasPadrao.set(normalizarTextoBasico(f.nome_normalizado), f.categoria_padrao);
    }
  });

  // 3. Buscar histórico anterior de lançamentos para aprendizado estatístico (READ-ONLY)
  const { data: historicoLotes } = await supabase
    .from('contas_pagar_contaazul_espelho')
    .select('fornecedor_nome, categoria_nome')
    .eq('empresa_id', empresaId)
    .gte('data_competencia', dtHistoricoIni)
    .lt('data_competencia', dtIni)
    .limit(30000);

  const historicoEstatistico = compilarHistoricoCategorias(historicoLotes || []);

  // 4. Buscar os lançamentos auditados do período selecionado (READ-ONLY)
  let query = supabase
    .from('contas_pagar_contaazul_espelho')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('data_competencia', { ascending: false })
    .limit(limite);

  if (dtIni && dtFim) {
    query = query.gte('data_competencia', dtIni).lte('data_competencia', dtFim);
  }

  const { data: lancamentosAuditados, error: errLancamentos } = await query;

  if (errLancamentos) {
    console.error('[AuditoriaConciliacoesCA] Erro na query do espelho:', errLancamentos);
    throw new Error(`Falha ao consultar espelho local do Conta Azul: ${errLancamentos.message}`);
  }

  const registros = lancamentosAuditados || [];

  // 5. Avaliação item a item aplicando as 4 Regras Contábeis
  const itensAuditados: ItemConciliadoAuditavel[] = [];
  const mapaRecorrenciasSuspeitas = new Map<string, {
    descricaoPadrao: string;
    fornecedorConciliado: string;
    ocorrencias: number;
    valorTotal: number;
  }>();

  let divergenciasFornecedorCount = 0;
  let divergenciasCategoriaCount = 0;
  let valorTotalAuditado = 0;
  let valorFinanceiroEmRisco = 0;

  for (const reg of registros) {
    const valor = Number(reg.valor || 0);
    valorTotalAuditado += valor;

    // Extrai a descrição original do banco (preservada na coluna descricao ou em raw_data)
    const rawData = reg.raw_data || {};
    const descricaoBanco = reg.descricao || rawData.descricao || rawData.observacao || reg.fornecedor_nome || '';
    const fornecedorContaAzul = reg.fornecedor_nome || 'FORNECEDOR NÃO INFORMADO';
    const categoriaContaAzul = reg.categoria_nome || '';

    // Avaliação da Regra 1: Compatibilidade Textual Banco vs Fornecedor (FASE 3)
    const compFornecedor = avaliarCompatibilidadeFornecedor(
      descricaoBanco,
      fornecedorContaAzul,
      mapaDeparaNomes,
      reg.numero_documento,
      categoriaContaAzul
    );

    // Avaliação das Regras 2 e 3: Categoria vs Padrão Homologado / Histórico
    const compCategoria = avaliarCategoriaConciliada({
      fornecedorNome: fornecedorContaAzul,
      categoriaConciliada: categoriaContaAzul,
      categoriasPadraoHomologadas: mapaCategoriasPadrao,
      regrasDeparaCategoria: mapaDeparaCategorias,
      historicoEstatistico
    });

    const motivos: string[] = [];
    let itemEmRisco = false;

    if (compFornecedor.status !== 'COMPATIVEL') {
      divergenciasFornecedorCount++;
      itemEmRisco = true;
      if (compFornecedor.motivo) motivos.push(compFornecedor.motivo);
    }

    if (compCategoria.divergencia) {
      divergenciasCategoriaCount++;
      itemEmRisco = true;
      if (compCategoria.motivo) motivos.push(compCategoria.motivo);
    }

    if (itemEmRisco) {
      valorFinanceiroEmRisco += valor;
    }

    // Regra 4: Rastreamento de Erros Recorrentes (anomalia repetida)
    let padraoIdentificado: string | null = null;
    if (compFornecedor.status !== 'COMPATIVEL') {
      const descSanit = sanitizarDescricaoBancaria(descricaoBanco);
      const chaveRecorrencia = `${descSanit}:::${fornecedorContaAzul}`;

      if (!mapaRecorrenciasSuspeitas.has(chaveRecorrencia)) {
        mapaRecorrenciasSuspeitas.set(chaveRecorrencia, {
          descricaoPadrao: descSanit,
          fornecedorConciliado: fornecedorContaAzul,
          ocorrencias: 0,
          valorTotal: 0
        });
      }

      const rec = mapaRecorrenciasSuspeitas.get(chaveRecorrencia)!;
      rec.ocorrencias += 1;
      rec.valorTotal += valor;

      if (rec.ocorrencias >= 2) {
        padraoIdentificado = `Vício recorrente: ${rec.ocorrencias} lançamentos com descrição bancária similar conciliados em '${fornecedorContaAzul}'.`;
      }
    }

    itensAuditados.push({
      id: reg.id,
      conta_azul_id: reg.conta_azul_id,
      descricao_banco: descricaoBanco,
      descricao_sanitizada: compFornecedor.descricaoSanitizada,
      fornecedor_conciliado: fornecedorContaAzul,
      fornecedor_normalizado: compFornecedor.fornecedorNormalizado,
      categoria_conciliada: categoriaContaAzul,
      valor,
      data_competencia: reg.data_competencia || null,
      data_vencimento: reg.data_vencimento || null,
      data_pagamento: reg.data_pagamento || null,
      status: reg.status || 'CONCILIADO',

      score_compatibilidade_fornecedor: compFornecedor.score,
      status_fornecedor: compFornecedor.status,
      fornecedor_esperado_sugerido: compFornecedor.fornecedorSugerido || null,

      categoria_esperada: compCategoria.categoriaEsperada,
      origem_categoria_esperada: compCategoria.origemEsperada,
      divergencia_categoria: compCategoria.divergencia,
      tipo_escopo_fornecedor: compCategoria.tipoEscopo,
      confianca_categoria_percentual: compCategoria.confiancaPercentual,

      motivos_divergencia: motivos,
      em_risco_financeiro: itemEmRisco,
      padrao_recorrente_identificado: padraoIdentificado
    });
  }

  // 6. Formata a lista de padrões suspeitos recorrentes (Regra 4)
  const recorrenciasSuspeitas: RecorrenciaSuspeita[] = [];
  for (const rec of mapaRecorrenciasSuspeitas.values()) {
    if (rec.ocorrencias >= 2) {
      recorrenciasSuspeitas.push({
        descricao_padrao: rec.descricaoPadrao,
        fornecedor_conciliado: rec.fornecedorConciliado,
        ocorrencias: rec.ocorrencias,
        valor_total: Math.round(rec.valorTotal * 100) / 100,
        sugestao: `Verificar se lançamentos com a descrição '${rec.descricaoPadrao}' pertencem a outro fornecedor ou se necessitam de regra De-Para.`
      });
    }
  }

  // Ordena os itens: os com divergência primeiro, priorizando maior risco e menor score
  itensAuditados.sort((a, b) => {
    if (a.em_risco_financeiro && !b.em_risco_financeiro) return -1;
    if (!a.em_risco_financeiro && b.em_risco_financeiro) return 1;
    return a.score_compatibilidade_fornecedor - b.score_compatibilidade_fornecedor;
  });

  const totalAuditado = registros.length;
  const totalDivergenciasGeral = itensAuditados.filter(i => i.em_risco_financeiro).length;
  const totalConsistentes = totalAuditado - totalDivergenciasGeral;
  const taxaConformidade = totalAuditado > 0
    ? Math.round((totalConsistentes / totalAuditado) * 10000) / 100
    : 100;

  return {
    empresa_id: empresaId,
    periodo: {
      inicio: dtIni,
      fim: dtFim
    },
    total_auditado: totalAuditado,
    total_consistentes: totalConsistentes,
    divergencias_fornecedor: divergenciasFornecedorCount,
    divergencias_categoria: divergenciasCategoriaCount,
    total_divergencias_geral: totalDivergenciasGeral,
    taxa_conformidade_percentual: taxaConformidade,
    valor_total_auditado: Math.round(valorTotalAuditado * 100) / 100,
    valor_financeiro_em_risco: Math.round(valorFinanceiroEmRisco * 100) / 100,
    recorrencias_suspeitas: recorrenciasSuspeitas,
    lista_detalhada: itensAuditados
  };
}
