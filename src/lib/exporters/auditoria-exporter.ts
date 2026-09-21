import ExcelJS from 'exceljs'
import type { ConsistenciaResult } from '@/lib/auditoria'

/**
 * Exporta os resultados da auditoria de consistência em formato Excel (.xlsx)
 * com múltiplas abas: Resumo Executivo, Divergências, Pendentes e Validados.
 */
export async function exportarAuditoriaExcel(
  resultado: ConsistenciaResult,
  nomeEmpresa: string = 'Empresa'
): Promise<Blob> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Connecta AI'
  workbook.created = new Date()

  // 1. ABA RESUMO EXECUTIVO
  const wsResumo = workbook.addWorksheet('Resumo Executivo')
  wsResumo.columns = [
    { header: 'Indicador de Governança', key: 'indicador', width: 40 },
    { header: 'Valor / Quantidade', key: 'valor', width: 25 },
    { header: 'Observação', key: 'obs', width: 45 }
  ]

  const resumoRows = [
    { indicador: 'Empresa', valor: nomeEmpresa, obs: 'Base de Auditoria Financeira' },
    { indicador: 'Data da Auditoria', valor: new Date().toLocaleDateString('pt-BR'), obs: new Date().toLocaleTimeString('pt-BR') },
    { indicador: 'Total de Lançamentos Auditados', valor: resultado.resumo.total_lancamentos_auditados, obs: 'Contas analisadas no período' },
    { indicador: 'Total de Fornecedores Auditados', valor: resultado.resumo.total_fornecedores_auditados, obs: 'Parceiros comerciais distintos' },
    { indicador: 'Fornecedores Validados (Homologados)', valor: resultado.fornecedores_validados?.length || 0, obs: '100% conformes com regras ativas' },
    { indicador: 'Fornecedores Pendentes de Homologação', valor: resultado.fornecedores_pendentes?.length || 0, obs: 'Aguardam validação humana' },
    { indicador: 'Fornecedores com Inconsistências', valor: resultado.resumo.fornecedores_com_divergencia, obs: 'Lançamentos divergentes da regra' },
    { indicador: 'Valor Total Auditado (R$)', valor: resultado.resumo.valor_total_auditado.toFixed(2), obs: 'Montante total do período' },
    { indicador: 'Valor Total Divergente / Em Risco (R$)', valor: resultado.resumo.valor_total_divergente.toFixed(2), obs: 'Impacto financeiro com anomalias' },
    { indicador: 'Taxa de Conformidade Cadastral (%)', valor: `${resultado.resumo.taxa_conformidade_cadastral}%`, obs: 'Índice de governança contábil' },
    { indicador: 'Risco Financeiro (%)', valor: `${resultado.resumo.percentual_risco_financeiro}%`, obs: 'Percentual do valor sob risco' }
  ]

  wsResumo.addRows(resumoRows)
  wsResumo.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  wsResumo.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }

  // 2. ABA DIVERGÊNCIAS DETECTADAS
  const wsDiverg = workbook.addWorksheet('Inconsistências')
  wsDiverg.columns = [
    { header: 'Fornecedor', key: 'fornecedor', width: 35 },
    { header: 'Documento', key: 'doc', width: 18 },
    { header: 'Vencimento', key: 'vencimento', width: 15 },
    { header: 'Valor (R$)', key: 'valor', width: 18 },
    { header: 'Categoria Atual', key: 'cat_atual', width: 25 },
    { header: 'Categoria Esperada', key: 'cat_esperada', width: 25 },
    { header: 'Criticidade', key: 'criticidade', width: 15 },
    { header: 'Motivo Técnico / Regra', key: 'motivo', width: 50 }
  ]

  resultado.fornecedores_divergentes.forEach((forn) => {
    forn.divergencias.forEach((div) => {
      wsDiverg.addRow({
        fornecedor: forn.fornecedor_original,
        doc: div.doc || 'S/N',
        vencimento: div.vencimento || 'Sem data',
        valor: div.valor,
        cat_atual: div.categoria_atual,
        cat_esperada: div.categoria_esperada,
        criticidade: div.criticidade,
        motivo: div.motivo
      })
    })
  })
  wsDiverg.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  wsDiverg.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE11D48' } }

  // 3. ABA PENDENTES DE HOMOLOGAÇÃO
  const wsPend = workbook.addWorksheet('Pendentes de Homologação')
  wsPend.columns = [
    { header: 'Fornecedor', key: 'fornecedor', width: 35 },
    { header: 'Lançamentos', key: 'total_lancamentos', width: 16 },
    { header: 'Valor Total (R$)', key: 'total_valor', width: 20 },
    { header: 'Categoria Sugerida (IA)', key: 'categoria_predominante', width: 28 },
    { header: 'Confiança (%)', key: 'confianca_percentual', width: 16 }
  ]

  resultado.fornecedores_pendentes?.forEach((p) => {
    wsPend.addRow({
      fornecedor: p.fornecedor_original,
      total_lancamentos: p.total_lancamentos,
      total_valor: p.total_valor,
      categoria_predominante: p.categoria_predominante,
      confianca_percentual: `${p.confianca_percentual}%`
    })
  })
  wsPend.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  wsPend.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD97706' } }

  // 4. ABA VALIDADOS
  const wsVal = workbook.addWorksheet('Validados')
  wsVal.columns = [
    { header: 'Fornecedor', key: 'fornecedor', width: 35 },
    { header: 'Categoria Homologada', key: 'categoria', width: 28 },
    { header: 'Tipo da Regra', key: 'tipo_regra', width: 18 },
    { header: 'Lançamentos Auditados', key: 'total_lancamentos', width: 20 },
    { header: 'Valor Auditado (R$)', key: 'total_valor', width: 20 },
    { header: 'Status', key: 'status', width: 20 }
  ]

  resultado.fornecedores_validados?.forEach((v) => {
    wsVal.addRow({
      fornecedor: v.fornecedor_original,
      categoria: v.categoria_predominante,
      tipo_regra: v.regra_ativa?.tipo_regra || 'PADRAO',
      total_lancamentos: v.total_lancamentos,
      total_valor: v.total_valor,
      status: 'HOMOLOGADO (100%)'
    })
  })
  wsVal.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  wsVal.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } }

  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
}

/**
 * Exporta a lista de divergências e resumo em formato CSV padronizado
 */
export function exportarAuditoriaCSV(
  resultado: ConsistenciaResult,
  nomeEmpresa: string = 'Empresa'
): Blob {
  const cabecalhos = [
    'Fornecedor',
    'Documento',
    'Vencimento',
    'Valor (R$)',
    'Categoria Atual',
    'Categoria Esperada',
    'Criticidade',
    'Motivo Tecnico'
  ]

  const linhas: string[] = [cabecalhos.join(';')]

  resultado.fornecedores_divergentes.forEach((forn) => {
    forn.divergencias.forEach((div) => {
      const linha = [
        `"${forn.fornecedor_original.replace(/"/g, '""')}"`,
        `"${(div.doc || 'S/N').replace(/"/g, '""')}"`,
        div.vencimento || '',
        div.valor.toFixed(2).replace('.', ','),
        `"${div.categoria_atual.replace(/"/g, '""')}"`,
        `"${div.categoria_esperada.replace(/"/g, '""')}"`,
        div.criticidade,
        `"${div.motivo.replace(/"/g, '""')}"`
      ]
      linhas.push(linha.join(';'))
    })
  })

  const csvContent = linhas.join('\r\n')
  // Adiciona BOM para correta interpretação de acentuação no Excel pt-BR
  return new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
}

/**
 * Dispara o download de um arquivo no navegador
 */
export function baixarArquivo(blob: Blob, nomeArquivo: string) {
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.URL.revokeObjectURL(url)
}
