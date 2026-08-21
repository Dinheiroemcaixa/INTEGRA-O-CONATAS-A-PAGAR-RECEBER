/**
 * Match de fornecedores por similaridade de texto
 * Compara nomes do Datacar com nomes cadastrados no ContaAzul
 * Também consulta regras De-Para aprendidas de correções manuais
 */

import { normalizarNome, type FornecedorContaAzul } from '@/lib/parsers/fornecedores-contaazul'

export type ConfiancaMatch = 'exato' | 'alto' | 'medio' | 'baixo' | 'nenhum'

export interface ResultadoMatch {
  nomeOriginal: string        // nome vindo do Datacar
  nomeCorrigido: string       // nome cadastrado no ContaAzul
  cnpj: string
  categoria?: string
  confianca: ConfiancaMatch
  score: number               // 0-100
}

/** Regra De-Para aprendida de correções manuais do usuário */
export interface RegraDepara {
  nomeOriginalNormalizado: string
  nomeCorrigido: string
}

export interface ItemDatacarMatch {
  nome: string
  cnpj?: string
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

  // Palavras em comum (ignora palavras irrelevantes ou muito curtas que não sejam siglas)
  const stopwords = new Set([
    'LTDA', 'ME', 'EPP', 'SA', 'EIRELI', 'EIRE', 'LIMI', 'DE', 'DO', 'DA', 'DOS', 'DAS', 'E', 
    'EP', 'MEI', 'MG', 'SP', 'RJ', 'GO', 'PR', 'SC', 'RS', 'ES', 'BA', 'PE', 'CE', 'AM', 'PA',
    'BRASIL', 'BR', 'TELECOM', 'SERVICOS', 'COMERCIO', 'INDUSTRIA'
  ])
  
  const relevantesA = wordsA.filter((w) => w.length >= 2 && !stopwords.has(w))
  const relevantesB = wordsB.filter((w) => w.length >= 2 && !stopwords.has(w))

  if (relevantesA.length === 0 || relevantesB.length === 0) {
    const comuns = wordsA.filter((w) => wordsB.includes(w)).length
    return Math.round((comuns * 2 / (wordsA.length + wordsB.length)) * 100)
  }

  // Palavras relevantes em comum
  const comuns = relevantesA.filter((w) => relevantesB.some((wb) =>
    wb === w || wb.startsWith(w.slice(0, 4)) || w.startsWith(wb.slice(0, 4))
  )).length

  // Cálculo base de Dice Coefficient
  const dice = (comuns * 2) / (relevantesA.length + relevantesB.length)
  let score = dice

  // 1. Bonus se a primeira palavra relevante bate (muito forte para nomes de empresas)
  if (relevantesA[0] === relevantesB[0]) {
    score += 0.20
  }

  // 2. Lógica de Palavra-Chave (Keyword Match)
  // Se uma lista de palavras está totalmente contida na outra, é um match forte, mas não absoluto
  const bContidoEmA = relevantesB.every(wb => relevantesA.some(wa => wa.includes(wb) || wb.includes(wa)))
  const aContidoEmB = relevantesA.every(wa => relevantesB.some(wb => wb.includes(wa) || wa.includes(wb)))

  if (bContidoEmA || aContidoEmB) {
    // Damos um bônus por estar contido, mas sem forçar 80% se houver muita "sujeira" (outras palavras)
    score += 0.25
  }

  return Math.min(100, Math.round(score * 100))
}


function scoreParaConfianca(score: number): ConfiancaMatch {
  if (score >= 95) return 'exato'
  if (score >= 75) return 'alto'
  if (score >= 50) return 'medio'
  if (score >= 30) return 'baixo'
  return 'nenhum'
}

// Regras específicas de "De-Para" legadas/fixas no código
const REGRAS_CUSTOMIZADAS: Record<string, string> = {
  'GP CONTAGEM MG': 'GOMMA PNEUS LTDA',
}

/**
 * Busca o melhor match para um nome de fornecedor do Datacar
 * @param regrasDepara - Regras De-Para aprendidas de correções manuais (consultadas primeiro)
 */
export function matchFornecedor(
  nomeDatacar: string,
  fornecedores: FornecedorContaAzul[],
  regrasDepara?: RegraDepara[],
  cnpjDatacar?: string
): ResultadoMatch {
  const normalizado = normalizarNome(nomeDatacar)

  // 0. Verificar Match EXATO por CNPJ (Mais confiável que nome)
  if (cnpjDatacar && cnpjDatacar.length >= 14) {
    const fEncontrado = fornecedores.find(f => f.cnpj && f.cnpj.replace(/\D/g, '') === cnpjDatacar)
    if (fEncontrado) {
      return {
        nomeOriginal: nomeDatacar,
        nomeCorrigido: fEncontrado.nome,
        cnpj: fEncontrado.cnpj,
        categoria: fEncontrado.categoria,
        confianca: 'exato',
        score: 100,
      }
    }
  }

  // 1. Verificar regras customizadas (De-Para específico fixo)
  if (REGRAS_CUSTOMIZADAS[normalizado]) {
    const nomeAlvo = REGRAS_CUSTOMIZADAS[normalizado]
    const fEncontrado = fornecedores.find(f => 
      f.nome === nomeAlvo || f.nomeNormalizado === normalizarNome(nomeAlvo)
    )
    return {
      nomeOriginal: nomeDatacar,
      nomeCorrigido: nomeAlvo,
      cnpj: fEncontrado?.cnpj || '',
      categoria: fEncontrado?.categoria,
      confianca: 'exato',
      score: 100,
    }
  }

  // 2. Verificar regras De-Para aprendidas (correções manuais salvas no banco)
  if (regrasDepara && regrasDepara.length > 0) {
    const regra = regrasDepara.find(r => r.nomeOriginalNormalizado === normalizado)
    if (regra) {
      const fEncontrado = fornecedores.find(f => 
        f.nome === regra.nomeCorrigido || f.nomeNormalizado === normalizarNome(regra.nomeCorrigido)
      )
      return {
        nomeOriginal: nomeDatacar,
        nomeCorrigido: regra.nomeCorrigido,
        cnpj: fEncontrado?.cnpj || '',
        categoria: fEncontrado?.categoria,
        confianca: 'exato',
        score: 100,
      }
    }
  }

  let melhorScore = 0
  let melhorFornecedor: FornecedorContaAzul | null = null

  for (const f of fornecedores) {
    // Match exato
    if (f.nomeNormalizado === normalizado) {
      return {
        nomeOriginal: nomeDatacar,
        nomeCorrigido: f.nome,
        cnpj: f.cnpj,
        categoria: f.categoria,
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
    categoria: melhorFornecedor.categoria,
    confianca: scoreParaConfianca(melhorScore),
    score: melhorScore,
  }
}

/**
 * Aplica match em lote para uma lista de fornecedores do Datacar
 * @param regrasDepara - Regras De-Para aprendidas (consultadas antes do match por similaridade)
 */
export function matchFornecedoresEmLote(
  itensDatacar: ItemDatacarMatch[],
  fornecedores: FornecedorContaAzul[],
  regrasDepara?: RegraDepara[]
): Map<string, ResultadoMatch> {
  const resultado = new Map<string, ResultadoMatch>()
  // Cache para não repetir match do mesmo nome+cnpj
  const cache = new Map<string, ResultadoMatch>()

  for (const item of itensDatacar) {
    const cacheKey = `${item.nome}|${item.cnpj || ''}`
    if (!cache.has(cacheKey)) {
      cache.set(cacheKey, matchFornecedor(item.nome, fornecedores, regrasDepara, item.cnpj))
    }
    resultado.set(item.nome, cache.get(cacheKey)!)
  }

  return resultado
}
