import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const loaderCode = `
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
const require = createRequire(pathToFileURL(path.resolve(process.cwd(), 'package.json')).href);
const ts = require('typescript');
function resolveTsOrTsx(basePath) {
  if (fs.existsSync(basePath + '.ts')) return basePath + '.ts';
  if (fs.existsSync(basePath + '.tsx')) return basePath + '.tsx';
  if (fs.existsSync(basePath + '/index.ts')) return basePath + '/index.ts';
  return basePath + '.ts';
}
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const rawTarget = path.resolve(process.cwd(), 'src', specifier.slice(2));
    const targetPath = path.extname(rawTarget) ? rawTarget : resolveTsOrTsx(rawTarget);
    return nextResolve(pathToFileURL(targetPath).href, context);
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !path.extname(specifier) && context.parentURL) {
    const parentDir = path.dirname(fileURLToPath(context.parentURL));
    const rawTarget = path.resolve(parentDir, specifier);
    const targetPath = resolveTsOrTsx(rawTarget);
    return nextResolve(pathToFileURL(targetPath).href, context);
  }
  return nextResolve(specifier, context);
}
export async function load(url, context, nextLoad) {
  if (url.endsWith('.tsx')) {
    const filePath = fileURLToPath(url);
    const source = fs.readFileSync(filePath, 'utf8');
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
      fileName: filePath,
    });
    return {
      format: 'module',
      shortCircuit: true,
      source: transpiled.outputText,
    };
  }
  return nextLoad(url, context);
}
`
register(`data:text/javascript,${encodeURIComponent(loaderCode)}`, pathToFileURL('./'))

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key'
process.env.CONTA_AZUL_CLIENT_ID = 'client-id-secret-test'
process.env.CONTA_AZUL_CLIENT_SECRET = 'client-secret-value-test'

interface EmpresaMock {
  id: string
  nome: string
  access_token_conta_azul?: string | null
  refresh_token_conta_azul?: string | null
  data_expiracao_token?: string | null
  conta_azul_connected?: boolean
  access_token_conta_azul_vendas?: string | null
  refresh_token_conta_azul_vendas?: string | null
  data_expiracao_token_vendas?: string | null
  conta_azul_vendas_connected?: boolean
  [key: string]: any
}

let mockEmpresasTable: EmpresaMock[] = []
let mockUpdatesLog: Array<{
  filters: Record<string, any>
  payload: Record<string, any>
  matchedCount: number
  error?: string
}> = []
let forceZeroUpdatedRows = false
let onBeforeUpdateHook: ((filters: Record<string, any>, payload: Record<string, any>) => {
  error?: { message: string } | null
  forceZeroRows?: boolean
} | void) | null = null

function createEmpresasQueryBuilder() {
  const filters: Record<string, any> = {}
  let pendingUpdate: Record<string, any> | null = null
  let isSingle = false

  const builder: any = {
    select(_cols?: string) {
      return builder
    },
    eq(col: string, val: any) {
      filters[col] = val
      return builder
    },
    is(col: string, val: any) {
      filters[col] = val
      return builder
    },
    update(payload: Record<string, any>) {
      pendingUpdate = payload
      return builder
    },
    single() {
      isSingle = true
      return builder
    },
    then(resolve: (val: any) => void, reject?: (err: any) => void) {
      try {
        if (pendingUpdate) {
          const hookRes = onBeforeUpdateHook
            ? onBeforeUpdateHook({ ...filters }, { ...pendingUpdate })
            : undefined

          if (hookRes?.error) {
            mockUpdatesLog.push({
              filters: { ...filters },
              payload: { ...pendingUpdate },
              matchedCount: 0,
              error: hookRes.error.message,
            })
            return Promise.resolve({ data: null, error: hookRes.error }).then(resolve, reject)
          }

          if (forceZeroUpdatedRows || hookRes?.forceZeroRows) {
            mockUpdatesLog.push({
              filters: { ...filters },
              payload: { ...pendingUpdate },
              matchedCount: 0,
            })
            return Promise.resolve({ data: [], error: null }).then(resolve, reject)
          }

          const matchedRows: Array<{ id: string }> = []
          mockEmpresasTable = mockEmpresasTable.map((row) => {
            const matches = Object.entries(filters).every(([k, v]) => row[k] === v)
            if (matches) {
              matchedRows.push({ id: row.id })
              return { ...row, ...pendingUpdate }
            }
            return row
          })

          mockUpdatesLog.push({
            filters: { ...filters },
            payload: { ...pendingUpdate },
            matchedCount: matchedRows.length,
          })

          return Promise.resolve({ data: matchedRows, error: null }).then(resolve, reject)
        }

        const matched = mockEmpresasTable.filter((row) =>
          Object.entries(filters).every(([k, v]) => row[k] === v)
        )

        if (isSingle) {
          if (matched.length === 0) {
            return Promise.resolve({
              data: null,
              error: { message: 'Row not found' },
            }).then(resolve, reject)
          }
          return Promise.resolve({
            data: { ...matched[0] },
            error: null,
          }).then(resolve, reject)
        }

        return Promise.resolve({
          data: matched.map((r) => ({ ...r })),
          error: null,
        }).then(resolve, reject)
      } catch (err) {
        if (reject) return reject(err)
        throw err
      }
    },
  }

  return builder
}

// Isola apenas a dependência externa do cliente Supabase;
// NÃO faz mock de src/lib/conta-azul/api.ts para que todos os testes exercitem o refreshToken e OAuthError reais!
mock.module('@supabase/supabase-js', {
  namedExports: {
    createClient: () => ({
      from: (table: string) => {
        assert.equal(table, 'empresas')
        return createEmpresasQueryBuilder()
      },
    }),
  },
})

let mockFetchHandler: (
  url: string,
  init: RequestInit | undefined,
  refreshTokenSent: string
) => Promise<Response>

global.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input.toString()
  const bodyParams =
    init?.body instanceof URLSearchParams
      ? init.body
      : new URLSearchParams(typeof init?.body === 'string' ? init.body : '')
  const refreshTokenSent = bodyParams.get('refresh_token') || ''
  return await mockFetchHandler(url, init, refreshTokenSent)
}) as typeof fetch

const { refreshToken, OAuthError } = await import('@/lib/conta-azul/api')
const {
  getValidToken,
  TokenError,
  isAccessTokenValid,
  encodeDistributedRefreshLock,
  createUniqueDistributedRefreshLock,
  decodeDistributedRefreshLock,
  isDistributedRefreshLockActive,
  isDistributedRefreshLockExpired,
  isSameDistributedLockLease,
  sanitizeRestorableExpiration,
  sanitizePublicExpirationIso,
  evaluateEmpresaStatus,
  classifyInvalidGrantSubtype,
} = await import('@/lib/conta-azul/token-manager')
const {
  classifyTokenExpirationState,
  getStatusConexaoEmpresa,
} = await import('@/contexts/EmpresaContext')

function jsonResponse(body: Record<string, any>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function expiredIso(): string {
  return new Date(Date.now() - 60 * 1000).toISOString()
}

function futureIso(minutes = 60): string {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString()
}

function tokenMutationsLog() {
  return mockUpdatesLog.filter(
    (u) =>
      'access_token_conta_azul' in u.payload ||
      'refresh_token_conta_azul' in u.payload ||
      'access_token_conta_azul_vendas' in u.payload ||
      'refresh_token_conta_azul_vendas' in u.payload ||
      'conta_azul_connected' in u.payload ||
      'conta_azul_vendas_connected' in u.payload
  )
}

function resetTestState() {
  mockEmpresasTable = []
  mockUpdatesLog = []
  forceZeroUpdatedRows = false
  onBeforeUpdateHook = null
  ;(process.env as Record<string, string | undefined>).NODE_ENV = 'production'
  process.env.CONTA_AZUL_CLIENT_ID = 'client-id-secret-test'
  process.env.CONTA_AZUL_CLIENT_SECRET = 'client-secret-value-test'
}

test('Cenário 1: Uma renovação bem-sucedida adquire bloqueio distribuído e salva os novos tokens com filtro condicional pelo refresh_token anterior', async () => {
  resetTestState()
  mockEmpresasTable = [
    {
      id: 'emp-1',
      nome: 'Empresa 1',
      access_token_conta_azul: 'at-antigo',
      refresh_token_conta_azul: 'rt-antigo',
      data_expiracao_token: expiredIso(),
      conta_azul_connected: true,
    },
  ]

  mockFetchHandler = async (_url, _init, rt) => {
    assert.equal(rt, 'rt-antigo')
    // Enquanto o refresh está em andamento, o bloqueio distribuído está ativo na coluna de expiração
    assert.equal(isDistributedRefreshLockActive(mockEmpresasTable[0].data_expiracao_token), true)
    return jsonResponse({
      access_token: 'at-novo-1',
      refresh_token: 'rt-novo-1',
      expires_in: 3600,
      token_type: 'Bearer',
    })
  }

  const res = await getValidToken('emp-1', 'financeiro')

  assert.equal(res.accessToken, 'at-novo-1')
  assert.equal(mockUpdatesLog.length, 2) // 1 aquisição de lock + 1 persistência CAS dos novos tokens
  const tokenWrites = tokenMutationsLog()
  assert.equal(tokenWrites.length, 1)
  assert.deepEqual(tokenWrites[0].filters, {
    id: 'emp-1',
    refresh_token_conta_azul: 'rt-antigo',
  })
  assert.equal(tokenWrites[0].matchedCount, 1)
  assert.equal(mockEmpresasTable[0].access_token_conta_azul, 'at-novo-1')
  assert.equal(mockEmpresasTable[0].refresh_token_conta_azul, 'rt-novo-1')
  assert.equal(mockEmpresasTable[0].conta_azul_connected, true)
  assert.equal(isDistributedRefreshLockActive(mockEmpresasTable[0].data_expiracao_token), false)
})

test('Cenário 2 (Item a): Duas instâncias usam o mesmo refresh_token antigo; uma salva os tokens novos válidos e a outra recebe invalid_grant (invalid_refresh_token) sem apagar os tokens novos e reutilizando o estado atualizado', async () => {
  resetTestState()
  mockEmpresasTable = [
    {
      id: 'emp-1',
      nome: 'Empresa Concorrente',
      access_token_conta_azul: 'at-antigo',
      refresh_token_conta_azul: 'rt-compartilhado',
      data_expiracao_token: expiredIso(),
      conta_azul_connected: true,
    },
  ]

  let callCount = 0
  mockFetchHandler = async (_url, _init, rt) => {
    callCount++
    assert.equal(rt, 'rt-compartilhado')
    if (callCount === 1) {
      await new Promise((r) => setTimeout(r, 380))
      return jsonResponse({
        access_token: 'at-vencedor',
        refresh_token: 'rt-vencedor',
        expires_in: 3600,
        token_type: 'Bearer',
      })
    }
    await new Promise((r) => setTimeout(r, 10))
    return jsonResponse(
      {
        error: 'invalid_grant',
        error_subtype: 'invalid_refresh_token',
        error_description: 'Invalid refresh token',
      },
      400
    )
  }

  // Simula duas instâncias serverless independentes (sem lock compartilhado em memória) em que ambas chegam ao Cognito após expiração de lock
  const [res1, res2] = await Promise.all([
    getValidToken('emp-1', 'financeiro', true, {
      bypassInMemoryLock: true,
      lockTtlMs: 20,
      disableLockHeartbeat: true,
    }),
    getValidToken('emp-1', 'financeiro', true, {
      bypassInMemoryLock: true,
      lockTtlMs: 20,
      disableLockHeartbeat: true,
    }),
  ])

  assert.equal(callCount, 2)

  assert.equal(res1.accessToken, 'at-vencedor')
  assert.equal(res2.accessToken, 'at-vencedor')
  assert.equal(mockEmpresasTable[0].access_token_conta_azul, 'at-vencedor')
  assert.equal(mockEmpresasTable[0].refresh_token_conta_azul, 'rt-vencedor')
  assert.equal(mockEmpresasTable[0].conta_azul_connected, true)

  const clearAttempts = mockUpdatesLog.filter((u) => u.payload.access_token_conta_azul === null)
  assert.equal(clearAttempts.length, 0)
})

test('Cenário 3: Uma operação atrasada não pode sobrescrever tokens mais recentes', async () => {
  resetTestState()
  mockEmpresasTable = [
    {
      id: 'emp-1',
      nome: 'Empresa Atrasada',
      access_token_conta_azul: 'at-inicial',
      refresh_token_conta_azul: 'rt-inicial',
      data_expiracao_token: expiredIso(),
      conta_azul_connected: true,
    },
  ]

  mockFetchHandler = async (_url, _init, rt) => {
    assert.equal(rt, 'rt-inicial')
    // Outra instância já atualizou o banco com um token mais recente e válido
    mockEmpresasTable[0] = {
      ...mockEmpresasTable[0],
      access_token_conta_azul: 'at-mais-recente',
      refresh_token_conta_azul: 'rt-mais-recente',
      data_expiracao_token: futureIso(60),
      conta_azul_connected: true,
    }

    return jsonResponse({
      access_token: 'at-atrasado-obsoleto',
      refresh_token: 'rt-atrasado-obsoleto',
      expires_in: 3600,
      token_type: 'Bearer',
    })
  }

  const res = await getValidToken('emp-1', 'financeiro', true)

  assert.equal(res.accessToken, 'at-mais-recente')
  assert.equal(mockEmpresasTable[0].access_token_conta_azul, 'at-mais-recente')
  assert.equal(mockEmpresasTable[0].refresh_token_conta_azul, 'rt-mais-recente')
  const tokenWrites = tokenMutationsLog()
  assert.equal(tokenWrites.length, 1)
  assert.equal(tokenWrites[0].matchedCount, 0)
})

test('Cenário 4 (Item e): access_revoked recebido por operação atrasada não invalida autorização nova (mesmo se a substituição ocorrer durante o clear condicional), valida expiração do token substituto e limpa quando confirmado', async () => {
  resetTestState()
  mockEmpresasTable = [
    {
      id: 'emp-1',
      nome: 'Empresa Reconectada',
      access_token_conta_azul: 'at-antigo',
      refresh_token_conta_azul: 'rt-revogado-1',
      data_expiracao_token: expiredIso(),
      conta_azul_connected: true,
    },
  ]

  // Parte 4A: Substituição ocorreu antes da 1ª releitura -> reutiliza o token novo válido sem tentar limpar
  mockFetchHandler = async () => {
    mockEmpresasTable[0] = {
      ...mockEmpresasTable[0],
      access_token_conta_azul: 'at-reconectado-valido-1',
      refresh_token_conta_azul: 'rt-reconectado-valido-1',
      data_expiracao_token: futureIso(60),
      conta_azul_connected: true,
    }
    return jsonResponse(
      {
        error: 'invalid_grant',
        error_subtype: 'access_revoked',
        error_description: 'Access revoked by user',
      },
      400
    )
  }

  const resA = await getValidToken('emp-1', 'financeiro', true)
  assert.equal(resA.accessToken, 'at-reconectado-valido-1')
  assert.equal(tokenMutationsLog().length, 0)

  // Parte 4B: Substituição ocorre exatamente entre a 1ª releitura e o UPDATE condicional de limpeza (clearedRows = 0 linhas)
  // Deve reler após o clear condicional com 0 linhas e reutilizar o novo token válido!
  mockUpdatesLog = []
  onBeforeUpdateHook = (filters, payload) => {
    if (payload.access_token_conta_azul === null && filters.refresh_token_conta_azul === 'rt-reconectado-valido-1') {
      mockEmpresasTable[0] = {
        ...mockEmpresasTable[0],
        access_token_conta_azul: 'at-reconectado-entre-leituras',
        refresh_token_conta_azul: 'rt-reconectado-entre-leituras',
        data_expiracao_token: futureIso(60),
        conta_azul_connected: true,
      }
    }
  }

  mockFetchHandler = async () =>
    jsonResponse(
      {
        error: 'invalid_grant',
        error_subtype: 'access_revoked',
        error_description: 'Access revoked',
      },
      400
    )

  const resB = await getValidToken('emp-1', 'financeiro', true)
  assert.equal(resB.accessToken, 'at-reconectado-entre-leituras')
  assert.equal(mockEmpresasTable[0].access_token_conta_azul, 'at-reconectado-entre-leituras')
  assert.equal(mockEmpresasTable[0].refresh_token_conta_azul, 'rt-reconectado-entre-leituras')
  const tokenWritesB = tokenMutationsLog()
  assert.equal(tokenWritesB.length, 1)
  assert.equal(tokenWritesB[0].matchedCount, 0)

  // Parte 4C: Quando confirmado que o refresh_token no banco ainda é exatamente o revogado, limpa condicionalmente em produção
  onBeforeUpdateHook = null
  mockUpdatesLog = []

  await assert.rejects(
    async () => getValidToken('emp-1', 'financeiro', true),
    (err: any) => {
      assert.ok(err instanceof TokenError)
      assert.equal(err.statusCode, 401)
      assert.match(err.message, /access_revoked|revogada/i)
      return true
    }
  )

  const tokenWritesC = tokenMutationsLog()
  assert.equal(tokenWritesC.length, 1)
  assert.equal(tokenWritesC[0].filters.id, 'emp-1')
  assert.equal(tokenWritesC[0].filters.refresh_token_conta_azul, 'rt-reconectado-entre-leituras')
  assert.ok(decodeDistributedRefreshLock(tokenWritesC[0].filters.data_expiracao_token) !== null)
  assert.equal(tokenWritesC[0].matchedCount, 1)
  assert.equal(mockEmpresasTable[0].access_token_conta_azul, null)
  assert.equal(mockEmpresasTable[0].refresh_token_conta_azul, null)
  assert.equal(mockEmpresasTable[0].conta_azul_connected, false)
})

test('Cenário 5: invalid_client não apaga os tokens da empresa, libera o bloqueio distribuído e identifica o problema como falha de credenciais do aplicativo', async () => {
  resetTestState()
  const originalExp = expiredIso()
  mockEmpresasTable = [
    {
      id: 'emp-1',
      nome: 'Empresa Credenciais App',
      access_token_conta_azul: 'at-preservado',
      refresh_token_conta_azul: 'rt-preservado',
      data_expiracao_token: originalExp,
      conta_azul_connected: true,
    },
  ]

  // Subcaso 5A: error = 'invalid_client'
  mockFetchHandler = async () =>
    jsonResponse(
      {
        error: 'invalid_client',
        error_description: 'Invalid client credentials',
      },
      401
    )

  await assert.rejects(
    async () => getValidToken('emp-1', 'financeiro', true),
    (err: any) => {
      assert.ok(err instanceof TokenError)
      assert.equal(err.statusCode, 500)
      assert.match(err.message, /credenciais do aplicativo/i)
      assert.match(err.message, /invalid_client/i)
      return true
    }
  )

  // Subcaso 5B: error_subtype = 'invalid_client'
  mockFetchHandler = async () =>
    jsonResponse(
      {
        error: 'unauthorized_client',
        error_subtype: 'invalid_client',
        error_description: 'Client authentication failed',
      },
      401
    )

  await assert.rejects(
    async () => getValidToken('emp-1', 'financeiro', true),
    (err: any) => {
      assert.ok(err instanceof TokenError)
      assert.equal(err.statusCode, 500)
      assert.match(err.message, /credenciais do aplicativo/i)
      return true
    }
  )

  assert.equal(tokenMutationsLog().length, 0)
  assert.equal(mockEmpresasTable[0].access_token_conta_azul, 'at-preservado')
  assert.equal(mockEmpresasTable[0].refresh_token_conta_azul, 'rt-preservado')
  assert.equal(mockEmpresasTable[0].data_expiracao_token, originalExp)
  assert.equal(isDistributedRefreshLockActive(mockEmpresasTable[0].data_expiracao_token), false)
  assert.equal(mockEmpresasTable[0].conta_azul_connected, true)
})

test('Cenário 6: Falhas de rede, timeouts pós-resposta OAuth, respostas inesperadas e invalid_grant ambíguo liberam o bloqueio distribuído e preservam os tokens no banco mesmo em produção', async () => {
  resetTestState()
  const originalExp = expiredIso()
  mockEmpresasTable = [
    {
      id: 'emp-1',
      nome: 'Empresa Resiliente',
      access_token_conta_azul: 'at-intacto',
      refresh_token_conta_azul: 'rt-intacto',
      data_expiracao_token: originalExp,
      conta_azul_connected: true,
    },
  ]

  // 6A: Falha de rede não-retentável / DNS / socket error durante a renovação
  mockFetchHandler = async () => {
    assert.equal(isDistributedRefreshLockActive(mockEmpresasTable[0].data_expiracao_token), true)
    throw new Error('Network socket disconnected')
  }

  await assert.rejects(
    async () => getValidToken('emp-1', 'financeiro', true),
    (err: any) => {
      assert.ok(err instanceof TokenError)
      assert.equal(err.statusCode, 502)
      assert.equal(err.category, 'TRANSIENT_ERROR')
      assert.match(err.message, /preservados/i)
      return true
    }
  )
  // Bloqueio distribuído liberado e tokens intactos após falha de rede
  assert.equal(isDistributedRefreshLockActive(mockEmpresasTable[0].data_expiracao_token), false)
  assert.equal(mockEmpresasTable[0].data_expiracao_token, originalExp)

  // 6A-2 (Requisito 7): Timeout após resposta do OAuth / falha de leitura do corpo da resposta
  mockFetchHandler = async () => {
    assert.equal(isDistributedRefreshLockActive(mockEmpresasTable[0].data_expiracao_token), true)
    const fakeRes = new Response(null, { status: 200 })
    fakeRes.text = async () => {
      throw new Error('Body stream read timed out after OAuth 200 headers (ETIMEDOUT)')
    }
    return fakeRes
  }

  await assert.rejects(
    async () => getValidToken('emp-1', 'financeiro', true),
    (err: any) => {
      assert.ok(err instanceof TokenError)
      assert.equal(err.statusCode, 502)
      assert.equal(err.category, 'TRANSIENT_ERROR')
      assert.match(err.message, /preservados/i)
      return true
    }
  )
  assert.equal(isDistributedRefreshLockActive(mockEmpresasTable[0].data_expiracao_token), false)
  assert.equal(mockEmpresasTable[0].data_expiracao_token, originalExp)

  // 6B: Erro HTTP 500 (resposta inesperada do servidor)
  mockFetchHandler = async () =>
    new Response('Internal Server Error', { status: 500 })

  await assert.rejects(
    async () => getValidToken('emp-1', 'financeiro', true),
    (err: any) => {
      assert.ok(err instanceof TokenError)
      assert.equal(err.statusCode, 500)
      assert.match(err.message, /preservados/i)
      return true
    }
  )

  // 6C: invalid_grant sem error_subtype com descrição ambígua
  mockFetchHandler = async () =>
    jsonResponse(
      {
        error: 'invalid_grant',
        error_description: 'Grant validation failed without subtype',
      },
      400
    )

  await assert.rejects(
    async () => getValidToken('emp-1', 'financeiro', true),
    (err: any) => {
      assert.ok(err instanceof TokenError)
      assert.equal(err.statusCode, 502)
      assert.match(err.message, /preservados/i)
      return true
    }
  )

  // 6D: invalid_grant com subtipo não documentado
  mockFetchHandler = async () =>
    jsonResponse(
      {
        error: 'invalid_grant',
        error_subtype: 'unknown_future_subtype',
        error_description: 'Unexpected subtype',
      },
      400
    )

  await assert.rejects(
    async () => getValidToken('emp-1', 'financeiro', true),
    (err: any) => {
      assert.ok(err instanceof TokenError)
      assert.equal(err.statusCode, 502)
      assert.match(err.message, /preservados/i)
      return true
    }
  )

  assert.equal(tokenMutationsLog().length, 0)
  assert.equal(mockEmpresasTable[0].access_token_conta_azul, 'at-intacto')
  assert.equal(mockEmpresasTable[0].refresh_token_conta_azul, 'rt-intacto')
  assert.equal(mockEmpresasTable[0].data_expiracao_token, originalExp)
  assert.equal(isDistributedRefreshLockActive(mockEmpresasTable[0].data_expiracao_token), false)
  assert.equal(mockEmpresasTable[0].conta_azul_connected, true)
})

test('Cenário 7: A proteção funciona separadamente para empresas diferentes e módulos diferentes (financeiro vs vendas)', async () => {
  resetTestState()
  mockEmpresasTable = [
    {
      id: 'emp-1',
      nome: 'Empresa 1',
      access_token_conta_azul: 'at-emp1-fin-old',
      refresh_token_conta_azul: 'rt-emp1-fin-old',
      data_expiracao_token: expiredIso(),
      conta_azul_connected: true,
      access_token_conta_azul_vendas: 'at-emp1-ven-old',
      refresh_token_conta_azul_vendas: 'rt-emp1-ven-old',
      data_expiracao_token_vendas: expiredIso(),
      conta_azul_vendas_connected: true,
    },
    {
      id: 'emp-2',
      nome: 'Empresa 2',
      access_token_conta_azul: 'at-emp2-fin-old',
      refresh_token_conta_azul: 'rt-emp2-fin-old',
      data_expiracao_token: expiredIso(),
      conta_azul_connected: true,
    },
  ]

  const refreshedTokens: string[] = []
  mockFetchHandler = async (_url, _init, rt) => {
    refreshedTokens.push(rt)
    await new Promise((r) => setTimeout(r, 20))
    return jsonResponse({
      access_token: `novo-at-for-${rt}`,
      refresh_token: `novo-rt-for-${rt}`,
      expires_in: 3600,
      token_type: 'Bearer',
    })
  }

  const [resEmp1Fin, resEmp1Ven, resEmp2Fin] = await Promise.all([
    getValidToken('emp-1', 'financeiro'),
    getValidToken('emp-1', 'vendas'),
    getValidToken('emp-2', 'financeiro'),
  ])

  assert.equal(resEmp1Fin.accessToken, 'novo-at-for-rt-emp1-fin-old')
  assert.equal(resEmp1Ven.accessToken, 'novo-at-for-rt-emp1-ven-old')
  assert.equal(resEmp2Fin.accessToken, 'novo-at-for-rt-emp2-fin-old')
  assert.equal(refreshedTokens.length, 3)

  const emp1FinUpdate = mockUpdatesLog.find(
    (u) => u.filters.id === 'emp-1' && u.filters.refresh_token_conta_azul === 'rt-emp1-fin-old'
  )
  const emp1VenUpdate = mockUpdatesLog.find(
    (u) => u.filters.id === 'emp-1' && u.filters.refresh_token_conta_azul_vendas === 'rt-emp1-ven-old'
  )
  const emp2FinUpdate = mockUpdatesLog.find(
    (u) => u.filters.id === 'emp-2' && u.filters.refresh_token_conta_azul === 'rt-emp2-fin-old'
  )

  assert.ok(emp1FinUpdate)
  assert.ok(emp1VenUpdate)
  assert.ok(emp2FinUpdate)
  assert.equal(mockEmpresasTable[0].access_token_conta_azul, 'novo-at-for-rt-emp1-fin-old')
  assert.equal(mockEmpresasTable[0].access_token_conta_azul_vendas, 'novo-at-for-rt-emp1-ven-old')
  assert.equal(mockEmpresasTable[1].access_token_conta_azul, 'novo-at-for-rt-emp2-fin-old')
})

test('Cenário 8 (Itens b e c): Atualização condicional com 0 linhas afetadas e validação estrita contra retorno de tokens expirados ou sem expiração válida', async () => {
  resetTestState()

  // Validação direta do helper isAccessTokenValid
  assert.equal(
    isAccessTokenValid(
      { access_token_conta_azul: 'tok', data_expiracao_token: futureIso(30) },
      'access_token_conta_azul',
      'data_expiracao_token'
    ),
    true
  )
  assert.equal(
    isAccessTokenValid(
      { access_token_conta_azul: 'tok', data_expiracao_token: expiredIso() },
      'access_token_conta_azul',
      'data_expiracao_token'
    ),
    false
  )
  assert.equal(
    isAccessTokenValid(
      { access_token_conta_azul: 'tok', data_expiracao_token: null },
      'access_token_conta_azul',
      'data_expiracao_token'
    ),
    false
  )
  assert.equal(
    isAccessTokenValid(
      { access_token_conta_azul: 'tok', data_expiracao_token: 'data-invalida' },
      'access_token_conta_azul',
      'data_expiracao_token'
    ),
    false
  )

  // Subcaso 8A (Item c): UPDATE condicional afeta 0 linhas porque outra instância gravou um refresh_token diferente com access_token válido
  mockEmpresasTable = [
    {
      id: 'emp-1',
      nome: 'Empresa CAS Zero Rows',
      access_token_conta_azul: 'at-inicial',
      refresh_token_conta_azul: 'rt-inicial',
      data_expiracao_token: expiredIso(),
      conta_azul_connected: true,
    },
  ]

  mockFetchHandler = async () => {
    // Outra instância atualiza o registro com token novo e expiração futura válida
    mockEmpresasTable[0] = {
      ...mockEmpresasTable[0],
      access_token_conta_azul: 'at-outra-instancia-valido',
      refresh_token_conta_azul: 'rt-outra-instancia-valido',
      data_expiracao_token: futureIso(60),
      conta_azul_connected: true,
    }
    return jsonResponse({
      access_token: 'at-nao-salvo',
      refresh_token: 'rt-nao-salvo',
      expires_in: 3600,
      token_type: 'Bearer',
    })
  }

  const res8A = await getValidToken('emp-1', 'financeiro', true)
  assert.equal(res8A.accessToken, 'at-outra-instancia-valido')
  const tokenWrites8A = tokenMutationsLog()
  assert.equal(tokenWrites8A.length, 1)
  assert.equal(tokenWrites8A[0].matchedCount, 0)

  // Subcaso 8B (Item c): UPDATE condicional afeta 0 linhas mas o refresh_token no banco NÃO mudou (e o token segue expirado) -> NUNCA retorna o token expirado, lança TokenError 401
  resetTestState()
  mockEmpresasTable = [
    {
      id: 'emp-1',
      nome: 'Empresa CAS Sem Substituicao',
      access_token_conta_azul: 'at-expirado-no-banco',
      refresh_token_conta_azul: 'rt-mesmo-no-banco',
      data_expiracao_token: expiredIso(),
      conta_azul_connected: true,
    },
  ]
  forceZeroUpdatedRows = true
  mockFetchHandler = async () =>
    jsonResponse({
      access_token: 'at-perdido',
      refresh_token: 'rt-perdido',
      expires_in: 3600,
      token_type: 'Bearer',
    })

  await assert.rejects(
    async () => getValidToken('emp-1', 'financeiro', true),
    (err: any) => {
      assert.ok(err instanceof TokenError)
      assert.equal(err.statusCode, 401)
      return true
    }
  )

  // Subcaso 8C (Item b): O refresh_token mudou no banco, mas o token relido está EXPIRADO (ou sem data_expiracao_token) e a tentativa adicional controlada também encontra token expirado/inválido -> NUNCA retorna o token expirado!
  resetTestState()
  mockEmpresasTable = [
    {
      id: 'emp-1',
      nome: 'Empresa Token Substituto Expirado',
      access_token_conta_azul: 'at-exp-1',
      refresh_token_conta_azul: 'rt-exp-1',
      data_expiracao_token: expiredIso(),
      conta_azul_connected: true,
    },
  ]

  let sub8cCalls = 0
  mockFetchHandler = async () => {
    sub8cCalls++
    // A cada chamada, outra instância coloca um refresh_token diferente porém com data_expiracao_token expirada (ou nula)
    mockEmpresasTable[0] = {
      ...mockEmpresasTable[0],
      access_token_conta_azul: `at-substituto-expirado-${sub8cCalls}`,
      refresh_token_conta_azul: `rt-substituto-expirado-${sub8cCalls}`,
      data_expiracao_token: sub8cCalls === 1 ? expiredIso() : null,
      conta_azul_connected: true,
    }
    return jsonResponse(
      {
        error: 'invalid_grant',
        error_subtype: 'invalid_refresh_token',
        error_description: 'Token rotated',
      },
      400
    )
  }

  await assert.rejects(
    async () => getValidToken('emp-1', 'financeiro', true),
    (err: any) => {
      assert.ok(err instanceof TokenError)
      assert.equal(err.statusCode, 401)
      assert.match(err.message, /expirado ou sem validade confirmada/i)
      return true
    }
  )
  // Confirmou 1 chamada inicial + no máximo 1 retry controlado (total 2 chamadas) e jamais retornou o token expirado
  assert.equal(sub8cCalls, 2)
})

test('Cenário 9 (Item d): Falha de escrita no Supabase (errUpdate) não é silenciosamente tratada como sucesso; faz 1 retry de escrita e propaga TokenError(500) se persistir', async () => {
  // Subcaso 9A: 1ª escrita no Supabase falha, mas a re-tentativa imediata do UPDATE funciona (sem chamar refreshToken novamente na Conta Azul)
  resetTestState()
  mockEmpresasTable = [
    {
      id: 'emp-1',
      nome: 'Empresa Retry Escrita',
      access_token_conta_azul: 'at-antigo',
      refresh_token_conta_azul: 'rt-unico-1',
      data_expiracao_token: expiredIso(),
      conta_azul_connected: true,
    },
  ]

  let fetchCalls9A = 0
  mockFetchHandler = async () => {
    fetchCalls9A++
    return jsonResponse({
      access_token: 'at-salvo-no-retry',
      refresh_token: 'rt-salvo-no-retry',
      expires_in: 3600,
      token_type: 'Bearer',
    })
  }

  let updateAttempts9A = 0
  onBeforeUpdateHook = () => {
    updateAttempts9A++
    if (updateAttempts9A === 1) {
      return { error: { message: 'connection reset by peer on db write' } }
    }
    return undefined
  }

  const res9A = await getValidToken('emp-1', 'financeiro', true)
  assert.equal(res9A.accessToken, 'at-salvo-no-retry')
  assert.equal(fetchCalls9A, 1) // NÃO chamou refreshToken uma 2ª vez!
  assert.equal(updateAttempts9A, 2) // Fez 1 retry de escrita no banco
  assert.equal(mockEmpresasTable[0].access_token_conta_azul, 'at-salvo-no-retry')
  assert.equal(mockEmpresasTable[0].refresh_token_conta_azul, 'rt-salvo-no-retry')

  // Subcaso 9B: Falha persistente de escrita no Supabase (ambas as tentativas falham e nenhuma outra instância atualizou o banco) -> propaga TokenError 500
  resetTestState()
  mockEmpresasTable = [
    {
      id: 'emp-1',
      nome: 'Empresa Falha Escrita',
      access_token_conta_azul: 'at-antigo',
      refresh_token_conta_azul: 'rt-unico-2',
      data_expiracao_token: expiredIso(),
      conta_azul_connected: true,
    },
  ]

  mockFetchHandler = async () =>
    jsonResponse({
      access_token: 'at-nao-persistido',
      refresh_token: 'rt-nao-persistido',
      expires_in: 3600,
      token_type: 'Bearer',
    })

  onBeforeUpdateHook = () => ({
    error: { message: 'database read-only mode failure' },
  })

  await assert.rejects(
    async () => getValidToken('emp-1', 'financeiro', true),
    (err: any) => {
      assert.ok(err instanceof TokenError)
      assert.equal(err.statusCode, 500)
      assert.match(err.message, /Falha ao persistir os novos tokens/i)
      return true
    }
  )
})

test('Cenário 10 (Item f): Duas chamadas simultâneas com forceRefresh = true no mesmo processo compartilham a mesma renovação e não provocam chamadas duplicadas', async () => {
  resetTestState()
  mockEmpresasTable = [
    {
      id: 'emp-1',
      nome: 'Empresa ForceRefresh Simultaneo',
      access_token_conta_azul: 'at-valido-atual',
      refresh_token_conta_azul: 'rt-valido-atual',
      data_expiracao_token: futureIso(45),
      conta_azul_connected: true,
    },
  ]

  let fetchCalls10 = 0
  mockFetchHandler = async (_url, _init, rt) => {
    fetchCalls10++
    assert.equal(rt, 'rt-valido-atual')
    await new Promise((r) => setTimeout(r, 30))
    return jsonResponse({
      access_token: 'at-renovado-unico',
      refresh_token: 'rt-renovado-unico',
      expires_in: 3600,
      token_type: 'Bearer',
    })
  }

  // Duas chamadas simultâneas com forceRefresh = true no mesmo processo (sem bypassInMemoryLock)
  const [res1, res2] = await Promise.all([
    getValidToken('emp-1', 'financeiro', true),
    getValidToken('emp-1', 'financeiro', true),
  ])

  assert.equal(res1.accessToken, 'at-renovado-unico')
  assert.equal(res2.accessToken, 'at-renovado-unico')
  assert.equal(fetchCalls10, 1) // Apenas 1 chamada HTTP para a Conta Azul!
  assert.equal(tokenMutationsLog().length, 1)
})

test('Cenário 11 (Item g): Função real refreshToken em api.ts extrai error, error_subtype e error_description e sanitiza credenciais nas mensagens de erro', async () => {
  resetTestState()

  const secretRefreshToken = 'rt-super-secreto-999'
  const secretClientId = 'cid-secreto-888'
  const secretClientSecret = 'csec-secreto-777'
  const expectedBase64 = Buffer.from(`${secretClientId}:${secretClientSecret}`).toString('base64')

  mockFetchHandler = async (url, init, rt) => {
    assert.equal(url, 'https://auth.contaazul.com/oauth2/token')
    assert.equal(rt, secretRefreshToken)
    const headers = init?.headers as Record<string, string>
    assert.equal(headers['Authorization'], `Basic ${expectedBase64}`)

    return jsonResponse(
      {
        error: 'invalid_grant',
        error_subtype: 'invalid_refresh_token',
        error_description: `Falha com token ${secretRefreshToken}, client ${secretClientId}, secret ${secretClientSecret} e basic ${expectedBase64}`,
      },
      400
    )
  }

  await assert.rejects(
    async () => refreshToken(secretRefreshToken, secretClientId, secretClientSecret),
    (err: any) => {
      assert.ok(err instanceof OAuthError)
      assert.equal(err.statusCode, 400)
      assert.equal(err.errorCode, 'invalid_grant')
      assert.equal(err.errorSubtype, 'invalid_refresh_token')
      assert.ok(err.errorDescription)
      assert.ok(!err.errorDescription.includes(secretRefreshToken))
      assert.ok(!err.errorDescription.includes(secretClientId))
      assert.ok(!err.errorDescription.includes(secretClientSecret))
      assert.ok(!err.errorDescription.includes(expectedBase64))
      assert.ok(!err.message.includes(secretRefreshToken))
      assert.ok(!err.message.includes(secretClientId))
      assert.ok(!err.message.includes(secretClientSecret))
      assert.ok(!err.message.includes(expectedBase64))
      assert.match(err.errorDescription, /\[REDACTED\]/)
      return true
    }
  )
})

test('Cenário 12 (Causa Raiz Real Cognito Conta Azul e Bloqueio Distribuído): Duas instâncias tentando renovar simultaneamente via bypassInMemoryLock — apenas 1 consome o refresh_token no Cognito quando o lock está ativo, e se ambas chegarem ao Cognito por expiração de lock e uma receber invalid_grant (com ou sem error_description), reutiliza o novo token sem limpar o banco', async () => {
  // Parte 12A (Requisito 1): Bloqueio distribuído ativo garante que apenas 1 instância consome o refresh_token na Conta Azul e a outra aguarda o bloqueio e reutiliza o novo token!
  resetTestState()
  mockEmpresasTable = [
    {
      id: 'emp-1',
      nome: 'Empresa Lock Distribuido Concorrente',
      access_token_conta_azul: 'at-expirado-lock',
      refresh_token_conta_azul: 'rt-compartilhado-lock',
      data_expiracao_token: expiredIso(),
      conta_azul_connected: true,
    },
  ]

  let fetchCalls12A = 0
  mockFetchHandler = async (_url, _init, rt) => {
    fetchCalls12A++
    assert.equal(rt, 'rt-compartilhado-lock')
    await new Promise((r) => setTimeout(r, 80))
    return jsonResponse({
      access_token: 'at-unico-lock-distribuido',
      refresh_token: 'rt-unico-lock-distribuido',
      expires_in: 3600,
      token_type: 'Bearer',
    })
  }

  const [resLock1, resLock2] = await Promise.all([
    getValidToken('emp-1', 'financeiro', true, { bypassInMemoryLock: true }),
    getValidToken('emp-1', 'financeiro', true, { bypassInMemoryLock: true }),
  ])

  assert.equal(resLock1.accessToken, 'at-unico-lock-distribuido')
  assert.equal(resLock2.accessToken, 'at-unico-lock-distribuido')
  assert.equal(fetchCalls12A, 1) // Bloqueio distribuído impediu a 2ª instância de chamar o Cognito!
  assert.equal(tokenMutationsLog().length, 1)

  // Parte 12B (Requisito 2): Renovação concorrente na Vercel (bypassInMemoryLock: true) quando ambas chegam ao Cognito por expiração de lock (lockTtlMs curto) e uma recebe invalid_grant sem error_subtype
  resetTestState()
  mockEmpresasTable = [
    {
      id: 'emp-1',
      nome: 'Empresa Cognito Real Concorrente',
      access_token_conta_azul: 'at-expirado-cognito',
      refresh_token_conta_azul: 'rt-cognito-compartilhado',
      data_expiracao_token: expiredIso(),
      conta_azul_connected: true,
    },
  ]

  let callCount12B = 0
  mockFetchHandler = async (_url, _init, rt) => {
    callCount12B++
    assert.equal(rt, 'rt-cognito-compartilhado')
    if (callCount12B === 1) {
      // Instância 1 demora mais que o lockTtlMs + pollIntervalMs (ex.: 450ms vs lockTtlMs=20ms), permitindo que a Instância 2 assuma o lock expirado e chegue ao Cognito
      await new Promise((r) => setTimeout(r, 450))
      return jsonResponse({
        access_token: 'at-cognito-vencedor',
        refresh_token: 'rt-cognito-vencedor',
        expires_in: 3600,
        token_type: 'Bearer',
      })
    }
    // Instância 2 chega ao Cognito e recebe invalid_grant SEM error_subtype
    await new Promise((r) => setTimeout(r, 10))
    return jsonResponse(
      {
        error: 'invalid_grant',
        error_description: 'Invalid refresh token',
      },
      400
    )
  }

  const [res1, res2] = await Promise.all([
    getValidToken('emp-1', 'financeiro', true, {
      bypassInMemoryLock: true,
      lockTtlMs: 20,
      disableLockHeartbeat: true,
    }),
    getValidToken('emp-1', 'financeiro', true, {
      bypassInMemoryLock: true,
      lockTtlMs: 20,
      disableLockHeartbeat: true,
    }),
  ])

  assert.equal(callCount12B, 2) // Ambas chegaram ao Cognito por expiração do lock
  assert.equal(res1.accessToken, 'at-cognito-vencedor')
  assert.equal(res2.accessToken, 'at-cognito-vencedor')
  assert.equal(mockEmpresasTable[0].access_token_conta_azul, 'at-cognito-vencedor')
  assert.equal(mockEmpresasTable[0].refresh_token_conta_azul, 'rt-cognito-vencedor')
  assert.equal(mockEmpresasTable[0].conta_azul_connected, true)

  const clearAttempts = mockUpdatesLog.filter((u) => u.payload.access_token_conta_azul === null)
  assert.equal(clearAttempts.length, 0)
})

test('Cenário 13 (Limpeza Real quando Refresh Token Expirou sem error_subtype — com e sem error_description): invalid_grant sem error_subtype tanto com error_description ("Refresh Token has expired") quanto sem error_description ({"error": "invalid_grant"}) limpa os tokens inválidos em produção e lança TokenError 401 (REFRESH_INVALID)', async () => {
  // Validação direta do classificador para ambos os formatos do AWS Cognito
  assert.equal(classifyInvalidGrantSubtype(undefined, 'Refresh Token has expired'), 'invalid_refresh_token')
  assert.equal(classifyInvalidGrantSubtype(undefined, undefined), 'invalid_refresh_token')
  assert.equal(classifyInvalidGrantSubtype(undefined, ''), 'invalid_refresh_token')

  // Subcaso 13A: invalid_grant sem error_subtype e COM error_description
  resetTestState()
  mockEmpresasTable = [
    {
      id: 'emp-1',
      nome: 'Empresa Refresh Expirado Cognito',
      access_token_conta_azul: 'at-morto',
      refresh_token_conta_azul: 'rt-expirado-cognito',
      data_expiracao_token: expiredIso(),
      conta_azul_connected: true,
    },
  ]

  mockFetchHandler = async () =>
    jsonResponse(
      {
        error: 'invalid_grant',
        error_description: 'Refresh Token has expired',
      },
      400
    )

  await assert.rejects(
    async () =>
      getValidToken('emp-1', 'financeiro', true, {
        invalidGrantPollDelaysMs: [10, 20],
      }),
    (err: any) => {
      assert.ok(err instanceof TokenError)
      assert.equal(err.statusCode, 401)
      assert.equal(err.category, 'REFRESH_INVALID')
      assert.match(err.message, /expirou|invalid_refresh_token/i)
      return true
    }
  )

  const tokenWrites13A = tokenMutationsLog()
  assert.equal(tokenWrites13A.length, 1)
  assert.equal(tokenWrites13A[0].filters.id, 'emp-1')
  assert.equal(tokenWrites13A[0].filters.refresh_token_conta_azul, 'rt-expirado-cognito')
  assert.ok(decodeDistributedRefreshLock(tokenWrites13A[0].filters.data_expiracao_token) !== null)
  assert.equal(mockEmpresasTable[0].access_token_conta_azul, null)
  assert.equal(mockEmpresasTable[0].refresh_token_conta_azul, null)
  assert.equal(mockEmpresasTable[0].conta_azul_connected, false)

  // Subcaso 13B: invalid_grant sem error_subtype e SEM error_description ({"error": "invalid_grant"} puro do AWS Cognito)
  resetTestState()
  mockEmpresasTable = [
    {
      id: 'emp-1',
      nome: 'Empresa Refresh Expirado Cognito Sem Descricao',
      access_token_conta_azul: 'at-morto-2',
      refresh_token_conta_azul: 'rt-expirado-sem-desc',
      data_expiracao_token: expiredIso(),
      conta_azul_connected: true,
    },
  ]

  mockFetchHandler = async () =>
    jsonResponse(
      {
        error: 'invalid_grant',
      },
      400
    )

  await assert.rejects(
    async () =>
      getValidToken('emp-1', 'financeiro', true, {
        invalidGrantPollDelaysMs: [10, 20],
      }),
    (err: any) => {
      assert.ok(err instanceof TokenError)
      assert.equal(err.statusCode, 401)
      assert.equal(err.category, 'REFRESH_INVALID')
      assert.match(err.message, /expirou|invalid_refresh_token/i)
      return true
    }
  )

  const tokenWrites13B = tokenMutationsLog()
  assert.equal(tokenWrites13B.length, 1)
  assert.equal(tokenWrites13B[0].filters.id, 'emp-1')
  assert.equal(tokenWrites13B[0].filters.refresh_token_conta_azul, 'rt-expirado-sem-desc')
  assert.ok(decodeDistributedRefreshLock(tokenWrites13B[0].filters.data_expiracao_token) !== null)
  assert.equal(mockEmpresasTable[0].access_token_conta_azul, null)
  assert.equal(mockEmpresasTable[0].refresh_token_conta_azul, null)
  assert.equal(mockEmpresasTable[0].conta_azul_connected, false)
})

test('Cenário 14: access_token expirado e refresh_token nulo nunca retorna o access_token expirado; limpa token órfão em produção e lança TokenError 401 (DISCONNECTED)', async () => {
  resetTestState()
  mockEmpresasTable = [
    {
      id: 'emp-1',
      nome: 'Empresa Sem Refresh Token',
      access_token_conta_azul: 'at-expirado-orfao',
      refresh_token_conta_azul: null,
      data_expiracao_token: expiredIso(),
      conta_azul_connected: true,
    },
  ]

  await assert.rejects(
    async () => getValidToken('emp-1', 'financeiro'),
    (err: any) => {
      assert.ok(err instanceof TokenError)
      assert.equal(err.statusCode, 401)
      assert.equal(err.category, 'DISCONNECTED')
      assert.match(err.message, /não possui refresh_token válido/i)
      return true
    }
  )

  assert.equal(mockEmpresasTable[0].access_token_conta_azul, null)
  assert.equal(mockEmpresasTable[0].conta_azul_connected, false)
})

test('Cenário 15 (Requisitos 3 e 5): forceRefresh após token já renovado (failedAccessToken comparado com o access_token armazenado no banco) reutiliza o novo token do banco sem consumir novamente o refresh_token e nunca apaga dados novos', async () => {
  resetTestState()
  mockEmpresasTable = [
    {
      id: 'emp-1',
      nome: 'Empresa Token Ja Substituido',
      access_token_conta_azul: 'at-novo-ja-no-banco',
      refresh_token_conta_azul: 'rt-novo-ja-no-banco',
      data_expiracao_token: futureIso(55),
      conta_azul_connected: true,
    },
  ]

  let fetchCalls15 = 0
  mockFetchHandler = async () => {
    fetchCalls15++
    throw new Error('Não deveria chamar o Cognito quando failedAccessToken difere do token válido no banco!')
  }

  // Simula rota que recebeu 401 usando 'at-antigo-rejeitado' e pede forceRefresh informando failedAccessToken
  const res = await getValidToken('emp-1', 'financeiro', true, {
    failedAccessToken: 'at-antigo-rejeitado',
    bypassInMemoryLock: true,
  })

  assert.equal(res.accessToken, 'at-novo-ja-no-banco')
  assert.equal(fetchCalls15, 0) // Zero chamadas ao Cognito!
  assert.equal(mockUpdatesLog.length, 0) // Zero escritas ou locks no banco!
  assert.equal(mockEmpresasTable[0].access_token_conta_azul, 'at-novo-ja-no-banco')
  assert.equal(mockEmpresasTable[0].refresh_token_conta_azul, 'rt-novo-ja-no-banco')
  assert.equal(mockEmpresasTable[0].conta_azul_connected, true)
})

test('Cenário 16 (Requisito 10): Expiração e recuperação do bloqueio distribuído — quando uma instância trava e deixa um lease expirado no banco, a próxima instância detecta isDistributedRefreshLockExpired === true, assume um novo bloqueio atômico e renova com sucesso', async () => {
  resetTestState()
  const expiredLeaseIso = encodeDistributedRefreshLock(Date.now() - 1000)

  // Verifica helpers de codificação/decodificação e detecção de expiração do lease
  const decodedMs = decodeDistributedRefreshLock(expiredLeaseIso)
  assert.ok(typeof decodedMs === 'number' && decodedMs <= Date.now())
  assert.equal(isDistributedRefreshLockActive(expiredLeaseIso), false)
  assert.equal(isDistributedRefreshLockExpired(expiredLeaseIso), true)

  mockEmpresasTable = [
    {
      id: 'emp-1',
      nome: 'Empresa Lease Expirado',
      access_token_conta_azul: 'at-travado',
      refresh_token_conta_azul: 'rt-travado',
      data_expiracao_token: expiredLeaseIso,
      conta_azul_connected: true,
    },
  ]

  let fetchCalls16 = 0
  mockFetchHandler = async (_url, _init, rt) => {
    fetchCalls16++
    assert.equal(rt, 'rt-travado')
    // Confirma que a nova instância assumiu um novo bloqueio distribuído ativo antes de chamar o Cognito
    assert.equal(isDistributedRefreshLockActive(mockEmpresasTable[0].data_expiracao_token), true)
    assert.notEqual(mockEmpresasTable[0].data_expiracao_token, expiredLeaseIso)
    return jsonResponse({
      access_token: 'at-recuperado-pos-lease-expirado',
      refresh_token: 'rt-recuperado-pos-lease-expirado',
      expires_in: 3600,
      token_type: 'Bearer',
    })
  }

  const res = await getValidToken('emp-1', 'financeiro', false, { bypassInMemoryLock: true })

  assert.equal(res.accessToken, 'at-recuperado-pos-lease-expirado')
  assert.equal(fetchCalls16, 1)
  assert.equal(mockEmpresasTable[0].access_token_conta_azul, 'at-recuperado-pos-lease-expirado')
  assert.equal(mockEmpresasTable[0].refresh_token_conta_azul, 'rt-recuperado-pos-lease-expirado')
  assert.equal(isDistributedRefreshLockActive(mockEmpresasTable[0].data_expiracao_token), false)
  assert.equal(isAccessTokenValid(mockEmpresasTable[0], 'access_token_conta_azul', 'data_expiracao_token'), true)
})

test('Cenário 17 (Grupo D - Itens 1 e 2): Takeover após espera real pelo lease inicial ativo e verificação de que o novo lease do takeover está ativo no momento do refresh', async () => {
  resetTestState()
  const startedAt = Date.now()
  const initialActiveLeaseIso = encodeDistributedRefreshLock(startedAt + 180)
  assert.equal(isDistributedRefreshLockActive(initialActiveLeaseIso), true)

  mockEmpresasTable = [
    {
      id: 'emp-1',
      nome: 'Empresa Takeover Pos Espera',
      access_token_conta_azul: 'at-antes-takeover',
      refresh_token_conta_azul: 'rt-antes-takeover',
      data_expiracao_token: initialActiveLeaseIso,
      conta_azul_connected: true,
    },
  ]

  let fetchCalls17 = 0
  let leaseDuringFetch: string | null | undefined = null

  mockFetchHandler = async (_url, _init, rt) => {
    fetchCalls17++
    assert.equal(rt, 'rt-antes-takeover')
    const nowInFetch = Date.now()
    // 1. Comprova que a Instância B realmente aguardou o lease inicial de 180ms expirar antes de chamar o Cognito
    assert.ok(nowInFetch - startedAt >= 150, `Esperado espera >= 150ms, obtido ${nowInFetch - startedAt}ms`)

    // 2. Comprova que o takeover gravou um NOVO lease ativo diferente do inicial e com folga > 1500ms (lockTtlMs = 3000)
    leaseDuringFetch = mockEmpresasTable[0].data_expiracao_token
    assert.notEqual(leaseDuringFetch, initialActiveLeaseIso)
    assert.equal(isDistributedRefreshLockActive(leaseDuringFetch, nowInFetch), true)
    const decodedTakeoverUntil = decodeDistributedRefreshLock(leaseDuringFetch)
    assert.ok(decodedTakeoverUntil !== null && decodedTakeoverUntil > nowInFetch + 1500)

    return jsonResponse({
      access_token: 'at-pos-takeover-real',
      refresh_token: 'rt-pos-takeover-real',
      expires_in: 3600,
      token_type: 'Bearer',
    })
  }

  const res = await getValidToken('emp-1', 'financeiro', false, {
    bypassInMemoryLock: true,
    lockTtlMs: 3000,
  })

  assert.equal(fetchCalls17, 1)
  assert.equal(res.accessToken, 'at-pos-takeover-real')
  assert.equal(mockEmpresasTable[0].access_token_conta_azul, 'at-pos-takeover-real')
  assert.equal(mockEmpresasTable[0].refresh_token_conta_azul, 'rt-pos-takeover-real')
  assert.equal(isDistributedRefreshLockActive(mockEmpresasTable[0].data_expiracao_token), false)

  // Verifica que o CAS de takeover usou expectedRawExp = initialActiveLeaseIso
  const takeoverLockUpdate = mockUpdatesLog.find(
    (u) =>
      u.filters.id === 'emp-1' &&
      u.filters.data_expiracao_token === initialActiveLeaseIso &&
      u.payload.data_expiracao_token === leaseDuringFetch
  )
  assert.ok(takeoverLockUpdate)
  assert.equal(takeoverLockUpdate.matchedCount, 1)
})

test('Cenário 18 (Grupo D - Item 3): Bloqueio de liberação por instância antiga (CAS em releaseDistributedLockIfHeld não libera lease de takeover da Instância B) + unicidade de createUniqueDistributedRefreshLock e sanitizeRestorableExpiration', async () => {
  resetTestState()

  // 3.1: Unicidade garantida mesmo quando invocado dezenas de vezes no mesmo milissegundo (Date.now() fixo)
  const fixedBaseMs = Date.now() + 25_000
  const generatedLeases = new Set<string>()
  for (let i = 0; i < 50; i++) {
    const lease = createUniqueDistributedRefreshLock(fixedBaseMs)
    assert.equal(isDistributedRefreshLockActive(lease), true)
    generatedLeases.add(lease)
  }
  assert.equal(generatedLeases.size, 50)

  // 3.2: sanitizeRestorableExpiration converte qualquer marcador de lock 1995 em '1970-01-01T00:00:00.000Z'
  const sampleLock1995 = encodeDistributedRefreshLock(Date.now() + 10_000)
  assert.equal(sanitizeRestorableExpiration(sampleLock1995), '1970-01-01T00:00:00.000Z')
  assert.equal(isDistributedRefreshLockActive(sanitizeRestorableExpiration(sampleLock1995)), false)
  assert.equal(isDistributedRefreshLockExpired(sanitizeRestorableExpiration(sampleLock1995)), false)
  assert.equal(sanitizeRestorableExpiration(null), null)
  const normalExp = futureIso(30)
  assert.equal(sanitizeRestorableExpiration(normalExp), normalExp)

  // 3.3: Disputa real A vs B: A perde o lease por expiração (150ms), B faz takeover com lease de 4000ms,
  // A falha em t=350ms e tenta chamar releaseDistributedLockIfHeld() -> CAS afeta 0 linhas e NÃO derruba o lease de B!
  mockEmpresasTable = [
    {
      id: 'emp-1',
      nome: 'Empresa Protecao CAS Release',
      access_token_conta_azul: 'at-inicial-cas',
      refresh_token_conta_azul: 'rt-inicial-cas',
      data_expiracao_token: expiredIso(),
      conta_azul_connected: true,
    },
  ]

  let fetchCallOrder = 0
  let leaseA: string | null | undefined = null
  let leaseB: string | null | undefined = null
  let notifyBTookOver!: () => void
  const bTookOverPromise = new Promise<void>((resolve) => {
    notifyBTookOver = resolve
  })
  let notifyAFinishedRelease!: () => void
  const aFinishedReleasePromise = new Promise<void>((resolve) => {
    notifyAFinishedRelease = resolve
  })

  mockFetchHandler = async () => {
    fetchCallOrder++
    if (fetchCallOrder === 1) {
      // Instância A adquiriu o lock inicial
      leaseA = mockEmpresasTable[0].data_expiracao_token
      assert.equal(isDistributedRefreshLockActive(leaseA), true)
      // Aguarda deterministicamente a Instância B assumir o lock (após leaseA expirar) antes de retornar HTTP 502
      await bTookOverPromise
      return new Response('Bad Gateway on Instance A', { status: 502 })
    }

    // Instância B fez takeover após o lease de A expirar
    leaseB = mockEmpresasTable[0].data_expiracao_token
    assert.ok(leaseB && leaseB !== leaseA)
    assert.equal(isDistributedRefreshLockActive(leaseB), true)
    notifyBTookOver()

    // Aguarda a Instância A concluir seu tratamento de erro e sua tentativa de releaseDistributedLockIfHeld()
    await aFinishedReleasePromise

    // No momento em que B prossegue no Cognito (após A já ter tentado releaseDistributedLockIfHeld),
    // o lease no banco AINDA deve ser o leaseB intacto!
    assert.equal(mockEmpresasTable[0].data_expiracao_token, leaseB)
    assert.equal(isDistributedRefreshLockActive(mockEmpresasTable[0].data_expiracao_token), true)

    return jsonResponse({
      access_token: 'at-vencedor-instancia-b',
      refresh_token: 'rt-vencedor-instancia-b',
      expires_in: 3600,
      token_type: 'Bearer',
    })
  }

  const promiseA = getValidToken('emp-1', 'financeiro', true, {
    bypassInMemoryLock: true,
    lockTtlMs: 120,
    disableLockHeartbeat: true,
  })
  await new Promise((r) => setTimeout(r, 20))
  const promiseB = getValidToken('emp-1', 'financeiro', true, {
    bypassInMemoryLock: true,
    lockTtlMs: 5000,
    disableLockHeartbeat: true,
  })

  await assert.rejects(
    async () => promiseA,
    (err: any) => {
      assert.ok(err instanceof TokenError)
      assert.equal(err.statusCode, 502)
      return true
    }
  )
  notifyAFinishedRelease()

  const resB = await promiseB
  assert.equal(resB.accessToken, 'at-vencedor-instancia-b')
  assert.equal(mockEmpresasTable[0].access_token_conta_azul, 'at-vencedor-instancia-b')
  assert.equal(mockEmpresasTable[0].refresh_token_conta_azul, 'rt-vencedor-instancia-b')

  // Comprova no log de updates que:
  // 1) O takeover da Instância B substituiu leaseA por leaseB (matchedCount === 1)
  // 2) A tentativa posterior de releaseDistributedLockIfHeld da Instância A filtrou por leaseA e teve matchedCount === 0!
  const takeoverByB = mockUpdatesLog.find(
    (u) =>
      u.filters.id === 'emp-1' &&
      u.filters.data_expiracao_token === leaseA &&
      u.payload.data_expiracao_token === leaseB
  )
  assert.ok(takeoverByB, 'Instância B deve ter assumido o lock substituindo leaseA por leaseB via CAS')
  assert.equal(takeoverByB.matchedCount, 1)

  const releaseAttemptA = mockUpdatesLog.find(
    (u) =>
      u.filters.id === 'emp-1' &&
      u.filters.data_expiracao_token === leaseA &&
      u.payload.data_expiracao_token !== leaseB &&
      !('access_token_conta_azul' in u.payload)
  )
  assert.ok(releaseAttemptA, 'Instância A deve ter tentado liberar seu leaseA via CAS')
  assert.equal(releaseAttemptA.matchedCount, 0, 'CAS de liberação de A não pode afetar o leaseB ativo')
})

test('Cenário 19 (Grupo D - Item 4): Vencedor lento com duração superior a 400 ms (tanto via espera no bloqueio distribuído quanto via janela estendida de confirmação pós-invalid_grant)', async () => {
  // Caso 19A: Vencedor demora 550ms no Cognito com bloqueio distribuído ativo; 2ª instância aguarda e reutiliza sem chamar o Cognito
  resetTestState()
  mockEmpresasTable = [
    {
      id: 'emp-1',
      nome: 'Empresa Vencedor Lento 550ms Lock',
      access_token_conta_azul: 'at-exp-400',
      refresh_token_conta_azul: 'rt-exp-400',
      data_expiracao_token: expiredIso(),
      conta_azul_connected: true,
    },
  ]

  let calls19A = 0
  mockFetchHandler = async () => {
    calls19A++
    await new Promise((r) => setTimeout(r, 550))
    return jsonResponse({
      access_token: 'at-vencedor-550ms',
      refresh_token: 'rt-vencedor-550ms',
      expires_in: 3600,
      token_type: 'Bearer',
    })
  }

  const [res19A_1, res19A_2] = await Promise.all([
    getValidToken('emp-1', 'financeiro', true, { bypassInMemoryLock: true }),
    getValidToken('emp-1', 'financeiro', true, { bypassInMemoryLock: true }),
  ])

  assert.equal(calls19A, 1)
  assert.equal(res19A_1.accessToken, 'at-vencedor-550ms')
  assert.equal(res19A_2.accessToken, 'at-vencedor-550ms')

  // Caso 19B: Ambas chegam ao Cognito; perdedor recebe invalid_grant em 40ms e vencedor demora 650ms (> 400ms da janela antiga!)
  // A nova janela DEFAULT_INVALID_GRANT_POLL_DELAYS_MS (1800ms) aguarda o vencedor lento e reutiliza o token sem apagar!
  resetTestState()
  mockEmpresasTable = [
    {
      id: 'emp-1',
      nome: 'Empresa Vencedor Lento 650ms Race',
      access_token_conta_azul: 'at-race-650',
      refresh_token_conta_azul: 'rt-race-650',
      data_expiracao_token: expiredIso(),
      conta_azul_connected: true,
    },
  ]

  let calls19B = 0
  mockFetchHandler = async () => {
    calls19B++
    if (calls19B === 1) {
      await new Promise((r) => setTimeout(r, 650))
      return jsonResponse({
        access_token: 'at-vencedor-650ms',
        refresh_token: 'rt-vencedor-650ms',
        expires_in: 3600,
        token_type: 'Bearer',
      })
    }
    await new Promise((r) => setTimeout(r, 30))
    return jsonResponse(
      {
        error: 'invalid_grant',
        error_description: 'Invalid refresh token',
      },
      400
    )
  }

  const [res19B_1, res19B_2] = await Promise.all([
    getValidToken('emp-1', 'financeiro', true, {
      bypassInMemoryLock: true,
      lockTtlMs: 20,
      disableLockHeartbeat: true,
    }),
    getValidToken('emp-1', 'financeiro', true, {
      bypassInMemoryLock: true,
      lockTtlMs: 20,
      disableLockHeartbeat: true,
    }),
  ])

  assert.equal(calls19B, 2)
  assert.equal(res19B_1.accessToken, 'at-vencedor-650ms')
  assert.equal(res19B_2.accessToken, 'at-vencedor-650ms')
  assert.equal(mockEmpresasTable[0].access_token_conta_azul, 'at-vencedor-650ms')
  assert.equal(mockEmpresasTable[0].refresh_token_conta_azul, 'rt-vencedor-650ms')
  const clearAttempts19B = mockUpdatesLog.filter((u) => u.payload.access_token_conta_azul === null)
  assert.equal(clearAttempts19B.length, 0)
})

test('Cenário 20 (Grupo D - Item 5): Vencedor lento com duração superior ao TTL / > 15s (Heartbeat atômico estende o lease impedindo takeover prematuro + Recuperação automática caso uma instância limpe a linha antes do vencedor concluir)', async () => {
  // Caso 20A: Heartbeat atômico ativo renova o lease múltiplas vezes durante chamada longa (> 3x lockTtlMs),
  // impedindo takeover pela 2ª instância e garantindo apenas 1 chamada ao Cognito
  resetTestState()
  mockEmpresasTable = [
    {
      id: 'emp-1',
      nome: 'Empresa Heartbeat Ativo',
      access_token_conta_azul: 'at-hb-old',
      refresh_token_conta_azul: 'rt-hb-old',
      data_expiracao_token: expiredIso(),
      conta_azul_connected: true,
    },
  ]

  let fetchCalls20A = 0
  const observedLeases: string[] = []

  mockFetchHandler = async () => {
    fetchCalls20A++
    observedLeases.push(mockEmpresasTable[0].data_expiracao_token!)
    // Dura 520ms enquanto o lockTtlMs é de apenas 180ms, mas com heartbeatIntervalMs = 55ms
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, 85))
      observedLeases.push(mockEmpresasTable[0].data_expiracao_token!)
    }
    return jsonResponse({
      access_token: 'at-hb-renovado',
      refresh_token: 'rt-hb-renovado',
      expires_in: 3600,
      token_type: 'Bearer',
    })
  }

  const p1 = getValidToken('emp-1', 'financeiro', true, {
    bypassInMemoryLock: true,
    lockTtlMs: 180,
    heartbeatIntervalMs: 55,
  })
  await new Promise((r) => setTimeout(r, 40))
  const p2 = getValidToken('emp-1', 'financeiro', true, {
    bypassInMemoryLock: true,
    lockTtlMs: 180,
    heartbeatIntervalMs: 55,
  })

  const [res20A_1, res20A_2] = await Promise.all([p1, p2])
  assert.equal(fetchCalls20A, 1) // A 2ª instância NÃO fez takeover porque o heartbeat manteve o lease ativo!
  assert.equal(res20A_1.accessToken, 'at-hb-renovado')
  assert.equal(res20A_2.accessToken, 'at-hb-renovado')
  // Comprova que o heartbeat rotacionou o leaseIso no banco múltiplas vezes
  const uniqueLeasesDuringCall = new Set(observedLeases)
  assert.ok(uniqueLeasesDuringCall.size >= 3, `Esperado >= 3 leases de heartbeat, obtido ${uniqueLeasesDuringCall.size}`)

  // Caso 20B: Se por degradação extrema uma instância concorrente limpou refresh_token para null enquanto o vencedor
  // estava em voo (> 15s), o vencedor ao receber os novos tokens executa o UPDATE de recuperação (.is(refreshKey, null)) e salva!
  resetTestState()
  mockEmpresasTable = [
    {
      id: 'emp-1',
      nome: 'Empresa Recuperacao Pos Clear',
      access_token_conta_azul: 'at-antes-clear',
      refresh_token_conta_azul: 'rt-antes-clear',
      data_expiracao_token: expiredIso(),
      conta_azul_connected: true,
    },
  ]

  mockFetchHandler = async () => {
    // Simula outra instância que limpou a linha no banco enquanto o vencedor aguardava resposta da Conta Azul
    mockEmpresasTable[0] = {
      ...mockEmpresasTable[0],
      access_token_conta_azul: null,
      refresh_token_conta_azul: null,
      data_expiracao_token: null,
      conta_azul_connected: false,
    }
    return jsonResponse({
      access_token: 'at-recuperado-vencedor-lento',
      refresh_token: 'rt-recuperado-vencedor-lento',
      expires_in: 3600,
      token_type: 'Bearer',
    })
  }

  const res20B = await getValidToken('emp-1', 'financeiro', true, {
    bypassInMemoryLock: true,
    disableLockHeartbeat: true,
  })

  assert.equal(res20B.accessToken, 'at-recuperado-vencedor-lento')
  assert.equal(mockEmpresasTable[0].access_token_conta_azul, 'at-recuperado-vencedor-lento')
  assert.equal(mockEmpresasTable[0].refresh_token_conta_azul, 'rt-recuperado-vencedor-lento')
  assert.equal(mockEmpresasTable[0].conta_azul_connected, true)
})

test('Cenário 21 (Grupo D - Itens 6, 7 e 8): Falha de rede, Timeout (AbortError/ETIMEDOUT) e Falhas 502/503/504 durante refresh OAuth executam exatamente 1 POST (zero retry automático de refresh_token), liberam o lock e preservam os tokens', async () => {
  resetTestState()
  const initialExp = expiredIso()
  mockEmpresasTable = [
    {
      id: 'emp-1',
      nome: 'Empresa Sem Retry OAuth',
      access_token_conta_azul: 'at-preservado-net',
      refresh_token_conta_azul: 'rt-unico-sensivel',
      data_expiracao_token: initialExp,
      conta_azul_connected: true,
    },
  ]

  // Item 6: Falha de rede (ECONNRESET / socket hang up) -> exatamente 1 chamada a global.fetch
  let netFetchCalls = 0
  mockFetchHandler = async () => {
    netFetchCalls++
    const err: any = new Error('read ECONNRESET')
    err.code = 'ECONNRESET'
    throw err
  }

  await assert.rejects(
    async () => getValidToken('emp-1', 'financeiro', true, { bypassInMemoryLock: true }),
    (err: any) => {
      assert.ok(err instanceof TokenError)
      assert.equal(err.statusCode, 502)
      assert.equal(err.category, 'TRANSIENT_ERROR')
      assert.match(err.message, /network_error|preservados/i)
      return true
    }
  )
  assert.equal(netFetchCalls, 1, 'Falha de rede no refresh OAuth NUNCA deve fazer retry automático')
  assert.equal(mockEmpresasTable[0].refresh_token_conta_azul, 'rt-unico-sensivel')
  assert.equal(isDistributedRefreshLockActive(mockEmpresasTable[0].data_expiracao_token), false)

  // Item 7: Timeout (AbortError / ETIMEDOUT) -> exatamente 1 chamada a global.fetch
  let timeoutFetchCalls = 0
  mockFetchHandler = async () => {
    timeoutFetchCalls++
    const abortErr = new Error('The operation was aborted')
    abortErr.name = 'AbortError'
    throw abortErr
  }

  await assert.rejects(
    async () => getValidToken('emp-1', 'financeiro', true, { bypassInMemoryLock: true }),
    (err: any) => {
      assert.ok(err instanceof TokenError)
      assert.equal(err.statusCode, 502)
      assert.equal(err.category, 'TRANSIENT_ERROR')
      assert.match(err.message, /timeout|preservados/i)
      return true
    }
  )
  assert.equal(timeoutFetchCalls, 1, 'Timeout no refresh OAuth NUNCA deve reenviar o refresh_token')
  assert.equal(mockEmpresasTable[0].refresh_token_conta_azul, 'rt-unico-sensivel')
  assert.equal(isDistributedRefreshLockActive(mockEmpresasTable[0].data_expiracao_token), false)

  // Item 8: Falhas HTTP 502, 503 e 504 -> exatamente 1 chamada a global.fetch para cada status
  for (const gatewayStatus of [502, 503, 504]) {
    let gwCalls = 0
    mockFetchHandler = async () => {
      gwCalls++
      return new Response(`Gateway error ${gatewayStatus}`, { status: gatewayStatus })
    }

    await assert.rejects(
      async () => getValidToken('emp-1', 'financeiro', true, { bypassInMemoryLock: true }),
      (err: any) => {
        assert.ok(err instanceof TokenError)
        assert.equal(err.statusCode, gatewayStatus)
        assert.equal(err.category, 'TRANSIENT_ERROR')
        assert.match(err.message, /preservados/i)
        return true
      }
    )
    assert.equal(gwCalls, 1, `HTTP ${gatewayStatus} no refresh OAuth NUNCA deve repetir o POST`)
    assert.equal(mockEmpresasTable[0].access_token_conta_azul, 'at-preservado-net')
    assert.equal(mockEmpresasTable[0].refresh_token_conta_azul, 'rt-unico-sensivel')
    assert.equal(isDistributedRefreshLockActive(mockEmpresasTable[0].data_expiracao_token), false)
  }
})

test('Cenário 22 (Grupo D - Item 9): Leitores do timestamp temporário de 1995 (classifyTokenExpirationState, getStatusConexaoEmpresa, sanitizePublicExpirationIso e evaluateEmpresaStatus)', async () => {
  resetTestState()
  const now = Date.now()

  // 1. Lock distribuído ATIVO (1995-...)
  const activeLockIso = encodeDistributedRefreshLock(now + 20_000)
  assert.match(activeLockIso, /^1995-/)
  assert.equal(classifyTokenExpirationState(activeLockIso, now), 'ACTIVE_LOCK')
  assert.equal(sanitizePublicExpirationIso(activeLockIso), null)

  const empActiveLock: any = {
    id: 'emp-ui-1',
    nome: 'Empresa UI Lock Ativo',
    access_token_conta_azul: 'at-ui-1',
    refresh_token_conta_azul: 'rt-ui-1',
    data_expiracao_token: activeLockIso,
    conta_azul_connected: true,
  }
  const uiStatusActive = getStatusConexaoEmpresa(empActiveLock, 'financeiro', now)
  assert.equal(uiStatusActive.status, 'RENOVANDO')
  assert.equal(uiStatusActive.conectado, true)

  const apiStatusActive = await evaluateEmpresaStatus('emp-ui-1', 'financeiro', empActiveLock, false)
  assert.equal(apiStatusActive.status, 'ATENCAO')
  assert.equal(apiStatusActive.conectado, true)
  assert.equal(apiStatusActive.operacional, true)
  assert.equal(apiStatusActive.expira_em, null) // Nunca vaza '1995-...'

  // 2. Lock distribuído EXPIRADO (1995-...)
  const expiredLockIso = encodeDistributedRefreshLock(now - 5_000)
  assert.match(expiredLockIso, /^1995-/)
  assert.equal(classifyTokenExpirationState(expiredLockIso, now), 'EXPIRED_LOCK')
  assert.equal(sanitizePublicExpirationIso(expiredLockIso), null)

  const empExpiredLockWithRt: any = {
    ...empActiveLock,
    data_expiracao_token: expiredLockIso,
  }
  const uiStatusExpiredLock = getStatusConexaoEmpresa(empExpiredLockWithRt, 'financeiro', now)
  assert.equal(uiStatusExpiredLock.status, 'ATENCAO')
  assert.equal(uiStatusExpiredLock.conectado, true)

  const apiStatusExpiredLock = await evaluateEmpresaStatus('emp-ui-1', 'financeiro', empExpiredLockWithRt, false)
  assert.equal(apiStatusExpiredLock.status, 'ATENCAO')
  assert.equal(apiStatusExpiredLock.conectado, true)
  assert.equal(apiStatusExpiredLock.operacional, false)
  assert.equal(apiStatusExpiredLock.expira_em, null)

  const empExpiredLockWithoutRt: any = {
    ...empExpiredLockWithRt,
    refresh_token_conta_azul: null,
  }
  assert.equal(getStatusConexaoEmpresa(empExpiredLockWithoutRt, 'financeiro', now).status, 'DESCONECTADA')
  const apiStatusExpiredLockNoRt = await evaluateEmpresaStatus('emp-ui-1', 'financeiro', empExpiredLockWithoutRt, false)
  assert.equal(apiStatusExpiredLockNoRt.status, 'DESCONECTADA')
  assert.equal(apiStatusExpiredLockNoRt.conectado, false)

  // 3. Token válido (> 5 min), próximo de expirar (<= 5 min) e realmente expirado
  const validFutureIso = new Date(now + 30 * 60 * 1000).toISOString()
  const expiringSoonIso = new Date(now + 2 * 60 * 1000).toISOString()
  const realExpiredIso = new Date(now - 60 * 1000).toISOString()

  assert.equal(classifyTokenExpirationState(validFutureIso, now), 'VALID_TOKEN')
  assert.equal(classifyTokenExpirationState(expiringSoonIso, now), 'EXPIRING_SOON')
  assert.equal(classifyTokenExpirationState(realExpiredIso, now), 'EXPIRED_TOKEN')
  assert.equal(classifyTokenExpirationState(null, now), 'MISSING')

  assert.equal(sanitizePublicExpirationIso(validFutureIso), validFutureIso)
  assert.equal(
    getStatusConexaoEmpresa({ ...empActiveLock, data_expiracao_token: validFutureIso }, 'financeiro', now).status,
    'CONECTADA'
  )
  assert.equal(
    getStatusConexaoEmpresa({ ...empActiveLock, data_expiracao_token: expiringSoonIso }, 'financeiro', now).status,
    'CONECTADA'
  )
  assert.equal(
    getStatusConexaoEmpresa({ ...empActiveLock, data_expiracao_token: realExpiredIso }, 'financeiro', now).status,
    'ATENCAO'
  )
})

test('Cenário 23 (Grupo D - Itens 10, 11 e 12): Isolamento entre empresas/módulos sob lock/falha, recuperação após crash abrupto sem restaurar 1995 e preservação absoluta contra erros ambíguos', async () => {
  resetTestState()
  const crashedLeaseIso = encodeDistributedRefreshLock(Date.now() - 2_000)
  const validVendasExp = futureIso(45)

  mockEmpresasTable = [
    {
      id: 'emp-1',
      nome: 'Empresa 1 Crash Financeiro',
      access_token_conta_azul: 'at-emp1-crashed',
      refresh_token_conta_azul: 'rt-emp1-crashed',
      data_expiracao_token: crashedLeaseIso, // Instância anterior sofreu crash deixando marcador 1995 expirado
      conta_azul_connected: true,
      access_token_conta_azul_vendas: 'at-emp1-vendas-ok',
      refresh_token_conta_azul_vendas: 'rt-emp1-vendas-ok',
      data_expiracao_token_vendas: validVendasExp,
      conta_azul_vendas_connected: true,
    },
    {
      id: 'emp-2',
      nome: 'Empresa 2 Independente',
      access_token_conta_azul: 'at-emp2-old',
      refresh_token_conta_azul: 'rt-emp2-old',
      data_expiracao_token: expiredIso(),
      conta_azul_connected: true,
    },
  ]

  // Parte 23A (Item 11 + Item 12): Se a tentativa de recuperação após crash falhar com erro transitório (ex.: 503),
  // releaseDistributedLockIfHeld restaura '1970-01-01T00:00:00.000Z' (via sanitizeRestorableExpiration) e NUNCA restaura '1995-...'!
  mockFetchHandler = async (_url, _init, rt) => {
    if (rt === 'rt-emp1-crashed') {
      return new Response('Service Unavailable', { status: 503 })
    }
    return jsonResponse({
      access_token: 'at-emp2-renovado',
      refresh_token: 'rt-emp2-renovado',
      expires_in: 3600,
      token_type: 'Bearer',
    })
  }

  const [emp1FailResult, emp1VendasResult, emp2FinResult] = await Promise.allSettled([
    getValidToken('emp-1', 'financeiro', false, { bypassInMemoryLock: true }),
    getValidToken('emp-1', 'vendas', false, { bypassInMemoryLock: true }),
    getValidToken('emp-2', 'financeiro', false, { bypassInMemoryLock: true }),
  ])

  assert.equal(emp1FailResult.status, 'rejected')
  assert.equal(emp1VendasResult.status, 'fulfilled')
  assert.equal((emp1VendasResult as PromiseFulfilledResult<any>).value.accessToken, 'at-emp1-vendas-ok')
  assert.equal(emp2FinResult.status, 'fulfilled')
  assert.equal((emp2FinResult as PromiseFulfilledResult<any>).value.accessToken, 'at-emp2-renovado')

  // Verifica que emp-1 (financeiro) preservou seus tokens e teve data_expiracao_token sanitizada para 1970 (não 1995!)
  assert.equal(mockEmpresasTable[0].access_token_conta_azul, 'at-emp1-crashed')
  assert.equal(mockEmpresasTable[0].refresh_token_conta_azul, 'rt-emp1-crashed')
  assert.equal(mockEmpresasTable[0].data_expiracao_token, '1970-01-01T00:00:00.000Z')
  assert.equal(decodeDistributedRefreshLock(mockEmpresasTable[0].data_expiracao_token), null)
  // E o módulo vendas de emp-1 permaneceu intocado
  assert.equal(mockEmpresasTable[0].access_token_conta_azul_vendas, 'at-emp1-vendas-ok')
  assert.equal(mockEmpresasTable[0].data_expiracao_token_vendas, validVendasExp)

  // Parte 23B (Item 11): Na chamada seguinte, emp-1 (financeiro) se recupera totalmente e renova os tokens
  mockFetchHandler = async () =>
    jsonResponse({
      access_token: 'at-emp1-recuperado-final',
      refresh_token: 'rt-emp1-recuperado-final',
      expires_in: 3600,
      token_type: 'Bearer',
    })

  const recoveredEmp1 = await getValidToken('emp-1', 'financeiro', false, { bypassInMemoryLock: true })
  assert.equal(recoveredEmp1.accessToken, 'at-emp1-recuperado-final')
  assert.equal(mockEmpresasTable[0].access_token_conta_azul, 'at-emp1-recuperado-final')
  assert.equal(mockEmpresasTable[0].refresh_token_conta_azul, 'rt-emp1-recuperado-final')
  assert.equal(isAccessTokenValid(mockEmpresasTable[0], 'access_token_conta_azul', 'data_expiracao_token'), true)
})


