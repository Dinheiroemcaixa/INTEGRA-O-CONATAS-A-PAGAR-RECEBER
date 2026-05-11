/**
 * Match de fornecedores por similaridade de texto
 * Compara nomes do Datacar com nomes cadastrados no ContaAzul
 */

import { normalizarNome, type FornecedorContaAzul } from '@/lib/parsers/fornecedores-contaazul'

export type ConfiancaMatch = 'exato' | 'alto' | 'medio' | 'baixo' | 'nenhum'

export interface ResultadoMatch {
  nomeOriginal: string        // nome vindo do Datacar
  nomeCorrigido: string       // nome cadastrado no ContaAzul
  cnpj: string
  confianca: ConfiancaMatch
  score: number               // 0-100
}

/**
 * Calcula score de similaridade entre duas strings normalizadas
 * Usa combinação de: palavras em comum + ordem das palavras
 */
function calcularSimilaridade(a: string, b: string): number {
  if (a === b) return 100

  const wordsA = a.split(' ').filter(Boolean)
  const wordsB = b.split(' ').filter(Boolean)

  if (wordsA.length === 0 || wordsB.length === 0) return 0

  // Palavras em comum (ignora palavras curtas tipo LTDA, ME, EPP, SA, EIRELI)
  const stopwords = new Set(['LTDA', 'ME', 'EPP', 'SA', 'EIRELI', 'EIRE', 'LIMI', 'DE', 'DO', 'DA', 'DOS', 'DAS', 'E'])
  const relevantesA = wordsA.filter((w) => w.length > 2 && !stopwords.has(w))
  const relevantesB = wordsB.filter((w) => w.length > 2 && !stopwords.has(w))

  if (relevantesA.length === 0 || relevantesB.length === 0) {
    // fallback: comparar todas as palavras
    const comuns = wordsA.filter((w) => wordsB.includes(w)).length
    return Math.round((comuns * 2 / (wordsA.length + wordsB.length)) * 100)
  }

  // Palavras relevantes em comum
  const comuns = relevantesA.filter((w) => relevantesB.some((wb) =>
    wb === w || wb.startsWith(w.slice(0, 4)) || w.startsWith(wb.slice(0, 4))
  )).length

  const scorePalavras = (comuns * 2) / (relevantesA.length + relevantesB.length)

  // Bonus se a primeira palavra relevante bate
  const bonusPrimeira = relevantesA[0] === relevantesB[0] ? 0.15 : 0

  return Math.min(100, Math.round((scorePalavras + bonusPrimeira) * 100))
}

function scoreParaConfianca(score: number): ConfiancaMatch {
  if (score === 100) return 'exato'
  if (score >= 75)  return 'alto'
  if (score >= 50)  return 'medio'
  if (score >= 30)  return 'baixo'
  return 'nenhum'
}

/**
 * Busca o melhor match para um nome de fornecedor do Datacar
 */
export function matchFornecedor(
  nomeDatacar: string,
  fornecedores: FornecedorContaAzul[]
): ResultadoMatch {
  const normalizado = normalizarNome(nomeDatacar)

  let melhorScore = 0
  let melhorFornecedor: FornecedorContaAzul | null = null

  for (const f of fornecedores) {
    // Match exato
    if (f.nomeNormalizado === normalizado) {
      return {
        nomeOriginal: nomeDatacar,
        nomeCorrigido: f.nome,
        cnpj: f.cnpj,
        confianca: 'exato',
        score: 100,
      }
    }

    const score = calcularSimilaridade(normalizado, f.nomeNormalizado)
    if (score > melhorScore) {
      melhorScore = score
      melhorFornecedor = f
    }
  }

  if (!melhorFornecedor || melhorScore < 30) {
    return {
      nomeOriginal: nomeDatacar,
      nomeCorrigido: nomeDatacar, // mantém original
      cnpj: '',
      confianca: 'nenhum',
      score: melhorScore,
    }
  }

  return {
    nomeOriginal: nomeDatacar,
    nomeCorrigido: melhorFornecedor.nome,
    cnpj: melhorFornecedor.cnpj,
    confianca: scoreParaConfianca(melhorScore),
    score: melhorScore,
  }
}

/**
 * Aplica match em lote para uma lista de fornecedores do Datacar
 */
export function matchFornecedoresEmLote(
  nomesDatacar: string[],
  fornecedores: FornecedorContaAzul[]
): Map<string, ResultadoMatch> {
  const resultado = new Map<string, ResultadoMatch>()
  // Cache para não repetir match do mesmo nome
  const cache = new Map<string, ResultadoMatch>()

  for (const nome of nomesDatacar) {
    if (!cache.has(nome)) {
      cache.set(nome, matchFornecedor(nome, fornecedores))
    }
    resultado.set(nome, cache.get(nome)!)
  }

  return resultado
}
