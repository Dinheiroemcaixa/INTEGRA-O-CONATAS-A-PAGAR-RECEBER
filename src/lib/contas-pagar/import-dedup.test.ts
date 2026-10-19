import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
import type { ContaPagarChaveInput } from '@/lib/contas-pagar/import-dedup'

const loaderCode = `
import { pathToFileURL } from 'node:url';
import path from 'node:path';
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const targetPath = path.resolve(process.cwd(), 'src', specifier.slice(2) + '.ts');
    return nextResolve(pathToFileURL(targetPath).href, context);
  }
  return nextResolve(specifier, context);
}
`
register(`data:text/javascript,${encodeURIComponent(loaderCode)}`, pathToFileURL('./'))

const {
  gerarChaveDedupContaPagar,
  filtrarContasPagarNaoDuplicadas,
  deduplicarContasPagarContraBanco,
} = await import('@/lib/contas-pagar/import-dedup')

const EMPRESA_ID = '53f1d9e2-e42a-4036-9188-f5e39879e0a4'

test('1. Reimportacao com doc = null (caso real BRUM AUTO PECAS NF 000072553 enviado e ADONAI METAIS NF 000003374 com erro) bloqueia duplicatas', () => {
  const existentesNoBanco: ContaPagarChaveInput[] = [
    {
      empresa_id: EMPRESA_ID,
      fornecedor: 'BRUM AUTO PECAS LTDA',
      valor: 110.0,
      vencimento: '2026-11-12',
      doc: null,
      descricao: '000072553',
    },
    {
      empresa_id: EMPRESA_ID,
      fornecedor: 'ADONAI METAIS LTDA',
      valor: 2110.4,
      vencimento: '2026-11-02',
      doc: null,
      descricao: '000003374',
    },
  ]

  const loteReimportado = [
    {
      empresa_id: EMPRESA_ID,
      fornecedor: 'BRUM AUTO PECAS LTDA',
      valor: 110,
      vencimento: '2026-11-12',
      doc: null,
      descricao: '000072553',
      status: 'pendente',
    },
    {
      empresa_id: EMPRESA_ID,
      fornecedor: 'ADONAI METAIS LTDA',
      valor: 2110.4,
      vencimento: '2026-11-02',
      doc: null,
      descricao: '000003374',
      status: 'pendente',
    },
  ]

  const { unicosParaInserir, duplicadosIgnorados } = filtrarContasPagarNaoDuplicadas(
    loteReimportado,
    existentesNoBanco
  )

  assert.equal(unicosParaInserir.length, 0)
  assert.equal(duplicadosIgnorados.length, 2)
})

test('2. Parcelas legitimas da mesma NF com doc = null e mesmo valor, porem vencimentos diferentes (caso real AGUIA DISTRIBUIDORA NF 000001101 - 5 parcelas) sao permitidas na 1a importacao e bloqueadas na reimportacao', () => {
  const cincoParcelasAguia = [
    '2026-11-04',
    '2026-12-04',
    '2027-01-03',
    '2027-02-02',
    '2027-03-04',
  ].map((vencimento) => ({
    empresa_id: EMPRESA_ID,
    fornecedor: 'AGUIA DISTRIBUIDORA DE PECAS LTDA',
    valor: 672.6,
    vencimento,
    doc: null,
    descricao: '000001101',
  }))

  // 1ª importação (banco vazio): todas as 5 parcelas são aceitas
  const primeiraImportacao = filtrarContasPagarNaoDuplicadas(cincoParcelasAguia, [])
  assert.equal(primeiraImportacao.unicosParaInserir.length, 5)
  assert.equal(primeiraImportacao.duplicadosIgnorados.length, 0)

  // 2ª importação (reimportação contra as 5 já no banco): todas as 5 são bloqueadas
  const reimportacao = filtrarContasPagarNaoDuplicadas(
    cincoParcelasAguia,
    primeiraImportacao.unicosParaInserir
  )
  assert.equal(reimportacao.unicosParaInserir.length, 0)
  assert.equal(reimportacao.duplicadosIgnorados.length, 5)
})

test('3. Titulos legitimos semelhantes no mesmo vencimento e mesmo valor, mas com descricao (NF) ou doc diferentes, sao permitidos', () => {
  const existentesNoBanco: ContaPagarChaveInput[] = [
    {
      empresa_id: EMPRESA_ID,
      fornecedor: 'BRUM AUTO PECAS LTDA',
      valor: 700.0,
      vencimento: '2026-10-21',
      doc: null,
      descricao: '000003868',
    },
  ]

  const novosTitulos = [
    // Outra NF do mesmo fornecedor, mesmo valor e mesmo vencimento, com doc = null
    {
      empresa_id: EMPRESA_ID,
      fornecedor: 'BRUM AUTO PECAS LTDA',
      valor: 700.0,
      vencimento: '2026-10-21',
      doc: null,
      descricao: '000003869',
    },
    // Duas NFs diferentes com mesma parcela doc = '1/2', mesmo valor e mesmo vencimento
    {
      empresa_id: EMPRESA_ID,
      fornecedor: 'ALVORADA PNEUS DISTRIBUIDORA AUTOMOTIVA LTDA',
      valor: 742.0,
      vencimento: '2026-10-21',
      doc: '1/2',
      descricao: '000067385 - 1/2',
    },
    {
      empresa_id: EMPRESA_ID,
      fornecedor: 'ALVORADA PNEUS DISTRIBUIDORA AUTOMOTIVA LTDA',
      valor: 742.0,
      vencimento: '2026-10-21',
      doc: '1/2',
      descricao: '000067999 - 1/2',
    },
  ]

  const { unicosParaInserir, duplicadosIgnorados } = filtrarContasPagarNaoDuplicadas(
    novosTitulos,
    existentesNoBanco
  )

  assert.equal(unicosParaInserir.length, 3)
  assert.equal(duplicadosIgnorados.length, 0)
})

test('4. Duplicatas dentro da propria planilha/lote enviado na mesma importacao sao filtradas mantendo apenas a 1a ocorrencia', () => {
  const loteComDuplicataInterna = [
    {
      empresa_id: EMPRESA_ID,
      fornecedor: 'ADONAI METAIS LTDA',
      valor: 2110.4,
      vencimento: '2026-11-02',
      doc: null,
      descricao: '000003374',
    },
    {
      empresa_id: EMPRESA_ID,
      fornecedor: '  Adonai  Metais Ltda ',
      valor: '2110,40',
      vencimento: '02/11/2026',
      doc: '',
      descricao: '000003374',
    },
  ]

  const { unicosParaInserir, duplicadosIgnorados } = filtrarContasPagarNaoDuplicadas(
    loteComDuplicataInterna,
    []
  )

  assert.equal(unicosParaInserir.length, 1)
  assert.equal(duplicadosIgnorados.length, 1)
  assert.equal(
    gerarChaveDedupContaPagar(loteComDuplicataInterna[0]),
    gerarChaveDedupContaPagar(loteComDuplicataInterna[1])
  )
})

test('5. deduplicarContasPagarContraBanco consulta o Supabase filtrando por empresa_id e vencimentos e retorna apenas os registros ineditos', async () => {
  let filtroEmpresa = ''
  let filtroVencimentos: string[] = []

  const supabaseMock = {
    from(tabela: string) {
      assert.equal(tabela, 'contas_pagar_importadas')
      return {
        select(colunas: string) {
          assert.ok(colunas.includes('doc'))
          assert.ok(colunas.includes('descricao'))
          return {
            eq(col: string, val: string) {
              if (col === 'empresa_id') filtroEmpresa = val
              return {
                async in(colIn: string, vals: string[]) {
                  if (colIn === 'vencimento') filtroVencimentos = vals
                  return {
                    data: [
                      {
                        empresa_id: EMPRESA_ID,
                        fornecedor: 'BRUM AUTO PECAS LTDA',
                        valor: 110.0,
                        vencimento: '2026-11-12',
                        doc: null,
                        descricao: '000072553',
                      },
                    ],
                    error: null,
                  }
                },
              }
            },
          }
        },
      }
    },
  }

  const loteEntrada = [
    {
      empresa_id: EMPRESA_ID,
      fornecedor: 'BRUM AUTO PECAS LTDA',
      valor: 110.0,
      vencimento: '2026-11-12',
      doc: null,
      descricao: '000072553',
    },
    {
      empresa_id: EMPRESA_ID,
      fornecedor: 'GOMMA PNEUS LTDA',
      valor: 110.71,
      vencimento: '2026-10-19',
      doc: '1/4',
      descricao: '000105218 - 1/4',
    },
  ]

  const resultado = await deduplicarContasPagarContraBanco(supabaseMock, EMPRESA_ID, loteEntrada)

  assert.equal(filtroEmpresa, EMPRESA_ID)
  assert.deepEqual(filtroVencimentos.sort(), ['2026-10-19', '2026-11-12'])
  assert.equal(resultado.unicosParaInserir.length, 1)
  assert.equal(resultado.unicosParaInserir[0].fornecedor, 'GOMMA PNEUS LTDA')
  assert.equal(resultado.duplicadosIgnorados.length, 1)
  assert.equal(resultado.duplicadosIgnorados[0].fornecedor, 'BRUM AUTO PECAS LTDA')
})