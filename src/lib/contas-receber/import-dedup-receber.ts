/**
 * DCX LINK — MÓDULO CONTAS A RECEBER (ETAPA 1A: FUNDAÇÃO ISOLADA)
 * Motor independente de deduplicação, hash de arquivo e idempotência de operações.
 * Projetado para:
 * - Impedir reimportação duplicada de arquivos e transações.
 * - Permitir baixas parciais, divididas ou múltiplas em uma mesma parcela do Conta Azul.
 * - Bloquear repetição da mesma operação ou reenvio quando houver status confirmado ou ambíguo.
 */

import { createHash } from 'crypto'
import type { MovimentacaoReceberCanonica } from '@/types/contas-receber'

export interface RegistroOperacaoReceberExistente {
  id?: string
  chave_idempotencia: string
  status:
    | 'PENDENTE'
    | 'RECEITA_CRIADA_SEM_BAIXA'
    | 'BAIXADO_COMPLETO'
    | 'BAIXA_PARCIAL_REGISTRADA'
    | 'CONCILIADO_EXISTENTE'
    | 'ERRO'
    | 'RECONCILIACAO_NECESSARIA'
  conta_azul_evento_id?: string | null
  conta_azul_parcela_id?: string | null
  conta_azul_baixa_id?: string | null
  erro_mensagem?: string | null
}

/**
 * Calcula o hash SHA-256 determinístico de um arquivo (Buffer ou string) para evitar reimportação cega.
 */
export function calcularHashArquivoReceber(
  conteudo: Buffer | Uint8Array | string
): string {
  return createHash('sha256').update(conteudo).digest('hex')
}

/**
 * Normaliza texto para uso seguro em chaves canônicas.
 */
export function normalizarTextoChaveReceber(
  valor: string | null | undefined
): string {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Gera a chave canônica de uma movimentação do extrato (Frente 1: Cartões ou Frente 2: Outros).
 */
export function gerarChaveDedupMovimentacaoReceber(
  mov: MovimentacaoReceberCanonica
): string {
  const empresa = String(mov.empresa_id || '').trim()
  const frente = mov.frente
  const origem = mov.origem
  const natureza = mov.natureza
  const dtComp = String(mov.data_competencia || '').slice(0, 10)
  const dtRec = String(mov.data_recebimento || '').slice(0, 10)
  const bruto = Math.round(mov.valor_bruto_centavos)
  const taxa = Math.round(mov.taxa_total_centavos)
  const liquido = Math.round(mov.valor_liquido_centavos)

  if (frente === 'CARTOES_ADQUIRENTE') {
    const nsu = normalizarTextoChaveReceber(mov.nsu_tid || 'SEM_NSU')
    const aut = normalizarTextoChaveReceber(mov.codigo_autorizacao || 'SEM_AUT')
    const bandeira = normalizarTextoChaveReceber(mov.bandeira || 'OUTRAS')
    const modalidade = normalizarTextoChaveReceber(
      mov.modalidade_cartao || 'OUTRA'
    )
    const parcela = `${mov.parcela_numero || 1}/${mov.total_parcelas || 1}`
    return `${empresa}|${frente}|${origem}|${natureza}|${nsu}|${aut}|${bandeira}|${modalidade}|${parcela}|${dtComp}|${dtRec}|${bruto}|${taxa}|${liquido}`
  }

  // Frente 2: Outros Recebimentos
  const txId = normalizarTextoChaveReceber(
    mov.identificador_transacao_bancaria || mov.documento_referencia || 'SEM_TXID'
  )
  const docPagador = String(mov.pagador_cpf_cnpj || '').replace(/\D/g, '')
  return `${empresa}|${frente}|${origem}|${natureza}|${txId}|${docPagador}|${dtComp}|${dtRec}|${bruto}|${liquido}`
}

/**
 * Gera a chave de idempotência para uma operação de recebimento/baixa em uma parcela.
 * Permite que a MESMA parcela (`conta_azul_parcela_id`) receba múltiplas baixas parciais
 * legítimas desde que venham de eventos/transações distintas (`identificador_origem_recebimento`),
 * mas impede que a mesma transação/operação seja baixada duas vezes.
 */
export function gerarChaveIdempotenciaBaixaParcela(params: {
  empresa_id: string
  conta_azul_parcela_id: string
  origem_recebimento: string
  identificador_origem_recebimento: string // Ex: NSU/Lote ou EndToEndId/TxId ou Sequencial da amortização
  data_pagamento: string
  valor_baixa_centavos: number
}): string {
  const empresa = String(params.empresa_id || '').trim()
  const parcela = String(params.conta_azul_parcela_id || '').trim()
  const origem = normalizarTextoChaveReceber(params.origem_recebimento)
  const idOrigem = normalizarTextoChaveReceber(
    params.identificador_origem_recebimento
  )
  const dataPag = String(params.data_pagamento || '').slice(0, 10)
  const valor = Math.round(params.valor_baixa_centavos)

  return `BAIXA|${empresa}|${parcela}|${origem}|${idOrigem}|${dataPag}|${valor}`
}

/**
 * Verifica se um registro de operação já possui execução confirmada, parcial ou estado ambíguo
 * que proíba um reenvio cego.
 */
export function possuiOperacaoConfirmadaOuAmbiguaReceber(
  registro: RegistroOperacaoReceberExistente
): boolean {
  if (
    registro.status === 'BAIXADO_COMPLETO' ||
    registro.status === 'BAIXA_PARCIAL_REGISTRADA' ||
    registro.status === 'CONCILIADO_EXISTENTE' ||
    registro.status === 'RECONCILIACAO_NECESSARIA'
  ) {
    return true
  }

  if (
    registro.conta_azul_baixa_id &&
    String(registro.conta_azul_baixa_id).trim().length > 0
  ) {
    return true
  }

  const msgErro = String(registro.erro_mensagem || '').toUpperCase()
  if (
    msgErro.includes('RECONCILIAÇÃO NECESSÁRIA') ||
    msgErro.includes('RECONCILIACAO NECESSARIA') ||
    msgErro.includes('ENVIO BLOQUEADO')
  ) {
    return true
  }

  return false
}

/**
 * Classifica uma lista de novas operações propostas contra os registros já existentes,
 * separando:
 * - novasOperacoes: inéditas, podem seguir fluxo
 * - apenasBaixarReceitaJaCriada: a receita já foi criada (`RECEITA_CRIADA_SEM_BAIXA`), não deve recriar a receita, apenas concluir a baixa
 * - bloqueadasDuplicadasOuAmbiguas: já baixadas ou em estado ambíguo
 */
export function classificarIdempotenciaOperacoesReceber<
  T extends { chave_idempotencia: string }
>(
  candidatas: T[],
  existentes: RegistroOperacaoReceberExistente[]
): {
  novasOperacoes: T[]
  apenasBaixarReceitaJaCriada: Array<{
    candidata: T
    existente: RegistroOperacaoReceberExistente
  }>
  bloqueadasDuplicadasOuAmbiguas: Array<{
    candidata: T
    existente?: RegistroOperacaoReceberExistente
    motivo: string
  }>
} {
  const mapaExistentes = new Map<string, RegistroOperacaoReceberExistente>()
  for (const reg of existentes) {
    if (reg.chave_idempotencia) {
      mapaExistentes.set(reg.chave_idempotencia, reg)
    }
  }

  const chavesVistasNoLote = new Set<string>()
  const novasOperacoes: T[] = []
  const apenasBaixarReceitaJaCriada: Array<{
    candidata: T
    existente: RegistroOperacaoReceberExistente
  }> = []
  const bloqueadasDuplicadasOuAmbiguas: Array<{
    candidata: T
    existente?: RegistroOperacaoReceberExistente
    motivo: string
  }> = []

  for (const item of candidatas) {
    const chave = item.chave_idempotencia

    if (chavesVistasNoLote.has(chave)) {
      bloqueadasDuplicadasOuAmbiguas.push({
        candidata: item,
        motivo: 'Operação duplicada dentro do próprio lote atual.',
      })
      continue
    }
    chavesVistasNoLote.add(chave)

    const existente = mapaExistentes.get(chave)
    if (!existente) {
      novasOperacoes.push(item)
      continue
    }

    if (possuiOperacaoConfirmadaOuAmbiguaReceber(existente)) {
      bloqueadasDuplicadasOuAmbiguas.push({
        candidata: item,
        existente,
        motivo: `Operação bloqueada: registro existente com status "${existente.status}".`,
      })
      continue
    }

    if (
      existente.status === 'RECEITA_CRIADA_SEM_BAIXA' &&
      existente.conta_azul_parcela_id
    ) {
      apenasBaixarReceitaJaCriada.push({
        candidata: item,
        existente,
      })
      continue
    }

    novasOperacoes.push(item)
  }

  return {
    novasOperacoes,
    apenasBaixarReceitaJaCriada,
    bloqueadasDuplicadasOuAmbiguas,
  }
}
