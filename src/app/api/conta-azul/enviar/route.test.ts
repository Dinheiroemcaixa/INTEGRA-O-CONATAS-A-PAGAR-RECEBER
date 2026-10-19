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
  conta_azul_id?: string | null
  tentativas?: number
  metadata?: Record<string, any>
  created_at?: string
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
let mockDeletesContas: Array<{ filters: Record<string, any> }> = []
let mockLogsIntegracao: Array<Record<string, any>> = []
let mockInsertLogError: Error | null = null

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
    lt(col: string, val: any) {
      filters[`lt_${col}`] = val
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
        if (mockInsertLogError) {
          throw mockInsertLogError
        }
        mockLogsIntegracao.push(payload)
      }
      return { data: payload, error: null }
    },
    then(resolve: (val: any) => void, reject?: (err: any) => void) {
      try {
        if (isDelete) {
          if (table === 'contas_pagar_importadas') {
            mockDeletesContas.push({ filters: { ...filters } })
          }
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
  mockDeletesContas = []
  mockLogsIntegracao = []
  mockInsertLogError = null

  mockListarCategoriasFn = async () => [
    { id: 'cat-uuid-revenda', nome: 'Materiais para Revenda' },
    { id: 'cat-uuid-energia', nome: 'Energia Elétrica' }
  ]
  mockListarContasFinanceirasFn = async () => [
    { id: 'banco-uuid-1', descricao: 'Banco Itaú' }
  ]
  mockBuscarOuCriarContatoFn = async (_token, nome) => `uuid-criado-${nome.toLowerCase().replace(/\s+/g, '-')}`
  mockCriarContaPagarFn = async (_token, _payload) => ({
    id: 'aef1a260-af6b-4edb-9617-0aa5a74b747b',
    condicao_pagamento: {
      quantidade_parcelas: 1,
      parcelas: [
        {
          id: '4172de00-ac0b-4435-bbae-689cf62afe83',
          status: 'EM_ABERTO'
        }
      ]
    }
  })
}

function makeRequest(body: Record<string, any>) {
  return new NextRequest('http://localhost:3000/api/conta-azul/enviar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

test('1. Interpreta resposta real da API v2, grava UUID real da parcela em conta_azul_id (nunca "enviado"), registra evento_id e parcela_id em metadata e logs_integracao e não exclui enviados antigos', async () => {
  resetMocks()
  const payloadsEnviados: any[] = []
  mockBuscarOuCriarContatoFn = async () => '56e47e90-ad82-442c-a415-00e023a5e5d2'
  mockCriarContaPagarFn = async (_token, payload) => {
    payloadsEnviados.push(payload)
    return {
      id: 'aef1a260-af6b-4edb-9617-0aa5a74b747b',
      condicao_pagamento: {
        quantidade_parcelas: 1,
        parcelas: [
          {
            id: '4172de00-ac0b-4435-bbae-689cf62afe83',
            descricao: '000072553',
            data_vencimento: '2026-11-12',
            status: 'EM_ABERTO'
          }
        ]
      }
    }
  }

  mockContasTable = [
    {
      id: 'conta-1',
      empresa_id: 'emp-1',
      fornecedor: 'BRUM AUTO PECAS LTDA',
      valor: 110,
      vencimento: '2026-11-12',
      emissao: '2026-10-13',
      descricao: '000072553',
      categoria: 'Materiais para Revenda',
      conta_financeira: 'Banco Itaú',
      status: 'pendente',
      metadata: { origem: 'planilha' },
      created_at: '2020-01-01T00:00:00Z'
    }
  ]

  const res = await POST(makeRequest({ empresa_id: 'emp-1', contas_ids: ['conta-1'] }))
  const json = await res.json()

  assert.equal(res.status, 200)
  assert.equal(json.enviados, 1)
  assert.equal(json.erros, 0)
  assert.equal(payloadsEnviados.length, 1)
  assert.equal(payloadsEnviados[0].id_fornecedor, '56e47e90-ad82-442c-a415-00e023a5e5d2')
  assert.equal('contato' in payloadsEnviados[0], false)

  // Verifica que conta_azul_id recebeu o UUID real da parcela (e nunca 'enviado')
  assert.equal(mockUpdatesContas.length, 1)
  assert.notEqual(mockUpdatesContas[0].payload.conta_azul_id, 'enviado')
  assert.equal(mockUpdatesContas[0].payload.conta_azul_id, '4172de00-ac0b-4435-bbae-689cf62afe83')
  assert.deepEqual(mockUpdatesContas[0].payload.metadata, {
    origem: 'planilha',
    conta_azul_evento_id: 'aef1a260-af6b-4edb-9617-0aa5a74b747b',
    conta_azul_parcela_id: '4172de00-ac0b-4435-bbae-689cf62afe83'
  })

  // Verifica que nenhuma chamada .delete() foi feita em contas_pagar_importadas
  assert.equal(mockDeletesContas.length, 0)

  // Verifica que o log de auditoria de sucesso foi gravado em logs_integracao
  assert.equal(mockLogsIntegracao.length, 1)
  assert.equal(mockLogsIntegracao[0].status, 'sucesso')
  assert.equal(mockLogsIntegracao[0].detalhes.etapa, 'envio_conta_azul')
  assert.equal(mockLogsIntegracao[0].detalhes.conta_azul_id, '4172de00-ac0b-4435-bbae-689cf62afe83')
  assert.equal(mockLogsIntegracao[0].detalhes.evento_id, 'aef1a260-af6b-4edb-9617-0aa5a74b747b')
  assert.equal(mockLogsIntegracao[0].detalhes.parcela_id, '4172de00-ac0b-4435-bbae-689cf62afe83')
})

test('2. Bloqueia envio quando não existir identificador válido de fornecedor ou quando conta_azul_id já estiver preenchido', async () => {
  resetMocks()
  let chamadasCriarContaPagar = 0
  mockCriarContaPagarFn = async () => {
    chamadasCriarContaPagar++
    return { id: 'nunca-chamado' }
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
    },
    {
      id: 'conta-ja-vinculada',
      empresa_id: 'emp-1',
      fornecedor: 'FORNECEDOR VALIDO',
      valor: 300.0,
      vencimento: '2026-04-22',
      descricao: 'NF 997',
      status: 'pendente',
      conta_azul_id: '4172de00-ac0b-4435-bbae-689cf62afe83'
    }
  ]

  const res = await POST(makeRequest({ empresa_id: 'emp-1' }))
  const json = await res.json()

  assert.equal(res.status, 200)
  assert.equal(json.enviados, 0)
  assert.equal(json.erros, 3)
  assert.equal(chamadasCriarContaPagar, 0)
  assert.equal(mockUpdatesContas.length, 3)
  const updSemForn = mockUpdatesContas.find((u) => u.id === 'conta-sem-forn')!
  const updFalhaLookup = mockUpdatesContas.find((u) => u.id === 'conta-falha-lookup')!
  const updJaVinculada = mockUpdatesContas.find((u) => u.id === 'conta-ja-vinculada')!
  assert.match(updSemForn.payload.erro_mensagem, /id_fornecedor obrigatório/)
  assert.match(updFalhaLookup.payload.erro_mensagem, /id_fornecedor obrigatório/)
  assert.match(updJaVinculada.payload.erro_mensagem, /ENVIO BLOQUEADO/)
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
    return {
      id: 'evento-uuid-depara',
      condicao_pagamento: { parcelas: [{ id: 'parcela-uuid-depara' }] }
    }
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
    return {
      id: 'evento-uuid-5',
      condicao_pagamento: { parcelas: [{ id: 'parcela-uuid-5' }] }
    }
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
    return {
      id: 'evento-conc',
      condicao_pagamento: { parcelas: [{ id: 'parcela-conc' }] }
    }
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

test('7. Falha ao gravar log de sucesso em logs_integracao NÃO reverte status enviado, NÃO apaga UUID real e NÃO dispara novo POST', async () => {
  resetMocks()
  let chamadasCriarContaPagar = 0
  mockInsertLogError = new Error('Falha simulada no banco ao inserir log')
  mockCriarContaPagarFn = async () => {
    chamadasCriarContaPagar++
    return {
      id: 'aef1a260-af6b-4edb-9617-0aa5a74b747b',
      condicao_pagamento: {
        parcelas: [{ id: '4172de00-ac0b-4435-bbae-689cf62afe83' }]
      }
    }
  }

  mockContasTable = [
    {
      id: 'conta-log-fail',
      empresa_id: 'emp-1',
      fornecedor: 'BRUM AUTO PECAS LTDA',
      valor: 110,
      vencimento: '2026-11-12',
      descricao: '000072553',
      status: 'pendente'
    }
  ]

  const res = await POST(makeRequest({ empresa_id: 'emp-1' }))
  const json = await res.json()

  assert.equal(res.status, 200)
  assert.equal(json.enviados, 1)
  assert.equal(json.erros, 0)
  assert.equal(chamadasCriarContaPagar, 1)
  assert.equal(mockUpdatesContas.length, 1)
  assert.equal(mockUpdatesContas[0].payload.status, 'enviado')
  assert.equal(mockUpdatesContas[0].payload.conta_azul_id, '4172de00-ac0b-4435-bbae-689cf62afe83')
})

test('8. Resposta ambígua (sem UUID ou erro de timeout/rede) NÃO grava "enviado" em conta_azul_id, NÃO faz retry automático e sinaliza reconciliação necessária', async () => {
  resetMocks()
  let chamadasCriarContaPagar = 0
  mockCriarContaPagarFn = async (_token, payload) => {
    chamadasCriarContaPagar++
    if (payload.descricao === 'CONTA-SEM-UUID') {
      return {} // resposta ambígua sem id nem parcelas[0].id
    }
    throw new Error('fetch failed: ETIMEDOUT')
  }

  mockContasTable = [
    {
      id: 'conta-ambigua-sem-uuid',
      empresa_id: 'emp-1',
      fornecedor: 'FORNECEDOR AMBIGUO 1',
      valor: 200,
      vencimento: '2026-11-15',
      descricao: 'CONTA-SEM-UUID',
      status: 'pendente'
    },
    {
      id: 'conta-ambigua-timeout',
      empresa_id: 'emp-1',
      fornecedor: 'FORNECEDOR AMBIGUO 2',
      valor: 300,
      vencimento: '2026-11-16',
      descricao: 'CONTA-TIMEOUT',
      status: 'pendente'
    }
  ]

  const res = await POST(makeRequest({ empresa_id: 'emp-1' }))
  const json = await res.json()

  assert.equal(res.status, 200)
  assert.equal(json.enviados, 0)
  assert.equal(json.erros, 2)
  assert.equal(chamadasCriarContaPagar, 2) // exatamente 1 tentativa por conta, sem retry automático

  // Conta 1 (sem UUID)
  const updSemUuid = mockUpdatesContas.find((u) => u.id === 'conta-ambigua-sem-uuid')!
  assert.equal(updSemUuid.payload.status, 'erro')
  assert.equal('conta_azul_id' in updSemUuid.payload, false)
  assert.match(updSemUuid.payload.erro_mensagem, /RECONCILIAÇÃO NECESSÁRIA/)

  // Conta 2 (timeout)
  const updTimeout = mockUpdatesContas.find((u) => u.id === 'conta-ambigua-timeout')!
  assert.equal(updTimeout.payload.status, 'erro')
  assert.equal('conta_azul_id' in updTimeout.payload, false)
  assert.match(updTimeout.payload.erro_mensagem, /RECONCILIAÇÃO NECESSÁRIA - TIMEOUT\/REDE/)

  // Logs com etapa reconciliacao_necessaria
  assert.equal(mockLogsIntegracao.length, 2)
  assert.equal(mockLogsIntegracao[0].detalhes.etapa, 'reconciliacao_necessaria')
  assert.equal(mockLogsIntegracao[0].detalhes.reconciliacao_necessaria, true)
  assert.equal(mockLogsIntegracao[1].detalhes.etapa, 'reconciliacao_necessaria')
  assert.equal(mockLogsIntegracao[1].detalhes.reconciliacao_necessaria, true)
})