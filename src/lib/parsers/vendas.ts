import * as XLSX from 'xlsx'
import { parseDate, parseCurrency } from '@/lib/utils'
import type { VendaPreview, ResultadoImportacaoVendas } from '@/types'

const _COL_PAG_L1 = {
  15: "Cartão de Crédito",
  22: "Dinheiro",
  28: "Fatura / Boleto",
  32: "Cheque à Vista",
  33: "Cheque Pré-datado",
  52: "Sucata",
}
const _COL_PAG_L2 = {
  13: "Cartão de Débito",
  37: "Outros",
  42: "Pix",
  49: "Abatimento de Crédito",
}

function _val(row: any[], col: number): any {
  if (!row || row.length <= col) return null
  let v = row[col]
  if (typeof v === 'string') {
    v = v.trim()
  }
  return v !== "" ? v : null
}

export async function parseVendasExcel(file: File): Promise<ResultadoImportacaoVendas> {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, dateNF: 'yyyy-mm-dd' })

  const vendas: VendaPreview[] = []
  
  const os_start_rows: number[] = []
  
  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx]
    if (!Array.isArray(row)) continue
    
    const v = row[0]
    // Identifica OS por ser um número > 0 ou string alfanumérica de 4+ caracteres
    if ((typeof v === 'number' && v > 0) || (typeof v === 'string' && /^[A-Z0-9]{4,12}$/i.test(v.trim()))) {
      os_start_rows.push(idx)
    }
  }

  for (let i = 0; i < os_start_rows.length; i++) {
    const start = os_start_rows[i]
    const row_os = rows[start]

    const osNumero = String(_val(row_os, 0) || '').trim()
    const cliente = String(_val(row_os, 29) || '').trim() || 'CLIENTE NÃO IDENTIFICADO'
    const dataVenda = normalizarData(_val(row_os, 16))

    const currentVenda: VendaPreview = {
      os_numero: osNumero,
      cliente: cliente,
      data_venda: dataVenda,
      itens: [],
      valor_total: 0,
      valido: true,
      erros: []
    }

    // Pagamentos: procurar nas próximas linhas (até 6 linhas pra baixo)
    let formaPagamento = ''
    
    for (let offset = 1; offset <= 6; offset++) {
      const pagRow = rows[start + offset]
      if (!pagRow) continue
      
      // Checa L1
      for (const [colStr, nome] of Object.entries(_COL_PAG_L1)) {
        const v = _val(pagRow, parseInt(colStr))
        if (typeof v === 'number' && v > 0) {
          formaPagamento = nome
          break
        }
      }
      if (formaPagamento) break
      
      // Checa L2
      for (const [colStr, nome] of Object.entries(_COL_PAG_L2)) {
        const v = _val(pagRow, parseInt(colStr))
        if (typeof v === 'number' && v > 0) {
          formaPagamento = nome
          break
        }
      }
      if (formaPagamento) break
    }

    currentVenda.forma_pagamento = formaPagamento

    // Itens: somente PECAS (tipo "P")
    const fim_os = (i + 1 < os_start_rows.length) ? os_start_rows[i + 1] : rows.length
    for (let j = start + 1; j < fim_os; j++) {
      const row_item = rows[j]
      if (!row_item) continue
      
      const tipo = String(_val(row_item, 5) || '').trim().toUpperCase()
      if (tipo === 'P') {
        const codigo = String(_val(row_item, 7) || '').trim()
        const descricao = String(_val(row_item, 18) || '').trim()
        const qtdeVal = _val(row_item, 34)
        const unitVal = _val(row_item, 38)
        
        const qtde = typeof qtdeVal === 'number' ? qtdeVal : parseFloat(String(qtdeVal).replace(',', '.')) || 1
        const unit = typeof unitVal === 'number' ? unitVal : parseCurrency(String(unitVal || '0'))
        
        if (codigo) {
          currentVenda.itens.push({
            codigo,
            descricao: descricao || codigo,
            quantidade: qtde,
            valor_unitario: unit
          })
          currentVenda.valor_total += (qtde * unit)
        }
      }
    }

    if (currentVenda.itens.length > 0) {
      vendas.push(currentVenda)
    }
  }

  // Validar vendas
  vendas.forEach(venda => {
    venda.valido = true
    venda.erros = []
    if (!venda.cliente || venda.cliente === 'CLIENTE NÃO IDENTIFICADO') {
      venda.valido = false
      venda.erros.push('Cliente não identificado')
    }
    if (!venda.data_venda) {
      venda.valido = false
      venda.erros.push('Data da venda inválida')
    }
    if (venda.itens.length === 0) {
      venda.valido = false
      venda.erros.push('Nenhum produto encontrado na venda')
    }
  })

  return {
    total: vendas.length,
    validos: vendas.filter(v => v.valido).length,
    invalidos: vendas.filter(v => !v.valido).length,
    dados: vendas
  }
}

function normalizarData(raw: unknown): string {
  if (!raw) return ''
  if (raw instanceof Date) {
    const y = raw.getFullYear()
    const m = String(raw.getMonth() + 1).padStart(2, '0')
    const d = String(raw.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const str = String(raw).trim()
  const dtMatch = str.match(/^(\d{4}-\d{2}-\d{2})/)
  if (dtMatch) return dtMatch[1]
  return parseDate(str)
}
