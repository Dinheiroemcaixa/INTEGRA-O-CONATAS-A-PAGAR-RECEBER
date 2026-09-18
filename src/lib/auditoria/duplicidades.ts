import { SupabaseClient } from '@supabase/supabase-js'
import { normalizarTexto } from './consistencia'

export interface DuplicidadesOptions {
  empresa_id: string
  periodo?: '3m' | '6m' | '12m' | 'todos'
  tolerancia_dias?: number // Default: 3
}

export interface LancamentoDuplicadoItem {
  id: string
  doc: string | null
  descricao: string | null
  vencimento: string | null
  valor: number
  categoria: string | null
  status: string | null
}

export interface GrupoDuplicidade {
  id: string
  fornecedor: string
  criterio: 'DOC_E_VALOR_IDENTICOS' | 'VALOR_E_DATA_IDENTICOS' | 'INTERVALO_PROXIMO'
  criticidade: 'CRITICA' | 'ALTA' | 'ATENCAO'
  motivo: string
  valor_referencia: number
  valor_excedente_risco: number
  itens: LancamentoDuplicadoItem[]
}

export interface DuplicidadesResult {
  resumo: {
    total_lancamentos_avaliados: number
    total_grupos_duplicidade: number
    total_lancamentos_sob_suspeita: number
    valor_total_em_risco_duplicidade: number
  }
  grupos: GrupoDuplicidade[]
}

function diffDias(d1: string | null, d2: string | null): number {
  if (!d1 || !d2) return 999
  const t1 = new Date(d1).getTime()
  const t2 = new Date(d2).getTime()
  if (isNaN(t1) || isNaN(t2)) return 999
  return Math.abs(Math.floor((t1 - t2) / (1000 * 60 * 60 * 24)))
}

export async function executarDuplicidades(
  supabase: SupabaseClient,
  options: DuplicidadesOptions
): Promise<DuplicidadesResult> {
  const { empresa_id, periodo = '6m', tolerancia_dias = 3 } = options

  const hoje = new Date()
  let dataInicio: Date | null = null
  if (periodo === '3m') {
    dataInicio = new Date()
    dataInicio.setMonth(hoje.getMonth() - 3)
  } else if (periodo === '6m') {
    dataInicio = new Date()
    dataInicio.setMonth(hoje.getMonth() - 6)
  } else if (periodo === '12m') {
    dataInicio = new Date()
    dataInicio.setMonth(hoje.getMonth() - 12)
  }

  let query = supabase
    .from('contas_pagar_importadas')
    .select('id, fornecedor, doc, descricao, vencimento, valor, categoria, status')
    .eq('empresa_id', empresa_id)

  if (dataInicio) {
    query = query.gte('vencimento', dataInicio.toISOString().split('T')[0])
  }

  const { data: lancamentosRaw, error } = await query
  if (error) {
    throw new Error(`Erro ao buscar lançamentos para duplicidades: ${error.message}`)
  }

  const lancamentos = (lancamentosRaw || []).filter(
    (l) => l.fornecedor && Number(l.valor) > 0
  )

  // Agrupar primeiro por fornecedor normalizado
  const porFornecedor = new Map<string, typeof lancamentos>()
  for (const l of lancamentos) {
    const norm = normalizarTexto(l.fornecedor)
    if (!norm) continue
    const list = porFornecedor.get(norm) || []
    list.push(l)
    porFornecedor.set(norm, list)
  }

  const gruposDuplicados: GrupoDuplicidade[] = []
  const idsJaAgrupados = new Set<string>()

  let valorTotalRisco = 0
  let totalSobSuspeita = 0

  for (const [fornecedorNorm, items] of porFornecedor.entries()) {
    if (items.length < 2) continue

    // 1. Identificar Duplicidade Tipo A: Mesmo doc e mesmo valor (centavos exatos)
    const porDocEValor = new Map<string, typeof items>()
    for (const item of items) {
      if (!item.doc || item.doc.trim().length === 0) continue
      const docClean = normalizarTexto(item.doc).replace(/[^A-Z0-9]/g, '')
      if (docClean.length < 2) continue

      const chave = `${docClean}_${Number(item.valor).toFixed(2)}`
      const list = porDocEValor.get(chave) || []
      list.push(item)
      porDocEValor.set(chave, list)
    }

    for (const [chave, list] of porDocEValor.entries()) {
      if (list.length > 1) {
        const valRef = Number(list[0].valor)
        const excedente = valRef * (list.length - 1)
        valorTotalRisco += excedente
        totalSobSuspeita += list.length

        gruposDuplicados.push({
          id: `dup-doc-${chave}`,
          fornecedor: list[0].fornecedor,
          criterio: 'DOC_E_VALOR_IDENTICOS',
          criticidade: 'CRITICA',
          motivo: `Mesmo Fornecedor, mesmo Documento/NF (${list[0].doc}) e valor idêntico (R$ ${valRef.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}).`,
          valor_referencia: valRef,
          valor_excedente_risco: excedente,
          itens: list.map((i) => ({
            id: i.id,
            doc: i.doc,
            descricao: i.descricao,
            vencimento: i.vencimento,
            valor: Number(i.valor),
            categoria: i.categoria,
            status: i.status
          }))
        })
        list.forEach((i) => idsJaAgrupados.add(i.id))
      }
    }

    // 2. Identificar Duplicidade Tipo B: Mesmo valor e datas próximas (tolerância_dias)
    const itensRestantes = items.filter((i) => !idsJaAgrupados.has(i.id))
    for (let i = 0; i < itensRestantes.length; i++) {
      const a = itensRestantes[i]
      if (idsJaAgrupados.has(a.id)) continue

      const grupoProximo: typeof items = [a]

      for (let j = i + 1; j < itensRestantes.length; j++) {
        const b = itensRestantes[j]
        if (idsJaAgrupados.has(b.id)) continue

        const diffVal = Math.abs(Number(a.valor) - Number(b.valor))
        // Tolerância de centavos
        if (diffVal <= 0.05) {
          const dias = diffDias(a.vencimento, b.vencimento)
          if (dias <= tolerancia_dias) {
            grupoProximo.push(b)
          }
        }
      }

      if (grupoProximo.length > 1) {
        const valRef = Number(grupoProximo[0].valor)
        const excedente = valRef * (grupoProximo.length - 1)
        valorTotalRisco += excedente
        totalSobSuspeita += grupoProximo.length

        const mesmoVencimento = grupoProximo.every(
          (g) => g.vencimento === grupoProximo[0].vencimento
        )

        gruposDuplicados.push({
          id: `dup-data-${a.id}`,
          fornecedor: a.fornecedor,
          criterio: mesmoVencimento ? 'VALOR_E_DATA_IDENTICOS' : 'INTERVALO_PROXIMO',
          criticidade: mesmoVencimento ? 'ALTA' : 'ATENCAO',
          motivo: mesmoVencimento
            ? `Mesmo Fornecedor, mesmo Vencimento e valor idêntico (R$ ${valRef.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}).`
            : `Mesmo Fornecedor, mesmo valor e vencimentos próximos (intervalo $\le$ ${tolerancia_dias} dias).`,
          valor_referencia: valRef,
          valor_excedente_risco: excedente,
          itens: grupoProximo.map((g) => ({
            id: g.id,
            doc: g.doc,
            descricao: g.descricao,
            vencimento: g.vencimento,
            valor: Number(g.valor),
            categoria: g.categoria,
            status: g.status
          }))
        })

        grupoProximo.forEach((g) => idsJaAgrupados.add(g.id))
      }
    }
  }

  // Ordenar grupos por criticidade (CRITICA > ALTA > ATENCAO) e valor excedente
  const ordemCrit: Record<string, number> = { CRITICA: 3, ALTA: 2, ATENCAO: 1 }
  gruposDuplicados.sort((a, b) => {
    const dCrit = ordemCrit[b.criticidade] - ordemCrit[a.criticidade]
    if (dCrit !== 0) return dCrit
    return b.valor_excedente_risco - a.valor_excedente_risco
  })

  return {
    resumo: {
      total_lancamentos_avaliados: lancamentos.length,
      total_grupos_duplicidade: gruposDuplicados.length,
      total_lancamentos_sob_suspeita: totalSobSuspeita,
      valor_total_em_risco_duplicidade: valorTotalRisco
    },
    grupos: gruposDuplicados
  }
}
