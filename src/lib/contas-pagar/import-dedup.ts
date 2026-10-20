export interface ContaPagarChaveInput {
  id?: string
  empresa_id: string
  fornecedor: string
  valor: number | string
  vencimento: string
  doc?: string | null
  descricao?: string | null
  status?: string | null
  conta_azul_id?: string | null
  erro_mensagem?: string | null
}

export interface ResultadoDedupContasPagar<T extends ContaPagarChaveInput> {
  unicosParaInserir: T[]
  duplicadosIgnorados: T[]
  existentesParaReativarIds: string[]
  jaPendentesCount: number
}

/**
 * Normaliza texto para comparação determinística de deduplicação:
 * remove acentos, converte para caixa alta e colapsa espaços múltiplos.
 */
export function normalizarTextoDedup(valor: string | null | undefined): string {
  if (!valor) return ''
  return String(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Normaliza data para o formato canônico YYYY-MM-DD.
 */
export function normalizarDataDedup(data: string | null | undefined): string {
  if (!data) return ''
  const s = String(data).trim()
  if (!s) return ''
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10)
  const brMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (brMatch) {
    const [, dia, mes, ano] = brMatch
    return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`
  }
  return s.split('T')[0].split(' ')[0]
}

/**
 * Normaliza valor monetário em centavos inteiros para evitar imprecisão de ponto flutuante.
 */
export function normalizarValorCentavosDedup(valor: number | string | null | undefined): number {
  if (typeof valor === 'number') {
    return Number.isFinite(valor) ? Math.round(valor * 100) : 0
  }
  if (!valor) return 0
  const s = String(valor).trim()
  if (!s) return 0
  const limpo = s.includes(',') && s.includes('.')
    ? s.replace(/\./g, '').replace(',', '.')
    : s.replace(',', '.')
  const num = Number(limpo)
  return Number.isFinite(num) ? Math.round(num * 100) : 0
}

/**
 * Constrói a chave composta canônica de deduplicação para um título de Contas a Pagar:
 * (empresa_id, fornecedor, valor_centavos, vencimento, identificador_documento).
 *
 * Quando `doc` é NULL/vazio (ex.: notas sem sufixo de parcela no Datacar como NF 000003374,
 * NF 000001101 ou NF 000072553), utiliza `descricao` (onde fica o número da NF) para:
 * 1) Impedir reimportação duplicada do mesmo título mesmo com `doc IS NULL` no PostgreSQL;
 * 2) Permitir parcelas legítimas da mesma NF com vencimentos diferentes;
 * 3) Permitir notas fiscais diferentes (`descricao` distinta) do mesmo fornecedor no mesmo vencimento e valor.
 */
export function gerarChaveDedupContaPagar(item: ContaPagarChaveInput): string {
  const empresaId = String(item.empresa_id || '').trim().toLowerCase()
  const fornecedorNorm = normalizarTextoDedup(item.fornecedor)
  const valorCentavos = normalizarValorCentavosDedup(item.valor)
  const vencimentoNorm = normalizarDataDedup(item.vencimento)
  const docNorm = normalizarTextoDedup(item.doc)
  const descNorm = normalizarTextoDedup(item.descricao)

  const identificadorDoc =
    docNorm && descNorm
      ? `${docNorm}::${descNorm}`
      : docNorm || descNorm || '__SEM_DOC__'

  return `${empresaId}|${fornecedorNorm}|${valorCentavos}|${vencimentoNorm}|${identificadorDoc}`
}

/**
 * Verifica se um registro existente possui envio efetivamente confirmado na Conta Azul
 * (status 'enviado' ou `conta_azul_id` preenchido com UUID real) ou se exige reconciliação
 * manual devido a resposta ambígua/timeout de rede.
 */
export function possuiEnvioConfirmadoOuAmbiguo(existente: ContaPagarChaveInput): boolean {
  const statusNorm = String(existente.status || '').trim().toLowerCase()
  const caId = typeof existente.conta_azul_id === 'string' ? existente.conta_azul_id.trim() : ''
  if (caId && caId.toLowerCase() !== 'enviado') {
    return true
  }
  if (statusNorm === 'enviado') {
    return true
  }
  const erroMsg = String(existente.erro_mensagem || '')
  if (/RECONCILIA[CÇ][AÃ]O NECESS[AÁ]RIA/i.test(erroMsg)) {
    return true
  }
  return false
}

/**
 * Filtra de forma pura um lote de contas a pagar contra os registros já existentes no banco:
 * - Títulos inéditos entram em `unicosParaInserir`.
 * - Títulos já existentes com status `erro`/`cancelado` SEM confirmação de envio (`conta_azul_id` nulo)
 *   e SEM bloqueio de reconciliação ambígua entram em `existentesParaReativarIds` para voltar a `pendente`
 *   e permanecer disponíveis na fila de envio à Conta Azul (evitando duplicar linhas no banco local).
 * - Títulos já `pendente` permanecem disponíveis na fila local sem duplicar linha.
 * - Títulos cujo envio anterior à Conta Azul já está confirmado (`conta_azul_id` preenchido / status `enviado`)
 *   ou com reconciliação ambígua pendente são preservados em `duplicadosIgnorados` (idempotência).
 */
export function filtrarContasPagarNaoDuplicadas<T extends ContaPagarChaveInput>(
  novosItens: T[],
  existentesNoBanco: ContaPagarChaveInput[] = []
): ResultadoDedupContasPagar<T> {
  const mapaExistentes = new Map<string, ContaPagarChaveInput[]>()

  for (const existente of existentesNoBanco) {
    const chave = gerarChaveDedupContaPagar(existente)
    const lista = mapaExistentes.get(chave) || []
    lista.push(existente)
    mapaExistentes.set(chave, lista)
  }

  const chavesNovasVistas = new Set<string>()
  const unicosParaInserir: T[] = []
  const duplicadosIgnorados: T[] = []
  const reativarSet = new Set<string>()
  let jaPendentesCount = 0

  for (const item of novosItens) {
    const chave = gerarChaveDedupContaPagar(item)
    const existentes = mapaExistentes.get(chave)

    if (existentes && existentes.length > 0) {
      // Se já existe envio confirmado na Conta Azul ou resposta ambígua pendente, preserva controle de idempotência
      const confirmadoOuAmbiguo = existentes.some((e) => possuiEnvioConfirmadoOuAmbiguo(e))
      if (confirmadoOuAmbiguo) {
        duplicadosIgnorados.push(item)
        continue
      }

      // Se já existe um registro 'pendente' correspondente no banco, ele já está disponível na fila de envio
      const jaPendente = existentes.some(
        (e) => String(e.status || '').trim().toLowerCase() === 'pendente'
      )
      if (jaPendente) {
        jaPendentesCount++
        continue
      }

      // Registro existente não confirmado (ex.: status 'erro' sem conta_azul_id): reativar para 'pendente'
      const candidatoReativar = existentes.find((e) => e.id && !reativarSet.has(e.id))
      if (candidatoReativar?.id) {
        reativarSet.add(candidatoReativar.id)
      }
      continue
    }

    if (chavesNovasVistas.has(chave)) {
      duplicadosIgnorados.push(item)
    } else {
      chavesNovasVistas.add(chave)
      unicosParaInserir.push(item)
    }
  }

  return {
    unicosParaInserir,
    duplicadosIgnorados,
    existentesParaReativarIds: Array.from(reativarSet),
    jaPendentesCount,
  }
}

/**
 * Consulta os títulos já existentes da empresa nas datas de vencimento do lote,
 * reativa para `pendente` os registros locais com erro que ainda não foram enviados à Conta Azul,
 * e retorna os títulos inéditos para inserção.
 */
export async function deduplicarContasPagarContraBanco<T extends ContaPagarChaveInput>(
  supabaseClient: any,
  empresaId: string,
  itensParaSalvar: T[]
): Promise<ResultadoDedupContasPagar<T>> {
  if (!itensParaSalvar || itensParaSalvar.length === 0) {
    return { unicosParaInserir: [], duplicadosIgnorados: [], existentesParaReativarIds: [], jaPendentesCount: 0 }
  }

  const vencimentosUnicos = Array.from(
    new Set(itensParaSalvar.map((i) => normalizarDataDedup(i.vencimento)).filter(Boolean))
  )

  let query = supabaseClient
    .from('contas_pagar_importadas')
    .select('id, empresa_id, fornecedor, valor, vencimento, doc, descricao, status, conta_azul_id, erro_mensagem')
    .eq('empresa_id', empresaId)

  if (vencimentosUnicos.length > 0) {
    query = query.in('vencimento', vencimentosUnicos)
  }

  const { data: existentes, error } = await query
  if (error) throw error

  const resultado = filtrarContasPagarNaoDuplicadas(
    itensParaSalvar,
    (existentes || []) as ContaPagarChaveInput[]
  )

  if (resultado.existentesParaReativarIds.length > 0) {
    const { error: updateErr } = await supabaseClient
      .from('contas_pagar_importadas')
      .update({
        status: 'pendente',
        erro_mensagem: null,
      })
      .eq('empresa_id', empresaId)
      .in('id', resultado.existentesParaReativarIds)

    if (updateErr) throw updateErr
  }

  return resultado
}
