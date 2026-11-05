/**
 * DCX LINK — MÓDULO CONTAS A RECEBER (ETAPA 1F-B ENDURECIDA)
 * Motor Isolado de Transmissão Controlada de Receita Bruta e Despesa MDR para a Conta Azul.
 *
 * REGRAS DE SEGURANÇA E PROTEÇÃO OBRIGATÓRIAS:
 * 1. Preserva integralmente as Etapas 1A–1F-A, Contas a Pagar, Gestão de Pagamentos e Vendas.
 * 2. Reutiliza getValidToken(empresaId, 'financeiro') sem modificar token-manager.ts ou OAuth.
 * 3. Exige confirmação explícita do usuário contendo loja, conta financeira, categorias, valores, data e CONFERIDO_EXATO.
 * 4. Implementa trava de segurança de etapa: mantém qualquer envio real bloqueado por padrão
 *    (CONTA_AZUL_RECEBER_1FB_TRANSMISSAO_HABILITADA !== 'true') até autorização expressa do usuário.
 * 5. Controle atômico e persistente de concorrência no Supabase (`logs_integracao`):
 *    - Registra intenção de processamento (`adquirirLockProcessamentoLote`) antes de qualquer POST externo.
 *    - Impede que duas requisições simultâneas (mesmo entre diferentes instâncias da Vercel) processem o mesmo lote.
 *    - Possui expiração e recuperação segura de locks abandonados (verificando se houve item criado antes de liberar).
 * 6. Validação autoritativa no servidor:
 *    - Reconsulta contas financeiras e categorias reais na Conta Azul com o token da loja autorizada,
 *      bloqueando qualquer tentativa de adulteração de IDs ou nomes pelo navegador.
 * 7. Idempotência persistente por item (RECEITA_BRUTA e DESPESA_MDR separadamente) e reprocessamento parcial seguro:
 *    - Se a Receita Bruta já foi confirmada pelo próprio lote, não a reenvia e não a classifica como duplicidade externa,
 *      prosseguindo com a validação e transmissão independente da Despesa MDR pendente.
 * 8. Verificação estrita de erros do Supabase (zero `catch {}` vazio):
 *    - Se falhar a persistência do resultado após uma chamada externa, bloqueia reenvio e exige reconciliação manual.
 * 9. Nunca expõe tokens, credenciais ou segredos em respostas ou logs.
 */

import crypto from 'crypto'
import {
  buscarOuCriarCliente,
  buscarOuCriarContato,
  criarContaPagar,
} from '@/lib/conta-azul/api'
import type {
  AvaliacaoPeriodoContaAzulStoneDTO,
  CategoriaFinanceiraReceberDTO,
  ContaFinanceiraReceberDTO,
  MotivoBloqueioPreparacao1FA,
  PayloadEventoFinanceiroContaAzul1FADTO,
  RequisicaoTransmissao1FBDTO,
  RespostaTransmissao1FBDTO,
  ResultadoItemTransmissao1FBDTO,
} from '@/types/contas-receber'
import {
  consultarAvaliacaoPeriodoStoneSatelite,
  listarCategoriasReceitaEDespesaSatelite,
  listarContasFinanceirasSatelite,
  normalizarTextoComparacao,
} from './conta-azul-receber-satelite'
import type { RegistroOperacaoReceberExistente } from './import-dedup-receber'
import {
  ehCategoriaReceitasDeVendasValida,
  ehCategoriaTarifasCartaoMdrValida,
  prepararEValidarLancamentosEtapa1FA,
} from './preparador-validacao-1fa'
import { parseDataBrParaIso } from './stone-csv-parser'
import { formatarCentavosBRL } from './validador-financeiro'

const BASE_URL = 'https://api-v2.contaazul.com/v1'
const DEFAULT_TIMEOUT_MS = 15_000

export const ACAO_LOG_RECEBER_1FB = 'contas_receber_1fb_lancamento'
export const ACAO_LOCK_LOTE_RECEBER_1FB = 'contas_receber_1fb_lock_lote'
export const DEFAULT_LOCK_LOTE_TTL_MS = 90_000
export const NOME_CONTATO_PADRAO_STONE = 'STONE PAGAMENTOS S.A.'

export interface PayloadCriarContaReceberCA extends PayloadEventoFinanceiroContaAzul1FADTO {
  id_cliente?: string
  contato?: string
}

export interface RespostaEventoFinanceiroCA {
  id?: string
  protocolId?: string
  status?: string
  condicao_pagamento?: {
    parcelas?: Array<{
      id?: string
      status?: string
      [key: string]: unknown
    }>
  }
  [key: string]: unknown
}

export interface ResultadoLockLote1FB {
  adquirido: boolean
  lockId: string | null
  executionId: string
  motivoBloqueio?: string
  reconciliacaoNecessariaPorLockExpirado?: boolean
}

/**
 * Verifica se a transmissão financeira real da Etapa 1F-B está habilitada no ambiente.
 * Por padrão de segurança da Etapa 1F-B, permanece bloqueada (`false`) durante o desenvolvimento e testes.
 */
export function verificarTransmissaoReal1FBHabilitada(
  overrideExplicito?: boolean
): boolean {
  if (typeof overrideExplicito === 'boolean') {
    return overrideExplicito
  }
  return process.env.CONTA_AZUL_RECEBER_1FB_TRANSMISSAO_HABILITADA === 'true'
}

/**
 * Sanitiza mensagens de erro removendo qualquer possível token Bearer ou credencial sensível.
 */
export function sanitizarMensagemErroSegura(
  mensagem: string | unknown,
  segredos: Array<string | undefined> = []
): string {
  let texto =
    mensagem instanceof Error ? mensagem.message : String(mensagem ?? '')
  texto = texto.replace(
    /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
    'Bearer [REDACTED]'
  )
  for (const s of segredos) {
    if (s && s.length >= 6) {
      texto = texto.split(s).join('[REDACTED]')
    }
  }
  return texto
}

/**
 * Extrai com segurança o UUID do evento e o UUID da parcela retornados pela Conta Azul v2.
 * Nunca aceita strings literais como 'enviado' ou 'sucesso' como substitutos de UUID.
 */
export function extrairIdentificadoresRespostaContaAzul(
  resposta: RespostaEventoFinanceiroCA | null | undefined
): {
  valido: boolean
  eventoId: string | null
  parcelaId: string | null
  idPrincipal: string | null
} {
  if (!resposta || typeof resposta !== 'object') {
    return {
      valido: false,
      eventoId: null,
      parcelaId: null,
      idPrincipal: null,
    }
  }

  const parcelaRaw =
    typeof resposta.condicao_pagamento?.parcelas?.[0]?.id === 'string'
      ? resposta.condicao_pagamento.parcelas[0].id.trim()
      : ''

  const eventoRaw =
    typeof resposta.id === 'string' && resposta.id.trim()
      ? resposta.id.trim()
      : typeof resposta.protocolId === 'string' && resposta.protocolId.trim()
        ? resposta.protocolId.trim()
        : ''

  const regexUuidOuIdValido =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  const parcelaValida = regexUuidOuIdValido.test(parcelaRaw) ? parcelaRaw : null
  const eventoValido = regexUuidOuIdValido.test(eventoRaw) ? eventoRaw : null
  const idPrincipal = parcelaValida || eventoValido

  return {
    valido: Boolean(idPrincipal),
    eventoId: eventoValido,
    parcelaId: parcelaValida,
    idPrincipal,
  }
}

/**
 * Cria um evento financeiro de Conta a Receber na API v2 da Conta Azul.
 * Isolado neste módulo para não modificar `src/lib/conta-azul/api.ts`.
 */
export async function criarContaReceberSatelite(
  accessToken: string,
  dados: PayloadCriarContaReceberCA
): Promise<RespostaEventoFinanceiroCA> {
  const clienteId = dados.id_cliente || dados.contato
  if (!clienteId) {
    throw new Error(
      'Cliente (id_cliente / contato) é obrigatório para criar Conta a Receber na Conta Azul.'
    )
  }

  const body: Record<string, unknown> = {
    descricao: dados.descricao,
    data_competencia: dados.data_competencia,
    valor: dados.valor,
    observacao: dados.observacao,
    contato: clienteId,
    conta_financeira: dados.conta_financeira,
    rateio: dados.rateio,
    condicao_pagamento: dados.condicao_pagamento,
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)

  try {
    const res = await fetch(
      `${BASE_URL}/financeiro/eventos-financeiros/contas-a-receber`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      }
    )
    clearTimeout(timeoutId)

    if (res.status === 401) {
      throw new Error('TOKEN_EXPIRADO')
    }

    if (!res.ok) {
      const errBody = await res.text()
      throw new Error(
        `Erro Conta Azul Criar Receita [${res.status}]: ${errBody}`
      )
    }

    return (await res.json()) as RespostaEventoFinanceiroCA
  } catch (err) {
    clearTimeout(timeoutId)
    throw err
  }
}

/**
 * Interface de persistência de idempotência e controle atômico de concorrência no Supabase (`logs_integracao`).
 */
export interface RepositorioIdempotenciaReceber1FB {
  listarOperacoesPorChaves(
    empresaId: string,
    chaves: string[]
  ): Promise<RegistroOperacaoReceberExistente[]>

  registrarIntencaoItemAntesDoPost?(params: {
    empresaId: string
    chaveLote: string
    chaveIdempotencia: string
    papel: 'RECEITA_BRUTA' | 'DESPESA_MDR'
    valorCentavos: number
    executionId: string
  }): Promise<{ logId: string }>

  registrarResultadoItem(params: {
    empresaId: string
    chaveLote: string
    item: ResultadoItemTransmissao1FBDTO
    payloadEnviado: unknown
    respostaBrutaContaAzul?: unknown
    intencaoLogId?: string | null
  }): Promise<void>

  adquirirLockProcessamentoLote?(params: {
    empresaId: string
    chaveLote: string
    chavesItens: string[]
    ttlMs?: number
    nowMs?: number
  }): Promise<ResultadoLockLote1FB>

  liberarLockProcessamentoLote?(params: {
    empresaId: string
    chaveLote: string
    lockId: string | null
    executionId: string
    situacaoFinal: string
  }): Promise<void>
}

/**
 * Cria o adaptador de persistência e lock distribuído em `logs_integracao` usando um cliente Supabase Admin.
 * Verifica explicitamente o campo `error` em todas as chamadas ao Supabase.
 */
export function criarRepositorioIdempotenciaSupabase1FB(
  supabaseAdmin: any
): RepositorioIdempotenciaReceber1FB {
  return {
    async listarOperacoesPorChaves(
      empresaId: string,
      chaves: string[]
    ): Promise<RegistroOperacaoReceberExistente[]> {
      if (!empresaId || chaves.length === 0) return []

      let query = supabaseAdmin
        .from('logs_integracao')
        .select('id, status, detalhes, created_at')
        .eq('empresa_id', empresaId)
        .eq('acao', ACAO_LOG_RECEBER_1FB)

      if (typeof query.in === 'function') {
        query = query.in('detalhes->>chave_idempotencia', chaves)
      }
      if (typeof query.order === 'function') {
        query = query.order('created_at', { ascending: true })
      }

      const { data, error } = await query

      if (error) {
        throw new Error(
          `Falha ao consultar registros de idempotência no Supabase (logs_integracao): ${error.message}`
        )
      }

      if (!Array.isArray(data)) {
        return []
      }

      const chavesSet = new Set(chaves)
      const mapaPorChave = new Map<string, RegistroOperacaoReceberExistente>()

      for (const row of data) {
        const det =
          row.detalhes && typeof row.detalhes === 'object' ? row.detalhes : {}
        const chave = String(det.chave_idempotencia || '').trim()
        if (!chave || !chavesSet.has(chave)) continue

        const statusOpRaw = String(det.status_operacao || '')
        let statusOp: RegistroOperacaoReceberExistente['status']

        if (
          statusOpRaw === 'BAIXADO_COMPLETO' ||
          statusOpRaw === 'RECONCILIACAO_NECESSARIA' ||
          statusOpRaw === 'PENDENTE' ||
          statusOpRaw === 'ERRO'
        ) {
          statusOp = statusOpRaw
        } else if (row.status === 'sucesso') {
          statusOp = 'BAIXADO_COMPLETO'
        } else if (det.reconciliacao_necessaria) {
          statusOp = 'RECONCILIACAO_NECESSARIA'
        } else {
          statusOp = 'ERRO'
        }

        // Se uma intenção ficou gravada como PENDENTE (ex.: instância caiu durante o POST externo sem finalizar),
        // verifica se expirou o tempo máximo de chamada externa e converte para RECONCILIACAO_NECESSARIA
        if (statusOp === 'PENDENTE') {
          const expiraMs = Number(det.expira_em_ms || 0)
          const criadoMs = row.created_at
            ? new Date(row.created_at).getTime()
            : 0
          const agora = Date.now()
          const limiteAbandono =
            expiraMs > 0 ? expiraMs : criadoMs + DEFAULT_LOCK_LOTE_TTL_MS
          if (limiteAbandono > 0 && agora > limiteAbandono) {
            statusOp = 'RECONCILIACAO_NECESSARIA'
          }
        }

        const registro: RegistroOperacaoReceberExistente = {
          id: row.id ? String(row.id) : undefined,
          chave_idempotencia: chave,
          status: statusOp,
          conta_azul_evento_id: det.conta_azul_evento_id || null,
          conta_azul_parcela_id: det.conta_azul_parcela_id || null,
          conta_azul_baixa_id: det.conta_azul_baixa_id || null,
          erro_mensagem:
            det.erro_mensagem ||
            (statusOp === 'RECONCILIACAO_NECESSARIA'
              ? 'Operação anterior iniciada sem confirmação de término (possível timeout/queda de instância). Verifique no Conta Azul antes de reprocessar.'
              : null),
        }

        const anterior = mapaPorChave.get(chave)
        // Prioridade estrita: BAIXADO_COMPLETO > RECONCILIACAO_NECESSARIA > PENDENTE > ERRO
        const peso = (s: RegistroOperacaoReceberExistente['status']): number => {
          if (s === 'BAIXADO_COMPLETO') return 4
          if (s === 'RECONCILIACAO_NECESSARIA') return 3
          if (s === 'PENDENTE') return 2
          return 1
        }

        if (!anterior || peso(registro.status) >= peso(anterior.status)) {
          mapaPorChave.set(chave, registro)
        }
      }

      return Array.from(mapaPorChave.values())
    },

    async registrarIntencaoItemAntesDoPost(params): Promise<{ logId: string }> {
      const {
        empresaId,
        chaveLote,
        chaveIdempotencia,
        papel,
        valorCentavos,
        executionId,
      } = params

      const agoraMs = Date.now()
      const expiraEmMs = agoraMs + DEFAULT_LOCK_LOTE_TTL_MS

      const insertQuery = supabaseAdmin.from('logs_integracao').insert({
        empresa_id: empresaId,
        acao: ACAO_LOG_RECEBER_1FB,
        status: 'info',
        detalhes: {
          etapa: 'intencao_pre_post_1fb',
          chave_lote: chaveLote,
          chave_idempotencia: chaveIdempotencia,
          papel,
          status_item: 'EM_PROCESSAMENTO',
          status_operacao: 'PENDENTE',
          reconciliacao_necessaria: false,
          valor_centavos: valorCentavos,
          execution_id: executionId,
          iniciado_em_iso: new Date(agoraMs).toISOString(),
          expira_em_ms: expiraEmMs,
        },
      })

      const res =
        typeof insertQuery.select === 'function'
          ? await insertQuery.select('id').single()
          : await insertQuery

      if (res?.error) {
        throw new Error(
          `Falha ao registrar intenção pré-POST no Supabase: ${res.error.message}`
        )
      }

      const logId = res?.data?.id
        ? String(res.data.id)
        : `intencao-${executionId}`
      return { logId }
    },

    async registrarResultadoItem(params): Promise<void> {
      const {
        empresaId,
        chaveLote,
        item,
        payloadEnviado,
        respostaBrutaContaAzul,
        intencaoLogId,
      } = params

      const statusLog =
        item.status === 'TRANSMITIDO_COM_SUCESSO' ||
        item.status === 'JA_TRANSMITIDO_ANTERIORMENTE'
          ? 'sucesso'
          : 'erro'

      const statusOperacao: RegistroOperacaoReceberExistente['status'] =
        item.status === 'TRANSMITIDO_COM_SUCESSO' ||
        item.status === 'JA_TRANSMITIDO_ANTERIORMENTE'
          ? 'BAIXADO_COMPLETO'
          : item.reconciliacao_necessaria
            ? 'RECONCILIACAO_NECESSARIA'
            : 'ERRO'

      const detalhesFinais = {
        etapa: item.reconciliacao_necessaria
          ? 'reconciliacao_necessaria'
          : 'transmissao_1fb',
        chave_lote: chaveLote,
        chave_idempotencia: item.chave_idempotencia,
        papel: item.papel,
        tipo_evento: item.tipo_evento,
        status_item: item.status,
        status_operacao: statusOperacao,
        reconciliacao_necessaria: item.reconciliacao_necessaria,
        valor_centavos: item.valor_centavos,
        categoria_id: item.categoria_id,
        categoria_nome: item.categoria_nome,
        conta_financeira_id: item.conta_financeira_id,
        conta_financeira_nome: item.conta_financeira_nome,
        data_vencimento_iso: item.data_vencimento_iso,
        contato_id: item.contato_id || null,
        conta_azul_evento_id: item.conta_azul_evento_id,
        conta_azul_parcela_id: item.conta_azul_parcela_id,
        mensagem: item.mensagem,
        erro_mensagem: item.erro_detalhe || null,
        payload_enviado: payloadEnviado ?? null,
        resposta_conta_azul: respostaBrutaContaAzul ?? null,
        finalizado_em_iso: new Date().toISOString(),
      }

      // Se existe um log de intenção pré-POST, atualiza-o in-place para remover o estado PENDENTE
      if (intencaoLogId && !intencaoLogId.startsWith('intencao-')) {
        const { error: errUpdate } = await supabaseAdmin
          .from('logs_integracao')
          .update({
            status: statusLog,
            detalhes: detalhesFinais,
          })
          .eq('id', intencaoLogId)
          .eq('empresa_id', empresaId)

        if (!errUpdate) {
          return
        }
      }

      const { error } = await supabaseAdmin.from('logs_integracao').insert({
        empresa_id: empresaId,
        acao: ACAO_LOG_RECEBER_1FB,
        status: statusLog,
        detalhes: detalhesFinais,
      })

      if (error) {
        throw new Error(
          `Falha ao persistir resultado do item (${item.papel}) em logs_integracao: ${error.message}`
        )
      }
    },

    async adquirirLockProcessamentoLote(params): Promise<ResultadoLockLote1FB> {
      const {
        empresaId,
        chaveLote,
        ttlMs = DEFAULT_LOCK_LOTE_TTL_MS,
        nowMs = Date.now(),
      } = params

      const executionId = crypto.randomUUID()

      // 1. Consulta locks existentes para (empresaId, ACAO_LOCK_LOTE_RECEBER_1FB, chaveLote)
      let queryLocks = supabaseAdmin
        .from('logs_integracao')
        .select('id, status, detalhes, created_at')
        .eq('empresa_id', empresaId)
        .eq('acao', ACAO_LOCK_LOTE_RECEBER_1FB)
        .eq('status', 'info')

      if (typeof queryLocks.eq === 'function') {
        queryLocks = queryLocks.eq('detalhes->>chave_lote', chaveLote)
      }

      const { data: locksAtivos, error: errBuscaLock } = await queryLocks
      if (errBuscaLock) {
        throw new Error(
          `Falha ao verificar lock de concorrência do lote no Supabase: ${errBuscaLock.message}`
        )
      }

      const listaLocks = Array.isArray(locksAtivos) ? locksAtivos : []

      for (const row of listaLocks) {
        const det =
          row.detalhes && typeof row.detalhes === 'object' ? row.detalhes : {}
        if (String(det.chave_lote || '') !== chaveLote) continue
        if (String(det.estado_lock || '') !== 'ATIVO') continue

        const expiraMs = Number(det.expira_em_ms || 0)
        const criadoMs = row.created_at
          ? new Date(row.created_at).getTime()
          : 0
        const deadlineMs = expiraMs > 0 ? expiraMs : criadoMs + ttlMs

        if (deadlineMs > nowMs) {
          return {
            adquirido: false,
            lockId: null,
            executionId,
            motivoBloqueio:
              'Já existe um processamento ativo em andamento para este mesmo lote e loja. Aguarde a conclusão antes de tentar novamente.',
          }
        }

        // Lock expirado (abandonado): expira atomicamente o registro antigo antes de prosseguir
        if (row.id) {
          const { error: errExpire } = await supabaseAdmin
            .from('logs_integracao')
            .update({
              status: 'erro',
              detalhes: {
                ...det,
                estado_lock: 'EXPIRADO_RECUPERADO',
                expirado_em_iso: new Date(nowMs).toISOString(),
              },
            })
            .eq('id', row.id)
            .eq('status', 'info')

          if (errExpire) {
            throw new Error(
              `Não foi possível recuperar lock expirado do lote: ${errExpire.message}`
            )
          }
        }
      }

      // 2. Insere nosso registro de lock com executionId exclusivo
      const expiraEmMs = nowMs + ttlMs
      const insertLockQuery = supabaseAdmin.from('logs_integracao').insert({
        empresa_id: empresaId,
        acao: ACAO_LOCK_LOTE_RECEBER_1FB,
        status: 'info',
        detalhes: {
          chave_lote: chaveLote,
          chave_idempotencia: `LOCK|${chaveLote}`,
          estado_lock: 'ATIVO',
          execution_id: executionId,
          adquirido_em_iso: new Date(nowMs).toISOString(),
          expira_em_ms: expiraEmMs,
        },
      })

      const resInsert =
        typeof insertLockQuery.select === 'function'
          ? await insertLockQuery.select('id').single()
          : await insertLockQuery

      if (resInsert?.error) {
        // Caso o índice UNIQUE parcial `uq_logs_integracao_receber_1fb_lock_ativo` rejeite inserção concorrente (código 23505)
        return {
          adquirido: false,
          lockId: null,
          executionId,
          motivoBloqueio:
            'Concorrência detectada: outra requisição simultânea adquiriu o bloqueio deste lote.',
        }
      }

      const meuLockId = resInsert?.data?.id ? String(resInsert.data.id) : null

      // 3. Releitura imediata de verificação pós-inserção (garante exclusividade determinística mesmo antes da aplicação da migration 051)
      let verifyQuery = supabaseAdmin
        .from('logs_integracao')
        .select('id, status, detalhes, created_at')
        .eq('empresa_id', empresaId)
        .eq('acao', ACAO_LOCK_LOTE_RECEBER_1FB)
        .eq('status', 'info')

      if (typeof verifyQuery.eq === 'function') {
        verifyQuery = verifyQuery.eq('detalhes->>chave_lote', chaveLote)
      }
      if (typeof verifyQuery.order === 'function') {
        verifyQuery = verifyQuery.order('created_at', { ascending: true })
      }

      const { data: locksPosInsert, error: errVerify } = await verifyQuery
      if (errVerify) {
        throw new Error(
          `Falha ao confirmar exclusividade do lock no Supabase: ${errVerify.message}`
        )
      }

      const ativosConcorrentes = (
        Array.isArray(locksPosInsert) ? locksPosInsert : []
      ).filter((r: any) => {
        const d = r.detalhes && typeof r.detalhes === 'object' ? r.detalhes : {}
        return (
          String(d.chave_lote || '') === chaveLote &&
          String(d.estado_lock || '') === 'ATIVO' &&
          Number(d.expira_em_ms || 0) > nowMs
        )
      })

      if (ativosConcorrentes.length > 1) {
        // Ordena determinísticamente por created_at ASC e depois por execution_id ASC
        ativosConcorrentes.sort((a: any, b: any) => {
          const tA = a.created_at ? new Date(a.created_at).getTime() : 0
          const tB = b.created_at ? new Date(b.created_at).getTime() : 0
          if (tA !== tB) return tA - tB
          const exA = String(a.detalhes?.execution_id || '')
          const exB = String(b.detalhes?.execution_id || '')
          return exA.localeCompare(exB)
        })

        const vencedor = ativosConcorrentes[0]
        const vencedorExecId = String(vencedor?.detalhes?.execution_id || '')

        if (vencedorExecId !== executionId) {
          // Perdeu a corrida concorrente: desativa o próprio registro de lock e aborta antes de qualquer POST
          if (meuLockId) {
            await supabaseAdmin
              .from('logs_integracao')
              .update({
                status: 'erro',
                detalhes: {
                  chave_lote: chaveLote,
                  estado_lock: 'CEDIDO_CONCORRENCIA',
                  execution_id: executionId,
                },
              })
              .eq('id', meuLockId)
          }

          return {
            adquirido: false,
            lockId: null,
            executionId,
            motivoBloqueio:
              'Requisição simultânea detectada para o mesmo lote. Apenas a primeira requisição foi autorizada a processar.',
          }
        }
      }

      return {
        adquirido: true,
        lockId: meuLockId,
        executionId,
      }
    },

    async liberarLockProcessamentoLote(params): Promise<void> {
      const { empresaId, chaveLote, lockId, executionId, situacaoFinal } =
        params
      if (!lockId) return

      const statusFinalLog =
        situacaoFinal === 'SUCESSO_COMPLETO' ||
        situacaoFinal === 'JA_CONCLUIDO_IDEMPOTENTE'
          ? 'sucesso'
          : 'erro'

      const { error } = await supabaseAdmin
        .from('logs_integracao')
        .update({
          status: statusFinalLog,
          detalhes: {
            chave_lote: chaveLote,
            chave_idempotencia: `LOCK|${chaveLote}`,
            estado_lock: 'LIBERADO',
            execution_id: executionId,
            situacao_final: situacaoFinal,
            liberado_em_iso: new Date().toISOString(),
          },
        })
        .eq('id', lockId)
        .eq('empresa_id', empresaId)

      if (error) {
        throw new Error(
          `Falha ao liberar lock de processamento do lote (${chaveLote}): ${error.message}`
        )
      }
    },
  }
}

export interface DependenciasExecucao1FB {
  obterTokenValido: (
    empresaId: string,
    forcarRefresh?: boolean,
    failedAccessToken?: string
  ) => Promise<{ accessToken: string }>
  repositorioIdempotencia: RepositorioIdempotenciaReceber1FB
  empresaAutorizadaServidor?: {
    id: string
    nome: string
  } | null
  listarContasFinanceirasCA?: (
    accessToken: string
  ) => Promise<ContaFinanceiraReceberDTO[]>
  listarCategoriasCA?: (accessToken: string) => Promise<{
    categorias_receita: CategoriaFinanceiraReceberDTO[]
    categorias_despesa: CategoriaFinanceiraReceberDTO[]
  }>
  consultarAvaliacaoPeriodoCA?: (params: {
    accessToken: string
    dataDeIso: string
    dataAteIso: string
    valorBrutoEsperadoCentavos: number
    valorMdrEsperadoCentavos: number
    valorLiquidoEsperadoCentavos: number
    identificadoresDeterministicos?: string[]
  }) => Promise<AvaliacaoPeriodoContaAzulStoneDTO>
  resolverClienteReceitaStone?: (
    accessToken: string,
    nomeContato: string
  ) => Promise<string | null>
  resolverFornecedorDespesaStone?: (
    accessToken: string,
    nomeContato: string
  ) => Promise<string | null>
  transmitirReceitaBrutaCA?: (
    accessToken: string,
    payload: PayloadCriarContaReceberCA
  ) => Promise<RespostaEventoFinanceiroCA>
  transmitirDespesaMdrCA?: (
    accessToken: string,
    payload: any
  ) => Promise<RespostaEventoFinanceiroCA>
  transmissaoRealHabilitadaOverride?: boolean
}

/**
 * Valida se o objeto de confirmação explícita enviado pela UI corresponde fielmente
 * aos parâmetros da operação e à empresa autorizada no servidor.
 */
export function validarConfirmacaoExplicitaUsuario1FB(
  req: RequisicaoTransmissao1FBDTO,
  empresaAutorizadaServidor?: { id: string; nome: string } | null
): { valido: boolean; motivo?: string } {
  const conf = req.confirmacao_explicita
  if (!conf || conf.confirmado_pelo_usuario !== true) {
    return {
      valido: false,
      motivo:
        'A transmissão exige confirmação explícita do usuário antes do envio.',
    }
  }

  const dataIso =
    parseDataBrParaIso(req.filtros.data_vencimento_original) || ''

  if (conf.loja_id !== req.empresa_id || !conf.loja_nome?.trim()) {
    return {
      valido: false,
      motivo:
        'Divergência na confirmação explícita: a loja confirmada não corresponde à loja ativa.',
    }
  }

  if (empresaAutorizadaServidor) {
    if (
      req.empresa_id !== empresaAutorizadaServidor.id ||
      conf.loja_id !== empresaAutorizadaServidor.id
    ) {
      return {
        valido: false,
        motivo:
          'Divergência de segurança: o identificador da loja enviada difere da empresa autorizada no servidor.',
      }
    }

    const nomeServidorNorm = normalizarTextoComparacao(
      empresaAutorizadaServidor.nome
    )
    const nomeReqNorm = normalizarTextoComparacao(req.empresa_nome)
    const nomeConfNorm = normalizarTextoComparacao(conf.loja_nome)

    if (
      nomeServidorNorm &&
      (nomeReqNorm !== nomeServidorNorm || nomeConfNorm !== nomeServidorNorm)
    ) {
      return {
        valido: false,
        motivo: `Divergência de segurança: o nome da loja informada ("${conf.loja_nome}") não corresponde ao cadastro oficial da empresa autorizada ("${empresaAutorizadaServidor.nome}").`,
      }
    }
  }

  if (
    conf.conta_financeira_id !== req.conta_financeira_selecionada?.id ||
    !conf.conta_financeira_nome?.trim()
  ) {
    return {
      valido: false,
      motivo:
        'Divergência na confirmação explícita: a conta financeira confirmada não corresponde à conta selecionada.',
    }
  }

  if (
    conf.categoria_receita_id !== req.categoria_receita_selecionada?.id ||
    conf.categoria_despesa_mdr_id !== req.categoria_despesa_mdr_selecionada?.id
  ) {
    return {
      valido: false,
      motivo:
        'Divergência na confirmação explícita: as categorias confirmadas diferem das categorias selecionadas.',
    }
  }

  if (
    conf.valor_receita_bruta_centavos !== req.totais.valor_bruto_centavos ||
    conf.valor_despesa_mdr_centavos !==
      req.totais.desconto_mdr_ajustado_centavos ||
    conf.valor_liquido_centavos !== req.totais.valor_liquido_centavos
  ) {
    return {
      valido: false,
      motivo:
        'Divergência na confirmação explícita: os valores confirmados de Receita Bruta, Despesa MDR ou Líquido diferem dos valores calculados do lote.',
    }
  }

  if (!dataIso || conf.data_lancamentos_iso !== dataIso) {
    return {
      valido: false,
      motivo:
        'Divergência na confirmação explícita: a data confirmada dos lançamentos difere da Data de Vencimento Original filtrada.',
    }
  }

  if (conf.status_conferencia_bancaria !== 'CONFERIDO_EXATO') {
    return {
      valido: false,
      motivo:
        'Divergência na confirmação explícita: o status de conferência bancária confirmado deve ser CONFERIDO_EXATO.',
    }
  }

  return { valido: true }
}

/**
 * Valida autoritativamente no servidor se a Conta Financeira, a Categoria de Receita e a Categoria de Despesa MDR
 * enviadas pelo navegador existem de fato na conexão Conta Azul da loja ativa e possuem os nomes/tipos exigidos.
 */
export function validarMetadadosAutoritativosContaAzul1FB(params: {
  contaEnviada: ContaFinanceiraReceberDTO | null | undefined
  categoriaReceitaEnviada: CategoriaFinanceiraReceberDTO | null | undefined
  categoriaDespesaMdrEnviada: CategoriaFinanceiraReceberDTO | null | undefined
  despesaDispensadaZero: boolean
  contasReaisCA: ContaFinanceiraReceberDTO[]
  categoriasReceitaReaisCA: CategoriaFinanceiraReceberDTO[]
  categoriasDespesaReaisCA: CategoriaFinanceiraReceberDTO[]
}): {
  valido: boolean
  motivo?: string
  bloqueios: MotivoBloqueioPreparacao1FA[]
  contaAutoritativa: ContaFinanceiraReceberDTO | null
  categoriaReceitaAutoritativa: CategoriaFinanceiraReceberDTO | null
  categoriaDespesaMdrAutoritativa: CategoriaFinanceiraReceberDTO | null
} {
  const {
    contaEnviada,
    categoriaReceitaEnviada,
    categoriaDespesaMdrEnviada,
    despesaDispensadaZero,
    contasReaisCA,
    categoriasReceitaReaisCA,
    categoriasDespesaReaisCA,
  } = params

  const bloqueios: MotivoBloqueioPreparacao1FA[] = []

  const contaReal =
    contasReaisCA.find((c) => c.id === contaEnviada?.id) || null

  if (!contaReal) {
    bloqueios.push({
      codigo: 'CONTA_FINANCEIRA_NAO_SELECIONADA',
      campo: 'conta_financeira',
      titulo:
        'Conta financeira não pertence à conexão Conta Azul da loja ativa',
      detalhe: `O ID de conta financeira informado ("${contaEnviada?.id || ''}") não foi localizado entre as contas financeiras ativas retornadas pela Conta Azul para esta loja.`,
    })
  } else if (
    normalizarTextoComparacao(contaReal.descricao) !==
    normalizarTextoComparacao(contaEnviada?.descricao || '')
  ) {
    bloqueios.push({
      codigo: 'CONTA_FINANCEIRA_NAO_SELECIONADA',
      campo: 'conta_financeira',
      titulo: 'Divergência no nome da conta financeira na Conta Azul',
      detalhe: `O nome enviado pelo navegador ("${contaEnviada?.descricao}") difere do cadastro real na Conta Azul ("${contaReal.descricao}").`,
    })
  }

  const catReceitaReal =
    categoriasReceitaReaisCA.find(
      (c) => c.id === categoriaReceitaEnviada?.id
    ) || null

  if (!catReceitaReal || !ehCategoriaReceitasDeVendasValida(catReceitaReal)) {
    bloqueios.push({
      codigo: 'CATEGORIA_RECEITA_VENDAS_INVALIDA',
      campo: 'categoria_receita',
      titulo:
        'Categoria de Receita Bruta inválida ou inexistente na Conta Azul da loja',
      detalhe: catReceitaReal
        ? `A categoria real localizada na Conta Azul para o ID "${catReceitaReal.id}" é "${catReceitaReal.nome}" (${catReceitaReal.tipo}), que não corresponde a "Receitas de Vendas".`
        : `O ID de categoria de receita informado ("${categoriaReceitaEnviada?.id || ''}") não existe entre as categorias reais de RECEITA da loja na Conta Azul.`,
    })
  }

  const catDespesaReal =
    categoriasDespesaReaisCA.find(
      (c) => c.id === categoriaDespesaMdrEnviada?.id
    ) || null

  if (
    !despesaDispensadaZero &&
    (!catDespesaReal || !ehCategoriaTarifasCartaoMdrValida(catDespesaReal))
  ) {
    bloqueios.push({
      codigo: 'CATEGORIA_DESPESA_MDR_INVALIDA',
      campo: 'categoria_despesa_mdr',
      titulo:
        'Categoria de Despesa MDR inválida ou inexistente na Conta Azul da loja',
      detalhe: catDespesaReal
        ? `A categoria real localizada na Conta Azul para o ID "${catDespesaReal.id}" é "${catDespesaReal.nome}" (${catDespesaReal.tipo}), que não corresponde a "Tarifas de Cartão de Créditos".`
        : `O ID de categoria de despesa MDR informado ("${categoriaDespesaMdrEnviada?.id || ''}") não existe entre as categorias reais de DESPESA da loja na Conta Azul.`,
    })
  }

  return {
    valido: bloqueios.length === 0,
    motivo:
      bloqueios.length > 0
        ? `Validação autoritativa na Conta Azul reprovada: ${bloqueios.map((b) => `${b.titulo} (${b.detalhe})`).join(' | ')}`
        : undefined,
    bloqueios,
    contaAutoritativa: contaReal,
    categoriaReceitaAutoritativa: catReceitaReal,
    categoriaDespesaMdrAutoritativa: catDespesaReal,
  }
}

/**
 * Executa o fluxo completo, isolado e endurecido da Etapa 1F-B:
 * 1. Valida confirmação explícita do usuário e correspondência com a empresa autorizada no servidor.
 * 2. Executa validação de pré-voo da Etapa 1F-A (`CONFERIDO_EXATO`, loja, conta, categorias, datas, valores).
 * 3. Adquire lock atômico e persistente de concorrência para `(empresa_id, chave_lote)` no Supabase.
 * 4. Verifica estado de idempotência persistente por item (`RECEITA_BRUTA` e `DESPESA_MDR`).
 * 5. Verifica a trava de segurança de transmissão real da Etapa 1F-B (`CONTA_AZUL_RECEBER_1FB_TRANSMISSAO_HABILITADA`).
 * 6. Valida autoritativamente conta financeira e categorias diretamente na API da Conta Azul da loja ativa.
 * 7. Revalida o período na Conta Azul tratando com segurança o reprocessamento parcial (quando a Receita Bruta já foi criada pelo próprio lote).
 * 8. Registra intenção antes do POST, transmite apenas itens pendentes, exige UUID válido e verifica erros de persistência no Supabase.
 */
export async function executarTransmissaoControladaEtapa1FB(
  req: RequisicaoTransmissao1FBDTO,
  deps: DependenciasExecucao1FB
): Promise<RespostaTransmissao1FBDTO> {
  const empresaIdAutorizado =
    deps.empresaAutorizadaServidor?.id || req.empresa_id
  const empresaNomeAutorizado =
    deps.empresaAutorizadaServidor?.nome || req.empresa_nome

  const validacaoConfirmacao = validarConfirmacaoExplicitaUsuario1FB(
    req,
    deps.empresaAutorizadaServidor
  )

  // Executa preparação base da Etapa 1F-A para obter chaves determinísticas e validações estruturais
  const previaBase = prepararEValidarLancamentosEtapa1FA({
    empresaId: empresaIdAutorizado,
    empresaNome: empresaNomeAutorizado,
    filtros: req.filtros,
    totais: req.totais,
    conferencia: req.conferencia,
    contaFinanceiraSelecionada: req.conta_financeira_selecionada,
    categoriaReceitaSelecionada: req.categoria_receita_selecionada,
    categoriaDespesaMdrSelecionada: req.categoria_despesa_mdr_selecionada,
  })

  const {
    chave_lote: chaveLote,
    chave_receita_bruta: chaveReceita,
    chave_despesa_mdr: chaveDespesa,
  } = previaBase.validacao_idempotencia

  if (!validacaoConfirmacao.valido) {
    return {
      etapa: '1F-B',
      situacao: 'BLOQUEADO_VALIDACAO_PRE_VOO',
      transmissao_real_habilitada: verificarTransmissaoReal1FBHabilitada(
        deps.transmissaoRealHabilitadaOverride
      ),
      sucesso: false,
      bloqueado: true,
      reconciliacao_necessaria: false,
      empresa_id: empresaIdAutorizado,
      empresa_nome: empresaNomeAutorizado,
      chave_lote: chaveLote,
      mensagem:
        validacaoConfirmacao.motivo ||
        'Confirmação explícita obrigatória ausente ou inválida.',
      receita_bruta: null,
      despesa_mdr: null,
      bloqueios_pre_voo: previaBase.bloqueios,
    }
  }

  if (!previaBase.pronto_para_etapa_1fb) {
    return {
      etapa: '1F-B',
      situacao: 'BLOQUEADO_VALIDACAO_PRE_VOO',
      transmissao_real_habilitada: verificarTransmissaoReal1FBHabilitada(
        deps.transmissaoRealHabilitadaOverride
      ),
      sucesso: false,
      bloqueado: true,
      reconciliacao_necessaria: false,
      empresa_id: empresaIdAutorizado,
      empresa_nome: empresaNomeAutorizado,
      chave_lote: chaveLote,
      mensagem: `Envio bloqueado pela validação de pré-voo (${previaBase.bloqueios.length} pendência(s)): ${previaBase.bloqueios.map((b) => b.titulo).join('; ')}.`,
      receita_bruta: null,
      despesa_mdr: null,
      bloqueios_pre_voo: previaBase.bloqueios,
    }
  }

  // 2. Adquirir Lock Atômico e Persistente de Lote no Supabase (impede execução simultânea em múltiplas instâncias)
  let lockInfo: ResultadoLockLote1FB = {
    adquirido: true,
    lockId: null,
    executionId: crypto.randomUUID(),
  }

  if (deps.repositorioIdempotencia.adquirirLockProcessamentoLote) {
    lockInfo = await deps.repositorioIdempotencia.adquirirLockProcessamentoLote(
      {
        empresaId: empresaIdAutorizado,
        chaveLote,
        chavesItens: [chaveReceita, chaveDespesa],
      }
    )

    if (!lockInfo.adquirido) {
      return {
        etapa: '1F-B',
        situacao: 'BLOQUEADO_CONCORRENCIA_LOTE_EM_ANDAMENTO',
        transmissao_real_habilitada: verificarTransmissaoReal1FBHabilitada(
          deps.transmissaoRealHabilitadaOverride
        ),
        sucesso: false,
        bloqueado: true,
        reconciliacao_necessaria: false,
        empresa_id: empresaIdAutorizado,
        empresa_nome: empresaNomeAutorizado,
        chave_lote: chaveLote,
        mensagem:
          lockInfo.motivoBloqueio ||
          'Operação bloqueada por concorrência: já existe outra requisição processando este mesmo lote para esta loja.',
        receita_bruta: null,
        despesa_mdr: null,
      }
    }
  }

  let situacaoFinalParaLock = 'FALHA_COMPLETA'

  try {
    // 3. Consultar registros persistidos de idempotência para os 2 lançamentos
    const registrosIdemp =
      await deps.repositorioIdempotencia.listarOperacoesPorChaves(
        empresaIdAutorizado,
        [chaveReceita, chaveDespesa]
      )

    const regReceitaAnterior = registrosIdemp.find(
      (r) => r.chave_idempotencia === chaveReceita
    )
    const regDespesaAnterior = registrosIdemp.find(
      (r) => r.chave_idempotencia === chaveDespesa
    )

    // Se houver uma intenção PENDENTE ativa de outra execução que não terminou
    if (
      regReceitaAnterior?.status === 'PENDENTE' ||
      regDespesaAnterior?.status === 'PENDENTE'
    ) {
      situacaoFinalParaLock = 'BLOQUEADO_CONCORRENCIA_LOTE_EM_ANDAMENTO'
      return {
        etapa: '1F-B',
        situacao: 'BLOQUEADO_CONCORRENCIA_LOTE_EM_ANDAMENTO',
        transmissao_real_habilitada: verificarTransmissaoReal1FBHabilitada(
          deps.transmissaoRealHabilitadaOverride
        ),
        sucesso: false,
        bloqueado: true,
        reconciliacao_necessaria: false,
        empresa_id: empresaIdAutorizado,
        empresa_nome: empresaNomeAutorizado,
        chave_lote: chaveLote,
        mensagem:
          'Existe uma intenção de transmissão em andamento para um dos itens deste lote. Aguarde a finalização antes de reprocessar.',
        receita_bruta: null,
        despesa_mdr: null,
      }
    }

    // Se qualquer um dos itens estiver em RECONCILIACAO_NECESSARIA (resposta ambígua, falha de persistência pós-POST ou timeout anterior),
    // bloqueia reenvio automático para impedir duplicidade no Conta Azul
    if (
      regReceitaAnterior?.status === 'RECONCILIACAO_NECESSARIA' ||
      regDespesaAnterior?.status === 'RECONCILIACAO_NECESSARIA'
    ) {
      situacaoFinalParaLock = 'RECONCILIACAO_NECESSARIA_BLOQUEADO'
      const msgRec =
        'Operação bloqueada por segurança: uma tentativa anterior resultou em estado ambíguo ([RECONCILIAÇÃO NECESSÁRIA]). Verifique no Conta Azul antes de reprocessar.'
      return {
        etapa: '1F-B',
        situacao: 'RECONCILIACAO_NECESSARIA_BLOQUEADO',
        transmissao_real_habilitada: verificarTransmissaoReal1FBHabilitada(
          deps.transmissaoRealHabilitadaOverride
        ),
        sucesso: false,
        bloqueado: true,
        reconciliacao_necessaria: true,
        empresa_id: empresaIdAutorizado,
        empresa_nome: empresaNomeAutorizado,
        chave_lote: chaveLote,
        mensagem: msgRec,
        receita_bruta: regReceitaAnterior
          ? {
              papel: 'RECEITA_BRUTA',
              tipo_evento: 'RECEITA',
              chave_idempotencia: chaveReceita,
              status:
                regReceitaAnterior.status === 'BAIXADO_COMPLETO'
                  ? 'JA_TRANSMITIDO_ANTERIORMENTE'
                  : 'RECONCILIACAO_NECESSARIA',
              transmitido_nesta_execucao: false,
              reaproveitado_idempotencia:
                regReceitaAnterior.status === 'BAIXADO_COMPLETO',
              reconciliacao_necessaria:
                regReceitaAnterior.status === 'RECONCILIACAO_NECESSARIA',
              valor_centavos: previaBase.lancamento_receita_bruta.valor_centavos,
              categoria_id:
                previaBase.lancamento_receita_bruta.categoria_selecionada_id,
              categoria_nome:
                previaBase.lancamento_receita_bruta.categoria_selecionada_nome,
              conta_financeira_id:
                previaBase.lancamento_receita_bruta.conta_financeira_id,
              conta_financeira_nome:
                previaBase.lancamento_receita_bruta.conta_financeira_nome,
              data_vencimento_iso:
                previaBase.lancamento_receita_bruta.data_vencimento_iso,
              conta_azul_evento_id:
                regReceitaAnterior.conta_azul_evento_id || null,
              conta_azul_parcela_id:
                regReceitaAnterior.conta_azul_parcela_id || null,
              mensagem:
                regReceitaAnterior.erro_mensagem ||
                'Item requer reconciliação manual no Conta Azul.',
            }
          : null,
        despesa_mdr: regDespesaAnterior
          ? {
              papel: 'DESPESA_MDR',
              tipo_evento: 'DESPESA',
              chave_idempotencia: chaveDespesa,
              status:
                regDespesaAnterior.status === 'BAIXADO_COMPLETO'
                  ? 'JA_TRANSMITIDO_ANTERIORMENTE'
                  : 'RECONCILIACAO_NECESSARIA',
              transmitido_nesta_execucao: false,
              reaproveitado_idempotencia:
                regDespesaAnterior.status === 'BAIXADO_COMPLETO',
              reconciliacao_necessaria:
                regDespesaAnterior.status === 'RECONCILIACAO_NECESSARIA',
              valor_centavos: previaBase.lancamento_despesa_mdr.valor_centavos,
              categoria_id:
                previaBase.lancamento_despesa_mdr.categoria_selecionada_id,
              categoria_nome:
                previaBase.lancamento_despesa_mdr.categoria_selecionada_nome,
              conta_financeira_id:
                previaBase.lancamento_despesa_mdr.conta_financeira_id,
              conta_financeira_nome:
                previaBase.lancamento_despesa_mdr.conta_financeira_nome,
              data_vencimento_iso:
                previaBase.lancamento_despesa_mdr.data_vencimento_iso,
              conta_azul_evento_id:
                regDespesaAnterior.conta_azul_evento_id || null,
              conta_azul_parcela_id:
                regDespesaAnterior.conta_azul_parcela_id || null,
              mensagem:
                regDespesaAnterior.erro_mensagem ||
                'Item requer reconciliação manual no Conta Azul.',
            }
          : null,
      }
    }

    const receitaJaTransmitida = Boolean(
      regReceitaAnterior &&
        regReceitaAnterior.status === 'BAIXADO_COMPLETO' &&
        (regReceitaAnterior.conta_azul_parcela_id ||
          regReceitaAnterior.conta_azul_evento_id)
    )

    const despesaDispensadaZero =
      previaBase.lancamento_despesa_mdr.dispensado_por_valor_zero

    const despesaJaTransmitida = Boolean(
      regDespesaAnterior &&
        regDespesaAnterior.status === 'BAIXADO_COMPLETO' &&
        (regDespesaAnterior.conta_azul_parcela_id ||
          regDespesaAnterior.conta_azul_evento_id)
    )

    // Se ambos já foram transmitidos anteriormente com sucesso, retorna idempotente sem chamar POST na Conta Azul
    if (
      receitaJaTransmitida &&
      (despesaJaTransmitida || despesaDispensadaZero)
    ) {
      situacaoFinalParaLock = 'JA_CONCLUIDO_IDEMPOTENTE'
      return {
        etapa: '1F-B',
        situacao: 'JA_CONCLUIDO_IDEMPOTENTE',
        transmissao_real_habilitada: verificarTransmissaoReal1FBHabilitada(
          deps.transmissaoRealHabilitadaOverride
        ),
        sucesso: true,
        bloqueado: true,
        reconciliacao_necessaria: false,
        empresa_id: empresaIdAutorizado,
        empresa_nome: empresaNomeAutorizado,
        chave_lote: chaveLote,
        mensagem:
          'Duplicidade evitada por idempotência: a Receita Bruta e a Despesa MDR deste lote já foram transmitidas anteriormente para a Conta Azul.',
        receita_bruta: {
          papel: 'RECEITA_BRUTA',
          tipo_evento: 'RECEITA',
          chave_idempotencia: chaveReceita,
          status: 'JA_TRANSMITIDO_ANTERIORMENTE',
          transmitido_nesta_execucao: false,
          reaproveitado_idempotencia: true,
          reconciliacao_necessaria: false,
          valor_centavos: previaBase.lancamento_receita_bruta.valor_centavos,
          categoria_id:
            previaBase.lancamento_receita_bruta.categoria_selecionada_id,
          categoria_nome:
            previaBase.lancamento_receita_bruta.categoria_selecionada_nome,
          conta_financeira_id:
            previaBase.lancamento_receita_bruta.conta_financeira_id,
          conta_financeira_nome:
            previaBase.lancamento_receita_bruta.conta_financeira_nome,
          data_vencimento_iso:
            previaBase.lancamento_receita_bruta.data_vencimento_iso,
          conta_azul_evento_id:
            regReceitaAnterior?.conta_azul_evento_id || null,
          conta_azul_parcela_id:
            regReceitaAnterior?.conta_azul_parcela_id || null,
          mensagem: `Receita Bruta já transmitida anteriormente (Parcela/Evento: ${regReceitaAnterior?.conta_azul_parcela_id || regReceitaAnterior?.conta_azul_evento_id}).`,
        },
        despesa_mdr: despesaDispensadaZero
          ? {
              papel: 'DESPESA_MDR',
              tipo_evento: 'DESPESA',
              chave_idempotencia: chaveDespesa,
              status: 'DISPENSADO_VALOR_ZERO',
              transmitido_nesta_execucao: false,
              reaproveitado_idempotencia: false,
              reconciliacao_necessaria: false,
              valor_centavos: 0,
              categoria_id:
                previaBase.lancamento_despesa_mdr.categoria_selecionada_id,
              categoria_nome:
                previaBase.lancamento_despesa_mdr.categoria_selecionada_nome,
              conta_financeira_id:
                previaBase.lancamento_despesa_mdr.conta_financeira_id,
              conta_financeira_nome:
                previaBase.lancamento_despesa_mdr.conta_financeira_nome,
              data_vencimento_iso:
                previaBase.lancamento_despesa_mdr.data_vencimento_iso,
              conta_azul_evento_id: null,
              conta_azul_parcela_id: null,
              mensagem: 'Despesa MDR igual a R$ 0,00 (dispensada).',
            }
          : {
              papel: 'DESPESA_MDR',
              tipo_evento: 'DESPESA',
              chave_idempotencia: chaveDespesa,
              status: 'JA_TRANSMITIDO_ANTERIORMENTE',
              transmitido_nesta_execucao: false,
              reaproveitado_idempotencia: true,
              reconciliacao_necessaria: false,
              valor_centavos: previaBase.lancamento_despesa_mdr.valor_centavos,
              categoria_id:
                previaBase.lancamento_despesa_mdr.categoria_selecionada_id,
              categoria_nome:
                previaBase.lancamento_despesa_mdr.categoria_selecionada_nome,
              conta_financeira_id:
                previaBase.lancamento_despesa_mdr.conta_financeira_id,
              conta_financeira_nome:
                previaBase.lancamento_despesa_mdr.conta_financeira_nome,
              data_vencimento_iso:
                previaBase.lancamento_despesa_mdr.data_vencimento_iso,
              conta_azul_evento_id:
                regDespesaAnterior?.conta_azul_evento_id || null,
              conta_azul_parcela_id:
                regDespesaAnterior?.conta_azul_parcela_id || null,
              mensagem: `Despesa MDR já transmitida anteriormente (Parcela/Evento: ${regDespesaAnterior?.conta_azul_parcela_id || regDespesaAnterior?.conta_azul_evento_id}).`,
            },
      }
    }

    // 4. Trava de Segurança da Etapa 1F-B: manter envio real bloqueado durante desenvolvimento/testes até liberação explícita
    const transmissaoRealHabilitada = verificarTransmissaoReal1FBHabilitada(
      deps.transmissaoRealHabilitadaOverride
    )

    if (!transmissaoRealHabilitada) {
      situacaoFinalParaLock = 'BLOQUEADO_TRAVA_SEGURANCA_ETAPA'
      return {
        etapa: '1F-B',
        situacao: 'BLOQUEADO_TRAVA_SEGURANCA_ETAPA',
        transmissao_real_habilitada: false,
        sucesso: false,
        bloqueado: true,
        reconciliacao_necessaria: false,
        empresa_id: empresaIdAutorizado,
        empresa_nome: empresaNomeAutorizado,
        chave_lote: chaveLote,
        mensagem:
          'Trava de Segurança da Etapa 1F-B ativa: todos os dados e a confirmação explícita foram validados com sucesso, mas a transmissão financeira real para a Conta Azul permanece bloqueada conforme regra da etapa até autorização expressa.',
        receita_bruta: {
          papel: 'RECEITA_BRUTA',
          tipo_evento: 'RECEITA',
          chave_idempotencia: chaveReceita,
          status: 'BLOQUEADO_TRAVA_ETAPA',
          transmitido_nesta_execucao: false,
          reaproveitado_idempotencia: false,
          reconciliacao_necessaria: false,
          valor_centavos: previaBase.lancamento_receita_bruta.valor_centavos,
          categoria_id:
            previaBase.lancamento_receita_bruta.categoria_selecionada_id,
          categoria_nome:
            previaBase.lancamento_receita_bruta.categoria_selecionada_nome,
          conta_financeira_id:
            previaBase.lancamento_receita_bruta.conta_financeira_id,
          conta_financeira_nome:
            previaBase.lancamento_receita_bruta.conta_financeira_nome,
          data_vencimento_iso:
            previaBase.lancamento_receita_bruta.data_vencimento_iso,
          conta_azul_evento_id: null,
          conta_azul_parcela_id: null,
          mensagem:
            'Receita Bruta validada e pronta, retida pela trava de segurança da Etapa 1F-B (nenhum POST enviado).',
        },
        despesa_mdr: {
          papel: 'DESPESA_MDR',
          tipo_evento: 'DESPESA',
          chave_idempotencia: chaveDespesa,
          status: despesaDispensadaZero
            ? 'DISPENSADO_VALOR_ZERO'
            : 'BLOQUEADO_TRAVA_ETAPA',
          transmitido_nesta_execucao: false,
          reaproveitado_idempotencia: false,
          reconciliacao_necessaria: false,
          valor_centavos: previaBase.lancamento_despesa_mdr.valor_centavos,
          categoria_id:
            previaBase.lancamento_despesa_mdr.categoria_selecionada_id,
          categoria_nome:
            previaBase.lancamento_despesa_mdr.categoria_selecionada_nome,
          conta_financeira_id:
            previaBase.lancamento_despesa_mdr.conta_financeira_id,
          conta_financeira_nome:
            previaBase.lancamento_despesa_mdr.conta_financeira_nome,
          data_vencimento_iso:
            previaBase.lancamento_despesa_mdr.data_vencimento_iso,
          conta_azul_evento_id: null,
          conta_azul_parcela_id: null,
          mensagem: despesaDispensadaZero
            ? 'Despesa MDR igual a R$ 0,00 (dispensada).'
            : 'Despesa MDR validada e pronta, retida pela trava de segurança da Etapa 1F-B (nenhum POST enviado).',
        },
      }
    }

    // 5. Obter token OAuth válido da loja ativa (reutilizando getValidToken sem alterá-lo)
    let tokenAtual = (
      await deps.obterTokenValido(empresaIdAutorizado, false)
    ).accessToken

    // 6. Validação Autoritativa no Servidor: consultar Contas Financeiras e Categorias reais da loja ativa na Conta Azul
    const listarContasFn =
      deps.listarContasFinanceirasCA || listarContasFinanceirasSatelite
    const listarCategoriasFn =
      deps.listarCategoriasCA || listarCategoriasReceitaEDespesaSatelite

    let contasReaisCA: ContaFinanceiraReceberDTO[] = []
    let categoriasReaisCA: {
      categorias_receita: CategoriaFinanceiraReceberDTO[]
      categorias_despesa: CategoriaFinanceiraReceberDTO[]
    } = { categorias_receita: [], categorias_despesa: [] }

    try {
      ;[contasReaisCA, categoriasReaisCA] = await Promise.all([
        listarContasFn(tokenAtual),
        listarCategoriasFn(tokenAtual),
      ])
    } catch (errMeta: unknown) {
      const msg = errMeta instanceof Error ? errMeta.message : String(errMeta)
      if (msg === 'TOKEN_EXPIRADO' || /401|unauthorized/i.test(msg)) {
        const renovado = await deps.obterTokenValido(
          empresaIdAutorizado,
          true,
          tokenAtual
        )
        tokenAtual = renovado.accessToken
        ;[contasReaisCA, categoriasReaisCA] = await Promise.all([
          listarContasFn(tokenAtual),
          listarCategoriasFn(tokenAtual),
        ])
      } else {
        throw errMeta
      }
    }

    const validacaoAutoritativa = validarMetadadosAutoritativosContaAzul1FB({
      contaEnviada: req.conta_financeira_selecionada,
      categoriaReceitaEnviada: req.categoria_receita_selecionada,
      categoriaDespesaMdrEnviada: req.categoria_despesa_mdr_selecionada,
      despesaDispensadaZero,
      contasReaisCA,
      categoriasReceitaReaisCA: categoriasReaisCA.categorias_receita,
      categoriasDespesaReaisCA: categoriasReaisCA.categorias_despesa,
    })

    if (!validacaoAutoritativa.valido) {
      situacaoFinalParaLock = 'BLOQUEADO_VALIDACAO_PRE_VOO'
      return {
        etapa: '1F-B',
        situacao: 'BLOQUEADO_VALIDACAO_PRE_VOO',
        transmissao_real_habilitada: true,
        sucesso: false,
        bloqueado: true,
        reconciliacao_necessaria: false,
        empresa_id: empresaIdAutorizado,
        empresa_nome: empresaNomeAutorizado,
        chave_lote: chaveLote,
        mensagem:
          validacaoAutoritativa.motivo ||
          'Bloqueado: a conta financeira ou as categorias enviadas não correspondem aos registros reais da loja na Conta Azul.',
        receita_bruta: null,
        despesa_mdr: null,
        bloqueios_pre_voo: validacaoAutoritativa.bloqueios,
      }
    }

    // Reconstroi a prévia usando estritamente os objetos autoritativos validados no servidor
    const previaAutoritativa = prepararEValidarLancamentosEtapa1FA({
      empresaId: empresaIdAutorizado,
      empresaNome: empresaNomeAutorizado,
      filtros: req.filtros,
      totais: req.totais,
      conferencia: req.conferencia,
      contaFinanceiraSelecionada: validacaoAutoritativa.contaAutoritativa,
      categoriaReceitaSelecionada:
        validacaoAutoritativa.categoriaReceitaAutoritativa,
      categoriaDespesaMdrSelecionada:
        validacaoAutoritativa.categoriaDespesaMdrAutoritativa,
    })

    const dataIso =
      previaAutoritativa.filtros_operacionais.data_vencimento_original_iso

    // 7. Verificar lançamentos existentes no período na Conta Azul antes de criar itens inéditos
    const consultarPeriodoFn =
      deps.consultarAvaliacaoPeriodoCA || consultarAvaliacaoPeriodoStoneSatelite

    let avaliacaoPeriodo: AvaliacaoPeriodoContaAzulStoneDTO | null = null
    try {
      avaliacaoPeriodo = await consultarPeriodoFn({
        accessToken: tokenAtual,
        dataDeIso: dataIso,
        dataAteIso: dataIso,
        valorBrutoEsperadoCentavos: !receitaJaTransmitida
          ? previaAutoritativa.lancamento_receita_bruta.valor_centavos
          : 0,
        valorMdrEsperadoCentavos:
          !despesaJaTransmitida && !despesaDispensadaZero
            ? previaAutoritativa.lancamento_despesa_mdr.valor_centavos
            : 0,
        valorLiquidoEsperadoCentavos: !receitaJaTransmitida
          ? previaAutoritativa.validacao_matematica
              .valor_liquido_esperado_centavos
          : 0,
        identificadoresDeterministicos:
          req.identificadores_deterministicos || [],
      })
    } catch (errConsulta: unknown) {
      const msg =
        errConsulta instanceof Error ? errConsulta.message : String(errConsulta)
      if (msg === 'TOKEN_EXPIRADO' || /401|unauthorized/i.test(msg)) {
        const renovado = await deps.obterTokenValido(
          empresaIdAutorizado,
          true,
          tokenAtual
        )
        tokenAtual = renovado.accessToken
        avaliacaoPeriodo = await consultarPeriodoFn({
          accessToken: tokenAtual,
          dataDeIso: dataIso,
          dataAteIso: dataIso,
          valorBrutoEsperadoCentavos: !receitaJaTransmitida
            ? previaAutoritativa.lancamento_receita_bruta.valor_centavos
            : 0,
          valorMdrEsperadoCentavos:
            !despesaJaTransmitida && !despesaDispensadaZero
              ? previaAutoritativa.lancamento_despesa_mdr.valor_centavos
              : 0,
          valorLiquidoEsperadoCentavos: !receitaJaTransmitida
            ? previaAutoritativa.validacao_matematica
                .valor_liquido_esperado_centavos
            : 0,
          identificadoresDeterministicos:
            req.identificadores_deterministicos || [],
        })
      } else {
        throw errConsulta
      }
    }

    // Se a Receita Bruta já foi confirmada pelo PRÓPRIO lote em execução anterior (falha parcial sendo retomada),
    // neutralizamos apenas a triagem de Receita Bruta na cópia de avaliação para que a presença da própria Receita
    // recém-criada na Conta Azul não bloqueie o envio da Despesa MDR pendente, mantendo 100% dos bloqueios
    // de duplicidade externa/ambiguidade para a Despesa MDR pendente.
    const avaliacaoPeriodoAjustadaParaItensPendentes: AvaliacaoPeriodoContaAzulStoneDTO | null =
      avaliacaoPeriodo
        ? {
            ...avaliacaoPeriodo,
            triagem_receita_bruta: receitaJaTransmitida
              ? {
                  ...avaliacaoPeriodo.triagem_receita_bruta,
                  classificacao: 'NAO_LOCALIZADO_NO_PERIODO',
                  ja_quitado: false,
                  autoriza_vinculo_automatico: false,
                  candidatos: [],
                  mensagem:
                    'Receita Bruta já transmitida e confirmada pelo próprio lote (preservada por idempotência).',
                }
              : avaliacaoPeriodo.triagem_receita_bruta,
            triagem_deposito_liquido: receitaJaTransmitida
              ? {
                  ...avaliacaoPeriodo.triagem_deposito_liquido,
                  classificacao: 'NAO_LOCALIZADO_NO_PERIODO',
                  ja_quitado: false,
                  autoriza_vinculo_automatico: false,
                  candidatos: [],
                  mensagem:
                    'Receita já confirmada pelo próprio lote; validando Despesa MDR pendente.',
                }
              : avaliacaoPeriodo.triagem_deposito_liquido,
            triagem_despesa_mdr: despesaJaTransmitida
              ? {
                  ...avaliacaoPeriodo.triagem_despesa_mdr,
                  classificacao: 'NAO_LOCALIZADO_NO_PERIODO',
                  ja_quitado: false,
                  autoriza_vinculo_automatico: false,
                  candidatos: [],
                  mensagem:
                    'Despesa MDR já transmitida e confirmada pelo próprio lote.',
                }
              : avaliacaoPeriodo.triagem_despesa_mdr,
          }
        : null

    const validacaoComCA = prepararEValidarLancamentosEtapa1FA({
      empresaId: empresaIdAutorizado,
      empresaNome: empresaNomeAutorizado,
      filtros: req.filtros,
      totais: req.totais,
      conferencia: req.conferencia,
      contaFinanceiraSelecionada: validacaoAutoritativa.contaAutoritativa,
      categoriaReceitaSelecionada:
        validacaoAutoritativa.categoriaReceitaAutoritativa,
      categoriaDespesaMdrSelecionada:
        validacaoAutoritativa.categoriaDespesaMdrAutoritativa,
      avaliacaoPeriodoCA: avaliacaoPeriodoAjustadaParaItensPendentes,
    })

    if (!validacaoComCA.pronto_para_etapa_1fb) {
      situacaoFinalParaLock = 'BLOQUEADO_VALIDACAO_PRE_VOO'
      return {
        etapa: '1F-B',
        situacao: 'BLOQUEADO_VALIDACAO_PRE_VOO',
        transmissao_real_habilitada: true,
        sucesso: false,
        bloqueado: true,
        reconciliacao_necessaria: false,
        empresa_id: empresaIdAutorizado,
        empresa_nome: empresaNomeAutorizado,
        chave_lote: chaveLote,
        mensagem: `Transmissão bloqueada por lançamento existente ou candidato ambíguo na Conta Azul: ${validacaoComCA.bloqueios.map((b) => `${b.titulo} (${b.detalhe})`).join(' | ')}`,
        receita_bruta: null,
        despesa_mdr: null,
        bloqueios_pre_voo: validacaoComCA.bloqueios,
      }
    }

    // 8. TRANSMISSÃO DO ITEM 1: RECEITA BRUTA ("Receitas de Vendas")
    let resultadoReceita: ResultadoItemTransmissao1FBDTO

    if (receitaJaTransmitida && regReceitaAnterior) {
      resultadoReceita = {
        papel: 'RECEITA_BRUTA',
        tipo_evento: 'RECEITA',
        chave_idempotencia: chaveReceita,
        status: 'JA_TRANSMITIDO_ANTERIORMENTE',
        transmitido_nesta_execucao: false,
        reaproveitado_idempotencia: true,
        reconciliacao_necessaria: false,
        valor_centavos:
          previaAutoritativa.lancamento_receita_bruta.valor_centavos,
        categoria_id:
          previaAutoritativa.lancamento_receita_bruta.categoria_selecionada_id,
        categoria_nome:
          previaAutoritativa.lancamento_receita_bruta
            .categoria_selecionada_nome,
        conta_financeira_id:
          previaAutoritativa.lancamento_receita_bruta.conta_financeira_id,
        conta_financeira_nome:
          previaAutoritativa.lancamento_receita_bruta.conta_financeira_nome,
        data_vencimento_iso:
          previaAutoritativa.lancamento_receita_bruta.data_vencimento_iso,
        conta_azul_evento_id: regReceitaAnterior.conta_azul_evento_id || null,
        conta_azul_parcela_id: regReceitaAnterior.conta_azul_parcela_id || null,
        mensagem: `Receita Bruta preservada por idempotência (já transmitida anteriormente pelo próprio lote: ${regReceitaAnterior.conta_azul_parcela_id || regReceitaAnterior.conta_azul_evento_id}).`,
      }
    } else {
      let postReceitaIniciado = false
      let intencaoReceitaLogId: string | null = null
      let payloadReceitaEnvio: PayloadCriarContaReceberCA | null = null

      try {
        const resolverCliente =
          deps.resolverClienteReceitaStone ||
          (async (token: string, nome: string) => {
            const cli = await buscarOuCriarCliente(token, nome)
            return cli?.id || null
          })

        const clienteId = await resolverCliente(
          tokenAtual,
          NOME_CONTATO_PADRAO_STONE
        )
        if (!clienteId) {
          throw new Error(
            `Não foi possível localizar ou preparar o contato de cliente "${NOME_CONTATO_PADRAO_STONE}" na Conta Azul.`
          )
        }

        payloadReceitaEnvio = {
          ...previaAutoritativa.lancamento_receita_bruta
            .payload_simulado_conta_azul!,
          id_cliente: clienteId,
        }

        // Registra a intenção no Supabase ANTES de disparar o POST externo
        if (deps.repositorioIdempotencia.registrarIntencaoItemAntesDoPost) {
          const intencao =
            await deps.repositorioIdempotencia.registrarIntencaoItemAntesDoPost(
              {
                empresaId: empresaIdAutorizado,
                chaveLote,
                chaveIdempotencia: chaveReceita,
                papel: 'RECEITA_BRUTA',
                valorCentavos:
                  previaAutoritativa.lancamento_receita_bruta.valor_centavos,
                executionId: lockInfo.executionId,
              }
            )
          intencaoReceitaLogId = intencao.logId
        }

        const enviarReceitaFn =
          deps.transmitirReceitaBrutaCA || criarContaReceberSatelite
        postReceitaIniciado = true
        const respReceita = await enviarReceitaFn(
          tokenAtual,
          payloadReceitaEnvio
        )
        const ids = extrairIdentificadoresRespostaContaAzul(respReceita)

        // Regra obrigatória: Não considerar concluída apenas porque a requisição foi iniciada; exige UUID confirmado
        if (!ids.valido || !ids.idPrincipal) {
          const msgAmb =
            '[RECONCILIAÇÃO NECESSÁRIA] A API da Conta Azul respondeu à criação da Receita Bruta sem retornar um UUID válido de evento/parcela. Verifique na Conta Azul antes de reprocessar.'
          resultadoReceita = {
            papel: 'RECEITA_BRUTA',
            tipo_evento: 'RECEITA',
            chave_idempotencia: chaveReceita,
            status: 'RECONCILIACAO_NECESSARIA',
            transmitido_nesta_execucao: false,
            reaproveitado_idempotencia: false,
            reconciliacao_necessaria: true,
            valor_centavos:
              previaAutoritativa.lancamento_receita_bruta.valor_centavos,
            categoria_id:
              previaAutoritativa.lancamento_receita_bruta
                .categoria_selecionada_id,
            categoria_nome:
              previaAutoritativa.lancamento_receita_bruta
                .categoria_selecionada_nome,
            conta_financeira_id:
              previaAutoritativa.lancamento_receita_bruta.conta_financeira_id,
            conta_financeira_nome:
              previaAutoritativa.lancamento_receita_bruta.conta_financeira_nome,
            data_vencimento_iso:
              previaAutoritativa.lancamento_receita_bruta.data_vencimento_iso,
            contato_id: clienteId,
            contato_nome: NOME_CONTATO_PADRAO_STONE,
            conta_azul_evento_id: null,
            conta_azul_parcela_id: null,
            mensagem: msgAmb,
            erro_detalhe: msgAmb,
          }
        } else {
          resultadoReceita = {
            papel: 'RECEITA_BRUTA',
            tipo_evento: 'RECEITA',
            chave_idempotencia: chaveReceita,
            status: 'TRANSMITIDO_COM_SUCESSO',
            transmitido_nesta_execucao: true,
            reaproveitado_idempotencia: false,
            reconciliacao_necessaria: false,
            valor_centavos:
              previaAutoritativa.lancamento_receita_bruta.valor_centavos,
            categoria_id:
              previaAutoritativa.lancamento_receita_bruta
                .categoria_selecionada_id,
            categoria_nome:
              previaAutoritativa.lancamento_receita_bruta
                .categoria_selecionada_nome,
            conta_financeira_id:
              previaAutoritativa.lancamento_receita_bruta.conta_financeira_id,
            conta_financeira_nome:
              previaAutoritativa.lancamento_receita_bruta.conta_financeira_nome,
            data_vencimento_iso:
              previaAutoritativa.lancamento_receita_bruta.data_vencimento_iso,
            contato_id: clienteId,
            contato_nome: NOME_CONTATO_PADRAO_STONE,
            conta_azul_evento_id: ids.eventoId,
            conta_azul_parcela_id: ids.parcelaId || ids.idPrincipal,
            mensagem: `Receita Bruta (${formatarCentavosBRL(previaAutoritativa.lancamento_receita_bruta.valor_centavos)}) criada com sucesso na Conta Azul (Parcela: ${ids.parcelaId || ids.idPrincipal}).`,
          }
        }

        // Persistência obrigatória do resultado: se falhar no Supabase após o POST externo,
        // NUNCA declarar operação como concluída; converter para RECONCILIACAO_NECESSARIA preservando os UUIDs retornados!
        try {
          await deps.repositorioIdempotencia.registrarResultadoItem({
            empresaId: empresaIdAutorizado,
            chaveLote,
            item: resultadoReceita,
            payloadEnviado: payloadReceitaEnvio,
            respostaBrutaContaAzul: respReceita,
            intencaoLogId: intencaoReceitaLogId,
          })
        } catch (errPersistenciaRec: unknown) {
          const msgPersist = sanitizarMensagemErroSegura(errPersistenciaRec, [
            tokenAtual,
          ])
          const msgCritica = `[RECONCILIAÇÃO NECESSÁRIA - FALHA DE PERSISTÊNCIA NO SUPABASE] A Receita Bruta foi enviada à Conta Azul (UUID: ${resultadoReceita.conta_azul_parcela_id || resultadoReceita.conta_azul_evento_id || 'não identificado'}), mas houve erro ao confirmar a gravação no banco local: ${msgPersist}. Reenvio bloqueado para evitar duplicação.`
          resultadoReceita = {
            ...resultadoReceita,
            status: 'RECONCILIACAO_NECESSARIA',
            reconciliacao_necessaria: true,
            mensagem: msgCritica,
            erro_detalhe: msgCritica,
          }
        }
      } catch (errRec: unknown) {
        const msgSegura = sanitizarMensagemErroSegura(errRec, [tokenAtual])
        const ehTimeoutOuRedeAmbiguo =
          postReceitaIniciado &&
          /timeout|timed out|etimedout|econnreset|socket hang up|abort|fetch failed|network|\[502\]|\[503\]|\[504\]/i.test(
            msgSegura
          )

        const msgFinal = ehTimeoutOuRedeAmbiguo
          ? `[RECONCILIAÇÃO NECESSÁRIA - TIMEOUT/REDE] ${msgSegura} — Verifique na Conta Azul se a Receita Bruta foi criada antes de reprocessar.`
          : msgSegura

        resultadoReceita = {
          papel: 'RECEITA_BRUTA',
          tipo_evento: 'RECEITA',
          chave_idempotencia: chaveReceita,
          status: ehTimeoutOuRedeAmbiguo
            ? 'RECONCILIACAO_NECESSARIA'
            : 'FALHA_TRANSMISSAO',
          transmitido_nesta_execucao: false,
          reaproveitado_idempotencia: false,
          reconciliacao_necessaria: ehTimeoutOuRedeAmbiguo,
          valor_centavos:
            previaAutoritativa.lancamento_receita_bruta.valor_centavos,
          categoria_id:
            previaAutoritativa.lancamento_receita_bruta
              .categoria_selecionada_id,
          categoria_nome:
            previaAutoritativa.lancamento_receita_bruta
              .categoria_selecionada_nome,
          conta_financeira_id:
            previaAutoritativa.lancamento_receita_bruta.conta_financeira_id,
          conta_financeira_nome:
            previaAutoritativa.lancamento_receita_bruta.conta_financeira_nome,
          data_vencimento_iso:
            previaAutoritativa.lancamento_receita_bruta.data_vencimento_iso,
          conta_azul_evento_id: null,
          conta_azul_parcela_id: null,
          mensagem: `Falha ao transmitir Receita Bruta: ${msgFinal}`,
          erro_detalhe: msgFinal,
        }

        try {
          await deps.repositorioIdempotencia.registrarResultadoItem({
            empresaId: empresaIdAutorizado,
            chaveLote,
            item: resultadoReceita,
            payloadEnviado: payloadReceitaEnvio,
            intencaoLogId: intencaoReceitaLogId,
          })
        } catch (errPersistFalhaRec: unknown) {
          const msgPersist = sanitizarMensagemErroSegura(errPersistFalhaRec, [
            tokenAtual,
          ])
          if (postReceitaIniciado) {
            resultadoReceita = {
              ...resultadoReceita,
              status: 'RECONCILIACAO_NECESSARIA',
              reconciliacao_necessaria: true,
              mensagem: `${resultadoReceita.mensagem} | Falha adicional ao persistir log no Supabase: ${msgPersist}`,
              erro_detalhe: `${resultadoReceita.erro_detalhe || ''} | ${msgPersist}`,
            }
          }
        }
      }
    }

    // Se a Receita Bruta falhou ou entrou em reconciliação necessária, interrompe antes de transmitir a Despesa MDR
    const receitaConfirmada =
      (resultadoReceita.status === 'TRANSMITIDO_COM_SUCESSO' ||
        resultadoReceita.status === 'JA_TRANSMITIDO_ANTERIORMENTE') &&
      !resultadoReceita.reconciliacao_necessaria

    if (!receitaConfirmada) {
      situacaoFinalParaLock = resultadoReceita.reconciliacao_necessaria
        ? 'RECONCILIACAO_NECESSARIA_BLOQUEADO'
        : 'FALHA_COMPLETA'
      return {
        etapa: '1F-B',
        situacao: resultadoReceita.reconciliacao_necessaria
          ? 'RECONCILIACAO_NECESSARIA_BLOQUEADO'
          : 'FALHA_COMPLETA',
        transmissao_real_habilitada: true,
        sucesso: false,
        bloqueado: resultadoReceita.reconciliacao_necessaria,
        reconciliacao_necessaria: resultadoReceita.reconciliacao_necessaria,
        empresa_id: empresaIdAutorizado,
        empresa_nome: empresaNomeAutorizado,
        chave_lote: chaveLote,
        mensagem: resultadoReceita.mensagem,
        receita_bruta: resultadoReceita,
        despesa_mdr: null,
      }
    }

    // 9. TRANSMISSÃO DO ITEM 2: DESPESA MDR ("Tarifas de Cartão de Créditos")
    let resultadoDespesa: ResultadoItemTransmissao1FBDTO

    if (despesaDispensadaZero) {
      resultadoDespesa = {
        papel: 'DESPESA_MDR',
        tipo_evento: 'DESPESA',
        chave_idempotencia: chaveDespesa,
        status: 'DISPENSADO_VALOR_ZERO',
        transmitido_nesta_execucao: false,
        reaproveitado_idempotencia: false,
        reconciliacao_necessaria: false,
        valor_centavos: 0,
        categoria_id:
          previaAutoritativa.lancamento_despesa_mdr.categoria_selecionada_id,
        categoria_nome:
          previaAutoritativa.lancamento_despesa_mdr.categoria_selecionada_nome,
        conta_financeira_id:
          previaAutoritativa.lancamento_despesa_mdr.conta_financeira_id,
        conta_financeira_nome:
          previaAutoritativa.lancamento_despesa_mdr.conta_financeira_nome,
        data_vencimento_iso:
          previaAutoritativa.lancamento_despesa_mdr.data_vencimento_iso,
        conta_azul_evento_id: null,
        conta_azul_parcela_id: null,
        mensagem: 'Despesa MDR igual a R$ 0,00 (dispensada).',
      }
    } else if (despesaJaTransmitida && regDespesaAnterior) {
      resultadoDespesa = {
        papel: 'DESPESA_MDR',
        tipo_evento: 'DESPESA',
        chave_idempotencia: chaveDespesa,
        status: 'JA_TRANSMITIDO_ANTERIORMENTE',
        transmitido_nesta_execucao: false,
        reaproveitado_idempotencia: true,
        reconciliacao_necessaria: false,
        valor_centavos:
          previaAutoritativa.lancamento_despesa_mdr.valor_centavos,
        categoria_id:
          previaAutoritativa.lancamento_despesa_mdr.categoria_selecionada_id,
        categoria_nome:
          previaAutoritativa.lancamento_despesa_mdr.categoria_selecionada_nome,
        conta_financeira_id:
          previaAutoritativa.lancamento_despesa_mdr.conta_financeira_id,
        conta_financeira_nome:
          previaAutoritativa.lancamento_despesa_mdr.conta_financeira_nome,
        data_vencimento_iso:
          previaAutoritativa.lancamento_despesa_mdr.data_vencimento_iso,
        conta_azul_evento_id: regDespesaAnterior.conta_azul_evento_id || null,
        conta_azul_parcela_id: regDespesaAnterior.conta_azul_parcela_id || null,
        mensagem: `Despesa MDR preservada por idempotência (já transmitida anteriormente: ${regDespesaAnterior.conta_azul_parcela_id || regDespesaAnterior.conta_azul_evento_id}).`,
      }
    } else {
      let postDespesaIniciado = false
      let intencaoDespesaLogId: string | null = null
      let payloadDespesaEnvio: any = null

      try {
        const resolverFornecedor =
          deps.resolverFornecedorDespesaStone ||
          (async (token: string, nome: string) => {
            const idForn = await buscarOuCriarContato(token, nome)
            return idForn || null
          })

        const fornecedorId = await resolverFornecedor(
          tokenAtual,
          NOME_CONTATO_PADRAO_STONE
        )
        if (!fornecedorId) {
          throw new Error(
            `Não foi possível localizar ou preparar o fornecedor "${NOME_CONTATO_PADRAO_STONE}" na Conta Azul.`
          )
        }

        payloadDespesaEnvio = {
          ...previaAutoritativa.lancamento_despesa_mdr
            .payload_simulado_conta_azul!,
          id_fornecedor: fornecedorId,
        }

        if (deps.repositorioIdempotencia.registrarIntencaoItemAntesDoPost) {
          const intencao =
            await deps.repositorioIdempotencia.registrarIntencaoItemAntesDoPost(
              {
                empresaId: empresaIdAutorizado,
                chaveLote,
                chaveIdempotencia: chaveDespesa,
                papel: 'DESPESA_MDR',
                valorCentavos:
                  previaAutoritativa.lancamento_despesa_mdr.valor_centavos,
                executionId: lockInfo.executionId,
              }
            )
          intencaoDespesaLogId = intencao.logId
        }

        const enviarDespesaFn = deps.transmitirDespesaMdrCA || criarContaPagar
        postDespesaIniciado = true
        const respDespesa = await enviarDespesaFn(
          tokenAtual,
          payloadDespesaEnvio
        )
        const ids = extrairIdentificadoresRespostaContaAzul(respDespesa)

        if (!ids.valido || !ids.idPrincipal) {
          const msgAmb =
            '[RECONCILIAÇÃO NECESSÁRIA] A API da Conta Azul respondeu à criação da Despesa MDR sem retornar um UUID válido de evento/parcela. Verifique na Conta Azul antes de reprocessar.'
          resultadoDespesa = {
            papel: 'DESPESA_MDR',
            tipo_evento: 'DESPESA',
            chave_idempotencia: chaveDespesa,
            status: 'RECONCILIACAO_NECESSARIA',
            transmitido_nesta_execucao: false,
            reaproveitado_idempotencia: false,
            reconciliacao_necessaria: true,
            valor_centavos:
              previaAutoritativa.lancamento_despesa_mdr.valor_centavos,
            categoria_id:
              previaAutoritativa.lancamento_despesa_mdr
                .categoria_selecionada_id,
            categoria_nome:
              previaAutoritativa.lancamento_despesa_mdr
                .categoria_selecionada_nome,
            conta_financeira_id:
              previaAutoritativa.lancamento_despesa_mdr.conta_financeira_id,
            conta_financeira_nome:
              previaAutoritativa.lancamento_despesa_mdr.conta_financeira_nome,
            data_vencimento_iso:
              previaAutoritativa.lancamento_despesa_mdr.data_vencimento_iso,
            contato_id: fornecedorId,
            contato_nome: NOME_CONTATO_PADRAO_STONE,
            conta_azul_evento_id: null,
            conta_azul_parcela_id: null,
            mensagem: msgAmb,
            erro_detalhe: msgAmb,
          }
        } else {
          resultadoDespesa = {
            papel: 'DESPESA_MDR',
            tipo_evento: 'DESPESA',
            chave_idempotencia: chaveDespesa,
            status: 'TRANSMITIDO_COM_SUCESSO',
            transmitido_nesta_execucao: true,
            reaproveitado_idempotencia: false,
            reconciliacao_necessaria: false,
            valor_centavos:
              previaAutoritativa.lancamento_despesa_mdr.valor_centavos,
            categoria_id:
              previaAutoritativa.lancamento_despesa_mdr
                .categoria_selecionada_id,
            categoria_nome:
              previaAutoritativa.lancamento_despesa_mdr
                .categoria_selecionada_nome,
            conta_financeira_id:
              previaAutoritativa.lancamento_despesa_mdr.conta_financeira_id,
            conta_financeira_nome:
              previaAutoritativa.lancamento_despesa_mdr.conta_financeira_nome,
            data_vencimento_iso:
              previaAutoritativa.lancamento_despesa_mdr.data_vencimento_iso,
            contato_id: fornecedorId,
            contato_nome: NOME_CONTATO_PADRAO_STONE,
            conta_azul_evento_id: ids.eventoId,
            conta_azul_parcela_id: ids.parcelaId || ids.idPrincipal,
            mensagem: `Despesa MDR (${formatarCentavosBRL(previaAutoritativa.lancamento_despesa_mdr.valor_centavos)}) criada com sucesso na Conta Azul (Parcela: ${ids.parcelaId || ids.idPrincipal}).`,
          }
        }

        try {
          await deps.repositorioIdempotencia.registrarResultadoItem({
            empresaId: empresaIdAutorizado,
            chaveLote,
            item: resultadoDespesa,
            payloadEnviado: payloadDespesaEnvio,
            respostaBrutaContaAzul: respDespesa,
            intencaoLogId: intencaoDespesaLogId,
          })
        } catch (errPersistenciaDesp: unknown) {
          const msgPersist = sanitizarMensagemErroSegura(errPersistenciaDesp, [
            tokenAtual,
          ])
          const msgCritica = `[RECONCILIAÇÃO NECESSÁRIA - FALHA DE PERSISTÊNCIA NO SUPABASE] A Despesa MDR foi enviada à Conta Azul (UUID: ${resultadoDespesa.conta_azul_parcela_id || resultadoDespesa.conta_azul_evento_id || 'não identificado'}), mas houve erro ao confirmar a gravação no banco local: ${msgPersist}. Reenvio bloqueado para evitar duplicação.`
          resultadoDespesa = {
            ...resultadoDespesa,
            status: 'RECONCILIACAO_NECESSARIA',
            reconciliacao_necessaria: true,
            mensagem: msgCritica,
            erro_detalhe: msgCritica,
          }
        }
      } catch (errDesp: unknown) {
        const msgSegura = sanitizarMensagemErroSegura(errDesp, [tokenAtual])
        const ehTimeoutOuRedeAmbiguo =
          postDespesaIniciado &&
          /timeout|timed out|etimedout|econnreset|socket hang up|abort|fetch failed|network|\[502\]|\[503\]|\[504\]/i.test(
            msgSegura
          )

        const msgFinal = ehTimeoutOuRedeAmbiguo
          ? `[RECONCILIAÇÃO NECESSÁRIA - TIMEOUT/REDE] ${msgSegura} — Verifique na Conta Azul se a Despesa MDR foi criada antes de reprocessar.`
          : msgSegura

        resultadoDespesa = {
          papel: 'DESPESA_MDR',
          tipo_evento: 'DESPESA',
          chave_idempotencia: chaveDespesa,
          status: ehTimeoutOuRedeAmbiguo
            ? 'RECONCILIACAO_NECESSARIA'
            : 'FALHA_TRANSMISSAO',
          transmitido_nesta_execucao: false,
          reaproveitado_idempotencia: false,
          reconciliacao_necessaria: ehTimeoutOuRedeAmbiguo,
          valor_centavos:
            previaAutoritativa.lancamento_despesa_mdr.valor_centavos,
          categoria_id:
            previaAutoritativa.lancamento_despesa_mdr.categoria_selecionada_id,
          categoria_nome:
            previaAutoritativa.lancamento_despesa_mdr
              .categoria_selecionada_nome,
          conta_financeira_id:
            previaAutoritativa.lancamento_despesa_mdr.conta_financeira_id,
          conta_financeira_nome:
            previaAutoritativa.lancamento_despesa_mdr.conta_financeira_nome,
          data_vencimento_iso:
            previaAutoritativa.lancamento_despesa_mdr.data_vencimento_iso,
          conta_azul_evento_id: null,
          conta_azul_parcela_id: null,
          mensagem: `Falha ao transmitir Despesa MDR: ${msgFinal}`,
          erro_detalhe: msgFinal,
        }

        try {
          await deps.repositorioIdempotencia.registrarResultadoItem({
            empresaId: empresaIdAutorizado,
            chaveLote,
            item: resultadoDespesa,
            payloadEnviado: payloadDespesaEnvio,
            intencaoLogId: intencaoDespesaLogId,
          })
        } catch (errPersistFalhaDesp: unknown) {
          const msgPersist = sanitizarMensagemErroSegura(errPersistFalhaDesp, [
            tokenAtual,
          ])
          if (postDespesaIniciado) {
            resultadoDespesa = {
              ...resultadoDespesa,
              status: 'RECONCILIACAO_NECESSARIA',
              reconciliacao_necessaria: true,
              mensagem: `${resultadoDespesa.mensagem} | Falha adicional ao persistir log no Supabase: ${msgPersist}`,
              erro_detalhe: `${resultadoDespesa.erro_detalhe || ''} | ${msgPersist}`,
            }
          }
        }
      }
    }

    const despesaConfirmada =
      (resultadoDespesa.status === 'TRANSMITIDO_COM_SUCESSO' ||
        resultadoDespesa.status === 'JA_TRANSMITIDO_ANTERIORMENTE' ||
        resultadoDespesa.status === 'DISPENSADO_VALOR_ZERO') &&
      !resultadoDespesa.reconciliacao_necessaria

    if (!despesaConfirmada) {
      situacaoFinalParaLock = resultadoDespesa.reconciliacao_necessaria
        ? 'RECONCILIACAO_NECESSARIA_BLOQUEADO'
        : 'FALHA_PARCIAL_RETOMAVEL'
      return {
        etapa: '1F-B',
        situacao: resultadoDespesa.reconciliacao_necessaria
          ? 'RECONCILIACAO_NECESSARIA_BLOQUEADO'
          : 'FALHA_PARCIAL_RETOMAVEL',
        transmissao_real_habilitada: true,
        sucesso: false,
        bloqueado: resultadoDespesa.reconciliacao_necessaria,
        reconciliacao_necessaria: resultadoDespesa.reconciliacao_necessaria,
        empresa_id: empresaIdAutorizado,
        empresa_nome: empresaNomeAutorizado,
        chave_lote: chaveLote,
        mensagem: resultadoDespesa.reconciliacao_necessaria
          ? `A Receita Bruta foi confirmada (${resultadoReceita.conta_azul_parcela_id}), mas a Despesa MDR entrou em RECONCILIAÇÃO NECESSÁRIA: ${resultadoDespesa.mensagem}`
          : `Falha parcial controlada: a Receita Bruta está salva (${resultadoReceita.conta_azul_parcela_id}), mas a Despesa MDR falhou. Ao reprocessar, a Receita Bruta NÃO será duplicada e apenas a Despesa MDR será enviada.`,
        receita_bruta: resultadoReceita,
        despesa_mdr: resultadoDespesa,
      }
    }

    situacaoFinalParaLock = 'SUCESSO_COMPLETO'
    return {
      etapa: '1F-B',
      situacao: 'SUCESSO_COMPLETO',
      transmissao_real_habilitada: true,
      sucesso: true,
      bloqueado: false,
      reconciliacao_necessaria: false,
      empresa_id: empresaIdAutorizado,
      empresa_nome: empresaNomeAutorizado,
      chave_lote: chaveLote,
      mensagem:
        'Transmissão controlada da Etapa 1F-B concluída com sucesso: Receita Bruta e Despesa MDR registradas na Conta Azul e confirmadas no banco.',
      receita_bruta: resultadoReceita,
      despesa_mdr: resultadoDespesa,
    }
  } finally {
    if (
      lockInfo.adquirido &&
      lockInfo.lockId &&
      deps.repositorioIdempotencia.liberarLockProcessamentoLote
    ) {
      try {
        await deps.repositorioIdempotencia.liberarLockProcessamentoLote({
          empresaId: empresaIdAutorizado,
          chaveLote,
          lockId: lockInfo.lockId,
          executionId: lockInfo.executionId,
          situacaoFinal: situacaoFinalParaLock,
        })
      } catch {
        // Se a liberação do lock falhar, o TTL (expira_em_ms) garante expiração segura
      }
    }
  }
}
