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
  possuiEnvioConfirmadoOuAmbiguo,
  filtrarContasPagarNaoDuplicadas,
  deduplicarContasPagarContraBanco,
} = await import('@/lib/contas-pagar/import-dedup')

const EMPRESA_BARREIRO_ID = '53f1d9e2-e42a-4036-9188-f5e39879e0a4'

test('1. Cenario Barreiro (48 pagamentos importados sem envio anterior confirmado): todos os 48 permanecem disponiveis para envio', async () => {
  // 41 registros que estavam no banco local com status = 'erro' e conta_azul_id = null (nunca enviados à Conta Azul)
  const quarentaEUmComErroSemEnvio: ContaPagarChaveInput[] = Array.from({ length: 41 }, (_, i) => ({
    id: `id-erro-${i + 1}`,
    empresa_id: EMPRESA_BARREIRO_ID,
    fornecedor: `FORNECEDOR BARREIRO ${i + 1}`,
    valor: 100 + i,
    vencimento: '2026-11-12',
    doc: i % 3 === 0 ? null : `${(i % 3) + 1}/3`,
    descricao: `0001000${String(i + 1).padStart(2, '0')}`,
    status: 'erro',
    conta_azul_id: null,
    erro_mensagem: '[400] {"error":"O campo id_cliente/id_fornecedor é obrigatório"}',
  }))

  // Lote de 48 pagamentos importados do Datacar (41 anteriores com erro + 7 novos títulos)
  const seteNovos: ContaPagarChaveInput[] = Array.from({ length: 7 }, (_, i) => ({
    empresa_id: EMPRESA_BARREIRO_ID,
    fornecedor: `LEONARDO CAUSIN DOS SANTOS`,
    valor: 1000 + i * 500,
    vencimento: `2026-10-${11 + i}`,
    doc: null,
    descricao: `0001${1 + i}1026`,
    status: 'pendente',
  }))

  const lote48Datacar = [
    ...quarentaEUmComErroSemEnvio.map(({ id, status, erro_mensagem, conta_azul_id, ...rest }) => ({
      ...rest,
      status: 'pendente',
    })),
    ...seteNovos,
  ]

  let idsReativadosNoBanco: string[] = []
  const supabaseMock = {
    from(tabela: string) {
      assert.equal(tabela, 'contas_pagar_importadas')
      return {
        select() {
          return {
            eq() {
              return {
                async in() {
                  return { data: quarentaEUmComErroSemEnvio, error: null }
                },
              }
            },
          }
        },
        update(payload: Record<string, any>) {
          assert.equal(payload.status, 'pendente')
          assert.equal(payload.erro_mensagem, null)
          return {
            eq(col: string, val: string) {
              assert.equal(col, 'empresa_id')
              assert.equal(val, EMPRESA_BARREIRO_ID)
              return {
                async in(colIn: string, ids: string[]) {
                  assert.equal(colIn, 'id')
                  idsReativadosNoBanco = ids
                  return { data: null, error: null }
                },
              }
            },
          }
        },
      }
    },
  }

  const resultado = await deduplicarContasPagarContraBanco(
    supabaseMock,
    EMPRESA_BARREIRO_ID,
    lote48Datacar
  )

  // 7 novos títulos para inserir + 41 existentes reativados para 'pendente' = 48 disponíveis na fila de envio!
  assert.equal(resultado.unicosParaInserir.length, 7)
  assert.equal(resultado.existentesParaReativarIds.length, 41)
  assert.equal(idsReativadosNoBanco.length, 41)
  assert.equal(resultado.duplicadosIgnorados.length, 0)
  assert.equal(
    resultado.unicosParaInserir.length +
      resultado.existentesParaReativarIds.length +
      resultado.jaPendentesCount,
    48
  )
})

test('2. Pagamentos com fornecedor, valor e vencimento iguais (ou mesma NF com parcelas), sem confirmacao de envio anterior, nao sao descartados', () => {
  const existentesComErroNaoEnviados: ContaPagarChaveInput[] = [
    {
      id: 'adonai-erro-1',
      empresa_id: EMPRESA_BARREIRO_ID,
      fornecedor: 'ADONAI METAIS LTDA',
      valor: 2110.4,
      vencimento: '2026-11-02',
      doc: null,
      descricao: '000003374',
      status: 'erro',
      conta_azul_id: null,
      erro_mensagem: '[400] {"error":"O campo id_cliente/id_fornecedor é obrigatório"}',
    },
  ]

  const novosTitulos = [
    // Reimportação do mesmo título que falhou sem ter sido enviado à Conta Azul -> deve reativar!
    {
      empresa_id: EMPRESA_BARREIRO_ID,
      fornecedor: 'ADONAI METAIS LTDA',
      valor: 2110.4,
      vencimento: '2026-11-02',
      doc: null,
      descricao: '000003374',
      status: 'pendente',
    },
    // Outra NF do mesmo fornecedor, mesmo valor e mesmo vencimento -> deve inserir!
    {
      empresa_id: EMPRESA_BARREIRO_ID,
      fornecedor: 'ADONAI METAIS LTDA',
      valor: 2110.4,
      vencimento: '2026-11-02',
      doc: null,
      descricao: '000003375',
      status: 'pendente',
    },
    // Duas NFs diferentes com mesma parcela doc = '1/2', mesmo fornecedor, valor e vencimento -> devem inserir!
    {
      empresa_id: EMPRESA_BARREIRO_ID,
      fornecedor: 'ALVORADA PNEUS DISTRIBUIDORA AUTOMOTIVA LTDA',
      valor: 742.0,
      vencimento: '2026-10-21',
      doc: '1/2',
      descricao: '000067385 - 1/2',
      status: 'pendente',
    },
    {
      empresa_id: EMPRESA_BARREIRO_ID,
      fornecedor: 'ALVORADA PNEUS DISTRIBUIDORA AUTOMOTIVA LTDA',
      valor: 742.0,
      vencimento: '2026-10-21',
      doc: '1/2',
      descricao: '000067999 - 1/2',
      status: 'pendente',
    },
  ]

  const resultado = filtrarContasPagarNaoDuplicadas(novosTitulos, existentesComErroNaoEnviados)

  assert.equal(resultado.unicosParaInserir.length, 3)
  assert.deepEqual(resultado.existentesParaReativarIds, ['adonai-erro-1'])
  assert.equal(resultado.duplicadosIgnorados.length, 0)
})

test('3. Lancamento cujo envio anterior a Conta Azul esteja efetivamente confirmado (status enviado ou conta_azul_id preenchido) preserva idempotencia e nao reenvia', () => {
  const existentesConfirmados: ContaPagarChaveInput[] = [
    {
      id: 'brum-enviado-1',
      empresa_id: EMPRESA_BARREIRO_ID,
      fornecedor: 'BRUM AUTO PECAS LTDA',
      valor: 110.0,
      vencimento: '2026-11-12',
      doc: null,
      descricao: '000072553',
      status: 'enviado',
      conta_azul_id: '4172de00-ac0b-4435-bbae-689cf62afe83',
    },
  ]

  const loteReimportado = [
    {
      empresa_id: EMPRESA_BARREIRO_ID,
      fornecedor: 'BRUM AUTO PECAS LTDA',
      valor: 110,
      vencimento: '2026-11-12',
      doc: null,
      descricao: '000072553',
      status: 'pendente',
    },
  ]

  const resultado = filtrarContasPagarNaoDuplicadas(loteReimportado, existentesConfirmados)

  assert.equal(possuiEnvioConfirmadoOuAmbiguo(existentesConfirmados[0]), true)
  assert.equal(resultado.unicosParaInserir.length, 0)
  assert.equal(resultado.existentesParaReativarIds.length, 0)
  assert.equal(resultado.duplicadosIgnorados.length, 1)
})

test('4. Falha ambigua ou timeout na API ([RECONCILIACAO NECESSARIA]) nao e reativada automaticamente sem verificacao', () => {
  const existenteAmbiguoTimeout: ContaPagarChaveInput[] = [
    {
      id: 'conta-timeout-1',
      empresa_id: EMPRESA_BARREIRO_ID,
      fornecedor: 'GOMMA PNEUS LTDA',
      valor: 127.61,
      vencimento: '2026-11-16',
      doc: '1/6',
      descricao: '000110303 - 1/6',
      status: 'erro',
      conta_azul_id: null,
      erro_mensagem:
        '[RECONCILIAÇÃO NECESSÁRIA - TIMEOUT/REDE] fetch failed: ETIMEDOUT — Verifique na Conta Azul se o lançamento foi criado antes de reenviar.',
    },
  ]

  const loteReimportado = [
    {
      empresa_id: EMPRESA_BARREIRO_ID,
      fornecedor: 'GOMMA PNEUS LTDA',
      valor: 127.61,
      vencimento: '2026-11-16',
      doc: '1/6',
      descricao: '000110303 - 1/6',
      status: 'pendente',
    },
  ]

  const resultado = filtrarContasPagarNaoDuplicadas(loteReimportado, existenteAmbiguoTimeout)

  assert.equal(possuiEnvioConfirmadoOuAmbiguo(existenteAmbiguoTimeout[0]), true)
  assert.equal(resultado.unicosParaInserir.length, 0)
  assert.equal(resultado.existentesParaReativarIds.length, 0)
  assert.equal(resultado.duplicadosIgnorados.length, 1)
})

test('5. Reimportacao de dados que ja estao com status pendente mantem vinculos locais sem duplicar linhas e contabiliza como disponiveis', () => {
  const cincoParcelasAguia = [
    '2026-11-04',
    '2026-12-04',
    '2027-01-03',
    '2027-02-02',
    '2027-03-04',
  ].map((vencimento, idx) => ({
    id: `aguia-pendente-${idx + 1}`,
    empresa_id: EMPRESA_BARREIRO_ID,
    fornecedor: 'AGUIA DISTRIBUIDORA DE PECAS LTDA',
    valor: 672.6,
    vencimento,
    doc: null,
    descricao: '000001101',
    status: 'pendente',
    conta_azul_id: null,
  }))

  // 1ª importação (banco vazio): todas as 5 parcelas são inseridas
  const primeiraImportacao = filtrarContasPagarNaoDuplicadas(cincoParcelasAguia, [])
  assert.equal(primeiraImportacao.unicosParaInserir.length, 5)
  assert.equal(primeiraImportacao.duplicadosIgnorados.length, 0)

  // 2ª importação imediata enquanto ainda estão 'pendente': não duplica linha no banco e mantém as 5 pendentes na fila
  const reimportacaoPendente = filtrarContasPagarNaoDuplicadas(
    cincoParcelasAguia,
    cincoParcelasAguia
  )
  assert.equal(reimportacaoPendente.unicosParaInserir.length, 0)
  assert.equal(reimportacaoPendente.existentesParaReativarIds.length, 0)
  assert.equal(reimportacaoPendente.jaPendentesCount, 5)
  assert.equal(reimportacaoPendente.duplicadosIgnorados.length, 0)
})

test('6. Duplicatas identicas dentro do mesmo lote enviado na mesma importacao sao filtradas mantendo a 1a ocorrencia', () => {
  const loteComDuplicataInterna = [
    {
      empresa_id: EMPRESA_BARREIRO_ID,
      fornecedor: 'ADONAI METAIS LTDA',
      valor: 2110.4,
      vencimento: '2026-11-02',
      doc: null,
      descricao: '000003374',
    },
    {
      empresa_id: EMPRESA_BARREIRO_ID,
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
