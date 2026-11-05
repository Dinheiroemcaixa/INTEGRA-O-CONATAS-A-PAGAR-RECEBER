import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
import type {
  AvaliacaoPeriodoContaAzulStoneDTO,
  CategoriaFinanceiraReceberDTO,
  ContaFinanceiraReceberDTO,
  RequisicaoTransmissao1FBDTO,
  TotaisFiltradosStone,
} from '@/types/contas-receber'

const loaderCode = `
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const targetPath = path.resolve(process.cwd(), 'src', specifier.slice(2) + '.ts');
    if (fs.existsSync(targetPath)) {
      return nextResolve(pathToFileURL(targetPath).href, context);
    }
    const targetPathTsx = path.resolve(process.cwd(), 'src', specifier.slice(2) + '.tsx');
    if (fs.existsSync(targetPathTsx)) {
      return nextResolve(pathToFileURL(targetPathTsx).href, context);
    }
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !path.extname(specifier) && context.parentURL) {
    const parentDir = path.dirname(fileURLToPath(context.parentURL));
    const candidateTs = path.resolve(parentDir, specifier + '.ts');
    if (fs.existsSync(candidateTs)) {
      return nextResolve(pathToFileURL(candidateTs).href, context);
    }
    const candidateTsx = path.resolve(parentDir, specifier + '.tsx');
    if (fs.existsSync(candidateTsx)) {
      return nextResolve(pathToFileURL(candidateTsx).href, context);
    }
  }
  return nextResolve(specifier, context);
}
`
register(
  `data:text/javascript,${encodeURIComponent(loaderCode)}`,
  pathToFileURL('./')
)

const { conferirValorLiquidoComExtratoBancario } = await import(
  '@/lib/contas-receber/stone-csv-parser'
)
const { validarAutorizacaoContasReceber } = await import(
  '@/lib/contas-receber/auth-receber'
)
const {
  criarRepositorioIdempotenciaSupabase1FB,
  executarTransmissaoControladaEtapa1FB,
  extrairIdentificadoresRespostaContaAzul,
  sanitizarMensagemErroSegura,
  validarConfirmacaoExplicitaUsuario1FB,
  verificarTransmissaoReal1FBHabilitada,
} = await import('@/lib/contas-receber/transmissor-conta-azul-1fb')

const LOJA_A_ID = '53f1d9e2-e42a-4036-9188-f5e39879e0a4'
const LOJA_A_NOME = 'DCX BARREIRO'

const LOJA_B_ID = '99b8c7d6-e5f4-4012-8345-a1b2c3d4e5f6'
const LOJA_B_NOME = 'DCX BETIM'

const CONTA_FINANCEIRA_LOJA_A: ContaFinanceiraReceberDTO = {
  id: 'cf-stone-barreiro-001',
  descricao: 'CONTA CORRENTE ITAÚ - BARREIRO',
  tipo: 'CONTA_CORRENTE',
  banco: 'ITAU',
}

const CONTA_FINANCEIRA_LOJA_B: ContaFinanceiraReceberDTO = {
  id: 'cf-stone-betim-002',
  descricao: 'CONTA CORRENTE ITAÚ - BETIM',
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
  valor_bruto_micro: 1_254_000_000,
  desconto_mdr_micro: 31_500_000,
  desconto_antecipacao_micro: 0,
  valor_liquido_micro: 1_222_500_000,
  valor_bruto_centavos: 125_400, // R$ 1.254,00
  desconto_mdr_centavos: 3_150, // R$ 31,50
  desconto_antecipacao_centavos: 0,
  valor_liquido_centavos: 122_250, // R$ 1.222,50
  desconto_mdr_ajustado_centavos: 3_150,
  diferenca_arredondamento_centavos: 0,
  total_ajustes_nao_operacionais_micro: 0,
  total_ajustes_nao_operacionais_centavos: 0,
}

const AVALIACAO_CA_VAZIA: AvaliacaoPeriodoContaAzulStoneDTO = {
  periodo_consultado: { data_de: '2026-04-01', data_ate: '2026-04-01' },
  total_receitas_no_periodo: 0,
  total_despesas_no_periodo: 0,
  triagem_receita_bruta: {
    classificacao: 'NAO_LOCALIZADO_NO_PERIODO',
    autoriza_vinculo_automatico: false,
    ja_quitado: false,
    candidatos: [],
    mensagem: 'Nenhuma receita localizada no período.',
  },
  triagem_despesa_mdr: {
    classificacao: 'NAO_LOCALIZADO_NO_PERIODO',
    autoriza_vinculo_automatico: false,
    ja_quitado: false,
    candidatos: [],
    mensagem: 'Nenhuma despesa localizada no período.',
  },
  triagem_deposito_liquido: {
    classificacao: 'NAO_LOCALIZADO_NO_PERIODO',
    autoriza_vinculo_automatico: false,
    ja_quitado: false,
    candidatos: [],
    mensagem: 'Nenhum depósito líquido localizado no período.',
  },
}

function criarRequisicaoValida1FB(
  empresaId: string = LOJA_A_ID,
  empresaNome: string = LOJA_A_NOME,
  conta: ContaFinanceiraReceberDTO = CONTA_FINANCEIRA_LOJA_A
): RequisicaoTransmissao1FBDTO {
  const conferencia = conferirValorLiquidoComExtratoBancario(
    TOTAIS_STONE_VALIDOS,
    '1.222,50'
  )

  return {
    empresa_id: empresaId,
    empresa_nome: empresaNome,
    filtros: {
      data_vencimento_original: '01/04/2026',
      bandeira: 'Visa',
      produto: 'Credito',
    },
    totais: TOTAIS_STONE_VALIDOS,
    conferencia,
    conta_financeira_selecionada: conta,
    categoria_receita_selecionada: CATEGORIA_RECEITA_VENDAS,
    categoria_despesa_mdr_selecionada: CATEGORIA_DESPESA_MDR,
    identificadores_deterministicos: ['STONE-1FB-001'],
    confirmacao_explicita: {
      confirmado_pelo_usuario: true,
      confirmado_em_iso: '2026-04-02T15:00:00.000Z',
      loja_id: empresaId,
      loja_nome: empresaNome,
      conta_financeira_id: conta.id,
      conta_financeira_nome: conta.descricao,
      categoria_receita_id: CATEGORIA_RECEITA_VENDAS.id,
      categoria_receita_nome: CATEGORIA_RECEITA_VENDAS.nome,
      categoria_despesa_mdr_id: CATEGORIA_DESPESA_MDR.id,
      categoria_despesa_mdr_nome: CATEGORIA_DESPESA_MDR.nome,
      valor_receita_bruta_centavos: TOTAIS_STONE_VALIDOS.valor_bruto_centavos,
      valor_despesa_mdr_centavos:
        TOTAIS_STONE_VALIDOS.desconto_mdr_ajustado_centavos,
      valor_liquido_centavos: TOTAIS_STONE_VALIDOS.valor_liquido_centavos,
      data_lancamentos_iso: '2026-04-01',
      status_conferencia_bancaria: 'CONFERIDO_EXATO',
    },
  }
}

/**
 * Cria um cliente Supabase Admin simulado em memória que reproduz fielmente a tabela `logs_integracao`,
 * incluindo os índices UNIQUE parciais da Migration 051 e suporte a injeção de erros de persistência.
 */
function criarSupabaseAdminMock() {
  let seqId = 1
  const rows: Array<{
    id: string
    empresa_id: string
    acao: string
    status: string
    detalhes: Record<string, any>
    created_at: string
  }> = []

  let simularErroInsertLancamentoFinal = false

  const aplicarFiltros = (
    lista: typeof rows,
    filtros: Array<(r: (typeof rows)[0]) => boolean>
  ) => lista.filter((r) => filtros.every((fn) => fn(r)))

  const supabaseAdmin = {
    from(tabela: string) {
      assert.equal(tabela, 'logs_integracao')
      const filtros: Array<(r: (typeof rows)[0]) => boolean> = []
      let modoOperacao: 'select' | 'insert' | 'update' = 'select'
      let payloadInsert: any = null
      let payloadUpdate: any = null

      const builder: any = {
        select(_cols?: string) {
          if (modoOperacao === 'insert') {
            return {
              async single() {
                const res = await executarInsert()
                return res
              },
            }
          }
          modoOperacao = 'select'
          return builder
        },
        insert(valores: any) {
          modoOperacao = 'insert'
          payloadInsert = valores
          return builder
        },
        update(valores: any) {
          modoOperacao = 'update'
          payloadUpdate = valores
          return builder
        },
        eq(coluna: string, valor: any) {
          if (coluna.startsWith('detalhes->>')) {
            const prop = coluna.replace('detalhes->>', '')
            filtros.push((r) => String(r.detalhes?.[prop] || '') === String(valor))
          } else {
            filtros.push((r) => String((r as any)[coluna] || '') === String(valor))
          }
          return builder
        },
        in(coluna: string, valores: any[]) {
          const set = new Set(valores.map(String))
          if (coluna.startsWith('detalhes->>')) {
            const prop = coluna.replace('detalhes->>', '')
            filtros.push((r) => set.has(String(r.detalhes?.[prop] || '')))
          } else {
            filtros.push((r) => set.has(String((r as any)[coluna] || '')))
          }
          return builder
        },
        order(_coluna: string, _opts?: { ascending?: boolean }) {
          return builder
        },
        then(resolve: any, reject: any) {
          executar().then(resolve, reject)
        },
      }

      async function executarInsert() {
        const item = Array.isArray(payloadInsert)
          ? payloadInsert[0]
          : payloadInsert

        if (
          simularErroInsertLancamentoFinal &&
          item.acao === 'contas_receber_1fb_lancamento' &&
          item.detalhes?.etapa !== 'intencao_pre_post_1fb'
        ) {
          return {
            data: null,
            error: {
              message:
                'Simulated Supabase DB error on final result insert (connection lost)',
            },
          }
        }

        // Verifica UNIQUE index parcial de lock ativo (Migration 051)
        if (
          item.acao === 'contas_receber_1fb_lock_lote' &&
          item.status === 'info'
        ) {
          const chaveLote = String(item.detalhes?.chave_lote || '')
          const conflitoLock = rows.find(
            (r) =>
              r.empresa_id === item.empresa_id &&
              r.acao === 'contas_receber_1fb_lock_lote' &&
              r.status === 'info' &&
              String(r.detalhes?.chave_lote || '') === chaveLote &&
              String(r.detalhes?.estado_lock || '') === 'ATIVO'
          )
          if (conflitoLock) {
            return {
              data: null,
              error: {
                code: '23505',
                message:
                  'duplicate key value violates unique constraint "uq_logs_integracao_receber_1fb_lock_ativo"',
              },
            }
          }
        }

        const novaRow = {
          id: `log-uuid-${seqId++}`,
          empresa_id: item.empresa_id,
          acao: item.acao,
          status: item.status,
          detalhes: { ...(item.detalhes || {}) },
          created_at: new Date().toISOString(),
        }
        rows.push(novaRow)
        return { data: novaRow, error: null }
      }

      async function executar() {
        if (modoOperacao === 'insert') {
          return executarInsert()
        }
        if (modoOperacao === 'update') {
          if (
            simularErroInsertLancamentoFinal &&
            payloadUpdate?.detalhes?.etapa === 'transmissao_1fb'
          ) {
            return {
              data: null,
              error: {
                message:
                  'Simulated Supabase DB error on final result update (connection lost)',
              },
            }
          }

          const alvos = aplicarFiltros(rows, filtros)
          for (const r of alvos) {
            if (payloadUpdate.status !== undefined) {
              r.status = payloadUpdate.status
            }
            if (payloadUpdate.detalhes !== undefined) {
              r.detalhes = { ...payloadUpdate.detalhes }
            }
          }
          return { data: alvos, error: null }
        }
        const encontrados = aplicarFiltros(rows, filtros)
        return { data: encontrados, error: null }
      }

      return builder
    },
  }

  return {
    supabaseAdmin,
    rows,
    setSimularErroPersistenciaFinal(val: boolean) {
      simularErroInsertLancamentoFinal = val
    },
  }
}

// ============================================================================
// 1. REQUISIÇÃO SEM SESSÃO: HTTP 401
// ============================================================================
test('1. Autenticação: Requisição sem sessão autenticada retorna HTTP 401', async () => {
  const res = await validarAutorizacaoContasReceber(
    { empresaId: LOJA_A_ID },
    {
      obterUsuarioAutenticado: async () => null,
    }
  )

  assert.equal(res.autorizado, false)
  assert.equal(res.statusHttp, 401)
  assert.equal(res.codigoErro, 'NAO_AUTENTICADO')
})

// ============================================================================
// 2. USUÁRIO SEM PERMISSÃO OU PENDENTE: HTTP 403
// ============================================================================
test('2. Autorização: Usuário sem permissão contas_receber ou com perfil PENDENTE retorna HTTP 403', async () => {
  // 2A. Usuário aprovado mas com contas_receber: false
  const resSemPermissao = await validarAutorizacaoContasReceber(
    { empresaId: LOJA_A_ID },
    {
      obterUsuarioAutenticado: async () => ({
        id: 'user-fin-001',
        email: 'operador@dcx.com.br',
      }),
      buscarPerfilUsuario: async () => ({
        user_id: 'user-fin-001',
        email: 'operador@dcx.com.br',
        is_master: false,
        status: 'APROVADO',
        permissoes: {
          dashboard: true,
          contas_pagar: true,
          contas_receber: false,
        },
      }),
    }
  )

  assert.equal(resSemPermissao.autorizado, false)
  assert.equal(resSemPermissao.statusHttp, 403)
  assert.equal(resSemPermissao.codigoErro, 'SEM_PERMISSAO_CONTAS_RECEBER')

  // 2B. Usuário com status PENDENTE na Central Mestre
  const resPendente = await validarAutorizacaoContasReceber(
    { empresaId: LOJA_A_ID },
    {
      obterUsuarioAutenticado: async () => ({
        id: 'user-novo-002',
        email: 'novo@dcx.com.br',
      }),
      buscarPerfilUsuario: async () => ({
        user_id: 'user-novo-002',
        email: 'novo@dcx.com.br',
        is_master: false,
        status: 'PENDENTE',
        permissoes: { contas_receber: true },
      }),
    }
  )

  assert.equal(resPendente.autorizado, false)
  assert.equal(resPendente.statusHttp, 403)
  assert.equal(resPendente.codigoErro, 'PERFIL_NAO_APROVADO')
})

// ============================================================================
// 3. USUÁRIO TENTANDO ACESSAR EMPRESA NÃO AUTORIZADA: BLOQUEIO (HTTP 403)
// ============================================================================
test('3. Autorização Multi-Tenant: Usuário aprovado tentando acessar empresa/loja não vinculada é bloqueado com HTTP 403', async () => {
  const resEmpresaAlheia = await validarAutorizacaoContasReceber(
    { empresaId: LOJA_B_ID },
    {
      obterUsuarioAutenticado: async () => ({
        id: 'user-loja-a-only',
        email: 'barreiro@dcx.com.br',
      }),
      buscarPerfilUsuario: async () => ({
        user_id: 'user-loja-a-only',
        email: 'barreiro@dcx.com.br',
        is_master: false,
        status: 'APROVADO',
        permissoes: { contas_receber: true },
      }),
      verificarAcessoEmpresaUsuario: async ({ empresaId }) => ({
        acessoPermitido: empresaId === LOJA_A_ID,
        empresa:
          empresaId === LOJA_B_ID
            ? {
                id: LOJA_B_ID,
                nome: LOJA_B_NOME,
                cnpj: '11222333000199',
                conta_azul_connected: true,
              }
            : null,
      }),
    }
  )

  assert.equal(resEmpresaAlheia.autorizado, false)
  assert.equal(resEmpresaAlheia.statusHttp, 403)
  assert.equal(resEmpresaAlheia.codigoErro, 'EMPRESA_NAO_AUTORIZADA')

  // Também bloqueia se o navegador adulterar o nome/ID da loja em relação à empresaAutorizadaServidor
  const reqAdulterada = criarRequisicaoValida1FB(LOJA_A_ID, 'NOME ADULTERADO')
  const checkConf = validarConfirmacaoExplicitaUsuario1FB(reqAdulterada, {
    id: LOJA_A_ID,
    nome: LOJA_A_NOME,
  })
  assert.equal(checkConf.valido, false)
})

// ============================================================================
// 4. DUAS REQUISIÇÕES SIMULTÂNEAS PARA O MESMO LOTE: SOMENTE UMA ADQUIRE O PROCESSAMENTO
// ============================================================================
test('4. Concorrência: Duas requisições simultâneas para o mesmo lote — somente uma adquire o lock e transmite (zero duplicação)', async () => {
  const { supabaseAdmin } = criarSupabaseAdminMock()
  const repo = criarRepositorioIdempotenciaSupabase1FB(supabaseAdmin)

  let chamadasPostReceita = 0
  let chamadasPostDespesa = 0

  const criarDepsConcorrentes = () => ({
    repositorioIdempotencia: repo,
    transmissaoRealHabilitadaOverride: true,
    empresaAutorizadaServidor: { id: LOJA_A_ID, nome: LOJA_A_NOME },
    obterTokenValido: async () => ({ accessToken: 'token-loja-a' }),
    listarContasFinanceirasCA: async () => [CONTA_FINANCEIRA_LOJA_A],
    listarCategoriasCA: async () => ({
      categorias_receita: [CATEGORIA_RECEITA_VENDAS],
      categorias_despesa: [CATEGORIA_DESPESA_MDR],
    }),
    consultarAvaliacaoPeriodoCA: async () => {
      // Simula latência de rede para garantir sobreposição real das duas execuções concorrentes
      await new Promise((r) => setTimeout(r, 40))
      return AVALIACAO_CA_VAZIA
    },
    resolverClienteReceitaStone: async () => 'cli-stone-001',
    resolverFornecedorDespesaStone: async () => 'forn-stone-001',
    transmitirReceitaBrutaCA: async () => {
      chamadasPostReceita += 1
      await new Promise((r) => setTimeout(r, 30))
      return {
        id: '11111111-2222-3333-4444-555555555555',
        condicao_pagamento: {
          parcelas: [{ id: '11111111-2222-3333-4444-555555555555' }],
        },
      }
    },
    transmitirDespesaMdrCA: async () => {
      chamadasPostDespesa += 1
      await new Promise((r) => setTimeout(r, 30))
      return {
        id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        condicao_pagamento: {
          parcelas: [{ id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }],
        },
      }
    },
  })

  const [resA, resB] = await Promise.all([
    executarTransmissaoControladaEtapa1FB(
      criarRequisicaoValida1FB(),
      criarDepsConcorrentes()
    ),
    executarTransmissaoControladaEtapa1FB(
      criarRequisicaoValida1FB(),
      criarDepsConcorrentes()
    ),
  ])

  const situacoes = [resA.situacao, resB.situacao].sort()
  assert.deepEqual(situacoes, [
    'BLOQUEADO_CONCORRENCIA_LOTE_EM_ANDAMENTO',
    'SUCESSO_COMPLETO',
  ])
  assert.equal(chamadasPostReceita, 1)
  assert.equal(chamadasPostDespesa, 1)
})

// ============================================================================
// 5. EMPRESAS E LOJAS DIFERENTES: ISOLAMENTO CORRETO
// ============================================================================
test('5. Isolamento Multiempresa: Lotes de mesma data e valor em lojas diferentes são processados de forma 100% isolada', async () => {
  const { supabaseAdmin } = criarSupabaseAdminMock()
  const repo = criarRepositorioIdempotenciaSupabase1FB(supabaseAdmin)

  const tokensUsados: string[] = []

  // Processa Loja A (DCX BARREIRO)
  const resLojaA = await executarTransmissaoControladaEtapa1FB(
    criarRequisicaoValida1FB(LOJA_A_ID, LOJA_A_NOME, CONTA_FINANCEIRA_LOJA_A),
    {
      repositorioIdempotencia: repo,
      transmissaoRealHabilitadaOverride: true,
      empresaAutorizadaServidor: { id: LOJA_A_ID, nome: LOJA_A_NOME },
      obterTokenValido: async (empId) => {
        assert.equal(empId, LOJA_A_ID)
        tokensUsados.push(`token-${empId}`)
        return { accessToken: `token-${empId}` }
      },
      listarContasFinanceirasCA: async () => [CONTA_FINANCEIRA_LOJA_A],
      listarCategoriasCA: async () => ({
        categorias_receita: [CATEGORIA_RECEITA_VENDAS],
        categorias_despesa: [CATEGORIA_DESPESA_MDR],
      }),
      consultarAvaliacaoPeriodoCA: async () => AVALIACAO_CA_VAZIA,
      resolverClienteReceitaStone: async () => 'cli-loja-a',
      resolverFornecedorDespesaStone: async () => 'forn-loja-a',
      transmitirReceitaBrutaCA: async () => ({
        id: '11111111-1111-4111-8111-111111111111',
      }),
      transmitirDespesaMdrCA: async () => ({
        id: '22222222-2222-4222-8222-222222222222',
      }),
    }
  )

  // Processa Loja B (DCX BETIM) com mesmos valores e mesma data
  const resLojaB = await executarTransmissaoControladaEtapa1FB(
    criarRequisicaoValida1FB(LOJA_B_ID, LOJA_B_NOME, CONTA_FINANCEIRA_LOJA_B),
    {
      repositorioIdempotencia: repo,
      transmissaoRealHabilitadaOverride: true,
      empresaAutorizadaServidor: { id: LOJA_B_ID, nome: LOJA_B_NOME },
      obterTokenValido: async (empId) => {
        assert.equal(empId, LOJA_B_ID)
        tokensUsados.push(`token-${empId}`)
        return { accessToken: `token-${empId}` }
      },
      listarContasFinanceirasCA: async () => [CONTA_FINANCEIRA_LOJA_B],
      listarCategoriasCA: async () => ({
        categorias_receita: [CATEGORIA_RECEITA_VENDAS],
        categorias_despesa: [CATEGORIA_DESPESA_MDR],
      }),
      consultarAvaliacaoPeriodoCA: async () => AVALIACAO_CA_VAZIA,
      resolverClienteReceitaStone: async () => 'cli-loja-b',
      resolverFornecedorDespesaStone: async () => 'forn-loja-b',
      transmitirReceitaBrutaCA: async () => ({
        id: '33333333-3333-4333-8333-333333333333',
      }),
      transmitirDespesaMdrCA: async () => ({
        id: '44444444-4444-4444-8444-444444444444',
      }),
    }
  )

  assert.equal(resLojaA.situacao, 'SUCESSO_COMPLETO')
  assert.equal(resLojaB.situacao, 'SUCESSO_COMPLETO')
  assert.notEqual(resLojaA.chave_lote, resLojaB.chave_lote)
  assert.deepEqual(tokensUsados, [`token-${LOJA_A_ID}`, `token-${LOJA_B_ID}`])
})

// ============================================================================
// 6. CONTA FINANCEIRA OU CATEGORIA ADULTERADA PELO NAVEGADOR: BLOQUEIO
// ============================================================================
test('6. Validação Autoritativa: Bloqueia quando conta financeira ou categoria enviada pelo navegador não pertence à Conta Azul da loja ativa', async () => {
  const { supabaseAdmin } = criarSupabaseAdminMock()
  const repo = criarRepositorioIdempotenciaSupabase1FB(supabaseAdmin)
  let chamadasPost = 0

  // O navegador envia CONTA_FINANCEIRA_LOJA_A, mas a API da Conta Azul da loja retorna apenas CONTA_FINANCEIRA_LOJA_B
  // e uma categoria cujo ID "cat-rec-vendas-001" na verdade se chama "Outras Receitas" na Conta Azul
  const resAdulterado = await executarTransmissaoControladaEtapa1FB(
    criarRequisicaoValida1FB(LOJA_A_ID, LOJA_A_NOME, CONTA_FINANCEIRA_LOJA_A),
    {
      repositorioIdempotencia: repo,
      transmissaoRealHabilitadaOverride: true,
      empresaAutorizadaServidor: { id: LOJA_A_ID, nome: LOJA_A_NOME },
      obterTokenValido: async () => ({ accessToken: 'token-loja-a' }),
      listarContasFinanceirasCA: async () => [CONTA_FINANCEIRA_LOJA_B],
      listarCategoriasCA: async () => ({
        categorias_receita: [
          {
            id: CATEGORIA_RECEITA_VENDAS.id,
            nome: 'Outras Receitas Diversas', // Nome real diferente do rotulado pelo navegador
            tipo: 'RECEITA',
          },
        ],
        categorias_despesa: [CATEGORIA_DESPESA_MDR],
      }),
      transmitirReceitaBrutaCA: async () => {
        chamadasPost += 1
        return { id: '11111111-2222-3333-4444-555555555555' }
      },
    }
  )

  assert.equal(resAdulterado.situacao, 'BLOQUEADO_VALIDACAO_PRE_VOO')
  assert.equal(resAdulterado.bloqueado, true)
  assert.equal(resAdulterado.sucesso, false)
  assert.equal(chamadasPost, 0)
  assert.equal(
    (resAdulterado.bloqueios_pre_voo?.length || 0) >= 2,
    true
  )
})

// ============================================================================
// 7. RECEITA BRUTA JÁ CRIADA PELO PRÓPRIO LOTE: REPROCESSAMENTO DA DESPESA MDR PERMITIDO SEM DUPLICAR RECEITA
// ============================================================================
test('7. Reprocessamento Parcial Realista: Receita Bruta já criada pelo próprio lote (e presente na consulta de período da Conta Azul) não bloqueia o envio da Despesa MDR pendente e não duplica a Receita', async () => {
  const { supabaseAdmin } = criarSupabaseAdminMock()
  const repo = criarRepositorioIdempotenciaSupabase1FB(supabaseAdmin)

  let chamadasPostReceita = 0
  let chamadasPostDespesa = 0
  let simularFalhaDespesa = true

  const uuidParcelaReceita = '22222222-3333-4444-5555-666666666666'
  const uuidParcelaDespesa = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff'

  const depsParcialRealista = {
    repositorioIdempotencia: repo,
    transmissaoRealHabilitadaOverride: true,
    empresaAutorizadaServidor: { id: LOJA_A_ID, nome: LOJA_A_NOME },
    obterTokenValido: async () => ({ accessToken: 'token-loja-a' }),
    listarContasFinanceirasCA: async () => [CONTA_FINANCEIRA_LOJA_A],
    listarCategoriasCA: async () => ({
      categorias_receita: [CATEGORIA_RECEITA_VENDAS],
      categorias_despesa: [CATEGORIA_DESPESA_MDR],
    }),
    consultarAvaliacaoPeriodoCA: async (): Promise<AvaliacaoPeriodoContaAzulStoneDTO> => {
      // Na 2ª tentativa (após a Receita Bruta ter sido criada na 1ª tentativa),
      // a Conta Azul passa a retornar CORRESPONDENCIA_DETERMINISTICA para a Receita Bruta!
      if (chamadasPostReceita >= 1) {
        return {
          ...AVALIACAO_CA_VAZIA,
          total_receitas_no_periodo: 1,
          triagem_receita_bruta: {
            classificacao: 'CORRESPONDENCIA_DETERMINISTICA',
            autoriza_vinculo_automatico: true,
            ja_quitado: false,
            candidatos: [
              {
                id: uuidParcelaReceita,
                descricao: 'Receita Bruta Stone criada na 1ª tentativa',
                data_vencimento: '2026-04-01',
                status: 'EM_ABERTO',
                valor_total_centavos: 125_400,
                valor_pago_centavos: 0,
                valor_aberto_centavos: 125_400,
              },
            ],
            mensagem: 'Receita localizada na Conta Azul.',
          },
        }
      }
      return AVALIACAO_CA_VAZIA
    },
    resolverClienteReceitaStone: async () => 'cli-stone-001',
    resolverFornecedorDespesaStone: async () => 'forn-stone-001',
    transmitirReceitaBrutaCA: async () => {
      chamadasPostReceita += 1
      return {
        id: uuidParcelaReceita,
        condicao_pagamento: { parcelas: [{ id: uuidParcelaReceita }] },
      }
    },
    transmitirDespesaMdrCA: async () => {
      chamadasPostDespesa += 1
      if (simularFalhaDespesa) {
        throw new Error(
          'Erro Conta Azul Criar Despesa [400]: Falha temporária na 1ª tentativa'
        )
      }
      return {
        id: uuidParcelaDespesa,
        condicao_pagamento: { parcelas: [{ id: uuidParcelaDespesa }] },
      }
    },
  }

  // 1ª Tentativa: cria Receita Bruta e falha na Despesa MDR
  const tentativa1 = await executarTransmissaoControladaEtapa1FB(
    criarRequisicaoValida1FB(),
    depsParcialRealista
  )
  assert.equal(tentativa1.situacao, 'FALHA_PARCIAL_RETOMAVEL')
  assert.equal(chamadasPostReceita, 1)
  assert.equal(chamadasPostDespesa, 1)

  // 2ª Tentativa: mesmo a Receita aparecendo na busca da Conta Azul, reconhece que foi criada pelo próprio lote,
  // não bloqueia a Despesa MDR pendente e não reenvia a Receita Bruta!
  simularFalhaDespesa = false
  const tentativa2 = await executarTransmissaoControladaEtapa1FB(
    criarRequisicaoValida1FB(),
    depsParcialRealista
  )

  assert.equal(tentativa2.situacao, 'SUCESSO_COMPLETO')
  assert.equal(tentativa2.sucesso, true)
  assert.equal(chamadasPostReceita, 1) // NÃO duplicou a Receita Bruta
  assert.equal(chamadasPostDespesa, 2) // Enviou apenas a Despesa MDR pendente
  assert.equal(
    tentativa2.receita_bruta?.status,
    'JA_TRANSMITIDO_ANTERIORMENTE'
  )
  assert.equal(tentativa2.despesa_mdr?.status, 'TRANSMITIDO_COM_SUCESSO')
})

// ============================================================================
// 8. FALHA DE PERSISTÊNCIA NO SUPABASE: OPERAÇÃO NÃO DECLARADA COMO CONCLUÍDA
// ============================================================================
test('8. Persistência e Falhas: Se falhar a gravação do resultado no Supabase após o POST externo, a operação NÃO é declarada concluída e exige reconciliação preservando o UUID', async () => {
  const { supabaseAdmin, setSimularErroPersistenciaFinal } =
    criarSupabaseAdminMock()
  const repo = criarRepositorioIdempotenciaSupabase1FB(supabaseAdmin)

  setSimularErroPersistenciaFinal(true)

  const uuidGeradoCA = '77777777-8888-4999-8aaa-bbbbbbbbbbbb'

  const resFalhaBanco = await executarTransmissaoControladaEtapa1FB(
    criarRequisicaoValida1FB(),
    {
      repositorioIdempotencia: repo,
      transmissaoRealHabilitadaOverride: true,
      empresaAutorizadaServidor: { id: LOJA_A_ID, nome: LOJA_A_NOME },
      obterTokenValido: async () => ({ accessToken: 'token-loja-a' }),
      listarContasFinanceirasCA: async () => [CONTA_FINANCEIRA_LOJA_A],
      listarCategoriasCA: async () => ({
        categorias_receita: [CATEGORIA_RECEITA_VENDAS],
        categorias_despesa: [CATEGORIA_DESPESA_MDR],
      }),
      consultarAvaliacaoPeriodoCA: async () => AVALIACAO_CA_VAZIA,
      resolverClienteReceitaStone: async () => 'cli-stone-001',
      transmitirReceitaBrutaCA: async () => ({
        id: uuidGeradoCA,
        condicao_pagamento: { parcelas: [{ id: uuidGeradoCA }] },
      }),
    }
  )

  assert.equal(resFalhaBanco.sucesso, false)
  assert.equal(resFalhaBanco.situacao, 'RECONCILIACAO_NECESSARIA_BLOQUEADO')
  assert.equal(resFalhaBanco.reconciliacao_necessaria, true)
  assert.equal(resFalhaBanco.bloqueado, true)
  assert.equal(
    resFalhaBanco.receita_bruta?.status,
    'RECONCILIACAO_NECESSARIA'
  )
  // Preserva o UUID retornado pela Conta Azul para auditoria/reconciliação do operador
  assert.equal(
    resFalhaBanco.receita_bruta?.conta_azul_parcela_id,
    uuidGeradoCA
  )
})

// ============================================================================
// 9. TIMEOUT E NECESSIDADE DE RECONCILIAÇÃO: NENHUM REENVIO AUTOMÁTICO
// ============================================================================
test('9. Timeout e Reconciliação: Timeout ou resposta sem UUID ativa RECONCILIACAO_NECESSARIA_BLOQUEADO, sanitiza tokens e impede reenvio automático', async () => {
  assert.equal(extrairIdentificadoresRespostaContaAzul({}).valido, false)
  assert.equal(
    extrairIdentificadoresRespostaContaAzul({ id: 'enviado' }).valido,
    false
  )

  const { supabaseAdmin } = criarSupabaseAdminMock()
  const repo = criarRepositorioIdempotenciaSupabase1FB(supabaseAdmin)
  let chamadasPostReceita = 0

  const depsTimeout = {
    repositorioIdempotencia: repo,
    transmissaoRealHabilitadaOverride: true,
    empresaAutorizadaServidor: { id: LOJA_A_ID, nome: LOJA_A_NOME },
    obterTokenValido: async () => ({ accessToken: 'token-secreto-xyz-987654' }),
    listarContasFinanceirasCA: async () => [CONTA_FINANCEIRA_LOJA_A],
    listarCategoriasCA: async () => ({
      categorias_receita: [CATEGORIA_RECEITA_VENDAS],
      categorias_despesa: [CATEGORIA_DESPESA_MDR],
    }),
    consultarAvaliacaoPeriodoCA: async () => AVALIACAO_CA_VAZIA,
    resolverClienteReceitaStone: async () => 'cli-stone-001',
    transmitirReceitaBrutaCA: async () => {
      chamadasPostReceita += 1
      throw new Error(
        'Timeout (15000ms) ao criar Conta a Receber na Conta Azul com Bearer token-secreto-xyz-987654'
      )
    },
  }

  const resTimeout = await executarTransmissaoControladaEtapa1FB(
    criarRequisicaoValida1FB(),
    depsTimeout
  )

  assert.equal(resTimeout.situacao, 'RECONCILIACAO_NECESSARIA_BLOQUEADO')
  assert.equal(resTimeout.reconciliacao_necessaria, true)
  assert.equal(resTimeout.bloqueado, true)
  assert.equal(resTimeout.receita_bruta?.status, 'RECONCILIACAO_NECESSARIA')
  assert.equal(
    resTimeout.mensagem.includes('token-secreto-xyz-987654'),
    false
  )
  assert.equal(
    sanitizarMensagemErroSegura('Erro com Bearer abcdef123456', [
      'abcdef123456',
    ]).includes('abcdef123456'),
    false
  )

  // Nova tentativa automática deve ser bloqueada sem disparar segundo POST
  const resReenvio = await executarTransmissaoControladaEtapa1FB(
    criarRequisicaoValida1FB(),
    depsTimeout
  )
  assert.equal(resReenvio.situacao, 'RECONCILIACAO_NECESSARIA_BLOQUEADO')
  assert.equal(chamadasPostReceita, 1)
})

// ============================================================================
// 10. TRAVA DE TRANSMISSÃO DESABILITADA: ZERO POST FINANCEIRO REAL
// ============================================================================
test('10. Trava de Transmissão: CONTA_AZUL_RECEBER_1FB_TRANSMISSAO_HABILITADA permanece desabilitada por padrão e garante zero POST financeiro real', async () => {
  assert.equal(verificarTransmissaoReal1FBHabilitada(), false)

  const { supabaseAdmin } = criarSupabaseAdminMock()
  const repo = criarRepositorioIdempotenciaSupabase1FB(supabaseAdmin)
  let chamadasPostReceita = 0
  let chamadasPostDespesa = 0

  const resultado = await executarTransmissaoControladaEtapa1FB(
    criarRequisicaoValida1FB(),
    {
      repositorioIdempotencia: repo,
      empresaAutorizadaServidor: { id: LOJA_A_ID, nome: LOJA_A_NOME },
      obterTokenValido: async () => ({ accessToken: 'token-mock-seguro-001' }),
      transmitirReceitaBrutaCA: async () => {
        chamadasPostReceita += 1
        return { id: '11111111-2222-3333-4444-555555555555' }
      },
      transmitirDespesaMdrCA: async () => {
        chamadasPostDespesa += 1
        return { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }
      },
    }
  )

  assert.equal(resultado.situacao, 'BLOQUEADO_TRAVA_SEGURANCA_ETAPA')
  assert.equal(resultado.transmissao_real_habilitada, false)
  assert.equal(resultado.sucesso, false)
  assert.equal(resultado.bloqueado, true)
  assert.equal(chamadasPostReceita, 0)
  assert.equal(chamadasPostDespesa, 0)
  assert.equal(resultado.receita_bruta?.status, 'BLOQUEADO_TRAVA_ETAPA')
  assert.equal(resultado.despesa_mdr?.status, 'BLOQUEADO_TRAVA_ETAPA')
})

// ============================================================================
// 11. SESSÃO BEARER, BLOQUEIO DE EMP-DEMO E MÚLTIPLAS LOJAS AUTORIZADAS
// ============================================================================
test('11. Contexto Conta Azul: rejeita emp-demo (400), valida Bearer token e permite alternância segura entre múltiplas lojas autorizadas', async () => {
  // 11A. Bloqueio de emp-demo antes de consultar empresa ou Conta Azul
  let consultouEmpresa = false
  const resDemo = await validarAutorizacaoContasReceber(
    { empresaId: 'emp-demo' },
    {
      obterUsuarioAutenticado: async () => ({
        id: 'user-multi-loja',
        email: 'operador.lojas@dcx.com.br',
      }),
      buscarPerfilUsuario: async () => ({
        user_id: 'user-multi-loja',
        email: 'operador.lojas@dcx.com.br',
        is_master: false,
        status: 'APROVADO',
        permissoes: {
          contas_receber: true,
        },
      }),
      verificarAcessoEmpresaUsuario: async () => {
        consultouEmpresa = true
        return { acessoPermitido: false, empresa: null }
      },
    }
  )

  assert.equal(resDemo.autorizado, false)
  assert.equal(resDemo.statusHttp, 400)
  assert.equal(resDemo.codigoErro, 'EMPRESA_OBRIGATORIA')
  assert.equal(consultouEmpresa, false)

  // 11B. Usuário autenticado via Bearer com acesso às Lojas A e B (e bloqueado em Loja C)
  const LOJA_C_ID = 'emp-loja-c-003'
  const depsMultiLoja = {
    obterUsuarioAutenticado: async () => ({
      id: 'user-multi-loja',
      email: 'operador.lojas@dcx.com.br',
    }),
    buscarPerfilUsuario: async () => ({
      user_id: 'user-multi-loja',
      email: 'operador.lojas@dcx.com.br',
      is_master: false,
      status: 'APROVADO',
      permissoes: {
        contas_receber: true,
      },
    }),
    verificarAcessoEmpresaUsuario: async ({ empresaId: empId }) => {
      if (empId === LOJA_A_ID) {
        return {
          acessoPermitido: true,
          empresa: {
            id: LOJA_A_ID,
            nome: LOJA_A_NOME,
            cnpj: '11.111.111/0001-11',
            conta_azul_connected: true,
            email_login: 'lojaa@nufast.com.br',
          },
        }
      }
      if (empId === LOJA_B_ID) {
        return {
          acessoPermitido: true,
          empresa: {
            id: LOJA_B_ID,
            nome: LOJA_B_NOME,
            cnpj: '22.222.222/0001-22',
            conta_azul_connected: true,
            email_login: 'lojab@nufast.com.br',
          },
        }
      }
      return {
        acessoPermitido: false,
        empresa: {
          id: LOJA_C_ID,
          nome: 'NUFAST LOJA C',
          cnpj: '33.333.333/0001-33',
          conta_azul_connected: true,
          email_login: 'lojac@nufast.com.br',
        },
      }
    },
  }

  const authLojaA = await validarAutorizacaoContasReceber(
    { empresaId: LOJA_A_ID },
    depsMultiLoja
  )
  assert.equal(authLojaA.autorizado, true)
  assert.equal(authLojaA.statusHttp, 200)
  assert.equal(authLojaA.empresaAutorizada?.id, LOJA_A_ID)

  const authLojaB = await validarAutorizacaoContasReceber(
    { empresaId: LOJA_B_ID },
    depsMultiLoja
  )
  assert.equal(authLojaB.autorizado, true)
  assert.equal(authLojaB.statusHttp, 200)
  assert.equal(authLojaB.empresaAutorizada?.id, LOJA_B_ID)

  const authLojaC = await validarAutorizacaoContasReceber(
    { empresaId: LOJA_C_ID },
    depsMultiLoja
  )
  assert.equal(authLojaC.autorizado, false)
  assert.equal(authLojaC.statusHttp, 403)
  assert.equal(authLojaC.codigoErro, 'EMPRESA_NAO_AUTORIZADA')
})

