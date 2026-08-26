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
  console.log('[PARSER EXCEL] Iniciando leitura:', file.name, 'Tamanho:', file.size, 'bytes')
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })

  console.log('[PARSER EXCEL] Abas encontradas no arquivo:', wb.SheetNames)

  if (!wb.SheetNames || wb.SheetNames.length === 0) {
    console.error('[PARSER EXCEL] Nenhuma aba encontrada no arquivo Excel.')
    return { total: 0, validos: 0, invalidos: 0, dados: [], motivo: 'Nenhuma aba encontrada na planilha.' }
  }

  let melhorResultado: ResultadoImportacao = { total: 0, validos: 0, invalidos: 0, dados: [] }

  // Varrer TODAS as abas da planilha em busca dos dados
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    if (!ws) continue

    const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, dateNF: 'yyyy-mm-dd' })
    console.log(`[PARSER EXCEL] Aba "${sheetName}" lida com ${rows ? rows.length : 0} linhas.`)
    if (!rows || rows.length === 0) continue

    const isDataCar = detectarFormatoDataCar(rows)
    let res: ResultadoImportacao
    if (isDataCar) {
      console.log(`[PARSER EXCEL] Relatório DataCar nativo (CpRl010) detectado na aba "${sheetName}".`)
      res = parseDataCarNativo(rows)
    } else {
      console.log(`[PARSER EXCEL] Executando leitor inteligente de planilhas ERP na aba "${sheetName}".`)
      res = parseExcelGenerico(rows)
    }

    console.log(`[PARSER EXCEL] Resultado da aba "${sheetName}": Total=${res.total}, Válidos=${res.validos}, Erro/Motivo:`, res.motivo || 'Nenhum')

    if (res.validos > melhorResultado.validos || (melhorResultado.total === 0 && res.total > 0)) {
      melhorResultado = res
    }
  }

  if (melhorResultado.total === 0) {
    console.warn('[PARSER EXCEL] Nenhuma aba da planilha retornou registros válidos.', melhorResultado)
  }

  return melhorResultado
}

function normalizarStringHeader(val: unknown): string {
  if (val === null || val === undefined) return ''
  return String(val).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').toUpperCase().trim()
}

function detectarFormatoDataCar(rows: unknown[][]): boolean {
  // O relatório nativo do DataCar possui a assinatura específica CpRl010 ou a string "PREVISÃO DE PAGAMENTOS"
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    const row = rows[i]
    if (!row) continue
    const rowStr = row.map((c) => normalizarStringHeader(c)).join(' ')
    if (rowStr.includes('CPRL010') || rowStr.includes('PREVISÃO DE PAGAMENTOS') || rowStr.includes('PREVISAO DE PAGAMENTOS')) {
      return true
    }
  }
  return false
}

function parseDataCarNativo(rows: unknown[][]): ResultadoImportacao {
  const dados: ContaPagarPreview[] = []

  for (let i = 12; i < rows.length; i++) {
    const row = rows[i] as string[]
    if (!row || row.length < 24) continue

    const nf = String(row[0] || '').trim()
    const fornecedor = String(row[13] || '').trim()
    const emissaoRaw = row[8]
    const docRaw = String(row[16] || '').trim()
    const vencimentoRaw = row[19]
    const valorRaw = row[23]

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
  const dtMatch = str.match(/^(\d{4}-\d{2}-\d{2})/)
  if (dtMatch) return dtMatch[1]
  const brMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (brMatch) {
    const d = brMatch[1].padStart(2, '0')
    const m = brMatch[2].padStart(2, '0')
    const y = brMatch[3].length === 2 ? '20' + brMatch[3] : brMatch[3]
    return `${y}-${m}-${d}`
  }
  return parseDate(str)
}

function parseExcelGenerico(rows: unknown[][]): ResultadoImportacao {
  if (!rows || rows.length === 0) {
    return { total: 0, validos: 0, invalidos: 0, dados: [], motivo: 'A aba selecionada não contém linhas de conteúdo.' }
  }

  let headerRow = -1
  let colNomeFantasia = -1
  let colRazaoSocial = -1
  let colHistorico = -1
  let colValor = -1
  let colVencimento = -1
  let colEmissao = -1
  let colCategoria = -1
  let colContaFinanceira = -1

  for (let i = 0; i < Math.min(100, rows.length); i++) {
    const row = (rows[i] || []).map((c) => normalizarStringHeader(c))
    if (!row || row.length === 0) continue

    const vIdx = row.findIndex((c) => c.includes('VALOR') || c.includes('SALDO') || c.includes('VLR') || c.includes('TOTAL') || c.includes('PREÇO') || c.includes('PRECO'))
    const dIdx = row.findIndex((c) => c.includes('VENC') || c.includes('PRAZO') || c.includes('DATA') || c.includes('DUPLICATA'))
    const nfIdx = row.findIndex((c) => c.includes('FANTASIA') || c.includes('FORNECEDOR') || c.includes('CREDOR') || c === 'NOME' || c.includes('RAZÃO') || c.includes('RAZAO') || c.includes('CLIENTE'))
    const hIdx = row.findIndex((c) => c.includes('HISTÓRICO') || c.includes('HISTORICO') || c.includes('DESC') || c.includes('OBS') || c.includes('DETALHE'))

    const matchesCount = (vIdx >= 0 ? 1 : 0) + (dIdx >= 0 ? 1 : 0) + (nfIdx >= 0 ? 1 : 0) + (hIdx >= 0 ? 1 : 0)

    if (matchesCount >= 1) {
      headerRow = i
      colValor = vIdx >= 0 ? vIdx : row.findIndex(c => c.includes('VALOR') || c.includes('SALDO'))
      colVencimento = dIdx >= 0 ? dIdx : row.findIndex(c => c.includes('VENC'))
      colNomeFantasia = nfIdx >= 0 ? nfIdx : -1
      colRazaoSocial = row.findIndex((c) => c.includes('RAZÃO SOCIAL') || c.includes('RAZAO SOCIAL'))
      colHistorico = hIdx >= 0 ? hIdx : -1
      colEmissao = row.findIndex((c) => c.includes('EMISSÃO') || c.includes('EMISSAO') || c.includes('DATA ENTRADA'))
      colCategoria = row.findIndex((c) => c.includes('CENTRO DE RESULTADO') || c.includes('CATEGORIA') || c.includes('PLANO DE CONTAS') || c.includes('CENTRO DE CUSTO'))
      colContaFinanceira = row.findIndex((c) => c.includes('CONTA CAIXA') || c.includes('CONTA BANCARIA') || c.includes('BANCO'))
      console.log(`[PARSER GENERICO] Cabeçalho encontrado na linha ${i + 1}. Mapeamento: colValor=${colValor}, colVencimento=${colVencimento}, colNomeFantasia=${colNomeFantasia}, colHistorico=${colHistorico}, colCategoria=${colCategoria}, colContaFinanceira=${colContaFinanceira}`)
      break
    }
  }

  if (headerRow < 0) {
    console.warn('[PARSER GENERICO] Nenhum nome de cabeçalho padrão encontrado nas primeiras 100 linhas. Tentando busca cega de colunas por dados.')
    headerRow = 0
    for (let i = 0; i < Math.min(20, rows.length); i++) {
      const row = rows[i] || []
      row.forEach((cell, colIdx) => {
        const str = String(cell || '').trim()
        if (colValor < 0 && (typeof cell === 'number' || (str && /^R?\$?\s*\d+([.,]\d+)?$/.test(str)))) {
          colValor = colIdx
        }
        if (colVencimento < 0 && (cell instanceof Date || /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}/.test(str))) {
          colVencimento = colIdx
        }
      })
    }
  }

  if (colValor < 0 && colVencimento < 0) {
    return {
      total: 0,
      validos: 0,
      invalidos: 0,
      dados: [],
      motivo: 'Não foi possível identificar as colunas de Valor ou Vencimento na planilha.'
    }
  }

  const dados: ContaPagarPreview[] = []
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i] as string[]
    if (!row || row.every((c) => !c)) continue

    const valRaw = colValor >= 0 ? row[colValor] : 0
    const valor = parseCurrency(String(valRaw || '0'))
    const vencimento = colVencimento >= 0 ? normalizarData(row[colVencimento]) : ''
    const emissao = colEmissao >= 0 ? normalizarData(row[colEmissao]) : undefined
    
    const nomeFantasia = colNomeFantasia >= 0 ? String(row[colNomeFantasia] || '').trim() : ''
    const razaoSocial = colRazaoSocial >= 0 ? String(row[colRazaoSocial] || '').trim() : ''
    const historico = colHistorico >= 0 ? String(row[colHistorico] || '').trim() : ''

    const partesDescricao: string[] = []
    if (nomeFantasia) partesDescricao.push(nomeFantasia)
    if (historico && historico.toLowerCase() !== nomeFantasia.toLowerCase()) {
      partesDescricao.push(historico)
    }
    if (razaoSocial && razaoSocial.toLowerCase() !== nomeFantasia.toLowerCase() && razaoSocial.toLowerCase() !== historico.toLowerCase()) {
      partesDescricao.push(razaoSocial)
    }

    const descricaoFinal = partesDescricao.join(' - ') || (nomeFantasia || razaoSocial || historico ? `${nomeFantasia || razaoSocial}` : 'Sem descrição')

    const fornecedorFinal = (nomeFantasia || razaoSocial || historico || 'NÃO INFORMADO').trim()

    let categoriaRaw = colCategoria >= 0 ? String(row[colCategoria] || '').trim() : ''
    if (categoriaRaw && /^\d+\s*-\s*/.test(categoriaRaw)) {
      categoriaRaw = categoriaRaw.replace(/^\d+\s*-\s*/, '').trim()
    }
    const contaFinanceiraRaw = colContaFinanceira >= 0 ? String(row[colContaFinanceira] || '').trim() : undefined

    const erros: string[] = []
    if (isNaN(valor) || valor <= 0) erros.push('Valor inválido')
    if (!vencimento) erros.push('Vencimento não identificado')

    dados.push({
      fornecedor: fornecedorFinal,
      valor,
      vencimento: vencimento || '',
      emissao: emissao || undefined,
      categoria: categoriaRaw || undefined,
      conta_financeira: contaFinanceiraRaw || undefined,
      descricao: descricaoFinal,
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
    motivo: dados.length === 0 ? 'Linhas lidas, mas nenhuma continha valor e vencimento válidos.' : undefined
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
