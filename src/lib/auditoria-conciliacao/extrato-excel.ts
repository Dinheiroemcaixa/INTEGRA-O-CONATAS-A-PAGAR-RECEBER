/**
 * MÓDULO: Auditoria Inteligente de Conciliação Bancária
 * CAMINHO: src/lib/auditoria-conciliacao/extrato-excel.ts
 * 
 * Parser para extratos bancários em formato Excel (.xlsx, .xls) com detecção
 * inteligente de abas, cabeçalhos dinâmicos e conversão canônica.
 */

import ExcelJS from 'exceljs';
import { TransacaoExtratoCanonica, TipoTransacaoBancaria } from './tipos';
import {
  parsearDataExtrato,
  parsearValorMonetario,
  sanitizarDescricao,
  calcularHashTransacao
} from './normalizador';

export interface OpcoesParserExcel {
  bancoNome?: string;
  nomeAba?: string;
}

/**
 * Normaliza e processa o conteúdo de um extrato em Excel (Buffer)
 */
export async function parsearExtratoExcel(
  buffer: Buffer,
  opcoes: OpcoesParserExcel = {}
): Promise<TransacaoExtratoCanonica[]> {
  const banco = opcoes.bancoNome || 'BANCO_GENERICO';
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);

  const worksheet = opcoes.nomeAba 
    ? workbook.getWorksheet(opcoes.nomeAba) 
    : workbook.worksheets[0];

  if (!worksheet) {
    throw new Error('Nenhuma planilha legível encontrada no arquivo Excel.');
  }

  const transacoes: TransacaoExtratoCanonica[] = [];

  // 1. Localiza a linha do cabeçalho procurando termos-chave
  let linhaCabecalho = 1;
  let mapaColunas: Record<string, number> = {};

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (Object.keys(mapaColunas).length > 0) return; // Já achou

    const valoresTexto = row.values as any[];
    const textosLinha = valoresTexto.map(v => String(v || '').trim().toUpperCase());

    const temData = textosLinha.some(t => /^(DATA|DT|DATA[\s_]MOV|DATA[\s_]LANC)/i.test(t));
    const temDescricao = textosLinha.some(t => /^(HISTORICO|DESCRICAO|LANCAMENTO|HIST|DETALHE|MOVIMENTACAO)/i.test(t));
    const temValor = textosLinha.some(t => /^(VALOR|VL|DEBITO|CREDITO)/i.test(t));

    if (temData && (temDescricao || temValor)) {
      linhaCabecalho = rowNumber;
      textosLinha.forEach((texto, colIdx) => {
        if (/^(DATA|DT|DATA[\s_]MOV|DATA[\s_]LANC)/i.test(texto)) mapaColunas['data'] = colIdx;
        else if (/^(HISTORICO|DESCRICAO|LANCAMENTO|HIST|DETALHE|MOVIMENTACAO)/i.test(texto)) mapaColunas['descricao'] = colIdx;
        else if (/^(DOCTO|DOC|NUM[\s_]DOC|DOCUMENTO|AUTENTICACAO)/i.test(texto)) mapaColunas['documento'] = colIdx;
        else if (/^(VALOR|VL|VALOR[\s_]LANC)/i.test(texto)) mapaColunas['valor'] = colIdx;
        else if (/^(DEBITO|DEB|SAIDA)/i.test(texto)) mapaColunas['debito'] = colIdx;
        else if (/^(CREDITO|CRED|ENTRADA)/i.test(texto)) mapaColunas['credito'] = colIdx;
        else if (/^(TIPO|D\/C|DC|OPERACAO)/i.test(texto)) mapaColunas['tipo'] = colIdx;
      });
    }
  });

  // Se não achou linha de cabeçalho formal, assume colunas padrão 1 a 4
  if (Object.keys(mapaColunas).length === 0) {
    mapaColunas = { data: 1, descricao: 2, documento: 3, valor: 4 };
    linhaCabecalho = 1;
  }

  // 2. Itera sobre as linhas de dados
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber <= linhaCabecalho) return;

    const rowValues = row.values as any[];
    const celulaData = rowValues[mapaColunas['data']];
    const celulaDesc = rowValues[mapaColunas['descricao']];

    const dataIso = parsearDataExtrato(celulaData);
    const descricaoOrig = celulaDesc ? String(celulaDesc).trim() : '';

    if (!dataIso || !descricaoOrig) return;

    // Ignora linhas de saldo e consolidação
    const descUpper = descricaoOrig.toUpperCase();
    if (descUpper.includes('SALDO ANTERIOR') || descUpper.includes('SALDO ATUAL') || descUpper.includes('SALDO FINAL')) {
      return;
    }

    let valor = 0;
    let tipo: TipoTransacaoBancaria = 'DEBITO';

    // Cenário A: Colunas distintas de débito e crédito
    if (mapaColunas['debito'] && mapaColunas['credito']) {
      const resDeb = parsearValorMonetario(rowValues[mapaColunas['debito']]);
      const resCred = parsearValorMonetario(rowValues[mapaColunas['credito']]);

      if (resDeb.valor > 0) {
        valor = resDeb.valor;
        tipo = 'DEBITO';
      } else if (resCred.valor > 0) {
        valor = resCred.valor;
        tipo = 'CREDITO';
      }
    } else if (mapaColunas['valor']) {
      // Cenário B: Coluna única de valor
      const resVal = parsearValorMonetario(rowValues[mapaColunas['valor']]);
      valor = resVal.valor;

      if (mapaColunas['tipo'] && rowValues[mapaColunas['tipo']]) {
        const tipoStr = String(rowValues[mapaColunas['tipo']]).trim().toUpperCase();
        if (tipoStr.startsWith('D')) tipo = 'DEBITO';
        else if (tipoStr.startsWith('C')) tipo = 'CREDITO';
      } else if (resVal.tipoSugerido) {
        tipo = resVal.tipoSugerido;
      }
    }

    if (valor <= 0) return;

    const documento = mapaColunas['documento'] && rowValues[mapaColunas['documento']] 
      ? String(rowValues[mapaColunas['documento']]).trim() 
      : null;

    const descSanitizada = sanitizarDescricao(descricaoOrig);
    const id = calcularHashTransacao(banco, dataIso, valor, tipo, descricaoOrig, documento);

    transacoes.push({
      id,
      data: dataIso,
      descricaoOriginal: descricaoOrig,
      descricaoSanitizada: descSanitizada,
      documento,
      valor,
      tipo
    });
  });

  return transacoes;
}
