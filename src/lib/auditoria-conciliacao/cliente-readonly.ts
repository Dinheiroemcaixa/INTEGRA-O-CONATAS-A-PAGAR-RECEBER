/**
 * MÓDULO: Auditoria Inteligente de Conciliação Bancária
 * CAMINHO: src/lib/auditoria-conciliacao/cliente-readonly.ts
 * 
 * Contrato e Cliente Estritamente Read-Only para a API Conta Azul v2:
 * 1. Interface IContaAzulReadonlyClient bloqueia em tempo de compilação qualquer tentativa de escrita.
 * 2. Encapsula autenticação via token-manager homologado, orçamento de chamadas, Circuit Breaker e cache satélite.
 * 3. Garante que o motor de cruzamento da Fase 3 consuma apenas este contrato auditado e seguro.
 * 4. Totalmente acíclico: não possui dependências circulares com o sincronizador.
 */

import { LancamentoContaAzulAuditavel, OpcoesSincronizacaoContaAzul } from './tipos';
import { obterCacheContaAzul, salvarCacheContaAzul } from './cache';
import {
  executarCaGetSeguro,
  OrcamentoRequisicoesAuditoria,
  CircuitBreakerOpenError,
  AuditoriaLimiteRequisicoesExcedidoError,
  AuditoriaDesativadaError
} from './cliente-http';
import { isAuditoriaConciliacaoHabilitada } from './feature-flags';
import { getValidToken } from '../conta-azul/token-manager';

const BASE_URL = 'https://api-v2.contaazul.com/v1';

export class AuditoriaCacheVazioError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'AuditoriaCacheVazioError';
  }
}

export interface IContaAzulReadonlyClient {
  readonly empresaId: string;
  readonly contaFinanceiraId: string;

  /**
   * Sincroniza lançamentos auditáveis (débitos e créditos) com cache satélite e fallback
   */
  sincronizar(
    dtIni: string,
    dtFim: string,
    opcoes?: OpcoesSincronizacaoContaAzul
  ): Promise<LancamentoContaAzulAuditavel[]>;

  /**
   * Consulta despesas quitadas (débitos)
   */
  buscarDebitos(
    dtIni: string,
    dtFim: string,
    orcamento?: OrcamentoRequisicoesAuditoria
  ): Promise<LancamentoContaAzulAuditavel[]>;

  /**
   * Consulta receitas recebidas (créditos)
   */
  buscarCreditos(
    dtIni: string,
    dtFim: string,
    orcamento?: OrcamentoRequisicoesAuditoria
  ): Promise<LancamentoContaAzulAuditavel[]>;

  /**
   * Consulta transferências bancárias
   */
  buscarTransferencias(
    dtIni: string,
    dtFim: string,
    orcamento?: OrcamentoRequisicoesAuditoria
  ): Promise<any[]>;

  /**
   * Consulta detalhes atômicos de conciliação de uma parcela
   */
  obterDetalhesParcela(
    parcelaId: string,
    orcamento?: OrcamentoRequisicoesAuditoria
  ): Promise<{ conciliado: boolean; baixas: any[] }>;
}

/**
 * Implementação Concreta do Cliente Read-Only para a Auditoria
 */
export class ContaAzulReadonlyClient implements IContaAzulReadonlyClient {
  public readonly empresaId: string;
  public readonly contaFinanceiraId: string;

  constructor(empresaId: string, contaFinanceiraId: string) {
    if (!empresaId) throw new Error('empresaId é obrigatório para instanciar ContaAzulReadonlyClient');
    if (!contaFinanceiraId) throw new Error('contaFinanceiraId é obrigatório para instanciar ContaAzulReadonlyClient');
    this.empresaId = empresaId;
    this.contaFinanceiraId = contaFinanceiraId;
  }

  /**
   * Consulta débitos na Conta Azul (despesas quitadas) com controle de cota
   */
  public async buscarDebitos(
    dtIni: string,
    dtFim: string,
    orcamento?: OrcamentoRequisicoesAuditoria
  ): Promise<LancamentoContaAzulAuditavel[]> {
    const { accessToken } = await getValidToken(this.empresaId);
    const lancamentos: LancamentoContaAzulAuditavel[] = [];
    const endpoint = `${BASE_URL}/financeiro/eventos-financeiros/contas-a-pagar/buscar`;
    const TAMANHO_PAGINA = 100;
    let pagina = 1;

    while (pagina <= 50) {
      const url = `${endpoint}?pagina=${pagina}&tamanho_pagina=${TAMANHO_PAGINA}&data_pagamento_de=${dtIni}&data_pagamento_ate=${dtFim}&ids_contas_financeiras=${this.contaFinanceiraId}&status=QUITADO`;
      const data = await executarCaGetSeguro(url, accessToken, 'GET', orcamento);
      if (!data) break;

      const itens: any[] = data.itens || data.items || [];
      if (itens.length === 0) break;

      for (const item of itens) {
        const catObj = (Array.isArray(item.categorias) && item.categorias[0]) || item.categoria;
        const fornObj = item.fornecedor || item.contato;

        lancamentos.push({
          parcelaId: item.id || item.uuid,
          eventoId: item.evento?.id || item.id_evento || item.id,
          tipoEvento: 'DESPESA',
          descricao: item.descricao || item.observacao || fornObj?.nome || 'Despesa',
          fornecedorClienteId: fornObj?.id || null,
          fornecedorClienteNome: fornObj?.nome || item.descricao || 'Fornecedor Não Identificado',
          fornecedorCpfCnpj: fornObj?.cpf_cnpj || null,
          categoriaId: catObj?.id || null,
          categoriaNome: catObj?.nome || 'Sem Categoria',
          centroCustoNome: item.centro_custo?.nome || null,
          valorTotal: typeof item.total === 'number' ? item.total : (item.valor || 0),
          valorPago: typeof item.pago === 'number' ? item.pago : (item.valor_pago || item.total || 0),
          dataVencimento: item.data_vencimento || item.vencimento,
          dataCompetencia: item.data_competencia || null,
          dataPagamento: item.data_pagamento || item.pagamento || null,
          status: item.status || 'QUITADO',
          conciliado: Boolean(item.conciliado),
          baixas: []
        });
      }

      if (itens.length < TAMANHO_PAGINA) break;
      pagina++;
    }

    return lancamentos;
  }

  /**
   * Consulta créditos na Conta Azul (receitas recebidas) com controle de cota
   */
  public async buscarCreditos(
    dtIni: string,
    dtFim: string,
    orcamento?: OrcamentoRequisicoesAuditoria
  ): Promise<LancamentoContaAzulAuditavel[]> {
    const { accessToken } = await getValidToken(this.empresaId);
    const lancamentos: LancamentoContaAzulAuditavel[] = [];
    const endpoint = `${BASE_URL}/financeiro/eventos-financeiros/contas-a-receber/buscar`;
    const TAMANHO_PAGINA = 100;
    let pagina = 1;

    while (pagina <= 50) {
      const url = `${endpoint}?pagina=${pagina}&tamanho_pagina=${TAMANHO_PAGINA}&data_pagamento_de=${dtIni}&data_pagamento_ate=${dtFim}&ids_contas_financeiras=${this.contaFinanceiraId}&status=RECEBIDO`;
      const data = await executarCaGetSeguro(url, accessToken, 'GET', orcamento);
      if (!data) break;

      const itens: any[] = data.itens || data.items || [];
      if (itens.length === 0) break;

      for (const item of itens) {
        const catObj = (Array.isArray(item.categorias) && item.categorias[0]) || item.categoria;
        const clienteObj = item.cliente || item.contato;

        lancamentos.push({
          parcelaId: item.id || item.uuid,
          eventoId: item.evento?.id || item.id_evento || item.id,
          tipoEvento: 'RECEITA',
          descricao: item.descricao || item.observacao || clienteObj?.nome || 'Receita',
          fornecedorClienteId: clienteObj?.id || null,
          fornecedorClienteNome: clienteObj?.nome || item.descricao || 'Cliente Não Identificado',
          fornecedorCpfCnpj: clienteObj?.cpf_cnpj || null,
          categoriaId: catObj?.id || null,
          categoriaNome: catObj?.nome || 'Sem Categoria',
          centroCustoNome: item.centro_custo?.nome || null,
          valorTotal: typeof item.total === 'number' ? item.total : (item.valor || 0),
          valorPago: typeof item.pago === 'number' ? item.pago : (item.valor_pago || item.total || 0),
          dataVencimento: item.data_vencimento || item.vencimento,
          dataCompetencia: item.data_competencia || null,
          dataPagamento: item.data_pagamento || item.pagamento || null,
          status: item.status || 'RECEBIDO',
          conciliado: Boolean(item.conciliado),
          baixas: []
        });
      }

      if (itens.length < TAMANHO_PAGINA) break;
      pagina++;
    }

    return lancamentos;
  }

  /**
   * Consulta transferências bancárias (somente GET)
   */
  public async buscarTransferencias(
    dtIni: string,
    dtFim: string,
    orcamento?: OrcamentoRequisicoesAuditoria
  ): Promise<any[]> {
    const { accessToken } = await getValidToken(this.empresaId);
    const url = `${BASE_URL}/financeiro/transferencias?data_inicio=${dtIni}&data_fim=${dtFim}&ids_conta_financeira=${this.contaFinanceiraId}`;
    try {
      const data = await executarCaGetSeguro(url, accessToken, 'GET', orcamento);
      return Array.isArray(data?.itens) ? data.itens : [];
    } catch (err) {
      console.warn('[ContaAzulReadonlyClient] Falha ao consultar transferências (ignorado para não travar):', err);
      return [];
    }
  }

  /**
   * Consulta detalhes atômicos de conciliação de uma parcela (somente GET)
   */
  public async obterDetalhesParcela(
    parcelaId: string,
    orcamento?: OrcamentoRequisicoesAuditoria
  ): Promise<{ conciliado: boolean; baixas: any[] }> {
    const { accessToken } = await getValidToken(this.empresaId);
    const url = `${BASE_URL}/financeiro/eventos-financeiros/parcelas/${parcelaId}`;
    const data = await executarCaGetSeguro(url, accessToken, 'GET', orcamento);

    if (!data) {
      return { conciliado: false, baixas: [] };
    }

    const conciliado = Boolean(data.conciliado);
    const baixas: any[] = Array.isArray(data.baixas) ? data.baixas : [];

    return { conciliado, baixas };
  }

  /**
   * Sincroniza lançamentos auditáveis (débitos e créditos) com cache satélite e fallback
   */
  public async sincronizar(
    dtIni: string,
    dtFim: string,
    opcoes?: OpcoesSincronizacaoContaAzul
  ): Promise<LancamentoContaAzulAuditavel[]> {
    // 1. Verificação preliminar do Kill Switch em banco ANTES de qualquer coisa
    const habilitado = await isAuditoriaConciliacaoHabilitada();
    if (!habilitado) {
      throw new AuditoriaDesativadaError();
    }

    const chaveFiltro = `${dtIni}_${dtFim}`;
    const modoCacheOnly = Boolean(opcoes?.modoCacheOnly);
    const forcarAtualizacao = Boolean(opcoes?.forcarAtualizacao);

    // 2. Operação em Modo CACHE_ONLY (Nenhuma chamada externa ou token permitido)
    if (modoCacheOnly) {
      console.log(`[ContaAzulReadonlyClient] Modo CACHE_ONLY ativo para ${this.empresaId}. Consultando exclusivamente cache satélite.`);
      const cached = await obterCacheContaAzul<LancamentoContaAzulAuditavel[]>(
        this.empresaId,
        this.contaFinanceiraId,
        'CONTAS_PAGAR',
        chaveFiltro
      );

      if (cached && Array.isArray(cached) && cached.length > 0) {
        return cached;
      }

      throw new AuditoriaCacheVazioError(
        `[MODO CACHE_ONLY] Nenhum dado pré-sincronizado encontrado no cache satélite ` +
        `para a conta ${this.contaFinanceiraId} no período de ${dtIni} a ${dtFim}. ` +
        `Desative o modo CACHE_ONLY para sincronizar com a API Conta Azul.`
      );
    }

    // 3. Checagem de Cache Satélite Válido ANTES de qualquer chamada HTTP
    if (!forcarAtualizacao) {
      const cached = await obterCacheContaAzul<LancamentoContaAzulAuditavel[]>(
        this.empresaId,
        this.contaFinanceiraId,
        'CONTAS_PAGAR',
        chaveFiltro
      );

      if (cached && Array.isArray(cached) && cached.length > 0) {
        console.log(`[ContaAzulReadonlyClient] Cache satélite ativo retornado para ${this.empresaId} (${cached.length} registros).`);
        return cached;
      }
    }

    // 4. Instanciação do Orçamento de Requisições por Execução
    const orcamento = new OrcamentoRequisicoesAuditoria(opcoes?.limiteRequisicoes);

    try {
      // 5. Execução estrita das consultas de leitura via métodos protegidos do client
      const [debitos, creditos] = await Promise.all([
        this.buscarDebitos(dtIni, dtFim, orcamento),
        this.buscarCreditos(dtIni, dtFim, orcamento)
      ]);

      const todosLancamentos = [...debitos, ...creditos];

      // 6. Gravação no Cache Satélite com validade de 24h
      await salvarCacheContaAzul(
        this.empresaId,
        this.contaFinanceiraId,
        dtIni,
        dtFim,
        'CONTAS_PAGAR',
        chaveFiltro,
        todosLancamentos,
        24
      );

      console.log(
        `[ContaAzulReadonlyClient] Sincronização concluída com sucesso. ` +
        `Total: ${todosLancamentos.length} registros. Consumo: ${orcamento.getConsumo().executadas}/${orcamento.getConsumo().limite} requisições.`
      );

      return todosLancamentos;
    } catch (err: any) {
      console.warn(
        `[ContaAzulReadonlyClient] Erro ou Circuit Breaker na consulta da Conta Azul (${err?.message}). ` +
        `Ativando FALLBACK AUTOMÁTICO para cache satélite...`
      );

      // 7. Fallback Automático Resiliente: tenta resgatar cache satélite prévio
      const fallbackCache = await obterCacheContaAzul<LancamentoContaAzulAuditavel[]>(
        this.empresaId,
        this.contaFinanceiraId,
        'CONTAS_PAGAR',
        chaveFiltro
      );

      if (fallbackCache && Array.isArray(fallbackCache) && fallbackCache.length > 0) {
        console.log(`[ContaAzulReadonlyClient] Fallback acionado com sucesso: ${fallbackCache.length} lançamentos recuperados do cache.`);
        return fallbackCache;
      }

      if (err instanceof AuditoriaLimiteRequisicoesExcedidoError) {
        throw err;
      }

      if (err instanceof CircuitBreakerOpenError) {
        throw err;
      }

      if (err instanceof AuditoriaDesativadaError) {
        throw err;
      }

      throw new Error(
        `Não foi possível sincronizar com a Conta Azul (${err?.message || 'Falha de rede'}) ` +
        `e não há cache satélite prévio para o período ${dtIni} a ${dtFim}.`
      );
    }
  }
}
