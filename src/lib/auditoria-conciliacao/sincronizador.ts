/**
 * MÓDULO: Auditoria Inteligente de Conciliação Bancária
 * CAMINHO: src/lib/auditoria-conciliacao/sincronizador.ts
 * 
 * Orquestrador e Fachada Funcional de Sincronização:
 * 1. Utiliza EFETIVAMENTE ContaAzulReadonlyClient em todos os fluxos.
 * 2. Mantém compatibilidade funcional para importações diretas.
 * 3. Garante consulta de cache ANTES de qualquer chamada HTTP.
 * 4. Respeita o modo CACHE_ONLY impedindo obtenção e renovação de tokens.
 * 5. Garante zero dependências circulares e zero importações de api.ts/oauth.
 */

import { LancamentoContaAzulAuditavel, OpcoesSincronizacaoContaAzul } from './tipos';
import {
  ContaAzulReadonlyClient,
  IContaAzulReadonlyClient,
  AuditoriaCacheVazioError
} from './cliente-readonly';
import { OrcamentoRequisicoesAuditoria } from './cliente-http';

export { AuditoriaCacheVazioError };

/**
 * Orquestrador funcional que utiliza efetivamente o ContaAzulReadonlyClient
 */
export async function sincronizarLancamentosContaAzul(
  empresaId: string,
  contaFinanceiraId: string,
  dtIni: string,
  dtFim: string,
  opcoes?: OpcoesSincronizacaoContaAzul
): Promise<LancamentoContaAzulAuditavel[]> {
  const client: IContaAzulReadonlyClient = new ContaAzulReadonlyClient(empresaId, contaFinanceiraId);
  return client.sincronizar(dtIni, dtFim, opcoes);
}

/**
 * Consulta débitos utilizando ContaAzulReadonlyClient
 */
export async function buscarContasPagarAuditaveis(
  accessToken: string, // Mantido na assinatura para compatibilidade funcional
  dtIni: string,
  dtFim: string,
  contaFinanceiraId: string,
  orcamento?: OrcamentoRequisicoesAuditoria,
  empresaId?: string
): Promise<LancamentoContaAzulAuditavel[]> {
  if (empresaId) {
    const client = new ContaAzulReadonlyClient(empresaId, contaFinanceiraId);
    return client.buscarDebitos(dtIni, dtFim, orcamento);
  }
  // Se chamado diretamente com token avulso em testes
  const clientFake = new ContaAzulReadonlyClient('GLOBAL', contaFinanceiraId);
  return clientFake.buscarDebitos(dtIni, dtFim, orcamento);
}

/**
 * Consulta créditos utilizando ContaAzulReadonlyClient
 */
export async function buscarContasReceberAuditaveis(
  accessToken: string,
  dtIni: string,
  dtFim: string,
  contaFinanceiraId: string,
  orcamento?: OrcamentoRequisicoesAuditoria,
  empresaId?: string
): Promise<LancamentoContaAzulAuditavel[]> {
  if (empresaId) {
    const client = new ContaAzulReadonlyClient(empresaId, contaFinanceiraId);
    return client.buscarCreditos(dtIni, dtFim, orcamento);
  }
  const clientFake = new ContaAzulReadonlyClient('GLOBAL', contaFinanceiraId);
  return clientFake.buscarCreditos(dtIni, dtFim, orcamento);
}

/**
 * Consulta transferências utilizando ContaAzulReadonlyClient
 */
export async function buscarTransferenciasAuditaveis(
  accessToken: string,
  dtIni: string,
  dtFim: string,
  contaFinanceiraId: string,
  orcamento?: OrcamentoRequisicoesAuditoria,
  empresaId?: string
): Promise<any[]> {
  if (empresaId) {
    const client = new ContaAzulReadonlyClient(empresaId, contaFinanceiraId);
    return client.buscarTransferencias(dtIni, dtFim, orcamento);
  }
  const clientFake = new ContaAzulReadonlyClient('GLOBAL', contaFinanceiraId);
  return clientFake.buscarTransferencias(dtIni, dtFim, orcamento);
}

/**
 * Consulta detalhes da conciliação atômica utilizando ContaAzulReadonlyClient
 */
export async function obterDetalhesConciliacaoParcela(
  accessToken: string,
  parcelaId: string,
  orcamento?: OrcamentoRequisicoesAuditoria,
  empresaId?: string
): Promise<{ conciliado: boolean; baixas: any[] }> {
  if (empresaId) {
    const client = new ContaAzulReadonlyClient(empresaId, 'GLOBAL');
    return client.obterDetalhesParcela(parcelaId, orcamento);
  }
  const clientFake = new ContaAzulReadonlyClient('GLOBAL', 'GLOBAL');
  return clientFake.obterDetalhesParcela(parcelaId, orcamento);
}
