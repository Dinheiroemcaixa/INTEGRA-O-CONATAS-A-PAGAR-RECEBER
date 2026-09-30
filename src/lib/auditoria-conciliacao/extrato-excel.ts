/**
 * MÓDULO: Auditoria Inteligente de Conciliação Bancária
 * CAMINHO: src/lib/auditoria-conciliacao/extrato-excel.ts
 * 
 * Parser para extratos bancários em formato Excel (.xlsx, .xls) com detecção
 * inteligente de abas, cabeçalhos dinâmicos e conversão canônica.
 */

import * as XLSX from 'xlsx';
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
 * Utiliza o SheetJS (xlsx) para máxima compatibilidade com planilhas geradas por
 * Microsoft Excel, LibreOffice, Google Sheets e extratos bancários de diversos bancos,
 * evitando erros de parsing XML (ex.: lastModifiedBy) do ExcelJS.
 */
export async function parsearExtratoExcel(
  buffer: Buffer,
  opcoes: OpcoesParserExcel = {}
): Promise<TransacaoExtratoCanonica[]> {
  const banco = opcoes.bancoNome || 'BANCO_GENERICO';

  // 1. Leitura tolerante via SheetJS (suporta .xlsx, .xls OLE2/BIFF8 e formatos híbridos)
  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    cellDates: true,
    raw: false,
    dateNF: 'yyyy-mm-dd'
  });

  const sheetName = opcoes.nomeAba && workbook.SheetNames.includes(opcoes.nomeAba)
    ? opcoes.nomeAba
    : workbook.SheetNames[0];

  if (!sheetName || !workbook.Sheets[sheetName]) {
    throw new Error('Nenhuma planilha legível encontrada no arquivo Excel.');
  }

  const worksheet = workbook.Sheets[sheetName];

  // Matriz de dados 0-based: linhas x colunas
  const matrizLinhas: any[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    raw: false,
    blankrows: false
  });

  if (!matrizLinhas || matrizLinhas.length === 0) {
    throw new Error('A planilha selecionada está vazia ou sem linhas legíveis.');
  }

  const transacoes: TransacaoExtratoCanonica[] = [];

  // 2. Localiza a linha do cabeçalho procurando termos-chave
  let linhaCabecalhoIdx = -1;
  let mapaColunas: Record<string, number> = {};

  for (let r = 0; r < matrizLinhas.length; r++) {
    const linha = matrizLinhas[r];
    if (!Array.isArray(linha)) continue;

    const textosLinha = linha.map(v => String(v || '').trim().toUpperCase());

    const temData = textosLinha.some(t => /^(DATA|DT|DATA[\s_]MOV|DATA[\s_]LANC)/i.test(t));
    const temDescricao = textosLinha.some(t => /^(HISTORICO|DESCRICAO|LANCAMENTO|HIST|DETALHE|MOVIMENTACAO)/i.test(t));
    const temValor = textosLinha.some(t => /^(VALOR|VL|DEBITO|CREDITO)/i.test(t));

    if (temData && (temDescricao || temValor)) {
      linhaCabecalhoIdx = r;
      textosLinha.forEach((texto, colIdx) => {
        if (/^(DATA|DT|DATA[\s_]MOV|DATA[\s_]LANC)/i.test(texto)) mapaColunas['data'] = colIdx;
        else if (/^(HISTORICO|DESCRICAO|LANCAMENTO|HIST|DETALHE|MOVIMENTACAO)/i.test(texto)) mapaColunas['descricao'] = colIdx;
        else if (/^(DOCTO|DOC|NUM[\s_]DOC|DOCUMENTO|AUTENTICACAO)/i.test(texto)) mapaColunas['documento'] = colIdx;
        else if (/^(VALOR|VL|VALOR[\s_]LANC)/i.test(texto)) mapaColunas['valor'] = colIdx;
        else if (/^(DEBITO|DEB|SAIDA)/i.test(texto)) mapaColunas['debito'] = colIdx;
        else if (/^(CREDITO|CRED|ENTRADA)/i.test(texto)) mapaColunas['credito'] = colIdx;
        else if (/^(TIPO|D\/C|DC|OPERACAO)/i.test(texto)) mapaColunas['tipo'] = colIdx;
      });
      break;
    }
  }

  // Se não achou linha de cabeçalho formal, assume colunas padrão 0 a 3
  if (linhaCabecalhoIdx === -1 || Object.keys(mapaColunas).length === 0) {
    mapaColunas = { data: 0, descricao: 1, documento: 2, valor: 3 };
    linhaCabecalhoIdx = 0;
  }

  // 3. Itera sobre as linhas de dados
  for (let r = linhaCabecalhoIdx + 1; r < matrizLinhas.length; r++) {
    const rowValues = matrizLinhas[r];
    if (!Array.isArray(rowValues)) continue;

    const celulaData = rowValues[mapaColunas['data']];
    const celulaDesc = rowValues[mapaColunas['descricao']];

    const dataIso = parsearDataExtrato(celulaData);
    const descricaoOrig = celulaDesc ? String(celulaDesc).trim() : '';

    if (!dataIso || !descricaoOrig) continue;

    // Ignora linhas de saldo e consolidação
    const descUpper = descricaoOrig.toUpperCase();
    if (
      descUpper.includes('SALDO ANTERIOR') ||
      descUpper.includes('SALDO ATUAL') ||
      descUpper.includes('SALDO FINAL') ||
      descUpper.includes('TOTAL')
    ) {
      continue;
    }

    let valor = 0;
    let tipo: TipoTransacaoBancaria = 'DEBITO';

    // Cenário A: Colunas distintas de débito e crédito
    if (mapaColunas['debito'] !== undefined && mapaColunas['credito'] !== undefined) {
      const resDeb = parsearValorMonetario(rowValues[mapaColunas['debito']]);
      const resCred = parsearValorMonetario(rowValues[mapaColunas['credito']]);

      if (resDeb.valor > 0) {
        valor = resDeb.valor;
        tipo = 'DEBITO';
      } else if (resCred.valor > 0) {
        valor = resCred.valor;
        tipo = 'CREDITO';
      }
    } else if (mapaColunas['valor'] !== undefined) {
      // Cenário B: Coluna única de valor
      const resVal = parsearValorMonetario(rowValues[mapaColunas['valor']]);
      valor = resVal.valor;

      if (mapaColunas['tipo'] !== undefined && rowValues[mapaColunas['tipo']]) {
        const tipoStr = String(rowValues[mapaColunas['tipo']]).trim().toUpperCase();
        if (tipoStr.startsWith('D')) tipo = 'DEBITO';
        else if (tipoStr.startsWith('C')) tipo = 'CREDITO';
      } else if (resVal.tipoSugerido) {
        tipo = resVal.tipoSugerido;
      }
    }

    if (valor <= 0) continue;

    const documento = mapaColunas['documento'] !== undefined && rowValues[mapaColunas['documento']]
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
  }

  return transacoes;
}
