import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const loaderCode = `
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const targetPath = path.resolve(process.cwd(), 'src', specifier.slice(2) + '.ts');
    return nextResolve(pathToFileURL(targetPath).href, context);
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !path.extname(specifier) && context.parentURL) {
    const parentDir = path.dirname(fileURLToPath(context.parentURL));
    const targetPath = path.resolve(parentDir, specifier + '.ts');
    return nextResolve(pathToFileURL(targetPath).href, context);
  }
  return nextResolve(specifier, context);
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
const { getValidToken, TokenError, isAccessTokenValid } = await import('@/lib/conta-azul/token-manager')

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

function resetTestState() {
  mockEmpresasTable = []
  mockUpdatesLog = []
  forceZeroUpdatedRows = false
  onBeforeUpdateHook = null
  ;(process.env as Record<string, string | undefined>).NODE_ENV = 'production'
  process.env.CONTA_AZUL_CLIENT_ID = 'client-id-secret-test'
  process.env.CONTA_AZUL_CLIENT_SECRET = 'client-secret-value-test'
}

test('Cenário 1: Uma renovação bem-sucedida salva os novos tokens com filtro condicional pelo refresh_token anterior', async () => {
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
    return jsonResponse({
      access_token: 'at-novo-1',
      refresh_token: 'rt-novo-1',
      expires_in: 3600,
      token_type: 'Bearer',
    })
  }

  const res = await getValidToken('emp-1', 'financeiro')

  assert.equal(res.accessToken, 'at-novo-1')
  assert.equal(mockUpdatesLog.length, 1)
  assert.deepEqual(mockUpdatesLog[0].filters, {
    id: 'emp-1',
    refresh_token_conta_azul: 'rt-antigo',
  })
  assert.equal(mockUpdatesLog[0].matchedCount, 1)
  assert.equal(mockEmpresasTable[0].access_token_conta_azul, 'at-novo-1')
  assert.equal(mockEmpresasTable[0].refresh_token_conta_azul, 'rt-novo-1')
  assert.equal(mockEmpresasTable[0].conta_azul_connected, true)
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
      await new Promise((r) => setTimeout(r, 40))
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

  // Simula duas instâncias serverless independentes (sem lock compartilhado em memória)
  const [res1, res2] = await Promise.all([
    getValidToken('emp-1', 'financeiro', true, { bypassInMemoryLock: true }),
    getValidToken('emp-1', 'financeiro', true, { bypassInMemoryLock: true }),
  ])

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
  assert.equal(mockUpdatesLog.length, 1)
  assert.equal(mockUpdatesLog[0].matchedCount, 0)
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
  assert.equal(mockUpdatesLog.length, 0)

  // Parte 4B: Substituição ocorre exatamente entre a 1ª releitura e o UPDATE condicional de limpeza (clearedRows = 0 linhas)
  // Deve reler após o clear condicional com 0 linhas e reutilizar o novo token válido!
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
  assert.equal(mockUpdatesLog.length, 1)
  assert.equal(mockUpdatesLog[0].matchedCount, 0)

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

  assert.equal(mockUpdatesLog.length, 1)
  assert.deepEqual(mockUpdatesLog[0].filters, {
    id: 'emp-1',
    refresh_token_conta_azul: 'rt-reconectado-entre-leituras',
  })
  assert.equal(mockUpdatesLog[0].matchedCount, 1)
  assert.equal(mockEmpresasTable[0].access_token_conta_azul, null)
  assert.equal(mockEmpresasTable[0].refresh_token_conta_azul, null)
  assert.equal(mockEmpresasTable[0].conta_azul_connected, false)
})

test('Cenário 5: invalid_client não apaga os tokens da empresa e identifica o problema como falha de credenciais do aplicativo', async () => {
  resetTestState()
  mockEmpresasTable = [
    {
      id: 'emp-1',
      nome: 'Empresa Credenciais App',
      access_token_conta_azul: 'at-preservado',
      refresh_token_conta_azul: 'rt-preservado',
      data_expiracao_token: expiredIso(),
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

  assert.equal(mockUpdatesLog.length, 0)
  assert.equal(mockEmpresasTable[0].access_token_conta_azul, 'at-preservado')
  assert.equal(mockEmpresasTable[0].refresh_token_conta_azul, 'rt-preservado')
  assert.equal(mockEmpresasTable[0].conta_azul_connected, true)
})

test('Cenário 6: Falhas de rede, respostas inesperadas e invalid_grant ambíguo (sem error_subtype) preservam os tokens no banco mesmo em produção', async () => {
  resetTestState()
  mockEmpresasTable = [
    {
      id: 'emp-1',
      nome: 'Empresa Resiliente',
      access_token_conta_azul: 'at-intacto',
      refresh_token_conta_azul: 'rt-intacto',
      data_expiracao_token: expiredIso(),
      conta_azul_connected: true,
    },
  ]

  // 6A: Falha de rede não-retentável / DNS / socket error
  mockFetchHandler = async () => {
    throw new Error('Network socket disconnected')
  }

  await assert.rejects(
    async () => getValidToken('emp-1', 'financeiro', true),
    (err: any) => {
      assert.ok(err instanceof TokenError)
      assert.equal(err.statusCode, 502)
      assert.match(err.message, /preservados/i)
      return true
    }
  )

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

  // 6C: invalid_grant sem error_subtype (ambíguo)
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

  assert.equal(mockUpdatesLog.length, 0)
  assert.equal(mockEmpresasTable[0].access_token_conta_azul, 'at-intacto')
  assert.equal(mockEmpresasTable[0].refresh_token_conta_azul, 'rt-intacto')
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
  assert.equal(mockUpdatesLog.length, 1)
  assert.equal(mockUpdatesLog[0].matchedCount, 0)

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
  assert.equal(mockUpdatesLog.length, 1)
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
