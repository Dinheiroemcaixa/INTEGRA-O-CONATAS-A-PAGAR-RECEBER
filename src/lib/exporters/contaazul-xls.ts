/**
 * Exportador: gera planilha .xls no modelo exato do ContaAzul
 * Visão Contas a Pagar — 30 colunas
 *
 * Formato obrigatório: Excel 97-2003 (.xls) — bookType: 'xls'
 */

import * as XLSX from 'xlsx'
import type { ContaPagarPreview } from '@/types'

// ─── Cabeçalho exato da planilha modelo do ContaAzul ─────────────────────────
const CABECALHO: string[] = [
  'Identificador do fornecedor',
  'Nome do fornecedor',
  'Código de referência',
  'Data de competência',
  'Data de vencimento',
  'Data prevista',
  'Recorrência',
  'Quantidade de recorrência',
  'Descrição',
  'Origem do lançamento',
  'Situação',
  'Agendado',
  'Valor original da parcela (R$)',
  'Forma de pagamento',
  'Valor pago da parcela (R$)',
  'Juros realizado (R$)',
  'Multa realizado (R$)',
  'Desconto realizado (R$)',
  'Valor total pago da parcela (R$)',
  'Valor da parcela em aberto (R$)',
  'Juros previsto (R$)',
  'Multa previsto (R$)',
  'Desconto previsto (R$)',
  'Valor total da parcela em aberto (R$)',
  'Conta bancária',
  'Data do último pagamento',
  'Nota fiscal',
  'Observações',
  'Categoria 1',
  'Valor na Categoria 1',
]

export interface OpcoeExportacao {
  /** Conta bancária cadastrada no ContaAzul (ex: "Itaú 99696-3") */
  contaBancaria?: string
  /** Categoria padrão do plano de contas (ex: "Materiais para Revenda") */
  categoria?: string
}

/**
 * Converte uma data no formato yyyy-mm-dd para dd/mm/yyyy
 */
function formatarData(data: string): string {
  if (!data) return ''
  // Já está em dd/mm/yyyy
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(data)) return data
  // Formato yyyy-mm-dd
  const match = data.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (match) return `${match[3]}/${match[2]}/${match[1]}`
  return data
}

/**
 * Gera e faz o download do arquivo .xls no modelo do ContaAzul
 * @param contas Lista de contas a pagar (já validadas)
 * @param opcoes Opções de preenchimento de campos fixos
 */
export function exportarParaContaAzulXls(
  contas: ContaPagarPreview[],
  opcoes: OpcoeExportacao = {}
): void {
  const { contaBancaria = '', categoria = '' } = opcoes

  // Montar linhas de dados
  const linhas = contas.map((conta) => {
    const vencimento = formatarData(conta.vencimento)
    const valor = conta.valor

    // Lançamento futuro (em aberto):
    // - Valor pago = 0, Valor em aberto = valor original
    // - Situação = "Em aberto"
    // - Valor na Categoria 1 = negativo (saída de caixa)
    return [
      '',                        // Identificador do fornecedor
      conta.fornecedor,          // Nome do fornecedor
      conta.doc || '',           // Código de referência (NF/DOC)
      vencimento,                // Data de competência
      vencimento,                // Data de vencimento
      vencimento,                // Data prevista
      'Sem recorrência',         // Recorrência
      '',                        // Quantidade de recorrência
      conta.descricao || conta.fornecedor, // Descrição
      'Lançamento Financeiro',   // Origem do lançamento
      'Em aberto',               // Situação
      '-',                       // Agendado
      valor,                     // Valor original da parcela (R$)
      'Outro',                   // Forma de pagamento
      0,                         // Valor pago da parcela (R$)
      0,                         // Juros realizado (R$)
      0,                         // Multa realizado (R$)
      0,                         // Desconto realizado (R$)
      0,                         // Valor total pago da parcela (R$)
      valor,                     // Valor da parcela em aberto (R$)
      0,                         // Juros previsto (R$)
      0,                         // Multa previsto (R$)
      0,                         // Desconto previsto (R$)
      valor,                     // Valor total da parcela em aberto (R$)
      contaBancaria,             // Conta bancária
      '',                        // Data do último pagamento (vazio pois não foi pago)
      '',                        // Nota fiscal
      '',                        // Observações
      categoria,                 // Categoria 1
      -valor,                    // Valor na Categoria 1 (negativo = saída)
    ]
  })

  // Montar worksheet: cabeçalho + linhas
  const wsData = [CABECALHO, ...linhas]
  const ws = XLSX.utils.aoa_to_sheet(wsData)

  // Larguras de coluna para facilitar leitura
  ws['!cols'] = [
    { wch: 20 }, // Identificador do fornecedor
    { wch: 40 }, // Nome do fornecedor
    { wch: 20 }, // Código de referência
    { wch: 16 }, // Data de competência
    { wch: 16 }, // Data de vencimento
    { wch: 16 }, // Data prevista
    { wch: 18 }, // Recorrência
    { wch: 10 }, // Quantidade de recorrência
    { wch: 50 }, // Descrição
    { wch: 22 }, // Origem do lançamento
    { wch: 12 }, // Situação
    { wch: 10 }, // Agendado
    { wch: 22 }, // Valor original da parcela
    { wch: 22 }, // Forma de pagamento
    { wch: 22 }, // Valor pago da parcela
    { wch: 16 }, // Juros realizado
    { wch: 16 }, // Multa realizado
    { wch: 16 }, // Desconto realizado
    { wch: 24 }, // Valor total pago
    { wch: 24 }, // Valor em aberto
    { wch: 16 }, // Juros previsto
    { wch: 16 }, // Multa previsto
    { wch: 16 }, // Desconto previsto
    { wch: 28 }, // Valor total em aberto
    { wch: 30 }, // Conta bancária
    { wch: 20 }, // Data do último pagamento
    { wch: 14 }, // Nota fiscal
    { wch: 30 }, // Observações
    { wch: 30 }, // Categoria 1
    { wch: 20 }, // Valor na Categoria 1
  ]

  // Criar workbook e adicionar a aba
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Visão Contas a Pagar')

  // Gerar arquivo — bookType 'xls' = Excel 97-2003 (.xls) obrigatório para o ContaAzul
  const nomeArquivo = `contas_a_pagar_contaazul_${new Date().toISOString().slice(0, 10)}.xls`
  XLSX.writeFile(wb, nomeArquivo, { bookType: 'xls', type: 'binary' })
}
