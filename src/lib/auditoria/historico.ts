import { SupabaseClient } from '@supabase/supabase-js'

export interface HistoricoOptions {
  empresa_id: string
}

export interface MesHistoricoAudit {
  mes_ano: string // 'YYYY-MM'
  mes_label: string // 'Mês/Ano'
  total_lancamentos: number
  valor_total: number
  total_enviados: number
  total_pendentes: number
  total_outros: number
  taxa_aprovacao_percentual: number
}

export interface HistoricoResult {
  fonte_dados: 'CONTA_AZUL_ESPELHO' | 'IMPORTADAS_LOCAL'
  resumo_geral: {
    total_lancamentos_empresa: number
    valor_total_historico: number
    total_fornecedores_unicos: number
    total_regras_depara_ativas: number
    total_fornecedores_com_categoria_padrao: number
    indice_maturidade_cadastral: number // 0 a 100
  }
  evolucao_mensal: MesHistoricoAudit[]
  distribuicao_status: {
    status: string
    quantidade: number
    valor_total: number
    percentual: number
  }[]
}

const MESES_PT = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
]

export async function executarHistorico(
  supabase: SupabaseClient,
  options: HistoricoOptions
): Promise<HistoricoResult> {
  const { empresa_id } = options

  // 1. Consulta prioritária na tabela espelho
  let fonteUtilizada: 'CONTA_AZUL_ESPELHO' | 'IMPORTADAS_LOCAL' = 'CONTA_AZUL_ESPELHO'
  let itens: Array<{
    vencimento: string | null
    valor: number
    status: string | null
    fornecedor: string | null
    categoria: string | null
  }> = []

  const { data: dadosEspelho, error: errEspelho } = await supabase
    .from('contas_pagar_contaazul_espelho')
    .select('data_vencimento, valor, status, fornecedor_nome, categoria_nome')
    .eq('empresa_id', empresa_id)

  if (!errEspelho && dadosEspelho && dadosEspelho.length > 0) {
    fonteUtilizada = 'CONTA_AZUL_ESPELHO'
    itens = dadosEspelho.map((d) => ({
      vencimento: d.data_vencimento,
      valor: Number(d.valor || 0),
      status: d.status,
      fornecedor: d.fornecedor_nome,
      categoria: d.categoria_nome
    }))
  } else {
    // Fallback para contas_pagar_importadas
    fonteUtilizada = 'IMPORTADAS_LOCAL'
    const { data: dadosImportadas, error: errImportadas } = await supabase
      .from('contas_pagar_importadas')
      .select('vencimento, valor, status, fornecedor, categoria')
      .eq('empresa_id', empresa_id)

    if (errImportadas) {
      throw new Error(`Erro ao buscar histórico de auditoria: ${errImportadas.message}`)
    }

    itens = (dadosImportadas || []).map((d) => ({
      vencimento: d.vencimento,
      valor: Number(d.valor || 0),
      status: d.status,
      fornecedor: d.fornecedor,
      categoria: d.categoria
    }))
  }

  // 2. Buscar contagem de depara cadastrados
  const { count: countDepara } = await supabase
    .from('fornecedor_depara')
    .select('*', { count: 'exact', head: true })
    .eq('empresa_id', empresa_id)

  // 3. Buscar fornecedores cadastrados no Conta Azul com categoria padrão
  const { data: caFornecedores } = await supabase
    .from('fornecedores_contaazul')
    .select('categoria_padrao')
    .eq('empresa_id', empresa_id)

  const comCatPadrao = (caFornecedores || []).filter((f) => !!f.categoria_padrao).length

  let valorTotal = 0
  const fornecedoresUnicos = new Set<string>()

  const mapaMensal = new Map<
    string,
    {
      mesAno: string
      label: string
      total: number
      valor: number
      enviados: number
      pendentes: number
      outros: number
    }
  >()

  const mapaStatus = new Map<string, { count: number; valor: number }>()

  for (const item of itens) {
    const val = item.valor
    valorTotal += val

    if (item.fornecedor) {
      fornecedoresUnicos.add(item.fornecedor.trim().toUpperCase())
    }

    const st = (item.status || 'pendente').toLowerCase()
    const prevSt = mapaStatus.get(st) || { count: 0, valor: 0 }
    prevSt.count++
    prevSt.valor += val
    mapaStatus.set(st, prevSt)

    if (item.vencimento) {
      const ym = item.vencimento.substring(0, 7)
      if (ym.length === 7) {
        let mData = mapaMensal.get(ym)
        if (!mData) {
          const [ano, mes] = ym.split('-')
          const mesNum = parseInt(mes, 10) - 1
          const label = `${MESES_PT[mesNum] || mes}/${ano}`
          mData = {
            mesAno: ym,
            label,
            total: 0,
            valor: 0,
            enviados: 0,
            pendentes: 0,
            outros: 0
          }
          mapaMensal.set(ym, mData)
        }
        mData.total++
        mData.valor += val
        if (st === 'pago' || st === 'concluido' || st === 'enviado') {
          mData.enviados++
        } else if (st === 'pendente' || st === 'aberto') {
          mData.pendentes++
        } else {
          mData.outros++
        }
      }
    }
  }

  const chavesMeses = Array.from(mapaMensal.keys()).sort()
  const ultimosMeses = chavesMeses.slice(-12).map((k) => {
    const m = mapaMensal.get(k)!
    const taxa = m.total > 0 ? Math.round((m.enviados / m.total) * 100) : 0
    return {
      mes_ano: m.mesAno,
      mes_label: m.label,
      total_lancamentos: m.total,
      valor_total: m.valor,
      total_enviados: m.enviados,
      total_pendentes: m.pendentes,
      total_outros: m.outros,
      taxa_aprovacao_percentual: taxa
    }
  })

  const distStatus = Array.from(mapaStatus.entries()).map(([status, d]) => ({
    status: status.toUpperCase(),
    quantidade: d.count,
    valor_total: d.valor,
    percentual: itens.length > 0 ? Math.round((d.count / itens.length) * 100) : 0
  }))
  distStatus.sort((a, b) => b.quantidade - a.quantidade)

  const pctEnviados =
    itens.length > 0
      ? (((mapaStatus.get('pago')?.count || 0) + (mapaStatus.get('enviado')?.count || 0)) / itens.length) * 50
      : 0
  const pctCatPadrao =
    (caFornecedores || []).length > 0
      ? (comCatPadrao / (caFornecedores || []).length) * 30
      : 15
  const pctDepara = Math.min((countDepara || 0) * 2, 20)
  const indiceMaturidade = Math.min(Math.round(pctEnviados + pctCatPadrao + pctDepara), 100)

  return {
    fonte_dados: fonteUtilizada,
    resumo_geral: {
      total_lancamentos_empresa: itens.length,
      valor_total_historico: valorTotal,
      total_fornecedores_unicos: fornecedoresUnicos.size,
      total_regras_depara_ativas: countDepara || 0,
      total_fornecedores_com_categoria_padrao: comCatPadrao,
      indice_maturidade_cadastral: indiceMaturidade
    },
    evolucao_mensal: ultimosMeses,
    distribuicao_status: distStatus
  }
}
