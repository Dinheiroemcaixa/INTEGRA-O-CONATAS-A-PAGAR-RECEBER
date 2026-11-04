/**
 * DCX LINK — MÓDULO CONTAS A RECEBER (ETAPA 1A: FUNDAÇÃO ISOLADA)
 * Contratos estruturais para as duas frentes independentes:
 * 1. Recebimentos de Cartões (Estrutura de extensão para Stone, Rede, Getnet, InfinitePay — sem layouts definitivos até amostras reais)
 * 2. Outros Recebimentos (PIX e demais modalidades — sem regras operacionais automáticas até definição do responsável)
 * 3. Motor de correspondência com receitas existentes (proíbe match automático apenas por valor + data)
 */

import type {
  AdquirenteParserAdapter,
  MovimentacaoReceberCanonica,
  OperadoraCartao,
  ParcelaBuscaContaAzulDTO,
  ResultadoCorrespondenciaReceita,
  ResultadoParserAdquirente,
} from '@/types/contas-receber'
import { reaisParaCentavos } from './validador-financeiro'

/**
 * Cria um adapter estrutural para uma operadora de cartão que aguarda amostra real do arquivo para homologação.
 */
function criarAdapterPendenteAmostra(
  operadora: OperadoraCartao
): AdquirenteParserAdapter {
  return {
    operadora,
    homologadoComAmostraReal: false,
    detectarCabecalho(_colunas: string[]): boolean {
      return false
    },
    interpretarLinhas(
      _empresaId: string,
      _linhasBrutas: Array<Record<string, unknown>>
    ): ResultadoParserAdquirente {
      return {
        status: 'LAYOUT_PENDENTE_AMOSTRA_REAL',
        operadora,
        movimentacoes: [],
        mensagem: `O interpretador definitivo da operadora ${operadora} aguarda amostra real de extrato para homologação de colunas e regras.`,
      }
    },
  }
}

/**
 * Registro estrutural de extensão para as 4 operadoras de cartão.
 */
export const REGISTRY_ADQUIRENTES_CARTAO: Record<
  OperadoraCartao,
  AdquirenteParserAdapter
> = {
  STONE: criarAdapterPendenteAmostra('STONE'),
  REDE: criarAdapterPendenteAmostra('REDE'),
  GETNET: criarAdapterPendenteAmostra('GETNET'),
  INFINITEPAY: criarAdapterPendenteAmostra('INFINITEPAY'),
}

/**
 * Avalia a correspondência entre um recebimento identificado e as parcelas existentes no Conta Azul.
 *
 * REGRAS DE SEGURANÇA ESTRITAS:
 * 1. Se a frente for OUTROS_RECEBIMENTOS (ex: PIX) e a regra operacional da modalidade não estiver habilitada,
 *    bloqueia qualquer ação automática.
 * 2. Valor e data isoladamente NUNCA autorizam baixa automática (`INSUFICIENTE_APENAS_VALOR_DATA`).
 * 3. Se houver mais de uma parcela candidata compatível, classifica como `AMBIGUO_MULTIPLOS_CANDIDATOS`
 *    e exige conferência manual.
 * 4. Só autoriza baixa automática quando houver identificador determinístico unívoco (`NSU` ou `Documento` + `CPF/CNPJ` + saldo compatível)
 *    apontando para exatamente 1 parcela em aberto/parcial.
 */
export function avaliarCorrespondenciaReceitaExistente(
  recebimento: MovimentacaoReceberCanonica,
  parcelasExistentes: ParcelaBuscaContaAzulDTO[],
  opcoes?: {
    regraModalidadeHabilitada?: boolean
  }
): ResultadoCorrespondenciaReceita {
  // Outros recebimentos (PIX, etc.) sem regra operacional expressamente habilitada permanecem bloqueados
  if (
    recebimento.frente === 'OUTROS_RECEBIMENTOS' &&
    opcoes?.regraModalidadeHabilitada !== true
  ) {
    return {
      nivel_confianca: 'SEM_CORRESPONDENCIA',
      acao_recomendada: 'BLOQUEAR_AGUARDANDO_REGRA_MODALIDADE',
      autoriza_baixa_automatica: false,
      parcela_candidata_id: null,
      candidatos_encontrados: 0,
      motivo:
        'Regras operacionais automáticas para esta modalidade ainda não foram definidas pelo responsável pelo projeto.',
    }
  }

  if (!parcelasExistentes || parcelasExistentes.length === 0) {
    return {
      nivel_confianca: 'SEM_CORRESPONDENCIA',
      acao_recomendada: 'CRIAR_NOVA_RECEITA_E_BAIXAR',
      autoriza_baixa_automatica: false,
      parcela_candidata_id: null,
      candidatos_encontrados: 0,
      motivo: 'Nenhuma parcela pré-existente encontrada no período consultado.',
    }
  }

  const docRecebimento = String(recebimento.pagador_cpf_cnpj || '').replace(
    /\D/g,
    ''
  )
  const nsuRecebimento = String(recebimento.nsu_tid || '')
    .trim()
    .toUpperCase()
  const docRefRecebimento = String(
    recebimento.documento_referencia ||
      recebimento.identificador_transacao_bancaria ||
      ''
  )
    .trim()
    .toUpperCase()

  const valorBrutoCentavos = Math.round(recebimento.valor_bruto_centavos)
  const valorLiquidoCentavos = Math.round(recebimento.valor_liquido_centavos)

  // 1. Filtrar parcelas com valor compatível (total igual ao bruto, ou saldo nao_pago compatível com baixa parcial/integral)
  const candidatasValor = parcelasExistentes.filter((p) => {
    const totalCentavos = reaisParaCentavos(p.total)
    const naoPagoCentavos = reaisParaCentavos(p.nao_pago)
    return (
      totalCentavos === valorBrutoCentavos ||
      naoPagoCentavos === valorBrutoCentavos ||
      naoPagoCentavos === valorLiquidoCentavos ||
      (naoPagoCentavos > valorBrutoCentavos && valorBrutoCentavos > 0)
    )
  })

  if (candidatasValor.length === 0) {
    return {
      nivel_confianca: 'SEM_CORRESPONDENCIA',
      acao_recomendada: 'CRIAR_NOVA_RECEITA_E_BAIXAR',
      autoriza_baixa_automatica: false,
      parcela_candidata_id: null,
      candidatos_encontrados: 0,
      motivo:
        'Nenhuma parcela existente possui valor ou saldo em aberto compatível com o recebimento.',
    }
  }

  // 2. Verificar se há match por Identificador Forte (NSU ou Número de Documento/Referência)
  const candidatasIdentificadorForte = candidatasValor.filter((p) => {
    const nsuParcela = String(p.nsu || '')
      .trim()
      .toUpperCase()
    const numDocParcela = String(p.numero_documento || '')
      .trim()
      .toUpperCase()

    const matchNsu =
      nsuRecebimento.length > 0 &&
      nsuParcela.length > 0 &&
      nsuRecebimento === nsuParcela
    const matchDocRef =
      docRefRecebimento.length > 0 &&
      numDocParcela.length > 0 &&
      docRefRecebimento === numDocParcela

    return matchNsu || matchDocRef
  })

  if (candidatasIdentificadorForte.length > 1) {
    return {
      nivel_confianca: 'AMBIGUO_MULTIPLOS_CANDIDATOS',
      acao_recomendada: 'REQUER_CONFERENCIA_MANUAL',
      autoriza_baixa_automatica: false,
      parcela_candidata_id: null,
      candidatos_encontrados: candidatasIdentificadorForte.length,
      motivo: `Foram encontradas ${candidatasIdentificadorForte.length} parcelas com o mesmo identificador/documento. Conferência manual obrigatória.`,
    }
  }

  if (candidatasIdentificadorForte.length === 1) {
    const unica = candidatasIdentificadorForte[0]
    const statusUpper = String(unica.status || '').toUpperCase()
    const naoPagoCentavos = reaisParaCentavos(unica.nao_pago)

    if (statusUpper === 'QUITADO' || naoPagoCentavos <= 0) {
      return {
        nivel_confianca: 'EXATO_IDENTIFICADOR',
        acao_recomendada: 'BLOQUEAR_PARCELA_JA_QUITADA',
        autoriza_baixa_automatica: false,
        parcela_candidata_id: unica.id,
        candidatos_encontrados: 1,
        motivo: `A parcela correspondente (${unica.id}) já está quitada no Conta Azul. Baixa duplicada bloqueada.`,
      }
    }

    return {
      nivel_confianca: 'EXATO_IDENTIFICADOR',
      acao_recomendada: 'BAIXAR_PARCELA_EXISTENTE_AUTOMATICO',
      autoriza_baixa_automatica: true,
      parcela_candidata_id: unica.id,
      candidatos_encontrados: 1,
      motivo:
        'Correspondência exata por identificador único (NSU/Documento) e parcela com saldo em aberto.',
    }
  }

  // 3. Verificar correspondência por CPF/CNPJ do cliente + valor/data
  if (docRecebimento.length >= 11) {
    const candidatasCliente = candidatasValor.filter((p) => {
      const docCliente = String(p.cliente?.cpf_cnpj || '').replace(/\D/g, '')
      return docCliente.length >= 11 && docCliente === docRecebimento
    })

    if (candidatasCliente.length > 1) {
      return {
        nivel_confianca: 'AMBIGUO_MULTIPLOS_CANDIDATOS',
        acao_recomendada: 'REQUER_CONFERENCIA_MANUAL',
        autoriza_baixa_automatica: false,
        parcela_candidata_id: null,
        candidatos_encontrados: candidatasCliente.length,
        motivo: `Múltiplas parcelas (${candidatasCliente.length}) encontradas para o mesmo CPF/CNPJ e faixa de valor. Conferência manual obrigatória.`,
      }
    }

    if (candidatasCliente.length === 1) {
      return {
        nivel_confianca: 'ALTO_DOCUMENTO_E_CLIENTE',
        acao_recomendada: 'REQUER_CONFERENCIA_MANUAL',
        autoriza_baixa_automatica: false,
        parcela_candidata_id: candidatasCliente[0].id,
        candidatos_encontrados: 1,
        motivo:
          'Correspondência por CPF/CNPJ e valor localizada, mas sem identificador único de transação/documento. Requer confirmação antes da baixa.',
      }
    }
  }

  // 4. Caso reste apenas coincidência de Valor e/ou Data (sem NSU, sem Documento e sem CPF/CNPJ confirmado):
  // NUNCA autorizar baixa automática!
  return {
    nivel_confianca:
      candidatasValor.length > 1
        ? 'AMBIGUO_MULTIPLOS_CANDIDATOS'
        : 'INSUFICIENTE_APENAS_VALOR_DATA',
    acao_recomendada: 'REQUER_CONFERENCIA_MANUAL',
    autoriza_baixa_automatica: false,
    parcela_candidata_id:
      candidatasValor.length === 1 ? candidatasValor[0].id : null,
    candidatos_encontrados: candidatasValor.length,
    motivo:
      'Valor e data isoladamente são insuficientes para identificar uma receita com segurança. Encaminhado para conferência manual obrigatória.',
  }
}
