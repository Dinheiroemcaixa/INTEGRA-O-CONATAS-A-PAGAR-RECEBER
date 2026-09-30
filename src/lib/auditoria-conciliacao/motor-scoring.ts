/**
 * MÓDULO: Auditoria Inteligente de Conciliação Bancária
 * CAMINHO: src/lib/auditoria-conciliacao/motor-scoring.ts
 * 
 * Motor de Pontuação Matemática e Similaridade:
 * 1. Calcula os 6 sub-scores calibrados:
 *    - Valor Financeiro (35%)
 *    - Proximidade Temporal (20%)
 *    - Similaridade de Fornecedor (20%)
 *    - Descrição Normalizada (10%)
 *    - Documento / NSU / PIX (10%)
 *    - Coerência de Categoria (5%)
 * 2. Produz o Score de Confiança Global ponderado [0 a 100].
 */

import { TransacaoExtratoCanonica, LancamentoContaAzulAuditavel } from './tipos';
import { sanitizarDescricao } from './normalizador';

export interface ParametrosToleranciaScoring {
  diasToleranciaCompensacao: number; // Padrão: 3 dias
  centavosToleranciaArredondamento: number; // Padrão: R$ 0.05
  centavosToleranciaTarifa: number; // Padrão: R$ 0.50
}

export interface SubScoresCalculados {
  scoreValor: number;       // 0 a 100
  scoreData: number;        // 0 a 100
  scoreFornecedor: number;  // 0 a 100
  scoreDescricao: number;   // 0 a 100
  scoreDocumento: number;   // 0 a 100
  scoreCategoria: number;   // 0 a 100
  scoreGlobal: number;      // 0 a 100 (ponderado)
}

export interface IMotorScoring {
  calcularScores(
    extrato: TransacaoExtratoCanonica,
    ca: LancamentoContaAzulAuditavel,
    tolerancia?: Partial<ParametrosToleranciaScoring>
  ): SubScoresCalculados;
}

const TOLERANCIA_PADRAO: ParametrosToleranciaScoring = {
  diasToleranciaCompensacao: 3,
  centavosToleranciaArredondamento: 0.05,
  centavosToleranciaTarifa: 0.50
};

/**
 * Similaridade Levenshtein normalizada [0 a 100]
 */
export function calcularSimilaridadeLevenshtein(str1: string, str2: string): number {
  const s1 = (str1 || '').trim().toUpperCase();
  const s2 = (str2 || '').trim().toUpperCase();
  if (s1 === s2) return 100;
  if (!s1.length || !s2.length) return 0;

  const len1 = s1.length;
  const len2 = s2.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,       // deleção
        matrix[i][j - 1] + 1,       // inserção
        matrix[i - 1][j - 1] + cost // substituição
      );
    }
  }

  const maxLen = Math.max(len1, len2);
  const distance = matrix[len1][len2];
  return Math.max(0, Math.round((1 - distance / maxLen) * 100));
}

/**
 * Similaridade Jaro-Winkler [0 a 100]
 */
export function calcularSimilaridadeJaroWinkler(str1: string, str2: string): number {
  const s1 = (str1 || '').trim().toUpperCase();
  const s2 = (str2 || '').trim().toUpperCase();
  if (s1 === s2) return 100;
  if (!s1.length || !s2.length) return 0;

  const matchDistance = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);

  let matches = 0;
  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, s2.length);

    for (let j = start; j < end; j++) {
      if (!s2Matches[j] && s1[i] === s2[j]) {
        s1Matches[i] = true;
        s2Matches[j] = true;
        matches++;
        break;
      }
    }
  }

  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  const jaro =
    (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3;

  // Winkler prefix boost (máx 4 caracteres iguais no prefixo)
  let prefix = 0;
  for (let i = 0; i < Math.min(4, s1.length, s2.length); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }

  const jaroWinkler = jaro + prefix * 0.1 * (1 - jaro);
  return Math.min(100, Math.round(jaroWinkler * 100));
}

/**
 * 1. Score de Valor Financeiro (Peso 35%)
 */
export function calcularScoreValor(
  valorExtrato: number,
  valorCa: number,
  toleranciaCentavosArredondamento = 0.05,
  toleranciaCentavosTarifa = 0.50
): number {
  const delta = Math.abs(valorExtrato - valorCa);
  if (delta === 0) return 100;
  if (delta <= toleranciaCentavosArredondamento) return 95;
  if (delta <= toleranciaCentavosTarifa) return 80;

  // Penalização proporcional à magnitude do desvio
  if (valorExtrato <= 0) return 0;
  const desvioPercentual = (delta / valorExtrato) * 200;
  return Math.max(0, Math.round(100 - desvioPercentual));
}

/**
 * 2. Score de Proximidade Temporal (Peso 20%)
 */
export function calcularScoreData(
  dataExtrato: string,
  dataCa: string
): number {
  if (!dataExtrato || !dataCa) return 0;
  const d1 = new Date(dataExtrato.slice(0, 10)).getTime();
  const d2 = new Date(dataCa.slice(0, 10)).getTime();
  if (isNaN(d1) || isNaN(d2)) return 0;

  const diffDias = Math.round(Math.abs(d1 - d2) / (1000 * 60 * 60 * 24));
  if (diffDias === 0) return 100;
  if (diffDias === 1) return 90;
  if (diffDias <= 3) return 80; // Final de semana / feriado
  if (diffDias <= 5) return 60;
  return Math.max(0, Math.round(50 - (diffDias - 5) * 10));
}

/**
 * 3. Score de Similaridade de Fornecedor / Cliente (Peso 20%)
 */
export function calcularScoreFornecedor(
  nomeBeneficiarioExtrato: string,
  nomeContatoCa: string,
  cpfCnpjExtrato?: string | null,
  cpfCnpjCa?: string | null
): number {
  // Se ambos possuem CNPJ/CPF e coincidem
  if (cpfCnpjExtrato && cpfCnpjCa) {
    const cleanDoc1 = cpfCnpjExtrato.replace(/\D/g, '');
    const cleanDoc2 = cpfCnpjCa.replace(/\D/g, '');
    if (cleanDoc1 && cleanDoc1 === cleanDoc2) {
      return 100;
    }
  }

  const s1 = sanitizarDescricao(nomeBeneficiarioExtrato);
  const s2 = sanitizarDescricao(nomeContatoCa);
  if (!s1 || !s2) return 30; // Baixo se um dos lados não tiver nome claro

  if (s1 === s2) return 100;

  const jw = calcularSimilaridadeJaroWinkler(s1, s2);
  const lev = calcularSimilaridadeLevenshtein(s1, s2);

  return Math.round(0.6 * jw + 0.4 * lev);
}

/**
 * 4. Score de Descrição Normalizada (Peso 10%)
 */
export function calcularScoreDescricao(
  descricaoExtrato: string,
  descricaoCa: string
): number {
  const s1 = sanitizarDescricao(descricaoExtrato);
  const s2 = sanitizarDescricao(descricaoCa);
  if (!s1 || !s2) return 30;
  if (s1 === s2) return 100;

  const tokens1 = new Set(s1.split(/\s+/));
  const tokens2 = new Set(s2.split(/\s+/));

  let comuns = 0;
  for (const t of tokens1) {
    if (tokens2.has(t)) comuns++;
  }

  const totalUnicos = new Set([...tokens1, ...tokens2]).size;
  if (totalUnicos === 0) return 30;

  const jaccard = (comuns / totalUnicos) * 100;
  const lev = calcularSimilaridadeLevenshtein(s1, s2);

  return Math.round(0.5 * jaccard + 0.5 * lev);
}

/**
 * 5. Score de Documento / NSU / Identificador Bancário (Peso 10%)
 */
export function calcularScoreDocumento(
  docExtrato?: string | null,
  docCa?: string | null
): number {
  const d1 = (docExtrato || '').replace(/[^A-Za-z0-9]/g, '').trim().toUpperCase();
  const d2 = (docCa || '').replace(/[^A-Za-z0-9]/g, '').trim().toUpperCase();

  if (d1 && d2) {
    return d1 === d2 ? 100 : 0;
  }
  // Se ausente em ambos ou presente apenas em um, atribui pontuação neutra
  return 70;
}

/**
 * 6. Score de Coerência de Categoria (Peso 5%)
 */
export function calcularScoreCategoria(
  categoriaCaNome?: string | null,
  tipoEventoCa?: string | null
): number {
  if (!categoriaCaNome || categoriaCaNome === 'Sem Categoria') {
    return 40;
  }
  return 100;
}

/**
 * Implementação da interface IMotorScoring
 */
export class MotorScoring implements IMotorScoring {
  public calcularScores(
    extrato: TransacaoExtratoCanonica,
    ca: LancamentoContaAzulAuditavel,
    tolerancia?: Partial<ParametrosToleranciaScoring>
  ): SubScoresCalculados {
    const config = { ...TOLERANCIA_PADRAO, ...tolerancia };

    const scoreValor = calcularScoreValor(
      extrato.valor,
      ca.valorPago || ca.valorTotal,
      config.centavosToleranciaArredondamento,
      config.centavosToleranciaTarifa
    );

    const dataCa = ca.dataPagamento || ca.dataVencimento;
    const scoreData = calcularScoreData(extrato.data, dataCa);

    const scoreFornecedor = calcularScoreFornecedor(
      extrato.descricaoSanitizada || extrato.descricaoOriginal,
      ca.fornecedorClienteNome,
      null,
      ca.fornecedorCpfCnpj
    );

    const scoreDescricao = calcularScoreDescricao(
      extrato.descricaoOriginal,
      ca.descricao || ca.fornecedorClienteNome
    );

    const scoreDocumento = calcularScoreDocumento(
      extrato.documento,
      ca.parcelaId || ca.eventoId
    );

    const scoreCategoria = calcularScoreCategoria(ca.categoriaNome, ca.tipoEvento);

    // Média Ponderada Oficial: 35% valor + 20% data + 20% fornecedor + 10% desc + 10% doc + 5% cat
    const scoreGlobal = Math.round(
      0.35 * scoreValor +
      0.20 * scoreData +
      0.20 * scoreFornecedor +
      0.10 * scoreDescricao +
      0.10 * scoreDocumento +
      0.05 * scoreCategoria
    );

    return {
      scoreValor,
      scoreData,
      scoreFornecedor,
      scoreDescricao,
      scoreDocumento,
      scoreCategoria,
      scoreGlobal: Math.min(100, Math.max(0, scoreGlobal))
    };
  }
}
