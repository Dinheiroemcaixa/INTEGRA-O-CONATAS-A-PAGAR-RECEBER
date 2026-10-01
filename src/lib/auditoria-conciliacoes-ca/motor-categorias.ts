/**
 * MOTOR DE CATEGORIAS CONTÁBEIS (Regra 2 e Regra 3) - FASE 3 REFINAMENTO HEURÍSTICO
 * Avalia consistência de plano de contas, dispersão histórica e detecção avançada de monoescopo vs multiescopo.
 */

import { OrigemCategoriaEsperada, TipoEscopoFornecedor } from './tipos';
import { normalizarTextoBasico, limparCnpjCpfNomeFornecedor } from './motor-compatibilidade';

export interface EstatisticaHistoricoFornecedor {
  fornecedorNormalizado: string;
  totalLancamentos: number;
  categoriaPredominante: string;
  percentualPredominante: number; // 0 a 100
  distribuicao: Map<string, number>;
  categoriasSignificativas: Set<string>; // Categorias com >= 15% de ocorrência
  isMonoescopo: boolean;
  isMultiescopo: boolean;
}

/**
 * Fornecedores com natureza operacional intrinsecamente multiescopo reconhecida
 */
export const FORNECEDORES_MULTIESCOPO_CONHECIDOS = [
  'AME NEGOCIOS DIGITAIS',
  'CAJU BENEFICIOS',
  'POSTO',
  'AUTO POSTO',
  'PETROBRAS',
  'IPIRANGA',
  'DISTRIBUIDORA'
];

/**
 * Constrói o perfil estatístico histórico de categorias para cada fornecedor
 */
export function compilarHistoricoCategorias(
  historico: Array<{ fornecedor_nome?: string | null; categoria_nome?: string | null }>
): Map<string, EstatisticaHistoricoFornecedor> {
  const mapa = new Map<string, { total: number; categorias: Map<string, number> }>();

  for (const item of historico) {
    const fn = normalizarTextoBasico(limparCnpjCpfNomeFornecedor(item.fornecedor_nome));
    const cat = (item.categoria_nome || '').trim();
    if (!fn || !cat) continue;

    if (!mapa.has(fn)) {
      mapa.set(fn, { total: 0, categorias: new Map() });
    }

    const entrada = mapa.get(fn)!;
    entrada.total += 1;
    entrada.categorias.set(cat, (entrada.categorias.get(cat) || 0) + 1);
  }

  const estatisticas = new Map<string, EstatisticaHistoricoFornecedor>();

  for (const [fornecedor, info] of mapa.entries()) {
    let catMaisFrequente = '';
    let maxOcorrencias = 0;
    const significativas = new Set<string>();

    for (const [cat, count] of info.categorias.entries()) {
      if (count > maxOcorrencias) {
        maxOcorrencias = count;
        catMaisFrequente = cat;
      }
      const pct = info.total > 0 ? (count / info.total) * 100 : 0;
      if (pct >= 15.0) {
        significativas.add(normalizarTextoBasico(cat));
      }
    }

    const percentual = info.total > 0 ? (maxOcorrencias / info.total) * 100 : 0;
    const ehConhecidoMultiescopo = FORNECEDORES_MULTIESCOPO_CONHECIDOS.some(termo => fornecedor.includes(termo));
    const isMonoescopo = percentual >= 85.0 && info.total >= 2 && !ehConhecidoMultiescopo;
    const isMultiescopo = significativas.size >= 2 || ehConhecidoMultiescopo;

    estatisticas.set(fornecedor, {
      fornecedorNormalizado: fornecedor,
      totalLancamentos: info.total,
      categoriaPredominante: catMaisFrequente,
      percentualPredominante: Math.round(percentual * 10) / 10,
      distribuicao: info.categorias,
      categoriasSignificativas: significativas,
      isMonoescopo,
      isMultiescopo
    });
  }

  return estatisticas;
}

/**
 * Avalia se a categoria aplicada na conciliação é consistente com as regras e histórico (FASE 3)
 */
export function avaliarCategoriaConciliada(params: {
  fornecedorNome: string;
  categoriaConciliada: string;
  categoriasPadraoHomologadas?: Map<string, string>; // fornecedor_norm -> categoria_padrao
  regrasDeparaCategoria?: Map<string, string>;       // fornecedor_norm -> categoria_padrao depara
  historicoEstatistico?: Map<string, EstatisticaHistoricoFornecedor>;
  categoriasPermitidasMulti?: Map<string, Set<string>>;
}): {
  divergencia: boolean;
  categoriaEsperada: string | null;
  origemEsperada: OrigemCategoriaEsperada;
  tipoEscopo: TipoEscopoFornecedor;
  confiancaPercentual: number;
  motivo?: string;
} {
  const {
    fornecedorNome,
    categoriaConciliada,
    categoriasPadraoHomologadas,
    regrasDeparaCategoria,
    historicoEstatistico,
    categoriasPermitidasMulti
  } = params;

  const fornLimpo = limparCnpjCpfNomeFornecedor(fornecedorNome);
  const fornNorm = normalizarTextoBasico(fornLimpo);
  const catAtualLimpa = (categoriaConciliada || '').trim();
  const catAtualNorm = normalizarTextoBasico(catAtualLimpa);

  // 1. Verificação se o fornecedor possui múltiplas categorias explicitamente autorizadas
  if (categoriasPermitidasMulti && categoriasPermitidasMulti.has(fornNorm)) {
    const permitidas = categoriasPermitidasMulti.get(fornNorm)!;
    if (permitidas.has(catAtualNorm)) {
      return {
        divergencia: false,
        categoriaEsperada: catAtualLimpa,
        origemEsperada: 'CADASTRO_HOMOLOGADO',
        tipoEscopo: 'MULTIESCOPO',
        confiancaPercentual: 100,
        motivo: undefined
      };
    }
  }

  // 2. Prioridade A: Cadastro oficial homologado em fornecedores_contaazul
  if (categoriasPadraoHomologadas && categoriasPadraoHomologadas.has(fornNorm)) {
    const catPadrao = categoriasPadraoHomologadas.get(fornNorm)!;
    const igual = normalizarTextoBasico(catPadrao) === catAtualNorm;

    // Se for igual, perfeito
    if (igual) {
      return {
        divergencia: false,
        categoriaEsperada: catPadrao,
        origemEsperada: 'CADASTRO_HOMOLOGADO',
        tipoEscopo: 'MONOESCOPO',
        confiancaPercentual: 100,
        motivo: undefined
      };
    }

    // Se não for igual, mas o fornecedor for comprovadamente multiescopo com essa categoria frequente
    const stats = historicoEstatistico?.get(fornNorm);
    if (stats && stats.isMultiescopo && stats.categoriasSignificativas.has(catAtualNorm)) {
      return {
        divergencia: false,
        categoriaEsperada: catPadrao,
        origemEsperada: 'HISTORICO_PREDOMINANTE',
        tipoEscopo: 'MULTIESCOPO',
        confiancaPercentual: 85,
        motivo: undefined
      };
    }

    return {
      divergencia: true,
      categoriaEsperada: catPadrao,
      origemEsperada: 'CADASTRO_HOMOLOGADO',
      tipoEscopo: stats?.isMultiescopo ? 'MULTIESCOPO' : 'MONOESCOPO',
      confiancaPercentual: 100,
      motivo: `Divergência de Cadastro: Fornecedor homologado para '${catPadrao}', mas conciliado como '${catAtualLimpa}'.`
    };
  }

  // 3. Prioridade B: Regra De-Para cadastrada em fornecedor_depara
  if (regrasDeparaCategoria && regrasDeparaCategoria.has(fornNorm)) {
    const catDepara = regrasDeparaCategoria.get(fornNorm)!;
    const igual = normalizarTextoBasico(catDepara) === catAtualNorm;

    if (igual) {
      return {
        divergencia: false,
        categoriaEsperada: catDepara,
        origemEsperada: 'DEPARA',
        tipoEscopo: 'MONOESCOPO',
        confiancaPercentual: 95,
        motivo: undefined
      };
    }

    return {
      divergencia: true,
      categoriaEsperada: catDepara,
      origemEsperada: 'DEPARA',
      tipoEscopo: 'MONOESCOPO',
      confiancaPercentual: 95,
      motivo: `Divergência De-Para: Regra vinculada determina '${catDepara}', mas conciliado como '${catAtualLimpa}'.`
    };
  }

  // 4. Prioridade C: Análise de Histórico e Predominância Estatística
  const stats = historicoEstatistico?.get(fornNorm);

  if (!stats || stats.totalLancamentos === 0) {
    return {
      divergencia: false,
      categoriaEsperada: catAtualLimpa || null,
      origemEsperada: null,
      tipoEscopo: 'NOVO_FORNECEDOR',
      confiancaPercentual: 0,
      motivo: undefined
    };
  }

  const catPredominante = stats.categoriaPredominante;
  const igualPredominante = normalizarTextoBasico(catPredominante) === catAtualNorm;

  // Se o fornecedor for multiescopo e a categoria atual for uma das significativas (>= 15%)
  if (stats.isMultiescopo && stats.categoriasSignificativas.has(catAtualNorm)) {
    return {
      divergencia: false,
      categoriaEsperada: catPredominante,
      origemEsperada: 'HISTORICO_PREDOMINANTE',
      tipoEscopo: 'MULTIESCOPO',
      confiancaPercentual: stats.percentualPredominante,
      motivo: undefined
    };
  }

  if (stats.isMonoescopo) {
    return {
      divergencia: !igualPredominante,
      categoriaEsperada: catPredominante,
      origemEsperada: 'HISTORICO_PREDOMINANTE',
      tipoEscopo: 'MONOESCOPO',
      confiancaPercentual: stats.percentualPredominante,
      motivo: igualPredominante
        ? undefined
        : `Divergência Histórica (Monoescopo): ${stats.percentualPredominante}% dos lançamentos são em '${catPredominante}'. Lançamento atual em '${catAtualLimpa}' destoa do padrão contábil.`
    };
  }

  // Fornecedor Multiescopo flexível
  return {
    divergencia: false,
    categoriaEsperada: catPredominante,
    origemEsperada: 'HISTORICO_PREDOMINANTE',
    tipoEscopo: 'MULTIESCOPO',
    confiancaPercentual: stats.percentualPredominante,
    motivo: undefined
  };
}
