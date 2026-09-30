/**
 * MÓDULO: Auditoria Inteligente de Conciliação Bancária
 * CAMINHO: src/lib/auditoria-conciliacao/cliente-http.ts
 * 
 * Camada de Blindagem Operacional para chamadas externas à Conta Azul API v2:
 * 1. Wrapper satélite 100% isolado (ZERO dependências ou alterações em src/lib/conta-azul/api.ts).
 * 2. Bloqueio estrito e irrevogável em tempo de execução para qualquer método diferente de 'GET'.
 * 3. Circuit Breaker independente para erros transitórios (429, 500, 502, 503, 504).
 * 4. Kill Switch persistido em banco (tabela feature_flags) para desligamento imediato sem deploy.
 * 5. Orçamento e limite máximo de requisições por execução (proteção contra Spike Arrest e exaustão).
 * 6. Timeout defensivo isolado (10s) sem afetar módulos de faturamento de produção.
 */

import { isAuditoriaConciliacaoHabilitada } from './feature-flags';

export class AuditoriaDesativadaError extends Error {
  constructor(message = 'O módulo de Auditoria de Conciliação Bancária está temporariamente desativado via Kill Switch.') {
    super(message);
    this.name = 'AuditoriaDesativadaError';
  }
}

export class AuditoriaMetodoNaoPermitidoError extends Error {
  constructor(metodoTentado: string) {
    super(
      `[SEGURANÇA BLOQUEADA] Tentativa de chamada com método '${metodoTentado}'. ` +
      `O módulo de Auditoria opera ESTRITAMENTE em modo leitura (GET). ` +
      `Métodos POST, PUT, PATCH e DELETE são terminantemente proibidos.`
    );
    this.name = 'AuditoriaMetodoNaoPermitidoError';
  }
}

export class AuditoriaLimiteRequisicoesExcedidoError extends Error {
  public limiteMax: number;
  public totalExecutadas: number;

  constructor(limiteMax: number, totalExecutadas: number) {
    super(
      `[LIMITE DE SEGURANÇA ATINGIDO] A execução da auditoria atingiu o teto máximo de ` +
      `${limiteMax} requisições externas à Conta Azul (${totalExecutadas} realizadas). ` +
      `A chamada foi interrompida para evitar Spike Arrest/Rate Limit da Conta Azul. ` +
      `Ative o modo CACHE_ONLY ou utilize filtros de data mais específicos.`
    );
    this.name = 'AuditoriaLimiteRequisicoesExcedidoError';
    this.limiteMax = limiteMax;
    this.totalExecutadas = totalExecutadas;
  }
}

export class CircuitBreakerOpenError extends Error {
  public cooldownRestanteSegundos: number;
  constructor(cooldownRestanteSegundos: number) {
    super(
      `[CIRCUIT BREAKER ABERTO] A API Conta Azul apresentou falhas repetidas (429/5xx). ` +
      `Chamadas externas temporariamente suspensas por segurança. ` +
      `Ativando fallback automático para cache local. Reabertura em ${cooldownRestanteSegundos}s.`
    );
    this.name = 'CircuitBreakerOpenError';
    this.cooldownRestanteSegundos = cooldownRestanteSegundos;
  }
}

/**
 * Estado do Circuit Breaker em Memória
 */
interface CircuitBreakerState {
  estado: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  falhasConsecutivas: number;
  ultimoErroEm: number | null;
  abertoAte: number | null;
}

const CONFIG_OPERACIONAL = {
  limiteFalhasConsecutivas: 3,     // Abre após 3 falhas transitórias consecutivas
  cooldownMs: 60 * 1000,           // 60s em OPEN antes de HALF_OPEN
  timeoutAuditoriaMs: 10 * 1000,   // 10s de timeout satélite isolado
  limiteRequisicoesPadrao: 30      // Teto máximo padrão de requisições externas por execução
};

const circuitBreaker: CircuitBreakerState = {
  estado: 'CLOSED',
  falhasConsecutivas: 0,
  ultimoErroEm: null,
  abertoAte: null
};

/**
 * Controlador de Orçamento de Requisições por Execução
 */
export class OrcamentoRequisicoesAuditoria {
  private limiteMax: number;
  private totalExecutadas: number = 0;

  constructor(limiteMax: number = CONFIG_OPERACIONAL.limiteRequisicoesPadrao) {
    this.limiteMax = limiteMax > 0 ? limiteMax : CONFIG_OPERACIONAL.limiteRequisicoesPadrao;
  }

  public registrarConsumo(): void {
    if (this.totalExecutadas >= this.limiteMax) {
      throw new AuditoriaLimiteRequisicoesExcedidoError(this.limiteMax, this.totalExecutadas);
    }
    this.totalExecutadas++;
  }

  public getConsumo() {
    return {
      executadas: this.totalExecutadas,
      limite: this.limiteMax,
      restantes: Math.max(0, this.limiteMax - this.totalExecutadas)
    };
  }
}

/**
 * Wrapper HTTP Satélite Isolado para a API do Conta Azul
 * Executa chamadas com timeout satélite e retry em erros transitórios.
 * NÃO importa e NÃO altera src/lib/conta-azul/api.ts.
 */
async function fetchCaSatelite(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<Response> {
  const maxTentativas = 2;
  const delaisPorTentativa = [1500];
  let res: Response | null = null;

  for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      res = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      // Status < 500 exceto 429 são respostas determinísticas
      if (res.status < 500 && res.status !== 429) {
        return res;
      }

      const isTransitorio = res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504;
      if (isTransitorio && tentativa < maxTentativas) {
        const waitTime = delaisPorTentativa[tentativa - 1] || 2000;
        console.warn(
          `[fetchCaSatelite] Resposta transitória (${res.status}) na URL ${url}. Tentativa ${tentativa}/${maxTentativas}. Aguardando ${waitTime}ms...`
        );
        await new Promise(r => setTimeout(r, waitTime));
        continue;
      }

      return res;
    } catch (err: any) {
      clearTimeout(timeoutId);
      const isAbort = err?.name === 'AbortError' || err?.code === 'ETIMEDOUT';
      if (isAbort && tentativa < maxTentativas) {
        console.warn(`[fetchCaSatelite] Timeout de ${timeoutMs}ms na URL ${url}. Retentando...`);
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      throw err;
    }
  }

  if (!res) {
    throw new Error(`[fetchCaSatelite] Falha completa de conexão com ${url}`);
  }
  return res;
}

/**
 * Obtém o status operacional do Circuit Breaker
 */
export function getStatusCircuitBreaker() {
  const agora = Date.now();
  if (circuitBreaker.estado === 'OPEN' && circuitBreaker.abertoAte && agora >= circuitBreaker.abertoAte) {
    circuitBreaker.estado = 'HALF_OPEN';
  }

  return {
    estado: circuitBreaker.estado,
    falhasConsecutivas: circuitBreaker.falhasConsecutivas,
    emCooldown: circuitBreaker.estado === 'OPEN'
  };
}

/**
 * Reseta manualmente o Circuit Breaker (utilitário para testes ou recuperação)
 */
export function resetCircuitBreaker(): void {
  circuitBreaker.estado = 'CLOSED';
  circuitBreaker.falhasConsecutivas = 0;
  circuitBreaker.ultimoErroEm = null;
  circuitBreaker.abertoAte = null;
}

/**
 * Cliente HTTP Satélite Blindado Exclusivo para o Módulo de Auditoria:
 * - Valida Kill Switch persistido em banco antes de qualquer requisição.
 * - Bloqueia qualquer método diferente de GET.
 * - Controla orçamento de requisições por auditoria.
 * - Aplica Circuit Breaker contra saturação da API Conta Azul.
 * - Totalmente isolado do código core de produção.
 */
export async function executarCaGetSeguro(
  url: string,
  accessToken: string,
  metodoSolicitado = 'GET',
  orcamento?: OrcamentoRequisicoesAuditoria,
  timeoutMs = CONFIG_OPERACIONAL.timeoutAuditoriaMs
): Promise<any> {
  // 1. Verificação do Kill Switch Persistido em Banco
  const habilitado = await isAuditoriaConciliacaoHabilitada();
  if (!habilitado) {
    throw new AuditoriaDesativadaError();
  }

  // 2. Trava Irrevogável de Métodos HTTP (Apenas GET permitido)
  const metodoNormalizado = metodoSolicitado.trim().toUpperCase();
  if (metodoNormalizado !== 'GET') {
    console.error(`[BLINDAGEM AUDITORIA] Bloqueio de mutação ilegal (${metodoNormalizado}) na URL: ${url}`);
    throw new AuditoriaMetodoNaoPermitidoError(metodoNormalizado);
  }

  // 3. Inspeção do Circuit Breaker
  const agora = Date.now();
  if (circuitBreaker.estado === 'OPEN') {
    if (circuitBreaker.abertoAte && agora < circuitBreaker.abertoAte) {
      const restantes = Math.ceil((circuitBreaker.abertoAte - agora) / 1000);
      throw new CircuitBreakerOpenError(restantes);
    }
    circuitBreaker.estado = 'HALF_OPEN';
  }

  // 4. Registro e Controle de Orçamento de Requisições
  if (orcamento) {
    orcamento.registrarConsumo();
  }

  try {
    // 5. Execução via wrapper satélite 100% autônomo
    const res = await fetchCaSatelite(
      url,
      {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      },
      timeoutMs
    );

    // 6. Sucesso
    if (res.ok) {
      if (circuitBreaker.estado === 'HALF_OPEN') {
        circuitBreaker.estado = 'CLOSED';
        circuitBreaker.falhasConsecutivas = 0;
      }
      return res.json();
    }

    // 7. Tratamento de Erros de Status
    const status = res.status;
    const isTransitorio = status === 429 || status === 500 || status === 502 || status === 503 || status === 504;

    if (isTransitorio) {
      circuitBreaker.falhasConsecutivas++;
      circuitBreaker.ultimoErroEm = agora;

      if (circuitBreaker.falhasConsecutivas >= CONFIG_OPERACIONAL.limiteFalhasConsecutivas) {
        circuitBreaker.estado = 'OPEN';
        circuitBreaker.abertoAte = agora + CONFIG_OPERACIONAL.cooldownMs;
        console.warn(
          `[CIRCUIT BREAKER DISPARADO] Limite de ${CONFIG_OPERACIONAL.limiteFalhasConsecutivas} falhas atingido (${status}). ` +
          `Circuito ABERTO por ${CONFIG_OPERACIONAL.cooldownMs / 1000}s para proteger a aplicação e a Conta Azul.`
        );
      }

      throw new Error(`ERRO_TRANSITORIO_CA_${status}`);
    }

    if (status === 401) {
      throw new Error('TOKEN_EXPIRADO');
    }

    if (status === 404) {
      return null;
    }

    const erroTxt = await res.text();
    throw new Error(`Erro na API Conta Azul (${status}): ${erroTxt}`);
  } catch (err: any) {
    if (
      err instanceof AuditoriaDesativadaError ||
      err instanceof AuditoriaMetodoNaoPermitidoError ||
      err instanceof AuditoriaLimiteRequisicoesExcedidoError ||
      err instanceof CircuitBreakerOpenError
    ) {
      throw err;
    }

    const isTimeout = err?.name === 'AbortError' || err?.code === 'ETIMEDOUT';
    if (isTimeout) {
      circuitBreaker.falhasConsecutivas++;
      if (circuitBreaker.falhasConsecutivas >= CONFIG_OPERACIONAL.limiteFalhasConsecutivas) {
        circuitBreaker.estado = 'OPEN';
        circuitBreaker.abertoAte = agora + CONFIG_OPERACIONAL.cooldownMs;
      }
    }

    throw err;
  }
}
