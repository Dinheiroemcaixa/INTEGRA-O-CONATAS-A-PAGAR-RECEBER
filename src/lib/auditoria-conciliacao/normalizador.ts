/**
 * MÓDULO: Auditoria Inteligente de Conciliação Bancária
 * CAMINHO: src/lib/auditoria-conciliacao/normalizador.ts
 * 
 * Funções especializadas em normalização, sanitização e cálculo de hash
 * para extratos bancários brasileiros.
 */

import crypto from 'crypto';
import { TipoTransacaoBancaria } from './tipos';

/**
 * Termos de ruído bancário comuns em extratos de internet banking no Brasil
 */
export const STOP_WORDS_BANCARIAS = new Set([
  'PIX', 'TRANSF', 'TRANSFERENCIA', 'PAGTO', 'PAGAMENTO', 'DOC', 'TED',
  'COMPRA', 'CARTAO', 'DB', 'DEB', 'DEBITO', 'AUTOM', 'AUTOMATICO',
  'TIT', 'TITULO', 'COB', 'COBRANCA', 'BOL', 'BOLETO', 'LIQ', 'LIQUIDACAO',
  'ENVIO', 'RECEB', 'RECEBIMENTO', 'INTERNET', 'BANKING', 'AGENCIA', 'CONTA',
  'CHQ', 'CHEQUE', 'SALDO', 'TARIFA', 'TAR', 'PACOTE', 'SERVICOS', 'ESTORNO',
  'APLICACAO', 'RESGATE', 'RENDIMENTO', 'SALDO ANTERIOR', 'SALDO FINAL'
]);

/**
 * Sanitiza o texto original do extrato removendo ruídos para comparação aproximada
 */
export function sanitizarDescricao(texto?: string | null): string {
  if (!texto) return '';
  return texto
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/[^A-Z0-9\s]/g, ' ')   // Mantém apenas alfanuméricos
    .split(/\s+/)
    .filter(token => token.length > 2 && !STOP_WORDS_BANCARIAS.has(token))
    .join(' ')
    .trim();
}

/**
 * Calcula o hash determinístico SHA-256 do arquivo original para auditoria e controle de duplicidade
 */
export function calcularHashArquivo(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Gera um ID canônico determinístico para cada transação bancária
 */
export function calcularHashTransacao(
  banco: string,
  data: string,
  valor: number,
  tipo: TipoTransacaoBancaria,
  descricaoOriginal: string,
  documento?: string | null
): string {
  const payload = `${banco}|${data}|${valor.toFixed(2)}|${tipo}|${descricaoOriginal.trim().toUpperCase()}|${documento || ''}`;
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 32);
}

/**
 * Converte valores em formatos brasileiros ou internacionais para float positivo
 */
export function parsearValorMonetario(valorBruto: any): { valor: number; tipoSugerido?: TipoTransacaoBancaria } {
  if (typeof valorBruto === 'number') {
    return {
      valor: Math.abs(valorBruto),
      tipoSugerido: valorBruto < 0 ? 'DEBITO' : 'CREDITO'
    };
  }

  if (typeof valorBruto !== 'string') {
    return { valor: 0 };
  }

  let str = valorBruto.trim();
  let ehNegativo = str.startsWith('-') || str.endsWith('-') || (str.startsWith('(') && str.endsWith(')'));
  let ehDebitoExplicito = /\b(D|DEB|DEBITO)\b/i.test(str);
  let ehCreditoExplicito = /\b(C|CRED|CREDITO)\b/i.test(str);

  // Remove caracteres não numéricos exceto vírgula e ponto
  str = str.replace(/[R$\s\(\)\-\+DCdc]/g, '').trim();

  // Trata formato brasileiro (1.500,50) vs americano (1500.50)
  if (str.includes(',') && str.includes('.')) {
    if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
      // 1.500,50 -> 1500.50
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      // 1,500.50 -> 1500.50
      str = str.replace(/,/g, '');
    }
  } else if (str.includes(',')) {
    // 1500,50 -> 1500.50
    str = str.replace(',', '.');
  }

  const num = parseFloat(str);
  const valorFinal = isNaN(num) ? 0 : Math.abs(num);

  let tipo: TipoTransacaoBancaria | undefined = undefined;
  if (ehNegativo || ehDebitoExplicito) tipo = 'DEBITO';
  else if (ehCreditoExplicito) tipo = 'CREDITO';

  return { valor: valorFinal, tipoSugerido: tipo };
}

/**
 * Converte data de qualquer formato comum de extrato para YYYY-MM-DD
 */
export function parsearDataExtrato(dataBruta: any): string | null {
  if (!dataBruta) return null;

  if (dataBruta instanceof Date) {
    if (isNaN(dataBruta.getTime())) return null;
    return dataBruta.toISOString().slice(0, 10);
  }

  // Número serial de data do Excel (ex: 45565)
  if (typeof dataBruta === 'number') {
    const dataExcel = new Date((dataBruta - 25569) * 86400 * 1000);
    if (!isNaN(dataExcel.getTime())) {
      return dataExcel.toISOString().slice(0, 10);
    }
  }

  if (typeof dataBruta === 'string') {
    const str = dataBruta.trim();

    // Formato DD/MM/YYYY ou DD-MM-YYYY
    const matchBR = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (matchBR) {
      const dia = matchBR[1].padStart(2, '0');
      const mes = matchBR[2].padStart(2, '0');
      const ano = matchBR[3];
      return `${ano}-${mes}-${dia}`;
    }

    // Formato YYYY-MM-DD
    const matchISO = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (matchISO) {
      const ano = matchISO[1];
      const mes = matchISO[2].padStart(2, '0');
      const dia = matchISO[3].padStart(2, '0');
      return `${ano}-${mes}-${dia}`;
    }
  }

  return null;
}
