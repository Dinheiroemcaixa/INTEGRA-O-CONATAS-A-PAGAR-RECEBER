export interface ContaPagarChaveInput {
  empresa_id: string
  fornecedor: string
  valor: number | string
  vencimento: string
  doc?: string | null
  descricao?: string | null
}

export interface ResultadoDedupContasPagar<T extends ContaPagarChaveInput> {
  unicosParaInserir: T[]
  duplicadosIgnorados: T[]
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
 * Filtra de forma pura um lote de contas a pagar contra os registros já existentes no banco
 * (independentemente de status: pendente, erro ou enviado) e também remove duplicatas
 * internas dentro do próprio lote enviado.
 */
export function filtrarContasPagarNaoDuplicadas<T extends ContaPagarChaveInput>(
  novosItens: T[],
  existentesNoBanco: ContaPagarChaveInput[] = []
): ResultadoDedupContasPagar<T> {
  const chavesVistas = new Set<string>()

  for (const existente of existentesNoBanco) {
    chavesVistas.add(gerarChaveDedupContaPagar(existente))
  }

  const unicosParaInserir: T[] = []
  const duplicadosIgnorados: T[] = []

  for (const item of novosItens) {
    const chave = gerarChaveDedupContaPagar(item)
    if (chavesVistas.has(chave)) {
      duplicadosIgnorados.push(item)
    } else {
      chavesVistas.add(chave)
      unicosParaInserir.push(item)
    }
  }

  return { unicosParaInserir, duplicadosIgnorados }
}

/**
 * Consulta os títulos já existentes da empresa nas datas de vencimento do lote e
 * retorna apenas os títulos inéditos, prevenindo duplicatas mesmo quando `doc` é NULL.
 */
export async function deduplicarContasPagarContraBanco<T extends ContaPagarChaveInput>(
  supabaseClient: any,
  empresaId: string,
  itensParaSalvar: T[]
): Promise<ResultadoDedupContasPagar<T>> {
  if (!itensParaSalvar || itensParaSalvar.length === 0) {
    return { unicosParaInserir: [], duplicadosIgnorados: [] }
  }

  const vencimentosUnicos = Array.from(
    new Set(itensParaSalvar.map((i) => normalizarDataDedup(i.vencimento)).filter(Boolean))
  )

  let query = supabaseClient
    .from('contas_pagar_importadas')
    .select('empresa_id, fornecedor, valor, vencimento, doc, descricao')
    .eq('empresa_id', empresaId)

  if (vencimentosUnicos.length > 0) {
    query = query.in('vencimento', vencimentosUnicos)
  }

  const { data: existentes, error } = await query
  if (error) throw error

  return filtrarContasPagarNaoDuplicadas(itensParaSalvar, (existentes || []) as ContaPagarChaveInput[])
}
