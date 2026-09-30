/**
 * MÓDULO: Auditoria Inteligente de Conciliação Bancária
 * CAMINHO: src/lib/auditoria-conciliacao/motor-regras.ts
 * 
 * Motor de Validação e Consistência Contábil:
 * 1. Avalia coerência de fornecedores (beneficiário real vs título no ERP).
 * 2. Avalia coerência de categorias financeiras e contábeis.
 * 3. Identifica conflitos de governança corporativa e impacto em DRE.
 */

import { TransacaoExtratoCanonica, LancamentoContaAzulAuditavel } from './tipos';
import { sanitizarDescricao } from './normalizador';
import { calcularSimilaridadeJaroWinkler } from './motor-scoring';

export interface ResultadoInspecaoRegras {
  fornecedorCoerente: boolean;
  categoriaCoerente: boolean;
  motivoFornecedor?: string;
  motivoCategoria?: string;
  sugestaoCategoriaNome?: string;
}

export interface IMotorRegrasContabeis {
  avaliarCoerencia(
    extrato: TransacaoExtratoCanonica,
    ca: LancamentoContaAzulAuditavel,
    deparaFornecedores?: Map<string, string>
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
    deparaFornecedores?: Map<string, string>
  ): ResultadoInspecaoRegras {
    let fornecedorCoerente = true;
    let motivoFornecedor: string | undefined;

    let categoriaCoerente = true;
    let motivoCategoria: string | undefined;
    let sugestaoCategoriaNome: string | undefined;

    const textoExtratoSanitizado = (extrato.descricaoSanitizada || sanitizarDescricao(extrato.descricaoOriginal)).toUpperCase();
    const nomeContatoCaSanitizado = sanitizarDescricao(ca.fornecedorClienteNome).toUpperCase();
    const categoriaCaNome = (ca.categoriaNome || '').trim();

    // 1. Validação de Coerência de Fornecedor / Beneficiário (Fase 5 - Objetivos 3 e 4)
    // Extrai CNPJ/CPF em formato puramente numérico
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
            break;
          }
        }
      }
    }

    // Se houver equivalência direta no De-Para, valida imediatamente como coerente
    if (ehEquivalentePorDePara) {
      fornecedorCoerente = true;
    }
    // Se ambos possuem CNPJ/CPF válidos (mínimo 8 dígitos) e coincidem, valida como coerente (Razão Social x Fantasia)
    else if (cnpjExtrato && cnpjCa && cnpjExtrato.length >= 8 && cnpjCa.length >= 8 && cnpjExtrato === cnpjCa) {
      fornecedorCoerente = true;
    }
    else if (textoExtratoSanitizado && nomeContatoCaSanitizado) {
      const similaridade = calcularSimilaridadeJaroWinkler(textoExtratoSanitizado, nomeContatoCaSanitizado);
      
      // Tokens significativos (ignora stopwords e termos genéricos comuns de pagamentos)
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
        // Verifica se não é um termo genérico bancário (como "PAGAMENTO TITULO")
        const isDescricaoGenerica = textoExtratoSanitizado.includes('BOLETO') || textoExtratoSanitizado.includes('LIQUIDACAO');
        if (!isDescricaoGenerica) {
          fornecedorCoerente = false;
          motivoFornecedor = `Beneficiário do extrato (${extrato.descricaoOriginal}) diverge substancialmente do contato no ERP (${ca.fornecedorClienteNome}).`;
        }
      }
    }

    // 2. Validação de Coerência de Categoria Financeira
    if (!categoriaCaNome || categoriaCaNome === 'Sem Categoria') {
      categoriaCoerente = false;
      motivoCategoria = 'Lançamento baixado no ERP sem categoria contábil/financeira definida.';
    } else {
      const categoriaCaUpper = categoriaCaNome.toUpperCase();

      for (const regra of PADROES_CATEGORIAS_CONHECIDAS) {
        const termoEncontrado = regra.termosExtrato.some(termo => textoExtratoSanitizado.includes(termo));
        if (termoEncontrado) {
          // Verifica se a categoria atual no ERP está entre as incompatíveis
          const ehIncompativel = regra.categoriasIncompativeis.some(incomp => categoriaCaUpper.includes(incomp.toUpperCase()));
          if (ehIncompativel) {
            categoriaCoerente = false;
            motivoCategoria = `Transação bancária de natureza '${regra.categoriaEsperada}' classificada incorretamente no ERP como '${categoriaCaNome}'.`;
            sugestaoCategoriaNome = regra.categoriaEsperada;
            break;
          }
        }
      }

      // Validação de tipo de fluxo (receita vs despesa)
      if (extrato.tipo === 'DEBITO' && ca.tipoEvento === 'RECEITA') {
        categoriaCoerente = false;
        motivoCategoria = 'Saída bancária (débito) associada a um evento de Receita no ERP.';
      } else if (extrato.tipo === 'CREDITO' && ca.tipoEvento === 'DESPESA') {
        categoriaCoerente = false;
        motivoCategoria = 'Entrada bancária (crédito) associada a um evento de Despesa no ERP.';
      }
    }

    return {
      fornecedorCoerente,
      categoriaCoerente,
      motivoFornecedor,
      motivoCategoria,
      sugestaoCategoriaNome
    };
  }
}
