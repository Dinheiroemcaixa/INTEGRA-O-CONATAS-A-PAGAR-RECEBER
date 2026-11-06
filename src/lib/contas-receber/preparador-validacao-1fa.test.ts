import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
import type {
  AvaliacaoPeriodoContaAzulStoneDTO,
  CategoriaFinanceiraReceberDTO,
  ContaFinanceiraReceberDTO,
  TotaisFiltradosStone,
} from '@/types/contas-receber'

const loaderCode = `
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const targetPath = path.resolve(process.cwd(), 'src', specifier.slice(2) + '.ts');
    return nextResolve(pathToFileURL(targetPath).href, context);
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !path.extname(specifier) && context.parentURL) {
    const parentDir = path.dirname(fileURLToPath(context.parentURL));
    const candidateTs = path.resolve(parentDir, specifier + '.ts');
    if (fs.existsSync(candidateTs)) {
      return nextResolve(pathToFileURL(candidateTs).href, context);
    }
  }
  return nextResolve(specifier, context);
}
`
register(`data:text/javascript,${encodeURIComponent(loaderCode)}`, pathToFileURL('./'))

const {
  agruparLinhasStonePorDataBandeiraModalidade,
  atualizarValorConferenciaPorGrupo,
  calcularJanelaConsultaContaAzulStone,
  classificarBandeiraStoneCanonica,
  classificarProdutoModalidadeStone,
  conciliarGrupoStoneComContaAzul,
  conciliarListaGruposStone,
  conferirValorLiquidoComExtratoBancario,
  interpretarCsvStone,
} = await import('@/lib/contas-receber/stone-csv-parser')
const {
  ehCategoriaReceitasDeVendasValida,
  ehCategoriaTarifasCartaoMdrValida,
  prepararEValidarLancamentosEtapa1FA,
} = await import('@/lib/contas-receber/preparador-validacao-1fa')

const EMPRESA_LOJA_ATIVA_ID = '53f1d9e2-e42a-4036-9188-f5e39879e0a4'
const EMPRESA_LOJA_ATIVA_NOME = 'DCX BARREIRO'

const CONTA_FINANCEIRA_LOJA: ContaFinanceiraReceberDTO = {
  id: 'cf-stone-001',
  descricao: 'CONTA CORRENTE ITAÚ - BARREIRO',
  tipo: 'CONTA_CORRENTE',
  banco: 'ITAU',
}

const CATEGORIA_RECEITA_VENDAS: CategoriaFinanceiraReceberDTO = {
  id: 'cat-rec-vendas-001',
  nome: 'Receitas de Vendas',
  tipo: 'RECEITA',
}

const CATEGORIA_DESPESA_MDR: CategoriaFinanceiraReceberDTO = {
  id: 'cat-desp-mdr-001',
  nome: 'Tarifas de Cartão de Créditos',
  tipo: 'DESPESA',
}

const TOTAIS_STONE_VALIDOS: TotaisFiltradosStone = {
  quantidade_registros_total: 4,
  quantidade_vendas_operacionais: 4,
  quantidade_ajustes_cobrancas_estornos: 0,
  quantidade_parcelas_pagas: 4,
  quantidade_parcelas_abertas: 0,
  quantidade_parcelas_agendadas: 0,
  valor_bruto_micro: 1_445_000_000,
  desconto_mdr_micro: 11_130_000,
  desconto_antecipacao_micro: 0,
  valor_liquido_micro: 1_433_870_000,
  valor_bruto_centavos: 144500,
  desconto_mdr_centavos: 1113,
  desconto_antecipacao_centavos: 0,
  valor_liquido_centavos: 143387,
  desconto_mdr_ajustado_centavos: 1113,
  diferenca_arredondamento_centavos: 0,
  total_ajustes_nao_operacionais_micro: 0,
  total_ajustes_nao_operacionais_centavos: 0,
}

test('1. Cenário válido completo (CONFERIDO_EXATO + Receitas de Vendas + Tarifas de Cartão de Créditos + Conta Financeira + Sem Duplicidade): aprova Etapa 1F-A sem transmitir', () => {
  const conferenciaExata = conferirValorLiquidoComExtratoBancario(
    TOTAIS_STONE_VALIDOS,
    '1.433,87'
  )

  assert.equal(conferenciaExata.status_conferencia, 'CONFERIDO_EXATO')
  assert.equal(conferenciaExata.conferencia_aprovada, true)

  const resultado = prepararEValidarLancamentosEtapa1FA({
    empresaId: EMPRESA_LOJA_ATIVA_ID,
    empresaNome: EMPRESA_LOJA_ATIVA_NOME,
    filtros: {
      data_vencimento_original: '04/11/2026',
      bandeira: 'Visa',
      produto: 'Credito',
    },
    totais: TOTAIS_STONE_VALIDOS,
    conferencia: conferenciaExata,
    contaFinanceiraSelecionada: CONTA_FINANCEIRA_LOJA,
    categoriaReceitaSelecionada: CATEGORIA_RECEITA_VENDAS,
    categoriaDespesaMdrSelecionada: CATEGORIA_DESPESA_MDR,
  })

  assert.equal(resultado.etapa, '1F-A')
  assert.equal(resultado.transmissao_executada, false)
  assert.equal(resultado.pronto_para_etapa_1fb, true)
  assert.equal(resultado.status_conferencia_atual, 'CONFERIDO_EXATO')
  assert.equal(resultado.bloqueios.length, 0)

  // Verifica Receita Bruta
  assert.equal(resultado.lancamento_receita_bruta.bloqueado, false)
  assert.equal(resultado.lancamento_receita_bruta.valor_centavos, 144500)
  assert.equal(
    resultado.lancamento_receita_bruta.categoria_selecionada_nome,
    'Receitas de Vendas'
  )
  assert.equal(
    resultado.lancamento_receita_bruta.conta_financeira_id,
    CONTA_FINANCEIRA_LOJA.id
  )
  assert.equal(
    resultado.lancamento_receita_bruta.payload_simulado_conta_azul?.valor,
    1445
  )

  // Verifica Despesa MDR
  assert.equal(resultado.lancamento_despesa_mdr.bloqueado, false)
  assert.equal(resultado.lancamento_despesa_mdr.valor_centavos, 1113)
  assert.equal(
    resultado.lancamento_despesa_mdr.categoria_selecionada_nome,
    'Tarifas de Cartão de Créditos'
  )
  assert.equal(
    resultado.lancamento_despesa_mdr.conta_financeira_id,
    CONTA_FINANCEIRA_LOJA.id
  )
  assert.equal(
    resultado.lancamento_despesa_mdr.payload_simulado_conta_azul?.valor,
    11.13
  )
})

test('2. Bloqueia quando conferência bancária NÃO é CONFERIDO_EXATO (divergência de R$ 0,01 ou aguardando valor)', () => {
  const conferenciaDivergente = conferirValorLiquidoComExtratoBancario(
    TOTAIS_STONE_VALIDOS,
    '1.433,88'
  )

  assert.equal(conferenciaDivergente.status_conferencia, 'DIVERGENTE_BLOQUEADA')

  const resultado = prepararEValidarLancamentosEtapa1FA({
    empresaId: EMPRESA_LOJA_ATIVA_ID,
    empresaNome: EMPRESA_LOJA_ATIVA_NOME,
    filtros: {
      data_vencimento_original: '04/11/2026',
      bandeira: 'Visa',
      produto: 'Credito',
    },
    totais: TOTAIS_STONE_VALIDOS,
    conferencia: conferenciaDivergente,
    contaFinanceiraSelecionada: CONTA_FINANCEIRA_LOJA,
    categoriaReceitaSelecionada: CATEGORIA_RECEITA_VENDAS,
    categoriaDespesaMdrSelecionada: CATEGORIA_DESPESA_MDR,
  })

  assert.equal(resultado.pronto_para_etapa_1fb, false)
  assert.equal(resultado.conferencia_exata_aprovada, false)
  assert.equal(
    resultado.bloqueios.some((b) => b.codigo === 'CONFERENCIA_NAO_EXATA'),
    true
  )
})

test('3. Bloqueia quando categorias não são "Receitas de Vendas" ou "Tarifas de Cartão de Créditos", ou quando Conta Financeira/Data estão ausentes', () => {
  const conferenciaExata = conferirValorLiquidoComExtratoBancario(
    TOTAIS_STONE_VALIDOS,
    '1.433,87'
  )

  const categoriaReceitaIncorreta: CategoriaFinanceiraReceberDTO = {
    id: 'cat-outra-1',
    nome: 'Outras Receitas Financeiras',
    tipo: 'RECEITA',
  }
  const categoriaDespesaIncorreta: CategoriaFinanceiraReceberDTO = {
    id: 'cat-outra-2',
    nome: 'Despesas Bancárias Gerais',
    tipo: 'DESPESA',
  }

  assert.equal(ehCategoriaReceitasDeVendasValida(categoriaReceitaIncorreta), false)
  assert.equal(ehCategoriaTarifasCartaoMdrValida(categoriaDespesaIncorreta), false)

  const resultado = prepararEValidarLancamentosEtapa1FA({
    empresaId: 'emp-demo', // Loja demo inválida
    empresaNome: 'Loja Demo',
    filtros: {
      data_vencimento_original: '', // Data não selecionada
      bandeira: 'Visa',
      produto: 'Credito',
    },
    totais: TOTAIS_STONE_VALIDOS,
    conferencia: conferenciaExata,
    contaFinanceiraSelecionada: null, // Sem conta financeira
    categoriaReceitaSelecionada: categoriaReceitaIncorreta,
    categoriaDespesaMdrSelecionada: categoriaDespesaIncorreta,
  })

  assert.equal(resultado.pronto_para_etapa_1fb, false)
  const codigos = resultado.bloqueios.map((b) => b.codigo)
  assert.equal(codigos.includes('EMPRESA_OU_LOJA_INVALIDA'), true)
  assert.equal(codigos.includes('DATA_OPERACAO_INVALIDA'), true)
  assert.equal(codigos.includes('CONTA_FINANCEIRA_NAO_SELECIONADA'), true)
  assert.equal(codigos.includes('CATEGORIA_RECEITA_VENDAS_INVALIDA'), true)
  assert.equal(codigos.includes('CATEGORIA_DESPESA_MDR_INVALIDA'), true)
})

test('4. Bloqueia por idempotência local e quando já existe lançamento na Conta Azul (prevenção de duplicidades)', () => {
  const conferenciaExata = conferirValorLiquidoComExtratoBancario(
    TOTAIS_STONE_VALIDOS,
    '1.433,87'
  )

  // Primeiro obtemos a chave gerada para simular que já foi executada
  const previaInicial = prepararEValidarLancamentosEtapa1FA({
    empresaId: EMPRESA_LOJA_ATIVA_ID,
    empresaNome: EMPRESA_LOJA_ATIVA_NOME,
    filtros: {
      data_vencimento_original: '04/11/2026',
      bandeira: 'Visa',
      produto: 'Credito',
    },
    totais: TOTAIS_STONE_VALIDOS,
    conferencia: conferenciaExata,
    contaFinanceiraSelecionada: CONTA_FINANCEIRA_LOJA,
    categoriaReceitaSelecionada: CATEGORIA_RECEITA_VENDAS,
    categoriaDespesaMdrSelecionada: CATEGORIA_DESPESA_MDR,
  })

  const avaliacaoComDuplicidadeCA: AvaliacaoPeriodoContaAzulStoneDTO = {
    periodo_consultado: { data_de: '2026-11-04', data_ate: '2026-11-04' },
    total_receitas_no_periodo: 1,
    total_despesas_no_periodo: 0,
    receitas_no_periodo: [],
    despesas_no_periodo: [],
    triagem_receita_bruta: {
      classificacao: 'JA_QUITADO_BLOQUEADO',
      autoriza_vinculo_automatico: false,
      ja_quitado: true,
      candidatos: [
        {
          id: 'ca-rec-existente-99',
          tipo_lancamento: 'RECEITA',
          data_vencimento: '2026-11-04',
          valor_total_centavos: 144500,
          valor_pago_centavos: 144500,
          valor_aberto_centavos: 0,
          status: 'QUITADO',
          descricao: 'Recebimento Cartão Stone Visa Credito',
        },
      ],
      mensagem: 'Lançamento já quitado na Conta Azul.',
    },
    triagem_despesa_mdr: null,
    triagem_deposito_liquido: null,
  }

  const resultadoBloqueado = prepararEValidarLancamentosEtapa1FA({
    empresaId: EMPRESA_LOJA_ATIVA_ID,
    empresaNome: EMPRESA_LOJA_ATIVA_NOME,
    filtros: {
      data_vencimento_original: '04/11/2026',
      bandeira: 'Visa',
      produto: 'Credito',
    },
    totais: TOTAIS_STONE_VALIDOS,
    conferencia: conferenciaExata,
    contaFinanceiraSelecionada: CONTA_FINANCEIRA_LOJA,
    categoriaReceitaSelecionada: CATEGORIA_RECEITA_VENDAS,
    categoriaDespesaMdrSelecionada: CATEGORIA_DESPESA_MDR,
    avaliacaoPeriodoCA: avaliacaoComDuplicidadeCA,
    operacoesExistentesIdempotencia: [
      {
        chave_idempotencia:
          previaInicial.validacao_idempotencia.chave_receita_bruta,
        status: 'BAIXADO_COMPLETO',
        conta_azul_parcela_id: 'ca-rec-existente-99',
      },
    ],
  })

  assert.equal(resultadoBloqueado.pronto_para_etapa_1fb, false)
  const codigos = resultadoBloqueado.bloqueios.map((b) => b.codigo)
  assert.equal(codigos.includes('IDEMPOTENCIA_JA_EXECUTADA_OU_AMBIGUA'), true)
  assert.equal(codigos.includes('LANCAMENTO_JA_EXISTENTE_CONTA_AZUL'), true)
})

const CABECALHO_CSV_STONE = [
  'DOCUMENTO',
  'STONECODE',
  'CATEGORIA',
  'DATA DA VENDA',
  'DATA DE VENCIMENTO',
  'DATA DE VENCIMENTO ORIGINAL',
  'BANDEIRA',
  'PRODUTO',
  'STONE ID',
  'QTD DE PARCELAS',
  'Nº DA PARCELA',
  'VALOR BRUTO',
  'VALOR LÍQUIDO',
  'DESCONTO DE MDR',
  'DESCONTO DE ANTECIPAÇÃO',
  'DESCONTO UNIFICADO',
  'ÚLTIMO STATUS',
  'DATA DO ÚLTIMO STATUS',
  'ENTRADAS BRUTAS',
  'SAÍDAS BRUTAS',
].join(';')

function montarLinhaCsvStone(params: {
  stoneId: string
  dataVenda?: string
  dataVencimento?: string
  dataVencimentoOriginal: string
  bandeira: string
  produto: string
  qtdParcelas?: number
  numeroParcela?: number
  valorBruto: string
  valorLiquido: string
  descontoMdr: string
  ultimoStatus?: string
  dataUltimoStatus?: string
}): string {
  const dataVenda = params.dataVenda || '03/11/2026'
  const dataVencimento = params.dataVencimento || params.dataVencimentoOriginal
  const dataUltimoStatus = params.dataUltimoStatus || dataVencimento
  const qtdParcelas = params.qtdParcelas ?? 1
  const numeroParcela = params.numeroParcela ?? 1
  const ultimoStatus = params.ultimoStatus || 'Pago'

  return [
    '12345678000199',
    '99887766',
    'Venda',
    dataVenda,
    dataVencimento,
    params.dataVencimentoOriginal,
    params.bandeira,
    params.produto,
    params.stoneId,
    String(qtdParcelas),
    String(numeroParcela),
    params.valorBruto,
    params.valorLiquido,
    params.descontoMdr,
    '0,000000',
    params.descontoMdr,
    ultimoStatus,
    dataUltimoStatus,
    params.valorBruto,
    params.descontoMdr,
  ].join(';')
}

test('5. Classificação de bandeiras canônicas (VISA, MAST, ELO, AMEX, HIPER, CABAL) e modalidades Stone (Crédito -> CD, Débito -> DB)', () => {
  assert.equal(classificarBandeiraStoneCanonica('Visa').siglaContaAzul, 'VISA')
  assert.equal(
    classificarBandeiraStoneCanonica('MasterCard').siglaContaAzul,
    'MAST'
  )
  assert.equal(
    classificarBandeiraStoneCanonica('Maestro').siglaContaAzul,
    'MAST'
  )
  assert.equal(classificarBandeiraStoneCanonica('Elo').siglaContaAzul, 'ELO')
  assert.equal(
    classificarBandeiraStoneCanonica('American Express').siglaContaAzul,
    'AMEX'
  )
  assert.equal(
    classificarBandeiraStoneCanonica('Hipercard').siglaContaAzul,
    'HIPER'
  )
  assert.equal(
    classificarBandeiraStoneCanonica('Cabal').siglaContaAzul,
    'CABAL'
  )

  const credVista = classificarProdutoModalidadeStone('Crédito à Vista', 'Visa')
  assert.equal(credVista.modalidadeSigla, 'CD')
  assert.equal(credVista.subtipoProduto, 'CREDITO_A_VISTA')
  assert.equal(credVista.compativelConciliacaoPadraoCdDb, true)

  const credParc = classificarProdutoModalidadeStone(
    'Crédito Parcelado',
    'MasterCard',
    3
  )
  assert.equal(credParc.modalidadeSigla, 'CD')
  assert.equal(credParc.subtipoProduto, 'CREDITO_PARCELADO')
  assert.equal(credParc.compativelConciliacaoPadraoCdDb, true)

  const debito = classificarProdutoModalidadeStone('Débito', 'Elo')
  assert.equal(debito.modalidadeSigla, 'DB')
  assert.equal(debito.subtipoProduto, 'DEBITO')
  assert.equal(debito.compativelConciliacaoPadraoCdDb, true)

  const debitoPre = classificarProdutoModalidadeStone('Débito Pré-Pago', 'Visa')
  assert.equal(debitoPre.modalidadeSigla, 'DB')
  assert.equal(debitoPre.subtipoProduto, 'DEBITO_PRE_PAGO')
  assert.equal(debitoPre.compativelConciliacaoPadraoCdDb, true)
})

test('6. Bloqueia Voucher e PIX na classificação (compativelConciliacaoPadraoCdDb: false) e na preparação (PRODUTO_INCOMPATIVEL_CONCILIACAO_CD_DB)', () => {
  const classifVoucher = classificarProdutoModalidadeStone(
    'Voucher Alimentação',
    'Alelo'
  )
  assert.equal(classifVoucher.modalidadeSigla, 'NAO_APLICAVEL')
  assert.equal(classifVoucher.subtipoProduto, 'VOUCHER')
  assert.equal(classifVoucher.compativelConciliacaoPadraoCdDb, false)

  const classifPix = classificarProdutoModalidadeStone('PIX QR Code', 'PIX')
  assert.equal(classifPix.modalidadeSigla, 'NAO_APLICAVEL')
  assert.equal(classifPix.subtipoProduto, 'PIX')
  assert.equal(classifPix.compativelConciliacaoPadraoCdDb, false)

  const conferenciaExata = conferirValorLiquidoComExtratoBancario(
    TOTAIS_STONE_VALIDOS,
    '1.433,87'
  )

  const previaVoucher = prepararEValidarLancamentosEtapa1FA({
    empresaId: EMPRESA_LOJA_ATIVA_ID,
    empresaNome: EMPRESA_LOJA_ATIVA_NOME,
    filtros: {
      data_vencimento_original: '04/11/2026',
      bandeira: 'Alelo',
      produto: 'Voucher Alimentação',
    },
    totais: TOTAIS_STONE_VALIDOS,
    conferencia: conferenciaExata,
    contaFinanceiraSelecionada: CONTA_FINANCEIRA_LOJA,
    categoriaReceitaSelecionada: CATEGORIA_RECEITA_VENDAS,
    categoriaDespesaMdrSelecionada: CATEGORIA_DESPESA_MDR,
  })
  assert.equal(previaVoucher.pronto_para_etapa_1fb, false)
  assert.equal(
    previaVoucher.bloqueios.some(
      (b) => b.codigo === 'PRODUTO_INCOMPATIVEL_CONCILIACAO_CD_DB'
    ),
    true
  )

  const previaPix = prepararEValidarLancamentosEtapa1FA({
    empresaId: EMPRESA_LOJA_ATIVA_ID,
    empresaNome: EMPRESA_LOJA_ATIVA_NOME,
    filtros: {
      data_vencimento_original: '04/11/2026',
      bandeira: 'PIX',
      produto: 'PIX',
    },
    totais: TOTAIS_STONE_VALIDOS,
    conferencia: conferenciaExata,
    contaFinanceiraSelecionada: CONTA_FINANCEIRA_LOJA,
    categoriaReceitaSelecionada: CATEGORIA_RECEITA_VENDAS,
    categoriaDespesaMdrSelecionada: CATEGORIA_DESPESA_MDR,
  })
  assert.equal(previaPix.pronto_para_etapa_1fb, false)
  assert.equal(
    previaPix.bloqueios.some(
      (b) => b.codigo === 'PRODUTO_INCOMPATIVEL_CONCILIACAO_CD_DB'
    ),
    true
  )
})

test('7. Agrupamento por Data + Bandeira + Modalidade, preservação das 3 datas do CSV e cálculo da janela GET de até 15 dias', () => {
  const csv = [
    CABECALHO_CSV_STONE,
    montarLinhaCsvStone({
      stoneId: 'ST-001',
      dataVenda: '01/11/2026',
      dataVencimentoOriginal: '04/11/2026',
      dataVencimento: '05/11/2026',
      dataUltimoStatus: '06/11/2026',
      bandeira: 'Visa',
      produto: 'Crédito',
      valorBruto: '500,000000',
      valorLiquido: '490,000000',
      descontoMdr: '-10,000000',
    }),
    montarLinhaCsvStone({
      stoneId: 'ST-002',
      dataVenda: '03/11/2026',
      dataVencimentoOriginal: '04/11/2026',
      dataVencimento: '04/11/2026',
      dataUltimoStatus: '04/11/2026',
      bandeira: 'MasterCard',
      produto: 'Débito',
      valorBruto: '300,000000',
      valorLiquido: '295,500000',
      descontoMdr: '-4,500000',
    }),
  ].join('\n')

  const interpretado = interpretarCsvStone(csv)
  assert.equal(interpretado.sucesso, true)
  assert.equal(interpretado.linhas.length, 2)

  const grupos = agruparLinhasStonePorDataBandeiraModalidade(
    interpretado.linhas
  )
  assert.equal(grupos.length, 2)

  const grupoMastDb = grupos.find(
    (g) => g.rotulo_conta_azul_esperado === 'STONE MAST DB'
  )
  const grupoVisaCd = grupos.find(
    (g) => g.rotulo_conta_azul_esperado === 'STONE VISA CD'
  )

  assert.ok(grupoMastDb)
  assert.ok(grupoVisaCd)

  // Preservação das 3 datas no grupo Visa CD (Vencimento Original: 04/11, Vencimento: 05/11, Último Status: 06/11)
  assert.equal(grupoVisaCd.data_vencimento_original_br, '04/11/2026')
  assert.equal(grupoVisaCd.data_vencimento_original_iso, '2026-11-04')
  assert.deepEqual(grupoVisaCd.datas_vencimento_br, ['05/11/2026'])
  assert.deepEqual(grupoVisaCd.datas_vencimento_iso, ['2026-11-05'])
  assert.deepEqual(grupoVisaCd.datas_ultimo_status_br, ['06/11/2026'])
  assert.deepEqual(grupoVisaCd.datas_ultimo_status_iso, ['2026-11-06'])
  assert.equal(grupoVisaCd.possui_liquidacao_em_data_distinta, true)

  // Janela de consulta cobrindo as 3 datas
  const janela = calcularJanelaConsultaContaAzulStone(
    interpretado.linhas,
    '04/11/2026'
  )
  assert.ok(janela)
  assert.equal(janela.minIso, '2026-11-04')
  assert.equal(janela.maxIso, '2026-11-06')
  assert.deepEqual(janela.datasVencimentoOriginalIso, ['2026-11-04'])
  assert.deepEqual(janela.datasLiquidacaoEfetivaIso, [
    '2026-11-04',
    '2026-11-05',
    '2026-11-06',
  ])
})

test('8. Conciliação individual com Conta Azul (CONFERIDO_EXATO, DIVERGENTE_BLOQUEADA, AUSENTE_CONTA_AZUL, DUPLICIDADE_AMBIGUA_CA) e liberação da Etapa 1F-A sem falso positivo', () => {
  const csv = [
    CABECALHO_CSV_STONE,
    montarLinhaCsvStone({
      stoneId: 'ST-101',
      dataVencimentoOriginal: '04/11/2026',
      dataVencimento: '05/11/2026',
      dataUltimoStatus: '05/11/2026',
      bandeira: 'Visa',
      produto: 'Crédito',
      valorBruto: '1000,000000',
      valorLiquido: '980,000000',
      descontoMdr: '-20,000000',
    }),
  ].join('\n')

  const { linhas } = interpretarCsvStone(csv)
  const [grupoVisaCd] = agruparLinhasStonePorDataBandeiraModalidade(linhas)

  // A) CONFERIDO_EXATO via GET da Conta Azul (casando pela Data de Vencimento efetiva 2026-11-05)
  const lancamentoExatoCA = {
    id: 'ca-stone-visa-cd-1',
    tipo_lancamento: 'RECEITA' as const,
    data_vencimento: '2026-11-05',
    valor_total_centavos: 98000,
    valor_pago_centavos: 98000,
    valor_aberto_centavos: 0,
    status: 'QUITADO',
    descricao: 'STONE VISA CD',
  }

  const avaliacaoExataCA: AvaliacaoPeriodoContaAzulStoneDTO = {
    periodo_consultado: { data_de: '2026-11-04', data_ate: '2026-11-05' },
    total_receitas_no_periodo: 1,
    total_despesas_no_periodo: 0,
    receitas_no_periodo: [lancamentoExatoCA],
    despesas_no_periodo: [],
    triagem_receita_bruta: null,
    triagem_despesa_mdr: null,
    triagem_deposito_liquido: {
      classificacao: 'CORRESPONDENCIA_DETERMINISTICA',
      autoriza_vinculo_automatico: true,
      ja_quitado: true,
      candidatos: [lancamentoExatoCA],
      mensagem: 'Depósito líquido localizado no período.',
    },
  }

  const concExata = conciliarGrupoStoneComContaAzul({
    grupo: grupoVisaCd,
    avaliacaoPeriodoCA: avaliacaoExataCA,
  })
  assert.equal(concExata.estado_grupo, 'CONFERIDO_EXATO')
  assert.equal(concExata.origem_conferencia, 'AUTOMATICA_GET_CONTA_AZUL')
  assert.equal(concExata.conferencia_aprovada, true)
  assert.equal(concExata.campo_data_correspondencia, 'DATA_VENCIMENTO')

  // Liberação da Etapa 1F-A sem falso positivo de duplicidade quando o depósito líquido é o próprio lançamento conciliado do grupo
  const previa1FA = prepararEValidarLancamentosEtapa1FA({
    empresaId: EMPRESA_LOJA_ATIVA_ID,
    empresaNome: EMPRESA_LOJA_ATIVA_NOME,
    filtros: {
      data_vencimento_original: '04/11/2026',
      bandeira: 'Visa',
      produto: 'Crédito',
    },
    totais: grupoVisaCd.totais,
    conferencia: concExata,
    contaFinanceiraSelecionada: CONTA_FINANCEIRA_LOJA,
    categoriaReceitaSelecionada: CATEGORIA_RECEITA_VENDAS,
    categoriaDespesaMdrSelecionada: CATEGORIA_DESPESA_MDR,
    avaliacaoPeriodoCA: avaliacaoExataCA,
  })
  assert.equal(previa1FA.pronto_para_etapa_1fb, true)
  assert.equal(previa1FA.bloqueios.length, 0)
  assert.equal(
    previa1FA.avisos.some((a) => a.includes('STONE VISA CD')),
    true
  )

  // B) DIVERGENTE_BLOQUEADA (valor na Conta Azul difere do líquido da Stone)
  const concDivergente = conciliarGrupoStoneComContaAzul({
    grupo: grupoVisaCd,
    avaliacaoPeriodoCA: {
      ...avaliacaoExataCA,
      receitas_no_periodo: [
        { ...lancamentoExatoCA, valor_total_centavos: 97900 },
      ],
    },
  })
  assert.equal(concDivergente.estado_grupo, 'DIVERGENTE_BLOQUEADA')
  assert.equal(concDivergente.conferencia_aprovada, false)
  assert.equal(concDivergente.diferenca_centavos, -100)

  // C) AUSENTE_CONTA_AZUL (nenhum lançamento encontrado para o grupo)
  const concAusente = conciliarGrupoStoneComContaAzul({
    grupo: grupoVisaCd,
    avaliacaoPeriodoCA: {
      ...avaliacaoExataCA,
      receitas_no_periodo: [],
    },
  })
  assert.equal(concAusente.estado_grupo, 'AUSENTE_CONTA_AZUL')
  assert.equal(concAusente.conferencia_aprovada, false)

  // D) DUPLICIDADE_AMBIGUA_CA (2 lançamentos candidatos para o mesmo grupo no período)
  const concDuplicada = conciliarGrupoStoneComContaAzul({
    grupo: grupoVisaCd,
    avaliacaoPeriodoCA: {
      ...avaliacaoExataCA,
      receitas_no_periodo: [
        lancamentoExatoCA,
        { ...lancamentoExatoCA, id: 'ca-stone-visa-cd-2' },
      ],
    },
  })
  assert.equal(concDuplicada.estado_grupo, 'DUPLICIDADE_AMBIGUA_CA')
  assert.equal(concDuplicada.conferencia_aprovada, false)
})

test('9. Distinção estrita entre grupos com mesmo valor líquido em bandeiras/modalidades diferentes, preservação de valores ao alternar grupos e bloqueio sem Bandeira/Modalidade individual', () => {
  // Dois grupos na mesma data (04/11/2026) com exatamente o MESMO valor líquido (R$ 490,00 = 49000 centavos):
  // - STONE VISA CD
  // - STONE MAST CD
  // - STONE VISA DB
  const csv = [
    CABECALHO_CSV_STONE,
    montarLinhaCsvStone({
      stoneId: 'ST-201',
      dataVencimentoOriginal: '04/11/2026',
      bandeira: 'Visa',
      produto: 'Crédito',
      valorBruto: '500,000000',
      valorLiquido: '490,000000',
      descontoMdr: '-10,000000',
    }),
    montarLinhaCsvStone({
      stoneId: 'ST-202',
      dataVencimentoOriginal: '04/11/2026',
      bandeira: 'MasterCard',
      produto: 'Crédito',
      valorBruto: '500,000000',
      valorLiquido: '490,000000',
      descontoMdr: '-10,000000',
    }),
    montarLinhaCsvStone({
      stoneId: 'ST-203',
      dataVencimentoOriginal: '04/11/2026',
      bandeira: 'Visa',
      produto: 'Débito',
      valorBruto: '495,000000',
      valorLiquido: '490,000000',
      descontoMdr: '-5,000000',
    }),
  ].join('\n')

  const { linhas } = interpretarCsvStone(csv)
  const grupos = agruparLinhasStonePorDataBandeiraModalidade(linhas)
  assert.equal(grupos.length, 3)

  const grupoMastCd = grupos.find(
    (g) => g.rotulo_conta_azul_esperado === 'STONE MAST CD'
  )!
  const grupoVisaCd = grupos.find(
    (g) => g.rotulo_conta_azul_esperado === 'STONE VISA CD'
  )!
  const grupoVisaDb = grupos.find(
    (g) => g.rotulo_conta_azul_esperado === 'STONE VISA DB'
  )!

  // Na Conta Azul existe apenas o lançamento de "STONE MAST CD" de R$ 490,00.
  // "STONE VISA CD" e "STONE VISA DB" possuem o mesmo valor (R$ 490,00), mas NÃO podem casar com "STONE MAST CD"!
  const avaliacaoApenasMastCd: AvaliacaoPeriodoContaAzulStoneDTO = {
    periodo_consultado: { data_de: '2026-11-04', data_ate: '2026-11-04' },
    total_receitas_no_periodo: 1,
    total_despesas_no_periodo: 0,
    receitas_no_periodo: [
      {
        id: 'ca-mast-cd-490',
        tipo_lancamento: 'RECEITA',
        data_vencimento: '2026-11-04',
        valor_total_centavos: 49000,
        valor_pago_centavos: 49000,
        valor_aberto_centavos: 0,
        status: 'QUITADO',
        descricao: 'STONE MAST CD',
      },
    ],
    despesas_no_periodo: [],
    triagem_receita_bruta: null,
    triagem_despesa_mdr: null,
    triagem_deposito_liquido: null,
  }

  // Preservação dos valores conferidos manualmente ao alternar entre grupos
  let mapaValoresManuais: Record<string, string> = {}
  mapaValoresManuais = atualizarValorConferenciaPorGrupo(
    mapaValoresManuais,
    grupoVisaCd.chave_grupo,
    '490,00'
  )
  mapaValoresManuais = atualizarValorConferenciaPorGrupo(
    mapaValoresManuais,
    grupoVisaDb.chave_grupo,
    '489,90'
  )

  assert.equal(mapaValoresManuais[grupoVisaCd.chave_grupo], '490,00')
  assert.equal(mapaValoresManuais[grupoVisaDb.chave_grupo], '489,90')

  const resultadosPorGrupo = conciliarListaGruposStone({
    grupos,
    avaliacaoPeriodoCA: avaliacaoApenasMastCd,
    valoresManuaisPorGrupo: mapaValoresManuais,
  })

  // STONE MAST CD conciliado via GET da Conta Azul
  assert.equal(
    resultadosPorGrupo[grupoMastCd.chave_grupo].estado_grupo,
    'CONFERIDO_EXATO'
  )
  assert.equal(
    resultadosPorGrupo[grupoMastCd.chave_grupo].origem_conferencia,
    'AUTOMATICA_GET_CONTA_AZUL'
  )

  // STONE VISA CD não confundiu com MAST CD do GET, mas preservou sua conferência manual exata ('490,00')
  assert.equal(
    resultadosPorGrupo[grupoVisaCd.chave_grupo].estado_grupo,
    'CONFERIDO_EXATO'
  )
  assert.equal(
    resultadosPorGrupo[grupoVisaCd.chave_grupo].origem_conferencia,
    'MANUAL_POR_GRUPO'
  )

  // STONE VISA DB preservou sua conferência manual divergente ('489,90') -> DIVERGENTE_BLOQUEADA
  assert.equal(
    resultadosPorGrupo[grupoVisaDb.chave_grupo].estado_grupo,
    'DIVERGENTE_BLOQUEADA'
  )

  // Bloqueio obrigatório quando Bandeira ou Modalidade/Produto não estão selecionados individualmente ("TODAS" / "TODOS")
  const previaSemGrupoIndividual = prepararEValidarLancamentosEtapa1FA({
    empresaId: EMPRESA_LOJA_ATIVA_ID,
    empresaNome: EMPRESA_LOJA_ATIVA_NOME,
    filtros: {
      data_vencimento_original: '04/11/2026',
      bandeira: 'TODAS',
      produto: 'TODOS',
    },
    totais: TOTAIS_STONE_VALIDOS,
    conferencia: resultadosPorGrupo[grupoMastCd.chave_grupo],
    contaFinanceiraSelecionada: CONTA_FINANCEIRA_LOJA,
    categoriaReceitaSelecionada: CATEGORIA_RECEITA_VENDAS,
    categoriaDespesaMdrSelecionada: CATEGORIA_DESPESA_MDR,
  })

  assert.equal(previaSemGrupoIndividual.pronto_para_etapa_1fb, false)
  assert.equal(
    previaSemGrupoIndividual.bloqueios.some(
      (b) => b.codigo === 'GRUPO_BANDEIRA_MODALIDADE_OBRIGATORIO'
    ),
    true
  )
})

