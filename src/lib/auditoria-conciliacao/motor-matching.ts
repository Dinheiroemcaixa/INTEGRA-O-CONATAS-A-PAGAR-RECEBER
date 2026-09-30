/**
 * MÓDULO: Auditoria Inteligente de Conciliação Bancária
 * CAMINHO: src/lib/auditoria-conciliacao/motor-matching.ts
 * 
 * Motor Central de Cruzamento e Matching Inteligente:
 * 1. Processamento em memória O(N) via indexação de valores e faixas temporais.
 * 2. Classificação determinística nos 8 Cenários Oficiais.
 * 3. Totalização precisa dos 4 KPIs Oficiais de Saúde da Conciliação.
 * 4. Totalmente desacoplado de módulos de produção.
 */

import {
  TransacaoExtratoCanonica,
  LancamentoContaAzulAuditavel,
  StatusAuditoriaConciliacao,
  ResumoKpisSaudeConciliacao,
  DetalhesDiagnosticoConciliacao
} from './tipos';
import { MotorScoring, SubScoresCalculados } from './motor-scoring';
import { MotorRegrasContabeis, ResultadoInspecaoRegras } from './motor-regras';

export interface OpcoesExecucaoMatching {
  toleranciaDias?: number; // Padrão: 3 dias
  toleranciaValorCentavos?: number; // Padrão: 0.05
  ignorarTarifasBancariasMenoresQue?: number; // Padrão: 0.00
}

export interface ItemAuditoriaProcessado {
  transacaoExtrato: TransacaoExtratoCanonica;
  lancamentoCaCorrespondente?: LancamentoContaAzulAuditavel | null;
  statusAuditoria: StatusAuditoriaConciliacao;
  scoreConfianca: number;
  diferencaValor: number;
  diagnostico: DetalhesDiagnosticoConciliacao;
}

export interface ResultadoAuditoriaConciliacao {
  sessaoResumo: {
    totalTransacoes: number;
    periodoInicio: string;
    periodoFim: string;
  };
  kpis: ResumoKpisSaudeConciliacao;
  itens: ItemAuditoriaProcessado[];
}

export interface IMotorMatching {
  executarCruzamento(
    extratoItens: TransacaoExtratoCanonica[],
    caItens: LancamentoContaAzulAuditavel[],
    opcoes?: OpcoesExecucaoMatching
  ): ResultadoAuditoriaConciliacao;
}

export class MotorMatching implements IMotorMatching {
  private scoring = new MotorScoring();
  private regras = new MotorRegrasContabeis();

  public executarCruzamento(
    extratoItens: TransacaoExtratoCanonica[],
    caItens: LancamentoContaAzulAuditavel[],
    opcoes?: OpcoesExecucaoMatching
  ): ResultadoAuditoriaConciliacao {
    const toleranciaDias = opcoes?.toleranciaDias ?? 3;
    const toleranciaValor = opcoes?.toleranciaValorCentavos ?? 0.05;

    // 1. Indexação dos Lançamentos da Conta Azul para busca O(1) aproximada
    // Indexação dupla: por valor inteiro (centavos) e por data (YYYY-MM-DD)
    const mapaCaPorValor = new Map<number, LancamentoContaAzulAuditavel[]>();
    const mapaCaPorData = new Map<string, LancamentoContaAzulAuditavel[]>();
    const lancamentosUtilizados = new Set<string>();

    for (const ca of caItens) {
      const valorCentavos = Math.round((ca.valorPago || ca.valorTotal) * 100);
      if (!mapaCaPorValor.has(valorCentavos)) {
        mapaCaPorValor.set(valorCentavos, []);
      }
      mapaCaPorValor.get(valorCentavos)!.push(ca);

      const dataStr = (ca.dataPagamento || ca.dataVencimento)?.slice(0, 10);
      if (dataStr) {
        if (!mapaCaPorData.has(dataStr)) {
          mapaCaPorData.set(dataStr, []);
        }
        mapaCaPorData.get(dataStr)!.push(ca);
      }
    }

    const itensProcessados: ItemAuditoriaProcessado[] = [];

    // Totalizadores para os 4 KPIs
    let totalConformes = 0;
    let totalNaoConciliados = 0;
    let totalAusentes = 0;
    let totalDuplicidades = 0;
    let totalDivergenciasValor = 0;
    let totalFornecedorIncorreto = 0;
    let totalCategoriaIncorreta = 0;
    let totalBaixaConfianca = 0;

    let somaGapDesconciliado = 0;
    let somaDivergenciasFinanceiras = 0;
    let valorTotalDebitos = 0;
    let valorTotalCreditos = 0;

    // 2. Processamento de Cada Transação do Extrato
    for (const extrato of extratoItens) {
      if (extrato.tipo === 'DEBITO') {
        valorTotalDebitos += extrato.valor;
      } else {
        valorTotalCreditos += extrato.valor;
      }

      const valorCentavosExtrato = Math.round(extrato.valor * 100);

      // Busca candidatos na mesma faixa de valor (exato ou centavos próximos)
      const candidatos: LancamentoContaAzulAuditavel[] = [];
      const deltasCentavos = [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5];

      for (const delta of deltasCentavos) {
        const lista = mapaCaPorValor.get(valorCentavosExtrato + delta);
        if (lista) {
          candidatos.push(...lista);
        }
      }

      // Se não encontrou candidatos de valor próximo, busca em janela temporal restrita (+-5 dias)
      // evitando varredura exaustiva O(N*M) na base inteira
      let poolCandidatos: LancamentoContaAzulAuditavel[];
      if (candidatos.length > 0) {
        poolCandidatos = candidatos;
      } else {
        const candidatosTemporais: LancamentoContaAzulAuditavel[] = [];
        const dataBase = new Date(extrato.data);
        const janelaDias = Math.max(toleranciaDias + 2, 5); // Default +-5 dias
        
        for (let offset = -janelaDias; offset <= janelaDias; offset++) {
          const d = new Date(dataBase);
          d.setDate(d.getDate() + offset);
          const chaveData = d.toISOString().slice(0, 10);
          const listaDoDia = mapaCaPorData.get(chaveData);
          if (listaDoDia) {
            for (const item of listaDoDia) {
              const tipoCompravel = (extrato.tipo === 'DEBITO' && item.tipoEvento === 'DESPESA') ||
                                    (extrato.tipo === 'CREDITO' && item.tipoEvento === 'RECEITA');
              if (!tipoCompravel) continue;

              const diferencaMonetaria = Math.abs((item.valorPago || item.valorTotal) - extrato.valor);
              const desvioPercentual = extrato.valor > 0 ? (diferencaMonetaria / extrato.valor) : 1;
              
              // Divergência plausível: desvio monetário <= 25% (critério oficial)
              if (desvioPercentual <= 0.25) {
                candidatosTemporais.push(item);
                if (candidatosTemporais.length >= 15) break;
              }
            }
          }
          if (candidatosTemporais.length >= 15) break;
        }
        poolCandidatos = candidatosTemporais;
      }

      // Avaliação de scores e regras para os candidatos
      let melhorCandidato: LancamentoContaAzulAuditavel | null = null;
      let melhorScores: SubScoresCalculados = {
        scoreValor: 0,
        scoreData: 0,
        scoreFornecedor: 0,
        scoreDescricao: 0,
        scoreDocumento: 0,
        scoreCategoria: 0,
        scoreGlobal: 0
      };
      let melhoresRegras: ResultadoInspecaoRegras = {
        fornecedorCoerente: true,
        categoriaCoerente: true
      };

      const candidatosComMesmoValorEData: LancamentoContaAzulAuditavel[] = [];

      for (const ca of poolCandidatos) {
        // Validação de compatibilidade de fluxo (débito com despesa, crédito com receita)
        const tipoCompravel = (extrato.tipo === 'DEBITO' && ca.tipoEvento === 'DESPESA') ||
                              (extrato.tipo === 'CREDITO' && ca.tipoEvento === 'RECEITA');

        if (!tipoCompravel) continue;

        const scores = this.scoring.calcularScores(extrato, ca, {
          diasToleranciaCompensacao: toleranciaDias,
          centavosToleranciaArredondamento: toleranciaValor
        });

        // Contabiliza duplicidades no ERP
        const dataCa = ca.dataPagamento || ca.dataVencimento;
        const mesmaData = dataCa?.slice(0, 10) === extrato.data.slice(0, 10);
        const mesmoValor = Math.abs((ca.valorPago || ca.valorTotal) - extrato.valor) <= toleranciaValor;

        if (mesmoValor && mesmaData) {
          candidatosComMesmoValorEData.push(ca);
        }

        if (scores.scoreGlobal > melhorScores.scoreGlobal) {
          melhorScores = scores;
          melhorCandidato = ca;
          melhoresRegras = this.regras.avaliarCoerencia(extrato, ca);
        }
      }

      // 3. Classificação Determinística nos 8 Cenários Oficiais
      let statusAuditoria: StatusAuditoriaConciliacao;
      let diferencaValor = 0;
      let motivoClassificacao = '';

      const diferencaMonetaria = melhorCandidato ? Math.abs((melhorCandidato.valorPago || melhorCandidato.valorTotal) - extrato.valor) : 0;
      const desvioPercentual = extrato.valor > 0 ? (diferencaMonetaria / extrato.valor) : 1;
      const ehDivergenciaValorPlausivel = Boolean(
        melhorCandidato &&
        diferencaMonetaria > toleranciaValor &&
        desvioPercentual <= 0.25 &&
        (melhorScores.scoreFornecedor >= 50 || melhorScores.scoreDescricao >= 50 || diferencaMonetaria <= 25.00)
      );

      // Cenário 1: LANCAMENTO_AUSENTE (nenhum candidato, score insignificante ou valor completamente desconexo)
      if (!melhorCandidato || melhorScores.scoreGlobal < 25 || (diferencaMonetaria > toleranciaValor && !ehDivergenciaValorPlausivel)) {
        statusAuditoria = 'LANCAMENTO_AUSENTE';
        motivoClassificacao = 'Nenhuma contrapartida financeira localizada no ERP para esta transação bancária.';
        melhorScores.scoreGlobal = 0;
        totalAusentes++;
        somaGapDesconciliado += extrato.valor;
      }
      // Cenário 2: DUPLICIDADE (múltiplos lançamentos no ERP para a mesma transação do extrato)
      else if (candidatosComMesmoValorEData.length >= 2) {
        statusAuditoria = 'DUPLICIDADE';
        motivoClassificacao = `Identificados ${candidatosComMesmoValorEData.length} lançamentos com mesmo valor e data baixados no ERP.`;
        totalDuplicidades++;
      }
      // Cenário 3: DIVERGENCIA_VALOR (lançamento plausível localizado, mas com diferença monetária acima da tolerância)
      else if (ehDivergenciaValorPlausivel) {
        statusAuditoria = 'DIVERGENCIA_VALOR';
        diferencaValor = diferencaMonetaria;
        motivoClassificacao = `Diferença monetária de R$ ${diferencaValor.toFixed(2)} entre extrato e ERP (possível retenção de tarifa/juros).`;
        totalDivergenciasValor++;
        somaDivergenciasFinanceiras += diferencaValor;
      }
      // Cenário 4: CONCILIADO_BAIXA_CONFIANCA por distância temporal (data distante do extrato > 5 dias)
      else if (melhorCandidato.conciliado && melhorScores.scoreData < 60) {
        statusAuditoria = 'CONCILIADO_BAIXA_CONFIANCA';
        motivoClassificacao = 'Conciliado no ERP, mas com data de baixa excessivamente distante da data do extrato.';
        totalBaixaConfianca++;
      }
      // Cenário 5: CATEGORIA_INCORRETA (conciliado, mas categoria incompatível com a governança)
      else if (melhorCandidato.conciliado && !melhoresRegras.categoriaCoerente) {
        statusAuditoria = 'CATEGORIA_INCORRETA';
        motivoClassificacao = melhoresRegras.motivoCategoria || 'Categoria contábil/financeira incompatível com a transação.';
        totalCategoriaIncorreta++;
      }
      // Cenário 6: FORNECEDOR_INCORRETO (conciliado, mas fornecedor diverge flagrantemente)
      else if (melhorCandidato.conciliado && !melhoresRegras.fornecedorCoerente) {
        statusAuditoria = 'FORNECEDOR_INCORRETO';
        motivoClassificacao = melhoresRegras.motivoFornecedor || 'Fornecedor cadastrado no ERP diverge do beneficiário do extrato.';
        totalFornecedorIncorreto++;
      }
      // Cenário 7: CONCILIADO_BAIXA_CONFIANCA por score geral baixo (< 70)
      else if (melhorCandidato.conciliado && melhorScores.scoreGlobal < 70) {
        statusAuditoria = 'CONCILIADO_BAIXA_CONFIANCA';
        motivoClassificacao = 'Conciliado no ERP, mas com baixa aderência cadastral ou documental com o extrato.';
        totalBaixaConfianca++;
      }
      // Cenário 8: NAO_CONCILIADO (baixado no ERP com score alto, mas flag conciliado = false)
      else if (!melhorCandidato.conciliado && melhorScores.scoreGlobal >= 80) {
        statusAuditoria = 'NAO_CONCILIADO';
        motivoClassificacao = 'Lançamento existente e baixado no ERP, pendente de conciliação bancária.';
        totalNaoConciliados++;
        somaGapDesconciliado += extrato.valor;
      }
      // Cenário 9: CONFORME (perfeitamente conciliado no ERP com dados coerentes)
      else {
        statusAuditoria = 'CONFORME';
        motivoClassificacao = 'Lançamento conciliado em perfeita conformidade com o extrato bancário.';
        totalConformes++;
      }

      if (melhorCandidato) {
        lancamentosUtilizados.add(melhorCandidato.parcelaId || melhorCandidato.eventoId);
      }

      itensProcessados.push({
        transacaoExtrato: extrato,
        lancamentoCaCorrespondente: melhorCandidato,
        statusAuditoria,
        scoreConfianca: melhorScores.scoreGlobal,
        diferencaValor,
        diagnostico: {
          motivo: motivoClassificacao,
          categoriaAtual: melhorCandidato?.categoriaNome,
          categoriaEsperada: melhoresRegras.sugestaoCategoriaNome,
          fornecedorAtual: melhorCandidato?.fornecedorClienteNome,
          diferencaValor: diferencaValor > 0 ? diferencaValor : undefined
        }
      });
    }

    // 4. Consolidação dos 4 KPIs Oficiais de Saúde da Conciliação
    const totalTransacoes = extratoItens.length;
    const saudeConciliacao = totalTransacoes > 0
      ? Number(((totalConformes / totalTransacoes) * 100).toFixed(2))
      : 100;

    const totalRiscosContabeis = totalCategoriaIncorreta + totalFornecedorIncorreto + totalDuplicidades;

    const datasOrdenadas = extratoItens.map(t => t.data).sort();
    const periodoInicio = datasOrdenadas[0] || new Date().toISOString().slice(0, 10);
    const periodoFim = datasOrdenadas[datasOrdenadas.length - 1] || periodoInicio;

    const kpis: ResumoKpisSaudeConciliacao = {
      saudeConciliacao,
      gapDesconciliadoValor: Number(somaGapDesconciliado.toFixed(2)),
      totalRiscosContabeis,
      divergenciasFinanceirasValor: Number(somaDivergenciasFinanceiras.toFixed(2)),
      totalTransacoes,
      totalConformes,
      totalNaoConciliados,
      totalAusentesNoErp: totalAusentes,
      totalDuplicidades,
      totalConciliadosBaixaConfianca: totalBaixaConfianca,
      valorTotalDebitos: Number(valorTotalDebitos.toFixed(2)),
      valorTotalCreditos: Number(valorTotalCreditos.toFixed(2)),
      periodo: {
        inicio: periodoInicio,
        fim: periodoFim
      },
      statusSessao: 'EM_ANALISE'
    };

    return {
      sessaoResumo: {
        totalTransacoes,
        periodoInicio,
        periodoFim
      },
      kpis,
      itens: itensProcessados
    };
  }
}
