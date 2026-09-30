/**
 * MÓDULO: Auditoria Inteligente de Conciliação Bancária
 * CAMINHO: src/lib/auditoria-conciliacao/extrato-csv.ts
 * 
 * Parser para extratos bancários em formato CSV com detecção heurística de delimitadores e colunas.
 */

import Papa from 'papaparse';
import { TransacaoExtratoCanonica, TipoTransacaoBancaria } from './tipos';
import {
  parsearDataExtrato,
  parsearValorMonetario,
  sanitizarDescricao,
  calcularHashTransacao
} from './normalizador';

export interface OpcoesParserCsv {
  bancoNome?: string;
  delimitador?: string;
}

/**
 * Normaliza e processa o conteúdo de um extrato em CSV
 */
export async function parsearExtratoCsv(
  conteudoCsv: string,
  opcoes: OpcoesParserCsv = {}
): Promise<TransacaoExtratoCanonica[]> {
  const banco = opcoes.bancoNome || 'BANCO_GENERICO';

  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, any>>(conteudoCsv, {
      header: true,
      skipEmptyLines: true,
      delimiter: opcoes.delimitador || '', // Auto-detecta ';' ou ','
      transformHeader: (header: string) => header.trim().toUpperCase(),
      complete: (results) => {
        try {
          const transacoes: TransacaoExtratoCanonica[] = [];
          const headers = results.meta.fields || [];

          // Identificação de colunas por similaridade
          const colData = headers.find(h => /^(DATA|DT|DATA[\s_]MOV|DATA[\s_]LANC)/i.test(h)) || 'DATA';
          const colDesc = headers.find(h => /^(HISTORICO|DESCRICAO|LANCAMENTO|HIST|DETALHE|MOVIMENTACAO)/i.test(h)) || 'HISTORICO';
          const colDoc = headers.find(h => /^(DOCTO|DOC|NUM[\s_]DOC|DOCUMENTO|AUTENTICACAO)/i.test(h));
          const colValor = headers.find(h => /^(VALOR|VL|VALOR[\s_]LANC)/i.test(h));
          const colDebito = headers.find(h => /^(DEBITO|DEB|SAIDA)/i.test(h));
          const colCredito = headers.find(h => /^(CREDITO|CRED|ENTRADA)/i.test(h));
          const colTipo = headers.find(h => /^(TIPO|D\/C|DC|OPERACAO)/i.test(h));

          for (const row of results.data) {
            const dataIso = parsearDataExtrato(row[colData]);
            const descricaoOrig = String(row[colDesc] || '').trim();

            if (!dataIso || !descricaoOrig) {
              continue;
            }

            // Ignora linhas de saldo consolidado
            const descUpper = descricaoOrig.toUpperCase();
            if (descUpper.includes('SALDO ANTERIOR') || descUpper.includes('SALDO ATUAL') || descUpper.includes('SALDO FINAL')) {
              continue;
            }

            let valor = 0;
            let tipo: TipoTransacaoBancaria = 'DEBITO';

            // Cenário A: Colunas separadas de Débito e Crédito
            if (colDebito && colCredito && (row[colDebito] || row[colCredito])) {
              const resDeb = parsearValorMonetario(row[colDebito]);
              const resCred = parsearValorMonetario(row[colCredito]);

              if (resDeb.valor > 0) {
                valor = resDeb.valor;
                tipo = 'DEBITO';
              } else if (resCred.valor > 0) {
                valor = resCred.valor;
                tipo = 'CREDITO';
              }
            } else if (colValor && row[colValor] !== undefined) {
              // Cenário B: Coluna única de valor
              const resVal = parsearValorMonetario(row[colValor]);
              valor = resVal.valor;

              if (colTipo && row[colTipo]) {
                const tipoStr = String(row[colTipo]).trim().toUpperCase();
                if (tipoStr.startsWith('D')) tipo = 'DEBITO';
                else if (tipoStr.startsWith('C')) tipo = 'CREDITO';
              } else if (resVal.tipoSugerido) {
                tipo = resVal.tipoSugerido;
              }
            }

            if (valor <= 0) {
              continue;
            }

            const documento = colDoc && row[colDoc] ? String(row[colDoc]).trim() : null;
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

          resolve(transacoes);
        } catch (err) {
          reject(err);
        }
      },
      error: (err: any) => reject(err)
    });
  });
}
