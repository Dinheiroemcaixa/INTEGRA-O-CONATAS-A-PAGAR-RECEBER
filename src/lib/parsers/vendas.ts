import * as XLSX from 'xlsx'
import { parseDate, parseCurrency } from '@/lib/utils'
import type { VendaPreview, VendaItemPreview, ResultadoImportacaoVendas } from '@/types'

export async function parseVendasExcel(file: File): Promise<ResultadoImportacaoVendas> {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, dateNF: 'yyyy-mm-dd' })

  const vendas: VendaPreview[] = []
  
  // Encontrar linha de cabeçalho principal
  let colOsPed = -1
  let colEncerr = -1
  let colCliente = -1
  
  // Tentar encontrar colunas principais
  for (let i = 0; i < Math.min(20, rows.length); i++) {
    if (!Array.isArray(rows[i])) continue;
    const row = (rows[i] as any[]).map((c) => String(c || '').toUpperCase().trim())
    colOsPed = row.findIndex((c) => c && (c.includes('OS/PED') || c.includes('OS / PED')))
    colEncerr = row.findIndex((c) => c && c.includes('ENCERR'))
    colCliente = row.findIndex((c) => c && c.includes('CLIENTE'))
    
    if (colOsPed >= 0 && colCliente >= 0) {
      break
    }
  }

  // Se não encontrou as colunas exatas, usar posições padrão baseadas no print
  if (colOsPed < 0) colOsPed = 0; // Geralmente A ou B
  if (colEncerr < 0) colEncerr = 4; // E
  if (colCliente < 0) colCliente = 6; // G ou similar, vamos buscar o primeiro texto grande.

  let currentVenda: VendaPreview | null = null
  let colTipo = -1, colCodigo = -1, colDescricao = -1, colQtde = -1, colUnit = -1
  let paymentHeadersFound = false
  let paymentHeadersRow: string[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] as any[]
    if (!row || row.length === 0) continue

    const osValue = String(row[colOsPed] || '').trim()
    const isNovaOs = osValue.match(/^[A-Z0-9]{4,12}$/i) // Verifica se é um número de OS (ex: 12739, 1273B)

    // Detecção de nova venda (OS)
    if (isNovaOs && row.length > colCliente) {
      // Salvar a venda anterior
      if (currentVenda) {
        if (currentVenda.itens.length > 0) {
          vendas.push(currentVenda)
        }
      }

      // Procura cliente na linha (pode estar na colCliente ou nas colunas seguintes)
      let cliente = String(row[colCliente] || '').trim()
      if (!cliente && row.length > colCliente + 1) {
        // Fallback: procura o primeiro texto longo após ENCERR
        for (let c = colEncerr + 1; c < row.length; c++) {
          if (typeof row[c] === 'string' && row[c].trim().length > 3) {
            cliente = row[c].trim()
            break
          }
        }
      }

      currentVenda = {
        os_numero: osValue,
        cliente: cliente || 'CLIENTE NÃO IDENTIFICADO',
        data_venda: normalizarData(row[colEncerr]),
        itens: [],
        valor_total: 0,
        valido: true,
        erros: []
      }
      
      // Resetar contexto para os itens da nova OS
      colTipo = -1
      paymentHeadersFound = false
      continue
    }

    if (!currentVenda) continue

    // Procurar Forma de Pagamento
    const rowStrUpper = row.map(c => String(c || '').toUpperCase().trim())
    
    // Se achou a linha de cabeçalhos de pagamento (Crt Déb, Crt Créd, etc)
    const hasPayment = rowStrUpper.some(c => c && (c.includes('CRT D') || c.includes('CRT C') || c.includes('ESP') || c.includes('PIX')))
    if (hasPayment) {
      paymentHeadersFound = true
      paymentHeadersRow = rowStrUpper
      continue
    }

    // Se a linha anterior foi o cabeçalho de pagamentos, esta linha tem os valores
    if (paymentHeadersFound) {
      let formaPagamento = ''
      for (let c = 0; c < row.length; c++) {
        const val = parseFloat(String(row[c]).replace(',', '.'))
        if (!isNaN(val) && val > 0 && paymentHeadersRow[c]) {
          formaPagamento = formatarNomePagamento(paymentHeadersRow[c])
          break // Pega a primeira forma de pagamento encontrada
        }
      }
      if (formaPagamento) {
        currentVenda.forma_pagamento = formaPagamento
      }
      paymentHeadersFound = false // já processou
      continue
    }

    // Identificar cabeçalho de itens
    const hasTipo = rowStrUpper.some(c => c === 'TIPO')
    const hasCodigo = rowStrUpper.some(c => c === 'CÓDIGO' || c === 'CODIGO' || (c && c.includes('DIGO')))
    const hasQtde = rowStrUpper.some(c => c === 'QTDE' || c === 'QUANTIDADE')

    if (hasTipo && hasCodigo && hasQtde) {
      colTipo = rowStrUpper.findIndex(c => c === 'TIPO')
      colCodigo = rowStrUpper.findIndex(c => c === 'CÓDIGO' || c === 'CODIGO' || (c && c.includes('DIGO')))
      colDescricao = rowStrUpper.findIndex(c => c === 'DESCRIÇÃO' || c === 'DESCRICAO' || (c && c.includes('DESCRI')))
      colQtde = rowStrUpper.findIndex(c => c === 'QTDE' || c === 'QUANTIDADE')
      colUnit = rowStrUpper.findIndex(c => c === 'UNIT' || c === 'UNITÁRIO' || (c && c.includes('UNIT')))
      continue
    }

    // Processar item (se já temos as colunas)
    if (colTipo >= 0 && currentVenda) {
      const tipo = String(row[colTipo] || '').trim().toUpperCase()
      
      // O usuário pediu apenas produtos (P). Serviços (S) serão ignorados.
      if (tipo === 'P') {
        const codigo = String(row[colCodigo] || '').trim()
        const descricao = String(row[colDescricao] || '').trim()
        const qtde = parseFloat(String(row[colQtde]).replace(',', '.')) || 1
        const unit = parseCurrency(String(row[colUnit] || '0'))
        
        if (codigo) {
          const item: VendaItemPreview = {
            codigo: codigo,
            descricao: descricao || codigo,
            quantidade: qtde,
            valor_unitario: unit
          }
          currentVenda.itens.push(item)
          currentVenda.valor_total += (qtde * unit)
        }
      }
    }
  }

  // Push da última venda
  if (currentVenda && currentVenda.itens.length > 0) {
    vendas.push(currentVenda)
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

function formatarNomePagamento(abrev: string): string {
  switch(abrev) {
    case 'CRT DÉB': return 'Cartão de Débito'
    case 'CRT CRÉD': return 'Cartão de Crédito'
    case 'ESPÉCIE': return 'Dinheiro'
    case 'FATURA': return 'Fatura / Boleto'
    case 'CH A VISTA': return 'Cheque à Vista'
    case 'CH PRÉ': return 'Cheque Pré-datado'
    case 'OUTROS': return 'Outros'
    case 'PIX': return 'Pix'
    case 'ABAT CRÉD': return 'Abatimento de Crédito'
    case 'SUCATA': return 'Sucata'
    default: return abrev
  }
}
