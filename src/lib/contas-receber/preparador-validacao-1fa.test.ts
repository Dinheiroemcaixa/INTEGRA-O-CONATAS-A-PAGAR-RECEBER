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

const { conferirValorLiquidoComExtratoBancario } = await import(
  '@/lib/contas-receber/stone-csv-parser'
)
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
