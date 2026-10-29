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

/** Erro específico de token para tratamento nas rotas */
export class TokenError extends Error {
  public statusCode: number
  constructor(message: string, statusCode = 401) {
    super(message)
    this.name = 'TokenError'
    this.statusCode = statusCode
  }
}

export interface ValidTokenResult {
  accessToken: string
  empresa: Record<string, any>
}

export interface GetValidTokenOptions {
  bypassInMemoryLock?: boolean
}

const INVALID_REFRESH_RECHECK_DELAY_MS = 150
const EXPIRATION_SAFETY_MARGIN_MS = 5 * 60 * 1000

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
      // aguarda a operação atual terminar; se ela já tiver executado um refresh real, reutiliza o resultado.
      try {
        const res = await existing.promise
        if (existing.didRefresh) {
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

  entry.promise = executeGetValidToken(empresaId, modulo, forceRefresh, 0, () => {
    entry.didRefresh = true
  })

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
  onRefreshTriggered?: () => void
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

  // 2. Verificar expiração (margem de 5 minutos)
  let accessToken = rawToken
  const tokenExpirado = !isAccessTokenValid(targetEmpresa, tokenKey, expiracaoKey)

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
  const currentRefreshToken = targetEmpresa[refreshKey]
  if ((tokenExpirado || forceRefresh) && currentRefreshToken) {
    const clientId = process.env.CONTA_AZUL_CLIENT_ID
    const clientSecret = process.env.CONTA_AZUL_CLIENT_SECRET

    // Pre-flight check: Não tenta renovar sem credenciais no ambiente, protegendo os tokens existentes
    if (!clientId || !clientSecret) {
      console.warn(`[token-manager] Renovação ignorada: CONTA_AZUL_CLIENT_ID ou CLIENT_SECRET ausentes no ambiente. Tokens PRESERVADOS para empresa ${targetEmpresa.nome || targetEmpresa.id}.`)
      throw new TokenError(
        `Configurações da integração Conta Azul ausentes no ambiente. A renovação não pôde ser executada, mas seus tokens foram preservados.`,
        500
      )
    }

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
            onRefreshTriggered
          )
        }

        throw new TokenError(
          `Não foi possível obter um token válido para a Conta Azul (${modulo}) após atualização concorrente: o token registrado no banco está expirado ou sem validade confirmada.`,
          401
        )
      }
      return null
    }

    try {
      onRefreshTriggered?.()
      const novosTokens = await refreshToken(
        currentRefreshToken,
        clientId,
        clientSecret
      )
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

      // Salvamento condicional (Compare-and-Swap pelo refresh_token anterior)
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

        throw new TokenError(
          `Falha ao persistir os novos tokens da Conta Azul (${modulo}) no banco de dados: ${safeErrMsg}`,
          500
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

        throw new TokenError(
          `Sua conexão com a Conta Azul (${modulo}) foi alterada, desconectada ou não possui token válido após atualização concorrente. Acesse Empresas e conecte a Conta Azul.`,
          401
        )
      }

      console.log(`[token-manager] Token (${modulo}) renovado com sucesso para empresa ${targetEmpresa.nome || targetEmpresa.id}`)
      targetEmpresa = { ...targetEmpresa, ...updateData }
    } catch (errRefresh: any) {
      if (errRefresh instanceof TokenError) {
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
        console.warn(
          `[token-manager] Falha de credenciais do aplicativo (invalid_client) ao renovar token (${modulo}) para ${targetEmpresa.nome || targetEmpresa.id}. Tokens da empresa PRESERVADOS.`
        )
        throw new TokenError(
          `Falha de autenticação nas credenciais do aplicativo Conta Azul (invalid_client) ao renovar conexão (${modulo}). Os tokens da empresa foram preservados.`,
          500
        )
      }

      // Caso B — invalid_grant (requer releitura obrigatória e diferenciação por error_subtype)
      if (errorCode === 'invalid_grant') {
        // Releitura obrigatória antes de qualquer decisão destrutiva
        const { data: atual } = await supabaseAdmin
          .from('empresas')
          .select('*')
          .eq('id', empresaId)
          .single()

        const reusedFirstRead = await tryReuseOrRetryIfReplaced(atual)
        if (reusedFirstRead) {
          return reusedFirstRead
        }

        const updateDataClear = buildClearPayload(isVendas)

        // Subcaso B1 — access_revoked
        if (errorSubtype === 'access_revoked') {
          if (process.env.NODE_ENV === 'production') {
            const { data: clearedRows } = await supabaseAdmin
              .from('empresas')
              .update(updateDataClear)
              .eq('id', targetEmpresa.id)
              .eq(refreshKey, currentRefreshToken)
              .select('id')

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
            }
          } else {
            console.warn(
              `[token-manager] [DEV GUARD-RAIL] 'access_revoked' detectado em ambiente local. Limpeza automática suprimida no Supabase para empresa ${targetEmpresa.nome || targetEmpresa.id}.`
            )
          }

          throw new TokenError(
            `Sua conexão com a Conta Azul (${modulo}) foi revogada (access_revoked). Por favor, acesse Empresas e autorize novamente a Conta Azul.`,
            401
          )
        }

        // Subcaso B2 — invalid_refresh_token (refresh_token rotativo: aguarda breve intervalo e relê)
        if (errorSubtype === 'invalid_refresh_token') {
          await new Promise((resolve) => setTimeout(resolve, INVALID_REFRESH_RECHECK_DELAY_MS))

          const { data: atualPosDelay } = await supabaseAdmin
            .from('empresas')
            .select('*')
            .eq('id', empresaId)
            .single()

          const reusedSecondRead = await tryReuseOrRetryIfReplaced(atualPosDelay)
          if (reusedSecondRead) {
            return reusedSecondRead
          }

          if (process.env.NODE_ENV === 'production') {
            const { data: clearedRows } = await supabaseAdmin
              .from('empresas')
              .update(updateDataClear)
              .eq('id', targetEmpresa.id)
              .eq(refreshKey, currentRefreshToken)
              .select('id')

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
            }
          } else {
            console.warn(
              `[token-manager] [DEV GUARD-RAIL] 'invalid_refresh_token' detectado em ambiente local. Limpeza automática suprimida no Supabase para empresa ${targetEmpresa.nome || targetEmpresa.id}.`
            )
          }

          throw new TokenError(
            `Sua conexão com a Conta Azul (${modulo}) expirou (invalid_refresh_token). Por favor, acesse Empresas e reconecte a Conta Azul.`,
            401
          )
        }

        // Subcaso B3 — invalid_grant sem error_subtype ou com subtipo desconhecido/ambíguo
        console.warn(
          `[token-manager] 'invalid_grant' recebido sem error_subtype reconhecido (${errorSubtype || 'ausente'}) para empresa ${targetEmpresa.nome || targetEmpresa.id} (${modulo}). Tokens PRESERVADOS por segurança.`
        )
        throw new TokenError(
          `Não foi possível renovar a conexão com o Conta Azul (${modulo}): resposta OAuth ambígua (invalid_grant sem subtipo reconhecido). Seus tokens foram preservados por segurança.`,
          502
        )
      }

      // Caso C — Falhas de rede, timeouts, HTTP 429/500/502/503/504 ou respostas inesperadas:
      // Preserva integralmente os tokens no banco.
      const status = errRefresh instanceof OAuthError ? (errRefresh.statusCode || 502) : 502

      console.warn(
        `[token-manager] Falha transitória/rede ao renovar token (${modulo}) para ${targetEmpresa.nome || targetEmpresa.id}. Tokens PRESERVADOS no banco. Detalhe:`,
        safeErrorMsg
      )

      throw new TokenError(
        `Não foi possível renovar a conexão com o Conta Azul (${modulo}): ${safeErrorMsg}. Seus dados de conexão foram preservados. Tente novamente mais tarde.`,
        status
      )
    }
  }

  return { accessToken, empresa: targetEmpresa }
}
