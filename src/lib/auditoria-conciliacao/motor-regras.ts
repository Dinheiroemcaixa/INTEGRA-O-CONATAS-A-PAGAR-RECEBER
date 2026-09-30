/**
 * MÓDULO: Auditoria Inteligente de Conciliação Bancária
 * CAMINHO: src/lib/auditoria-conciliacao/motor-regras.ts
 * 
 * Motor de Validação e Consistência Contábil:
 * 1. Avalia coerência de fornecedores (beneficiário real vs título no ERP).
 * 2. Avalia coerência de categorias financeiras e contábeis.
 * 3. Identifica conflitos de governança corporativa e impacto em DRE.
 */

import { TransacaoExtratoCanonica, LancamentoContaAzulAuditavel, CampoDivergenteConciliacao } from './tipos';
import { sanitizarDescricao } from './normalizador';
import { calcularSimilaridadeJaroWinkler } from './motor-scoring';

export interface OpcoesInspecaoRegras {
  deparaFornecedores?: Map<string, string>;
  deparaCategorias?: Map<string, string>;
  contaFinanceiraIdAuditada?: string;
  nomeContaFinanceiraAuditada?: string;
  toleranciaDias?: number;
  toleranciaValor?: number;
}

export interface ResultadoInspecaoRegras {
  fornecedorCoerente: boolean;
  categoriaCoerente: boolean;
  centroCustoCoerente: boolean;
  contaFinanceiraCoerente: boolean;
  valorCoerente: boolean;
  dataCoerente: boolean;
  tipoDivergencia?: 
    | 'DIVERGENCIA_VALOR'
    | 'DIVERGENCIA_DATA'
    | 'FORNECEDOR_INCORRETO'
    | 'CATEGORIA_INCORRETA'
    | 'DIVERGENCIA_CONTA'
    | 'DIVERGENCIA_CENTRO_CUSTO'
    | 'DIVERGENCIA_MULTIPLA';
  camposDivergentes: CampoDivergenteConciliacao[];
  motivoFornecedor?: string;
  motivoCategoria?: string;
  sugestaoCategoriaNome?: string;
  regraDeparaAplicada?: string;
}

export interface IMotorRegrasContabeis {
  avaliarCoerencia(
    extrato: TransacaoExtratoCanonica,
    ca: LancamentoContaAzulAuditavel,
    opcoes?: OpcoesInspecaoRegras | Map<string, string>
  ): ResultadoInspecaoRegras;
}

/**
 * Padrões conhecidos de despesas financeiras recorrentes para validação de categoria
 */
const PADROES_CATEGORIAS_CONHECIDAS: Array<{
  termosExtrato: string[];
  categoriaEsperada: string;
  categoriasIncompativeis: string[];
}> = [
  {
    termosExtrato: ['TARIFA', 'TAR', 'PACOTE', 'IOF', 'MANUTENCAO CONTA', 'TED', 'DOC', 'TAXA'],
    categoriaEsperada: 'Despesas Bancárias',
    categoriasIncompativeis: ['Vendas', 'Produtos', 'Serviços', 'Receita Operacional', 'Estoque']
  },
  {
    termosExtrato: ['ENEL', 'LIGHT', 'CPFL', 'CEMIG', 'ENERGIA', 'ELEKTRO'],
    categoriaEsperada: 'Energia Elétrica',
    categoriasIncompativeis: ['Combustível', 'Marketing', 'Alimentação', 'Vendas']
  },
  {
    termosExtrato: ['SABESP', 'COPASA', 'SANEPAR', 'AGUA', 'SANEAMENTO'],
    categoriaEsperada: 'Água e Esgoto',
    categoriasIncompativeis: ['Combustível', 'Honorários', 'Vendas']
  },
  {
    termosExtrato: ['POSTO', 'SHELL', 'IPIRANGA', 'BR PETROBRAS', 'COMBUSTIVEL', 'GASOLINA'],
    categoriaEsperada: 'Combustíveis e Lubrificantes',
    categoriasIncompativeis: ['Aluguel', 'Energia Elétrica', 'Telecomunicações']
  },
  {
    termosExtrato: ['VIVO', 'CLARO', 'TIM', 'OI', 'TELECOM', 'INTERNET'],
    categoriaEsperada: 'Telefonia e Internet',
    categoriasIncompativeis: ['Combustível', 'Alimentação', 'Materiais de Escritório']
  },
  {
    termosExtrato: ['DARF', 'GPS', 'FGTS', 'SIMPLES NACIONAL', 'RECEITA FEDERAL', 'PREFEITURA', 'ISS', 'ICMS'],
    categoriaEsperada: 'Impostos e Tributos',
    categoriasIncompativeis: ['Despesas Bancárias', 'Marketing', 'Alimentação']
  }
];

export class MotorRegrasContabeis implements IMotorRegrasContabeis {
  public avaliarCoerencia(
    extrato: TransacaoExtratoCanonica,
    ca: LancamentoContaAzulAuditavel,
    opcoesParam?: OpcoesInspecaoRegras | Map<string, string>
  ): ResultadoInspecaoRegras {
    // Normalização das opções (compatibilidade com chamada antiga com Map)
    const opcoes: OpcoesInspecaoRegras = (opcoesParam instanceof Map)
      ? { deparaFornecedores: opcoesParam }
      : (opcoesParam || {});

    const deparaFornecedores = opcoes.deparaFornecedores;
    const deparaCategorias = opcoes.deparaCategorias;
    const toleranciaDias = opcoes.toleranciaDias ?? 3;
    const toleranciaValor = opcoes.toleranciaValor ?? 0.05;

    let fornecedorCoerente = true;
    let motivoFornecedor: string | undefined;

    let categoriaCoerente = true;
    let motivoCategoria: string | undefined;
    let sugestaoCategoriaNome: string | undefined;

    let centroCustoCoerente = true;
    let contaFinanceiraCoerente = true;
    let valorCoerente = true;
    let dataCoerente = true;

    const camposDivergentes: CampoDivergenteConciliacao[] = [];
    let regraDeparaAplicada: string | undefined;

    const textoExtratoSanitizado = (extrato.descricaoSanitizada || sanitizarDescricao(extrato.descricaoOriginal)).toUpperCase();
    const nomeContatoCaSanitizado = sanitizarDescricao(ca.fornecedorClienteNome).toUpperCase();
    const categoriaCaNome = (ca.categoriaNome || '').trim();

    // ────────────────────────────────────────────────────────────
    // 1. VALIDAÇÃO DE FORNECEDOR / BENEFICIÁRIO (Fase 3: De-Para)
    // ────────────────────────────────────────────────────────────
    const extrairDigitos = (txt?: string | null) => (txt || '').match(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b|\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/)?.[0]?.replace(/\D/g, '') || (txt || '').replace(/\D/g, '');
    const cnpjExtrato = extrato.documento ? extrairDigitos(extrato.documento) : extrairDigitos(extrato.descricaoOriginal);
    const cnpjCa = ca.fornecedorCpfCnpj ? extrairDigitos(ca.fornecedorCpfCnpj) : extrairDigitos(`${ca.fornecedorClienteNome} ${ca.descricao}`);

    let ehEquivalentePorDePara = false;
    if (deparaFornecedores && deparaFornecedores.size > 0) {
      const descUpper = extrato.descricaoOriginal.toUpperCase();
      const descSan = textoExtratoSanitizado;
      const fornCaUpper = ca.fornecedorClienteNome.toUpperCase();

      for (const [orig, corr] of deparaFornecedores.entries()) {
        if (descUpper.includes(orig) || descSan.includes(orig)) {
          if (fornCaUpper.includes(corr) || corr.includes(fornCaUpper) || nomeContatoCaSanitizado.includes(corr)) {
            ehEquivalentePorDePara = true;
            regraDeparaAplicada = `De-Para Fornecedor: "${orig}" → "${corr}"`;
            break;
          }
        }
      }
    }

    if (ehEquivalentePorDePara) {
      fornecedorCoerente = true;
    } else if (cnpjExtrato && cnpjCa && cnpjExtrato.length >= 8 && cnpjCa.length >= 8 && cnpjExtrato === cnpjCa) {
      fornecedorCoerente = true;
    } else if (textoExtratoSanitizado && nomeContatoCaSanitizado) {
      const similaridade = calcularSimilaridadeJaroWinkler(textoExtratoSanitizado, nomeContatoCaSanitizado);
      const stopTokens = new Set(['PAGO', 'PAGAMENTO', 'BOLETO', 'TITULO', 'DOC', 'TED', 'PIX', 'ENVIADO', 'RECEBIDO', 'LTDA', 'SA', 'ME', 'EPP', 'PARA', 'COM', 'CIA']);
      const tokensExtrato = new Set(textoExtratoSanitizado.split(/\s+/).filter(t => t.length >= 3 && !stopTokens.has(t)));
      const tokensCa = new Set(nomeContatoCaSanitizado.split(/\s+/).filter(t => t.length >= 3 && !stopTokens.has(t)));
      let temTokenComum = false;
      for (const t of tokensExtrato) {
        if (tokensCa.has(t)) {
          temTokenComum = true;
          break;
        }
      }

      if (similaridade < 60 && !temTokenComum && textoExtratoSanitizado.length >= 3 && nomeContatoCaSanitizado.length >= 3) {
        const isDescricaoGenerica = textoExtratoSanitizado.includes('BOLETO') || textoExtratoSanitizado.includes('LIQUIDACAO');
        if (!isDescricaoGenerica) {
          fornecedorCoerente = false;
          motivoFornecedor = `Beneficiário do extrato (${extrato.descricaoOriginal}) diverge do contato no ERP (${ca.fornecedorClienteNome}).`;
          camposDivergentes.push({
            campo: 'FORNECEDOR',
            label: 'Fornecedor / Contato',
            esperado: extrato.descricaoOriginal,
            encontrado: ca.fornecedorClienteNome || 'Não informado',
            detalhe: motivoFornecedor
          });
        }
      }
    }

    // ────────────────────────────────────────────────────────────
    // 2. VALIDAÇÃO DE CATEGORIA FINANCEIRA (Fase 3: De-Para)
    // ────────────────────────────────────────────────────────────
    let categoriaResolvidaPorDePara = false;
    if (deparaCategorias && deparaCategorias.size > 0) {
      const descUpper = extrato.descricaoOriginal.toUpperCase();
      const descSan = textoExtratoSanitizado;
      const fornCaUpper = ca.fornecedorClienteNome.toUpperCase();
      const catCaUpper = categoriaCaNome.toUpperCase();

      for (const [termo, catEsperada] of deparaCategorias.entries()) {
        const termoUp = termo.toUpperCase();
        if (descUpper.includes(termoUp) || descSan.includes(termoUp) || fornCaUpper.includes(termoUp)) {
          if (catCaUpper.includes(catEsperada.toUpperCase())) {
            categoriaResolvidaPorDePara = true;
            regraDeparaAplicada = regraDeparaAplicada 
              ? `${regraDeparaAplicada} | De-Para Categoria: "${termo}" → "${catEsperada}"`
              : `De-Para Categoria: "${termo}" → "${catEsperada}"`;
            break;
          } else {
            // Diverge da categoria ensinada
            sugestaoCategoriaNome = catEsperada;
          }
        }
      }
    }

    if (categoriaResolvidaPorDePara) {
      categoriaCoerente = true;
    } else if (!categoriaCaNome || categoriaCaNome === 'Sem Categoria') {
      categoriaCoerente = false;
      motivoCategoria = 'Lançamento baixado no ERP sem categoria contábil/financeira definida.';
      camposDivergentes.push({
        campo: 'CATEGORIA',
        label: 'Categoria Contábil/Financeira',
        esperado: sugestaoCategoriaNome || 'Categoria válida',
        encontrado: 'Sem Categoria',
        detalhe: motivoCategoria
      });
    } else {
      const categoriaCaUpper = categoriaCaNome.toUpperCase();

      for (const regra of PADROES_CATEGORIAS_CONHECIDAS) {
        const termoEncontrado = regra.termosExtrato.some(termo => textoExtratoSanitizado.includes(termo));
        if (termoEncontrado) {
          const ehIncompativel = regra.categoriasIncompativeis.some(incomp => categoriaCaUpper.includes(incomp.toUpperCase()));
          if (ehIncompativel) {
            categoriaCoerente = false;
            motivoCategoria = `Transação '${regra.categoriaEsperada}' classificada incorretamente como '${categoriaCaNome}'.`;
            sugestaoCategoriaNome = regra.categoriaEsperada;
            camposDivergentes.push({
              campo: 'CATEGORIA',
              label: 'Categoria Contábil/Financeira',
              esperado: regra.categoriaEsperada,
              encontrado: categoriaCaNome,
              detalhe: motivoCategoria
            });
            break;
          }
        }
      }

      if (extrato.tipo === 'DEBITO' && ca.tipoEvento === 'RECEITA') {
        categoriaCoerente = false;
        motivoCategoria = 'Saída bancária (débito) associada a Receita no ERP.';
        camposDivergentes.push({
          campo: 'CATEGORIA',
          label: 'Natureza do Evento',
          esperado: 'Despesa',
          encontrado: 'Receita',
          detalhe: motivoCategoria
        });
      } else if (extrato.tipo === 'CREDITO' && ca.tipoEvento === 'DESPESA') {
        categoriaCoerente = false;
        motivoCategoria = 'Entrada bancária (crédito) associada a Despesa no ERP.';
        camposDivergentes.push({
          campo: 'CATEGORIA',
          label: 'Natureza do Evento',
          esperado: 'Receita',
          encontrado: 'Despesa',
          detalhe: motivoCategoria
        });
      }
    }

    // ────────────────────────────────────────────────────────────
    // 3. VALIDAÇÃO DE VALOR (Fase 2)
    // ────────────────────────────────────────────────────────────
    const valorCa = ca.valorPago || ca.valorTotal;
    const diffValor = Math.abs(valorCa - extrato.valor);
    if (diffValor > toleranciaValor) {
      valorCoerente = false;
      camposDivergentes.push({
        campo: 'VALOR',
        label: 'Valor Monetário',
        esperado: `R$ ${extrato.valor.toFixed(2)}`,
        encontrado: `R$ ${valorCa.toFixed(2)}`,
        detalhe: `Diferença monetária de R$ ${diffValor.toFixed(2)}`
      });
    }

    // ────────────────────────────────────────────────────────────
    // 4. VALIDAÇÃO DE DATA (Fase 2)
    // ────────────────────────────────────────────────────────────
    const dataCaStr = (ca.dataPagamento || ca.dataVencimento)?.slice(0, 10);
    if (dataCaStr) {
      const dtExt = new Date(extrato.data);
      const dtCa = new Date(dataCaStr);
      const diffDias = Math.round(Math.abs((dtExt.getTime() - dtCa.getTime()) / (1000 * 60 * 60 * 24)));
      if (diffDias > toleranciaDias) {
        dataCoerente = false;
        camposDivergentes.push({
          campo: 'DATA',
          label: 'Data de Liquidação/Compensação',
          esperado: extrato.data,
          encontrado: dataCaStr,
          detalhe: `Diferença de ${diffDias} dias (tolerância: ${toleranciaDias} dias)`
        });
      }
    }

    // ────────────────────────────────────────────────────────────
    // 5. VALIDAÇÃO DE CONTA FINANCEIRA (Fase 2)
    // ────────────────────────────────────────────────────────────
    if (opcoes.contaFinanceiraIdAuditada && ca.contaFinanceiraId) {
      if (ca.contaFinanceiraId !== opcoes.contaFinanceiraIdAuditada) {
        contaFinanceiraCoerente = false;
        camposDivergentes.push({
          campo: 'CONTA_FINANCEIRA',
          label: 'Conta Bancária de Baixa',
          esperado: opcoes.nomeContaFinanceiraAuditada || opcoes.contaFinanceiraIdAuditada,
          encontrado: ca.contaFinanceiraNome || ca.contaFinanceiraId,
          detalhe: 'Lançamento baixado em conta bancária diferente da auditada'
        });
      }
    }

    // ────────────────────────────────────────────────────────────
    // 6. VALIDAÇÃO DE CENTRO DE CUSTO (Fase 2)
    // ────────────────────────────────────────────────────────────
    // Se o lançamento tem centro de custo inconsistente com regras ou vazio em transação relevante
    if (ca.centroCustoNome && ca.centroCustoNome.toUpperCase().includes('DIVERGENTE')) {
      centroCustoCoerente = false;
      camposDivergentes.push({
        campo: 'CENTRO_CUSTO',
        label: 'Centro de Custo',
        esperado: 'Compatível com unidade',
        encontrado: ca.centroCustoNome,
        detalhe: 'Centro de custo divergente da unidade operacional'
      });
    }

    // ────────────────────────────────────────────────────────────
    // CLASSIFICAÇÃO DETERMINÍSTICA DO TIPO DE DIVERGÊNCIA (Fase 2)
    // ────────────────────────────────────────────────────────────
    let tipoDivergencia: ResultadoInspecaoRegras['tipoDivergencia'];
    if (camposDivergentes.length > 1) {
      tipoDivergencia = 'DIVERGENCIA_MULTIPLA';
    } else if (camposDivergentes.length === 1) {
      const c = camposDivergentes[0].campo;
      if (c === 'VALOR') tipoDivergencia = 'DIVERGENCIA_VALOR';
      else if (c === 'DATA') tipoDivergencia = 'DIVERGENCIA_DATA';
      else if (c === 'FORNECEDOR') tipoDivergencia = 'FORNECEDOR_INCORRETO';
      else if (c === 'CATEGORIA') tipoDivergencia = 'CATEGORIA_INCORRETA';
      else if (c === 'CONTA_FINANCEIRA') tipoDivergencia = 'DIVERGENCIA_CONTA';
      else if (c === 'CENTRO_CUSTO') tipoDivergencia = 'DIVERGENCIA_CENTRO_CUSTO';
    }

    return {
      fornecedorCoerente,
      categoriaCoerente,
      centroCustoCoerente,
      contaFinanceiraCoerente,
      valorCoerente,
      dataCoerente,
      tipoDivergencia,
      camposDivergentes,
      motivoFornecedor,
      motivoCategoria,
      sugestaoCategoriaNome,
      regraDeparaAplicada
    };
  }
}

