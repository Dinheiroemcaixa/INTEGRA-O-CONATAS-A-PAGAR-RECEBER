/**
 * Gerenciador centralizado de tokens OAuth do Conta Azul.
 * 
 * Substitui o bloco duplicado de ~20 linhas que existia em cada rota de API.
 * Responsável por:
 *  1. Buscar a empresa no banco (Supabase)
 *  2. Verificar se o access_token está prestes a expirar (margem de 5 min)
 *  3. Se expirado, renovar via refresh_token e salvar os novos tokens
 *  4. Retornar o accessToken válido
 *  5. Proteger contra concorrência (Race Conditions) com fila/lock em memória e re-checagem no banco
 */

import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { refreshToken, OAuthError } from './api'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface InFlightRefreshEntry {
  promise: Promise<ValidTokenResult>
  forceRefresh: boolean
  didRefresh: boolean
}

/** Fila/Lock em memória para evitar renovações simultâneas da mesma empresa */
const refreshPromises = new Map<string, InFlightRefreshEntry>()

/** Categoria semântica do erro de conexão OAuth para diagnóstico e roteamento */
export type ConnectionErrorCategory =
  | 'DISCONNECTED'
  | 'AUTH_REVOKED'
  | 'REFRESH_INVALID'
  | 'TRANSIENT_ERROR'
  | 'PERSISTENCE_ERROR'
  | 'CONFIG_ERROR'

/** Erro específico de token para tratamento nas rotas */
export class TokenError extends Error {
  public statusCode: number
  public category: ConnectionErrorCategory
  constructor(message: string, statusCode = 401, category?: ConnectionErrorCategory) {
    super(message)
    this.name = 'TokenError'
    this.statusCode = statusCode
    this.category =
      category ??
      (statusCode === 401
        ? 'DISCONNECTED'
        : statusCode === 502
          ? 'TRANSIENT_ERROR'
          : statusCode === 500
            ? 'PERSISTENCE_ERROR'
            : 'TRANSIENT_ERROR')
  }
}

/**
 * Classifica o subtipo de erro `invalid_grant` retornado pelo Cognito da Conta Azul,
 * considerando tanto o campo `error_subtype` quanto `error_description` (já que o Cognito
 * frequentemente omite `error_subtype` e informa o motivo apenas em `error_description`).
 */
export function classifyInvalidGrantSubtype(
  errorSubtype?: string,
  errorDescription?: string
): 'access_revoked' | 'invalid_refresh_token' | 'ambiguous' {
  if (
    errorSubtype === 'access_revoked' ||
    (!errorSubtype &&
      errorDescription &&
      /revoked\s+by\s+user|access[_\s-]*revoked|authorization\s+revoked|permiss[aã]o\s+revogada/i.test(
        errorDescription
      ))
  ) {
    return 'access_revoked'
  }
  if (
    errorSubtype === 'invalid_refresh_token' ||
    (!errorSubtype && (!errorDescription || !errorDescription.trim())) ||
    (!errorSubtype &&
      Boolean(
        errorDescription &&
          /invalid[\s_-]*refresh[\s_-]*token|refresh[\s_-]*token[\s_-]*(has[\s_-]*)?(expired|been[\s_-]*revoked|is[\s_-]*invalid|invalid|not[\s_-]*valid)|expired[\s_-]*refresh[\s_-]*token|^invalid[\s_-]*grant$|invalid[\s_-]*grant[\s_:.-]|token[\s_-]*(has[\s_-]*been[\s_-]*revoked|is[\s_-]*not[\s_-]*valid|expired|invalid)|authorization[\s_-]*grant[\s_-]*(is[\s_-]*)?(invalid|expired)/i.test(
            errorDescription
          )
      ))
  ) {
    return 'invalid_refresh_token'
  }
  return 'ambiguous'
}

export interface ValidTokenResult {
  accessToken: string
  empresa: Record<string, any>
}

export interface GetValidTokenOptions {
  bypassInMemoryLock?: boolean
  failedAccessToken?: string
  lockTtlMs?: number
  disableLockHeartbeat?: boolean
  heartbeatIntervalMs?: number
  invalidGrantPollDelaysMs?: number[]
}

const DEFAULT_INVALID_GRANT_POLL_DELAYS_MS = [150, 250, 350, 450, 600]
const EXPIRATION_SAFETY_MARGIN_MS = 5 * 60 * 1000

const LOCK_EPOCH_OFFSET_MS = 1_000_000_000_000
const LOCK_EPOCH_MAX_MS = 978_307_200_000 // 2001-01-01T00:00:00.000Z
const DEFAULT_DISTRIBUTED_LOCK_TTL_MS = 25_000

const INSTANCE_LOCK_BUCKET_SEED = crypto.randomInt(0, 90)
let lockAcquisitionSeq = 0

/**
 * Codifica um lease de bloqueio distribuído na coluna TIMESTAMPTZ de expiração
 * sem necessidade de novas colunas na tabela `empresas`.
 */
export function encodeDistributedRefreshLock(leaseUntilMs: number): string {
  return new Date(leaseUntilMs - LOCK_EPOCH_OFFSET_MS).toISOString()
}

/**
 * Gera um lease distribuído exclusivo combinando particionamento determinístico de buckets +
 * entropia criptográfica por instância e por chamada codificada nos microssegundos (.sssUUUZ),
 * garantindo zero inflação em milissegundos sobre baseLeaseUntilMs.
 */
export function createUniqueDistributedRefreshLock(baseLeaseUntilMs: number): string {
  lockAcquisitionSeq = (lockAcquisitionSeq + 1) % 90
  const bucket = (INSTANCE_LOCK_BUCKET_SEED + lockAcquisitionSeq) % 90
  const microDigits = String(bucket * 10 + crypto.randomInt(1, 10)).padStart(3, '0')
  const rawEncodedMs = baseLeaseUntilMs - LOCK_EPOCH_OFFSET_MS
  const boundedEncodedMs = Math.max(1, Math.min(LOCK_EPOCH_MAX_MS - 1, rawEncodedMs))
  const isoMs = new Date(boundedEncodedMs).toISOString() // YYYY-MM-DDTHH:mm:ss.sssZ
  return isoMs.slice(0, -1) + microDigits + 'Z' // YYYY-MM-DDTHH:mm:ss.sssUUUZ
}

/**
 * Decodifica o timestamp (ms) de expiração do lease distribuído caso o valor
 * armazene um lock codificado (`ms > 0 && ms < LOCK_EPOCH_MAX_MS`), ou `null` caso contrário.
 */
export function decodeDistributedRefreshLock(rawExp: string | null | undefined): number | null {
  if (typeof rawExp !== 'string' || rawExp.trim().length === 0) return null
  const ms = new Date(rawExp).getTime()
  if (Number.isNaN(ms) || ms <= 0 || ms >= LOCK_EPOCH_MAX_MS) return null
  return ms + LOCK_EPOCH_OFFSET_MS
}

export function isDistributedRefreshLockActive(
  rawExp: string | null | undefined,
  nowMs: number = Date.now()
): boolean {
  const until = decodeDistributedRefreshLock(rawExp)
  return until !== null && until > nowMs
}

export function isDistributedRefreshLockExpired(
  rawExp: string | null | undefined,
  nowMs: number = Date.now()
): boolean {
  const until = decodeDistributedRefreshLock(rawExp)
  return until !== null && until <= nowMs
}

function extractIsoMicroFraction(rawExp: string | null | undefined): string | null {
  if (typeof rawExp !== 'string') return null
  const m = rawExp.match(/\.(\d{3,6})(?:Z|[+-]\d{2}:\d{2})$/i)
  return m ? m[1].padEnd(6, '0') : null
}

export function isSameDistributedLockLease(
  rawExpA: string | null | undefined,
  rawExpB: string | null | undefined
): boolean {
  if (rawExpA === rawExpB) return true
  const decA = decodeDistributedRefreshLock(rawExpA)
  const decB = decodeDistributedRefreshLock(rawExpB)
  if (decA === null || decA !== decB) return false
  return extractIsoMicroFraction(rawExpA) === extractIsoMicroFraction(rawExpB)
}

export function sanitizeRestorableExpiration(rawExp: string | null | undefined): string | null {
  if (rawExp === null || rawExp === undefined) return null
  if (decodeDistributedRefreshLock(rawExp) !== null) {
    return new Date(0).toISOString()
  }
  return rawExp
}

export function sanitizePublicExpirationIso(rawExp: string | null | undefined): string | null {
  if (!rawExp || typeof rawExp !== 'string' || rawExp.trim().length === 0) return null
  if (decodeDistributedRefreshLock(rawExp) !== null) return null
  return rawExp
}

export interface EmpresaConnectionStatus {
  empresa_id: string
  modulo: 'financeiro' | 'vendas'
  status: 'CONECTADA' | 'ATENCAO' | 'DESCONECTADA'
  conectado: boolean
  operacional: boolean
  renovado?: boolean
  expira_em?: string | null
  motivo?: string
  categoria_erro?: ConnectionErrorCategory
}

export async function evaluateEmpresaStatus(
  id: string,
  modulo: 'financeiro' | 'vendas',
  empresaRow?: Record<string, any> | null,
  allowRefresh: boolean = true
): Promise<EmpresaConnectionStatus> {
  const isVendas = modulo === 'vendas'
  const tokenKey = isVendas ? 'access_token_conta_azul_vendas' : 'access_token_conta_azul'
  const refreshKey = isVendas ? 'refresh_token_conta_azul_vendas' : 'refresh_token_conta_azul'
  const expiracaoKey = isVendas ? 'data_expiracao_token_vendas' : 'data_expiracao_token'

  let row = empresaRow
  if (!row) {
    const { data, error } = await supabaseAdmin
      .from('empresas')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !data) {
      return {
        empresa_id: id,
        modulo,
        status: 'DESCONECTADA',
        conectado: false,
        operacional: false,
        motivo: 'Empresa não encontrada',
        categoria_erro: 'DISCONNECTED',
      }
    }
    row = data
  }

  const targetRow = row!
  const isConnectedFlag = targetRow[isVendas ? 'conta_azul_vendas_connected' : 'conta_azul_connected']
  const hasAccessToken = typeof targetRow[tokenKey] === 'string' && targetRow[tokenKey].trim().length > 0
  const hasRefreshToken = typeof targetRow[refreshKey] === 'string' && targetRow[refreshKey].trim().length > 0

  if (isConnectedFlag === false || (!hasAccessToken && !hasRefreshToken)) {
    return {
      empresa_id: id,
      modulo,
      status: 'DESCONECTADA',
      conectado: false,
      operacional: false,
      motivo: 'Empresa desconectada ou sem credenciais OAuth salvas.',
      categoria_erro: 'DISCONNECTED',
    }
  }

  if (!allowRefresh) {
    if (isDistributedRefreshLockActive(targetRow[expiracaoKey])) {
      return {
        empresa_id: id,
        modulo,
        status: 'ATENCAO',
        conectado: true,
        operacional: true,
        renovado: false,
        expira_em: null,
        motivo: 'Renovação automática de token em andamento.',
      }
    }

    if (isDistributedRefreshLockExpired(targetRow[expiracaoKey])) {
      if (hasRefreshToken) {
        return {
          empresa_id: id,
          modulo,
          status: 'ATENCAO',
          conectado: true,
          operacional: false,
          renovado: false,
          expira_em: null,
          motivo: 'Bloqueio de renovação anterior expirou; aguardando renovação automática.',
        }
      }
      return {
        empresa_id: id,
        modulo,
        status: 'DESCONECTADA',
        conectado: false,
        operacional: false,
        expira_em: null,
        motivo: 'Sessão expirada sem refresh_token.',
        categoria_erro: 'DISCONNECTED',
      }
    }

    if (isAccessTokenValid(targetRow, tokenKey, expiracaoKey)) {
      return {
        empresa_id: id,
        modulo,
        status: 'CONECTADA',
        conectado: true,
        operacional: true,
        renovado: false,
        expira_em: sanitizePublicExpirationIso(targetRow[expiracaoKey]),
      }
    }

    if (hasRefreshToken) {
      return {
        empresa_id: id,
        modulo,
        status: 'ATENCAO',
        conectado: true,
        operacional: true,
        renovado: false,
        expira_em: sanitizePublicExpirationIso(targetRow[expiracaoKey]),
        motivo: 'Token próximo de expirar ou aguardando renovação automática.',
      }
    }

    return {
      empresa_id: id,
      modulo,
      status: 'DESCONECTADA',
      conectado: false,
      operacional: false,
      expira_em: null,
      motivo: 'Sessão expirada sem refresh_token.',
      categoria_erro: 'DISCONNECTED',
    }
  }

  try {
    const result = await getValidToken(id, modulo)
    return {
      empresa_id: id,
      modulo,
      status: 'CONECTADA',
      conectado: true,
      operacional: true,
      renovado: Boolean(hasAccessToken && result.accessToken !== targetRow[tokenKey]),
      expira_em: sanitizePublicExpirationIso(result.empresa?.[expiracaoKey] ?? targetRow[expiracaoKey]),
    }
  } catch (err: any) {
    if (err instanceof TokenError) {
      if (err.statusCode === 401) {
        return {
          empresa_id: id,
          modulo,
          status: 'DESCONECTADA',
          conectado: false,
          operacional: false,
          motivo: err.message,
          categoria_erro: err.category,
        }
      }
      return {
        empresa_id: id,
        modulo,
        status: 'ATENCAO',
        conectado: true,
        operacional: false,
        motivo: err.message,
        categoria_erro: err.category,
      }
    }

    return {
      empresa_id: id,
      modulo,
      status: 'ATENCAO',
      conectado: true,
      operacional: false,
      motivo: err?.message || 'Erro inesperado ao verificar status da conexão.',
      categoria_erro: 'TRANSIENT_ERROR',
    }
  }
}

function redactTokenSecrets(text: string, secrets: Array<string | undefined | null>): string {
  let sanitized = text
  for (const secret of secrets) {
    if (typeof secret === 'string' && secret.length >= 3) {
      sanitized = sanitized.split(secret).join('[REDACTED]')
    }
  }
  return sanitized
}

function buildClearPayload(isVendas: boolean): Record<string, any> {
  return isVendas
    ? {
        access_token_conta_azul_vendas: null,
        refresh_token_conta_azul_vendas: null,
        data_expiracao_token_vendas: null,
        conta_azul_vendas_connected: false,
      }
    : {
        access_token_conta_azul: null,
        refresh_token_conta_azul: null,
        data_expiracao_token: null,
        conta_azul_connected: false,
      }
}

/**
 * Verifica se o registro possui um access_token preenchido e data de expiração comprovadamente válida
 * (com margem de segurança de 5 minutos). Nunca considera válido um registro sem data de expiração.
 */
export function isAccessTokenValid(
  registro: Record<string, any> | null | undefined,
  tokenKey: string,
  expiracaoKey: string
): boolean {
  if (!registro) return false
  const token = registro[tokenKey]
  if (typeof token !== 'string' || token.trim().length === 0) return false
  const rawExp = registro[expiracaoKey]
  if (typeof rawExp !== 'string' || rawExp.trim().length === 0) return false
  const expMs = new Date(rawExp).getTime()
  if (Number.isNaN(expMs)) return false
  return expMs > Date.now() + EXPIRATION_SAFETY_MARGIN_MS
}

/**
 * Obtém um token de acesso válido para a empresa especificada.
 * Se o token estiver expirado (ou a menos de 5 min de expirar), 
 * renova automaticamente usando o refresh_token de forma segura e sincronizada.
 * 
 * @param empresaId - UUID da empresa no Supabase
 * @param modulo - 'financeiro' ou 'vendas'
 * @param forceRefresh - Forçar renovação imediata
 * @param options - Opções internas de controle (ex.: simulação de instâncias isoladas em testes)
 * @returns O accessToken válido e os dados da empresa
 * @throws TokenError se a empresa não existe, não tem token, ou não consegue renovar
 */
export async function getValidToken(
  empresaId: string,
  modulo: 'financeiro' | 'vendas' = 'financeiro',
  forceRefresh: boolean = false,
  options?: GetValidTokenOptions
): Promise<ValidTokenResult> {
  const lockKey = `${empresaId}:${modulo}`
  const bypassLock = Boolean(options?.bypassInMemoryLock)

  if (!bypassLock) {
    const existing = refreshPromises.get(lockKey)
    if (existing) {
      // Se a chamada atual não exige forceRefresh, ou se a operação em andamento já é um forceRefresh,
      // compartilha a mesma Promise em andamento para evitar renovações duplicadas concorrentes.
      if (!forceRefresh || existing.forceRefresh) {
        console.log(`[token-manager] Aguardando renovação em andamento para ${lockKey}...`)
        return await existing.promise
      }

      // Caso exista uma operação com forceRefresh=false em andamento e chegue um forceRefresh=true:
      // aguarda a operação atual terminar; se ela já tiver executado um refresh real ou retornado
      // um accessToken diferente do failedAccessToken, reutiliza o resultado.
      try {
        const res = await existing.promise
        if (
          existing.didRefresh ||
          (options?.failedAccessToken && res.accessToken !== options.failedAccessToken)
        ) {
          return res
        }
      } catch {
        // Se a operação anterior falhou, prossegue para tentar a renovação forçada
      }

      // Se outra chamada forceRefresh assumiu o lock enquanto aguardávamos, compartilha a Promise dela
      const afterWait = refreshPromises.get(lockKey)
      if (afterWait && afterWait.forceRefresh) {
        return await afterWait.promise
      }
    }
  }

  const entry: InFlightRefreshEntry = {
    promise: null as unknown as Promise<ValidTokenResult>,
    forceRefresh,
    didRefresh: false,
  }

  entry.promise = executeGetValidToken(
    empresaId,
    modulo,
    forceRefresh,
    0,
    () => {
      entry.didRefresh = true
    },
    options
  )

  if (!bypassLock) {
    refreshPromises.set(lockKey, entry)
  }

  try {
    return await entry.promise
  } finally {
    if (!bypassLock && refreshPromises.get(lockKey) === entry) {
      refreshPromises.delete(lockKey)
    }
  }
}

async function executeGetValidToken(
  empresaId: string,
  modulo: 'financeiro' | 'vendas',
  forceRefresh: boolean,
  retryCount: number = 0,
  onRefreshTriggered?: () => void,
  options?: GetValidTokenOptions
): Promise<ValidTokenResult> {
  // 1. Buscar empresa
  const { data: empresa, error: errEmp } = await supabaseAdmin
    .from('empresas')
    .select('*')
    .eq('id', empresaId)
    .single()

  if (errEmp || !empresa) {
    throw new TokenError('Empresa não encontrada', 404)
  }

  // Determinar qual conjunto de tokens usar
  const isVendas = modulo === 'vendas'
  const tokenKey = isVendas ? 'access_token_conta_azul_vendas' : 'access_token_conta_azul'
  const refreshKey = isVendas ? 'refresh_token_conta_azul_vendas' : 'refresh_token_conta_azul'
  const expiracaoKey = isVendas ? 'data_expiracao_token_vendas' : 'data_expiracao_token'

  let targetEmpresa = empresa
  const rawToken = empresa[tokenKey]

  if (!rawToken) {
    throw new TokenError(
      `Empresa "${empresa.nome}" não está conectada ao Conta Azul (${modulo === 'vendas' ? 'Vendas' : 'Financeiro'}). Acesse Empresas e conecte a Conta Azul.`,
      401
    )
  }

  // Se foi passado failedAccessToken e o banco já possui um access_token diferente e válido,
  // reutiliza imediatamente sem consumir o refresh_token!
  if (
    options?.failedAccessToken &&
    targetEmpresa[tokenKey] &&
    targetEmpresa[tokenKey] !== options.failedAccessToken &&
    isAccessTokenValid(targetEmpresa, tokenKey, expiracaoKey)
  ) {
    console.log(
      `[token-manager] Token (${modulo}) no banco já difere do failedAccessToken e está válido para empresa ${targetEmpresa.nome || empresaId}. Reutilizando sem refresh.`
    )
    return { accessToken: targetEmpresa[tokenKey], empresa: targetEmpresa }
  }

  // 2. Verificar expiração (margem de 5 minutos)
  let accessToken = rawToken
  let tokenExpirado = !isAccessTokenValid(targetEmpresa, tokenKey, expiracaoKey)

  // 3. Se expirado (e não forçado), faz uma re-checagem no banco para ver se outro processo acabou de renovar
  if (tokenExpirado && !forceRefresh) {
    const { data: latestEmpresa } = await supabaseAdmin
      .from('empresas')
      .select('*')
      .eq('id', empresaId)
      .single()

    if (latestEmpresa) {
      if (isAccessTokenValid(latestEmpresa, tokenKey, expiracaoKey)) {
        console.log(`[token-manager] Token (${modulo}) já foi renovado por outro processo para empresa ${latestEmpresa.nome || empresaId}`)
        return { accessToken: latestEmpresa[tokenKey], empresa: latestEmpresa }
      }
      targetEmpresa = latestEmpresa
    }
  }

  // 4. Renovar se necessário ou se solicitado (forceRefresh)
  let currentRefreshToken = targetEmpresa[refreshKey]
  if ((tokenExpirado || forceRefresh) && currentRefreshToken) {
    const clientId = process.env.CONTA_AZUL_CLIENT_ID
    const clientSecret = process.env.CONTA_AZUL_CLIENT_SECRET

    // Pre-flight check: Não tenta renovar sem credenciais no ambiente, protegendo os tokens existentes
    if (!clientId || !clientSecret) {
      console.warn(`[token-manager] Renovação ignorada: CONTA_AZUL_CLIENT_ID ou CLIENT_SECRET ausentes no ambiente. Tokens PRESERVADOS para empresa ${targetEmpresa.nome || targetEmpresa.id}.`)
      throw new TokenError(
        `Configurações da integração Conta Azul ausentes no ambiente. A renovação não pôde ser executada, mas seus tokens foram preservados.`,
        500,
        'CONFIG_ERROR'
      )
    }

    const lockTtlMs =
      typeof options?.lockTtlMs === 'number' && options.lockTtlMs > 0
        ? options.lockTtlMs
        : DEFAULT_DISTRIBUTED_LOCK_TTL_MS
    const pollIntervalMs = process.env.NODE_ENV === 'test' ? 50 : 150

    /**
     * Avalia se outra instância concorrente já substituiu o refresh_token no banco.
     * - Se substituiu e o novo access_token está comprovadamente válido (isAccessTokenValid), reutiliza.
     * - Se substituiu mas o access_token relido está expirado ou sem validade confirmada, tenta no máximo
     *   1 renovação controlada (retryCount < 1); se o limite de tentativas já foi atingido ou o token
     *   for inválido, lança TokenError sem jamais devolver token expirado.
     * - Se não houve substituição do refresh_token, retorna null.
     */
    const tryReuseOrRetryIfReplaced = async (
      registroAtual: Record<string, any> | null | undefined
    ): Promise<ValidTokenResult | null> => {
      if (
        registroAtual &&
        typeof registroAtual[refreshKey] === 'string' &&
        registroAtual[refreshKey].trim().length > 0 &&
        registroAtual[refreshKey] !== currentRefreshToken
      ) {
        if (isAccessTokenValid(registroAtual, tokenKey, expiracaoKey)) {
          console.log(
            `[token-manager] Token (${modulo}) já foi atualizado por outra operação para empresa ${registroAtual.nome || empresaId}. Reutilizando estado atualizado.`
          )
          return { accessToken: registroAtual[tokenKey], empresa: registroAtual }
        }

        if (
          retryCount < 1 &&
          typeof registroAtual[tokenKey] === 'string' &&
          registroAtual[tokenKey].trim().length > 0
        ) {
          console.log(
            `[token-manager] Novo refresh_token detectado no banco com access_token expirado para empresa ${registroAtual.nome || empresaId} (${modulo}), executando 1 nova tentativa controlada...`
          )
          return await executeGetValidToken(
            empresaId,
            modulo,
            forceRefresh,
            retryCount + 1,
            onRefreshTriggered,
            options
          )
        }

        throw new TokenError(
          `Não foi possível obter um token válido para a Conta Azul (${modulo}) após atualização concorrente: o token registrado no banco está expirado ou sem validade confirmada.`,
          401,
          'DISCONNECTED'
        )
      }
      return null
    }

    /**
     * Aguarda outra instância que detém o bloqueio distribuído concluir a renovação
     * (incluindo extensões de lease via heartbeat).
     */
    const waitForDistributedLockHolder = async (
      initialRow: Record<string, any> | null | undefined
    ): Promise<{ resolved?: ValidTokenResult; latestRow?: Record<string, any> | null }> => {
      let atual = initialRow
      const maxWaitMs = Math.max(lockTtlMs * 3, 35_000)
      const deadline = Date.now() + maxWaitMs

      while (Date.now() < deadline) {
        if (atual) {
          if (
            options?.failedAccessToken &&
            atual[tokenKey] &&
            atual[tokenKey] !== options.failedAccessToken &&
            isAccessTokenValid(atual, tokenKey, expiracaoKey)
          ) {
            return { resolved: { accessToken: atual[tokenKey], empresa: atual } }
          }

          if (isAccessTokenValid(atual, tokenKey, expiracaoKey)) {
            if (
              !forceRefresh ||
              options?.failedAccessToken ||
              atual[refreshKey] !== currentRefreshToken ||
              atual[tokenKey] !== rawToken
            ) {
              return { resolved: { accessToken: atual[tokenKey], empresa: atual } }
            }
          }

          if (atual[refreshKey] && atual[refreshKey] !== currentRefreshToken) {
            const reused = await tryReuseOrRetryIfReplaced(atual)
            if (reused) return { resolved: reused }
          }

          if (!isDistributedRefreshLockActive(atual[expiracaoKey])) {
            return { latestRow: atual }
          }
        }

        await new Promise((r) => setTimeout(r, pollIntervalMs))
        const { data: polled } = await supabaseAdmin
          .from('empresas')
          .select('*')
          .eq('id', empresaId)
          .single()
        atual = polled
      }

      return { latestRow: atual }
    }

    // Loop determinístico de aquisição/espera/takeover do bloqueio distribuído
    let restorableRawExp: string | null = sanitizeRestorableExpiration(targetEmpresa[expiracaoKey])
    let leaseIso = ''
    let lockAcquired = false
    let degradedLockMode = false
    const maxAcquireDeadline = Date.now() + Math.max(lockTtlMs * 4, 45_000)

    while (!lockAcquired && !degradedLockMode && Date.now() < maxAcquireDeadline) {
      if (isDistributedRefreshLockActive(targetEmpresa[expiracaoKey])) {
        const waitRes = await waitForDistributedLockHolder(targetEmpresa)
        if (waitRes.resolved) {
          return waitRes.resolved
        }
        if (waitRes.latestRow) {
          if (
            options?.failedAccessToken &&
            waitRes.latestRow[tokenKey] &&
            waitRes.latestRow[tokenKey] !== options.failedAccessToken &&
            isAccessTokenValid(waitRes.latestRow, tokenKey, expiracaoKey)
          ) {
            return { accessToken: waitRes.latestRow[tokenKey], empresa: waitRes.latestRow }
          }

          const reusedAfterWait = await tryReuseOrRetryIfReplaced(waitRes.latestRow)
          if (reusedAfterWait) {
            return reusedAfterWait
          }

          targetEmpresa = waitRes.latestRow
          currentRefreshToken = targetEmpresa[refreshKey]
          if (!currentRefreshToken) {
            throw new TokenError(
              'Sua conexão com a Conta Azul expirou e não possui refresh_token válido. Acesse Empresas e reconecte.',
              401,
              'DISCONNECTED'
            )
          }

          if (isDistributedRefreshLockActive(targetEmpresa[expiracaoKey])) {
            continue
          }
        }
      }

      const expectedRawExp: string | null = targetEmpresa[expiracaoKey] ?? null
      restorableRawExp = sanitizeRestorableExpiration(expectedRawExp)
      leaseIso = createUniqueDistributedRefreshLock(Date.now() + lockTtlMs)

      let lockQuery: any = supabaseAdmin
        .from('empresas')
        .update({ [expiracaoKey]: leaseIso })
        .eq('id', targetEmpresa.id)
        .eq(refreshKey, currentRefreshToken)

      if (expectedRawExp !== null) {
        lockQuery = lockQuery.eq(expiracaoKey, expectedRawExp)
      } else {
        lockQuery =
          typeof lockQuery.is === 'function'
            ? lockQuery.is(expiracaoKey, null)
            : lockQuery.eq(expiracaoKey, null)
      }

      const { data: lockRows, error: lockErr } = await lockQuery.select('id')

      if (lockErr) {
        // Modo degradado seguro: não aborta por falha transitória no lock; o CAS final e seu retry tratarão a escrita
        degradedLockMode = true
        break
      }

      if (Array.isArray(lockRows) && lockRows.length > 0) {
        lockAcquired = true
        break
      }

      // 0 linhas atualizadas ao tentar adquirir o lock: relê o banco imediatamente
      const { data: relida } = await supabaseAdmin
        .from('empresas')
        .select('*')
        .eq('id', empresaId)
        .single()

      if (!relida) {
        throw new TokenError('Empresa não encontrada', 404)
      }

      if (
        options?.failedAccessToken &&
        relida[tokenKey] &&
        relida[tokenKey] !== options.failedAccessToken &&
        isAccessTokenValid(relida, tokenKey, expiracaoKey)
      ) {
        return { accessToken: relida[tokenKey], empresa: relida }
      }

      const reused = await tryReuseOrRetryIfReplaced(relida)
      if (reused) {
        return reused
      }

      if (
        relida[expiracaoKey] === expectedRawExp &&
        relida[refreshKey] === currentRefreshToken
      ) {
        // Nenhuma outra instância alterou a linha (ex.: simulação forceZeroUpdatedRows = true em teste)
        degradedLockMode = true
        break
      }

      targetEmpresa = relida
      currentRefreshToken = relida[refreshKey]
      if (!currentRefreshToken) {
        throw new TokenError(
          'Sua conexão com a Conta Azul expirou e não possui refresh_token válido. Acesse Empresas e reconecte.',
          401,
          'DISCONNECTED'
        )
      }
    }

    if (!lockAcquired && !degradedLockMode) {
      throw new TokenError(
        'Outra renovação OAuth ainda está em andamento para esta empresa. Tente novamente em instantes.',
        503,
        'TRANSIENT_ERROR'
      )
    }

    const releaseDistributedLockIfHeld = async () => {
      if (!lockAcquired) return
      lockAcquired = false
      try {
        await supabaseAdmin
          .from('empresas')
          .update({ [expiracaoKey]: restorableRawExp })
          .eq('id', targetEmpresa.id)
          .eq(refreshKey, currentRefreshToken)
          .eq(expiracaoKey, leaseIso)
          .select('id')
      } catch {
        // Ignora erro ao liberar lock; o TTL expirará automaticamente
      }
    }

    // Releitura obrigatória após adquirir o bloqueio (Requisito 2.3) antes de chamar refreshToken()
    if (lockAcquired) {
      const { data: posLock } = await supabaseAdmin
        .from('empresas')
        .select('*')
        .eq('id', empresaId)
        .single()

      if (posLock) {
        if (posLock[refreshKey] !== currentRefreshToken) {
          await releaseDistributedLockIfHeld()
          if (isAccessTokenValid(posLock, tokenKey, expiracaoKey)) {
            return { accessToken: posLock[tokenKey], empresa: posLock }
          }
          const reusedPosLock = await tryReuseOrRetryIfReplaced(posLock)
          if (reusedPosLock) {
            return reusedPosLock
          }
        }

        if (
          options?.failedAccessToken &&
          posLock[tokenKey] &&
          posLock[tokenKey] !== options.failedAccessToken &&
          isAccessTokenValid(posLock, tokenKey, expiracaoKey)
        ) {
          await releaseDistributedLockIfHeld()
          return { accessToken: posLock[tokenKey], empresa: posLock }
        }
      }
    }

    try {
      onRefreshTriggered?.()

      let hbTimer: ReturnType<typeof setInterval> | null = null
      let inFlightHeartbeat: Promise<void> | null = null

      if (lockAcquired && !options?.disableLockHeartbeat) {
        const hbInterval =
          options?.heartbeatIntervalMs ??
          Math.max(100, Math.min(5_000, Math.floor(lockTtlMs * 0.4)))

        hbTimer = setInterval(() => {
          if (!lockAcquired || inFlightHeartbeat) return
          inFlightHeartbeat = (async () => {
            try {
              if (!lockAcquired) return
              const nextLeaseIso = createUniqueDistributedRefreshLock(Date.now() + lockTtlMs)
              const hbRes = await supabaseAdmin
                .from('empresas')
                .update({ [expiracaoKey]: nextLeaseIso })
                .eq('id', targetEmpresa.id)
                .eq(refreshKey, currentRefreshToken)
                .eq(expiracaoKey, leaseIso)
                .select('id')

              if (!hbRes.error && Array.isArray(hbRes.data)) {
                if (hbRes.data.length > 0) {
                  leaseIso = nextLeaseIso
                } else {
                  lockAcquired = false
                  if (hbTimer) {
                    clearInterval(hbTimer)
                    hbTimer = null
                  }
                }
              }
            } catch {
              // Ignora falha transitória de heartbeat
            } finally {
              inFlightHeartbeat = null
            }
          })()
        }, hbInterval)
      }

      let novosTokens: Awaited<ReturnType<typeof refreshToken>>
      try {
        novosTokens = await refreshToken(
          currentRefreshToken,
          clientId,
          clientSecret
        )
      } finally {
        if (hbTimer) {
          clearInterval(hbTimer)
          hbTimer = null
        }
        if (inFlightHeartbeat) {
          await inFlightHeartbeat
        }
      }

      accessToken = novosTokens.access_token

      const updateData: Record<string, any> = {
        [tokenKey]: novosTokens.access_token,
        [refreshKey]: novosTokens.refresh_token || currentRefreshToken,
        [expiracaoKey]: new Date(Date.now() + (novosTokens.expires_in || 3600) * 1000).toISOString(),
      }

      if (isVendas) {
        updateData.conta_azul_vendas_connected = true
      } else {
        updateData.conta_azul_connected = true
      }

      // Salvamento condicional (Compare-and-Swap pelo refresh_token anterior; já substitui expiracaoKey liberando o lock)
      let { data: updatedRows, error: errUpdate } = await supabaseAdmin
        .from('empresas')
        .update(updateData)
        .eq('id', targetEmpresa.id)
        .eq(refreshKey, currentRefreshToken)
        .select('id')

      // Se houver falha de escrita no Supabase, faz 1 re-tentativa imediata do UPDATE condicional
      // sem chamar refreshToken novamente na Conta Azul (pois o refresh_token é de uso único).
      if (errUpdate) {
        const safeErrMsg = redactTokenSecrets(errUpdate.message || String(errUpdate), [
          currentRefreshToken,
          accessToken,
          novosTokens.refresh_token,
          clientId,
          clientSecret,
        ])
        console.warn(
          `[token-manager] Falha ao persistir novos tokens (${modulo}) na 1ª tentativa para empresa ${targetEmpresa.nome || targetEmpresa.id}: ${safeErrMsg}. Retentando escrita no banco...`
        )
        const retryWrite = await supabaseAdmin
          .from('empresas')
          .update(updateData)
          .eq('id', targetEmpresa.id)
          .eq(refreshKey, currentRefreshToken)
          .select('id')
        updatedRows = retryWrite.data
        errUpdate = retryWrite.error
      }

      if (errUpdate) {
        const safeErrMsg = redactTokenSecrets(errUpdate.message || String(errUpdate), [
          currentRefreshToken,
          accessToken,
          novosTokens.refresh_token,
          clientId,
          clientSecret,
        ])
        console.error(
          `[token-manager] Falha persistente ao salvar novos tokens (${modulo}) no Supabase para empresa ${targetEmpresa.nome || targetEmpresa.id}: ${safeErrMsg}`
        )

        const { data: atualPosErro } = await supabaseAdmin
          .from('empresas')
          .select('*')
          .eq('id', empresaId)
          .single()

        const reusedAfterWriteError = await tryReuseOrRetryIfReplaced(atualPosErro)
        if (reusedAfterWriteError) {
          return reusedAfterWriteError
        }

        await releaseDistributedLockIfHeld()

        throw new TokenError(
          `Falha ao persistir os novos tokens da Conta Azul (${modulo}) no banco de dados: ${safeErrMsg}`,
          500,
          'PERSISTENCE_ERROR'
        )
      }

      if (!Array.isArray(updatedRows) || updatedRows.length === 0) {
        console.warn(
          `[token-manager] Atualização condicional não modificou linhas para empresa ${targetEmpresa.nome || targetEmpresa.id} (${modulo}). Relendo estado atual no banco...`
        )
        const { data: atual } = await supabaseAdmin
          .from('empresas')
          .select('*')
          .eq('id', empresaId)
          .single()

        const reusedAfterZeroRows = await tryReuseOrRetryIfReplaced(atual)
        if (reusedAfterZeroRows) {
          return reusedAfterZeroRows
        }

        // Proteção contra limpeza concorrente por perdedor: se outra instância limpou refresh_token para null,
        // mas esta instância recebeu novosTokens válidos do Cognito, recupera a conexão atomicamente!
        if (atual && !atual[refreshKey]) {
          let recoverQuery: any = supabaseAdmin
            .from('empresas')
            .update(updateData)
            .eq('id', targetEmpresa.id)
          recoverQuery =
            typeof recoverQuery.is === 'function'
              ? recoverQuery.is(refreshKey, null)
              : recoverQuery.eq(refreshKey, null)
          const { data: recoveredRows, error: recoverErr } = await recoverQuery.select('id')
          if (!recoverErr && Array.isArray(recoveredRows) && recoveredRows.length > 0) {
            lockAcquired = false
            console.log(
              `[token-manager] Conexão (${modulo}) recuperada com sucesso após limpeza concorrente para empresa ${targetEmpresa.nome || targetEmpresa.id}`
            )
            return { accessToken, empresa: { ...atual, ...updateData } }
          }
        }

        await releaseDistributedLockIfHeld()

        throw new TokenError(
          `Sua conexão com a Conta Azul (${modulo}) foi alterada, desconectada ou não possui token válido após atualização concorrente. Acesse Empresas e conecte a Conta Azul.`,
          401,
          'DISCONNECTED'
        )
      }

      lockAcquired = false
      console.log(`[token-manager] Token (${modulo}) renovado com sucesso para empresa ${targetEmpresa.nome || targetEmpresa.id}`)
      targetEmpresa = { ...targetEmpresa, ...updateData }
    } catch (errRefresh: any) {
      if (errRefresh instanceof TokenError) {
        await releaseDistributedLockIfHeld()
        throw errRefresh
      }

      const errorCode =
        errRefresh instanceof OAuthError
          ? errRefresh.errorCode
          : typeof errRefresh?.errorCode === 'string'
            ? errRefresh.errorCode
            : typeof errRefresh?.error === 'string'
              ? errRefresh.error
              : undefined
      const errorSubtype =
        errRefresh instanceof OAuthError
          ? errRefresh.errorSubtype
          : typeof errRefresh?.errorSubtype === 'string'
            ? errRefresh.errorSubtype
            : typeof errRefresh?.error_subtype === 'string'
              ? errRefresh.error_subtype
              : undefined
      const errorDescription =
        errRefresh instanceof OAuthError
          ? errRefresh.errorDescription
          : typeof errRefresh?.errorDescription === 'string'
            ? errRefresh.errorDescription
            : typeof errRefresh?.error_description === 'string'
              ? errRefresh.error_description
              : undefined

      const rawErrorMsg = errRefresh instanceof Error ? errRefresh.message : String(errRefresh)
      const safeErrorMsg = redactTokenSecrets(rawErrorMsg, [
        currentRefreshToken,
        accessToken,
        clientId,
        clientSecret,
      ])
      const safeDescription = errorDescription
        ? redactTokenSecrets(errorDescription, [currentRefreshToken, accessToken, clientId, clientSecret])
        : undefined

      console.error(
        `[token-manager] Falha ao renovar token (${modulo}) para empresa ${targetEmpresa.nome || targetEmpresa.id}:`,
        {
          statusCode: errRefresh instanceof OAuthError ? errRefresh.statusCode : undefined,
          errorCode,
          errorSubtype,
          errorDescription: safeDescription,
          message: safeErrorMsg,
        }
      )

      // Caso A — invalid_client (falha nas credenciais do aplicativo)
      if (errorCode === 'invalid_client' || errorSubtype === 'invalid_client') {
        await releaseDistributedLockIfHeld()
        console.warn(
          `[token-manager] Falha de credenciais do aplicativo (invalid_client) ao renovar token (${modulo}) para ${targetEmpresa.nome || targetEmpresa.id}. Tokens da empresa PRESERVADOS.`
        )
        throw new TokenError(
          `Falha de autenticação nas credenciais do aplicativo Conta Azul (invalid_client) ao renovar conexão (${modulo}). Os tokens da empresa foram preservados.`,
          500,
          'CONFIG_ERROR'
        )
      }

      // Caso B — invalid_grant (requer releitura obrigatória e diferenciação por error_subtype ou error_description)
      if (errorCode === 'invalid_grant') {
        // Releitura obrigatória imediata antes de qualquer decisão destrutiva
        const { data: atual } = await supabaseAdmin
          .from('empresas')
          .select('*')
          .eq('id', empresaId)
          .single()

        const reusedFirstRead = await tryReuseOrRetryIfReplaced(atual)
        if (reusedFirstRead) {
          await releaseDistributedLockIfHeld()
          return reusedFirstRead
        }

        if (
          atual &&
          !isSameDistributedLockLease(atual[expiracaoKey], leaseIso) &&
          isDistributedRefreshLockActive(atual[expiracaoKey])
        ) {
          const waitRes = await waitForDistributedLockHolder(atual)
          if (waitRes.resolved) {
            return waitRes.resolved
          }
          if (waitRes.latestRow) {
            const reusedAfterLockWait = await tryReuseOrRetryIfReplaced(waitRes.latestRow)
            if (reusedAfterLockWait) {
              return reusedAfterLockWait
            }
          }
        }

        const classifiedSubtype = classifyInvalidGrantSubtype(errorSubtype, errorDescription)
        const updateDataClear = buildClearPayload(isVendas)

        // Subcaso B1 — access_revoked
        if (classifiedSubtype === 'access_revoked') {
          if (process.env.NODE_ENV === 'production') {
            const holderChanged =
              atual &&
              isDistributedRefreshLockActive(atual[expiracaoKey]) &&
              !isSameDistributedLockLease(atual[expiracaoKey], leaseIso)

            if (!holderChanged) {
              let clearQuery: any = supabaseAdmin
                .from('empresas')
                .update(updateDataClear)
                .eq('id', targetEmpresa.id)
                .eq(refreshKey, currentRefreshToken)
              if (lockAcquired) {
                clearQuery = clearQuery.eq(expiracaoKey, leaseIso)
              }
              const { data: clearedRows } = await clearQuery.select('id')
              lockAcquired = false

              if (Array.isArray(clearedRows) && clearedRows.length === 0) {
                const { data: posClear } = await supabaseAdmin
                  .from('empresas')
                  .select('*')
                  .eq('id', empresaId)
                  .single()
                const reusedAfterClear = await tryReuseOrRetryIfReplaced(posClear)
                if (reusedAfterClear) {
                  return reusedAfterClear
                }
                if (posClear && isAccessTokenValid(posClear, tokenKey, expiracaoKey)) {
                  return { accessToken: posClear[tokenKey], empresa: posClear }
                }
              }
            } else {
              lockAcquired = false
            }
          } else {
            const wasHoldingLock = lockAcquired
            lockAcquired = false
            let devUpdateQuery: any = supabaseAdmin
              .from('empresas')
              .update({
                [isVendas ? 'conta_azul_vendas_connected' : 'conta_azul_connected']: false,
                [expiracaoKey]: restorableRawExp,
              })
              .eq('id', targetEmpresa.id)
              .eq(refreshKey, currentRefreshToken)
            if (wasHoldingLock) {
              devUpdateQuery = devUpdateQuery.eq(expiracaoKey, leaseIso)
            }
            await devUpdateQuery.select('id')
            console.warn(
              `[token-manager] [DEV GUARD-RAIL] 'access_revoked' detectado em ambiente local. Tokens brutos preservados e status desconectado para empresa ${targetEmpresa.nome || targetEmpresa.id}.`
            )
          }

          throw new TokenError(
            `Sua conexão com a Conta Azul (${modulo}) foi revogada (access_revoked). Por favor, acesse Empresas e autorize novamente a Conta Azul.`,
            401,
            'AUTH_REVOKED'
          )
        }

        // Para invalid_refresh_token e ambiguous: polling iterativo (default 1.800ms em 5 etapas) para aguardar
        // eventual escrita concorrente de outra instância que venceu a corrida de rotação no Cognito.
        const pollDelays = options?.invalidGrantPollDelaysMs ?? DEFAULT_INVALID_GRANT_POLL_DELAYS_MS
        let ultimaLeitura: Record<string, any> | null | undefined = atual

        for (const delayMs of pollDelays) {
          await new Promise((resolve) => setTimeout(resolve, delayMs))

          const { data: leitura } = await supabaseAdmin
            .from('empresas')
            .select('*')
            .eq('id', empresaId)
            .single()

          ultimaLeitura = leitura

          const reusedPoll = await tryReuseOrRetryIfReplaced(leitura)
          if (reusedPoll) {
            await releaseDistributedLockIfHeld()
            return reusedPoll
          }

          if (
            leitura &&
            !isSameDistributedLockLease(leitura[expiracaoKey], leaseIso) &&
            isDistributedRefreshLockActive(leitura[expiracaoKey])
          ) {
            const waitRes = await waitForDistributedLockHolder(leitura)
            if (waitRes.resolved) {
              return waitRes.resolved
            }
            if (waitRes.latestRow) {
              ultimaLeitura = waitRes.latestRow
              const reusedAfterWait = await tryReuseOrRetryIfReplaced(waitRes.latestRow)
              if (reusedAfterWait) {
                return reusedAfterWait
              }
            }
          }
        }

        // Subcaso B2 — invalid_refresh_token (por error_subtype, error_description ou resposta vazia do Cognito)
        if (classifiedSubtype === 'invalid_refresh_token') {
          if (process.env.NODE_ENV === 'production') {
            const holderChanged =
              ultimaLeitura &&
              isDistributedRefreshLockActive(ultimaLeitura[expiracaoKey]) &&
              !isSameDistributedLockLease(ultimaLeitura[expiracaoKey], leaseIso)

            if (!holderChanged) {
              let clearQuery: any = supabaseAdmin
                .from('empresas')
                .update(updateDataClear)
                .eq('id', targetEmpresa.id)
                .eq(refreshKey, currentRefreshToken)
              if (lockAcquired) {
                clearQuery = clearQuery.eq(expiracaoKey, leaseIso)
              }
              const { data: clearedRows } = await clearQuery.select('id')
              lockAcquired = false

              if (Array.isArray(clearedRows) && clearedRows.length === 0) {
                const { data: posClear } = await supabaseAdmin
                  .from('empresas')
                  .select('*')
                  .eq('id', empresaId)
                  .single()
                const reusedAfterClear = await tryReuseOrRetryIfReplaced(posClear)
                if (reusedAfterClear) {
                  return reusedAfterClear
                }
                if (posClear && isAccessTokenValid(posClear, tokenKey, expiracaoKey)) {
                  return { accessToken: posClear[tokenKey], empresa: posClear }
                }
              }
            } else {
              lockAcquired = false
            }
          } else {
            const wasHoldingLock = lockAcquired
            lockAcquired = false
            let devUpdateQuery: any = supabaseAdmin
              .from('empresas')
              .update({
                [isVendas ? 'conta_azul_vendas_connected' : 'conta_azul_connected']: false,
                [expiracaoKey]: restorableRawExp,
              })
              .eq('id', targetEmpresa.id)
              .eq(refreshKey, currentRefreshToken)
            if (wasHoldingLock) {
              devUpdateQuery = devUpdateQuery.eq(expiracaoKey, leaseIso)
            }
            await devUpdateQuery.select('id')
            console.warn(
              `[token-manager] [DEV GUARD-RAIL] 'invalid_refresh_token' detectado em ambiente local. Tokens brutos preservados e status desconectado para empresa ${targetEmpresa.nome || targetEmpresa.id}.`
            )
          }

          throw new TokenError(
            `Sua conexão com a Conta Azul (${modulo}) expirou (invalid_refresh_token). Por favor, acesse Empresas e reconecte a Conta Azul.`,
            401,
            'REFRESH_INVALID'
          )
        }

        // Subcaso B3 — invalid_grant com subtipo desconhecido ou descrição ambígua
        await releaseDistributedLockIfHeld()
        console.warn(
          `[token-manager] 'invalid_grant' recebido sem error_subtype reconhecido (${errorSubtype || 'ausente'}) para empresa ${targetEmpresa.nome || targetEmpresa.id} (${modulo}). Tokens PRESERVADOS por segurança.`
        )
        throw new TokenError(
          `Não foi possível renovar a conexão com o Conta Azul (${modulo}): resposta OAuth ambígua (invalid_grant sem subtipo reconhecido). Seus tokens foram preservados por segurança.`,
          502,
          'TRANSIENT_ERROR'
        )
      }

      // Caso C — Falhas de rede, timeouts, HTTP 429/500/502/503/504 ou respostas inesperadas:
      // Preserva integralmente os tokens no banco.
      await releaseDistributedLockIfHeld()
      const status = errRefresh instanceof OAuthError ? (errRefresh.statusCode || 502) : 502

      console.warn(
        `[token-manager] Falha transitória/rede ao renovar token (${modulo}) para ${targetEmpresa.nome || targetEmpresa.id}. Tokens PRESERVADOS no banco. Detalhe:`,
        safeErrorMsg
      )

      throw new TokenError(
        `Não foi possível renovar a conexão com o Conta Azul (${modulo}): ${safeErrorMsg}. Seus dados de conexão foram preservados. Tente novamente mais tarde.`,
        status,
        'TRANSIENT_ERROR'
      )
    }
  } else if ((tokenExpirado || forceRefresh) && !currentRefreshToken) {
    if (process.env.NODE_ENV === 'production') {
      const updateDataClear = buildClearPayload(isVendas)
      await supabaseAdmin
        .from('empresas')
        .update(updateDataClear)
        .eq('id', targetEmpresa.id)
        .eq(tokenKey, accessToken)
        .select('id')
    }
    throw new TokenError(
      'Sua conexão com a Conta Azul expirou e não possui refresh_token válido. Acesse Empresas e reconecte.',
      401,
      'DISCONNECTED'
    )
  }

  return { accessToken, empresa: targetEmpresa }
}
