import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const loaderCode = `
import { pathToFileURL } from 'node:url';
import path from 'node:path';
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'next/server') {
    return nextResolve('next/server.js', context);
  }
  if (specifier.startsWith('@/')) {
    const targetPath = path.resolve(process.cwd(), 'src', specifier.slice(2) + '.ts');
    return nextResolve(pathToFileURL(targetPath).href, context);
  }
  return nextResolve(specifier, context);
}
`
register(`data:text/javascript,${encodeURIComponent(loaderCode)}`, pathToFileURL('./'))

const { NextRequest } = await import('next/server.js')

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key'

interface ContaMock {
  id: string
  empresa_id: string
  fornecedor: string
  valor: number
  vencimento: string
  emissao?: string
  descricao?: string
  categoria?: string
  conta_financeira?: string
  conta_financeira_id?: string | null
  status: string
  tentativas?: number
  metadata?: Record<string, any>
}

interface DeparaMock {
  empresa_id: string
  nome_original?: string
  nome_original_normalizado?: string
  nome_corrigido?: string
  conta_azul_contato_id?: string | null
}

let mockContasTable: ContaMock[] = []
let mockDeparaTable: DeparaMock[] = []
let mockUpdatesContas: Array<{ id: string; payload: Record<string, any> }> = []
let mockUpdatesDepara: Array<{ filtro: Record<string, any>; payload: Record<string, any> }> = []
let mockLogsIntegracao: Array<Record<string, any>> = []

let mockCriarContaPagarFn: (token: string, payload: any) => Promise<any>
let mockBuscarOuCriarContatoFn: (token: string, nome: string) => Promise<string | undefined>
let mockListarCategoriasFn: (token: string) => Promise<any[]>
let mockListarContasFinanceirasFn: (token: string) => Promise<any[]>

function createQueryBuilder(table: string) {
  const filters: Record<string, any> = {}
  let inFilter: { col: string; vals: any[] } | null = null
  let isCountHead = false
  let pendingUpdate: Record<string, any> | null = null
  let isDelete = false

  const builder: any = {
    select(_cols?: string, opts?: { count?: string; head?: boolean }) {
      if (opts?.head) isCountHead = true
      return builder
    },
    eq(col: string, val: any) {
      filters[col] = val
      return builder
    },
    in(col: string, vals: any[]) {
      inFilter = { col, vals }
      return builder
    },
    lt(_col: string, _val: any) {
      return builder
    },
    limit(_n: number) {
      return builder
    },
    update(payload: Record<string, any>) {
      pendingUpdate = payload
      return builder
    },
    delete() {
      isDelete = true
      return builder
    },
    async insert(payload: Record<string, any>) {
      if (table === 'logs_integracao') {
        mockLogsIntegracao.push(payload)
      }
      return { data: payload, error: null }
    },
    then(resolve: (val: any) => void, reject?: (err: any) => void) {
      try {
        if (isDelete) {
          return Promise.resolve({ data: null, error: null }).then(resolve, reject)
        }
        if (pendingUpdate) {
          if (table === 'contas_pagar_importadas') {
            mockUpdatesContas.push({ id: filters.id, payload: pendingUpdate })
            const idx = mockContasTable.findIndex((c) => c.id === filters.id)
            if (idx >= 0) {
              mockContasTable[idx] = { ...mockContasTable[idx], ...pendingUpdate }
            }
          } else if (table === 'fornecedor_depara') {
            mockUpdatesDepara.push({ filtro: { ...filters }, payload: pendingUpdate })
          }
          return Promise.resolve({ data: null, error: null }).then(resolve, reject)
        }
        if (table === 'contas_pagar_importadas') {
          const rows = mockContasTable.filter((r) => {
            if (filters.empresa_id && r.empresa_id !== filters.empresa_id) return false
            if (filters.status && r.status !== filters.status) return false
            if (inFilter && inFilter.col === 'id' && !inFilter.vals.includes(r.id)) return false
            return true
          })
          if (isCountHead) {
            return Promise.resolve({ data: null, count: rows.length, error: null }).then(resolve, reject)
          }
          return Promise.resolve({ data: rows.map((r) => ({ ...r })), error: null }).then(resolve, reject)
        }
        if (table === 'fornecedor_depara') {
          const rows = mockDeparaTable.filter((r) => !filters.empresa_id || r.empresa_id === filters.empresa_id)
          return Promise.resolve({ data: rows.map((r) => ({ ...r })), error: null }).then(resolve, reject)
        }
        return Promise.resolve({ data: [], error: null }).then(resolve, reject)
      } catch (e) {
        if (reject) return reject(e)
        throw e
      }
    }
  }
  return builder
}

mock.module('@supabase/supabase-js', {
  namedExports: {
    createClient: () => ({
      from: (table: string) => createQueryBuilder(table)
    })
  }
})

class MockTokenError extends Error {
  public statusCode: number
  constructor(message: string, statusCode = 401) {
    super(message)
    this.statusCode = statusCode
  }
}

const tokenManagerUrl = pathToFileURL(path.resolve(process.cwd(), 'src/lib/conta-azul/token-manager.ts')).href
const apiUrl = pathToFileURL(path.resolve(process.cwd(), 'src/lib/conta-azul/api.ts')).href

mock.module(tokenManagerUrl, {
  namedExports: {
    TokenError: MockTokenError,
    getValidToken: async () => ({
      accessToken: 'token-valido-mock',
      empresa: { id: 'emp-1', nome: 'Empresa Teste' }
    })
  }
})

mock.module(apiUrl, {
  namedExports: {
    criarContaPagar: async (token: string, payload: any) => mockCriarContaPagarFn(token, payload),
    buscarOuCriarContato: async (token: string, nome: string) => mockBuscarOuCriarContatoFn(token, nome),
    listarCategorias: async (token: string) => mockListarCategoriasFn(token),
    listarContasFinanceiras: async (token: string) => mockListarContasFinanceirasFn(token)
  }
})

const { POST } = await import('@/app/api/conta-azul/enviar/route')

function resetMocks() {
  mockContasTable = []
  mockDeparaTable = []
  mockUpdatesContas = []
  mockUpdatesDepara = []
  mockLogsIntegracao = []

  mockListarCategoriasFn = async () => [
    { id: 'cat-uuid-revenda', nome: 'Materiais para Revenda' },
    { id: 'cat-uuid-energia', nome: 'Energia Elétrica' }
  ]
  mockListarContasFinanceirasFn = async () => [
    { id: 'banco-uuid-1', descricao: 'Banco Itaú' }
  ]
  mockBuscarOuCriarContatoFn = async (_token, nome) => `uuid-criado-${nome.toLowerCase().replace(/\s+/g, '-')}`
  mockCriarContaPagarFn = async (_token, _payload) => ({
    protocolId: 'proto-123',
    status: 'SUCCESS',
    createdAt: '2026-04-16T00:00:00Z'
  })
}

function makeRequest(body: Record<string, any>) {
  return new NextRequest('http://localhost:3000/api/conta-azul/enviar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

test('1. Envia id_fornecedor correto no payload para a Conta Azul (sem o campo ignorado contato)', async () => {
  resetMocks()
  const payloadsEnviados: any[] = []
  mockBuscarOuCriarContatoFn = async () => '9f8e7d6c-5b4a-3210-fedc-ba9876543210'
  mockCriarContaPagarFn = async (_token, payload) => {
    payloadsEnviados.push(payload)
    return { protocolId: 'proto-ok-1', status: 'SUCCESS', createdAt: '2026-04-16T00:00:00Z' }
  }

  mockContasTable = [
    {
      id: 'conta-1',
      empresa_id: 'emp-1',
      fornecedor: 'AGUIA DISTRIBUIDORA DE PECAS LTDA',
      valor: 583.09,
      vencimento: '2026-04-28',
      emissao: '2026-04-14',
      descricao: '000001101',
      categoria: 'Materiais para Revenda',
      conta_financeira: 'Banco Itaú',
      status: 'pendente'
    }
  ]

  const res = await POST(makeRequest({ empresa_id: 'emp-1', contas_ids: ['conta-1'] }))
  const json = await res.json()

  assert.equal(res.status, 200)
  assert.equal(json.enviados, 1)
  assert.equal(json.erros, 0)
  assert.equal(payloadsEnviados.length, 1)
  assert.equal(payloadsEnviados[0].id_fornecedor, '9f8e7d6c-5b4a-3210-fedc-ba9876543210')
  assert.equal('contato' in payloadsEnviados[0], false)
})

test('2. Bloqueia envio quando não existir identificador válido de fornecedor (sem chamar criarContaPagar)', async () => {
  resetMocks()
  let chamadasCriarContaPagar = 0
  mockCriarContaPagarFn = async () => {
    chamadasCriarContaPagar++
    return { protocolId: 'nunca-chamado', status: 'SUCCESS', createdAt: '' }
  }
  mockBuscarOuCriarContatoFn = async () => undefined

  mockContasTable = [
    {
      id: 'conta-sem-forn',
      empresa_id: 'emp-1',
      fornecedor: 'NÃO INFORMADO',
      valor: 150.0,
      vencimento: '2026-04-20',
      descricao: 'NF 999',
      status: 'pendente'
    },
    {
      id: 'conta-falha-lookup',
      empresa_id: 'emp-1',
      fornecedor: 'FORNECEDOR INEXISTENTE',
      valor: 250.0,
      vencimento: '2026-04-21',
      descricao: 'NF 998',
      status: 'pendente'
    }
  ]

  const res = await POST(makeRequest({ empresa_id: 'emp-1' }))
  const json = await res.json()

  assert.equal(res.status, 200)
  assert.equal(json.enviados, 0)
  assert.equal(json.erros, 2)
  assert.equal(chamadasCriarContaPagar, 0)
  assert.equal(mockUpdatesContas.length, 2)
  assert.match(mockUpdatesContas[0].payload.erro_mensagem, /id_fornecedor obrigatório/)
  assert.match(mockUpdatesContas[1].payload.erro_mensagem, /id_fornecedor obrigatório/)
})

test('3. Preserva vínculo existente em fornecedor_depara sem chamar buscarOuCriarContato', async () => {
  resetMocks()
  let chamadasBuscarOuCriar = 0
  const payloadsEnviados: any[] = []

  mockBuscarOuCriarContatoFn = async () => {
    chamadasBuscarOuCriar++
    return 'uuid-nao-deveria-ser-usado'
  }
  mockCriarContaPagarFn = async (_token, payload) => {
    payloadsEnviados.push(payload)
    return { protocolId: 'proto-depara', status: 'SUCCESS', createdAt: '' }
  }

  mockDeparaTable = [
    {
      empresa_id: 'emp-1',
      nome_original: 'FORNECEDOR DEPARA LTDA',
      nome_original_normalizado: 'FORNECEDOR DEPARA LTDA',
      nome_corrigido: 'Fornecedor DePara Oficial',
      conta_azul_contato_id: 'uuid-persistido-no-depara-123'
    }
  ]

  mockContasTable = [
    {
      id: 'conta-depara',
      empresa_id: 'emp-1',
      fornecedor: 'fornecedor depara ltda',
      valor: 420.5,
      vencimento: '2026-05-01',
      descricao: 'NF 555',
      status: 'pendente'
    }
  ]

  const res = await POST(makeRequest({ empresa_id: 'emp-1' }))
  const json = await res.json()

  assert.equal(json.enviados, 1)
  assert.equal(chamadasBuscarOuCriar, 0)
  assert.equal(payloadsEnviados[0].id_fornecedor, 'uuid-persistido-no-depara-123')
})

test('4. Trata erro da Conta Azul sem perda dos dados originais importados', async () => {
  resetMocks()
  mockBuscarOuCriarContatoFn = async () => 'uuid-forn-valido'
  mockCriarContaPagarFn = async () => {
    throw new Error('[400] {"message":"Payload inválido na Conta Azul"}')
  }

  const contaOriginal: ContaMock = {
    id: 'conta-erro-ca',
    empresa_id: 'emp-1',
    fornecedor: 'FORNECEDOR IMPORTADO ORIGINAL',
    valor: 1234.56,
    vencimento: '2026-05-10',
    emissao: '2026-04-10',
    descricao: '000007777',
    categoria: 'Materiais para Revenda',
    conta_financeira: 'Banco Itaú',
    status: 'pendente',
    tentativas: 2
  }
  mockContasTable = [{ ...contaOriginal }]

  const res = await POST(makeRequest({ empresa_id: 'emp-1' }))
  const json = await res.json()

  assert.equal(json.enviados, 0)
  assert.equal(json.erros, 1)
  assert.equal(mockUpdatesContas.length, 1)
  assert.deepEqual(Object.keys(mockUpdatesContas[0].payload).sort(), ['erro_mensagem', 'status', 'tentativas'])
  assert.equal(mockUpdatesContas[0].payload.status, 'erro')
  assert.equal(mockUpdatesContas[0].payload.tentativas, 3)

  const registroAposErro = mockContasTable[0]
  assert.equal(registroAposErro.fornecedor, contaOriginal.fornecedor)
  assert.equal(registroAposErro.valor, contaOriginal.valor)
  assert.equal(registroAposErro.vencimento, contaOriginal.vencimento)
  assert.equal(registroAposErro.emissao, contaOriginal.emissao)
  assert.equal(registroAposErro.descricao, contaOriginal.descricao)
  assert.equal(registroAposErro.categoria, contaOriginal.categoria)
  assert.equal(mockLogsIntegracao.length, 1)
  assert.equal(mockLogsIntegracao[0].detalhes.payload.id_fornecedor, 'uuid-forn-valido')
})

test('5. Preserva compatibilidade de todos os demais campos financeiros do payload', async () => {
  resetMocks()
  const payloadsEnviados: any[] = []
  mockBuscarOuCriarContatoFn = async () => 'uuid-forn-5'
  mockCriarContaPagarFn = async (_token, payload) => {
    payloadsEnviados.push(payload)
    return { protocolId: 'proto-5', status: 'SUCCESS', createdAt: '' }
  }

  mockContasTable = [
    {
      id: 'conta-campos',
      empresa_id: 'emp-1',
      fornecedor: 'FORNECEDOR COMPLETO LTDA',
      valor: 890.75,
      vencimento: '2026-06-15',
      emissao: '2026-04-15',
      descricao: 'NF 12345',
      categoria: 'Energia Elétrica',
      conta_financeira_id: 'banco-id-direto-99',
      status: 'pendente',
      metadata: { anexo_url: 'https://storage.exemplo/comprovante.pdf' }
    }
  ]

  await POST(makeRequest({ empresa_id: 'emp-1' }))
  assert.equal(payloadsEnviados.length, 1)

  const p = payloadsEnviados[0]
  assert.deepEqual(p, {
    data_competencia: '2026-04-15',
    valor: 890.75,
    descricao: 'NF 12345',
    observacao: 'NF 12345\n📎 Anexo/Comprovante: https://storage.exemplo/comprovante.pdf',
    id_fornecedor: 'uuid-forn-5',
    conta_financeira: 'banco-id-direto-99',
    rateio: [
      {
        id_categoria: 'cat-uuid-energia',
        valor: 890.75
      }
    ],
    condicao_pagamento: {
      parcelas: [
        {
          descricao: 'NF 12345',
          data_vencimento: '2026-06-15',
          conta_financeira: 'banco-id-direto-99',
          detalhe_valor: {
            valor_bruto: 890.75,
            valor_liquido: 890.75,
            multa: 0,
            juros: 0,
            desconto: 0,
            taxa: 0
          }
        }
      ]
    }
  })
})

test('6. Previne chamadas concorrentes redundantes (promessasContatosEmVoo) para o mesmo fornecedor no mesmo chunk', async () => {
  resetMocks()
  let chamadasBuscarOuCriar = 0
  const payloadsEnviados: any[] = []

  mockBuscarOuCriarContatoFn = async (_token, _nome) => {
    chamadasBuscarOuCriar++
    await new Promise((r) => setTimeout(r, 30))
    return 'uuid-unico-concorrente'
  }
  mockCriarContaPagarFn = async (_token, payload) => {
    payloadsEnviados.push(payload)
    return { protocolId: 'proto-conc', status: 'SUCCESS', createdAt: '' }
  }

  mockContasTable = [
    {
      id: 'c1',
      empresa_id: 'emp-1',
      fornecedor: 'MESMO FORNECEDOR CONCORRENTE LTDA',
      valor: 100,
      vencimento: '2026-04-28',
      descricao: '000001101',
      status: 'pendente'
    },
    {
      id: 'c2',
      empresa_id: 'emp-1',
      fornecedor: 'mesmo fornecedor concorrente ltda',
      valor: 100,
      vencimento: '2026-05-06',
      descricao: '000001101',
      status: 'pendente'
    },
    {
      id: 'c3',
      empresa_id: 'emp-1',
      fornecedor: '  MESMO FORNECEDOR CONCORRENTE LTDA  ',
      valor: 100,
      vencimento: '2026-05-14',
      descricao: '000001101',
      status: 'pendente'
    }
  ]

  const res = await POST(makeRequest({ empresa_id: 'emp-1', limite: 5 }))
  const json = await res.json()

  assert.equal(json.enviados, 3)
  assert.equal(chamadasBuscarOuCriar, 1)
  assert.equal(payloadsEnviados.length, 3)
  for (const p of payloadsEnviados) {
    assert.equal(p.id_fornecedor, 'uuid-unico-concorrente')
  }
})