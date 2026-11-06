'use client'

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  CreditCard,
  QrCode,
  Layers,
  ShieldCheck,
  Upload,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Lock,
  Plus,
  Trash2,
  Info,
  Calculator,
  ArrowRight,
  FileSpreadsheet,
  Building2,
  RefreshCw,
  Filter,
  Copy,
  Check,
  Landmark,
  Search,
} from 'lucide-react'
import type {
  AvaliacaoPeriodoContaAzulStoneDTO,
  BandeiraCartao,
  CategoriaFinanceiraReceberDTO,
  ClassificacaoTriagemLancamentoCA,
  CodigoErroAutorizacaoReceber,
  ContaFinanceiraReceberDTO,
  EstadoConferenciaGrupoStone,
  GrupoConciliacaoStone,
  LinhaExtratoStone,
  ModalidadeCartao,
  MovimentacaoReceberCanonica,
  NaturezaMovimentacaoReceber,
  OperadoraCartao,
  ParcelaBuscaContaAzulDTO,
  RequisicaoTransmissao1FBDTO,
  RespostaContextoContaAzulReceberDTO,
  RespostaTransmissao1FBDTO,
  ResultadoConciliacaoGrupoStone,
  ResultadoTriagemItemLoteCA,
  SituacaoExecucao1FB,
  StatusItemTransmissao1FB,
} from '@/types/contas-receber'
import {
  consolidarDiaPorNatureza,
  formatarCentavosBRL,
  reaisParaCentavos,
  validarCapacidadeBaixaParcela,
  validarMovimentacaoReceber,
} from '@/lib/contas-receber/validador-financeiro'
import {
  REGISTRY_ADQUIRENTES_CARTAO,
  avaliarCorrespondenciaReceitaExistente,
} from '@/lib/contas-receber/contratos-frentes'
import {
  type RegistroOperacaoReceberExistente,
  gerarChaveDedupMovimentacaoReceber,
} from '@/lib/contas-receber/import-dedup-receber'
import {
  agruparLinhasStonePorDataBandeiraModalidade,
  atualizarValorConferenciaPorGrupo,
  calcularJanelaConsultaContaAzulStone,
  calcularTotaisFiltradosStone,
  conciliarListaGruposStone,
  conferirValorLiquidoComExtratoBancario,
  filtrarLinhasStone,
  formatarMicroBRL,
  gerarChaveGrupoStone,
  gerarPreviaLancamentosMemoriaStone,
  interpretarCsvStone,
  montarRotuloGrupoStoneContaAzul,
} from '@/lib/contas-receber/stone-csv-parser'
import {
  gerarChavesIdempotenciaLoteStone1FA,
  prepararEValidarLancamentosEtapa1FA,
} from '@/lib/contas-receber/preparador-validacao-1fa'

type RegistroIdempotenciaLote1FA = RegistroOperacaoReceberExistente

export type AbaReceber = 'cartoes' | 'pix' | 'outras' | 'conferencia'

interface PainelFrentesReceberProps {
  abaAtiva: AbaReceber
  onChangeAba: (aba: AbaReceber) => void
  empresaId: string
  empresaNome: string
  carregandoEmpresa?: boolean
}

const OPERADORAS_INFO: Array<{
  id: OperadoraCartao
  nome: string
  subtitulo: string
  identificador: string
  corBadge: string
}> = [
  {
    id: 'STONE',
    nome: 'Stone Pagamentos',
    subtitulo: 'Liquidação MDR, RAV/Antecipação e Estornos',
    identificador: 'Stonecode / NSU',
    corBadge: 'is-ok',
  },
  {
    id: 'REDE',
    nome: 'Rede (Itaú)',
    subtitulo: 'Extrato de Recebimentos, PV e Taxas de Adm.',
    identificador: 'Número PV / NSU-CV',
    corBadge: 'is-warn',
  },
  {
    id: 'GETNET',
    nome: 'Getnet',
    subtitulo: 'Extrato Eletrônico, Antecipações e Ajustes POS',
    identificador: 'Código EC / Autorização',
    corBadge: 'is-bad',
  },
  {
    id: 'INFINITEPAY',
    nome: 'InfinitePay',
    subtitulo: 'Recebimentos em D+1, Crédito, Débito e PIX Maquininha',
    identificador: 'Transaction ID / NSU',
    corBadge: 'is-accent',
  },
]

const MOVIMENTACOES_EXEMPLO_INICIAL: MovimentacaoReceberCanonica[] = [
  {
    id_interno: 'sim-1',
    empresa_id: 'emp-demo',
    frente: 'CARTOES_ADQUIRENTE',
    origem: 'STONE',
    natureza: 'LIQUIDACAO_VENDA_NORMAL',
    data_competencia: '2026-11-03',
    data_recebimento: '2026-11-04',
    valor_bruto_centavos: 50000,
    taxa_mdr_centavos: 5000,
    taxa_antecipacao_centavos: 0,
    taxa_total_centavos: 5000,
    valor_liquido_centavos: 45000,
    nsu_tid: 'STN-908172',
    codigo_autorizacao: 'AUT1029',
    bandeira: 'VISA',
    modalidade_cartao: 'CREDITO_VISTA',
    parcela_numero: 1,
    total_parcelas: 1,
  },
  {
    id_interno: 'sim-2',
    empresa_id: 'emp-demo',
    frente: 'CARTOES_ADQUIRENTE',
    origem: 'STONE',
    natureza: 'ANTECIPACAO_RECEBIVEIS',
    data_competencia: '2026-10-25',
    data_recebimento: '2026-11-04',
    valor_bruto_centavos: 100000,
    taxa_mdr_centavos: 2500,
    taxa_antecipacao_centavos: 1500,
    taxa_total_centavos: 4000,
    valor_liquido_centavos: 96000,
    nsu_tid: 'STN-908555',
    codigo_autorizacao: 'AUT4410',
    bandeira: 'MASTERCARD',
    modalidade_cartao: 'ANTECIPACAO',
    parcela_numero: 2,
    total_parcelas: 3,
  },
  {
    id_interno: 'sim-3',
    empresa_id: 'emp-demo',
    frente: 'CARTOES_ADQUIRENTE',
    origem: 'STONE',
    natureza: 'AJUSTE_ALUGUEL_TARIFA',
    data_competencia: '2026-11-04',
    data_recebimento: '2026-11-04',
    valor_bruto_centavos: 0,
    taxa_mdr_centavos: 0,
    taxa_antecipacao_centavos: 0,
    taxa_total_centavos: 8990,
    valor_liquido_centavos: -8990,
    nsu_tid: 'POS-ALUGUEL-11',
    bandeira: 'OUTRAS',
    modalidade_cartao: 'OUTRA',
  },
]

const PARCELAS_CA_MEMORIA: ParcelaBuscaContaAzulDTO[] = [
  {
    id: 'ca-parcela-101',
    evento_id: 'ca-evento-501',
    descricao: 'Venda OS #4810 - Cliente Identificado',
    data_vencimento: '2026-11-04',
    status: 'ABERTO',
    total: 500.0,
    pago: 0,
    nao_pago: 500.0,
    numero_documento: 'OS-4810',
    nsu: 'STN-908172',
    cliente: {
      id: 'cli-01',
      nome: 'Cliente Exemplo LTDA',
      cpf_cnpj: '12345678000199',
    },
  },
  {
    id: 'ca-parcela-102',
    evento_id: 'ca-evento-502',
    descricao: 'Venda Balcão (Apenas Valor e Data)',
    data_vencimento: '2026-11-04',
    status: 'ABERTO',
    total: 1000.0,
    pago: 0,
    nao_pago: 1000.0,
  },
]

export default function PainelFrentesReceber({
  abaAtiva,
  onChangeAba,
  empresaId,
  empresaNome,
  carregandoEmpresa = false,
}: PainelFrentesReceberProps) {
  const supabase = useMemo(() => createClient(), [])
  const requisicaoContextoSeqRef = useRef<number>(0)

  const obterHeadersAutenticados = useCallback(async (): Promise<
    Record<string, string>
  > => {
    const headers: Record<string, string> = {}
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }
    } catch {
      // Segue sem header extra caso getSession falhe
    }
    return headers
  }, [supabase])

  const [operadoraSelecionada, setOperadoraSelecionada] =
    useState<OperadoraCartao>('STONE')
  const [arquivoTentativaNome, setArquivoTentativaNome] = useState<
    string | null
  >(null)

  // Estado exclusivamente em memória do simulador da Etapa 1A
  const [itensSimulados, setItensSimulados] = useState<
    MovimentacaoReceberCanonica[]
  >(MOVIMENTACOES_EXEMPLO_INICIAL)

  // Campos para adicionar item de teste na conferência em memória
  const [novaNatureza, setNovaNatureza] = useState<NaturezaMovimentacaoReceber>(
    'LIQUIDACAO_VENDA_NORMAL'
  )
  const [novaBandeira, setNovaBandeira] = useState<BandeiraCartao>('VISA')
  const [novaModalidade, setNovaModalidade] =
    useState<ModalidadeCartao>('CREDITO_VISTA')
  const [novoNsu, setNovoNsu] = useState('TESTE-001')
  const [novoBrutoReais, setNovoBrutoReais] = useState('500,00')
  const [novaTaxaMdrReais, setNovaTaxaMdrReais] = useState('50,00')
  const [novaTaxaAntecipacaoReais, setNovaTaxaAntecipacaoReais] =
    useState('0,00')
  const [novoLiquidoReais, setNovoLiquidoReais] = useState('450,00')

  // Simulador de baixa parcial/múltipla em memória
  const [saldoParcelaSimReais, setSaldoParcelaSimReais] = useState('1000,00')
  const [valorBaixaSimReais, setValorBaixaSimReais] = useState('400,00')

  // ==========================================================================
  // ETAPA 1C — ESTADO EM MEMÓRIA PARA PLANILHA STONE E CONFERÊNCIA BANCÁRIA
  // ==========================================================================
  const [stoneNomeArquivo, setStoneNomeArquivo] = useState<string | null>(null)
  const [stoneMensagemParse, setStoneMensagemParse] = useState<string | null>(
    null
  )
  const [stoneErroParse, setStoneErroParse] = useState<string | null>(null)
  const [stoneLinhas, setStoneLinhas] = useState<LinhaExtratoStone[]>([])
  const [stoneDatasUnicas, setStoneDatasUnicas] = useState<string[]>([])
  const [stoneBandeirasUnicas, setStoneBandeirasUnicas] = useState<string[]>([])
  const [stoneProdutosUnicos, setStoneProdutosUnicos] = useState<string[]>([])

  // 3 Filtros combinados na sequência exata do procedimento manual:
  // 1º DATA DE VENCIMENTO ORIGINAL -> 2º BANDEIRA -> 3º PRODUTO
  const [filtroDataVencOriginal, setFiltroDataVencOriginal] =
    useState<string>('')
  const [filtroBandeira, setFiltroBandeira] = useState<string>('')
  const [filtroProduto, setFiltroProduto] = useState<string>('')

  // Conferência individual por grupo (Data + Bandeira + Modalidade CD/DB) preservada ao navegar entre grupos
  const [valoresManuaisPorGrupo, setValoresManuaisPorGrupo] = useState<
    Record<string, string>
  >({})
  const [gruposMarcadosConferidos, setGruposMarcadosConferidos] = useState<
    Record<string, boolean>
  >({})
  const [campoCopiado, setCampoCopiado] = useState<string | null>(null)

  // ==========================================================================
  // ETAPA 1E — INTEGRAÇÃO SATÉLITE CONTA AZUL (SOMENTE LEITURA / GET)
  // ==========================================================================
  const [carregandoContextoCA, setCarregandoContextoCA] =
    useState<boolean>(false)
  const [consultandoPeriodoCA, setConsultandoPeriodoCA] =
    useState<boolean>(false)
  const [conectadoContaAzul, setConectadoContaAzul] = useState<boolean>(false)
  const [statusConexaoCA, setStatusConexaoCA] = useState<
    RespostaContextoContaAzulReceberDTO['status_conexao'] | 'AGUARDANDO_EMPRESA'
  >('AGUARDANDO_EMPRESA')
  const [codigoErroContextoCA, setCodigoErroContextoCA] =
    useState<CodigoErroAutorizacaoReceber | null>(null)
  const [mensagemStatusCA, setMensagemStatusCA] = useState<string | null>(null)
  const [erroContextoCA, setErroContextoCA] = useState<string | null>(null)

  const [contasFinanceirasCA, setContasFinanceirasCA] = useState<
    ContaFinanceiraReceberDTO[]
  >([])
  const [contaFinanceiraSelecionadaId, setContaFinanceiraSelecionadaId] =
    useState<string>('')

  const [categoriasReceitaCA, setCategoriasReceitaCA] = useState<
    CategoriaFinanceiraReceberDTO[]
  >([])
  const [categoriaReceitaSelecionadaId, setCategoriaReceitaSelecionadaId] =
    useState<string>('')
  const [sugestaoCatReceitaVendasCA, setSugestaoCatReceitaVendasCA] =
    useState<CategoriaFinanceiraReceberDTO | null>(null)

  const [categoriasDespesaCA, setCategoriasDespesaCA] = useState<
    CategoriaFinanceiraReceberDTO[]
  >([])
  const [categoriaDespesaMdrSelecionadaId, setCategoriaDespesaMdrSelecionadaId] =
    useState<string>('')
  const [sugestaoCatDespesaMdrCA, setSugestaoCatDespesaMdrCA] =
    useState<CategoriaFinanceiraReceberDTO | null>(null)

  const [avaliacaoPeriodoCA, setAvaliacaoPeriodoCA] =
    useState<AvaliacaoPeriodoContaAzulStoneDTO | null>(null)

  const adapterAtivo = REGISTRY_ADQUIRENTES_CARTAO[operadoraSelecionada]

  // Linhas da Stone filtradas pelos 3 filtros sequenciais
  const stoneLinhasFiltradas = useMemo(() => {
    return filtrarLinhasStone(stoneLinhas, {
      data_vencimento_original: filtroDataVencOriginal,
      bandeira: filtroBandeira,
      produto: filtroProduto,
    })
  }, [stoneLinhas, filtroDataVencOriginal, filtroBandeira, filtroProduto])

  // Todos os grupos independentes de conciliação (Data + Bandeira + Modalidade CD/DB + Produto)
  const todosGruposConciliacaoStone = useMemo<GrupoConciliacaoStone[]>(() => {
    return agruparLinhasStonePorDataBandeiraModalidade(stoneLinhas, {
      apenasComParcelasPagas: true,
    })
  }, [stoneLinhas])

  // Grupos disponíveis para a Data de Vencimento Original selecionada (ou todos se nenhuma data filtrada)
  const gruposVisiveisNaDataStone = useMemo<GrupoConciliacaoStone[]>(() => {
    if (!filtroDataVencOriginal) return todosGruposConciliacaoStone
    return todosGruposConciliacaoStone.filter(
      (g) => g.data_vencimento_original_br === filtroDataVencOriginal
    )
  }, [todosGruposConciliacaoStone, filtroDataVencOriginal])

  // Mapa completo de conciliação individual por grupo (preservado ao trocar de filtro)
  const mapaConciliacoesPorGrupoStone = useMemo<
    Record<string, ResultadoConciliacaoGrupoStone>
  >(() => {
    return conciliarListaGruposStone({
      grupos: todosGruposConciliacaoStone,
      avaliacaoPeriodoCA,
      valoresManuaisPorGrupo,
    })
  }, [todosGruposConciliacaoStone, avaliacaoPeriodoCA, valoresManuaisPorGrupo])

  // Chave e grupo atualmente selecionado pelos 3 filtros operacionais (Data + Bandeira + Produto)
  const chaveGrupoAtivoStone = useMemo<string>(() => {
    if (!filtroDataVencOriginal || !filtroBandeira || !filtroProduto) return ''
    return gerarChaveGrupoStone({
      dataVencimentoOriginal: filtroDataVencOriginal,
      bandeira: filtroBandeira,
      produto: filtroProduto,
    })
  }, [filtroDataVencOriginal, filtroBandeira, filtroProduto])

  const grupoAtivoStone = useMemo<GrupoConciliacaoStone | null>(() => {
    if (!chaveGrupoAtivoStone) return null
    return (
      todosGruposConciliacaoStone.find(
        (g) => g.chave_grupo === chaveGrupoAtivoStone
      ) || null
    )
  }, [todosGruposConciliacaoStone, chaveGrupoAtivoStone])

  const valorExtratoBancarioStr = useMemo<string>(() => {
    if (!chaveGrupoAtivoStone) return ''
    return valoresManuaisPorGrupo[chaveGrupoAtivoStone] || ''
  }, [valoresManuaisPorGrupo, chaveGrupoAtivoStone])

  const setValorExtratoBancarioStr = useCallback(
    (novoValor: string) => {
      if (!chaveGrupoAtivoStone) return
      setValoresManuaisPorGrupo((prev) =>
        atualizarValorConferenciaPorGrupo(prev, chaveGrupoAtivoStone, novoValor)
      )
    },
    [chaveGrupoAtivoStone]
  )

  const operacaoMarcadaConferida = useMemo<boolean>(() => {
    if (!chaveGrupoAtivoStone) return false
    return Boolean(gruposMarcadosConferidos[chaveGrupoAtivoStone])
  }, [gruposMarcadosConferidos, chaveGrupoAtivoStone])

  const setOperacaoMarcadaConferida = useCallback(
    (marcado: boolean) => {
      if (!chaveGrupoAtivoStone) return
      setGruposMarcadosConferidos((prev) => ({
        ...prev,
        [chaveGrupoAtivoStone]: marcado,
      }))
    },
    [chaveGrupoAtivoStone]
  )

  // Opções de Bandeira e Produto disponíveis para a Data de Vencimento Original selecionada (facilita o filtro em cascata)
  const bandeirasDisponiveisNaData = useMemo(() => {
    if (!filtroDataVencOriginal) return stoneBandeirasUnicas
    const set = new Set<string>()
    for (const l of stoneLinhas) {
      if (l.data_vencimento_original_str === filtroDataVencOriginal && l.bandeira) {
        set.add(l.bandeira)
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [stoneLinhas, stoneBandeirasUnicas, filtroDataVencOriginal])

  const produtosDisponiveisNoFiltro = useMemo(() => {
    if (!filtroDataVencOriginal && !filtroBandeira) return stoneProdutosUnicos
    const set = new Set<string>()
    for (const l of stoneLinhas) {
      if (
        (!filtroDataVencOriginal ||
          l.data_vencimento_original_str === filtroDataVencOriginal) &&
        (!filtroBandeira || l.bandeira === filtroBandeira) &&
        l.produto
      ) {
        set.add(l.produto)
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [stoneLinhas, stoneProdutosUnicos, filtroDataVencOriginal, filtroBandeira])

  // Totais calculados para o filtro atual da Stone
  const stoneTotaisFiltrados = useMemo(() => {
    if (grupoAtivoStone) {
      return grupoAtivoStone.totais
    }
    return calcularTotaisFiltradosStone(stoneLinhasFiltradas)
  }, [grupoAtivoStone, stoneLinhasFiltradas])

  // Resultado da conferência bancária individual por grupo (Data + Bandeira + Modalidade CD/DB)
  const stoneConferenciaBancaria = useMemo(() => {
    if (chaveGrupoAtivoStone && mapaConciliacoesPorGrupoStone[chaveGrupoAtivoStone]) {
      return mapaConciliacoesPorGrupoStone[chaveGrupoAtivoStone]
    }
    if (!filtroDataVencOriginal || !filtroBandeira || !filtroProduto) {
      return {
        valor_liquido_stone_centavos: stoneTotaisFiltrados.valor_liquido_centavos,
        valor_liquido_stone_micro: stoneTotaisFiltrados.valor_liquido_micro,
        valor_extrato_bancario_centavos: null,
        diferenca_centavos: 0,
        conferencia_aprovada: false,
        bloqueada_para_conferencia: true,
        status_codigo: 'AGUARDANDO_VALOR_BANCO' as const,
        status_conferencia: 'AGUARDANDO_CONFERENCIA' as const,
        estado_grupo: 'AGUARDANDO_CONFERENCIA' as const,
        origem_conferencia: 'NAO_CONFERIDO' as const,
        mensagem:
          'Selecione Data de Vencimento Original + Bandeira + Produto (Modalidade CD/DB) para conciliar o grupo individualmente.',
      }
    }
    return conferirValorLiquidoComExtratoBancario(
      stoneTotaisFiltrados,
      valorExtratoBancarioStr
    )
  }, [
    chaveGrupoAtivoStone,
    mapaConciliacoesPorGrupoStone,
    filtroDataVencOriginal,
    filtroBandeira,
    filtroProduto,
    stoneTotaisFiltrados,
    valorExtratoBancarioStr,
  ])

  // Prévia dos lançamentos preparados em memória (Receitas de Vendas e Tarifas de Cartão de Créditos)
  const stonePreviaLancamentos = useMemo(() => {
    return gerarPreviaLancamentosMemoriaStone({
      filtros: {
        data_vencimento_original: filtroDataVencOriginal,
        bandeira: filtroBandeira,
        produto: filtroProduto,
      },
      totais: stoneTotaisFiltrados,
      conferencia: stoneConferenciaBancaria,
    })
  }, [
    filtroDataVencOriginal,
    filtroBandeira,
    filtroProduto,
    stoneTotaisFiltrados,
    stoneConferenciaBancaria,
  ])

  const contaFinanceiraAtivaObj = useMemo(
    () =>
      contasFinanceirasCA.find(
        (cf) => cf.id === contaFinanceiraSelecionadaId
      ) || null,
    [contasFinanceirasCA, contaFinanceiraSelecionadaId]
  )

  const categoriaReceitaAtivaObj = useMemo(
    () =>
      categoriasReceitaCA.find(
        (c) => c.id === categoriaReceitaSelecionadaId
      ) || null,
    [categoriasReceitaCA, categoriaReceitaSelecionadaId]
  )

  const categoriaDespesaMdrAtivaObj = useMemo(
    () =>
      categoriasDespesaCA.find(
        (c) => c.id === categoriaDespesaMdrSelecionadaId
      ) || null,
    [categoriasDespesaCA, categoriaDespesaMdrSelecionadaId]
  )

  const [exibirPayloadsSimulados1FA, setExibirPayloadsSimulados1FA] =
    useState<boolean>(false)

  // Estados da Etapa 1F-B: Confirmação Explícita, Idempotência e Transmissão Controlada por Grupo
  const [exibirConfirmacao1FB, setExibirConfirmacao1FB] =
    useState<boolean>(false)
  const [checkboxConfirmacao1FB, setCheckboxConfirmacao1FB] =
    useState<boolean>(false)
  const [resultadosTransmissao1FBPorGrupo, setResultadosTransmissao1FBPorGrupo] =
    useState<Record<string, RespostaTransmissao1FBDTO>>({})
  const [errosTransmissao1FBPorGrupo, setErrosTransmissao1FBPorGrupo] =
    useState<Record<string, string | null>>({})
  const [gruposEmTransmissao1FB, setGruposEmTransmissao1FB] = useState<
    Record<string, boolean>
  >({})
  const [registrosIdempotencia1FB, setRegistrosIdempotencia1FB] = useState<
    Record<string, RegistroIdempotenciaLote1FA>
  >({})
  const locksTransmissao1FBRef = useRef<Set<string>>(new Set())

  const limparMapasTransmissao1FB = useCallback(() => {
    setResultadosTransmissao1FBPorGrupo({})
    setErrosTransmissao1FBPorGrupo({})
    setGruposEmTransmissao1FB({})
    setRegistrosIdempotencia1FB({})
    locksTransmissao1FBRef.current.clear()
    setExibirConfirmacao1FB(false)
    setCheckboxConfirmacao1FB(false)
  }, [])

  // Etapa 1F-A: Preparação e Validação Completa dos Lançamentos (Sem Transmissão)
  const preparacaoValidacao1FA = useMemo(() => {
    return prepararEValidarLancamentosEtapa1FA({
      empresaId,
      empresaNome,
      filtros: {
        data_vencimento_original: filtroDataVencOriginal,
        bandeira: filtroBandeira,
        produto: filtroProduto,
      },
      totais: stoneTotaisFiltrados,
      conferencia: stoneConferenciaBancaria,
      contaFinanceiraSelecionada: contaFinanceiraAtivaObj,
      categoriaReceitaSelecionada: categoriaReceitaAtivaObj,
      categoriaDespesaMdrSelecionada: categoriaDespesaMdrAtivaObj,
      avaliacaoPeriodoCA,
      operacoesExistentesIdempotencia: Object.values(registrosIdempotencia1FB),
    })
  }, [
    empresaId,
    empresaNome,
    filtroDataVencOriginal,
    filtroBandeira,
    filtroProduto,
    stoneTotaisFiltrados,
    stoneConferenciaBancaria,
    contaFinanceiraAtivaObj,
    categoriaReceitaAtivaObj,
    categoriaDespesaMdrAtivaObj,
    avaliacaoPeriodoCA,
    registrosIdempotencia1FB,
  ])

  const previaValidacao1FA = preparacaoValidacao1FA

  const chaveGrupoStoneEfetiva = useMemo<string>(() => {
    return (
      chaveGrupoAtivoStone ||
      previaValidacao1FA?.validacao_idempotencia?.chave_lote ||
      `${filtroDataVencOriginal}|${filtroBandeira}|${filtroProduto}`
    )
  }, [
    chaveGrupoAtivoStone,
    previaValidacao1FA?.validacao_idempotencia?.chave_lote,
    filtroDataVencOriginal,
    filtroBandeira,
    filtroProduto,
  ])

  const resultadoTransmissao1FB = useMemo<RespostaTransmissao1FBDTO | null>(() => {
    if (!chaveGrupoStoneEfetiva) return null
    return resultadosTransmissao1FBPorGrupo[chaveGrupoStoneEfetiva] || null
  }, [resultadosTransmissao1FBPorGrupo, chaveGrupoStoneEfetiva])

  const erroTransmissao1FB = useMemo<string | null>(() => {
    if (!chaveGrupoStoneEfetiva) return null
    return errosTransmissao1FBPorGrupo[chaveGrupoStoneEfetiva] || null
  }, [errosTransmissao1FBPorGrupo, chaveGrupoStoneEfetiva])

  const transmitindo1FB = useMemo<boolean>(() => {
    if (!chaveGrupoStoneEfetiva) return false
    return Boolean(gruposEmTransmissao1FB[chaveGrupoStoneEfetiva])
  }, [gruposEmTransmissao1FB, chaveGrupoStoneEfetiva])

  const setResultadoTransmissao1FB = useCallback(
    (
      res: RespostaTransmissao1FBDTO | null,
      chaveGrupoAlvo: string = chaveGrupoStoneEfetiva
    ) => {
      if (!chaveGrupoAlvo) return
      setResultadosTransmissao1FBPorGrupo((prev) => {
        if (!res) {
          if (!(chaveGrupoAlvo in prev)) return prev
          const next = { ...prev }
          delete next[chaveGrupoAlvo]
          return next
        }
        return { ...prev, [chaveGrupoAlvo]: res }
      })
    },
    [chaveGrupoStoneEfetiva]
  )

  const setErroTransmissao1FB = useCallback(
    (
      erro: string | null,
      chaveGrupoAlvo: string = chaveGrupoStoneEfetiva
    ) => {
      if (!chaveGrupoAlvo) return
      setErrosTransmissao1FBPorGrupo((prev) => ({
        ...prev,
        [chaveGrupoAlvo]: erro,
      }))
    },
    [chaveGrupoStoneEfetiva]
  )

  const setTransmitindo1FB = useCallback(
    (
      emAndamento: boolean,
      chaveGrupoAlvo: string = chaveGrupoStoneEfetiva
    ) => {
      if (!chaveGrupoAlvo) return
      setGruposEmTransmissao1FB((prev) => ({
        ...prev,
        [chaveGrupoAlvo]: emAndamento,
      }))
    },
    [chaveGrupoStoneEfetiva]
  )

  const handleSelecionarGrupoConciliacaoStone = useCallback(
    (grupo: GrupoConciliacaoStone) => {
      setFiltroDataVencOriginal(grupo.data_vencimento_original_br)
      setFiltroBandeira(grupo.bandeira_original)
      setFiltroProduto(grupo.produto_original)
    },
    []
  )

  const handleImportarArquivoStone = async (file: File) => {
    setArquivoTentativaNome(file.name)
    if (operadoraSelecionada !== 'STONE') return

    try {
      const texto = await file.text()
      const res = interpretarCsvStone(texto)
      setStoneNomeArquivo(file.name)
      setValoresManuaisPorGrupo({})
      setGruposMarcadosConferidos({})
      limparMapasTransmissao1FB()

      if (!res.sucesso) {
        setStoneErroParse(res.mensagem)
        setStoneMensagemParse(null)
        setStoneLinhas([])
        return
      }

      setStoneErroParse(null)
      setStoneMensagemParse(res.mensagem)
      setStoneLinhas(res.linhas)
      setStoneDatasUnicas(res.datas_vencimento_original_unicas)
      setStoneBandeirasUnicas(res.bandeiras_unicas)
      setStoneProdutosUnicos(res.produtos_unicos)

      // Seleciona por padrão o primeiro grupo individual (Data + Bandeira + Produto CD/DB)
      const gruposIniciais = agruparLinhasStonePorDataBandeiraModalidade(
        res.linhas,
        { apenasComParcelasPagas: true }
      )
      const primeiroGrupo = gruposIniciais[0] || null
      if (primeiroGrupo) {
        setFiltroDataVencOriginal(primeiroGrupo.data_vencimento_original_br)
        setFiltroBandeira(primeiroGrupo.bandeira_original)
        setFiltroProduto(primeiroGrupo.produto_original)
      } else {
        const primeiraData = res.datas_vencimento_original_unicas[0] || ''
        setFiltroDataVencOriginal(primeiraData)
        setFiltroBandeira('')
        setFiltroProduto('')
      }
    } catch (err) {
      setStoneErroParse(
        err instanceof Error
          ? err.message
          : 'Erro ao ler o arquivo CSV da Stone.'
      )
    }
  }

  const handleCopiarValor = (chave: string, centavos: number) => {
    const formatado = (centavos / 100).toFixed(2).replace('.', ',')
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(formatado).catch(() => {})
    }
    setCampoCopiado(chave)
    setTimeout(() => setCampoCopiado(null), 1800)
  }

  // Determina o intervalo ISO (data_de / data_ate) cobrindo as 3 datas do CSV (Vencimento Original, Vencimento e Último Status)
  const periodoIsoFiltroStone = useMemo(() => {
    const janela = calcularJanelaConsultaContaAzulStone(
      stoneLinhas,
      filtroDataVencOriginal
    )
    if (janela) {
      return { data_de: janela.minIso, data_ate: janela.maxIso }
    }
    return null
  }, [stoneLinhas, filtroDataVencOriginal])

  // Carrega contas financeiras e categorias reais da empresa ativa no Conta Azul (100% GET)
  const carregarContextoContaAzulEmpresa = useCallback(
    async (idEmpresaAlvo: string) => {
      const idLimpo = (idEmpresaAlvo || '').trim()
      const seqAtual = ++requisicaoContextoSeqRef.current

      // Limpa imediatamente qualquer estado da loja anterior para impedir reutilização entre lojas
      setConectadoContaAzul(false)
      setMensagemStatusCA(null)
      setErroContextoCA(null)
      setCodigoErroContextoCA(null)
      setContasFinanceirasCA([])
      setContaFinanceiraSelecionadaId('')
      setCategoriasReceitaCA([])
      setCategoriaReceitaSelecionadaId('')
      setSugestaoCatReceitaVendasCA(null)
      setCategoriasDespesaCA([])
      setCategoriaDespesaMdrSelecionadaId('')
      setSugestaoCatDespesaMdrCA(null)
      setAvaliacaoPeriodoCA(null)

      if (!idLimpo || idLimpo === 'emp-demo') {
        setStatusConexaoCA('AGUARDANDO_EMPRESA')
        setCarregandoContextoCA(false)
        setMensagemStatusCA(
          'Selecione uma empresa real no topo da página para consultar contas financeiras e categorias reais no Conta Azul.'
        )
        return
      }

      setCarregandoContextoCA(true)
      try {
        const headers = await obterHeadersAutenticados()
        const params = new URLSearchParams({ empresa_id: idLimpo })
        const resp = await fetch(
          `/api/contas-receber/contexto-conta-azul?${params.toString()}`,
          { method: 'GET', headers, cache: 'no-store' }
        )
        const json =
          (await resp.json()) as RespostaContextoContaAzulReceberDTO

        // Descarta resposta obsoleta caso o usuário tenha trocado de empresa durante o carregamento
        if (seqAtual !== requisicaoContextoSeqRef.current) {
          return
        }

        setStatusConexaoCA(json.status_conexao || 'ATENCAO')
        setCodigoErroContextoCA(json.codigo_erro || null)

        if (!resp.ok || !json.connected || json.status_conexao !== 'CONECTADA') {
          setConectadoContaAzul(Boolean(json.connected))
          setErroContextoCA(
            json.aviso ||
              'Não foi possível consultar o contexto do Conta Azul para a empresa selecionada.'
          )
          return
        }

        setConectadoContaAzul(true)
        setMensagemStatusCA(
          json.aviso ||
            `Contexto Conta Azul carregado com sucesso (${json.contas_financeiras.length} conta(s) financeira(s), ${json.categorias_receita.length} categoria(s) de receita e ${json.categorias_despesa.length} categoria(s) de despesa).`
        )
        setContasFinanceirasCA(json.contas_financeiras || [])
        if (json.contas_financeiras && json.contas_financeiras.length > 0) {
          setContaFinanceiraSelecionadaId(json.contas_financeiras[0].id)
        }

        setCategoriasReceitaCA(json.categorias_receita || [])
        setSugestaoCatReceitaVendasCA(
          json.sugestao_categoria_receita_vendas || null
        )
        if (json.sugestao_categoria_receita_vendas?.id) {
          setCategoriaReceitaSelecionadaId(
            json.sugestao_categoria_receita_vendas.id
          )
        } else if (
          json.categorias_receita &&
          json.categorias_receita.length > 0
        ) {
          setCategoriaReceitaSelecionadaId(json.categorias_receita[0].id)
        }

        setCategoriasDespesaCA(json.categorias_despesa || [])
        setSugestaoCatDespesaMdrCA(json.sugestao_categoria_despesa_mdr || null)
        if (json.sugestao_categoria_despesa_mdr?.id) {
          setCategoriaDespesaMdrSelecionadaId(
            json.sugestao_categoria_despesa_mdr.id
          )
        } else if (
          json.categorias_despesa &&
          json.categorias_despesa.length > 0
        ) {
          setCategoriaDespesaMdrSelecionadaId(json.categorias_despesa[0].id)
        }
      } catch (err) {
        if (seqAtual !== requisicaoContextoSeqRef.current) {
          return
        }
        setStatusConexaoCA('ATENCAO')
        setErroContextoCA(
          err instanceof Error
            ? err.message
            : 'Falha de comunicação ao consultar o Conta Azul em modo leitura.'
        )
      } finally {
        if (seqAtual === requisicaoContextoSeqRef.current) {
          setCarregandoContextoCA(false)
        }
      }
    },
    [obterHeadersAutenticados]
  )

  // Sempre que a empresa selecionada mudar (e o carregamento inicial de empresa tiver concluído), recarrega o contexto exclusivo da loja ativa
  useEffect(() => {
    if (carregandoEmpresa) return
    carregarContextoContaAzulEmpresa(empresaId)
  }, [empresaId, carregandoEmpresa, carregarContextoContaAzulEmpresa])

  // Quando a Empresa mudar, limpa todos os mapas de transmissão e idempotência da Etapa 1F-B
  useEffect(() => {
    limparMapasTransmissao1FB()
  }, [empresaId, limparMapasTransmissao1FB])

  // Quando a Data de Vencimento Original ou a Empresa mudar, limpa a avaliação do período consultado no Conta Azul.
  // A navegação entre Bandeira e Produto dentro da mesma data preserva a avaliação GET já carregada e os valores conferidos por grupo!
  useEffect(() => {
    setAvaliacaoPeriodoCA(null)
  }, [filtroDataVencOriginal, empresaId])

  // Ao trocar filtroBandeira, filtroProduto ou parâmetros do formulário, fecha apenas o modal/box de confirmação,
  // preservando integralmente os resultados de transmissão 1F-B já registrados para cada grupo!
  useEffect(() => {
    setExibirConfirmacao1FB(false)
    setCheckboxConfirmacao1FB(false)
  }, [
    filtroDataVencOriginal,
    filtroBandeira,
    filtroProduto,
    empresaId,
    contaFinanceiraSelecionadaId,
    categoriaReceitaSelecionadaId,
    categoriaDespesaMdrSelecionadaId,
    valorExtratoBancarioStr,
  ])

  const chaveIdempotenciaLoteAtivo1FA =
    preparacaoValidacao1FA.validacao_idempotencia.chave_lote
  const chaveIdempotenciaReceitaAtiva1FA =
    preparacaoValidacao1FA.lancamento_receita_bruta.chave_idempotencia
  const chaveIdempotenciaDespesaMdrAtiva1FA =
    preparacaoValidacao1FA.lancamento_despesa_mdr.chave_idempotencia

  // Sincronização Automática de Idempotência via GET /api/contas-receber/transmitir-1fb sempre que um grupo individual válido estiver selecionado
  useEffect(() => {
    const idEmp = (empresaId || '').trim()
    if (
      !idEmp ||
      idEmp === 'emp-demo' ||
      !chaveGrupoAtivoStone ||
      !chaveIdempotenciaLoteAtivo1FA
    ) {
      return
    }

    const chavesConsulta = [
      chaveIdempotenciaLoteAtivo1FA,
      chaveIdempotenciaReceitaAtiva1FA,
      chaveIdempotenciaDespesaMdrAtiva1FA,
    ].filter((c) => Boolean(c && c.trim().length > 0))

    if (chavesConsulta.length === 0) return

    let cancelado = false

    const sincronizarIdempotenciaGrupoAtivo = async () => {
      try {
        const headers = await obterHeadersAutenticados()
        const params = new URLSearchParams({
          empresa_id: idEmp,
          chaves: chavesConsulta.join(','),
        })
        const resp = await fetch(
          `/api/contas-receber/transmitir-1fb?${params.toString()}`,
          { method: 'GET', headers, cache: 'no-store' }
        )
        if (!resp.ok || cancelado) return
        const dados = (await resp.json()) as {
          registros_idempotencia?: RegistroIdempotenciaLote1FA[]
        }
        if (cancelado || !Array.isArray(dados.registros_idempotencia)) return
        if (dados.registros_idempotencia.length > 0) {
          setRegistrosIdempotencia1FB((prev) => {
            const next = { ...prev }
            for (const reg of dados.registros_idempotencia!) {
              if (reg && reg.chave_idempotencia) {
                next[reg.chave_idempotencia] = reg
              }
            }
            return next
          })
        }
      } catch {
        // Silencia falha de rede de consulta prévia sem bloquear a navegação
      }
    }

    sincronizarIdempotenciaGrupoAtivo()

    return () => {
      cancelado = true
    }
  }, [
    empresaId,
    chaveGrupoAtivoStone,
    chaveIdempotenciaLoteAtivo1FA,
    chaveIdempotenciaReceitaAtiva1FA,
    chaveIdempotenciaDespesaMdrAtiva1FA,
    obterHeadersAutenticados,
  ])

  const obterResumoIdempotenciaECaixaGrupo1FB = useCallback(
    (
      chaveGrupo: string,
      chavesIdemp?: {
        chaveLote: string
        chaveReceitaBruta: string
        chaveDespesaMdr: string
      }
    ) => {
      const resultadoMem = resultadosTransmissao1FBPorGrupo[chaveGrupo] || null
      const erroMem = errosTransmissao1FBPorGrupo[chaveGrupo] || null
      const emTransmissao = Boolean(
        gruposEmTransmissao1FB[chaveGrupo] ||
          locksTransmissao1FBRef.current.has(chaveGrupo)
      )

      const regLote = chavesIdemp?.chaveLote
        ? registrosIdempotencia1FB[chavesIdemp.chaveLote] || null
        : null
      const regReceita = chavesIdemp?.chaveReceitaBruta
        ? registrosIdempotencia1FB[chavesIdemp.chaveReceitaBruta] || null
        : null
      const regDespesa = chavesIdemp?.chaveDespesaMdr
        ? registrosIdempotencia1FB[chavesIdemp.chaveDespesaMdr] || null
        : null

      return {
        resultadoMem,
        erroMem,
        emTransmissao,
        regLote,
        regReceita,
        regDespesa,
      }
    },
    [
      resultadosTransmissao1FBPorGrupo,
      errosTransmissao1FBPorGrupo,
      gruposEmTransmissao1FB,
      registrosIdempotencia1FB,
    ]
  )

  const avaliacaoEstadoTransmissaoGrupoAtivo1FB = useMemo(() => {
    const situacaoMem = resultadoTransmissao1FB?.situacao || null
    const regLote =
      registrosIdempotencia1FB[chaveIdempotenciaLoteAtivo1FA] || null
    const regReceita =
      registrosIdempotencia1FB[chaveIdempotenciaReceitaAtiva1FA] || null
    const regDespesa =
      registrosIdempotencia1FB[chaveIdempotenciaDespesaMdrAtiva1FA] || null
    const mdrExigido =
      stoneTotaisFiltrados.desconto_mdr_ajustado_centavos > 0

    const receitaConfirmadaIdemp = Boolean(
      regReceita &&
        (regReceita.status === 'RECEITA_CRIADA_SEM_BAIXA' ||
          regReceita.status === 'BAIXADO_COMPLETO' ||
          regReceita.status === 'CONCILIADO_EXISTENTE')
    )
    const despesaConfirmadaIdemp = mdrExigido
      ? Boolean(
          regDespesa &&
            (regDespesa.status === 'RECEITA_CRIADA_SEM_BAIXA' ||
              regDespesa.status === 'BAIXADO_COMPLETO' ||
              regDespesa.status === 'CONCILIADO_EXISTENTE')
        )
      : true

    const possuiIncertezaIdemp = Boolean(
      regLote?.status === 'RECONCILIACAO_NECESSARIA' ||
        regReceita?.status === 'RECONCILIACAO_NECESSARIA' ||
        regDespesa?.status === 'RECONCILIACAO_NECESSARIA'
    )

    const jaConcluidoTotal =
      situacaoMem === 'SUCESSO_COMPLETO' ||
      situacaoMem === 'JA_CONCLUIDO_IDEMPOTENTE' ||
      (!situacaoMem && receitaConfirmadaIdemp && despesaConfirmadaIdemp)

    const bloqueadoIncerto =
      situacaoMem === 'RECONCILIACAO_NECESSARIA_BLOQUEADO' ||
      Boolean(resultadoTransmissao1FB?.reconciliacao_necessaria) ||
      possuiIncertezaIdemp

    const falhaParcialRetomavel =
      situacaoMem === 'FALHA_PARCIAL_RETOMAVEL' ||
      (!jaConcluidoTotal &&
        !bloqueadoIncerto &&
        (receitaConfirmadaIdemp !== despesaConfirmadaIdemp) &&
        (receitaConfirmadaIdemp ||
          (mdrExigido && Boolean(regDespesa && regDespesa.status !== 'PENDENTE'))))

    const bloqueadoConcorrencia =
      situacaoMem === 'BLOQUEADO_CONCORRENCIA_LOTE_EM_ANDAMENTO'

    // Se a 1F-A bloqueou UNICAMENTE por IDEMPOTENCIA_JA_EXECUTADA_OU_AMBIGUA mas estamos em FALHA_PARCIAL_RETOMAVEL (ou retomada do item faltante), permite abrir e reenviar com segurança!
    const bloqueiosNaoIdempotencia = preparacaoValidacao1FA.bloqueios.filter(
      (b) => b.codigo !== 'IDEMPOTENCIA_JA_EXECUTADA_OU_AMBIGUA'
    )
    const prontoNa1FAOuRetomavel =
      preparacaoValidacao1FA.pronto_para_etapa_1fb ||
      (falhaParcialRetomavel && bloqueiosNaoIdempotencia.length === 0)

    const podeIniciarConfirmacaoOuReenvio =
      !transmitindo1FB &&
      !jaConcluidoTotal &&
      !bloqueadoIncerto &&
      prontoNa1FAOuRetomavel

    let motivoBloqueioBotao1FB: string | null = null
    if (transmitindo1FB) {
      motivoBloqueioBotao1FB =
        'Transmissão em andamento para este grupo. Aguarde a conclusão.'
    } else if (jaConcluidoTotal) {
      motivoBloqueioBotao1FB =
        'Grupo já transmitido e concluído (idempotência ativa). Reenvio bloqueado para impedir duplicidade.'
    } else if (bloqueadoIncerto) {
      motivoBloqueioBotao1FB =
        'Resultado incerto detectado (RECONCILIACAO_NECESSARIA_BLOQUEADO). Reenvio automático bloqueado até auditoria na Conta Azul.'
    } else if (!prontoNa1FAOuRetomavel) {
      motivoBloqueioBotao1FB =
        'Aguardando aprovação de todos os critérios da Etapa 1F-A para liberar confirmação.'
    }

    return {
      jaConcluidoTotal,
      bloqueadoIncerto,
      falhaParcialRetomavel,
      bloqueadoConcorrencia,
      prontoNa1FAOuRetomavel,
      podeIniciarConfirmacaoOuReenvio,
      motivoBloqueioBotao1FB,
      regReceita,
      regDespesa,
      receitaConfirmadaIdemp,
      despesaConfirmadaIdemp,
    }
  }, [
    resultadoTransmissao1FB,
    registrosIdempotencia1FB,
    chaveIdempotenciaLoteAtivo1FA,
    chaveIdempotenciaReceitaAtiva1FA,
    chaveIdempotenciaDespesaMdrAtiva1FA,
    stoneTotaisFiltrados.desconto_mdr_ajustado_centavos,
    preparacaoValidacao1FA.bloqueios,
    preparacaoValidacao1FA.pronto_para_etapa_1fb,
    transmitindo1FB,
  ])

  const handleExecutarTransmissaoControlada1FB = async () => {
    const chaveGrupoEnvio = chaveGrupoStoneEfetiva
    if (!chaveGrupoEnvio) return

    // Bloqueio síncrono instantâneo contra cliques repetidos ou execuções concorrentes do mesmo grupo
    if (
      locksTransmissao1FBRef.current.has(chaveGrupoEnvio) ||
      gruposEmTransmissao1FB[chaveGrupoEnvio]
    ) {
      return
    }

    if (avaliacaoEstadoTransmissaoGrupoAtivo1FB.jaConcluidoTotal) {
      setErroTransmissao1FB(
        'Este grupo já foi transmitido e concluído anteriormente (idempotência ativa). O reenvio está bloqueado para evitar duplicidade.',
        chaveGrupoEnvio
      )
      return
    }

    if (avaliacaoEstadoTransmissaoGrupoAtivo1FB.bloqueadoIncerto) {
      setErroTransmissao1FB(
        'Este grupo está em estado de Resultado Incerto (RECONCILIACAO_NECESSARIA_BLOQUEADO). Verifique a Conta Azul antes de qualquer nova ação.',
        chaveGrupoEnvio
      )
      return
    }

    if (!avaliacaoEstadoTransmissaoGrupoAtivo1FB.prontoNa1FAOuRetomavel) {
      setErroTransmissao1FB(
        'A preparação e validação da Etapa 1F-A possui pendências impeditivas. Resolva os bloqueios antes de transmitir.',
        chaveGrupoEnvio
      )
      return
    }
    if (!checkboxConfirmacao1FB) {
      setErroTransmissao1FB(
        'Marque a caixa de confirmação explícita para autorizar a execução da Etapa 1F-B.',
        chaveGrupoEnvio
      )
      return
    }

    locksTransmissao1FBRef.current.add(chaveGrupoEnvio)
    setTransmitindo1FB(true, chaveGrupoEnvio)
    setErroTransmissao1FB(null, chaveGrupoEnvio)

    const conferenciaBancaria = stoneConferenciaBancaria

    try {
      const identificadoresSet = new Set<string>()
      for (const l of stoneLinhasFiltradas) {
        if (l.stonecode && l.stonecode.length >= 4) {
          identificadoresSet.add(l.stonecode)
        }
        if (l.stone_id && l.stone_id.length >= 4) {
          identificadoresSet.add(l.stone_id)
        }
        if (identificadoresSet.size >= 15) break
      }

      const corpo: RequisicaoTransmissao1FBDTO = {
        empresa_id: empresaId,
        empresa_nome: empresaNome,
        filtros: {
          data_vencimento_original: filtroDataVencOriginal,
          bandeira: filtroBandeira,
          produto: filtroProduto,
        },
        totais: stoneTotaisFiltrados,
        conferencia: {
          ...conferenciaBancaria,
          valor_liquido_stone_centavos:
            conferenciaBancaria.valor_liquido_stone_centavos,
          valor_liquido_stone_micro:
            conferenciaBancaria.valor_liquido_stone_micro,
          valor_extrato_bancario_centavos:
            conferenciaBancaria.valor_extrato_bancario_centavos,
          diferenca_centavos: conferenciaBancaria.diferenca_centavos,
          conferencia_aprovada: conferenciaBancaria.conferencia_aprovada,
          ...(conferenciaBancaria.origem_conferencia
            ? { origem_conferencia: conferenciaBancaria.origem_conferencia }
            : {}),
          ...(conferenciaBancaria.lancamento_conta_azul_correspondente
            ? {
                lancamento_conta_azul_correspondente:
                  conferenciaBancaria.lancamento_conta_azul_correspondente,
              }
            : {}),
        },
        conta_financeira_selecionada: contaFinanceiraAtivaObj,
        categoria_receita_selecionada: categoriaReceitaAtivaObj,
        categoria_despesa_mdr_selecionada: categoriaDespesaMdrAtivaObj,
        identificadores_deterministicos: Array.from(identificadoresSet),
        confirmacao_explicita: {
          confirmado_pelo_usuario: true,
          confirmado_em_iso: new Date().toISOString(),
          loja_id: empresaId,
          loja_nome: empresaNome,
          conta_financeira_id: contaFinanceiraAtivaObj?.id || '',
          conta_financeira_nome: contaFinanceiraAtivaObj?.descricao || '',
          categoria_receita_id: categoriaReceitaAtivaObj?.id || '',
          categoria_receita_nome: categoriaReceitaAtivaObj?.nome || '',
          categoria_despesa_mdr_id: categoriaDespesaMdrAtivaObj?.id || '',
          categoria_despesa_mdr_nome: categoriaDespesaMdrAtivaObj?.nome || '',
          valor_receita_bruta_centavos:
            stoneTotaisFiltrados.valor_bruto_centavos,
          valor_despesa_mdr_centavos:
            stoneTotaisFiltrados.desconto_mdr_ajustado_centavos,
          valor_liquido_centavos: stoneTotaisFiltrados.valor_liquido_centavos,
          data_lancamentos_iso:
            preparacaoValidacao1FA.filtros_operacionais
              .data_vencimento_original_iso,
          status_conferencia_bancaria:
            conferenciaBancaria.status_conferencia,
        },
      }

      const authHeaders = await obterHeadersAutenticados()
      const resp = await fetch('/api/contas-receber/transmitir-1fb', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify(corpo),
      })

      const dados = (await resp.json()) as RespostaTransmissao1FBDTO & {
        registros_idempotencia?: RegistroIdempotenciaLote1FA[]
      }
      setResultadoTransmissao1FB(dados, chaveGrupoEnvio)

      // Atualiza o mapa de idempotência local com registros_idempotencia (se retornados) e com os itens processados
      setRegistrosIdempotencia1FB((prev) => {
        const next = { ...prev }
        if (Array.isArray(dados.registros_idempotencia)) {
          for (const reg of dados.registros_idempotencia) {
            if (reg && reg.chave_idempotencia) {
              next[reg.chave_idempotencia] = reg
            }
          }
        }
        const converterItemParaRegistro = (
          item: RespostaTransmissao1FBDTO['receita_bruta']
        ): RegistroIdempotenciaLote1FA | null => {
          if (!item || !item.chave_idempotencia) return null
          if (
            item.status === 'TRANSMITIDO_COM_SUCESSO' ||
            item.status === 'JA_TRANSMITIDO_ANTERIORMENTE'
          ) {
            return {
              chave_idempotencia: item.chave_idempotencia,
              status: 'RECEITA_CRIADA_SEM_BAIXA',
              conta_azul_evento_id: item.conta_azul_evento_id,
              conta_azul_parcela_id: item.conta_azul_parcela_id,
            }
          }
          if (item.status === 'RECONCILIACAO_NECESSARIA') {
            return {
              chave_idempotencia: item.chave_idempotencia,
              status: 'RECONCILIACAO_NECESSARIA',
              conta_azul_evento_id: item.conta_azul_evento_id,
              conta_azul_parcela_id: item.conta_azul_parcela_id,
              erro_mensagem: item.erro_detalhe || item.mensagem,
            }
          }
          if (item.status === 'FALHA_TRANSMISSAO') {
            return {
              chave_idempotencia: item.chave_idempotencia,
              status: 'ERRO',
              erro_mensagem: item.erro_detalhe || item.mensagem,
            }
          }
          return null
        }

        const regRec = converterItemParaRegistro(dados.receita_bruta)
        if (regRec) next[regRec.chave_idempotencia] = regRec

        const regDesp = converterItemParaRegistro(dados.despesa_mdr)
        if (regDesp) next[regDesp.chave_idempotencia] = regDesp

        return next
      })
    } catch (err) {
      setErroTransmissao1FB(
        err instanceof Error
          ? err.message
          : 'Erro de comunicação ao chamar o endpoint da Etapa 1F-B.',
        chaveGrupoEnvio
      )
    } finally {
      locksTransmissao1FBRef.current.delete(chaveGrupoEnvio)
      setTransmitindo1FB(false, chaveGrupoEnvio)
    }
  }

  // Consulta lançamentos existentes (Receitas e Despesas) no período filtrado no Conta Azul (100% GET)
  const handleConsultarLancamentosPeriodoContaAzul = async () => {
    if (!empresaId) {
      setErroContextoCA(
        'Selecione uma empresa ativa para consultar lançamentos no Conta Azul.'
      )
      return
    }
    if (!periodoIsoFiltroStone) {
      setErroContextoCA(
        'Importe a planilha Stone e selecione uma Data de Vencimento Original para consultar o período no Conta Azul.'
      )
      return
    }

    setConsultandoPeriodoCA(true)
    setErroContextoCA(null)

    try {
      const identificadoresSet = new Set<string>()
      for (const l of stoneLinhasFiltradas) {
        if (l.stonecode && l.stonecode.length >= 4) {
          identificadoresSet.add(l.stonecode)
        }
        if (l.stone_id && l.stone_id.length >= 4) {
          identificadoresSet.add(l.stone_id)
        }
        if (identificadoresSet.size >= 15) break
      }

      const params = new URLSearchParams({
        empresa_id: empresaId,
        data_de: periodoIsoFiltroStone.data_de,
        data_ate: periodoIsoFiltroStone.data_ate,
        valor_bruto_centavos: String(stoneTotaisFiltrados.valor_bruto_centavos),
        valor_mdr_centavos: String(
          stoneTotaisFiltrados.desconto_mdr_ajustado_centavos
        ),
        valor_liquido_centavos: String(
          stoneTotaisFiltrados.valor_liquido_centavos
        ),
        identificadores: Array.from(identificadoresSet).join(','),
      })

      const headers = await obterHeadersAutenticados()
      const resp = await fetch(
        `/api/contas-receber/contexto-conta-azul?${params.toString()}`,
        { method: 'GET', headers, cache: 'no-store' }
      )
      const json = (await resp.json()) as RespostaContextoContaAzulReceberDTO

      setStatusConexaoCA(json.status_conexao || 'ATENCAO')
      setCodigoErroContextoCA(json.codigo_erro || null)

      if (!resp.ok || !json.connected || json.status_conexao !== 'CONECTADA') {
        setErroContextoCA(
          json.aviso ||
            'Erro ao consultar lançamentos existentes no período no Conta Azul.'
        )
        return
      }

      setConectadoContaAzul(true)
      if (json.avaliacao_periodo) {
        setAvaliacaoPeriodoCA(json.avaliacao_periodo)
      }
    } catch (err) {
      setErroContextoCA(
        err instanceof Error
          ? err.message
          : 'Erro ao consultar lançamentos do período no Conta Azul.'
      )
    } finally {
      setConsultandoPeriodoCA(false)
    }
  }

  const obterEstiloClassificacaoCA = (
    classificacao: ClassificacaoTriagemLancamentoCA
  ): { badgeClass: string; label: string } => {
    switch (classificacao) {
      case 'CORRESPONDENCIA_DETERMINISTICA':
        return {
          badgeClass: 'is-ok',
          label: 'Correspondência Determinística',
        }
      case 'JA_QUITADO_BLOQUEADO':
        return {
          badgeClass: 'is-bad',
          label: 'Já Quitado · Bloqueado para Nova Baixa',
        }
      case 'MULTIPLOS_CANDIDATOS_CONFERENCIA_HUMANA':
        return {
          badgeClass: 'is-warn',
          label: 'Múltiplos Candidatos · Conferência Humana',
        }
      case 'CANDIDATO_VALOR_DATA_CONFERENCIA_HUMANA':
        return {
          badgeClass: 'is-warn',
          label: 'Possível Correspondência (Valor+Data) · Conferência Humana',
        }
      case 'NAO_LOCALIZADO_NO_PERIODO':
      default:
        return {
          badgeClass: 'is-accent',
          label: 'Não Localizado no Período Consultado',
        }
    }
  }

  const obterEstiloEstadoGrupoStone = (
    estado: EstadoConferenciaGrupoStone | undefined
  ): { badgeClass: string; label: string } => {
    switch (estado) {
      case 'CONFERIDO_EXATO':
        return {
          badgeClass: 'is-ok',
          label: 'CONFERIDO_EXATO',
        }
      case 'DIVERGENTE_BLOQUEADA':
        return {
          badgeClass: 'is-bad',
          label: 'DIVERGENTE_BLOQUEADA',
        }
      case 'DUPLICIDADE_AMBIGUA_CA':
        return {
          badgeClass: 'is-bad',
          label: 'DUPLICIDADE_AMBIGUA_CA',
        }
      case 'AUSENTE_CONTA_AZUL':
        return {
          badgeClass: 'is-warn',
          label: 'AUSENTE_CONTA_AZUL',
        }
      case 'AGUARDANDO_CONFERENCIA':
      default:
        return {
          badgeClass: 'is-warn',
          label: 'AGUARDANDO_CONFERENCIA',
        }
    }
  }

  const obterBadgeEstado1FBGrupoStone = useCallback(
    (
      grp: GrupoConciliacaoStone,
      conc: ResultadoConciliacaoGrupoStone | undefined
    ): { badgeClass: string; label: string; extraClass?: string } | null => {
      const chavesGrp = gerarChavesIdempotenciaLoteStone1FA({
        empresaId: (empresaId || '').trim(),
        dataVencimentoOriginalIso:
          grp.data_vencimento_original_iso || 'SEM_DATA',
        bandeira: grp.bandeira_original || 'TODAS',
        produto: grp.produto_original || 'TODOS',
        contaFinanceiraId: contaFinanceiraSelecionadaId || 'SEM_CONTA',
        valorBrutoCentavos: grp.totais.valor_bruto_centavos,
        valorMdrCentavos: grp.totais.desconto_mdr_ajustado_centavos,
        valorLiquidoCentavos: grp.totais.valor_liquido_centavos,
      })

      const {
        resultadoMem,
        erroMem,
        emTransmissao,
        regLote,
        regReceita,
        regDespesa,
      } = obterResumoIdempotenciaECaixaGrupo1FB(grp.chave_grupo, chavesGrp)

      if (emTransmissao) {
        return {
          badgeClass: 'is-accent',
          label: '1F-B: Transmitindo...',
          extraClass: 'animate-pulse',
        }
      }

      const situacao = resultadoMem?.situacao || null

      if (
        situacao === 'SUCESSO_COMPLETO' ||
        situacao === 'JA_CONCLUIDO_IDEMPOTENTE'
      ) {
        return {
          badgeClass: 'is-ok',
          label: '1F-B: Transmitido',
        }
      }

      if (situacao === 'FALHA_PARCIAL_RETOMAVEL') {
        return {
          badgeClass: 'is-warn',
          label: '1F-B: Falha Parcial (Retomável)',
        }
      }

      if (
        situacao === 'RECONCILIACAO_NECESSARIA_BLOQUEADO' ||
        resultadoMem?.reconciliacao_necessaria
      ) {
        return {
          badgeClass: 'is-bad',
          label: '1F-B: Resultado Incerto (Auditoria)',
        }
      }

      if (situacao === 'BLOQUEADO_TRAVA_SEGURANCA_ETAPA') {
        return {
          badgeClass: 'is-accent',
          label: '1F-B: Retido (Trava Segurança)',
        }
      }

      if (situacao || erroMem) {
        return {
          badgeClass: 'is-bad',
          label: '1F-B: Erro / Bloqueado',
        }
      }

      // Avaliação via registros persistidos de idempotência quando não há resposta em memória
      const mdrExigido = grp.totais.desconto_mdr_ajustado_centavos > 0
      const recConfirmada = Boolean(
        regReceita &&
          (regReceita.status === 'RECEITA_CRIADA_SEM_BAIXA' ||
            regReceita.status === 'BAIXADO_COMPLETO' ||
            regReceita.status === 'CONCILIADO_EXISTENTE')
      )
      const despConfirmada = mdrExigido
        ? Boolean(
            regDespesa &&
              (regDespesa.status === 'RECEITA_CRIADA_SEM_BAIXA' ||
                regDespesa.status === 'BAIXADO_COMPLETO' ||
                regDespesa.status === 'CONCILIADO_EXISTENTE')
          )
        : true

      if (
        regLote?.status === 'RECONCILIACAO_NECESSARIA' ||
        regReceita?.status === 'RECONCILIACAO_NECESSARIA' ||
        regDespesa?.status === 'RECONCILIACAO_NECESSARIA'
      ) {
        return {
          badgeClass: 'is-bad',
          label: '1F-B: Resultado Incerto (Auditoria)',
        }
      }

      if (recConfirmada && despConfirmada) {
        return {
          badgeClass: 'is-ok',
          label: '1F-B: Transmitido',
        }
      }

      if (recConfirmada !== despConfirmada && (recConfirmada || Boolean(regDespesa))) {
        return {
          badgeClass: 'is-warn',
          label: '1F-B: Falha Parcial (Retomável)',
        }
      }

      if (regLote?.status === 'ERRO' || regReceita?.status === 'ERRO' || regDespesa?.status === 'ERRO') {
        return {
          badgeClass: 'is-bad',
          label: '1F-B: Erro / Bloqueado',
        }
      }

      if (conc?.estado_grupo === 'CONFERIDO_EXATO') {
        return {
          badgeClass: '',
          label: '1F-B: Pendente',
        }
      }

      return null
    },
    [
      empresaId,
      contaFinanceiraSelecionadaId,
      obterResumoIdempotenciaECaixaGrupo1FB,
    ]
  )

  const resumoConsolidado = useMemo(() => {
    return consolidarDiaPorNatureza(
      '2026-11-04',
      operadoraSelecionada,
      itensSimulados
    )
  }, [operadoraSelecionada, itensSimulados])

  const resultadoBaixaParcialSim = useMemo(() => {
    try {
      const saldoCentavos = reaisParaCentavos(saldoParcelaSimReais)
      const baixaCentavos = reaisParaCentavos(valorBaixaSimReais)
      return validarCapacidadeBaixaParcela({
        parcela_id: 'ca-parcela-101',
        saldo_aberto_centavos: saldoCentavos,
        valor_baixa_centavos: baixaCentavos,
      })
    } catch {
      return null
    }
  }, [saldoParcelaSimReais, valorBaixaSimReais])

  const handleAdicionarSimulacao = (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const bruto = reaisParaCentavos(novoBrutoReais)
      const mdr = reaisParaCentavos(novaTaxaMdrReais)
      const antecipacao = reaisParaCentavos(novaTaxaAntecipacaoReais)
      const liquido = reaisParaCentavos(novoLiquidoReais)
      const taxaTotal = mdr + antecipacao

      const novoItem: MovimentacaoReceberCanonica = {
        id_interno: `sim-${Date.now()}`,
        empresa_id: empresaId || 'emp-demo',
        frente: 'CARTOES_ADQUIRENTE',
        origem: operadoraSelecionada,
        natureza: novaNatureza,
        data_competencia: '2026-11-04',
        data_recebimento: '2026-11-04',
        valor_bruto_centavos: bruto,
        taxa_mdr_centavos: mdr,
        taxa_antecipacao_centavos: antecipacao,
        taxa_total_centavos: taxaTotal,
        valor_liquido_centavos: liquido,
        nsu_tid: novoNsu.trim() || 'SEM-NSU',
        bandeira: novaBandeira,
        modalidade_cartao: novaModalidade,
        parcela_numero: 1,
        total_parcelas: 1,
      }

      setItensSimulados((prev) => [novoItem, ...prev])
    } catch {
      // Ignora erro de formato inválido
    }
  }

  const handleRemoverItemSimulado = (idInterno?: string) => {
    setItensSimulados((prev) =>
      prev.filter((item) => item.id_interno !== idInterno)
    )
  }

  const handleRestaurarExemplos = () => {
    setItensSimulados(MOVIMENTACOES_EXEMPLO_INICIAL)
  }

  const formatarDataBR = (iso: string) => {
    if (!iso || iso.length < 10) return iso
    const [ano, mes, dia] = iso.slice(0, 10).split('-')
    return `${dia}/${mes}/${ano}`
  }

  const stoneAtivoComDados =
    operadoraSelecionada === 'STONE' && stoneLinhas.length > 0

  return (
    <div className="space-y-4">
      {/* 4 KPIs DE CONFERÊNCIA MATEMÁTICA DO LOTE (.dx-kpis) */}
      <div className="dx-kpis">
        <div
          onClick={() =>
            onChangeAba(stoneAtivoComDados ? 'cartoes' : 'conferencia')
          }
          className={`dx-kpi ${abaAtiva === 'conferencia' || stoneAtivoComDados ? 'is-on' : ''}`}
        >
          <div className="dx-kpi-ico">
            <CreditCard size={18} />
          </div>
          <div>
            <div className="dx-kpi-label">
              <span>
                {stoneAtivoComDados
                  ? 'Valor Bruto (Filtro Stone)'
                  : 'Receita Bruta (Vendas)'}
              </span>
              <b>
                {stoneAtivoComDados
                  ? stoneTotaisFiltrados.quantidade_vendas_operacionais
                  : resumoConsolidado.quantidade_vendas_normais +
                    resumoConsolidado.quantidade_antecipacoes}
              </b>
            </div>
            <div className="dx-kpi-value">
              {stoneAtivoComDados
                ? formatarCentavosBRL(stoneTotaisFiltrados.valor_bruto_centavos)
                : formatarCentavosBRL(resumoConsolidado.bruto_vendas_centavos)}
            </div>
          </div>
        </div>

        <div
          onClick={() =>
            onChangeAba(stoneAtivoComDados ? 'cartoes' : 'conferencia')
          }
          className="dx-kpi is-warn"
        >
          <div className="dx-kpi-ico">
            <Calculator size={18} />
          </div>
          <div>
            <div className="dx-kpi-label">
              <span>
                {stoneAtivoComDados
                  ? 'Desconto MDR (Filtro Stone)'
                  : 'Taxas (MDR + Antecip.)'}
              </span>
            </div>
            <div className="dx-kpi-value">
              {stoneAtivoComDados
                ? formatarCentavosBRL(
                    stoneTotaisFiltrados.desconto_mdr_ajustado_centavos
                  )
                : formatarCentavosBRL(resumoConsolidado.taxa_total_centavos)}
            </div>
          </div>
        </div>

        <div
          onClick={() =>
            onChangeAba(stoneAtivoComDados ? 'cartoes' : 'conferencia')
          }
          className="dx-kpi is-bad"
        >
          <div className="dx-kpi-ico">
            <AlertTriangle size={18} />
          </div>
          <div>
            <div className="dx-kpi-label">
              <span>
                {stoneAtivoComDados
                  ? 'Cobranças & Balanceamentos'
                  : 'Estornos & Ajustes POS'}
              </span>
              <b>
                {stoneAtivoComDados
                  ? stoneTotaisFiltrados.quantidade_ajustes_cobrancas_estornos
                  : resumoConsolidado.quantidade_estornos +
                    resumoConsolidado.quantidade_ajustes}
              </b>
            </div>
            <div className="dx-kpi-value">
              {stoneAtivoComDados
                ? formatarCentavosBRL(
                    stoneTotaisFiltrados.total_ajustes_nao_operacionais_centavos
                  )
                : formatarCentavosBRL(
                    resumoConsolidado.total_estornos_centavos +
                      resumoConsolidado.total_ajustes_tarifas_centavos
                  )}
            </div>
          </div>
        </div>

        <div
          onClick={() =>
            onChangeAba(stoneAtivoComDados ? 'cartoes' : 'conferencia')
          }
          className={`dx-kpi ${
            stoneAtivoComDados
              ? stoneConferenciaBancaria.conferencia_aprovada
                ? 'is-ok'
                : stoneConferenciaBancaria.status_codigo ===
                    'DIVERGENTE_BLOQUEADA'
                  ? 'is-bad'
                  : 'is-warn'
              : resumoConsolidado.consistente
                ? 'is-ok'
                : 'is-bad'
          }`}
        >
          <div className="dx-kpi-ico">
            {stoneAtivoComDados ? (
              stoneConferenciaBancaria.conferencia_aprovada ? (
                <CheckCircle2 size={18} />
              ) : (
                <Landmark size={18} />
              )
            ) : resumoConsolidado.consistente ? (
              <CheckCircle2 size={18} />
            ) : (
              <XCircle size={18} />
            )}
          </div>
          <div>
            <div className="dx-kpi-label">
              <span>
                {stoneAtivoComDados
                  ? 'Valor Líquido (Filtro Stone)'
                  : 'Líquido Efetivo Depósito'}
              </span>
              <span
                className={`dx-status ${
                  stoneAtivoComDados
                    ? stoneConferenciaBancaria.conferencia_aprovada
                      ? 'is-ok'
                      : stoneConferenciaBancaria.status_codigo ===
                          'DIVERGENTE_BLOQUEADA'
                        ? 'is-bad'
                        : 'is-warn'
                    : resumoConsolidado.consistente
                      ? 'is-ok'
                      : 'is-bad'
                }`}
              >
                {stoneAtivoComDados
                  ? stoneConferenciaBancaria.conferencia_aprovada
                    ? 'Banco OK'
                    : stoneConferenciaBancaria.status_codigo ===
                        'DIVERGENTE_BLOQUEADA'
                      ? 'Divergente'
                      : `${stoneTotaisFiltrados.quantidade_parcelas_pagas} Pagas`
                  : resumoConsolidado.consistente
                    ? 'Conforme'
                    : 'Divergente'}
              </span>
            </div>
            <div className="dx-kpi-value">
              {stoneAtivoComDados
                ? formatarCentavosBRL(
                    stoneTotaisFiltrados.valor_liquido_centavos
                  )
                : formatarCentavosBRL(
                    resumoConsolidado.liquido_efetivo_deposito_centavos
                  )}
            </div>
          </div>
        </div>
      </div>

      {/* ABA 1: RECEBIMENTOS DE CARTÕES (STONE, REDE, GETNET, INFINITEPAY) */}
      {abaAtiva === 'cartoes' && (
        <div className="space-y-4">
          <div className="dx-panel">
            <div className="dx-panel-head">
              <div>
                <h2 className="dx-panel-title">
                  Frente 1 — Recebimentos de Cartões (Adquirentes)
                </h2>
                <p className="dx-panel-sub">
                  Selecione a operadora da maquininha para importar o extrato de
                  recebimentos da loja <b>{empresaNome}</b>.
                </p>
              </div>
              <span
                className={`dx-indicator ${
                  operadoraSelecionada === 'STONE' ? 'is-ok' : 'is-warn'
                }`}
              >
                {operadoraSelecionada === 'STONE'
                  ? 'Stone CSV Homologado (Etapa 1C — Em Memória)'
                  : 'Layout aguardando amostra real'}
              </span>
            </div>

            <div className="dx-panel-section space-y-4">
              {/* Grid dos 4 Cards de Operadoras */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {OPERADORAS_INFO.map((op) => {
                  const selecionado = operadoraSelecionada === op.id
                  const homologado =
                    op.id === 'STONE' ||
                    REGISTRY_ADQUIRENTES_CARTAO[op.id].homologadoComAmostraReal
                  return (
                    <button
                      key={op.id}
                      type="button"
                      onClick={() => {
                        setOperadoraSelecionada(op.id)
                        setArquivoTentativaNome(null)
                      }}
                      className={`dx-os text-left p-4 transition-all cursor-pointer ${
                        selecionado ? 'is-selected' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="dx-os-id">{op.id}</span>
                        <span
                          className={`dx-status ${
                            homologado ? 'is-ok' : 'is-warn'
                          }`}
                        >
                          {homologado ? 'Homologado (CSV)' : 'Aguard. Amostra'}
                        </span>
                      </div>
                      <div className="dx-os-client mb-1">{op.nome}</div>
                      <p className="dx-os-meta leading-relaxed mb-3">
                        {op.subtitulo}
                      </p>
                      <div className="flex items-center justify-between pt-2 border-t border-[var(--dx-line-soft)]">
                        <span className="dx-os-meta">
                          Chave: <b>{op.identificador}</b>
                        </span>
                        <ArrowRight size={14} className="text-[var(--dx-link)]" />
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Área de Recepção de Arquivo da Operadora Selecionada */}
              <label className="dx-drop block">
                <input
                  type="file"
                  accept={
                    operadoraSelecionada === 'STONE'
                      ? '.csv'
                      : '.csv,.xlsx,.xls'
                  }
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) {
                      handleImportarArquivoStone(f)
                    }
                    e.target.value = ''
                  }}
                />
                <div className="dx-drop-badge mx-auto mb-3">
                  <Upload size={24} />
                </div>
                <p className="dx-drop-title is-sm">
                  {operadoraSelecionada === 'STONE'
                    ? stoneNomeArquivo
                      ? `Planilha Stone carregada: ${stoneNomeArquivo} (clique para trocar)`
                      : 'Clique para importar a planilha CSV de recebimentos da STONE'
                    : `Importar extrato de recebimentos — ${operadoraSelecionada}`}
                </p>
                <p className="dx-drop-sub is-xs mt-1">
                  {operadoraSelecionada === 'STONE' ? (
                    <>
                      Formato oficial homologado: <b>.CSV</b> separado por ponto
                      e vírgula (<code>;</code>) com 20 colunas (Data de
                      Vencimento Original, Bandeira, Produto, Valor Bruto,
                      Desconto de MDR, Valor Líquido).
                    </>
                  ) : (
                    <>
                      Formatos suportados após homologação: <b>.CSV</b>,{' '}
                      <b>.XLSX</b> ou <b>.XLS</b>
                    </>
                  )}
                </p>

                {operadoraSelecionada !== 'STONE' && arquivoTentativaNome && (
                  <div className="mt-4 max-w-xl mx-auto dx-alert text-left">
                    <Info size={18} className="flex-shrink-0" />
                    <div>
                      <b>Arquivo selecionado: {arquivoTentativaNome}</b>
                      <p className="text-xs mt-0.5">
                        {
                          adapterAtivo.interpretarLinhas(empresaId, [])
                            .mensagem
                        }
                      </p>
                    </div>
                  </div>
                )}

                {operadoraSelecionada === 'STONE' && stoneErroParse && (
                  <div className="mt-4 max-w-xl mx-auto dx-alert text-left">
                    <AlertTriangle size={18} className="flex-shrink-0" />
                    <div>
                      <b>Falha ao interpretar arquivo CSV da Stone</b>
                      <p className="text-xs mt-0.5">{stoneErroParse}</p>
                    </div>
                  </div>
                )}
              </label>

              {/* Regras Financeiras Separadas por Natureza (quando nenhum CSV Stone está ativo) */}
              {(!stoneAtivoComDados || operadoraSelecionada !== 'STONE') && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-1">
                  <div className="p-3 rounded-[12px] border border-[var(--dx-line)] bg-[var(--dx-soft)]">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-[var(--dx-ink)]">
                        1. Venda Normal
                      </span>
                      <span className="dx-pill is-ok">Receita</span>
                    </div>
                    <p className="text-xs text-[var(--dx-muted)]">
                      Equação obrigatória:{' '}
                      <b>Valor Bruto - Taxa MDR = Valor Líquido</b>.
                    </p>
                  </div>

                  <div className="p-3 rounded-[12px] border border-[var(--dx-line)] bg-[var(--dx-soft)]">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-[var(--dx-ink)]">
                        2. Antecipação (RAV)
                      </span>
                      <span className="dx-pill is-accent">Antecipado</span>
                    </div>
                    <p className="text-xs text-[var(--dx-muted)]">
                      Separa custo financeiro:{' '}
                      <b>Bruto - (MDR + Taxa Antecip.) = Líquido</b>.
                    </p>
                  </div>

                  <div className="p-3 rounded-[12px] border border-[var(--dx-line)] bg-[var(--dx-soft)]">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-[var(--dx-ink)]">
                        3. Estornos / Cancelamentos
                      </span>
                      <span className="dx-pill is-bad">Redutor</span>
                    </div>
                    <p className="text-xs text-[var(--dx-muted)]">
                      Tratados separadamente como débito na agenda, sem
                      distorcer a venda bruta.
                    </p>
                  </div>

                  <div className="p-3 rounded-[12px] border border-[var(--dx-line)] bg-[var(--dx-soft)]">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-[var(--dx-ink)]">
                        4. Ajustes / Cobranças
                      </span>
                      <span className="dx-pill is-warn">Tarifa</span>
                    </div>
                    <p className="text-xs text-[var(--dx-muted)]">
                      Cobranças e Balanceamento de Saldo isolados da receita
                      bruta de vendas.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ====================================================================
              ETAPA 1E — CONTEXTO REAL CONTA AZUL DA EMPRESA ATIVA (SOMENTE LEITURA / GET)
             ==================================================================== */}
          {operadoraSelecionada === 'STONE' && (
            <div className="dx-panel">
              <div className="dx-panel-head">
                <div>
                  <h3 className="dx-panel-title flex items-center gap-2">
                    <Building2 size={16} />
                    <span>
                      Integração Satélite Conta Azul — Contexto da Empresa Ativa
                      (Somente Leitura · GET)
                    </span>
                  </h3>
                  <p className="dx-panel-sub">
                    Empresa selecionada:{' '}
                    <b>{empresaNome || 'Nenhuma empresa selecionada'}</b>
                    {empresaId ? ` (ID: ${empresaId.slice(0, 8)}...)` : ''}. Os
                    dados são recarregados automaticamente ao trocar de loja,
                    sem reutilizar categorias ou contas de outra empresa.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`dx-status ${
                      carregandoEmpresa || carregandoContextoCA
                        ? 'is-warn'
                        : conectadoContaAzul && statusConexaoCA === 'CONECTADA'
                          ? 'is-ok'
                          : statusConexaoCA === 'ATENCAO' ||
                              statusConexaoCA === 'AGUARDANDO_EMPRESA'
                            ? 'is-warn'
                            : 'is-bad'
                    }`}
                  >
                    {carregandoEmpresa
                      ? 'Carregando empresa ativa...'
                      : carregandoContextoCA
                        ? 'Consultando Conta Azul (GET)...'
                        : conectadoContaAzul && statusConexaoCA === 'CONECTADA'
                          ? 'Conectado ao Conta Azul (Escopo Financeiro)'
                          : statusConexaoCA === 'NAO_AUTENTICADO'
                            ? 'Sessão Expirada ou Ausente (401)'
                            : statusConexaoCA === 'ACESSO_NEGADO'
                              ? codigoErroContextoCA === 'EMPRESA_NAO_AUTORIZADA' ||
                                codigoErroContextoCA === 'EMPRESA_NAO_ENCONTRADA'
                                ? 'Empresa Não Autorizada para o Usuário (403)'
                                : 'Usuário sem Autorização para o Módulo (403)'
                              : statusConexaoCA === 'ATENCAO'
                                ? 'Erro Temporário de Comunicação com Conta Azul'
                                : statusConexaoCA === 'AGUARDANDO_EMPRESA'
                                  ? 'Selecione uma Empresa Ativa'
                                  : 'Conta Azul Desconectada para esta Loja'}
                  </span>
                  <button
                    type="button"
                    disabled={
                      carregandoEmpresa || !empresaId || carregandoContextoCA
                    }
                    onClick={() => carregarContextoContaAzulEmpresa(empresaId)}
                    className="dx-btn is-sm"
                  >
                    <RefreshCw
                      size={13}
                      className={carregandoContextoCA ? 'animate-spin' : ''}
                    />
                    <span>Recarregar Contexto (GET)</span>
                  </button>
                </div>
              </div>

              <div className="dx-panel-section space-y-4">
                {erroContextoCA && (
                  <div className="dx-alert">
                    <AlertTriangle size={18} className="flex-shrink-0" />
                    <div>
                      <b>
                        {statusConexaoCA === 'NAO_AUTENTICADO'
                          ? 'Sessão expirada ou ausente no servidor (HTTP 401)'
                          : statusConexaoCA === 'ACESSO_NEGADO'
                            ? codigoErroContextoCA === 'EMPRESA_NAO_AUTORIZADA' ||
                              codigoErroContextoCA === 'EMPRESA_NAO_ENCONTRADA'
                              ? 'Acesso bloqueado: empresa não vinculada ao seu usuário (HTTP 403)'
                              : 'Acesso bloqueado: usuário sem autorização para Contas a Receber (HTTP 403)'
                            : statusConexaoCA === 'DESCONECTADA'
                              ? 'Conta Azul desconectada para a loja selecionada'
                              : 'Erro temporário de comunicação ao consultar o Conta Azul'}
                      </b>
                      <p className="text-xs mt-0.5">{erroContextoCA}</p>
                    </div>
                  </div>
                )}

                {mensagemStatusCA && !erroContextoCA && (
                  <div className="p-3 rounded-[12px] border border-[var(--dx-line)] bg-[var(--dx-soft)] flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 text-xs text-[var(--dx-ink)]">
                      <CheckCircle2
                        size={16}
                        className="text-[var(--dx-ok)] flex-shrink-0"
                      />
                      <span>{mensagemStatusCA}</span>
                    </div>
                    <span className="dx-pill is-ok">
                      Modo Satélite 100% Leitura (GET)
                    </span>
                  </div>
                )}

                {/* Seletores reais de Conta Financeira, Categoria de Receita e Categoria de Despesa MDR */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* 1. Seletor de Conta Financeira Real */}
                  <div className="p-3.5 rounded-[12px] border border-[var(--dx-line)] bg-[var(--dx-soft)]">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <label className="dx-label !mb-0">
                        1. Conta Financeira Real (Conta Azul)
                      </label>
                      <span className="dx-pill is-accent">
                        {contasFinanceirasCA.length} ativa(s)
                      </span>
                    </div>
                    <select
                      value={contaFinanceiraSelecionadaId}
                      onChange={(e) =>
                        setContaFinanceiraSelecionadaId(e.target.value)
                      }
                      disabled={
                        carregandoContextoCA || contasFinanceirasCA.length === 0
                      }
                      className="dx-control"
                    >
                      {contasFinanceirasCA.length === 0 ? (
                        <option value="">
                          {carregandoContextoCA
                            ? 'Carregando contas financeiras...'
                            : 'Nenhuma conta financeira carregada'}
                        </option>
                      ) : (
                        contasFinanceirasCA.map((cf) => (
                          <option key={cf.id} value={cf.id}>
                            {cf.descricao} ({cf.tipo || 'CONTA'})
                          </option>
                        ))
                      )}
                    </select>
                    <p className="text-[11px] text-[var(--dx-muted)] mt-1">
                      Conta bancária onde o líquido da Stone foi creditado.
                    </p>
                  </div>

                  {/* 2. Seletor da Categoria Real de Receita */}
                  <div className="p-3.5 rounded-[12px] border border-[var(--dx-line)] bg-[var(--dx-soft)]">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <label className="dx-label !mb-0">
                        2. Categoria Real de Receita (Valor Bruto)
                      </label>
                      <span
                        className={`dx-pill ${
                          sugestaoCatReceitaVendasCA ? 'is-ok' : 'is-warn'
                        }`}
                      >
                        {sugestaoCatReceitaVendasCA
                          ? 'Receitas de Vendas localizada'
                          : `${categoriasReceitaCA.length} categoria(s)`}
                      </span>
                    </div>
                    <select
                      value={categoriaReceitaSelecionadaId}
                      onChange={(e) =>
                        setCategoriaReceitaSelecionadaId(e.target.value)
                      }
                      disabled={
                        carregandoContextoCA || categoriasReceitaCA.length === 0
                      }
                      className="dx-control"
                    >
                      {categoriasReceitaCA.length === 0 ? (
                        <option value="">
                          {carregandoContextoCA
                            ? 'Carregando categorias de receita...'
                            : 'Nenhuma categoria de receita carregada'}
                        </option>
                      ) : (
                        categoriasReceitaCA.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.nome}
                            {sugestaoCatReceitaVendasCA?.id === cat.id
                              ? ' ★ (Sugerida: Receitas de Vendas)'
                              : ''}
                          </option>
                        ))
                      )}
                    </select>
                    <p className="text-[11px] text-[var(--dx-muted)] mt-1">
                      {sugestaoCatReceitaVendasCA ? (
                        <>
                          Identificada dinamicamente no plano da empresa:{' '}
                          <b>{sugestaoCatReceitaVendasCA.nome}</b>.
                        </>
                      ) : (
                        'Selecione a categoria real de Receita de Vendas da empresa ativa.'
                      )}
                    </p>
                  </div>

                  {/* 3. Seletor da Categoria Real de Despesa de MDR */}
                  <div className="p-3.5 rounded-[12px] border border-[var(--dx-line)] bg-[var(--dx-soft)]">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <label className="dx-label !mb-0">
                        3. Categoria Real de Despesa (MDR)
                      </label>
                      <span
                        className={`dx-pill ${
                          sugestaoCatDespesaMdrCA ? 'is-ok' : 'is-warn'
                        }`}
                      >
                        {sugestaoCatDespesaMdrCA
                          ? 'Tarifas de Cartão localizada'
                          : `${categoriasDespesaCA.length} categoria(s)`}
                      </span>
                    </div>
                    <select
                      value={categoriaDespesaMdrSelecionadaId}
                      onChange={(e) =>
                        setCategoriaDespesaMdrSelecionadaId(e.target.value)
                      }
                      disabled={
                        carregandoContextoCA || categoriasDespesaCA.length === 0
                      }
                      className="dx-control"
                    >
                      {categoriasDespesaCA.length === 0 ? (
                        <option value="">
                          {carregandoContextoCA
                            ? 'Carregando categorias de despesa...'
                            : 'Nenhuma categoria de despesa carregada'}
                        </option>
                      ) : (
                        categoriasDespesaCA.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.nome}
                            {sugestaoCatDespesaMdrCA?.id === cat.id
                              ? ' ★ (Sugerida: Tarifas de Cartão)'
                              : ''}
                          </option>
                        ))
                      )}
                    </select>
                    <p className="text-[11px] text-[var(--dx-muted)] mt-1">
                      {sugestaoCatDespesaMdrCA ? (
                        <>
                          Identificada dinamicamente no plano da empresa:{' '}
                          <b>{sugestaoCatDespesaMdrCA.nome}</b>.
                        </>
                      ) : (
                        'Selecione a categoria real de Tarifas de Cartão de Créditos da empresa ativa.'
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ====================================================================
              PAINEL OPERACIONAL STONE (ETAPA 1C: FILTROS, TOTAIS, CONFERÊNCIA BANCÁRIA E PRÉVIA)
             ==================================================================== */}
          {stoneAtivoComDados && (
            <>
              {/* PASSO 1: FILTROS COMBINADOS SEQUENCIAIS DA PLANILHA STONE */}
              <div className="dx-panel">
                <div className="dx-panel-head">
                  <div>
                    <h3 className="dx-panel-title flex items-center gap-2">
                      <Filter size={16} />
                      <span>
                        Passo 1 — Filtros Combinados da Planilha Stone
                      </span>
                    </h3>
                    <p className="dx-panel-sub">
                      {stoneMensagemParse} Aplique os filtros na sequência do
                      procedimento operacional: <b>1º Data de Vencimento Original</b>{' '}
                      → <b>2º Bandeira</b> → <b>3º Produto</b>.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setFiltroDataVencOriginal('')
                        setFiltroBandeira('')
                        setFiltroProduto('')
                        setOperacaoMarcadaConferida(false)
                      }}
                      className="dx-btn is-sm"
                    >
                      <RefreshCw size={13} />
                      <span>Ver Todas ({stoneLinhas.length})</span>
                    </button>
                  </div>
                </div>

                <div className="dx-panel-section space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* 1º Filtro: DATA DE VENCIMENTO ORIGINAL */}
                    <div className="p-3 rounded-[12px] border border-[var(--dx-line)] bg-[var(--dx-soft)]">
                      <label className="dx-label">
                        1º Data de Vencimento Original
                      </label>
                      <select
                        value={filtroDataVencOriginal}
                        onChange={(e) => {
                          setFiltroDataVencOriginal(e.target.value)
                          setOperacaoMarcadaConferida(false)
                        }}
                        className="dx-control mt-1"
                      >
                        <option value="">
                          Todas as datas ({stoneDatasUnicas.length} datas no
                          arquivo)
                        </option>
                        {stoneDatasUnicas.map((dt) => (
                          <option key={dt} value={dt}>
                            {dt}
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-[var(--dx-muted)] mt-1">
                        Data base de liquidação original do lote bancário.
                      </p>
                    </div>

                    {/* 2º Filtro: BANDEIRA */}
                    <div className="p-3 rounded-[12px] border border-[var(--dx-line)] bg-[var(--dx-soft)]">
                      <label className="dx-label">2º Bandeira do Cartão</label>
                      <select
                        value={filtroBandeira}
                        onChange={(e) => {
                          setFiltroBandeira(e.target.value)
                          setOperacaoMarcadaConferida(false)
                        }}
                        className="dx-control mt-1"
                      >
                        <option value="">
                          Todas as bandeiras ({bandeirasDisponiveisNaData.length}{' '}
                          disponíveis)
                        </option>
                        {bandeirasDisponiveisNaData.map((b) => (
                          <option key={b} value={b}>
                            {b}
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-[var(--dx-muted)] mt-1">
                        Ex: Visa, MasterCard, Elo, AmericanExpress.
                      </p>
                    </div>

                    {/* 3º Filtro: PRODUTO */}
                    <div className="p-3 rounded-[12px] border border-[var(--dx-line)] bg-[var(--dx-soft)]">
                      <label className="dx-label">
                        3º Produto (Modalidade)
                      </label>
                      <select
                        value={filtroProduto}
                        onChange={(e) => {
                          setFiltroProduto(e.target.value)
                          setOperacaoMarcadaConferida(false)
                        }}
                        className="dx-control mt-1"
                      >
                        <option value="">
                          Todos os produtos ({produtosDisponiveisNoFiltro.length}{' '}
                          disponíveis)
                        </option>
                        {produtosDisponiveisNoFiltro.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-[var(--dx-muted)] mt-1">
                        Ex: Debito, Credito, Debito Pre-pago.
                      </p>
                    </div>
                  </div>

                  {/* PAINEL DE GRUPOS INDIVIDUAIS POR DATA + BANDEIRA + MODALIDADE (CD/DB) */}
                  {gruposVisiveisNaDataStone.length > 0 && (
                    <div className="p-3.5 rounded-[12px] border border-[var(--dx-line)] bg-[var(--dx-soft)] space-y-2.5">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div>
                          <div className="text-xs font-extrabold uppercase tracking-wider text-[var(--dx-ink)]">
                            Grupos Individuais por Data + Bandeira + Modalidade (CD/DB)
                          </div>
                          <div className="text-[11px] text-[var(--dx-muted)]">
                            Clique em um grupo para conciliá-lo individualmente. Os valores já conferidos são preservados ao navegar entre grupos.
                          </div>
                        </div>
                        <span className="dx-pill is-accent">
                          {gruposVisiveisNaDataStone.length} grupo(s) em{' '}
                          {filtroDataVencOriginal || 'todas as datas'}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
                        {gruposVisiveisNaDataStone.map((grp) => {
                          const conc = mapaConciliacoesPorGrupoStone[grp.chave_grupo]
                          const estilo = obterEstiloEstadoGrupoStone(
                            conc?.estado_grupo
                          )
                          const badge1FB = obterBadgeEstado1FBGrupoStone(
                            grp,
                            conc
                          )
                          const isAtivo = grp.chave_grupo === chaveGrupoAtivoStone
                          const lancCA = conc?.lancamento_conta_azul_correspondente

                          return (
                            <button
                              key={grp.chave_grupo}
                              type="button"
                              onClick={() =>
                                handleSelecionarGrupoConciliacaoStone(grp)
                              }
                              className={`text-left p-3 rounded-[12px] border transition-all cursor-pointer ${
                                isAtivo
                                  ? 'border-[var(--dx-accent)] bg-[var(--dx-surface)] ring-2 ring-[var(--dx-accent)]/25'
                                  : 'border-[var(--dx-line)] bg-[var(--dx-surface)] hover:border-[var(--dx-accent)]/60'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <span className="text-xs font-extrabold font-mono text-[var(--dx-ink)]">
                                  {grp.rotulo_conta_azul_esperado}
                                </span>
                                <div className="flex items-center gap-1 flex-wrap justify-end">
                                  <span className={`dx-pill ${estilo.badgeClass}`}>
                                    {estilo.label}
                                  </span>
                                  {badge1FB && (
                                    <span
                                      className={`dx-pill ${badge1FB.badgeClass} ${
                                        badge1FB.extraClass || ''
                                      }`}
                                    >
                                      {badge1FB.label}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="text-[11px] text-[var(--dx-muted)] mt-1 flex items-center justify-between gap-2">
                                <span>
                                  {grp.data_vencimento_original_br} ·{' '}
                                  {grp.bandeira_original} · {grp.produto_original}
                                </span>
                                <span>
                                  {grp.totais.quantidade_parcelas_pagas} parc.
                                </span>
                              </div>

                              {grp.possui_liquidacao_em_data_distinta && (
                                <div className="text-[10px] text-[var(--dx-warn)] mt-1">
                                  Venc.: {grp.datas_vencimento_br.join(', ')} | Status:{' '}
                                  {grp.datas_ultimo_status_br.join(', ')}
                                </div>
                              )}

                              <div className="mt-2 pt-2 border-t border-[var(--dx-line)] grid grid-cols-3 gap-1.5 text-[11px]">
                                <div>
                                  <div className="text-[10px] text-[var(--dx-muted)]">
                                    Líquido Stone
                                  </div>
                                  <div className="font-bold text-[var(--dx-ok)]">
                                    {formatarCentavosBRL(
                                      grp.totais.valor_liquido_centavos
                                    )}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-[10px] text-[var(--dx-muted)]">
                                    Conta Azul / Banco
                                  </div>
                                  <div className="font-bold text-[var(--dx-ink)]">
                                    {conc?.valor_extrato_bancario_centavos !==
                                      null &&
                                    conc?.valor_extrato_bancario_centavos !==
                                      undefined
                                      ? formatarCentavosBRL(
                                          conc.valor_extrato_bancario_centavos
                                        )
                                      : '—'}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-[10px] text-[var(--dx-muted)]">
                                    Diferença
                                  </div>
                                  <div
                                    className={`font-bold ${
                                      conc?.conferencia_aprovada
                                        ? 'text-[var(--dx-ok)]'
                                        : conc?.estado_grupo ===
                                            'DIVERGENTE_BLOQUEADA'
                                          ? 'text-[var(--dx-bad)]'
                                          : 'text-[var(--dx-muted)]'
                                    }`}
                                  >
                                    {conc?.valor_extrato_bancario_centavos !==
                                      null &&
                                    conc?.valor_extrato_bancario_centavos !==
                                      undefined
                                      ? formatarCentavosBRL(
                                          conc.diferenca_centavos
                                        )
                                      : '—'}
                                  </div>
                                </div>
                              </div>

                              {lancCA && (
                                <div className="mt-1.5 text-[10px] text-[var(--dx-muted)] truncate">
                                  CA: <b>{lancCA.descricao}</b> ({lancCA.data_vencimento})
                                </div>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* PASSO 2: TOTAIS CALCULADOS PARA O FILTRO SELECIONADO (8 INDICADORES OBRIGATÓRIOS) */}
                  <div className="pt-2">
                    <div className="flex items-center justify-between flex-wrap gap-2 mb-2.5">
                      <span className="text-xs font-bold uppercase tracking-wider text-[var(--dx-muted)]">
                        Totais Calculados para o Filtro Selecionado (
                        {filtroDataVencOriginal || 'Todas as Datas'} ·{' '}
                        {filtroBandeira || 'Todas as Bandeiras'} ·{' '}
                        {filtroProduto || 'Todos os Produtos'})
                      </span>
                      <span className="dx-pill is-ok">
                        Somente parcelas PAGAS compõem o líquido recebido
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
                      <div className="p-3 rounded-[12px] border border-[var(--dx-line)] bg-[var(--dx-surface)]">
                        <div className="text-[11px] font-semibold text-[var(--dx-muted)]">
                          Qtd. Registros
                        </div>
                        <div className="text-lg font-extrabold text-[var(--dx-ink)] mt-0.5">
                          {stoneTotaisFiltrados.quantidade_registros_total}
                        </div>
                        <div className="text-[10px] text-[var(--dx-muted)]">
                          {stoneTotaisFiltrados.quantidade_vendas_operacionais}{' '}
                          venda(s)
                        </div>
                      </div>

                      <div className="p-3 rounded-[12px] border border-[var(--dx-line)] bg-[var(--dx-surface)]">
                        <div className="text-[11px] font-semibold text-[var(--dx-muted)]">
                          Valor Bruto
                        </div>
                        <div className="text-base font-extrabold text-[var(--dx-ink)] mt-0.5">
                          {formatarCentavosBRL(
                            stoneTotaisFiltrados.valor_bruto_centavos
                          )}
                        </div>
                        <div className="text-[10px] text-[var(--dx-muted)] font-mono">
                          {formatarMicroBRL(
                            stoneTotaisFiltrados.valor_bruto_micro,
                            6
                          )}
                        </div>
                      </div>

                      <div className="p-3 rounded-[12px] border border-[var(--dx-line)] bg-[var(--dx-surface)]">
                        <div className="text-[11px] font-semibold text-[var(--dx-muted)]">
                          Desconto MDR
                        </div>
                        <div className="text-base font-extrabold text-[var(--dx-warn)] mt-0.5">
                          {formatarCentavosBRL(
                            stoneTotaisFiltrados.desconto_mdr_ajustado_centavos
                          )}
                        </div>
                        <div className="text-[10px] text-[var(--dx-muted)] font-mono">
                          Exato:{' '}
                          {formatarMicroBRL(
                            stoneTotaisFiltrados.desconto_mdr_micro,
                            6
                          )}
                        </div>
                      </div>

                      <div className="p-3 rounded-[12px] border border-[var(--dx-line)] bg-[var(--dx-surface)]">
                        <div className="text-[11px] font-semibold text-[var(--dx-muted)]">
                          Desc. Antecipação
                        </div>
                        <div className="text-base font-extrabold text-[var(--dx-ink)] mt-0.5">
                          {formatarCentavosBRL(
                            stoneTotaisFiltrados.desconto_antecipacao_centavos
                          )}
                        </div>
                        <div className="text-[10px] text-[var(--dx-muted)] font-mono">
                          {formatarMicroBRL(
                            stoneTotaisFiltrados.desconto_antecipacao_micro,
                            6
                          )}
                        </div>
                      </div>

                      <div className="p-3 rounded-[12px] border border-[var(--dx-line)] bg-[var(--dx-soft)]">
                        <div className="text-[11px] font-semibold text-[var(--dx-ok)]">
                          Valor Líquido
                        </div>
                        <div className="text-base font-extrabold text-[var(--dx-ok)] mt-0.5">
                          {formatarCentavosBRL(
                            stoneTotaisFiltrados.valor_liquido_centavos
                          )}
                        </div>
                        <div className="text-[10px] text-[var(--dx-muted)] font-mono">
                          Exato:{' '}
                          {formatarMicroBRL(
                            stoneTotaisFiltrados.valor_liquido_micro,
                            6
                          )}
                        </div>
                      </div>

                      <div className="p-3 rounded-[12px] border border-[var(--dx-line)] bg-[var(--dx-surface)]">
                        <div className="text-[11px] font-semibold text-[var(--dx-ok)]">
                          Parcelas Pagas
                        </div>
                        <div className="text-lg font-extrabold text-[var(--dx-ok)] mt-0.5">
                          {stoneTotaisFiltrados.quantidade_parcelas_pagas}
                        </div>
                        <div className="text-[10px] text-[var(--dx-muted)]">
                          Status: Pago
                        </div>
                      </div>

                      <div className="p-3 rounded-[12px] border border-[var(--dx-line)] bg-[var(--dx-surface)]">
                        <div className="text-[11px] font-semibold text-[var(--dx-warn)]">
                          Parcelas Abertas
                        </div>
                        <div className="text-lg font-extrabold text-[var(--dx-warn)] mt-0.5">
                          {stoneTotaisFiltrados.quantidade_parcelas_abertas}
                        </div>
                        <div className="text-[10px] text-[var(--dx-muted)]">
                          Não recebidas
                        </div>
                      </div>

                      <div className="p-3 rounded-[12px] border border-[var(--dx-line)] bg-[var(--dx-surface)]">
                        <div className="text-[11px] font-semibold text-[var(--dx-accent)]">
                          Parc. Agendadas
                        </div>
                        <div className="text-lg font-extrabold text-[var(--dx-accent)] mt-0.5">
                          {stoneTotaisFiltrados.quantidade_parcelas_agendadas}
                        </div>
                        <div className="text-[10px] text-[var(--dx-muted)]">
                          Liquidação futura
                        </div>
                      </div>
                    </div>

                    {/* Alerta de segregação quando houver Cobrança ou Balanceamento de Saldo no filtro */}
                    {stoneTotaisFiltrados.quantidade_ajustes_cobrancas_estornos >
                      0 && (
                      <div className="mt-3 dx-alert">
                        <Info size={18} className="flex-shrink-0" />
                        <div>
                          <b>
                            Segregação de Segurança Ativa:{' '}
                            {
                              stoneTotaisFiltrados.quantidade_ajustes_cobrancas_estornos
                            }{' '}
                            registro(s) de Cobrança / Balanceamento de Saldo
                            detectado(s) neste filtro
                          </b>
                          <p className="text-xs mt-0.5">
                            Em cumprimento às regras financeiras do DCX LINK, os
                            lançamentos de <b>Cobrança</b> e{' '}
                            <b>Balanceamento de Saldo</b> (total líquido:{' '}
                            <b>
                              {formatarCentavosBRL(
                                stoneTotaisFiltrados.total_ajustes_nao_operacionais_centavos
                              )}
                            </b>
                            ) foram isolados e <b>não foram somados</b> como
                            Receita de Vendas nem como Desconto de MDR normal.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* PASSO 3 E PASSO 4: CONFERÊNCIA COM O BANCO E PREPARAÇÃO DOS LANÇAMENTOS (EM MEMÓRIA) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* COLUNA ESQUERDA: CONFERÊNCIA POR GRUPO COM O CONTA AZUL / EXTRATO BANCÁRIO */}
                <div className="dx-panel">
                  <div className="dx-panel-head">
                    <div>
                      <h3 className="dx-panel-title flex items-center gap-2">
                        <Landmark size={16} />
                        <span>
                          Passo 2 — Conciliação do Grupo (
                          {grupoAtivoStone
                            ? grupoAtivoStone.rotulo_conta_azul_esperado
                            : filtroBandeira && filtroProduto
                              ? montarRotuloGrupoStoneContaAzul(
                                  filtroBandeira,
                                  filtroProduto
                                )
                              : 'Selecione Data + Bandeira + Modalidade'}
                          )
                        </span>
                      </h3>
                      <p className="dx-panel-sub">
                        Conciliação individual por{' '}
                        <b>Data + Bandeira + Modalidade (CD/DB)</b> contra o
                        lançamento correspondente no Conta Azul.
                      </p>
                    </div>
                    <span
                      className={`dx-status ${
                        stoneConferenciaBancaria.conferencia_aprovada
                          ? 'is-ok'
                          : stoneConferenciaBancaria.status_conferencia ===
                                'DIVERGENTE_BLOQUEADA' ||
                              stoneConferenciaBancaria.status_conferencia ===
                                'DUPLICIDADE_AMBIGUA_CA'
                            ? 'is-bad'
                            : 'is-warn'
                      }`}
                    >
                      {stoneConferenciaBancaria.conferencia_aprovada
                        ? 'CONFERIDO_EXATO · Grupo Aprovado'
                        : stoneConferenciaBancaria.status_conferencia ===
                            'DIVERGENTE_BLOQUEADA'
                          ? 'DIVERGENTE_BLOQUEADA'
                          : stoneConferenciaBancaria.status_conferencia ===
                              'DUPLICIDADE_AMBIGUA_CA'
                            ? 'DUPLICIDADE_AMBIGUA_CA'
                            : stoneConferenciaBancaria.status_conferencia ===
                                'AUSENTE_CONTA_AZUL'
                              ? 'AUSENTE_CONTA_AZUL'
                              : 'AGUARDANDO_CONFERENCIA'}
                    </span>
                  </div>

                  <div className="dx-panel-section space-y-4">
                    {stoneConferenciaBancaria.lancamento_conta_azul_correspondente && (
                      <div className="p-3 rounded-[12px] border border-[var(--dx-line)] bg-[var(--dx-soft)] text-xs space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-[var(--dx-ink)]">
                            Lançamento Conta Azul Localizado (GET):
                          </span>
                          <span className="font-mono text-[11px] text-[var(--dx-accent)]">
                            {
                              stoneConferenciaBancaria
                                .lancamento_conta_azul_correspondente.descricao
                            }
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--dx-muted)]">
                          <span>
                            Vencimento CA:{' '}
                            <b>
                              {
                                stoneConferenciaBancaria
                                  .lancamento_conta_azul_correspondente
                                  .data_vencimento
                              }
                            </b>
                            {stoneConferenciaBancaria.campo_data_correspondencia
                              ? ` (${stoneConferenciaBancaria.campo_data_correspondencia})`
                              : ''}
                          </span>
                          <span>
                            Valor CA:{' '}
                            <b>
                              {formatarCentavosBRL(
                                stoneConferenciaBancaria
                                  .lancamento_conta_azul_correspondente
                                  .valor_total_centavos
                              )}
                            </b>
                          </span>
                        </div>
                      </div>
                    )}

                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <label className="dx-label">
                          Valor Conferido do Grupo no Conta Azul / Banco (R$)
                          {grupoAtivoStone
                            ? ` — ${grupoAtivoStone.rotulo_conta_azul_esperado}`
                            : ''}
                        </label>
                        {grupoAtivoStone &&
                          stoneTotaisFiltrados.valor_liquido_centavos > 0 && (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  const valFormatado = (
                                    stoneTotaisFiltrados.valor_liquido_centavos /
                                    100
                                  )
                                    .toFixed(2)
                                    .replace('.', ',')
                                  setValorExtratoBancarioStr(valFormatado)
                                  setOperacaoMarcadaConferida(false)
                                }}
                                className="text-[11px] font-semibold text-[var(--dx-link)] underline cursor-pointer"
                              >
                                Preencher Líquido do Grupo
                              </button>
                              <span className="text-[var(--dx-muted)]">·</span>
                              <button
                                type="button"
                                onClick={() => {
                                  const valDivergente = (
                                    (stoneTotaisFiltrados.valor_liquido_centavos +
                                      1) /
                                    100
                                  )
                                    .toFixed(2)
                                    .replace('.', ',')
                                  setValorExtratoBancarioStr(valDivergente)
                                  setOperacaoMarcadaConferida(false)
                                }}
                                className="text-[11px] font-semibold text-[var(--dx-bad)] underline cursor-pointer"
                              >
                                Simular Divergência (+R$ 0,01)
                              </button>
                            </div>
                          )}
                      </div>
                      <input
                        type="text"
                        disabled={!grupoAtivoStone}
                        value={valorExtratoBancarioStr}
                        onChange={(e) => {
                          setValorExtratoBancarioStr(e.target.value)
                          setOperacaoMarcadaConferida(false)
                        }}
                        placeholder={
                          grupoAtivoStone
                            ? `Valor líquido de ${grupoAtivoStone.rotulo_conta_azul_esperado} (ex: ${(
                                stoneTotaisFiltrados.valor_liquido_centavos /
                                100
                              )
                                .toFixed(2)
                                .replace('.', ',')})`
                            : 'Selecione Data + Bandeira + Produto para conferir o grupo'
                        }
                        className="dx-control"
                      />
                    </div>

                    {/* Quadro comparativo direto: VALOR LÍQUIDO DA STONE x VALOR DO EXTRATO BANCÁRIO */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div className="p-3 rounded-[12px] border border-[var(--dx-line)] bg-[var(--dx-soft)]">
                        <div className="text-[11px] font-semibold text-[var(--dx-muted)]">
                          Valor Líquido da Stone
                        </div>
                        <div className="text-base font-extrabold text-[var(--dx-ink)] mt-0.5">
                          {formatarCentavosBRL(
                            stoneConferenciaBancaria.valor_liquido_stone_centavos
                          )}
                        </div>
                        <div className="text-[10px] text-[var(--dx-muted)] font-mono">
                          {formatarMicroBRL(
                            stoneConferenciaBancaria.valor_liquido_stone_micro,
                            6
                          )}
                        </div>
                      </div>

                      <div className="p-3 rounded-[12px] border border-[var(--dx-line)] bg-[var(--dx-soft)]">
                        <div className="text-[11px] font-semibold text-[var(--dx-muted)]">
                          Valor do Extrato Bancário
                        </div>
                        <div className="text-base font-extrabold text-[var(--dx-ink)] mt-0.5">
                          {stoneConferenciaBancaria.valor_extrato_bancario_centavos !==
                          null
                            ? formatarCentavosBRL(
                                stoneConferenciaBancaria.valor_extrato_bancario_centavos
                              )
                            : '—'}
                        </div>
                        <div className="text-[10px] text-[var(--dx-muted)]">
                          Informado pelo operador
                        </div>
                      </div>

                      <div className="p-3 rounded-[12px] border border-[var(--dx-line)] bg-[var(--dx-soft)]">
                        <div className="text-[11px] font-semibold text-[var(--dx-muted)]">
                          Diferença Exata (R$)
                        </div>
                        <div
                          className={`text-base font-extrabold mt-0.5 ${
                            stoneConferenciaBancaria.conferencia_aprovada
                              ? 'text-[var(--dx-ok)]'
                              : stoneConferenciaBancaria.status_codigo ===
                                  'DIVERGENTE_BLOQUEADA'
                                ? 'text-[var(--dx-bad)]'
                                : 'text-[var(--dx-muted)]'
                          }`}
                        >
                          {stoneConferenciaBancaria.valor_extrato_bancario_centavos !==
                          null
                            ? formatarCentavosBRL(
                                stoneConferenciaBancaria.diferenca_centavos
                              )
                            : '—'}
                        </div>
                        <div className="text-[10px] text-[var(--dx-muted)]">
                          Tolerância zero (R$ 0,00)
                        </div>
                      </div>
                    </div>

                    {/* Mensagem de status da conferência */}
                    <div
                      className={`p-3.5 rounded-[12px] border flex items-start gap-2.5 ${
                        stoneConferenciaBancaria.conferencia_aprovada
                          ? 'border-[var(--dx-ok)] bg-[var(--dx-ok-bg)] text-[var(--dx-ok)]'
                          : stoneConferenciaBancaria.status_codigo ===
                              'DIVERGENTE_BLOQUEADA'
                            ? 'border-[var(--dx-bad)] bg-[var(--dx-bad-bg)] text-[var(--dx-bad)]'
                            : 'border-[var(--dx-line)] bg-[var(--dx-soft)] text-[var(--dx-muted)]'
                      }`}
                    >
                      {stoneConferenciaBancaria.conferencia_aprovada ? (
                        <CheckCircle2 size={18} className="flex-shrink-0 mt-0.5" />
                      ) : stoneConferenciaBancaria.status_codigo ===
                        'DIVERGENTE_BLOQUEADA' ? (
                        <XCircle size={18} className="flex-shrink-0 mt-0.5" />
                      ) : (
                        <Info size={18} className="flex-shrink-0 mt-0.5" />
                      )}
                      <div className="text-xs leading-relaxed">
                        <b>{stoneConferenciaBancaria.mensagem}</b>
                      </div>
                    </div>

                    {/* Botão de Marcar Operação como Conferida (Bloqueado se houver divergência) */}
                    <div className="flex items-center justify-between gap-3 pt-1">
                      <button
                        type="button"
                        disabled={
                          stoneConferenciaBancaria.bloqueada_para_conferencia
                        }
                        onClick={() => setOperacaoMarcadaConferida(true)}
                        className={`dx-btn is-lg w-full justify-center ${
                          stoneConferenciaBancaria.conferencia_aprovada
                            ? 'is-primary'
                            : 'opacity-50 cursor-not-allowed'
                        }`}
                      >
                        {stoneConferenciaBancaria.bloqueada_para_conferencia ? (
                          <>
                            <Lock size={15} />
                            <span>
                              Marcação Bloqueada (Exige Igualdade Exata com o
                              Banco)
                            </span>
                          </>
                        ) : operacaoMarcadaConferida ? (
                          <>
                            <CheckCircle2 size={15} />
                            <span>
                              Operação Marcada como Conferida (Em Memória)
                            </span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 size={15} />
                            <span>
                              Marcar Operação como Conferida (Em Memória)
                            </span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* COLUNA DIREITA: PREPARAÇÃO DOS LANÇAMENTOS (SOMENTE EM MEMÓRIA) */}
                <div className="dx-panel">
                  <div className="dx-panel-head">
                    <div>
                      <h3 className="dx-panel-title flex items-center gap-2">
                        <FileSpreadsheet size={16} />
                        <span>
                          Passo 3 — Preparação dos Lançamentos (Em Memória)
                        </span>
                      </h3>
                      <p className="dx-panel-sub">
                        Prévia estruturada da Receita Bruta e da Despesa de MDR
                        para o Conta Azul (nenhum dado é enviado nesta etapa).
                      </p>
                    </div>
                    <span
                      className={`dx-status ${
                        stonePreviaLancamentos.disponivel ? 'is-ok' : 'is-warn'
                      }`}
                    >
                      {stonePreviaLancamentos.disponivel
                        ? 'Pronto para Lançamento'
                        : 'Aguardando Aprovação'}
                    </span>
                  </div>

                  <div className="dx-panel-section space-y-3">
                    {/* A) RECEITA */}
                    <div
                      className={`p-3.5 rounded-[12px] border ${
                        stonePreviaLancamentos.disponivel
                          ? 'border-[var(--dx-ok)] bg-[var(--dx-soft)]'
                          : 'border-[var(--dx-line)] bg-[var(--dx-soft)] opacity-75'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs font-bold text-[var(--dx-ok)]">
                          A) RECEITA — Valor Bruto da Operação
                        </span>
                        <span className="dx-pill is-ok">
                          Categoria:{' '}
                          {categoriasReceitaCA.find(
                            (c) => c.id === categoriaReceitaSelecionadaId
                          )?.nome ||
                            stonePreviaLancamentos.receita.categoria_sugerida}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-1">
                        <div>
                          <div className="text-lg font-extrabold text-[var(--dx-ink)]">
                            {formatarCentavosBRL(
                              stonePreviaLancamentos.receita.valor_centavos
                            )}
                          </div>
                          <div className="text-[11px] text-[var(--dx-muted)]">
                            {stonePreviaLancamentos.receita.descricao_sugerida}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            handleCopiarValor(
                              'bruto',
                              stonePreviaLancamentos.receita.valor_centavos
                            )
                          }
                          className="dx-btn is-sm"
                          title="Copiar Valor Bruto"
                        >
                          {campoCopiado === 'bruto' ? (
                            <>
                              <Check size={13} />
                              <span>Copiado</span>
                            </>
                          ) : (
                            <>
                              <Copy size={13} />
                              <span>Copiar Bruto</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* B) DESPESA */}
                    <div
                      className={`p-3.5 rounded-[12px] border ${
                        stonePreviaLancamentos.disponivel
                          ? 'border-[var(--dx-warn)] bg-[var(--dx-soft)]'
                          : 'border-[var(--dx-line)] bg-[var(--dx-soft)] opacity-75'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs font-bold text-[var(--dx-warn)]">
                          B) DESPESA — Valor Correspondente ao MDR
                        </span>
                        <span className="dx-pill is-warn">
                          Categoria:{' '}
                          {categoriasDespesaCA.find(
                            (c) => c.id === categoriaDespesaMdrSelecionadaId
                          )?.nome ||
                            stonePreviaLancamentos.despesa_mdr
                              .categoria_sugerida}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-1">
                        <div>
                          <div className="text-lg font-extrabold text-[var(--dx-ink)]">
                            {formatarCentavosBRL(
                              stonePreviaLancamentos.despesa_mdr.valor_centavos
                            )}
                          </div>
                          <div className="text-[11px] text-[var(--dx-muted)]">
                            {stonePreviaLancamentos.despesa_mdr.descricao_sugerida}{' '}
                            (6 casas:{' '}
                            {formatarMicroBRL(
                              stonePreviaLancamentos.despesa_mdr.valor_micro,
                              6
                            )}
                            )
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            handleCopiarValor(
                              'mdr',
                              stonePreviaLancamentos.despesa_mdr.valor_centavos
                            )
                          }
                          className="dx-btn is-sm"
                          title="Copiar Desconto de MDR"
                        >
                          {campoCopiado === 'mdr' ? (
                            <>
                              <Check size={13} />
                              <span>Copiado</span>
                            </>
                          ) : (
                            <>
                              <Copy size={13} />
                              <span>Copiar MDR</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* C) RESULTADO */}
                    <div className="p-3.5 rounded-[12px] border border-[var(--dx-line)] bg-[var(--dx-surface)] space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[var(--dx-ink)]">
                          C) RESULTADO — Fechamento Contábil da Operação
                        </span>
                        <span
                          className={`dx-status ${
                            stonePreviaLancamentos.disponivel
                              ? 'is-ok'
                              : 'is-bad'
                          }`}
                        >
                          {stonePreviaLancamentos.disponivel
                            ? operacaoMarcadaConferida
                              ? 'Conferida em Memória'
                              : 'Conferência Aprovada'
                            : 'Bloqueada'}
                        </span>
                      </div>
                      <div className="text-xs text-[var(--dx-muted)] flex items-center justify-between">
                        <span>
                          Equação (Receita Bruta - Despesa MDR):
                        </span>
                        <b className="text-[var(--dx-ink)]">
                          {formatarCentavosBRL(
                            stonePreviaLancamentos.resultado.valor_bruto_centavos
                          )}{' '}
                          -{' '}
                          {formatarCentavosBRL(
                            stonePreviaLancamentos.resultado.desconto_mdr_centavos
                          )}{' '}
                          ={' '}
                          {formatarCentavosBRL(
                            stonePreviaLancamentos.resultado
                              .valor_liquido_esperado_centavos
                          )}
                        </b>
                      </div>
                      <div className="text-xs text-[var(--dx-muted)] flex items-center justify-between">
                        <span>Valor Depositado no Banco:</span>
                        <b className="text-[var(--dx-ink)]">
                          {stoneConferenciaBancaria.valor_extrato_bancario_centavos !==
                          null
                            ? formatarCentavosBRL(
                                stonePreviaLancamentos.resultado
                                  .valor_deposito_bancario_centavos
                              )
                            : 'Não informado'}
                        </b>
                      </div>
                      <div className="text-xs text-[var(--dx-muted)] flex items-center justify-between">
                        <span>Conta Financeira Selecionada:</span>
                        <b className="text-[var(--dx-ink)]">
                          {contasFinanceirasCA.find(
                            (cf) => cf.id === contaFinanceiraSelecionadaId
                          )?.descricao || 'Nenhuma conta selecionada'}
                        </b>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* PASSO 4 (ETAPA 1E): CONSULTA DE LANÇAMENTOS EXISTENTES NO PERÍODO NO CONTA AZUL (SOMENTE LEITURA / GET) */}
              <div className="dx-panel">
                <div className="dx-panel-head">
                  <div>
                    <h3 className="dx-panel-title flex items-center gap-2">
                      <Search size={16} />
                      <span>
                        Passo 4 — Consulta de Lançamentos Existentes no Período
                        no Conta Azul (Somente Leitura · GET)
                      </span>
                    </h3>
                    <p className="dx-panel-sub">
                      Verifica em tempo real se já existem lançamentos de{' '}
                      <b>Receita Bruta</b>, <b>Despesa de MDR</b> ou{' '}
                      <b>Valor Líquido</b> no Conta Azul para o período filtrado
                      ({filtroDataVencOriginal || 'Período da Planilha'}), sem
                      criar nem baixar parcelas.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      disabled={
                        !empresaId ||
                        !periodoIsoFiltroStone ||
                        consultandoPeriodoCA
                      }
                      onClick={handleConsultarLancamentosPeriodoContaAzul}
                      className="dx-btn is-primary"
                    >
                      <Search size={14} />
                      <span>
                        {consultandoPeriodoCA
                          ? 'Consultando Lançamentos no Conta Azul (GET)...'
                          : 'Consultar Lançamentos do Período no Conta Azul (GET)'}
                      </span>
                    </button>
                  </div>
                </div>

                <div className="dx-panel-section space-y-4">
                  {!avaliacaoPeriodoCA ? (
                    <div className="p-4 rounded-[12px] border border-[var(--dx-line)] bg-[var(--dx-soft)] flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2.5 text-xs text-[var(--dx-muted)]">
                        <Info size={18} className="flex-shrink-0" />
                        <span>
                          Clique em{' '}
                          <b>
                            &ldquo;Consultar Lançamentos do Período no Conta
                            Azul (GET)&rdquo;
                          </b>{' '}
                          para inspecionar se já existem receitas, parcelas ou
                          despesas de MDR lançadas para a empresa{' '}
                          <b>{empresaNome || 'selecionada'}</b> no período{' '}
                          <b>
                            {periodoIsoFiltroStone
                              ? `${formatarDataBR(periodoIsoFiltroStone.data_de)} a ${formatarDataBR(periodoIsoFiltroStone.data_ate)}`
                              : 'atual'}
                          </b>
                          .
                        </span>
                      </div>
                      <span className="dx-pill is-accent">
                        Nenhuma escrita é realizada (100% GET)
                      </span>
                    </div>
                  ) : (
                    <>
                      {/* Resumo do período consultado no Conta Azul */}
                      <div className="p-3.5 rounded-[12px] border border-[var(--dx-line)] bg-[var(--dx-soft)] flex items-center justify-between gap-3 flex-wrap">
                        <div className="text-xs text-[var(--dx-ink)]">
                          Período consultado no Conta Azul:{' '}
                          <b>
                            {formatarDataBR(
                              avaliacaoPeriodoCA.periodo_consultado.data_de
                            )}{' '}
                            a{' '}
                            {formatarDataBR(
                              avaliacaoPeriodoCA.periodo_consultado.data_ate
                            )}
                          </b>{' '}
                          · Receitas encontradas no período:{' '}
                          <b>
                            {avaliacaoPeriodoCA.total_receitas_no_periodo}
                          </b>{' '}
                          · Despesas encontradas no período:{' '}
                          <b>
                            {avaliacaoPeriodoCA.total_despesas_no_periodo}
                          </b>
                        </div>
                        <span className="dx-pill is-ok">
                          Triagem Segura Anti-Duplicidade (Seção 7)
                        </span>
                      </div>

                      {/* 3 Cards de Triagem: Receita Bruta, Despesa de MDR e Valor Líquido Depositado */}
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5">
                        {(
                          [
                            {
                              chave: 'bruto',
                              titulo: '1. Receita Bruta da Operação Stone',
                              subtitulo: 'Busca em Contas a Receber no período',
                              valorAlvoCentavos:
                                stoneTotaisFiltrados.valor_bruto_centavos,
                              dados: avaliacaoPeriodoCA.triagem_receita_bruta,
                            },
                            {
                              chave: 'mdr',
                              titulo: '2. Despesa de MDR da Operação Stone',
                              subtitulo: 'Busca em Contas a Pagar no período',
                              valorAlvoCentavos:
                                stoneTotaisFiltrados.desconto_mdr_ajustado_centavos,
                              dados: avaliacaoPeriodoCA.triagem_despesa_mdr,
                            },
                            {
                              chave: 'liquido',
                              titulo:
                                '3. Valor Líquido Depositado (Referência)',
                              subtitulo:
                                'Verifica se o líquido já foi lançado como receita',
                              valorAlvoCentavos:
                                stoneTotaisFiltrados.valor_liquido_centavos,
                              dados:
                                avaliacaoPeriodoCA.triagem_deposito_liquido,
                            },
                          ] as Array<{
                            chave: string
                            titulo: string
                            subtitulo: string
                            valorAlvoCentavos: number
                            dados: ResultadoTriagemItemLoteCA | null | undefined
                          }>
                        ).map((bloco) => {
                          if (!bloco.dados) return null
                          const estilo = obterEstiloClassificacaoCA(
                            bloco.dados.classificacao
                          )
                          return (
                            <div
                              key={bloco.chave}
                              className="p-3.5 rounded-[12px] border border-[var(--dx-line)] bg-[var(--dx-surface)] space-y-2.5 flex flex-col justify-between"
                            >
                              <div className="space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <div className="text-xs font-bold text-[var(--dx-ink)]">
                                      {bloco.titulo}
                                    </div>
                                    <div className="text-[11px] text-[var(--dx-muted)]">
                                      {bloco.subtitulo}
                                    </div>
                                  </div>
                                  <span
                                    className={`dx-status ${estilo.badgeClass}`}
                                  >
                                    {estilo.label}
                                  </span>
                                </div>

                                <div className="flex items-center justify-between pt-1 border-t border-[var(--dx-line-soft)]">
                                  <span className="text-xs text-[var(--dx-muted)]">
                                    Valor Pesquisado:
                                  </span>
                                  <b className="text-sm font-extrabold text-[var(--dx-ink)]">
                                    {formatarCentavosBRL(
                                      bloco.valorAlvoCentavos
                                    )}
                                  </b>
                                </div>

                                <div className="p-2.5 rounded-[10px] border border-[var(--dx-line)] bg-[var(--dx-soft)] text-xs text-[var(--dx-ink)] leading-relaxed">
                                  {bloco.dados.mensagem}
                                </div>

                                {bloco.dados.candidatos.length > 0 && (
                                  <div className="space-y-1.5 pt-1">
                                    <div className="text-[11px] font-bold text-[var(--dx-muted)]">
                                      Candidato(s) localizado(s) no Conta Azul (
                                      {bloco.dados.candidatos.length}):
                                    </div>
                                    <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                                      {bloco.dados.candidatos.map((cand) => (
                                        <div
                                          key={cand.id}
                                          className="p-2 rounded-[8px] border border-[var(--dx-line)] bg-[var(--dx-soft)] text-[11px] space-y-0.5"
                                        >
                                          <div className="flex items-center justify-between gap-2">
                                            <b className="text-[var(--dx-ink)] truncate">
                                              {cand.descricao}
                                            </b>
                                            <span
                                              className={`dx-pill ${
                                                cand.valor_aberto_centavos === 0
                                                  ? 'is-bad'
                                                  : 'is-warn'
                                              }`}
                                            >
                                              {cand.status}
                                            </span>
                                          </div>
                                          <div className="flex items-center justify-between text-[var(--dx-muted)]">
                                            <span>
                                              Venc.:{' '}
                                              {formatarDataBR(
                                                cand.data_vencimento
                                              )}
                                            </span>
                                            <b className="text-[var(--dx-ink)]">
                                              {formatarCentavosBRL(
                                                cand.valor_total_centavos
                                              )}
                                            </b>
                                          </div>
                                          {cand.contato_nome && (
                                            <div className="text-[10px] text-[var(--dx-muted)] truncate">
                                              Pessoa: {cand.contato_nome}
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>

                              <div className="pt-2 border-t border-[var(--dx-line-soft)] flex items-center justify-between text-[11px]">
                                <span className="text-[var(--dx-muted)]">
                                  Regra de Segurança:
                                </span>
                                <span
                                  className={`dx-pill ${
                                    bloco.dados.ja_quitado
                                      ? 'is-bad'
                                      : !bloco.dados.autoriza_vinculo_automatico
                                        ? 'is-warn'
                                        : 'is-ok'
                                  }`}
                                >
                                  {bloco.dados.ja_quitado
                                    ? 'Bloqueado (Já Quitado)'
                                    : !bloco.dados.autoriza_vinculo_automatico
                                      ? 'Exige Conferência Humana'
                                      : 'Determinístico'}
                                </span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* ====================================================================
                  PASSO 5 (ETAPA 1F-A): PREPARAÇÃO E VALIDAÇÃO DE PRÉ-VOO PARA CONTA AZUL
                  (RECEITA BRUTA E DESPESA MDR — ESTRITAMENTE SEM TRANSMISSÃO)
                 ==================================================================== */}
              <div className="dx-panel">
                <div className="dx-panel-head">
                  <div>
                    <h3 className="dx-panel-title flex items-center gap-2">
                      <ShieldCheck size={16} />
                      <span>
                        Passo 5 (Etapa 1F-A) — Preparação e Validação dos
                        Lançamentos (Receita Bruta e Despesa MDR · Sem Transmissão)
                      </span>
                    </h3>
                    <p className="dx-panel-sub">
                      Validação completa de pré-voo para a loja{' '}
                      <b>{empresaNome || 'ativa'}</b> exigindo{' '}
                      <code>CONFERIDO_EXATO</code>, categorias{' '}
                      <b>Receitas de Vendas</b> e{' '}
                      <b>Tarifas de Cartão de Créditos</b>, conta financeira,
                      idempotência e verificação de duplicidades na Conta Azul.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`dx-status ${
                        preparacaoValidacao1FA.pronto_para_etapa_1fb
                          ? 'is-ok'
                          : 'is-bad'
                      }`}
                    >
                      {preparacaoValidacao1FA.pronto_para_etapa_1fb
                        ? '1F-A Aprovada · Pronto para Etapa 1F-B'
                        : `Bloqueado (${preparacaoValidacao1FA.bloqueios.length} pendência(s))`}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setExibirPayloadsSimulados1FA((prev) => !prev)
                      }
                      className="dx-btn is-sm"
                    >
                      <FileSpreadsheet size={13} />
                      <span>
                        {exibirPayloadsSimulados1FA
                          ? 'Ocultar Payloads JSON'
                          : 'Inspecionar Payloads JSON (Sem Envio)'}
                      </span>
                    </button>
                  </div>
                </div>

                <div className="dx-panel-section space-y-4">
                  {/* Banner de Garantia de Não-Transmissão da Etapa 1F-A */}
                  <div className="p-3 rounded-[12px] border border-[var(--dx-line)] bg-[var(--dx-soft)] flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 text-xs text-[var(--dx-ink)]">
                      <Lock size={15} className="text-[var(--dx-accent)] flex-shrink-0" />
                      <span>
                        <b>Trava de Segurança Etapa 1F-A Ativa:</b> Nenhuma chamada{' '}
                        <code>POST</code>, <code>PUT</code>, <code>PATCH</code> ou{' '}
                        <code>DELETE</code> é executada. Os lançamentos abaixo são
                        validados e exibidos exclusivamente como prévia.
                      </span>
                    </div>
                    <span className="dx-pill is-accent">
                      Transmissão Executada: NÃO (0 escritas)
                    </span>
                  </div>

                  {/* Checklist de Regras de Validação da Etapa 1F-A */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    <div className="p-3 rounded-[10px] border border-[var(--dx-line)] bg-[var(--dx-surface)] flex items-center justify-between gap-2">
                      <div>
                        <div className="text-[11px] font-bold text-[var(--dx-ink)]">
                          1. Conferência Bancária
                        </div>
                        <div className="text-[10px] text-[var(--dx-muted)]">
                          Exige: <code>CONFERIDO_EXATO</code>
                        </div>
                      </div>
                      <span
                        className={`dx-status ${
                          preparacaoValidacao1FA.conferencia_exata_aprovada
                            ? 'is-ok'
                            : 'is-bad'
                        }`}
                      >
                        {preparacaoValidacao1FA.status_conferencia_atual}
                      </span>
                    </div>

                    <div className="p-3 rounded-[10px] border border-[var(--dx-line)] bg-[var(--dx-surface)] flex items-center justify-between gap-2">
                      <div>
                        <div className="text-[11px] font-bold text-[var(--dx-ink)]">
                          2. Loja & Conta Financeira
                        </div>
                        <div className="text-[10px] text-[var(--dx-muted)] truncate max-w-[180px]">
                          {preparacaoValidacao1FA.conta_financeira.descricao ||
                            'Não selecionada'}
                        </div>
                      </div>
                      <span
                        className={`dx-status ${
                          preparacaoValidacao1FA.conta_financeira.valida &&
                          preparacaoValidacao1FA.empresa_id !== 'emp-demo'
                            ? 'is-ok'
                            : 'is-bad'
                        }`}
                      >
                        {preparacaoValidacao1FA.conta_financeira.valida &&
                        preparacaoValidacao1FA.empresa_id !== 'emp-demo'
                          ? 'Válida'
                          : 'Pendente'}
                      </span>
                    </div>

                    <div className="p-3 rounded-[10px] border border-[var(--dx-line)] bg-[var(--dx-surface)] flex items-center justify-between gap-2">
                      <div>
                        <div className="text-[11px] font-bold text-[var(--dx-ink)]">
                          3. Categoria Receita Bruta
                        </div>
                        <div className="text-[10px] text-[var(--dx-muted)] truncate max-w-[180px]">
                          {preparacaoValidacao1FA.lancamento_receita_bruta
                            .categoria_selecionada_nome || 'Não selecionada'}
                        </div>
                      </div>
                      <span
                        className={`dx-status ${
                          preparacaoValidacao1FA.lancamento_receita_bruta
                            .categoria_compativel
                            ? 'is-ok'
                            : 'is-bad'
                        }`}
                      >
                        {preparacaoValidacao1FA.lancamento_receita_bruta
                          .categoria_compativel
                          ? 'Receitas de Vendas OK'
                          : 'Inválida'}
                      </span>
                    </div>

                    <div className="p-3 rounded-[10px] border border-[var(--dx-line)] bg-[var(--dx-surface)] flex items-center justify-between gap-2">
                      <div>
                        <div className="text-[11px] font-bold text-[var(--dx-ink)]">
                          4. Categoria Despesa MDR
                        </div>
                        <div className="text-[10px] text-[var(--dx-muted)] truncate max-w-[180px]">
                          {preparacaoValidacao1FA.lancamento_despesa_mdr
                            .categoria_selecionada_nome || 'Não selecionada'}
                        </div>
                      </div>
                      <span
                        className={`dx-status ${
                          preparacaoValidacao1FA.lancamento_despesa_mdr
                            .categoria_compativel ||
                          preparacaoValidacao1FA.lancamento_despesa_mdr
                            .dispensado_por_valor_zero
                            ? 'is-ok'
                            : 'is-bad'
                        }`}
                      >
                        {preparacaoValidacao1FA.lancamento_despesa_mdr
                          .dispensado_por_valor_zero
                          ? 'MDR R$ 0,00 (Isento)'
                          : preparacaoValidacao1FA.lancamento_despesa_mdr
                                .categoria_compativel
                            ? 'Tarifas Cartão OK'
                            : 'Inválida'}
                      </span>
                    </div>

                    <div className="p-3 rounded-[10px] border border-[var(--dx-line)] bg-[var(--dx-surface)] flex items-center justify-between gap-2">
                      <div>
                        <div className="text-[11px] font-bold text-[var(--dx-ink)]">
                          5. Data & Equação Contábil
                        </div>
                        <div className="text-[10px] text-[var(--dx-muted)]">
                          Venc. Orig.:{' '}
                          {preparacaoValidacao1FA.filtros_operacionais
                            .data_vencimento_original_br || 'Não filtrada'}
                        </div>
                      </div>
                      <span
                        className={`dx-status ${
                          preparacaoValidacao1FA.validacao_matematica
                            .equacao_valida &&
                          Boolean(
                            preparacaoValidacao1FA.filtros_operacionais
                              .data_vencimento_original_iso
                          )
                            ? 'is-ok'
                            : 'is-bad'
                        }`}
                      >
                        {preparacaoValidacao1FA.validacao_matematica
                          .equacao_valida &&
                        preparacaoValidacao1FA.filtros_operacionais
                          .data_vencimento_original_iso
                          ? 'Equação e Data OK'
                          : 'Incompleto'}
                      </span>
                    </div>

                    <div className="p-3 rounded-[10px] border border-[var(--dx-line)] bg-[var(--dx-surface)] flex items-center justify-between gap-2">
                      <div>
                        <div className="text-[11px] font-bold text-[var(--dx-ink)]">
                          6. Idempotência & Anti-Duplicidade
                        </div>
                        <div className="text-[10px] text-[var(--dx-muted)] truncate max-w-[180px]">
                          {preparacaoValidacao1FA.validacao_idempotencia.detalhe}
                        </div>
                      </div>
                      <span
                        className={`dx-status ${
                          !preparacaoValidacao1FA.validacao_idempotencia
                            .possui_conflito_idempotencia &&
                          !preparacaoValidacao1FA.bloqueios.some(
                            (b) => b.campo === 'conta_azul_existentes'
                          )
                            ? 'is-ok'
                            : 'is-bad'
                        }`}
                      >
                        {!preparacaoValidacao1FA.validacao_idempotencia
                          .possui_conflito_idempotencia &&
                        !preparacaoValidacao1FA.bloqueios.some(
                          (b) => b.campo === 'conta_azul_existentes'
                        )
                          ? 'Livre de Duplicidade'
                          : 'Conflito Detectado'}
                      </span>
                    </div>
                  </div>

                  {/* Lista de Bloqueios quando houver dados inconsistentes ou incompletos */}
                  {preparacaoValidacao1FA.bloqueios.length > 0 && (
                    <div className="p-4 rounded-[12px] border border-[var(--dx-bad)] bg-[var(--dx-bad-bg)] space-y-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-[var(--dx-bad)]">
                        <XCircle size={16} className="flex-shrink-0" />
                        <span>
                          Criação Bloqueada na Etapa 1F-A —{' '}
                          {preparacaoValidacao1FA.bloqueios.length} motivo(s)
                          impeditivo(s) identificado(s):
                        </span>
                      </div>
                      <ul className="space-y-1.5 text-xs text-[var(--dx-ink)]">
                        {preparacaoValidacao1FA.bloqueios.map((b, idx) => (
                          <li
                            key={`${b.codigo}-${idx}`}
                            className="p-2 rounded-[8px] bg-[var(--dx-surface)] border border-[var(--dx-line)] flex items-start justify-between gap-3"
                          >
                            <div>
                              <b className="text-[var(--dx-bad)]">{b.titulo}:</b>{' '}
                              <span>{b.detalhe}</span>
                            </div>
                            <span className="dx-pill is-bad flex-shrink-0 font-mono text-[10px]">
                              {b.codigo}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Avisos não-bloqueantes (ex: ajuste de 1 centavo MDR ou recomendação de consulta GET) */}
                  {preparacaoValidacao1FA.avisos.length > 0 && (
                    <div className="dx-alert">
                      <Info size={17} className="flex-shrink-0" />
                      <div className="space-y-1 text-xs">
                        {preparacaoValidacao1FA.avisos.map((aviso, i) => (
                          <p key={i}>{aviso}</p>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Prévia Clara dos 2 Lançamentos que Seriam Criados na Conta Azul */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {(
                      [
                        preparacaoValidacao1FA.lancamento_receita_bruta,
                        preparacaoValidacao1FA.lancamento_despesa_mdr,
                      ] as const
                    ).map((itemPrevia) => {
                      const ehReceita = itemPrevia.papel === 'RECEITA_BRUTA'
                      return (
                        <div
                          key={itemPrevia.papel}
                          className={`p-4 rounded-[12px] border space-y-3 ${
                            itemPrevia.dispensado_por_valor_zero
                              ? 'border-[var(--dx-line)] bg-[var(--dx-soft)] opacity-80'
                              : itemPrevia.bloqueado
                                ? 'border-[var(--dx-bad)] bg-[var(--dx-soft)]'
                                : ehReceita
                                  ? 'border-[var(--dx-ok)] bg-[var(--dx-surface)]'
                                  : 'border-[var(--dx-warn)] bg-[var(--dx-surface)]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span
                                className={`text-xs font-extrabold ${
                                  ehReceita
                                    ? 'text-[var(--dx-ok)]'
                                    : 'text-[var(--dx-warn)]'
                                }`}
                              >
                                {ehReceita
                                  ? '1. PRÉVIA DE CRIAÇÃO — RECEITA BRUTA (CONTAS A RECEBER)'
                                  : '2. PRÉVIA DE CRIAÇÃO — DESPESA MDR (CONTAS A PAGAR)'}
                              </span>
                              <div className="text-[11px] text-[var(--dx-muted)] font-mono mt-0.5">
                                Endpoint futuro: {itemPrevia.endpoint_previsto_futuro}
                              </div>
                            </div>
                            <span
                              className={`dx-status ${
                                itemPrevia.dispensado_por_valor_zero
                                  ? 'is-accent'
                                  : itemPrevia.bloqueado
                                    ? 'is-bad'
                                    : 'is-ok'
                              }`}
                            >
                              {itemPrevia.dispensado_por_valor_zero
                                ? 'Dispensado (R$ 0,00)'
                                : itemPrevia.bloqueado
                                  ? 'Bloqueado'
                                  : 'Validado (Sem Envio)'}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-[var(--dx-line-soft)]">
                            <div>
                              <span className="text-[var(--dx-muted)] block text-[10px]">
                                Valor a Lançar:
                              </span>
                              <b className="text-base font-extrabold text-[var(--dx-ink)]">
                                {formatarCentavosBRL(itemPrevia.valor_centavos)}
                              </b>
                              <span className="block text-[10px] text-[var(--dx-muted)] font-mono">
                                6 casas: {formatarMicroBRL(itemPrevia.valor_micro, 6)}
                              </span>
                            </div>
                            <div>
                              <span className="text-[var(--dx-muted)] block text-[10px]">
                                Data Competência / Vencimento:
                              </span>
                              <b className="text-sm font-bold text-[var(--dx-ink)]">
                                {itemPrevia.data_vencimento_iso
                                  ? formatarDataBR(itemPrevia.data_vencimento_iso)
                                  : 'Não definida'}
                              </b>
                              <span className="block text-[10px] text-[var(--dx-muted)] font-mono">
                                ISO: {itemPrevia.data_vencimento_iso || '—'}
                              </span>
                            </div>
                            <div>
                              <span className="text-[var(--dx-muted)] block text-[10px]">
                                Categoria Exigida ({itemPrevia.categoria_esperada}):
                              </span>
                              <b className="text-xs font-bold text-[var(--dx-ink)]">
                                {itemPrevia.categoria_selecionada_nome ||
                                  'Não selecionada'}
                              </b>
                            </div>
                            <div>
                              <span className="text-[var(--dx-muted)] block text-[10px]">
                                Conta Financeira da Loja Ativa:
                              </span>
                              <b className="text-xs font-bold text-[var(--dx-ink)]">
                                {itemPrevia.conta_financeira_nome ||
                                  'Não selecionada'}
                              </b>
                            </div>
                          </div>

                          <div className="text-xs space-y-1 pt-2 border-t border-[var(--dx-line-soft)]">
                            <div>
                              <span className="text-[var(--dx-muted)] text-[10px]">
                                Descrição do Lançamento:
                              </span>
                              <div className="font-semibold text-[var(--dx-ink)]">
                                {itemPrevia.descricao}
                              </div>
                            </div>
                            <div>
                              <span className="text-[var(--dx-muted)] text-[10px]">
                                Chave de Idempotência:
                              </span>
                              <div className="font-mono text-[10px] text-[var(--dx-muted)] break-all">
                                {itemPrevia.chave_idempotencia}
                              </div>
                            </div>
                          </div>

                          {exibirPayloadsSimulados1FA && (
                            <div className="pt-2 border-t border-[var(--dx-line-soft)]">
                              <div className="text-[10px] font-bold text-[var(--dx-muted)] mb-1">
                                Payload JSON Preparado em Memória (Sem Transmissão):
                              </div>
                              <pre className="p-2.5 rounded-[8px] bg-[var(--dx-soft)] border border-[var(--dx-line)] text-[10px] font-mono overflow-x-auto max-h-48 text-[var(--dx-ink)]">
                                {itemPrevia.payload_simulado_conta_azul
                                  ? JSON.stringify(
                                      itemPrevia.payload_simulado_conta_azul,
                                      null,
                                      2
                                    )
                                  : '// Payload bloqueado até que Data, Conta Financeira e Categoria estejam válidas.'}
                              </pre>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* ====================================================================
                  PASSO 6 (ETAPA 1F-B): CONFIRMAÇÃO EXPLÍCITA E TRANSMISSÃO CONTROLADA PARA A CONTA AZUL
                 ==================================================================== */}
              <div className="dx-panel">
                <div className="dx-panel-head">
                  <div>
                    <h3 className="dx-panel-title flex items-center gap-2 flex-wrap">
                      <ShieldCheck size={16} />
                      <span>
                        Passo 6 (Etapa 1F-B) — Confirmação Explícita e
                        Transmissão Controlada para a Conta Azul
                      </span>
                      <span className="dx-pill is-accent font-mono">
                        {grupoAtivoStone
                          ? `${grupoAtivoStone.rotulo_conta_azul_esperado} — Venc. Original ${grupoAtivoStone.data_vencimento_original_br}`
                          : filtroBandeira &&
                              filtroProduto &&
                              filtroDataVencOriginal
                            ? `${montarRotuloGrupoStoneContaAzul(
                                filtroBandeira,
                                filtroProduto
                              )} — Venc. Original ${filtroDataVencOriginal}`
                            : 'Selecione um Grupo Individual (Data + Bandeira + CD/DB)'}
                      </span>
                    </h3>
                    <p className="dx-panel-sub">
                      Transmissão isolada por grupo de <b>Receita Bruta</b> (
                      <i>Receitas de Vendas</i>) e <b>Despesa MDR</b> (
                      <i>Tarifas de Cartão de Créditos</i>) com idempotência
                      persistente, retomada segura de falhas parciais e trava de
                      segurança da etapa ativa.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`dx-status ${
                        transmitindo1FB
                          ? 'is-accent animate-pulse'
                          : avaliacaoEstadoTransmissaoGrupoAtivo1FB.jaConcluidoTotal
                            ? 'is-ok'
                            : avaliacaoEstadoTransmissaoGrupoAtivo1FB.bloqueadoIncerto
                              ? 'is-bad'
                              : avaliacaoEstadoTransmissaoGrupoAtivo1FB.falhaParcialRetomavel
                                ? 'is-warn'
                                : resultadoTransmissao1FB?.situacao ===
                                    'BLOQUEADO_TRAVA_SEGURANCA_ETAPA'
                                  ? 'is-accent'
                                  : resultadoTransmissao1FB || erroTransmissao1FB
                                    ? 'is-bad'
                                    : avaliacaoEstadoTransmissaoGrupoAtivo1FB.prontoNa1FAOuRetomavel
                                      ? 'is-ok'
                                      : 'is-warn'
                      }`}
                    >
                      {transmitindo1FB
                        ? '1F-B: Transmitindo...'
                        : avaliacaoEstadoTransmissaoGrupoAtivo1FB.jaConcluidoTotal
                          ? `1F-B: Transmitido (${
                              resultadoTransmissao1FB?.situacao ||
                              'JA_CONCLUIDO_IDEMPOTENTE'
                            })`
                          : avaliacaoEstadoTransmissaoGrupoAtivo1FB.bloqueadoIncerto
                            ? '1F-B: Resultado Incerto (Auditoria Obrigatória)'
                            : avaliacaoEstadoTransmissaoGrupoAtivo1FB.falhaParcialRetomavel
                              ? '1F-B: Falha Parcial (Retomável — Apenas Item Faltante)'
                              : resultadoTransmissao1FB
                                ? `Resultado 1F-B: ${resultadoTransmissao1FB.situacao}`
                                : avaliacaoEstadoTransmissaoGrupoAtivo1FB.prontoNa1FAOuRetomavel
                                  ? '1F-B: Pendente · Habilitado para Confirmação'
                                  : 'Aguardando Aprovação da Etapa 1F-A'}
                    </span>
                    <button
                      type="button"
                      disabled={
                        !avaliacaoEstadoTransmissaoGrupoAtivo1FB.podeIniciarConfirmacaoOuReenvio
                      }
                      onClick={() => {
                        if (
                          !avaliacaoEstadoTransmissaoGrupoAtivo1FB.podeIniciarConfirmacaoOuReenvio
                        ) {
                          return
                        }
                        setExibirConfirmacao1FB((prev) => !prev)
                        setErroTransmissao1FB(null)
                      }}
                      title={
                        avaliacaoEstadoTransmissaoGrupoAtivo1FB.motivoBloqueioBotao1FB ||
                        'Abrir quadro de confirmação explícita para transmissão 1F-B'
                      }
                      className={`dx-btn ${
                        avaliacaoEstadoTransmissaoGrupoAtivo1FB.podeIniciarConfirmacaoOuReenvio
                          ? 'is-primary'
                          : 'opacity-50 cursor-not-allowed'
                      }`}
                    >
                      <ShieldCheck size={14} />
                      <span>
                        {transmitindo1FB
                          ? 'Transmitindo Grupo...'
                          : avaliacaoEstadoTransmissaoGrupoAtivo1FB.jaConcluidoTotal
                            ? 'Grupo Já Transmitido (Idempotente)'
                            : avaliacaoEstadoTransmissaoGrupoAtivo1FB.bloqueadoIncerto
                              ? 'Bloqueado p/ Auditoria (Resultado Incerto)'
                              : exibirConfirmacao1FB
                                ? 'Ocultar Quadro de Confirmação Explícita'
                                : avaliacaoEstadoTransmissaoGrupoAtivo1FB.falhaParcialRetomavel
                                  ? 'Retomar Item Faltante (Etapa 1F-B)'
                                  : 'Revisar e Confirmar Transmissão (Etapa 1F-B)'}
                      </span>
                    </button>
                  </div>
                </div>

                <div className="dx-panel-section space-y-4">
                  {/* Aviso de Trava de Segurança de Desenvolvimento/Testes da Etapa 1F-B */}
                  <div className="p-3 rounded-[12px] border border-[var(--dx-line)] bg-[var(--dx-soft)] flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 text-xs text-[var(--dx-ink)]">
                      <Lock
                        size={15}
                        className="text-[var(--dx-accent)] flex-shrink-0"
                      />
                      <span>
                        <b>Trava de Segurança da Etapa 1F-B Ativa:</b> A
                        capacidade de transmissão, idempotência e proteção contra
                        falhas parciais está implementada, mas qualquer envio
                        financeiro real permanece bloqueado por padrão (
                        <code>
                          CONTA_AZUL_RECEBER_1FB_TRANSMISSAO_HABILITADA !==
                          &apos;true&apos;
                        </code>
                        ) até sua avaliação e autorização expressa.
                      </span>
                    </div>
                    <span className="dx-pill is-accent">
                      Envio Real Bloqueado por Padrão
                    </span>
                  </div>

                  {/* RESUMO CLARO DO GRUPO ATIVO E DO ESTADO INDIVIDUAL DA RECEITA BRUTA E DA DESPESA MDR */}
                  <div className="p-3.5 rounded-[12px] border border-[var(--dx-line)] bg-[var(--dx-surface)] space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap border-b border-[var(--dx-line-soft)] pb-2.5">
                      <div className="text-xs">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--dx-muted)] block">
                          Grupo Ativo na Etapa 1F-B (Data + Bandeira + Modalidade CD/DB)
                        </span>
                        <b className="text-sm font-extrabold font-mono text-[var(--dx-ink)]">
                          {grupoAtivoStone
                            ? `${grupoAtivoStone.rotulo_conta_azul_esperado} — Venc. Original ${grupoAtivoStone.data_vencimento_original_br}`
                            : filtroBandeira &&
                                filtroProduto &&
                                filtroDataVencOriginal
                              ? `${montarRotuloGrupoStoneContaAzul(
                                  filtroBandeira,
                                  filtroProduto
                                )} — Venc. Original ${filtroDataVencOriginal}`
                              : 'Nenhum grupo individual selecionado'}
                        </b>
                      </div>
                      <span className="text-[11px] font-mono text-[var(--dx-muted)]">
                        Chave Grupo: <b>{chaveGrupoStoneEfetiva || '—'}</b>
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      {/* Resumo Individual: 1. Receita Bruta */}
                      {(() => {
                        const itemMem = resultadoTransmissao1FB?.receita_bruta
                        const regIdemp =
                          avaliacaoEstadoTransmissaoGrupoAtivo1FB.regReceita
                        const statusLabel = transmitindo1FB
                          ? 'TRANSMITINDO...'
                          : itemMem
                            ? itemMem.status
                            : regIdemp
                              ? regIdemp.status === 'RECEITA_CRIADA_SEM_BAIXA' ||
                                regIdemp.status === 'BAIXADO_COMPLETO' ||
                                regIdemp.status === 'CONCILIADO_EXISTENTE'
                                ? 'JA_TRANSMITIDO_ANTERIORMENTE'
                                : regIdemp.status
                              : preparacaoValidacao1FA.lancamento_receita_bruta
                                    .bloqueado
                                ? 'BLOQUEADO_PRE_VALIDACAO'
                                : 'PENDENTE'

                        const badgeCls =
                          statusLabel === 'TRANSMITIDO_COM_SUCESSO' ||
                          statusLabel === 'JA_TRANSMITIDO_ANTERIORMENTE'
                            ? 'is-ok'
                            : statusLabel === 'BLOQUEADO_TRAVA_ETAPA' ||
                                statusLabel === 'TRANSMITINDO...'
                              ? 'is-accent'
                              : statusLabel === 'PENDENTE'
                                ? 'is-warn'
                                : 'is-bad'

                        const uuidRef =
                          itemMem?.conta_azul_parcela_id ||
                          itemMem?.conta_azul_evento_id ||
                          regIdemp?.conta_azul_parcela_id ||
                          regIdemp?.conta_azul_evento_id ||
                          null

                        return (
                          <div className="p-3 rounded-[10px] border border-[var(--dx-line)] bg-[var(--dx-soft)] space-y-1.5">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className="font-extrabold text-[var(--dx-ok)]">
                                1. Receita Bruta (Receitas de Vendas)
                              </span>
                              <span className={`dx-status ${badgeCls}`}>
                                {statusLabel}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <b className="text-sm font-extrabold text-[var(--dx-ink)]">
                                {formatarCentavosBRL(
                                  stoneTotaisFiltrados.valor_bruto_centavos
                                )}
                              </b>
                              <span className="text-[11px] text-[var(--dx-muted)] truncate">
                                Cat.:{' '}
                                <b>{categoriaReceitaAtivaObj?.nome || '—'}</b>
                              </span>
                            </div>
                            <div className="text-[10px] font-mono text-[var(--dx-muted)] flex items-center justify-between gap-2 pt-1 border-t border-[var(--dx-line-soft)]">
                              <span className="truncate">
                                Chave: {chaveIdempotenciaReceitaAtiva1FA || '—'}
                              </span>
                              {uuidRef && (
                                <span className="text-[var(--dx-ok)] flex-shrink-0">
                                  CA ID: {uuidRef}
                                </span>
                              )}
                            </div>
                          </div>
                        )
                      })()}

                      {/* Resumo Individual: 2. Despesa MDR */}
                      {(() => {
                        const itemMem = resultadoTransmissao1FB?.despesa_mdr
                        const regIdemp =
                          avaliacaoEstadoTransmissaoGrupoAtivo1FB.regDespesa
                        const mdrZero =
                          stoneTotaisFiltrados.desconto_mdr_ajustado_centavos <=
                          0
                        const statusLabel = mdrZero
                          ? 'DISPENSADO_VALOR_ZERO'
                          : transmitindo1FB
                            ? 'TRANSMITINDO...'
                            : itemMem
                              ? itemMem.status
                              : regIdemp
                                ? regIdemp.status ===
                                    'RECEITA_CRIADA_SEM_BAIXA' ||
                                  regIdemp.status === 'BAIXADO_COMPLETO' ||
                                  regIdemp.status === 'CONCILIADO_EXISTENTE'
                                  ? 'JA_TRANSMITIDO_ANTERIORMENTE'
                                  : regIdemp.status
                                : preparacaoValidacao1FA.lancamento_despesa_mdr
                                      .bloqueado
                                  ? 'BLOQUEADO_PRE_VALIDACAO'
                                  : 'PENDENTE'

                        const badgeCls =
                          statusLabel === 'TRANSMITIDO_COM_SUCESSO' ||
                          statusLabel === 'JA_TRANSMITIDO_ANTERIORMENTE'
                            ? 'is-ok'
                            : statusLabel === 'BLOQUEADO_TRAVA_ETAPA' ||
                                statusLabel === 'DISPENSADO_VALOR_ZERO' ||
                                statusLabel === 'TRANSMITINDO...'
                              ? 'is-accent'
                              : statusLabel === 'PENDENTE'
                                ? 'is-warn'
                                : 'is-bad'

                        const uuidRef =
                          itemMem?.conta_azul_parcela_id ||
                          itemMem?.conta_azul_evento_id ||
                          regIdemp?.conta_azul_parcela_id ||
                          regIdemp?.conta_azul_evento_id ||
                          null

                        return (
                          <div className="p-3 rounded-[10px] border border-[var(--dx-line)] bg-[var(--dx-soft)] space-y-1.5">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className="font-extrabold text-[var(--dx-warn)]">
                                2. Despesa MDR (Tarifas de Cartão de Créditos)
                              </span>
                              <span className={`dx-status ${badgeCls}`}>
                                {statusLabel}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <b className="text-sm font-extrabold text-[var(--dx-ink)]">
                                {formatarCentavosBRL(
                                  stoneTotaisFiltrados.desconto_mdr_ajustado_centavos
                                )}
                              </b>
                              <span className="text-[11px] text-[var(--dx-muted)] truncate">
                                Cat.:{' '}
                                <b>
                                  {categoriaDespesaMdrAtivaObj?.nome || '—'}
                                </b>
                              </span>
                            </div>
                            <div className="text-[10px] font-mono text-[var(--dx-muted)] flex items-center justify-between gap-2 pt-1 border-t border-[var(--dx-line-soft)]">
                              <span className="truncate">
                                Chave:{' '}
                                {chaveIdempotenciaDespesaMdrAtiva1FA || '—'}
                              </span>
                              {uuidRef && (
                                <span className="text-[var(--dx-ok)] flex-shrink-0">
                                  CA ID: {uuidRef}
                                </span>
                              )}
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  </div>

                  {/* Avisos explícitos de bloqueio contra reenvio quando já concluído ou em resultado incerto */}
                  {avaliacaoEstadoTransmissaoGrupoAtivo1FB.jaConcluidoTotal && (
                    <div className="p-3.5 rounded-[12px] border border-[var(--dx-ok)] bg-[var(--dx-ok-bg)] flex items-center gap-2.5 text-xs text-[var(--dx-ok)]">
                      <CheckCircle2 size={16} className="flex-shrink-0" />
                      <span>
                        <b>Grupo Já Concluído (Idempotência Ativa):</b> Tanto a
                        Receita Bruta quanto a Despesa MDR deste grupo já foram
                        processadas e confirmadas. O botão de transmissão está
                        bloqueado para impedir qualquer reenvio duplicado.
                      </span>
                    </div>
                  )}

                  {avaliacaoEstadoTransmissaoGrupoAtivo1FB.bloqueadoIncerto && (
                    <div className="p-3.5 rounded-[12px] border border-[var(--dx-bad)] bg-[var(--dx-bad-bg)] flex items-center gap-2.5 text-xs text-[var(--dx-bad)]">
                      <AlertTriangle size={16} className="flex-shrink-0" />
                      <span>
                        <b>
                          Bloqueio de Segurança por Resultado Incerto (
                          <code>RECONCILIACAO_NECESSARIA_BLOQUEADO</code>):
                        </b>{' '}
                        Houve uma resposta inconclusiva ou falha de persistência
                        pós-chamada externa neste grupo. O reenvio automático
                        está bloqueado para evitar duplicidade; audite na Conta
                        Azul antes de prosseguir.
                      </span>
                    </div>
                  )}

                  {avaliacaoEstadoTransmissaoGrupoAtivo1FB.falhaParcialRetomavel && (
                    <div className="p-3.5 rounded-[12px] border border-[var(--dx-warn)] bg-[var(--dx-soft)] flex items-center gap-2.5 text-xs text-[var(--dx-ink)]">
                      <AlertTriangle
                        size={16}
                        className="text-[var(--dx-warn)] flex-shrink-0"
                      />
                      <span>
                        <b>
                          Falha Parcial Retomável Detectada (
                          <code>FALHA_PARCIAL_RETOMAVEL</code>):
                        </b>{' '}
                        Um dos itens deste grupo já está confirmado por
                        idempotência e será reaproveitado sem reenvio; ao
                        confirmar e retransmitir, o sistema enviará{' '}
                        <b>exclusivamente o item faltante</b>.
                      </span>
                    </div>
                  )}

                  {!avaliacaoEstadoTransmissaoGrupoAtivo1FB.prontoNa1FAOuRetomavel &&
                    !avaliacaoEstadoTransmissaoGrupoAtivo1FB.jaConcluidoTotal &&
                    !avaliacaoEstadoTransmissaoGrupoAtivo1FB.bloqueadoIncerto && (
                      <div className="p-3.5 rounded-[12px] border border-[var(--dx-line)] bg-[var(--dx-surface)] flex items-center gap-2.5 text-xs text-[var(--dx-muted)]">
                        <Info size={16} className="flex-shrink-0" />
                        <span>
                          A confirmação explícita de transmissão só é liberada
                          quando todos os critérios da Etapa 1F-A estiverem
                          aprovados (incluindo conferência bancária{' '}
                          <code>CONFERIDO_EXATO</code>, loja ativa, conta
                          financeira, categorias obrigatórias e data de
                          vencimento original).
                        </span>
                      </div>
                    )}

                  {erroTransmissao1FB && !exibirConfirmacao1FB && (
                    <div className="p-3 rounded-[10px] border border-[var(--dx-bad)] bg-[var(--dx-bad-bg)] text-xs text-[var(--dx-bad)] flex items-center gap-2">
                      <XCircle size={15} className="flex-shrink-0" />
                      <b>{erroTransmissao1FB}</b>
                    </div>
                  )}

                  {/* QUADRO DE CONFIRMAÇÃO EXPLÍCITA (7 ITENS OBRIGATÓRIOS) */}
                  {exibirConfirmacao1FB &&
                    avaliacaoEstadoTransmissaoGrupoAtivo1FB.podeIniciarConfirmacaoOuReenvio && (
                      <div className="p-4 rounded-[14px] border-2 border-[var(--dx-accent)] bg-[var(--dx-surface)] space-y-4">
                        <div className="flex items-center justify-between gap-2 flex-wrap border-b border-[var(--dx-line-soft)] pb-3">
                          <div>
                            <h4 className="text-sm font-extrabold text-[var(--dx-ink)]">
                              Confirmação Explícita Antes de Transmitir (Etapa
                              1F-B)
                            </h4>
                            <p className="text-xs text-[var(--dx-muted)]">
                              Revise atentamente os 7 itens obrigatórios abaixo.
                              Nenhuma transmissão é permitida sem a sua
                              confirmação explícita.
                            </p>
                          </div>
                          <span className="dx-pill is-ok">
                            Conferência: CONFERIDO_EXATO
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                          <div className="p-3 rounded-[10px] border border-[var(--dx-line)] bg-[var(--dx-soft)]">
                            <span className="text-[10px] font-bold uppercase text-[var(--dx-muted)] block">
                              1. Loja Selecionada
                            </span>
                            <b className="text-sm font-extrabold text-[var(--dx-ink)] block mt-0.5">
                              {empresaNome}
                            </b>
                            <span className="text-[10px] font-mono text-[var(--dx-muted)]">
                              ID: {empresaId}
                            </span>
                          </div>

                          <div className="p-3 rounded-[10px] border border-[var(--dx-line)] bg-[var(--dx-soft)]">
                            <span className="text-[10px] font-bold uppercase text-[var(--dx-muted)] block">
                              2. Conta Financeira
                            </span>
                            <b className="text-sm font-extrabold text-[var(--dx-ink)] block mt-0.5">
                              {contaFinanceiraAtivaObj?.descricao || '—'}
                            </b>
                            <span className="text-[10px] font-mono text-[var(--dx-muted)]">
                              Tipo: {contaFinanceiraAtivaObj?.tipo || '—'}
                            </span>
                          </div>

                          <div className="p-3 rounded-[10px] border border-[var(--dx-line)] bg-[var(--dx-soft)]">
                            <span className="text-[10px] font-bold uppercase text-[var(--dx-muted)] block">
                              3. Data dos Lançamentos
                            </span>
                            <b className="text-sm font-extrabold text-[var(--dx-ink)] block mt-0.5">
                              {
                                preparacaoValidacao1FA.filtros_operacionais
                                  .data_vencimento_original_br
                              }
                            </b>
                            <span className="text-[10px] font-mono text-[var(--dx-muted)]">
                              ISO:{' '}
                              {
                                preparacaoValidacao1FA.filtros_operacionais
                                  .data_vencimento_original_iso
                              }
                            </span>
                          </div>

                          <div className="p-3 rounded-[10px] border border-[var(--dx-ok)] bg-[var(--dx-ok-bg)]">
                            <span className="text-[10px] font-bold uppercase text-[var(--dx-ok)] block">
                              4. Conferência Bancária
                            </span>
                            <b className="text-sm font-extrabold text-[var(--dx-ok)] block mt-0.5">
                              {stoneConferenciaBancaria.status_codigo}
                            </b>
                            <span className="text-[10px] text-[var(--dx-ink)]">
                              Líquido:{' '}
                              {formatarCentavosBRL(
                                stoneTotaisFiltrados.valor_liquido_centavos
                              )}{' '}
                              (Dif. R$ 0,00)
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-xs">
                          <div className="p-3.5 rounded-[10px] border border-[var(--dx-ok)] bg-[var(--dx-soft)] flex items-center justify-between gap-3">
                            <div>
                              <span className="text-[10px] font-bold uppercase text-[var(--dx-ok)] block">
                                5. Lançamento 1 — Valor da Receita Bruta
                              </span>
                              <b className="text-base font-extrabold text-[var(--dx-ink)] block mt-0.5">
                                {formatarCentavosBRL(
                                  stoneTotaisFiltrados.valor_bruto_centavos
                                )}
                              </b>
                              <span className="text-[11px] text-[var(--dx-muted)]">
                                Categoria:{' '}
                                <b className="text-[var(--dx-ink)]">
                                  {categoriaReceitaAtivaObj?.nome || '—'}
                                </b>
                              </span>
                            </div>
                            <span className="dx-pill is-ok">RECEITA BRUTA</span>
                          </div>

                          <div className="p-3.5 rounded-[10px] border border-[var(--dx-warn)] bg-[var(--dx-soft)] flex items-center justify-between gap-3">
                            <div>
                              <span className="text-[10px] font-bold uppercase text-[var(--dx-warn)] block">
                                6 & 7. Lançamento 2 — Valor da Despesa MDR e
                                Categoria
                              </span>
                              <b className="text-base font-extrabold text-[var(--dx-ink)] block mt-0.5">
                                {formatarCentavosBRL(
                                  stoneTotaisFiltrados.desconto_mdr_ajustado_centavos
                                )}
                              </b>
                              <span className="text-[11px] text-[var(--dx-muted)]">
                                Categoria:{' '}
                                <b className="text-[var(--dx-ink)]">
                                  {categoriaDespesaMdrAtivaObj?.nome || '—'}
                                </b>
                              </span>
                            </div>
                            <span className="dx-pill is-warn">DESPESA MDR</span>
                          </div>
                        </div>

                        <label className="p-3 rounded-[10px] border border-[var(--dx-line)] bg-[var(--dx-soft)] flex items-start gap-2.5 cursor-pointer text-xs text-[var(--dx-ink)]">
                          <input
                            type="checkbox"
                            checked={checkboxConfirmacao1FB}
                            onChange={(e) =>
                              setCheckboxConfirmacao1FB(e.target.checked)
                            }
                            className="mt-0.5"
                          />
                          <span>
                            <b>Confirmo explicitamente</b> que revisei a Loja (
                            <b>{empresaNome}</b>), a Conta Financeira (
                            <b>{contaFinanceiraAtivaObj?.descricao}</b>), as
                            Categorias (<b>{categoriaReceitaAtivaObj?.nome}</b>{' '}
                            e <b>{categoriaDespesaMdrAtivaObj?.nome}</b>), o
                            Valor da Receita Bruta (
                            <b>
                              {formatarCentavosBRL(
                                stoneTotaisFiltrados.valor_bruto_centavos
                              )}
                            </b>
                            ), o Valor da Despesa MDR (
                            <b>
                              {formatarCentavosBRL(
                                stoneTotaisFiltrados.desconto_mdr_ajustado_centavos
                              )}
                            </b>
                            ), a Data dos Lançamentos (
                            <b>
                              {
                                preparacaoValidacao1FA.filtros_operacionais
                                  .data_vencimento_original_br
                              }
                            </b>
                            ) e o resultado da conferência bancária (
                            <code>CONFERIDO_EXATO</code>).
                          </span>
                        </label>

                        {erroTransmissao1FB && (
                          <div className="p-3 rounded-[10px] border border-[var(--dx-bad)] bg-[var(--dx-bad-bg)] text-xs text-[var(--dx-bad)] flex items-center gap-2">
                            <XCircle size={15} className="flex-shrink-0" />
                            <b>{erroTransmissao1FB}</b>
                          </div>
                        )}

                        <div className="flex items-center justify-end gap-2.5 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setExibirConfirmacao1FB(false)
                              setCheckboxConfirmacao1FB(false)
                            }}
                            className="dx-btn"
                          >
                            Cancelar Revisão
                          </button>
                          <button
                            type="button"
                            disabled={
                              !checkboxConfirmacao1FB ||
                              transmitindo1FB ||
                              !avaliacaoEstadoTransmissaoGrupoAtivo1FB.podeIniciarConfirmacaoOuReenvio
                            }
                            onClick={handleExecutarTransmissaoControlada1FB}
                            className={`dx-btn is-primary ${
                              !checkboxConfirmacao1FB ||
                              transmitindo1FB ||
                              !avaliacaoEstadoTransmissaoGrupoAtivo1FB.podeIniciarConfirmacaoOuReenvio
                                ? 'opacity-50 cursor-not-allowed'
                                : ''
                            }`}
                          >
                            <ArrowRight size={14} />
                            <span>
                              {transmitindo1FB
                                ? 'Processando Fluxo Controlado (Etapa 1F-B)...'
                                : avaliacaoEstadoTransmissaoGrupoAtivo1FB.falhaParcialRetomavel
                                  ? 'Confirmar e Retomar Item Faltante (Etapa 1F-B)'
                                  : 'Confirmar e Executar Transmissão Controlada (Etapa 1F-B)'}
                            </span>
                          </button>
                        </div>
                      </div>
                    )}

                  {/* EXIBIÇÃO DO RESULTADO DA EXECUÇÃO DA ETAPA 1F-B */}
                  {resultadoTransmissao1FB && (
                    <div
                      className={`p-4 rounded-[12px] border space-y-3 ${
                        resultadoTransmissao1FB.situacao ===
                          'SUCESSO_COMPLETO' ||
                        resultadoTransmissao1FB.situacao ===
                          'JA_CONCLUIDO_IDEMPOTENTE'
                          ? 'border-[var(--dx-ok)] bg-[var(--dx-ok-bg)]'
                          : resultadoTransmissao1FB.situacao ===
                              'BLOQUEADO_TRAVA_SEGURANCA_ETAPA'
                            ? 'border-[var(--dx-accent)] bg-[var(--dx-soft)]'
                            : resultadoTransmissao1FB.situacao ===
                                'FALHA_PARCIAL_RETOMAVEL'
                              ? 'border-[var(--dx-warn)] bg-[var(--dx-soft)]'
                              : 'border-[var(--dx-bad)] bg-[var(--dx-bad-bg)]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="space-y-1">
                          <div className="text-xs font-extrabold text-[var(--dx-ink)] flex items-center gap-2">
                            <ShieldCheck size={16} />
                            <span>
                              Resultado da Execução da Etapa 1F-B:{' '}
                              <code>{resultadoTransmissao1FB.situacao}</code>
                            </span>
                          </div>
                          <p className="text-xs text-[var(--dx-ink)]">
                            {resultadoTransmissao1FB.mensagem}
                          </p>
                        </div>
                        <span
                          className={`dx-pill ${
                            resultadoTransmissao1FB.transmissao_real_habilitada
                              ? 'is-ok'
                              : 'is-accent'
                          }`}
                        >
                          {resultadoTransmissao1FB.transmissao_real_habilitada
                            ? 'Envio Real Habilitado'
                            : 'Trava de Segurança Ativa (0 Escritas na Conta Azul)'}
                        </span>
                      </div>

                      {(resultadoTransmissao1FB.receita_bruta ||
                        resultadoTransmissao1FB.despesa_mdr) && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pt-2">
                          {[
                            resultadoTransmissao1FB.receita_bruta,
                            resultadoTransmissao1FB.despesa_mdr,
                          ].map((itemRes) => {
                            if (!itemRes) return null
                            return (
                              <div
                                key={itemRes.papel}
                                className="p-3 rounded-[10px] border border-[var(--dx-line)] bg-[var(--dx-surface)] text-xs space-y-1.5"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <b className="text-[var(--dx-ink)]">
                                    {itemRes.papel === 'RECEITA_BRUTA'
                                      ? '1. Receita Bruta (Receitas de Vendas)'
                                      : '2. Despesa MDR (Tarifas de Cartão de Créditos)'}
                                  </b>
                                  <span
                                    className={`dx-status ${
                                      itemRes.status ===
                                        'TRANSMITIDO_COM_SUCESSO' ||
                                      itemRes.status ===
                                        'JA_TRANSMITIDO_ANTERIORMENTE'
                                        ? 'is-ok'
                                        : itemRes.status ===
                                            'BLOQUEADO_TRAVA_ETAPA' ||
                                          itemRes.status ===
                                            'DISPENSADO_VALOR_ZERO'
                                          ? 'is-accent'
                                          : 'is-bad'
                                    }`}
                                  >
                                    {itemRes.status}
                                  </span>
                                </div>
                                <div className="text-[11px] text-[var(--dx-ink)]">
                                  {itemRes.mensagem}
                                </div>
                                <div className="flex items-center justify-between text-[10px] text-[var(--dx-muted)] font-mono pt-1 border-t border-[var(--dx-line-soft)]">
                                  <span>
                                    Valor:{' '}
                                    {formatarCentavosBRL(
                                      itemRes.valor_centavos
                                    )}
                                  </span>
                                  <span>
                                    UUID Parcela/Evento:{' '}
                                    {itemRes.conta_azul_parcela_id ||
                                      itemRes.conta_azul_evento_id ||
                                      'Não gerado (Trava/Pendente)'}
                                  </span>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* TABELA DE REGISTROS FILTRADOS DA PLANILHA STONE */}
              <div className="dx-panel">
                <div className="dx-panel-head">
                  <div>
                    <h3 className="dx-panel-title">
                      Registros Filtrados da Planilha Stone (
                      {stoneLinhasFiltradas.length} de {stoneLinhas.length}{' '}
                      linhas)
                    </h3>
                    <p className="dx-panel-sub">
                      Exibindo dados originais sem confundir Data da Venda, Data
                      de Vencimento e Data de Vencimento Original.
                    </p>
                  </div>
                  <span className="dx-indicator is-ok">
                    Chave Composta Anti-Duplicidade Ativa
                  </span>
                </div>

                <div className="dx-table-wrap overflow-x-auto">
                  <table className="dx-table is-auto">
                    <thead>
                      <tr>
                        <th>Linha</th>
                        <th>Venc. Original</th>
                        <th>Data Venda</th>
                        <th>Categoria</th>
                        <th>Bandeira</th>
                        <th>Produto</th>
                        <th>Stone ID / Parc.</th>
                        <th>Status</th>
                        <th className="is-right">Valor Bruto</th>
                        <th className="is-right">Desconto MDR</th>
                        <th className="is-right">Desc. Antecip.</th>
                        <th className="is-right">Valor Líquido</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stoneLinhasFiltradas.map((linha) => {
                        const ehAjuste = !linha.eh_venda_operacional
                        return (
                          <tr key={linha.chave_unica_composta}>
                            <td className="dx-cell-date">
                              #{linha.numero_linha_csv}
                            </td>
                            <td>
                              <span className="font-bold text-[var(--dx-ink)]">
                                {linha.data_vencimento_original_str}
                              </span>
                              {linha.data_vencimento_str !==
                                linha.data_vencimento_original_str && (
                                <span
                                  className="block text-[10px] text-[var(--dx-warn)]"
                                  title="Data de Vencimento difere da Data de Vencimento Original"
                                >
                                  Venc. Atual: {linha.data_vencimento_str}
                                </span>
                              )}
                            </td>
                            <td className="dx-cell-date">
                              {linha.data_venda_original_str || '—'}
                            </td>
                            <td>
                              <span
                                className={`dx-pill ${
                                  ehAjuste ? 'is-warn' : 'is-ok'
                                }`}
                              >
                                {linha.categoria}
                              </span>
                            </td>
                            <td className="font-semibold text-[var(--dx-ink)]">
                              {linha.bandeira}
                            </td>
                            <td>{linha.produto}</td>
                            <td>
                              <div className="dx-cell-name font-mono text-xs">
                                {linha.stone_id || 'SEM STONE ID'}
                              </div>
                              <span className="dx-cell-text">
                                Parcela {linha.numero_parcela}/
                                {linha.qtd_parcelas}
                              </span>
                            </td>
                            <td>
                              <span
                                className={`dx-status ${
                                  linha.status_classificado === 'PAGO'
                                    ? 'is-ok'
                                    : linha.status_classificado === 'ABERTO'
                                      ? 'is-warn'
                                      : 'is-accent'
                                }`}
                              >
                                {linha.ultimo_status}
                              </span>
                            </td>
                            <td className="is-right dx-cell-money">
                              <div>
                                {formatarCentavosBRL(linha.valor_bruto_centavos)}
                              </div>
                              <div className="text-[10px] text-[var(--dx-muted)] font-mono">
                                {formatarMicroBRL(linha.valor_bruto_micro, 6)}
                              </div>
                            </td>
                            <td className="is-right dx-cell-date">
                              <div>
                                {formatarCentavosBRL(
                                  linha.desconto_mdr_absoluto_centavos
                                )}
                              </div>
                              <div className="text-[10px] text-[var(--dx-muted)] font-mono">
                                {formatarMicroBRL(linha.desconto_mdr_micro, 6)}
                              </div>
                            </td>
                            <td className="is-right dx-cell-date">
                              {formatarCentavosBRL(
                                linha.desconto_antecipacao_absoluto_centavos
                              )}
                            </td>
                            <td className="is-right dx-cell-money">
                              <div>
                                {formatarCentavosBRL(
                                  linha.valor_liquido_centavos
                                )}
                              </div>
                              <div className="text-[10px] text-[var(--dx-muted)] font-mono">
                                {formatarMicroBRL(linha.valor_liquido_micro, 6)}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ABA 2: RECEBIMENTOS VIA PIX */}
      {abaAtiva === 'pix' && (
        <div className="dx-panel">
          <div className="dx-panel-head">
            <div>
              <h2 className="dx-panel-title">
                Frente 2 — Recebimentos via PIX e Triagem de Receitas Existentes
              </h2>
              <p className="dx-panel-sub">
                Identificação de PIX recebidos e distinção segura entre receitas
                já lançadas no Conta Azul e novas receitas.
              </p>
            </div>
            <span className="dx-indicator is-warn">
              Aguardando definição de regras operacionais
            </span>
          </div>

          <div className="dx-panel-section space-y-4">
            <div className="dx-alert">
              <Lock size={18} className="flex-shrink-0" />
              <div>
                <b>Trava de Governança Ativa para PIX</b>
                <p className="text-xs mt-0.5">
                  Conforme diretriz de arquitetura do DCX LINK, nenhuma regra
                  automática de criação ou baixa de PIX é executada antes da
                  definição operacional explícita pelo responsável pelo projeto.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-4 rounded-[14px] border border-[var(--dx-line)] bg-[var(--dx-soft)] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm text-[var(--dx-ink)]">
                    Cenário A: Receita Já Existe no CA
                  </span>
                  <span className="dx-status is-ok">Apenas Baixar</span>
                </div>
                <p className="text-xs text-[var(--dx-muted)] leading-relaxed">
                  Quando a venda já gerou parcela em aberto no Conta Azul e há
                  identificação segura da parcela, o sistema{' '}
                  <b>não cria nova receita</b>: apenas registra o recebimento
                  (baixa integral ou parcial) preservando o vínculo.
                </p>
              </div>

              <div className="p-4 rounded-[14px] border border-[var(--dx-line)] bg-[var(--dx-soft)] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm text-[var(--dx-ink)]">
                    Cenário B: Coincidência Valor + Data
                  </span>
                  <span className="dx-status is-warn">Conferência Manual</span>
                </div>
                <p className="text-xs text-[var(--dx-muted)] leading-relaxed">
                  Valor e data isoladamente <b>nunca autorizam baixa automática</b>
                  . Sempre que não houver identificador unívoco ou houver
                  múltiplos candidatos, o item vai para conferência manual.
                </p>
              </div>

              <div className="p-4 rounded-[14px] border border-[var(--dx-line)] bg-[var(--dx-soft)] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm text-[var(--dx-ink)]">
                    Cenário C: Receita Já Quitada
                  </span>
                  <span className="dx-status is-bad">Bloqueio Duplicidade</span>
                </div>
                <p className="text-xs text-[var(--dx-muted)] leading-relaxed">
                  Se a parcela correspondente já estiver quitada no Conta Azul ou
                  se a mesma amortização já tiver sido registrada, o motor de
                  idempotência bloqueia nova baixa.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ABA 3: OUTRAS MODALIDADES DE RECEBIMENTO */}
      {abaAtiva === 'outras' && (
        <div className="dx-panel">
          <div className="dx-panel-head">
            <div>
              <h2 className="dx-panel-title">
                Outras Modalidades de Recebimento (Expansão Modular)
              </h2>
              <p className="dx-panel-sub">
                Arquitetura preparada para incorporar gradualmente novas origens
                de receita sem alterar o núcleo financeiro.
              </p>
            </div>
            <span className="dx-indicator is-warn">Definição Gradual</span>
          </div>

          <div className="dx-panel-section">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[
                {
                  titulo: 'Transferências Bancárias (TED / DOC)',
                  desc: 'Identificação de créditos em conta corrente e vínculo com faturas ou contratos em aberto no Conta Azul.',
                  status: 'Planejado',
                },
                {
                  titulo: 'Boletos Liquidados & Cobranças',
                  desc: 'Conferência de liquidação de boletos com tratamento de tarifas bancárias, juros, multa e descontos.',
                  status: 'Planejado',
                },
                {
                  titulo: 'Recebimentos Parciais / Divididos',
                  desc: 'Suporte nativo a múltiplas amortizações para uma mesma parcela (ex: entrada em PIX + saldo em Cartão).',
                  status: 'Suportado na Fundação 1A',
                },
              ].map((mod, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-[14px] border border-[var(--dx-line)] bg-[var(--dx-soft)] flex flex-col justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="font-semibold text-sm text-[var(--dx-ink)]">
                        {mod.titulo}
                      </span>
                      <span className="dx-pill">{mod.status}</span>
                    </div>
                    <p className="text-xs text-[var(--dx-muted)] leading-relaxed">
                      {mod.desc}
                    </p>
                  </div>
                  <div className="text-[11px] font-semibold text-[var(--dx-muted)] flex items-center gap-1.5">
                    <ShieldCheck size={13} />
                    <span>Vínculo: Receita → Parcela → Baixa → Conta</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ABA 4: MESA DE CONFERÊNCIA & SIMULADOR MATEMÁTICO LOCAL (EM MEMÓRIA) */}
      {abaAtiva === 'conferencia' && (
        <div className="space-y-4">
          {/* Painel do Simulador Matemático em Memória */}
          <div className="dx-panel">
            <div className="dx-panel-head">
              <div>
                <h2 className="dx-panel-title">
                  Simulador Matemático Local (Fundação Etapa 1A — 100% em
                  Memória)
                </h2>
                <p className="dx-panel-sub">
                  Teste a conferência obrigatória{' '}
                  <b>VALOR BRUTO - TAXAS = VALOR LÍQUIDO</b>, separação por
                  natureza e triagem de receitas existentes sem gravar nada no
                  banco.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRestaurarExemplos}
                  className="dx-btn is-sm"
                >
                  <RefreshCw size={13} />
                  <span>Restaurar Exemplos</span>
                </button>
              </div>
            </div>

            <form onSubmit={handleAdicionarSimulacao} className="dx-filters">
              <div>
                <label className="dx-label">Natureza da Movimentação</label>
                <select
                  value={novaNatureza}
                  onChange={(e) =>
                    setNovaNatureza(
                      e.target.value as NaturezaMovimentacaoReceber
                    )
                  }
                  className="dx-control"
                >
                  <option value="LIQUIDACAO_VENDA_NORMAL">
                    Liquidação de Venda Normal
                  </option>
                  <option value="ANTECIPACAO_RECEBIVEIS">
                    Antecipação de Recebíveis (MDR + Antecip.)
                  </option>
                  <option value="ESTORNO_CANCELAMENTO">
                    Estorno / Cancelamento (Negativo)
                  </option>
                  <option value="AJUSTE_ALUGUEL_TARIFA">
                    Ajuste / Aluguel POS (Bruto R$ 0,00)
                  </option>
                </select>
              </div>

              <div>
                <label className="dx-label">NSU / Documento (Vínculo CA)</label>
                <input
                  type="text"
                  value={novoNsu}
                  onChange={(e) => setNovoNsu(e.target.value)}
                  placeholder="Ex: STN-908172 ou SEM-NSU"
                  className="dx-control"
                />
              </div>

              <div>
                <label className="dx-label">Valor Bruto (R$)</label>
                <input
                  type="text"
                  value={novoBrutoReais}
                  onChange={(e) => setNovoBrutoReais(e.target.value)}
                  className="dx-control"
                />
              </div>

              <div>
                <label className="dx-label">Taxa MDR / Tarifas (R$)</label>
                <input
                  type="text"
                  value={novaTaxaMdrReais}
                  onChange={(e) => setNovaTaxaMdrReais(e.target.value)}
                  className="dx-control"
                />
              </div>

              <div>
                <label className="dx-label">
                  Taxa Antecip. (R$) / Líquido (R$)
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    type="text"
                    value={novaTaxaAntecipacaoReais}
                    onChange={(e) =>
                      setNovaTaxaAntecipacaoReais(e.target.value)
                    }
                    title="Taxa de Antecipação (R$)"
                    placeholder="Antecip."
                    className="dx-control"
                  />
                  <input
                    type="text"
                    value={novoLiquidoReais}
                    onChange={(e) => setNovoLiquidoReais(e.target.value)}
                    title="Valor Líquido Informado (R$)"
                    placeholder="Líquido"
                    className="dx-control"
                  />
                </div>
              </div>

              <div className="dx-filters-go">
                <button type="submit" className="dx-btn is-primary is-lg">
                  <Plus size={15} />
                  <span>Testar Linha</span>
                </button>
              </div>
            </form>

            {/* Alerta se houver divergência matemática no lote */}
            {!resumoConsolidado.consistente && (
              <div className="px-5 pb-4">
                <div className="dx-alert">
                  <AlertTriangle size={18} className="flex-shrink-0" />
                  <div>
                    <b>
                      Confirmação Bloqueada — Inconsistência Matemática Detectada
                    </b>
                    <ul className="list-disc list-inside text-xs mt-1 space-y-0.5">
                      {resumoConsolidado.divergencias.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Tabela de Conferência das Movimentações e Triagem de Vínculo Conta Azul */}
          <div className="dx-panel">
            <div className="dx-panel-head">
              <div>
                <h3 className="dx-panel-title">
                  Mesa de Conferência por Movimentação e Triagem Conta Azul
                </h3>
                <p className="dx-panel-sub">
                  Validação individual de Bruto, Taxas, Líquido, Chave Anti-Duplicidade e nível de confiança com parcelas existentes.
                </p>
              </div>
              <span
                className={`dx-status ${
                  resumoConsolidado.consistente ? 'is-ok' : 'is-bad'
                }`}
              >
                {resumoConsolidado.consistente
                  ? 'Lote Íntegro (Liberado em Simulação)'
                  : 'Envio Bloqueado por Divergência'}
              </span>
            </div>

            <div className="dx-table-wrap overflow-x-auto">
              <table className="dx-table is-auto">
                <thead>
                  <tr>
                    <th>Data Receb.</th>
                    <th>Origem / NSU</th>
                    <th>Natureza</th>
                    <th className="is-right">Valor Bruto</th>
                    <th className="is-right">Taxas</th>
                    <th className="is-right">Valor Líquido</th>
                    <th>Equação Matemática</th>
                    <th>Triagem Receita Conta Azul</th>
                    <th className="is-center">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {itensSimulados.map((item) => {
                    const val = validarMovimentacaoReceber(item)
                    const matchCA = avaliarCorrespondenciaReceitaExistente(
                      item,
                      PARCELAS_CA_MEMORIA
                    )
                    const chaveDedup = gerarChaveDedupMovimentacaoReceber(item)

                    return (
                      <tr key={item.id_interno || chaveDedup}>
                        <td className="dx-cell-date">
                          {formatarDataBR(item.data_recebimento)}
                        </td>
                        <td>
                          <div className="dx-cell-name">
                            {item.origem} · {item.bandeira || 'PADRÃO'}
                          </div>
                          <span className="dx-cell-text">
                            NSU: {item.nsu_tid || '—'}
                          </span>
                        </td>
                        <td>
                          <span className="dx-pill">
                            {item.natureza.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="is-right dx-cell-money">
                          {formatarCentavosBRL(item.valor_bruto_centavos)}
                        </td>
                        <td className="is-right dx-cell-date">
                          {formatarCentavosBRL(item.taxa_total_centavos)}
                        </td>
                        <td className="is-right dx-cell-money">
                          {formatarCentavosBRL(item.valor_liquido_centavos)}
                        </td>
                        <td>
                          <span
                            className={`dx-status ${
                              val.valido ? 'is-ok' : 'is-bad'
                            }`}
                          >
                            {val.valido ? 'Bruto - Taxa = Líquido' : 'Divergente'}
                          </span>
                          {!val.valido && (
                            <p
                              className="dx-status-error"
                              title={val.mensagem}
                            >
                              {val.mensagem}
                            </p>
                          )}
                        </td>
                        <td>
                          <span
                            className={`dx-status ${
                              matchCA.autoriza_baixa_automatica
                                ? 'is-ok'
                                : matchCA.acao_recomendada ===
                                    'REQUER_CONFERENCIA_MANUAL'
                                  ? 'is-warn'
                                  : 'is-muted'
                            }`}
                            title={matchCA.motivo}
                          >
                            {matchCA.acao_recomendada ===
                            'BAIXAR_PARCELA_EXISTENTE_AUTOMATICO'
                              ? `Baixar Parcela (${matchCA.parcela_candidata_id})`
                              : matchCA.acao_recomendada ===
                                  'REQUER_CONFERENCIA_MANUAL'
                                ? 'Conferência Manual (Valor+Data)'
                                : 'Criar Receita + Baixar'}
                          </span>
                        </td>
                        <td className="is-center">
                          <button
                            type="button"
                            onClick={() =>
                              handleRemoverItemSimulado(item.id_interno)
                            }
                            className="dx-btn-icon"
                            title="Remover linha simulada"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Simulador Rápido de Baixas Parciais / Divididas na Mesma Parcela */}
            <div className="dx-bar">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-[var(--dx-ink)]">
                  Teste de Recebimento Parcial/Múltiplo na Mesma Parcela:
                </span>
                <label className="text-xs text-[var(--dx-muted)] flex items-center gap-1">
                  Saldo em Aberto (R$):
                  <input
                    type="text"
                    value={saldoParcelaSimReais}
                    onChange={(e) => setSaldoParcelaSimReais(e.target.value)}
                    className="dx-control !w-24 !h-7 !text-xs"
                  />
                </label>
                <label className="text-xs text-[var(--dx-muted)] flex items-center gap-1">
                  Valor desta Baixa (R$):
                  <input
                    type="text"
                    value={valorBaixaSimReais}
                    onChange={(e) => setValorBaixaSimReais(e.target.value)}
                    className="dx-control !w-24 !h-7 !text-xs"
                  />
                </label>
              </div>
              {resultadoBaixaParcialSim && (
                <div className="flex items-center gap-2">
                  <span
                    className={`dx-status ${
                      resultadoBaixaParcialSim.permitido ? 'is-ok' : 'is-bad'
                    }`}
                  >
                    {resultadoBaixaParcialSim.tipo_baixa}
                  </span>
                  <span className="text-xs text-[var(--dx-muted)]">
                    {resultadoBaixaParcialSim.mensagem}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
