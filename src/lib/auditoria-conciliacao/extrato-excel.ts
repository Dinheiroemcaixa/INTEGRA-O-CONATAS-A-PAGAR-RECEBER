/**
 * MÓDULO: Auditoria Inteligente de Conciliação Bancária
 * CAMINHO: src/lib/auditoria-conciliacao/extrato-excel.ts
 * 
 * Parser resiliente para extratos bancários em formato Excel (.xlsx, .xls) com
 * recálculo automático de dimensões reais de planilha (!ref truncado por bancos),
 * normalização NFD de acentos em cabeçalhos dinâmicos e conversão canônica de lançamentos.
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
 * Remove acentos, pontuações residuais e coloca em maiúsculas para comparações flexíveis
 */
function normalizarTexto(txt: any): string {
  return String(txt || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

/**
 * Recalcula o range real (!ref) da planilha a partir de todas as células presentes.
 * Resolve o problema comum de extratos de bancos (ex.: Itaú) que definem !ref com
 * metadados truncados (ex.: A1:F13), ocultando centenas de linhas reais subsequentes.
 */
function recalcularRangeReal(worksheet: XLSX.WorkSheet): void {
  let minRow = Infinity, maxRow = -1;
  let minCol = Infinity, maxCol = -1;

  for (const key of Object.keys(worksheet)) {
    if (key.startsWith('!')) continue;
    try {
      const cell = XLSX.utils.decode_cell(key);
      if (cell.r < minRow) minRow = cell.r;
      if (cell.r > maxRow) maxRow = cell.r;
      if (cell.c < minCol) minCol = cell.c;
      if (cell.c > maxCol) maxCol = cell.c;
    } catch {
      // Ignora chaves inválidas
    }
  }

  if (maxRow >= 0 && maxCol >= 0) {
    worksheet['!ref'] = XLSX.utils.encode_range({
      s: { r: minRow === Infinity ? 0 : minRow, c: minCol === Infinity ? 0 : minCol },
      e: { r: maxRow, c: maxCol }
    });
  }
}

/**
 * Normaliza e processa o conteúdo de um extrato em Excel (Buffer)
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

  // 2. Garante que o range cobrirá todas as células reais do arquivo
  recalcularRangeReal(worksheet);

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

  // 3. Localiza a linha do cabeçalho procurando termos-chave normalizados (sem acentos)
  let linhaCabecalhoIdx = -1;
  let mapaColunas: Record<string, number> = {};

  for (let r = 0; r < matrizLinhas.length; r++) {
    const linha = matrizLinhas[r];
    if (!Array.isArray(linha)) continue;

    const textosLinha = linha.map(normalizarTexto);

    const idxData = textosLinha.findIndex(t => /^(DATA|DT|DATA[\s_]MOV|DATA[\s_]LANC)/i.test(t) || t === 'DATA');
    const idxDesc = textosLinha.findIndex(t => /^(LANCAMENTO|HISTORICO|DESCRICAO|DETALHE|MOVIMENTACAO|HIST|MOVIMENTO)/i.test(t));
    const idxValor = textosLinha.findIndex(t => (/VALOR|VL/i.test(t)) && !/SALDO/i.test(t));
    const idxDebito = textosLinha.findIndex(t => /^(DEBITO|DEB|SAIDA)/i.test(t));
    const idxCredito = textosLinha.findIndex(t => /^(CREDITO|CRED|ENTRADA)/i.test(t));

    // Se encontrou Data e (Descrição ou Valor ou Débito/Crédito)
    if (idxData !== -1 && (idxDesc !== -1 || idxValor !== -1 || (idxDebito !== -1 && idxCredito !== -1))) {
      linhaCabecalhoIdx = r;

      textosLinha.forEach((texto, colIdx) => {
        if (/^(DATA|DT|DATA[\s_]MOV|DATA[\s_]LANC)/i.test(texto) || texto === 'DATA') {
          if (mapaColunas['data'] === undefined) mapaColunas['data'] = colIdx;
        } else if (/^(LANCAMENTO|HISTORICO|DESCRICAO|DETALHE|MOVIMENTACAO|HIST|MOVIMENTO)/i.test(texto)) {
          if (mapaColunas['descricao'] === undefined) mapaColunas['descricao'] = colIdx;
        } else if (/^(RAZAO[\s_]SOCIAL|FORNECEDOR|CLIENTE|BENEFICIARIO|NOME)/i.test(texto)) {
          if (mapaColunas['razaoSocial'] === undefined) mapaColunas['razaoSocial'] = colIdx;
        } else if (/^(DOCTO|DOC|NUM[\s_]DOC|DOCUMENTO|CPF|CNPJ|AUTENTICACAO)/i.test(texto)) {
          if (mapaColunas['documento'] === undefined) mapaColunas['documento'] = colIdx;
        } else if ((/VALOR|VL/i.test(texto)) && !/SALDO/i.test(texto)) {
          if (mapaColunas['valor'] === undefined) mapaColunas['valor'] = colIdx;
        } else if (/^(DEBITO|DEB|SAIDA)/i.test(texto)) {
          if (mapaColunas['debito'] === undefined) mapaColunas['debito'] = colIdx;
        } else if (/^(CREDITO|CRED|ENTRADA)/i.test(texto)) {
          if (mapaColunas['credito'] === undefined) mapaColunas['credito'] = colIdx;
        } else if (/^(TIPO|D\/C|DC|OPERACAO)/i.test(texto)) {
          if (mapaColunas['tipo'] === undefined) mapaColunas['tipo'] = colIdx;
        }
      });
      break;
    }
  }

  // Se não achou linha de cabeçalho formal, assume colunas padrão 0 a 3
  if (linhaCabecalhoIdx === -1 || Object.keys(mapaColunas).length === 0) {
    mapaColunas = { data: 0, descricao: 1, documento: 2, valor: 3 };
    linhaCabecalhoIdx = 0;
  }

  // 4. Itera sobre as linhas de dados
  for (let r = linhaCabecalhoIdx + 1; r < matrizLinhas.length; r++) {
    const rowValues = matrizLinhas[r];
    if (!Array.isArray(rowValues)) continue;

    const celulaData = rowValues[mapaColunas['data']];
    const celulaDesc = rowValues[mapaColunas['descricao']];

    const dataIso = parsearDataExtrato(celulaData);
    let descricaoOrig = celulaDesc ? String(celulaDesc).trim() : '';

    if (!dataIso || !descricaoOrig) continue;

    // Ignora linhas de saldo e controle bancário
    const descUpper = normalizarTexto(descricaoOrig);
    if (
      descUpper.includes('SALDO ANTERIOR') ||
      descUpper.includes('SALDO TOTAL') ||
      descUpper.includes('SALDO FINAL') ||
      descUpper.includes('SALDO DISPONIVEL') ||
      descUpper.includes('SALDO DO DIA') ||
      descUpper.includes('TOTAL DISPONIVEL') ||
      descUpper === 'SALDO' ||
      descUpper.includes('S A L D O')
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
      // Cenário B: Coluna única de valor (valores positivos = crédito, negativos = débito)
      const valorCelula = rowValues[mapaColunas['valor']];
      if (valorCelula === '' || valorCelula === null || valorCelula === undefined) {
        // Célula vazia na coluna de valor (ex.: linha de saldo ou rodapé)
        continue;
      }

      const resVal = parsearValorMonetario(valorCelula);
      valor = resVal.valor;

      if (mapaColunas['tipo'] !== undefined && rowValues[mapaColunas['tipo']]) {
        const tipoStr = String(rowValues[mapaColunas['tipo']]).trim().toUpperCase();
        if (tipoStr.startsWith('D')) tipo = 'DEBITO';
        else if (tipoStr.startsWith('C')) tipo = 'CREDITO';
      } else if (resVal.tipoSugerido) {
        tipo = resVal.tipoSugerido;
      } else {
        // Em coluna única com sinal: valor numérico com sinal negativo é DÉBITO, positivo é CRÉDITO
        const numOriginal = typeof valorCelula === 'number' 
          ? valorCelula 
          : parseFloat(String(valorCelula).replace(/[^\d.,-]/g, '').replace(',', '.'));
        
        tipo = numOriginal < 0 ? 'DEBITO' : 'CREDITO';
      }

      // Inferência semântica de reforço a partir do histórico/descrição
      const descNorm = normalizarTexto(descricaoOrig);
      if (/^(RECEBIMENTO|PIX RECEBIDO|PIX QR CODE RECEBIDO|CREDITO|DEPOSITO|RESGATE)/i.test(descNorm)) {
        tipo = 'CREDITO';
      } else if (/^(BOLETO PAGO|PIX ENVIADO|PAGTO|PAGAMENTO|DEBITO|DEB AUT|TARIFA|IOF)/i.test(descNorm)) {
        tipo = 'DEBITO';
      }
    }

    // Se o valor for nulo ou zero, ignora
    if (valor <= 0) continue;

    // Enriquece a descrição com Razão Social / Fornecedor se existir
    const razaoSocial = mapaColunas['razaoSocial'] !== undefined && rowValues[mapaColunas['razaoSocial']]
      ? String(rowValues[mapaColunas['razaoSocial']]).trim()
      : '';

    if (razaoSocial && !descricaoOrig.toUpperCase().includes(razaoSocial.toUpperCase())) {
      descricaoOrig = `${descricaoOrig} - ${razaoSocial}`;
    }

    // Identifica documento ou CPF/CNPJ
    let documento = mapaColunas['documento'] !== undefined && rowValues[mapaColunas['documento']]
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
