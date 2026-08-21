/**
 * Exportador: gera o "Relatório Financeiro – Pagamentos BPO" (Excel Geral)
 * de um Grupo com Tabelas Nativas do Excel (ws.addTable), colunas com largura compacta
 * para que a coluna Saldo Final (Coluna G) apareça 100% visível na tela sem rolagem.
 */
import ExcelJS from 'exceljs'

export interface PagamentoRelatorio {
  origem: 'DDA' | 'Folha' | 'Agendamento' | 'Transferência' | 'Transferência Recebida'
  fornecedor?: string | null
  beneficiario?: string | null
  descricao?: string | null
  documento?: string | null
  data_vencimento: string
  data_pagamento?: string | null
  valor: number
  status?: string | null
}

export interface LojaRelatorio {
  nome: string
  pagamentos: PagamentoRelatorio[]
  saldoInicial?: number
  periodoLabel?: string
}

const FMT_MOEDA = '"R$"#,##0.00'

const ORDEM_TIPO: Record<PagamentoRelatorio['origem'], number> = {
  'DDA': 0,
  'Folha': 1,
  'Agendamento': 2,
  'Transferência': 3,
  'Transferência Recebida': 4,
}

const COR_NAVY = 'FF1F4E78'
const COR_TOTAL = 'FFE7E6E6'
const COR_SECAO = 'FFD9E1F2'
const COR_VERDE = 'FF006100'
const COR_VERDE_TEXTO = 'FF008000'
const COR_VERMELHO = 'FF9C0006'
const COR_CINZA_TEXTO = 'FF555555'
const COR_BORDA = 'FFD9D9D9'

function formatarDataHoraAgora(): string {
  return new Date().toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function formatarDataBr(iso: string): string {
  if (!iso) return ''
  const partes = iso.split('T')[0].split('-')
  if (partes.length !== 3) return iso
  const [ano, mes, dia] = partes
  return `${dia}/${mes}/${ano}`
}

function converterDatasTextoParaBr(texto: string): string {
  if (!texto) return ''
  // 1. Converte AAAA-MM-DD -> DD/MM/AAAA
  let s = texto.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, '$3/$2/$1')
  // 2. Converte AAAA/MM/DD -> DD/MM/AAAA
  s = s.replace(/\b(\d{4})\/(\d{2})\/(\d{2})\b/g, '$3/$2/$1')
  // 3. Converte AA/MM/DD (onde AA é ano ex: 24, 25, 26) -> DD/MM/20AA
  s = s.replace(/\b(\d{2})\/(\d{2})\/(\d{2})\b/g, (match, p1, p2, p3) => {
    const ano = Number(p1)
    const dia = Number(p3)
    if (ano >= 20 && ano <= 40 && dia >= 1 && dia <= 31) {
      return `${p3}/${p2}/20${p1}`
    }
    return match
  })
  return s
}

function fillSolido(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } }
}

const borderFina: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: COR_BORDA } },
  left: { style: 'thin', color: { argb: COR_BORDA } },
  bottom: { style: 'thin', color: { argb: COR_BORDA } },
  right: { style: 'thin', color: { argb: COR_BORDA } },
}

export async function construirWorkbookRelatorioGeral(nomeGrupo: string, lojas: LojaRelatorio[]): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Dinheiro em Caixa BPO'
  wb.created = new Date()

  const ws = wb.addWorksheet('Relatório Financeiro', {
    views: [{ showGridLines: true }],
  })

  // Larguras compactas e proporcionalmente ajustadas (Total: 138) para que Saldo Final (Coluna G) apareça na tela
  ws.columns = [
    { width: 20 }, // A: Loja / Saldo Inicial | Tipo
    { width: 22 }, // B: DDA | Beneficiário
    { width: 34 }, // C: Folha | Descrição
    { width: 16 }, // D: Agendamento | Data Vencimento
    { width: 16 }, // E: Transferência | Valor
    { width: 16 }, // F: Total Despesas | Situação
    { width: 16 }, // G: Saldo Final
  ]

  ws.mergeCells('A1:G1')
  const tituloCell = ws.getCell('A1')
  tituloCell.value = `Relatório Financeiro – Pagamentos BPO (Grupo: ${nomeGrupo})`
  tituloCell.font = { bold: true, size: 14 }
  ws.getRow(1).height = 24

  ws.mergeCells('A2:G2')
  const geradoCell = ws.getCell('A2')
  geradoCell.value = `Gerado em: ${formatarDataHoraAgora()}`
  geradoCell.font = { color: { argb: COR_CINZA_TEXTO }, size: 10 }

  ws.addRow([])

  // --- TABELA RESUMO (NATIVA DO EXCEL DE 7 COLUNAS A..G) ---
  const resumoRows: (string | number)[][] = []

  const resumo = lojas.map(loja => {
    const soma = (origem: PagamentoRelatorio['origem']) =>
      loja.pagamentos.filter(p => p.origem === origem).reduce((acc, p) => acc + Number(p.valor || 0), 0)
    const dda = soma('DDA')
    const folha = soma('Folha')
    const agendamento = soma('Agendamento')
    const transferencia = soma('Transferência')
    const entradas = soma('Transferência Recebida')
    const saldoInicial = Number(loja.saldoInicial || 0)
    const totalDespesas = dda + folha + agendamento + transferencia
    const saldoFinal = saldoInicial - totalDespesas + entradas

    const saldoInicialFmt = saldoInicial.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const nomeLojaFmt = `${loja.nome}\nR$ ${saldoInicialFmt}`

    resumoRows.push([
      nomeLojaFmt,
      dda,
      folha,
      agendamento,
      transferencia,
      totalDespesas,
      saldoFinal,
    ])

    return { nome: loja.nome, dda, folha, agendamento, transferencia, totalDespesas, saldoFinal, saldoInicial }
  })

  const startRowResumo = 4
  const endRowResumo = startRowResumo + resumoRows.length

  ws.addTable({
    name: 'Tabela_Resumo_Geral',
    ref: `A${startRowResumo}:G${endRowResumo}`,
    headerRow: true,
    totalsRow: false,
    style: {
      theme: 'TableStyleMedium2',
      showRowStripes: true,
    },
    columns: [
      { name: 'Loja / Saldo Inicial', filterButton: true },
      { name: 'DDA', filterButton: true },
      { name: 'Folha', filterButton: true },
      { name: 'Agendamento', filterButton: true },
      { name: 'Transferência', filterButton: true },
      { name: 'Total Despesas', filterButton: true },
      { name: 'Saldo Final', filterButton: true },
    ],
    rows: resumoRows,
  })

  // Estilização das células da tabela de resumo
  for (let r = startRowResumo + 1; r <= endRowResumo; r++) {
    const row = ws.getRow(r)
    row.height = 32 // Altura ampla para acomodar Nome + Saldo Inicial
    const rIndex = r - startRowResumo - 1
    const item = resumo[rIndex]
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.border = borderFina
      if (colNumber === 1) {
        cell.alignment = { wrapText: true, vertical: 'middle' }
      } else if (colNumber >= 2 && colNumber <= 7) {
        cell.numFmt = FMT_MOEDA
        cell.alignment = { vertical: 'middle', horizontal: 'center' }
      }
      if (colNumber === 7 && item) {
        cell.font = { bold: true, color: { argb: item.saldoFinal < 0 ? COR_VERMELHO : COR_VERDE } }
      }
    })
  }

  // Linha de TOTAL GERAL
  const totalGeral = resumo.reduce(
    (acc, r) => ({
      dda: acc.dda + r.dda,
      folha: acc.folha + r.folha,
      agendamento: acc.agendamento + r.agendamento,
      transferencia: acc.transferencia + r.transferencia,
      totalDespesas: acc.totalDespesas + r.totalDespesas,
    }),
    { dda: 0, folha: 0, agendamento: 0, transferencia: 0, totalDespesas: 0 }
  )
  const totalRow = ws.addRow(['TOTAL GERAL', totalGeral.dda, totalGeral.folha, totalGeral.agendamento, totalGeral.transferencia, totalGeral.totalDespesas, ''])
  totalRow.height = 24
  totalRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    cell.fill = fillSolido(COR_TOTAL)
    cell.font = { bold: true }
    cell.border = borderFina
    if (colNumber >= 2 && colNumber <= 6) {
      cell.numFmt = FMT_MOEDA
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
    }
  })

  ws.addRow([])
  const detalhadoRow = ws.addRow(['DETALHADO'])
  detalhadoRow.getCell(1).font = { bold: true, size: 14, color: { argb: COR_NAVY } }

  // --- SEÇÃO DETALHADO (TABELAS NATIVAS DO EXCEL POR LOJA) ---
  let tabelaIndex = 1
  for (const loja of lojas) {
    ws.addRow([])

    const secaoRowNum = ws.rowCount + 1
    const tituloSecao = loja.periodoLabel ? `${loja.nome} — Período: ${loja.periodoLabel}` : loja.nome
    const secaoRow = ws.addRow([tituloSecao])
    ws.mergeCells(`A${secaoRowNum}:G${secaoRowNum}`)
    secaoRow.height = 24
    secaoRow.eachCell({ includeEmpty: true }, cell => {
      cell.fill = fillSolido(COR_SECAO)
      cell.font = { bold: true, size: 11, color: { argb: 'FF102A43' } }
      cell.alignment = { vertical: 'middle', horizontal: 'left' }
      cell.border = borderFina
    })

    if (loja.pagamentos.length === 0) {
      const vaziRow = ws.addRow(['Sem lançamentos no período', '—', '—', '—', 0, '—'])
      vaziRow.getCell(1).font = { italic: true, color: { argb: COR_CINZA_TEXTO } }
      continue
    }

    const pagamentosOrdenados = [...loja.pagamentos].sort(
      (a, b) => (ORDEM_TIPO[a.origem] ?? 99) - (ORDEM_TIPO[b.origem] ?? 99)
    )

    const tableRowsData: (string | number)[][] = []
    const infoRows: { isTransfRecebida: boolean }[] = []

    pagamentosOrdenados.forEach((p) => {
      const isTransfRecebida = p.origem === 'Transferência Recebida'
      const tipoLabel =
        p.origem === 'DDA' ? 'DDA' :
        p.origem === 'Folha' ? 'FOLHA' :
        isTransfRecebida ? 'TRANSF. RECEBIDA' :
        p.origem
      const beneficiario = p.fornecedor || p.beneficiario || '—'
      let descricaoBruta = p.descricao
        ? (p.documento ? `${p.descricao} - Doc: ${p.documento}` : p.descricao)
        : (p.documento ? `Doc: ${p.documento}` : '—')

      // Converte datas no formato YYYY-MM-DD ou AA/MM/DD contidas no texto da descrição para DD/MM/AAAA
      const descricaoFmt = converterDatasTextoParaBr(descricaoBruta)

      // Se for Transferência Recebida: sem situação (""), escrita em verde
      const situacao = isTransfRecebida ? '' : (p.status === 'agendado' ? 'Agendado' : 'Em Aberto')
      const dataVenc = formatarDataBr(p.data_vencimento || p.data_pagamento || '')

      tableRowsData.push([
        tipoLabel,
        beneficiario,
        descricaoFmt,
        dataVenc,
        Number(p.valor || 0),
        situacao,
      ])
      infoRows.push({ isTransfRecebida })
    })

    const startRowTable = ws.rowCount + 1
    const endRowTable = startRowTable + tableRowsData.length

    // Criação da Tabela Nativa do Excel para cada loja
    ws.addTable({
      name: `Tabela_Loja_${tabelaIndex++}`,
      ref: `A${startRowTable}:F${endRowTable}`,
      headerRow: true,
      totalsRow: false,
      style: {
        theme: 'TableStyleMedium2',
        showRowStripes: true,
      },
      columns: [
        { name: 'Tipo', filterButton: true },
        { name: 'Beneficiário', filterButton: true },
        { name: 'Descrição', filterButton: true },
        { name: 'Data Vencimento', filterButton: true },
        { name: 'Valor', filterButton: true },
        { name: 'Situação', filterButton: true },
      ],
      rows: tableRowsData,
    })

    // Estilização das linhas de dados da tabela
    for (let r = startRowTable + 1; r <= endRowTable; r++) {
      const row = ws.getRow(r)
      const rIdx = r - startRowTable - 1
      const info = infoRows[rIdx]

      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.border = borderFina

        if (info?.isTransfRecebida) {
          cell.font = { color: { argb: COR_VERDE_TEXTO }, bold: true }
        }

        if (colNumber === 1) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' }
        } else if (colNumber === 2 || colNumber === 3) {
          cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
        } else if (colNumber === 4 || colNumber === 6) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' }
        } else if (colNumber === 5) {
          cell.numFmt = FMT_MOEDA
          cell.alignment = { vertical: 'middle', horizontal: 'right' }
        }
      })
    }
  }

  return wb
}

export async function exportarRelatorioGeralXlsx(nomeGrupo: string, lojas: LojaRelatorio[]) {
  const wb = await construirWorkbookRelatorioGeral(nomeGrupo, lojas)
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')

  const hoje = new Date()
  const dia = String(hoje.getDate()).padStart(2, '0')
  const mes = String(hoje.getMonth() + 1).padStart(2, '0')
  const ano = hoje.getFullYear()
  const dataStrBr = `${dia}_${mes}_${ano}`

  const nomeLimpo = nomeGrupo.replace(/[^\w\- ]/g, '').trim().replace(/\s+/g, '_')
  a.href = url
  a.download = `Relatorio_Pagamentos_BPO_${nomeLimpo}_${dataStrBr}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
