/**
 * MOTOR DE COMPATIBILIDADE TEXTUAL (Regra 1 e Regra 4) - FASE 3 REFINAMENTO HEURÍSTICO
 * Compara a descrição bancária da baixa/conciliação contra o fornecedor vinculado no Conta Azul.
 * Suporta sanitização avançada de documentos fiscais, folha de pagamento, equivalências embutidas e siglas.
 */

import { NivelCompatibilidadeFornecedor } from './tipos';

export const TERMOS_BANCARIOS_IGNORADOS = new Set([
  'PIX', 'TED', 'DOC', 'PAGTO', 'PAGAMENTO', 'TRANSFERENCIA', 'TRANSF',
  'BOLETO', 'BOL', 'LIQ', 'LIQUIDACAO', 'ENVIO', 'RECEB', 'RECEBIMENTO',
  'DEB', 'DEBITO', 'DB', 'CRED', 'CREDITO', 'TITULO', 'TIT', 'COBRANCA',
  'COB', 'COMPRA', 'CARTAO', 'INTERNET', 'BANKING', 'AGENCIA', 'CONTA',
  'TAR', 'TARIFA', 'ESTORNO', 'AUTOATENDIMENTO', 'SISDEB', 'LANC'
]);

/**
 * 8 Equivalências Críticas embutidas por padrão (Cenário Corporativo Connecta AI)
 */
export const EQUIVALENCIAS_PADRAO_FORNECEDOR: Record<string, string> = {
  'REDE': 'REDECARD S/A INSTITUICAO DE PAGAMENTO',
  'REDECARD': 'REDECARD S/A INSTITUICAO DE PAGAMENTO',
  'STONE': 'STONE PAGAMENTOS S.A.',
  'LEM': 'L&M CONTABILIDADE CONSULTIVA LTDA',
  'LEM CONTABILIDADE': 'L&M CONTABILIDADE CONSULTIVA LTDA',
  'ST TREINAMEN': 'ST TREINAMENTOS E DESENVOLVIMENTOS PROFISSIONAIS L',
  'ST TREINAMENTOS': 'ST TREINAMENTOS E DESENVOLVIMENTOS PROFISSIONAIS L',
  'CEMIG': 'CEMIG DISTRIBUICAO S.A.',
  'CAJU': 'CAJU BENEFICIOS LTDA',
  'VERO': 'VERO INTERNET S/A',
  'BAMAQ': 'BAMAQ SA BANDEIRANTES MAQUINAS E EQUIPAMENTOS'
};

/**
 * Prefixos de Documentos Fiscais para higienização avançada
 */
export const REGEX_PREFIXOS_DOCUMENTOS_FISCAIS = [
  /^(?:NF-?E?|NOTA\s+FISCAL(?:\s+ELETRONICA)?|DANFE):?\s*/i,
  /^(?:DOC|DOCUMENTO):?\s*/i,
  /^(?:BOLETO\s+N[º°o]?|BOL\s+N[º°o]?):?\s*/i,
  /^(?:FATURA|FAT|DUPLICATA|DUP):?\s*/i
];

/**
 * Termos de Folha de Pagamento / RH
 */
export const TERMOS_FOLHA_RH = [
  'SALARIO', 'SALARIOS', 'ADIANTAMENTO SALARIAL', 'FERIAS',
  'RESCISAO', 'PREMIACAO', 'AJUDA DE CUSTO', 'VALE TRANSPORTE',
  'GRATIFICACAO', 'PRO LABORE'
];

/**
 * Categorias Contábeis Típicas de RH / Pessoal
 */
export const CATEGORIAS_PESSOAL_RH = new Set([
  'SALARIOS', 'SALARIO', 'ADIANTAMENTO SALARIAL', 'FERIAS',
  'RESCISOES', 'RESCISAO', 'GRATIFICACOES', 'GRATIFICACAO',
  'VALE TRANSPORTE', 'PRO LABORE', 'BENEFICIOS', 'PESSOAL',
  'ENCARGOS SOCIAIS', 'PREVIDENCIA', 'EXAMES MEDICOS'
]);

/**
 * Normaliza textos removendo acentuação, caracteres especiais e espaços extras
 */
export function normalizarTextoBasico(texto?: string | null): string {
  if (!texto) return '';
  return texto
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^A-Z0-9\s]/g, ' ')    // remove pontuação e símbolos
    .replace(/\s+/g, ' ')            // colapsa múltiplos espaços
    .trim();
}

/**
 * Remove CPF ou CNPJ presente no início da razão social do fornecedor
 * Ex: "54.437.202 ELIEZER LIBERATO" -> "ELIEZER LIBERATO"
 */
export function limparCnpjCpfNomeFornecedor(nome?: string | null): string {
  if (!nome) return '';
  return nome
    .replace(/^\s*\d{2}\.?\d{3}\.?\d{3}(?:\/?\d{4}-?\d{2}|\.?\d{3}-?\d{2})?\s*[-–—]?\s*/i, '')
    .trim();
}

/**
 * Verifica se a descrição é um documento fiscal puramente numérico após remoção de prefixos
 */
export function extrairDocumentoFiscalNumerico(descricao?: string | null): {
  ehDocumentoNumerico: boolean;
  numeroLimpo: string | null;
} {
  if (!descricao) return { ehDocumentoNumerico: false, numeroLimpo: null };

  let limpo = descricao.trim();

  // Aplica remoção de prefixos fiscais
  for (const regex of REGEX_PREFIXOS_DOCUMENTOS_FISCAIS) {
    limpo = limpo.replace(regex, '').trim();
  }

  // Remove caracteres comuns de número de documento: pontuação, traços e barras
  const apenasNumeros = limpo.replace(/[^0-9]/g, '');
  const textoSemPontuacaoDoc = limpo.replace(/[0-9\.\-\/\s]/g, '');

  // Se não restou nenhuma letra e temos pelo menos 3 dígitos numéricos
  if (textoSemPontuacaoDoc.length === 0 && apenasNumeros.length >= 3) {
    return {
      ehDocumentoNumerico: true,
      numeroLimpo: apenasNumeros.replace(/^0+/, '') || apenasNumeros
    };
  }

  return { ehDocumentoNumerico: false, numeroLimpo: null };
}

/**
 * Sanitiza a descrição bancária expurgando ruídos e termos operacionais de internet banking
 */
export function sanitizarDescricaoBancaria(descricao?: string | null): string {
  const normalizada = normalizarTextoBasico(descricao);
  if (!normalizada) return '';

  const tokens = normalizada.split(' ');
  const tokensUteis = tokens.filter(t => t.length > 1 && !TERMOS_BANCARIOS_IGNORADOS.has(t));

  return tokensUteis.join(' ').trim();
}

/**
 * Quebra uma string em tokens significativos para comparação vetorial.
 * Suporta siglas corporativas de 2 letras (ex: TC, GP, JB, JC, JD, MG).
 */
export function extrairTokensSignificativos(texto: string): Set<string> {
  const limpo = normalizarTextoBasico(texto);
  const partes = limpo.split(' ').filter(p => {
    if (TERMOS_BANCARIOS_IGNORADOS.has(p)) return false;
    // Permite siglas conhecidas de 2 letras ou palavras com 3+ letras
    return p.length >= 3 || (p.length === 2 && /^[A-Z]{2}$/.test(p));
  });
  return new Set(partes);
}

/**
 * Algoritmo Jaro-Winkler para similaridade fonética e de caracteres
 */
export function calcularJaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;

  const len1 = s1.length;
  const len2 = s2.length;
  const matchWindow = Math.floor(Math.max(len1, len2) / 2) - 1;

  const matches1 = new Array(len1).fill(false);
  const matches2 = new Array(len2).fill(false);

  let numMatches = 0;
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, len2);

    for (let j = start; j < end; j++) {
      if (!matches2[j] && s1[i] === s2[j]) {
        matches1[i] = true;
        matches2[j] = true;
        numMatches++;
        break;
      }
    }
  }

  if (numMatches === 0) return 0.0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (matches1[i]) {
      while (!matches2[k]) k++;
      if (s1[i] !== s2[k]) transpositions++;
      k++;
    }
  }

  const m = numMatches;
  const jaro = (m / len1 + m / len2 + (m - transpositions / 2) / m) / 3;

  let prefix = 0;
  const maxPrefix = Math.min(4, Math.min(len1, len2));
  for (let i = 0; i < maxPrefix; i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

/**
 * Avalia compatibilidade considerando truncamento bancário
 */
function verificarCompatibilidadeTruncada(tokenCurto: string, tokenLongo: string): boolean {
  if (tokenCurto.length >= 5 && tokenLongo.startsWith(tokenCurto)) {
    return true; // Ex: "TREINAMEN" prefixo de "TREINAMENTOS"
  }
  return false;
}

/**
 * Avalia se o lançamento representa pagamento legítimo de folha de pagamento/RH
 */
export function verificarPagamentoFolhaRH(
  descricaoSanitizada: string,
  fornecedorLimpo: string,
  categoria?: string | null
): boolean {
  const descNorm = normalizarTextoBasico(descricaoSanitizada);
  const catNorm = normalizarTextoBasico(categoria);

  const ehTermoFolha = TERMOS_FOLHA_RH.some(termo => descNorm.includes(termo));
  if (!ehTermoFolha) return false;

  // Categoria de RH ou beneficiário pessoa física (2+ palavras sem termos societários)
  const categoriaCompativel = CATEGORIAS_PESSOAL_RH.has(catNorm);
  const palavrasForn = fornecedorLimpo.split(/\s+/).filter(p => p.length >= 2);
  const ehPessoaFisicaProvavel = palavrasForn.length >= 2 && !/(?:LTDA|S\/A|SA|ME|EPP|CIA|DISTRIBUIDORA|POSTO|COMERCIO)/i.test(fornecedorLimpo);

  return categoriaCompativel || ehPessoaFisicaProvavel;
}

/**
 * Avalia a compatibilidade entre a descrição bancária e o fornecedor conciliado (FASE 3)
 */
export function avaliarCompatibilidadeFornecedor(
  descricaoBanco: string,
  fornecedorContaAzul: string,
  regrasDepara?: Map<string, string>, // nome_original_normalizado -> nome_corrigido
  numeroDocumento?: string | null,
  categoria?: string | null
): {
  score: number;
  status: NivelCompatibilidadeFornecedor;
  descricaoSanitizada: string;
  fornecedorNormalizado: string;
  motivo?: string;
  fornecedorSugerido?: string | null;
} {
  const descSanitizada = sanitizarDescricaoBancaria(descricaoBanco);
  const fornLimpo = limparCnpjCpfNomeFornecedor(fornecedorContaAzul);
  const fornNormalizado = normalizarTextoBasico(fornLimpo);

  if (!descSanitizada || !fornNormalizado) {
    return {
      score: 50,
      status: 'SUSPEITA_MODERADA',
      descricaoSanitizada: descSanitizada,
      fornecedorNormalizado: fornNormalizado,
      motivo: 'Descrição do banco ou nome do fornecedor insuficiente para cálculo.'
    };
  }

  // 1. Tratamento Avançado de Documentos Fiscais Numéricos (NF, NFE, Boleto Nº, Doc, etc.)
  const docInfo = extrairDocumentoFiscalNumerico(descricaoBanco);
  if (docInfo.ehDocumentoNumerico && docInfo.numeroLimpo) {
    return {
      score: 90,
      status: 'COMPATIVEL',
      descricaoSanitizada: descSanitizada,
      fornecedorNormalizado: fornNormalizado,
      motivo: 'Identificação de documento fiscal/duplicata numérica. Conciliação regular com o emissor do título.',
      fornecedorSugerido: null
    };
  }

  // 1.1 Identificação pura de número de documento existente
  const apenasNumeros = /^[\d\s\.\-\/]+$/.test(descSanitizada);
  const docLimpo = numeroDocumento ? normalizarTextoBasico(numeroDocumento).replace(/^0+/, '') : '';
  const descNumericaLimpa = descSanitizada.replace(/[^0-9]/g, '').replace(/^0+/, '');
  if (apenasNumeros || (docLimpo && descNumericaLimpa && (descNumericaLimpa === docLimpo || descNumericaLimpa.includes(docLimpo)))) {
    return {
      score: 90,
      status: 'COMPATIVEL',
      descricaoSanitizada: descSanitizada,
      fornecedorNormalizado: fornNormalizado,
      motivo: 'Descrição bancária consiste em número de documento/boleto, sem divergência cadastral.',
      fornecedorSugerido: null
    };
  }

  // 2. Tratamento Especial para Folha de Pagamento / RH (Salários, Adiantamentos, Férias, Rescisões)
  if (verificarPagamentoFolhaRH(descSanitizada, fornNormalizado, categoria)) {
    return {
      score: 95,
      status: 'COMPATIVEL',
      descricaoSanitizada: descSanitizada,
      fornecedorNormalizado: fornNormalizado,
      motivo: 'Pagamento de folha salarial/benefício a colaborador pessoa física com categoria de RH em conformidade.',
      fornecedorSugerido: null
    };
  }

  // 3. Verificação via De-Para de Fornecedores (Regras do Banco + 8 Equivalências Embutidas)
  let fornecedorSugerido: string | null = null;

  // Primeiro checa as regras do banco
  if (regrasDepara && regrasDepara.has(descSanitizada)) {
    fornecedorSugerido = regrasDepara.get(descSanitizada)!;
  }

  // Se não achou no banco, checa as 8 equivalências base embutidas
  if (!fornecedorSugerido) {
    for (const [termoBase, fornAlvo] of Object.entries(EQUIVALENCIAS_PADRAO_FORNECEDOR)) {
      if (descSanitizada.includes(termoBase) || descSanitizada === termoBase) {
        fornecedorSugerido = fornAlvo;
        break;
      }
    }
  }

  if (fornecedorSugerido) {
    const sugeridoNorm = normalizarTextoBasico(limparCnpjCpfNomeFornecedor(fornecedorSugerido));
    if (sugeridoNorm === fornNormalizado || fornNormalizado.includes(sugeridoNorm) || sugeridoNorm.includes(fornNormalizado)) {
      return {
        score: 100,
        status: 'COMPATIVEL',
        descricaoSanitizada: descSanitizada,
        fornecedorNormalizado: fornNormalizado,
        motivo: 'Homologado via regra De-Para / equivalência comercial de fornecedores.',
        fornecedorSugerido
      };
    }
  }

  // 4. Contenção direta ou igualdade total
  if (descSanitizada === fornNormalizado || fornNormalizado.includes(descSanitizada) || descSanitizada.includes(fornNormalizado)) {
    return {
      score: 100,
      status: 'COMPATIVEL',
      descricaoSanitizada: descSanitizada,
      fornecedorNormalizado: fornNormalizado,
      motivo: 'Correspondência literal entre descrição bancária e razão social do fornecedor.',
      fornecedorSugerido
    };
  }

  // 5. Similaridade por Sobreposição de Tokens (Jaccard com suporte a truncamento bancário)
  const tokensDesc = extrairTokensSignificativos(descSanitizada);
  const tokensForn = extrairTokensSignificativos(fornNormalizado);

  let intersecao = 0;
  for (const td of tokensDesc) {
    if (tokensForn.has(td)) {
      intersecao++;
    } else {
      // Checa se td é um prefixo truncado de algum token do fornecedor
      for (const tf of tokensForn) {
        if (verificarCompatibilidadeTruncada(td, tf) || verificarCompatibilidadeTruncada(tf, td)) {
          intersecao++;
          break;
        }
      }
    }
  }

  const uniao = new Set([...tokensDesc, ...tokensForn]).size;
  const scoreTokens = uniao > 0 ? (intersecao / uniao) * 100 : 0;

  // 6. Similaridade Jaro-Winkler
  const scoreJW = calcularJaroWinkler(descSanitizada, fornNormalizado) * 100;

  // Ponderação: 60% Overlap de Tokens + 40% Jaro-Winkler
  let scoreFinal = Math.round(scoreTokens * 0.6 + scoreJW * 0.4);

  // Bonificação se o primeiro token relevante coincidir
  const primeiroTokenDesc = Array.from(tokensDesc)[0];
  const primeiroTokenForn = Array.from(tokensForn)[0];
  if (primeiroTokenDesc && primeiroTokenForn) {
    if (primeiroTokenDesc === primeiroTokenForn || verificarCompatibilidadeTruncada(primeiroTokenDesc, primeiroTokenForn)) {
      scoreFinal = Math.max(scoreFinal, 85);
    }
  }

  scoreFinal = Math.min(100, Math.max(0, scoreFinal));

  let status: NivelCompatibilidadeFornecedor = 'COMPATIVEL';
  let motivo: string | undefined = undefined;

  if (scoreFinal >= 80) {
    status = 'COMPATIVEL';
  } else if (scoreFinal >= 50) {
    status = 'SUSPEITA_MODERADA';
    motivo = `Similaridade parcial (${scoreFinal}%). A descrição bancária difere parcialmente do cadastro do fornecedor.`;
  } else {
    status = 'SUSPEITA_CRITICA';
    motivo = `Incompatibilidade crítica (${scoreFinal}%). Alta probabilidade de conciliação com fornecedor incorreto.`;
  }

  return {
    score: scoreFinal,
    status,
    descricaoSanitizada: descSanitizada,
    fornecedorNormalizado: fornNormalizado,
    motivo,
    fornecedorSugerido
  };
}
