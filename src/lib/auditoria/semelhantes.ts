import { SupabaseClient } from '@supabase/supabase-js'
import { normalizarTexto } from './consistencia'

export interface SemelhantesOptions {
  empresa_id: string
  limiar_similaridade?: number // Default: 85 (%)
}

export interface GrupoFornecedorSemelhante {
  id: string
  criterio: 'CNPJ_DUPLICADO' | 'DEPARA_EXISTENTE' | 'NOME_NORMALIZADO' | 'SIMILARIDADE_TEXTUAL'
  similaridade_percentual: number
  fornecedor_principal: string
  variacoes: {
    nome: string
    cnpj?: string | null
    total_lancamentos: number
    valor_acumulado: number
    fonte: 'CONTA_AZUL' | 'LANCAMENTOS'
  }[]
  sugestao: string
}

export interface SemelhantesResult {
  fonte_dados: 'CONTA_AZUL_ESPELHO' | 'IMPORTADAS_LOCAL'
  resumo: {
    total_fornecedores_analisados: number
    total_grupos_duplicidade_encontrados: number
    potencial_unificacao_fornecedores: number
  }
  grupos: GrupoFornecedorSemelhante[]
}

function levenshtein(a: string, b: string): number {
  const an = a ? a.length : 0
  const bn = b ? b.length : 0
  if (an === 0) return bn
  if (bn === 0) return an

  const matrix = Array.from({ length: bn + 1 }, () => new Array(an + 1).fill(0))

  for (let i = 0; i <= an; i++) matrix[0][i] = i
  for (let j = 0; j <= bn; j++) matrix[j][0] = j

  for (let j = 1; j <= bn; j++) {
    for (let i = 1; i <= an; i++) {
      if (a[i - 1] === b[j - 1]) {
        matrix[j][i] = matrix[j - 1][i - 1]
      } else {
        matrix[j][i] = Math.min(
          matrix[j - 1][i - 1] + 1,
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1
        )
      }
    }
  }

  return matrix[bn][an]
}

function calcularSimilaridade(s1: string, s2: string): number {
  if (s1 === s2) return 100
  const maxLen = Math.max(s1.length, s2.length)
  if (maxLen === 0) return 100
  const dist = levenshtein(s1, s2)
  return Math.round((1 - dist / maxLen) * 100)
}

export async function executarSemelhantes(
  supabase: SupabaseClient,
  options: SemelhantesOptions
): Promise<SemelhantesResult> {
  const { empresa_id, limiar_similaridade = 85 } = options

  // 1. Buscar cadastros no Conta Azul
  const { data: caFornecedores } = await supabase
    .from('fornecedores_contaazul')
    .select('id, nome, cnpj, nome_normalizado')
    .eq('empresa_id', empresa_id)

  // 2. Buscar regras aprendidas em fornecedor_depara
  const { data: deparaRegras } = await supabase
    .from('fornecedor_depara')
    .select('nome_original, nome_original_normalizado, nome_corrigido')
    .eq('empresa_id', empresa_id)

  // 3. Buscar nomes presentes nos lançamentos (tabela espelho prioritária)
  let fonteUtilizada: 'CONTA_AZUL_ESPELHO' | 'IMPORTADAS_LOCAL' = 'CONTA_AZUL_ESPELHO'
  const mapaVolumeFornecedor = new Map<string, { count: number; total: number; cnpj?: string | null }>()

  const { data: dadosEspelho, error: errEspelho } = await supabase
    .from('contas_pagar_contaazul_espelho')
    .select('fornecedor_nome, valor, fornecedor_cnpj_cpf')
    .eq('empresa_id', empresa_id)

  if (!errEspelho && dadosEspelho && dadosEspelho.length > 0) {
    fonteUtilizada = 'CONTA_AZUL_ESPELHO'
    for (const l of dadosEspelho) {
      if (!l.fornecedor_nome) continue
      const nome = l.fornecedor_nome.trim()
      const prev = mapaVolumeFornecedor.get(nome) || { count: 0, total: 0, cnpj: l.fornecedor_cnpj_cpf }
      prev.count++
      prev.total += Number(l.valor || 0)
      if (!prev.cnpj && l.fornecedor_cnpj_cpf) prev.cnpj = l.fornecedor_cnpj_cpf
      mapaVolumeFornecedor.set(nome, prev)
    }
  } else {
    // Fallback para contas_pagar_importadas
    fonteUtilizada = 'IMPORTADAS_LOCAL'
    const { data: lancamentos } = await supabase
      .from('contas_pagar_importadas')
      .select('fornecedor, valor')
      .eq('empresa_id', empresa_id)

    if (lancamentos) {
      for (const l of lancamentos) {
        if (!l.fornecedor) continue
        const nome = l.fornecedor.trim()
        const prev = mapaVolumeFornecedor.get(nome) || { count: 0, total: 0 }
        prev.count++
        prev.total += Number(l.valor || 0)
        mapaVolumeFornecedor.set(nome, prev)
      }
    }
  }

  interface ItemCatalogo {
    nomeOriginal: string
    nomeNormalizado: string
    cnpj?: string | null
    totalLancamentos: number
    valorAcumulado: number
    fonte: 'CONTA_AZUL' | 'LANCAMENTOS'
  }

  const catalogo = new Map<string, ItemCatalogo>()

  if (caFornecedores) {
    for (const f of caFornecedores) {
      if (!f.nome) continue
      const norm = normalizarTexto(f.nome)
      const vol = mapaVolumeFornecedor.get(f.nome) || { count: 0, total: 0 }
      const cnpjLimpado = (f.cnpj || '').replace(/\D/g, '') || null
      catalogo.set(f.nome, {
        nomeOriginal: f.nome,
        nomeNormalizado: norm,
        cnpj: cnpjLimpado,
        totalLancamentos: vol.count,
        valorAcumulado: vol.total,
        fonte: 'CONTA_AZUL'
      })
    }
  }

  for (const [nome, vol] of mapaVolumeFornecedor.entries()) {
    if (!catalogo.has(nome)) {
      const cnpjLimpado = vol.cnpj ? vol.cnpj.replace(/\D/g, '') : null
      catalogo.set(nome, {
        nomeOriginal: nome,
        nomeNormalizado: normalizarTexto(nome),
        cnpj: cnpjLimpado,
        totalLancamentos: vol.count,
        valorAcumulado: vol.total,
        fonte: 'LANCAMENTOS'
      })
    }
  }

  const itens = Array.from(catalogo.values())
  const gruposEncontrados: GrupoFornecedorSemelhante[] = []
  const jaAgrupados = new Set<string>()

  // ETAPA 1: Match por CNPJ idêntico
  const mapaPorCnpj = new Map<string, ItemCatalogo[]>()
  for (const item of itens) {
    if (item.cnpj && item.cnpj.length >= 11) {
      const list = mapaPorCnpj.get(item.cnpj) || []
      list.push(item)
      mapaPorCnpj.set(item.cnpj, list)
    }
  }

  for (const [cnpj, list] of mapaPorCnpj.entries()) {
    if (list.length > 1) {
      list.sort((a, b) => b.totalLancamentos - a.totalLancamentos)
      const principal = list[0].nomeOriginal
      gruposEncontrados.push({
        id: `cnpj-${cnpj}`,
        criterio: 'CNPJ_DUPLICADO',
        similaridade_percentual: 100,
        fornecedor_principal: principal,
        variacoes: list.map((v) => ({
          nome: v.nomeOriginal,
          cnpj: v.cnpj,
          total_lancamentos: v.totalLancamentos,
          valor_acumulado: v.valorAcumulado,
          fonte: v.fonte
        })),
        sugestao: `Cadastros distintos possuem o mesmo CNPJ/CPF (${cnpj}). Unificar sob "${principal}".`
      })
      list.forEach((i) => jaAgrupados.add(i.nomeOriginal))
    }
  }

  // ETAPA 2: Match por Nome Normalizado idêntico
  const mapaPorNorm = new Map<string, ItemCatalogo[]>()
  for (const item of itens) {
    if (jaAgrupados.has(item.nomeOriginal) || !item.nomeNormalizado) continue
    const list = mapaPorNorm.get(item.nomeNormalizado) || []
    list.push(item)
    mapaPorNorm.set(item.nomeNormalizado, list)
  }

  for (const [norm, list] of mapaPorNorm.entries()) {
    if (list.length > 1) {
      list.sort((a, b) => b.totalLancamentos - a.totalLancamentos)
      const principal = list[0].nomeOriginal
      gruposEncontrados.push({
        id: `norm-${norm}`,
        criterio: 'NOME_NORMALIZADO',
        similaridade_percentual: 100,
        fornecedor_principal: principal,
        variacoes: list.map((v) => ({
          nome: v.nomeOriginal,
          cnpj: v.cnpj,
          total_lancamentos: v.totalLancamentos,
          valor_acumulado: v.valorAcumulado,
          fonte: v.fonte
        })),
        sugestao: `Variação de acentuação, maiúsculas ou pontuação. Mesma raiz normalizada "${norm}".`
      })
      list.forEach((i) => jaAgrupados.add(i.nomeOriginal))
    }
  }

  // ETAPA 3: De-Para existente
  if (deparaRegras) {
    const mapaDepara = new Map<string, string[]>()
    for (const d of deparaRegras) {
      const orig = d.nome_original
      const corr = d.nome_corrigido
      if (orig && corr && orig !== corr && catalogo.has(orig) && catalogo.has(corr)) {
        if (!jaAgrupados.has(orig) || !jaAgrupados.has(corr)) {
          const list = mapaDepara.get(corr) || []
          list.push(orig)
          mapaDepara.set(corr, list)
        }
      }
    }

    for (const [corrigido, originais] of mapaDepara.entries()) {
      const pItem = catalogo.get(corrigido)
      if (!pItem) continue
      const variacoes = [pItem, ...originais.map((o) => catalogo.get(o)!).filter(Boolean)]
      gruposEncontrados.push({
        id: `depara-${corrigido}`,
        criterio: 'DEPARA_EXISTENTE',
        similaridade_percentual: 95,
        fornecedor_principal: corrigido,
        variacoes: variacoes.map((v) => ({
          nome: v.nomeOriginal,
          cnpj: v.cnpj,
          total_lancamentos: v.totalLancamentos,
          valor_acumulado: v.valorAcumulado,
          fonte: v.fonte
        })),
        sugestao: `Mapeamento De-Para já existente vincula estas variações ao nome corrigido "${corrigido}".`
      })
      variacoes.forEach((v) => jaAgrupados.add(v.nomeOriginal))
    }
  }

  // ETAPA 4: Similaridade Textual (Levenshtein >= limiar_similaridade)
  const restantes = itens.filter((i) => !jaAgrupados.has(i.nomeOriginal) && i.nomeNormalizado.length >= 4)

  for (let i = 0; i < restantes.length; i++) {
    const itemA = restantes[i]
    if (jaAgrupados.has(itemA.nomeOriginal)) continue

    const semelhantes: { item: ItemCatalogo; score: number }[] = []

    for (let j = i + 1; j < restantes.length; j++) {
      const itemB = restantes[j]
      if (jaAgrupados.has(itemB.nomeOriginal)) continue

      const diffLen = Math.abs(itemA.nomeNormalizado.length - itemB.nomeNormalizado.length)
      if (diffLen > 6) continue

      const score = calcularSimilaridade(itemA.nomeNormalizado, itemB.nomeNormalizado)
      if (score >= limiar_similaridade) {
        semelhantes.push({ item: itemB, score })
      }
    }

    if (semelhantes.length > 0) {
      const todosGrupo = [itemA, ...semelhantes.map((s) => s.item)]
      todosGrupo.sort((a, b) => b.totalLancamentos - a.totalLancamentos)
      const principal = todosGrupo[0].nomeOriginal
      const maxScore = Math.max(...semelhantes.map((s) => s.score))

      gruposEncontrados.push({
        id: `lev-${itemA.nomeNormalizado}`,
        criterio: 'SIMILARIDADE_TEXTUAL',
        similaridade_percentual: maxScore,
        fornecedor_principal: principal,
        variacoes: todosGrupo.map((v) => ({
          nome: v.nomeOriginal,
          cnpj: v.cnpj,
          total_lancamentos: v.totalLancamentos,
          valor_acumulado: v.valorAcumulado,
          fonte: v.fonte
        })),
        sugestao: `Alta similaridade textual (${maxScore}%). Potencial digitação duplicada de "${principal}".`
      })

      todosGrupo.forEach((g) => jaAgrupados.add(g.nomeOriginal))
    }
  }

  gruposEncontrados.sort((a, b) => b.variacoes.length - a.variacoes.length)
  const unificacaoPotencial = gruposEncontrados.reduce((acc, g) => acc + (g.variacoes.length - 1), 0)

  return {
    fonte_dados: fonteUtilizada,
    resumo: {
      total_fornecedores_analisados: itens.length,
      total_grupos_duplicidade_encontrados: gruposEncontrados.length,
      potencial_unificacao_fornecedores: unificacaoPotencial
    },
    grupos: gruposEncontrados
  }
}
