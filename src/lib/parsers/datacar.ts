/**
 * Parser especializado para arquivos DataCar (CpRl010)
 * Formato: Excel com cabeçalho nas primeiras 12 linhas
 * Colunas: A=NF, J=EMISSÃO, N=FORNECEDOR, Q=DOC, T=VENCIMENTO, X=VALOR
 */

import * as XLSX from 'xlsx'
import Papa from 'papaparse'
import { parseDate, parseCurrency } from '@/lib/utils'
import type { ContaPagarPreview, ResultadoImportacao } from '@/types'

// ─── EXCEL / XLSX ─────────────────────────────────────────────────────────────
export async function parseExcelDataCar(file: File): Promise<ResultadoImportacao> {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  // raw: true preserva os valores numéricos reais (ex: 774.12 em vez de "774,12" formatado)
  // dateNF formata as datas como string ISO para facilitar o parse
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, dateNF: 'yyyy-mm-dd' })

  const dados: ContaPagarPreview[] = []

  // Detectar se é formato DataCar (CpRl010) pela linha 10 (índice 9) com "NF", "FORNECEDOR", "VENCIM", "VALOR"
  const isDataCar = detectarFormatoDataCar(rows)

  if (isDataCar) {
    return parseDataCarNativo(rows)
  } else {
    return parseExcelGenerico(rows)
  }
}

function detectarFormatoDataCar(rows: unknown[][]): boolean {
  // Linha 10 (índice 9) tem cabeçalhos NF, FORNECEDOR, VENCIM, VALOR
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    const row = rows[i]
    const rowStr = row.map((c) => String(c || '').toUpperCase()).join(' ')
    if (rowStr.includes('FORNECEDOR') && rowStr.includes('VENCIM') && rowStr.includes('VALOR')) {
      return true
    }
    // Também detectar pelo nome do relatório CpRl010
    if (rowStr.includes('CPRL010') || rowStr.includes('PREVISÃO DE PAGAMENTOS') || rowStr.includes('PREVISAO DE PAGAMENTOS')) {
      return true
    }
  }
  return false
}

function parseDataCarNativo(rows: unknown[][]): ResultadoImportacao {
  const dados: ContaPagarPreview[] = []
  // Pular linhas de cabeçalho (linhas 1-12, índices 0-11)
  // Dados começam na linha 13 (índice 12)
  // Identificar índices das colunas: NF=0, EMISSÃO=8, FORNECEDOR=13, DOC=16, VENCIM=19, VALOR=23

  for (let i = 12; i < rows.length; i++) {
    const row = rows[i] as string[]
    if (!row || row.length < 24) continue

    const nf = String(row[0] || '').trim()
    const fornecedor = String(row[13] || '').trim()
    const emissaoRaw = row[8]
    const docRaw = String(row[16] || '').trim()
    const vencimentoRaw = row[19]
    const valorRaw = row[23]

    // Pular linhas vazias, linhas de grupo/filial e linhas de totais
    if (!nf || !fornecedor || !valorRaw) continue
    if (isLinhaGrupo(nf, row)) continue
    if (isLinhaTotal(nf)) continue

    const valor = parseCurrency(String(valorRaw))
    const vencimento = normalizarData(vencimentoRaw)
    const emissao = normalizarData(emissaoRaw)
    const erros: string[] = []

    if (!fornecedor) erros.push('Fornecedor não identificado')
    if (isNaN(valor) || valor <= 0) erros.push('Valor inválido')
    if (!vencimento) erros.push('Vencimento não identificado')

    dados.push({
      fornecedor: fornecedor || 'NÃO IDENTIFICADO',
      valor,
      vencimento: vencimento || '',
      descricao: docRaw ? `${nf} - ${docRaw}` : `NF: ${nf}`,
      doc: docRaw || nf,
      emissao: emissao || undefined,
      linha_original: `Linha ${i + 1}`,
      valido: erros.length === 0,
      erros: erros.length > 0 ? erros : undefined,
    })
  }

  return {
    total: dados.length,
    validos: dados.filter((d) => d.valido).length,
    invalidos: dados.filter((d) => !d.valido).length,
    dados,
  }
}

function isLinhaGrupo(nf: string, row: string[]): boolean {
  // Linha de grupo/filial: NF tem texto curto sem número E fornecedor está vazio
  const semDigito = !/\d/.test(nf)
  const fornecedorVazio = !row[13] || String(row[13]).trim() === ''
  const valorVazio = !row[23] || String(row[23]).trim() === ''
  return semDigito && (fornecedorVazio || valorVazio)
}

function isLinhaTotal(nf: string): boolean {
  const upper = nf.toUpperCase()
  return upper.includes('TOTAL') || upper.includes('SUBTOTAL') || upper === 'PERIODO' || upper.startsWith('EMISSÃO')
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
  // Formato "2026-05-01 00:00:00" (quando XLSX serializa datetime como string)
  const dtMatch = str.match(/^(\d{4}-\d{2}-\d{2})/)
  if (dtMatch) return dtMatch[1]
  return parseDate(str)
}

function parseExcelGenerico(rows: unknown[][]): ResultadoImportacao {
  // Detectar linha de cabeçalho genérico ou de relatório ERP (ex: Titulos_despesas)
  let headerRow = -1
  let colFornecedor = -1
  let colValor = -1
  let colVencimento = -1
  let colEmissao = -1
  let colDescricao = -1
  let colCategoria = -1
  let colContaFinanceira = -1
  let colDoc = -1

  for (let i = 0; i < Math.min(20, rows.length); i++) {
    const row = rows[i].map((c) => String(c || '').toUpperCase().trim())
    const fIdx = row.findIndex((c) => c.includes('FORNECEDOR') || c.includes('CREDOR') || c.includes('NOME FANTASIA') || c.includes('RAZÃO SOCIAL') || c.includes('RAZAO SOCIAL') || c === 'NOME')
    const vIdx = row.findIndex((c) => c.includes('VALOR ORIGINAL') || c.includes('SALDO BAIXAR') || c.includes('VALOR') || c.includes('VLR') || c.includes('TOTAL'))
    const dIdx = row.findIndex((c) => c.includes('VENC. ORIGINAL') || c.includes('VENCIMENTO') || c.includes('VENC') || c.includes('PRAZO'))

    if (fIdx >= 0 && vIdx >= 0) {
      headerRow = i
      colFornecedor = fIdx
      colValor = vIdx
      colVencimento = dIdx >= 0 ? dIdx : -1
      colEmissao = row.findIndex((c) => c.includes('EMISSÃO') || c.includes('EMISSAO') || c.includes('DATA ENTRADA'))
      colDescricao = row.findIndex((c) => c.includes('HISTÓRICO') || c.includes('HISTORICO') || c.includes('DESC') || c.includes('OBS'))
      colCategoria = row.findIndex((c) => c.includes('CENTRO DE RESULTADO') || c.includes('CATEGORIA') || c.includes('PLANO DE CONTAS') || c.includes('CENTRO DE CUSTO'))
      colContaFinanceira = row.findIndex((c) => c.includes('CONTA CAIXA') || c.includes('CONTA BANCARIA') || c.includes('BANCO'))
      colDoc = row.findIndex((c) => c.includes('DOCUMENTO') || c.includes('TIPO DOC') || c.includes('FATURA') || c === 'DOC')
      break
    }
  }

  if (headerRow < 0) {
    return { total: 0, validos: 0, invalidos: 0, dados: [] }
  }

  const dados: ContaPagarPreview[] = []
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i] as string[]
    if (!row || row.every((c) => !c)) continue

    const fornecedorRaw = String(row[colFornecedor] || '').trim()
    const valor = parseCurrency(String(row[colValor] || '0'))
    const vencimento = colVencimento >= 0 ? normalizarData(row[colVencimento]) : ''
    const emissao = colEmissao >= 0 ? normalizarData(row[colEmissao]) : undefined
    const historico = colDescricao >= 0 ? String(row[colDescricao] || '').trim() : ''
    const doc = colDoc >= 0 ? String(row[colDoc] || '').trim() : ''
    
    // Tratamento de Categoria (ex: "02 - CONTAS VARIAVEIS" -> "Contas Variaveis")
    let categoriaRaw = colCategoria >= 0 ? String(row[colCategoria] || '').trim() : ''
    if (categoriaRaw && /^\d+\s*-\s*/.test(categoriaRaw)) {
      categoriaRaw = categoriaRaw.replace(/^\d+\s*-\s*/, '').trim()
    }
    
    // Tratamento de Conta Financeira (ex: "BANCO DO BRASIL", "C6", "ITAU")
    const contaFinanceiraRaw = colContaFinanceira >= 0 ? String(row[colContaFinanceira] || '').trim() : undefined

    // Construção de Descrição Inteligente
    let descricaoFinal = historico
    if (doc && !descricaoFinal.includes(doc)) {
      descricaoFinal = descricaoFinal ? `${doc} - ${descricaoFinal}` : `Doc: ${doc}`
    }
    if (!descricaoFinal) {
      descricaoFinal = `Pagamento - ${fornecedorRaw}`
    }

    const erros: string[] = []

    if (!fornecedorRaw) erros.push('Fornecedor vazio')
    if (isNaN(valor) || valor <= 0) erros.push('Valor inválido')
    if (!vencimento) erros.push('Vencimento não identificado')

    dados.push({
      fornecedor: fornecedorRaw || 'NÃO IDENTIFICADO',
      valor,
      vencimento: vencimento || '',
      emissao: emissao || undefined,
      categoria: categoriaRaw || undefined,
      conta_financeira: contaFinanceiraRaw || undefined,
      descricao: descricaoFinal,
      doc: doc || undefined,
      linha_original: `Linha ${i + 1}`,
      valido: erros.length === 0,
      erros: erros.length > 0 ? erros : undefined,
    })
  }

  return {
    total: dados.length,
    validos: dados.filter((d) => d.valido).length,
    invalidos: dados.filter((d) => !d.valido).length,
    dados,
  }
}

// ─── CSV ───────────────────────────────────────────────────────────────────────
export async function parseCSV(file: File): Promise<ResultadoImportacao> {
  return new Promise((resolve) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const raw = results.data as Record<string, string>[]
        const dados: ContaPagarPreview[] = raw.map((row, idx) => {
          const keys = Object.keys(row).map((k) => k.toUpperCase())
          const get = (terms: string[]) => {
            const k = Object.keys(row).find((k) => terms.some((t) => k.toUpperCase().includes(t)))
            return k ? row[k] : ''
          }
          const fornecedor = get(['FORNECEDOR', 'CREDOR', 'NOME']).trim()
          const valor = parseCurrency(get(['VALOR', 'VLR', 'TOTAL']))
          const vencimento = normalizarData(get(['VENC', 'DATA', 'PRAZO']))
          const descricao = get(['DESC', 'OBS', 'HISTORICO']).trim()
          const erros: string[] = []
          if (!fornecedor) erros.push('Fornecedor vazio')
          if (isNaN(valor) || valor <= 0) erros.push('Valor inválido')
          return {
            fornecedor: fornecedor || 'NÃO IDENTIFICADO',
            valor, vencimento, descricao: descricao || undefined,
            linha_original: `Linha ${idx + 2}`,
            valido: erros.length === 0,
            erros: erros.length > 0 ? erros : undefined,
          }
        })
        resolve({
          total: dados.length,
          validos: dados.filter((d) => d.valido).length,
          invalidos: dados.filter((d) => !d.valido).length,
          dados,
        })
      },
      error: () => resolve({ total: 0, validos: 0, invalidos: 0, dados: [] }),
    })
  })
}

// ─── PDF (texto extraído via API route) ───────────────────────────────────────
export async function parsePDFViaAPI(file: File): Promise<ResultadoImportacao> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch('/api/parse-pdf', { method: 'POST', body: formData })
  if (!res.ok) throw new Error('Erro ao processar PDF')
  return res.json()
}

// ─── Dispatcher principal ─────────────────────────────────────────────────────
export async function parseArquivo(file: File): Promise<ResultadoImportacao> {
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  if (['xlsx', 'xls'].includes(ext)) return parseExcelDataCar(file)
  if (ext === 'csv') return parseCSV(file)
  if (ext === 'pdf') return parsePDFViaAPI(file)
  if (['png', 'jpg', 'jpeg', 'webp', 'bmp'].includes(ext)) return parsePDFViaAPI(file)
  throw new Error(`Formato .${ext} nao suportado`)
}
