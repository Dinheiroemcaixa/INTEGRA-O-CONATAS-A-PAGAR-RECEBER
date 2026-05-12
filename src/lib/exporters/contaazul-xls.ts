/**
 * Exportador: gera planilha .xls no modelo OFICIAL de importacao do ContaAzul
 * Aba "Dados" - 10 colunas exatas conforme template do ContaAzul
 */

import * as XLSX from 'xlsx'
import type { ContaPagarPreview } from '@/types'

const CABECALHO: string[] = [
  'Data de Competência',
  'Data de Vencimento',
  'Data de Pagamento',
  'Valor',
  'Categoria',
  'Descrição',
  'Cliente/Fornecedor',
  'CNPJ/CPF Cliente/Fornecedor',
  'Centro de Custo',
  'Observações',
]

export interface OpcoeExportacao {
  categoria?: string
  centroCusto?: string
}

function formatarData(data: string): string {
  if (!data) return ''
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(data)) return data
  const match = data.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (match) return `${match[3]}/${match[2]}/${match[1]}`
  return data
}

export function exportarParaContaAzulXls(
  contas: ContaPagarPreview[],
  opcoes: OpcoeExportacao = {}
): void {
  const { categoria = 'Materiais para Revenda', centroCusto = '' } = opcoes

  const linhas = contas.map((conta) => {
    const vencimento = formatarData(conta.vencimento)
    const competencia = conta.emissao ? formatarData(conta.emissao) : vencimento
    const valor = -Math.abs(conta.valor)
    
    // Categoria: Prioriza a do registro (manual ou vinda do match), senão usa a global das opções
    const categoriaFinal = conta.categoria || conta.matchFornecedor?.categoria || categoria

    // Prioriza o nome corrigido (seja por match ou edição manual) e remove espaços extras
    const fornecedorFinal = (conta.matchFornecedor?.nomeCorrigido || conta.fornecedor).trim()
    
    // Se a descrição for igual ao fornecedor original, atualiza para o corrigido também
    let descricaoFinal = (conta.descricao || fornecedorFinal).trim()
    if (conta.matchFornecedor && conta.descricao === conta.matchFornecedor.nomeOriginal) {
      descricaoFinal = fornecedorFinal
    }

    return [
      competencia,
      vencimento,
      '',
      valor,
      categoriaFinal,
      descricaoFinal,
      fornecedorFinal,
      conta.matchFornecedor?.cnpj || '',
      centroCusto,
      '',
    ]
  })

  const wsData = [CABECALHO, ...linhas]
  const ws = XLSX.utils.aoa_to_sheet(wsData)

  ws['!cols'] = [
    { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 14 },
    { wch: 30 }, { wch: 40 }, { wch: 40 }, { wch: 20 },
    { wch: 20 }, { wch: 30 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Dados')

  const dataStr = new Date().toISOString().slice(0, 10)
  const nomeArquivo = `contas_pagar_contaazul_corrigido_${dataStr}.xls`
  XLSX.writeFile(wb, nomeArquivo, { bookType: 'xls', type: 'binary' })
}

