/**
 * MÓDULO: Auditoria Inteligente de Conciliação Bancária
 * CAMINHO: src/lib/auditoria-conciliacao/extrato-parser.ts
 * 
 * Fachada unificada de extração e parsing de extratos bancários (Excel e CSV).
 */

import { TransacaoExtratoCanonica, FormatoArquivoExtrato } from './tipos';
import { parsearExtratoExcel } from './extrato-excel';
import { parsearExtratoCsv } from './extrato-csv';
import { calcularHashArquivo } from './normalizador';

export interface ResultadoParsingExtrato {
  sucesso: boolean;
  formato: FormatoArquivoExtrato;
  arquivoHash: string;
  arquivoNome: string;
  arquivoTamanho: number;
  periodoInicio: string;
  periodoFim: string;
  totalTransacoes: number;
  totalDebitos: number;
  totalCreditos: number;
  valorTotalDebitos: number;
  valorTotalCreditos: number;
  transacoes: TransacaoExtratoCanonica[];
  erro?: string;
}

/**
 * Processa qualquer extrato bancário suportado no MVP (Excel .xlsx/.xls ou CSV)
 */
export async function processarExtratoBancario(
  buffer: Buffer,
  nomeArquivo: string,
  bancoNome?: string
): Promise<ResultadoParsingExtrato> {
  const hash = calcularHashArquivo(buffer);
  const tamanho = buffer.length;
  const ext = nomeArquivo.toLowerCase().split('.').pop() || '';

  let formato: FormatoArquivoExtrato = 'CSV';
  let transacoes: TransacaoExtratoCanonica[] = [];

  try {
    if (ext === 'xlsx' || ext === 'xls') {
      formato = 'EXCEL';
      transacoes = await parsearExtratoExcel(buffer, { bancoNome });
    } else if (ext === 'csv' || ext === 'txt') {
      formato = 'CSV';
      const texto = buffer.toString('utf-8');
      transacoes = await parsearExtratoCsv(texto, { bancoNome });
    } else {
      throw new Error(`Formato de arquivo .${ext} não suportado. Utilize Excel (.xlsx, .xls) ou CSV (.csv).`);
    }

    if (transacoes.length === 0) {
      throw new Error('Nenhuma transação válida identificada no extrato bancário.');
    }

    // Ordenação cronológica
    transacoes.sort((a, b) => a.data.localeCompare(b.data));

    const periodoInicio = transacoes[0].data;
    const periodoFim = transacoes[transacoes.length - 1].data;

    let totalDebitos = 0;
    let totalCreditos = 0;
    let valorTotalDebitos = 0;
    let valorTotalCreditos = 0;

    for (const t of transacoes) {
      if (t.tipo === 'DEBITO') {
        totalDebitos++;
        valorTotalDebitos += t.valor;
      } else {
        totalCreditos++;
        valorTotalCreditos += t.valor;
      }
    }

    return {
      sucesso: true,
      formato,
      arquivoHash: hash,
      arquivoNome: nomeArquivo,
      arquivoTamanho: tamanho,
      periodoInicio,
      periodoFim,
      totalTransacoes: transacoes.length,
      totalDebitos,
      totalCreditos,
      valorTotalDebitos: Number(valorTotalDebitos.toFixed(2)),
      valorTotalCreditos: Number(valorTotalCreditos.toFixed(2)),
      transacoes
    };
  } catch (err: any) {
    return {
      sucesso: false,
      formato,
      arquivoHash: hash,
      arquivoNome: nomeArquivo,
      arquivoTamanho: tamanho,
      periodoInicio: '',
      periodoFim: '',
      totalTransacoes: 0,
      totalDebitos: 0,
      totalCreditos: 0,
      valorTotalDebitos: 0,
      valorTotalCreditos: 0,
      transacoes: [],
      erro: err?.message || 'Falha ao processar arquivo de extrato bancário.'
    };
  }
}
