"use client"

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Trash2, Upload, Search, Calendar, RefreshCw, ChevronDown, ChevronLeft, ChevronRight,
  ArrowRightLeft, Sparkles, Edit2, X, Paperclip, FileText, Send,
  Copy, CheckCircle2, ArrowDownRight, ArrowUpRight, TrendingUp, TrendingDown, Clock, ShieldCheck, Wallet, Plus, Barcode
} from 'lucide-react'
import toast from 'react-hot-toast'
import ModalAgendamento from '@/components/agendamento/ModalAgendamento'
import ModalTransferencia from '@/components/agendamento/ModalTransferencia'
import ModalDetalhesLancamentos from '@/components/agendamento/ModalDetalhesLancamentos'
import ModalTransferirLancamento from '@/components/agendamento/ModalTransferirLancamento'
import ModalEdicaoEmMassa from '@/components/agendamento/ModalEdicaoEmMassa'
import InputMoeda from '@/components/ui/InputMoeda'
import SelectorCategoria from '@/components/upload/SelectorCategoria'
import SelectorContaFinanceira, { ContaFinanceiraOpcao } from '@/components/upload/SelectorContaFinanceira'
import SelectorFornecedor from '@/components/upload/SelectorFornecedor'
import { useEmpresa } from '@/contexts/EmpresaContext'
import { Empresa } from '@/types'
import { normalizarNome } from '@/lib/parsers/fornecedores-contaazul'
import { visualizarAnexo, cn, formatarDocumentoFiscal } from '@/lib/utils'

interface LojaCardProps {
  empresa: Empresa
  lojasDoGrupo: Empresa[]
  refreshTick?: number
  onTransferenciaGlobal?: () => void
  onPeriodoChange?: (lojaId: string, dataInicio: string, dataFim: string) => void
  onLojaRemovida?: () => void
}

export default function LojaCard({ empresa, lojasDoGrupo, refreshTick, onTransferenciaGlobal, onPeriodoChange, onLojaRemovida }: LojaCardProps) {
  const supabase = createClient()
  const router = useRouter()
  const { setEmpresaAtiva } = useEmpresa()
  const hoje = new Date().toISOString().split('T')[0]
  const [dataInicio, setDataInicio] = useState(hoje)
  const [dataFim, setDataFim] = useState(hoje)

  useEffect(() => {
    onPeriodoChange?.(empresa.id, dataInicio, dataFim)
  }, [empresa.id, dataInicio, dataFim])

  const [pagamentos, setPagamentos] = useState<any[]>([])
  const [carregando, setCarregando] = useState(false)
  const [importando, setImportando] = useState(false)

  const [modalFolhaAberto, setModalFolhaAberto] = useState(false)
  const [arquivoFolha, setArquivoFolha] = useState<File | null>(null)
  const [vencimentoFolha, setVencimentoFolha] = useState(hoje)

  const [menuImportarAberto, setMenuImportarAberto] = useState(false)
  const [menuExcluirAberto, setMenuExcluirAberto] = useState(false)
  const [modalAgendamentoAberto, setModalAgendamentoAberto] = useState(false)
  const [modalTransferenciaAberto, setModalTransferenciaAberto] = useState(false)

  const [modalEdicaoAberto, setModalEdicaoAberto] = useState(false)
  const [itemEditando, setItemEditando] = useState<any>(null)

  const [modalDetalhesDda, setModalDetalhesDda] = useState(false)
  const [modalDetalhesFolha, setModalDetalhesFolha] = useState(false)
  const [modalDetalhesAgendamentos, setModalDetalhesAgendamentos] = useState(false)
  const [itemCodigoBarras, setItemCodigoBarras] = useState<any | null>(null)
  const [selecionadosIndividuais, setSelecionadosIndividuais] = useState<string[]>([])
  const [buscaLocal, setBuscaLocal] = useState('')

  const toggleItemIndividual = (id: string) => {
    setSelecionadosIndividuais(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  const toggleSelecionarTodosIndividuais = () => {
    const idsValidos = pagamentosIndividuaisFiltrados
      .filter(p => p.origem !== 'Transferência' && p.origem !== 'Transferência Recebida')
      .map(p => p.id)
    if (idsValidos.length === 0) return

    const todosJa = idsValidos.every(id => selecionadosIndividuais.includes(id))
    if (todosJa) {
      setSelecionadosIndividuais([])
    } else {
      setSelecionadosIndividuais(idsValidos)
    }
  }
  const [editandoCategoriaEdicao, setEditandoCategoriaEdicao] = useState(false)
  const [editandoContaEdicao, setEditandoContaEdicao] = useState(false)
  const [editandoFornecedorEdicao, setEditandoFornecedorEdicao] = useState(false)
  const [contasFinanceiras, setContasFinanceiras] = useState<ContaFinanceiraOpcao[]>([])
  
  const [modalAcoesAberto, setModalAcoesAberto] = useState(false)
  const [itemAcoes, setItemAcoes] = useState<any | null>(null)

  function abrirAcoesLancamento(item: any) {
    setItemAcoes(item)
    setModalAcoesAberto(true)
  }

  const [categoriasCA, setCategoriasCA] = useState<string[]>([])
  const [mapaCnpjFornecedores, setMapaCnpjFornecedores] = useState<Record<string, string>>({})

  useEffect(() => {
    Promise.all([
      fetch(`/api/conta-azul/contas-financeiras?empresa_id=${empresa.id}`)
        .then(r => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch(`/api/conta-azul/categorias?empresa_id=${empresa.id}`)
        .then(r => (r.ok ? r.json() : null))
        .catch(() => null),
    ])
      .then(([contasData, catsData]) => {
        if (contasData?.contas && Array.isArray(contasData.contas)) setContasFinanceiras(contasData.contas)
        if (catsData?.categorias && Array.isArray(catsData.categorias)) {
          setCategoriasCA(catsData.categorias.map((c: any) => c.nome))
        }
      })
      .catch(() => {})
  }, [empresa.id])

  const [modalTransferirAberto, setModalTransferirAberto] = useState(false)
  const [itensParaTransferir, setItensParaTransferir] = useState<any[]>([])
  const [transferindoLancamento, setTransferindoLancamento] = useState(false)

  const [modalEdicaoMassaAberto, setModalEdicaoMassaAberto] = useState(false)
  const [itensEdicaoMassa, setItensEdicaoMassa] = useState<any[]>([])
  const [salvandoEdicaoMassa, setSalvandoEdicaoMassa] = useState(false)

  const [periodoAtivo, setPeriodoAtivo] = useState('hoje')
  const [menuPeriodoAberto, setMenuPeriodoAberto] = useState(false)

  const [saldoCaixa, setSaldoCaixa] = useState<number>(Number(empresa.saldo_caixa) || 0)
  const [saldoCaixaPendente, setSaldoCaixaPendente] = useState<number>(Number(empresa.saldo_caixa) || 0)
  const [salvandoSaldo, setSalvandoSaldo] = useState(false)

  useEffect(() => {
    const v = Number(empresa.saldo_caixa) || 0
    setSaldoCaixa(v)
    setSaldoCaixaPendente(v)
  }, [empresa.id, empresa.saldo_caixa])

  async function handleSalvarSaldoCaixa() {
    if (saldoCaixaPendente === saldoCaixa) return
    setSalvandoSaldo(true)
    try {
      const { error } = await supabase.from('empresas').update({ saldo_caixa: saldoCaixaPendente }).eq('id', empresa.id)
      if (error) throw error
      setSaldoCaixa(saldoCaixaPendente)
      toast.success('Saldo em caixa atualizado!')
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar saldo em caixa')
      setSaldoCaixaPendente(saldoCaixa)
    } finally {
      setSalvandoSaldo(false)
    }
  }

  useEffect(() => {
    carregarPagamentos()
  }, [empresa.id, dataInicio, dataFim, refreshTick])

  const OPCOES_PERIODO: { key: string; label: string }[] = [
    { key: 'hoje', label: 'Hoje' },
    { key: 'semana', label: 'Esta semana' },
    { key: 'mes', label: 'Este mês' },
    { key: 'ano', label: 'Este ano' },
    { key: '30dias', label: 'Últimos 30 dias' },
    { key: '12meses', label: 'Últimos 12 meses' },
    { key: 'tudo', label: 'Todo o período' },
    { key: 'personalizado', label: 'Período personalizado' },
  ]

  function fmtISO(d: Date) {
    return d.toISOString().split('T')[0]
  }

  function aplicarPeriodo(key: string) {
    if (key === 'personalizado') {
      setPeriodoAtivo(key)
      setMenuPeriodoAberto(false)
      return
    }

    const agora = new Date()
    let novoInicio = dataInicio
    let novoFim = dataFim

    if (key === 'hoje') {
      novoInicio = novoFim = fmtISO(agora)
    } else if (key === 'semana') {
      const diaSemana = agora.getDay()
      const diff = diaSemana === 0 ? -6 : 1 - diaSemana
      const seg = new Date(agora)
      seg.setDate(agora.getDate() + diff)
      const dom = new Date(seg)
      dom.setDate(seg.getDate() + 6)
      novoInicio = fmtISO(seg)
      novoFim = fmtISO(dom)
    } else if (key === 'mes') {
      novoInicio = fmtISO(new Date(agora.getFullYear(), agora.getMonth(), 1))
      novoFim = fmtISO(new Date(agora.getFullYear(), agora.getMonth() + 1, 0))
    } else if (key === 'ano') {
      novoInicio = fmtISO(new Date(agora.getFullYear(), 0, 1))
      novoFim = fmtISO(new Date(agora.getFullYear(), 11, 31))
    } else if (key === '30dias') {
      const passado = new Date(agora)
      passado.setDate(agora.getDate() - 30)
      novoInicio = fmtISO(passado)
      novoFim = fmtISO(agora)
    } else if (key === '12meses') {
      const passado = new Date(agora)
      passado.setFullYear(agora.getFullYear() - 1)
      novoInicio = fmtISO(passado)
      novoFim = fmtISO(agora)
    } else if (key === 'tudo') {
      novoInicio = '2000-01-01'
      novoFim = '2099-12-31'
    }

    setDataInicio(novoInicio)
    setDataFim(novoFim)
    setPeriodoAtivo(key)
    setMenuPeriodoAberto(false)
  }

  function labelPeriodoAtivo() {
    return dataInicio === dataFim
      ? dataInicio.split('-').reverse().join('/')
      : `${dataInicio.split('-').reverse().join('/')} até ${dataFim.split('-').reverse().join('/')}`
  }

  function parseDataLocal(s: string) {
    const [y, m, d] = s.split('-').map(Number)
    return new Date(y, m - 1, d)
  }

  function navegarPeriodoAnterior() {
    if (periodoAtivo === 'hoje' || dataInicio === dataFim) {
      const d = parseDataLocal(dataInicio)
      d.setDate(d.getDate() - 1)
      const iso = fmtISO(d)
      setDataInicio(iso)
      setDataFim(iso)
      setPeriodoAtivo('hoje')
    } else if (periodoAtivo === 'semana') {
      const dIni = parseDataLocal(dataInicio)
      const dFim = parseDataLocal(dataFim)
      dIni.setDate(dIni.getDate() - 7)
      dFim.setDate(dFim.getDate() - 7)
      setDataInicio(fmtISO(dIni))
      setDataFim(fmtISO(dFim))
    } else if (periodoAtivo === 'mes') {
      const dIni = parseDataLocal(dataInicio)
      dIni.setMonth(dIni.getMonth() - 1)
      dIni.setDate(1)
      const dFim = new Date(dIni.getFullYear(), dIni.getMonth() + 1, 0)
      setDataInicio(fmtISO(dIni))
      setDataFim(fmtISO(dFim))
    } else if (periodoAtivo === 'ano') {
      const dIni = parseDataLocal(dataInicio)
      dIni.setFullYear(dIni.getFullYear() - 1)
      dIni.setMonth(0)
      dIni.setDate(1)
      const dFim = new Date(dIni.getFullYear(), 11, 31)
      setDataInicio(fmtISO(dIni))
      setDataFim(fmtISO(dFim))
    } else if (periodoAtivo === '30dias') {
      const dIni = parseDataLocal(dataInicio)
      const dFim = parseDataLocal(dataFim)
      dIni.setDate(dIni.getDate() - 30)
      dFim.setDate(dFim.getDate() - 30)
      setDataInicio(fmtISO(dIni))
      setDataFim(fmtISO(dFim))
    } else {
      const dIni = parseDataLocal(dataInicio)
      const dFim = parseDataLocal(dataFim)
      dIni.setDate(dIni.getDate() - 1)
      dFim.setDate(dFim.getDate() - 1)
      setDataInicio(fmtISO(dIni))
      setDataFim(fmtISO(dFim))
    }
  }

  function navegarPeriodoProximo() {
    if (periodoAtivo === 'hoje' || dataInicio === dataFim) {
      const d = parseDataLocal(dataInicio)
      d.setDate(d.getDate() + 1)
      const iso = fmtISO(d)
      setDataInicio(iso)
      setDataFim(iso)
      setPeriodoAtivo('hoje')
    } else if (periodoAtivo === 'semana') {
      const dIni = parseDataLocal(dataInicio)
      const dFim = parseDataLocal(dataFim)
      dIni.setDate(dIni.getDate() + 7)
      dFim.setDate(dFim.getDate() + 7)
      setDataInicio(fmtISO(dIni))
      setDataFim(fmtISO(dFim))
    } else if (periodoAtivo === 'mes') {
      const dIni = parseDataLocal(dataInicio)
      dIni.setMonth(dIni.getMonth() + 1)
      dIni.setDate(1)
      const dFim = new Date(dIni.getFullYear(), dIni.getMonth() + 1, 0)
      setDataInicio(fmtISO(dIni))
      setDataFim(fmtISO(dFim))
    } else if (periodoAtivo === 'ano') {
      const dIni = parseDataLocal(dataInicio)
      dIni.setFullYear(dIni.getFullYear() + 1)
      dIni.setMonth(0)
      dIni.setDate(1)
      const dFim = new Date(dIni.getFullYear(), 11, 31)
      setDataInicio(fmtISO(dIni))
      setDataFim(fmtISO(dFim))
    } else if (periodoAtivo === '30dias') {
      const dIni = parseDataLocal(dataInicio)
      const dFim = parseDataLocal(dataFim)
      dIni.setDate(dIni.getDate() + 30)
      dFim.setDate(dFim.getDate() + 30)
      setDataInicio(fmtISO(dIni))
      setDataFim(fmtISO(dFim))
    } else {
      const dIni = parseDataLocal(dataInicio)
      const dFim = parseDataLocal(dataFim)
      dIni.setDate(dIni.getDate() + 1)
      dFim.setDate(dFim.getDate() + 1)
      setDataInicio(fmtISO(dIni))
      setDataFim(fmtISO(dFim))
    }
  }

  // Colunas leves de agendamentos para não trafegar anexos pesados (PDFs em Base64) na abertura da tela
  const COLUNAS_AGENDAMENTOS_LEVES = [
    'id', 'empresa_id', 'tipo', 'ativo', 'acao', 'horario', 'dias_semana', 'periodo_dias',
    'tipo_periodo', 'situacao', 'status_pagamento', 'local_pagamento', 'filtro_tipo_itens',
    'ultima_execucao', 'ultimo_status', 'ultimo_log', 'created_at', 'updated_at',
    'fornecedor', 'valor', 'data_vencimento', 'status', 'descricao', 'chave_pix',
    'cpf_cnpj', 'categoria', 'conta_pagamento', 'competencia', 'transferencia_id',
    'data_pagamento', 'codigo_barras', 'data_lancamento'
  ].join(', ')

  async function handleAbrirAnexo(item: any) {
    if (!item?.anexo_url) return

    // Se já tiver a URL ou Base64 carregado na memória, abre diretamente
    if (item.anexo_url !== 'lazy') {
      visualizarAnexo(item.anexo_url)
      return
    }

    // Busca sob demanda o conteúdo do anexo apenas para o registro clicado
    toast.loading('Carregando anexo...', { id: `anexo-${item.id}` })
    try {
      const { data, error } = await supabase
        .from('agendamentos')
        .select('anexo_url')
        .eq('id', item.id)
        .single()

      if (error || !data?.anexo_url) {
        toast.error('Anexo não encontrado', { id: `anexo-${item.id}` })
        return
      }

      toast.dismiss(`anexo-${item.id}`)
      
      // Guarda em cache na memória do item para não precisar baixar novamente se o usuário clicar de novo
      setPagamentos(prev => prev.map(p => p.id === item.id ? { ...p, anexo_url: data.anexo_url } : p))
      if (itemEditando && itemEditando.id === item.id) {
        setItemEditando({ ...itemEditando, anexo_url: data.anexo_url })
      }
      if (itemAcoes && itemAcoes.id === item.id) {
        setItemAcoes({ ...itemAcoes, anexo_url: data.anexo_url })
      }

      visualizarAnexo(data.anexo_url)
    } catch (err: any) {
      toast.error('Erro ao abrir anexo', { id: `anexo-${item.id}` })
    }
  }

  async function carregarPagamentos() {
    setCarregando(true)

    // Busca DDA e agendamentos leves (sem o Base64 pesado) em paralelo com Promise.all
    const [{ data: ddas }, { data: agendamentos }, { data: anexosIds }] = await Promise.all([
      supabase
        .from('pagamentos_dda')
        .select('*')
        .eq('empresa_id', empresa.id),
      supabase
        .from('agendamentos')
        .select(COLUNAS_AGENDAMENTOS_LEVES)
        .eq('empresa_id', empresa.id),
      supabase
        .from('agendamentos')
        .select('id')
        .eq('empresa_id', empresa.id)
        .not('anexo_url', 'is', null),
    ])

    // Mapeia quais IDs possuem anexo sem precisar baixar 25MB de Base64
    const setIdsComAnexo = new Set(((anexosIds as any[]) || []).map(x => x.id))

    // Filtra no frontend para garantir resiliencia contra campos nulos de data
    const ddasFiltrados = (ddas || []).filter(d => {
      const dt = d.data_pagamento || d.data_vencimento
      if (!dt) return true
      return dt >= dataInicio && dt <= dataFim
    })

    const listaAgendamentos = (agendamentos as any[] || [])
    const agendFiltrados = listaAgendamentos.filter(a => {
      const dt = a.data_pagamento || a.data_vencimento
      if (!dt) return true
      return dt >= dataInicio && dt <= dataFim
    })

    const unificados = [
      ...ddasFiltrados.map(d => ({ ...d, origem: 'DDA' })),
      ...agendFiltrados.map(f => ({
        ...f,
        anexo_url: setIdsComAnexo.has(f.id) ? 'lazy' : null,
        origem: f.tipo === 'Transferência'
          ? 'Transferência'
          : f.tipo === 'Transferência Recebida'
          ? 'Transferência Recebida'
          : (f.tipo?.includes('Folha') ? 'Folha' : 'Agendamento')
      }))
    ].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())

    setPagamentos(unificados)
    setCarregando(false)

    // Busca CNPJs de fornecedores para itens que não possuem cpf_cnpj gravado
    const nomesSemDoc = unificados
      .filter(p => !p.cpf_cnpj && (p.fornecedor || p.beneficiario))
      .map(p => normalizarNome(p.fornecedor || p.beneficiario))
      .filter(Boolean)

    const nomesUnicos = Array.from(new Set(nomesSemDoc))
    if (nomesUnicos.length > 0) {
      try {
        const { data: fornsData } = await supabase
          .from('fornecedores_contaazul')
          .select('nome_normalizado, cnpj')
          .eq('empresa_id', empresa.id)
          .in('nome_normalizado', nomesUnicos)
          .not('cnpj', 'is', null)

        if (fornsData && fornsData.length > 0) {
          const mapa: Record<string, string> = {}
          fornsData.forEach((f: any) => {
            if (f.nome_normalizado && f.cnpj) {
              mapa[f.nome_normalizado] = f.cnpj
            }
          })
          setMapaCnpjFornecedores(prev => ({ ...prev, ...mapa }))
        }
      } catch (errForn) {
        console.warn('Aviso ao carregar CNPJs de fornecedores:', errForn)
      }
    }
  }

  async function handleImportarArquivo(e: React.ChangeEvent<HTMLInputElement>, tipo: 'dda' | 'folha') {
    const file = e.target.files?.[0]
    if (!file) return

    if (tipo === 'folha') {
      setArquivoFolha(file)
      setMenuImportarAberto(false)
      setModalFolhaAberto(true)
      return
    }

    await processarArquivo(file, 'dda')
  }

  async function buscarCategoriasAprendidas(): Promise<Map<string, string>> {
    const mapa = new Map<string, string>()
    try {
      // 1. Prioridade A: Categorias aprendidas em fornecedores_contaazul (mesma base do Contas a Pagar)
      const { data: caData } = await supabase
        .from('fornecedores_contaazul')
        .select('nome_normalizado, categoria_padrao')
        .eq('empresa_id', empresa.id)
        .not('categoria_padrao', 'is', null)
      ;(caData || []).forEach((f: any) => {
        if (f.nome_normalizado && f.categoria_padrao) {
          mapa.set(f.nome_normalizado, f.categoria_padrao)
        }
      })

      // 2. Prioridade B: Regras do motor De-Para de Fornecedores
      const { data: deparaData } = await supabase
        .from('fornecedor_depara')
        .select('nome_original_normalizado, categoria_padrao')
        .eq('empresa_id', empresa.id)
        .not('categoria_padrao', 'is', null)
      ;(deparaData || []).forEach((d: any) => {
        if (d.nome_original_normalizado && d.categoria_padrao && !mapa.has(d.nome_original_normalizado)) {
          mapa.set(d.nome_original_normalizado, d.categoria_padrao)
        }
      })
    } catch (err) {
      console.error('Erro ao carregar categorias aprendidas:', err)
    }
    return mapa
  }

  async function aprenderCategoriaPorFornecedor(nomeFornecedor: string, categoria: string) {
    if (!nomeFornecedor || !categoria) return
    const norm = normalizarNome(nomeFornecedor)
    try {
      await supabase
        .from('fornecedores_contaazul')
        .upsert({
          empresa_id: empresa.id,
          nome: nomeFornecedor,
          nome_normalizado: norm,
          categoria_padrao: categoria,
        }, { onConflict: 'empresa_id,nome_normalizado' })
    } catch (err) {
      console.error('Erro ao salvar categoria aprendida:', err)
    }
  }

  async function processarArquivo(file: File, tipo: 'dda' | 'folha', vencimentoEspecifico?: string) {
    setImportando(true)
    const toastId = `import-${empresa.id}`
    const ehExcel = file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')
    toast.loading(ehExcel ? 'Processando planilha Excel DDA...' : 'Enviando arquivo e extraindo dados com IA...', { id: toastId })
    setMenuImportarAberto(false)
    setModalFolhaAberto(false)

    let etapa = 1
    const intervaloProgress = setInterval(() => {
      etapa++
      if (etapa === 2) {
        toast.loading(ehExcel ? 'Lendo linhas da tabela de boletos DDA...' : 'Gemini analisando o documento e extraindo dados...', { id: toastId })
      } else if (etapa === 3) {
        toast.loading('Enriquecendo dados (consultando CNPJs na Brasil API)...', { id: toastId })
      } else if (etapa === 4) {
        toast.loading('Processando dados e preparando gravação...', { id: toastId })
      } else if (etapa >= 5) {
        toast.loading('Salvando lançamentos no banco de dados...', { id: toastId })
      }
    }, ehExcel ? 1500 : 4500)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('tipo', tipo)

    try {
      const res = await fetch('/api/conversor', {
        method: 'POST',
        body: formData
      })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error || 'Erro na conversão')

      const extraidos = data.dados
      if (!extraidos || !Array.isArray(extraidos)) throw new Error('Formato retornado inválido')

      clearInterval(intervaloProgress)
      toast.loading('Gravando dados no banco Supabase...', { id: toastId })

      const categoriasAprendidas = tipo === 'dda' ? await buscarCategoriasAprendidas() : new Map<string, string>()

      let menorDataExt = ''
      let maiorDataExt = ''
      const dataInclusaoHoje = new Date().toISOString().split('T')[0]

      if (tipo === 'dda') {
        const registros = extraidos.map(item => {
          const nomeNorm = normalizarNome(item.beneficiario || '')
          const categoriaAprendida = categoriasAprendidas.get(nomeNorm)
          const categoriaFinal = categoriaAprendida || 'Material para Revenda'
          const dtVenc = item.data_vencimento || dataInicio

          const numDocValido = item.documento && item.documento !== 'S/N' ? item.documento : null
          const descricaoFinal = item.descricao || (numDocValido ? `Nº Documento: ${numDocValido}` : (item.beneficiario ? `Boleto - ${item.beneficiario}` : 'Boleto DDA'))

          return {
            empresa_id: empresa.id,
            beneficiario: item.beneficiario,
            documento: item.documento,
            valor: parseFloat(String(item.valor).replace(',', '.')),
            data_vencimento: dtVenc,
            data_pagamento: dataInicio || dataInclusaoHoje,
            categoria: categoriaFinal,
            codigo_barras: item.codigo_barras || null,
            descricao: descricaoFinal
          }
        })
        if (registros.length > 0) {
          const { error } = await supabase.from('pagamentos_dda').insert(registros)
          if (error) throw error
        }
      } else {
        const registros = extraidos.map(item => {
          let competencia = ''
          if (vencimentoEspecifico && data.tipoCalculo) {
            const [ano, mes, dia] = vencimentoEspecifico.split('-')
            const dateVenc = new Date(Number(ano), Number(mes) - 1, Number(dia))
            if (data.tipoCalculo === 'Folha Mensal') {
              dateVenc.setMonth(dateVenc.getMonth() - 1)
              competencia = dateVenc.toISOString().split('T')[0]
            } else if (data.tipoCalculo === 'Adiantamento') {
              dateVenc.setMonth(dateVenc.getMonth() + 1)
              dateVenc.setDate(1)
              competencia = dateVenc.toISOString().split('T')[0]
            }
          }

          const ehAdiantamento = (item.tipo || data.tipoCalculo) === 'Adiantamento'
          const dtVenc = vencimentoEspecifico || dataInicio

          return {
            empresa_id: empresa.id,
            fornecedor: item.fornecedor,
            tipo: item.tipo || data.tipoCalculo || 'Folha',
            categoria: ehAdiantamento ? 'Adiantamento Salarial' : 'Salários',
            valor: parseFloat(String(item.valor).replace(',', '.')),
            data_vencimento: dtVenc,
            data_pagamento: vencimentoEspecifico || dataInicio || dataInclusaoHoje,
            descricao: ehAdiantamento ? 'ADIANTAMENTO SALARIAL' : 'SALÁRIO',
            cpf_cnpj: item.cpf_cnpj,
            competencia: competencia
          }
        })
        if (registros.length > 0) {
          const { error } = await supabase.from('agendamentos').insert(registros)
          if (error) throw error
        }
      }

      toast.success(`${extraidos.length} pagamento(s) extraído(s) e salvo(s) com sucesso!`, { id: toastId })
      await carregarPagamentos()
    } catch (err: any) {
      clearInterval(intervaloProgress)
      toast.error(`Falha na extração: ${err.message || 'Erro ao processar arquivo'}`, { id: toastId, duration: 8000 })
    } finally {
      clearInterval(intervaloProgress)
      setImportando(false)
      const inputs = document.querySelectorAll(`input[type="file"][data-loja="${empresa.id}"]`)
      inputs.forEach(input => (input as HTMLInputElement).value = '')
    }
  }

  async function handleLimparRegistrosDoDia() {
    if (!confirm('Deseja excluir TODOS os registros de pagamentos deste período filtrado? Essa ação não pode ser desfeita.')) return

    toast.loading('Limpando registros...', { id: `delete-${empresa.id}` })
    try {
      await supabase.from('pagamentos_dda').delete().eq('empresa_id', empresa.id).gte('data_pagamento', dataInicio).lte('data_pagamento', dataFim)
      await supabase.from('agendamentos').delete().eq('empresa_id', empresa.id).gte('data_pagamento', dataInicio).lte('data_pagamento', dataFim)

      toast.success('Registros excluídos!', { id: `delete-${empresa.id}` })
      carregarPagamentos()
    } catch (e) {
      toast.error('Erro ao excluir registros.', { id: `delete-${empresa.id}` })
    }
  }

  async function handleRemoverLojaDoGrupo() {
    setMenuExcluirAberto(false)
    if (!confirm(`Remover "${empresa.nome}" deste grupo? A loja continua existindo no sistema e pode ser adicionada de volta depois.`)) return

    try {
      const { error } = await supabase.from('empresas').update({ grupo_id: null, grupo_adicionado_em: null }).eq('id', empresa.id)
      if (error) throw error
      toast.success(`"${empresa.nome}" removida do grupo.`)
      onLojaRemovida?.()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao remover loja do grupo')
    }
  }

  const { totalDespesas, totalEntradas, saldoFinalEstimado } = useMemo(() => {
    const despesas = pagamentos
      .filter(p => p.origem !== 'Transferência Recebida')
      .reduce((acc, curr) => acc + Number(curr.valor), 0)
    const entradas = pagamentos
      .filter(p => p.origem === 'Transferência Recebida')
      .reduce((acc, curr) => acc + Number(curr.valor), 0)
    const saldo = saldoCaixaPendente + entradas - despesas
    return { totalDespesas: despesas, totalEntradas: entradas, saldoFinalEstimado: saldo }
  }, [pagamentos, saldoCaixaPendente])

  const { pagamentosDda, pagamentosFolha, pagamentosIndividuais } = useMemo(() => {
    const dda = pagamentos.filter(p => p.origem === 'DDA')
    const folha = pagamentos.filter(
      p => p.origem === 'Folha' || p.tipo === 'Folha' || p.tipo === 'Folha Mensal' || p.tipo === 'Adiantamento'
    )
    const individuais = pagamentos
      .filter(
        p => p.origem !== 'DDA' && p.origem !== 'Folha' && p.origem !== 'Transferência Recebida' && !p.tipo?.includes('Folha') && p.tipo !== 'Adiantamento'
      )
      .sort((a, b) => (a.origem === 'Transferência' ? 1 : 0) - (b.origem === 'Transferência' ? 1 : 0))
    return { pagamentosDda: dda, pagamentosFolha: folha, pagamentosIndividuais: individuais }
  }, [pagamentos])

  function situacaoDoGrupo(itens: any[]) {
    if (itens.length === 0) {
      return { label: '—', classe: 'bg-dark-700/50 text-dark-300 border-dark-600' }
    }
    const agendados = itens.filter(i => i.status === 'agendado').length
    if (agendados === 0) {
      return { label: 'EM ABERTO', classe: 'bg-amber-500/10 text-amber-500 border-amber-500/20' }
    }
    if (agendados === itens.length) {
      return { label: 'AGENDADO', classe: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' }
    }
    return { label: 'PARCIAL', classe: 'bg-blue-500/10 text-blue-400 border-blue-500/20' }
  }

  const situacaoDda = useMemo(() => situacaoDoGrupo(pagamentosDda), [pagamentosDda])
  const situacaoFolha = useMemo(() => situacaoDoGrupo(pagamentosFolha), [pagamentosFolha])

  function categoriaDoGrupo(itens: any[]) {
    if (itens.length === 0) return '—'
    const categorias = new Set(itens.map(i => i.categoria || '—'))
    return categorias.size === 1 ? Array.from(categorias)[0] : 'Diverso'
  }

  const categoriaDda = useMemo(() => categoriaDoGrupo(pagamentosDda), [pagamentosDda])
  const categoriaFolha = useMemo(() => categoriaDoGrupo(pagamentosFolha), [pagamentosFolha])

  const termoBusca = buscaLocal.trim().toLowerCase()

  const pagamentosIndividuaisFiltrados = useMemo(() => {
    if (!termoBusca) return pagamentosIndividuais
    return pagamentosIndividuais.filter(p => {
      const fornecedor = (p.fornecedor || '').toLowerCase()
      const beneficiario = (p.beneficiario || '').toLowerCase()
      const descricao = (p.descricao || '').toLowerCase()
      const doc = (p.documento || '').toLowerCase()
      const conta = (p.conta_pagamento || '').toLowerCase()
      const categoria = (p.categoria || '').toLowerCase()
      const valorStr = String(p.valor || '')
      const valorFmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(Number(p.valor) || 0).toLowerCase()
      return (
        fornecedor.includes(termoBusca) ||
        beneficiario.includes(termoBusca) ||
        descricao.includes(termoBusca) ||
        doc.includes(termoBusca) ||
        conta.includes(termoBusca) ||
        categoria.includes(termoBusca) ||
        valorStr.includes(termoBusca) ||
        valorFmt.includes(termoBusca)
      )
    })
  }, [pagamentosIndividuais, termoBusca])

  const mostrarDda = pagamentosDda.length > 0 && (
    !termoBusca ||
    'dda'.includes(termoBusca) ||
    'lançamentos dda'.includes(termoBusca) ||
    categoriaDda.toLowerCase().includes(termoBusca)
  )

  const mostrarFolha = pagamentosFolha.length > 0 && (
    !termoBusca ||
    'folha'.includes(termoBusca) ||
    'salários'.includes(termoBusca) ||
    'salario'.includes(termoBusca) ||
    categoriaFolha.toLowerCase().includes(termoBusca)
  )

  function getEstiloVencimento(dataVencOuPg: string | null | undefined, status: string) {
    if (!dataVencOuPg) return { texto: 'text-slate-600 dark:text-dark-300', dot: 'bg-slate-400' }
    if (status === 'agendado') {
      return {
        texto: 'text-emerald-700 dark:text-emerald-400 font-semibold',
        dot: 'bg-emerald-500'
      }
    }
    if (dataVencOuPg < hoje) {
      return {
        texto: 'text-rose-600 dark:text-rose-400 font-bold',
        dot: 'bg-rose-500'
      }
    }
    if (dataVencOuPg === hoje) {
      return {
        texto: 'text-amber-600 dark:text-amber-400 font-bold',
        dot: 'bg-amber-500'
      }
    }
    return {
      texto: 'text-emerald-600 dark:text-emerald-400 font-semibold',
      dot: 'bg-emerald-500'
    }
  }

  const handleExcluirEmLote = async (ids: string[]) => {
    if (!confirm(`Excluir ${ids.length} lançamento(s)?`)) return
    toast.loading('Excluindo...', { id: `delete_lote-${empresa.id}` })
    try {
      const transferenciaIds = ids
        .map(id => pagamentos.find(p => p.id === id)?.transferencia_id)
        .filter((v): v is string => Boolean(v))

      await supabase.from('pagamentos_dda').delete().in('id', ids)
      await supabase.from('agendamentos').delete().in('id', ids)
      if (transferenciaIds.length > 0) {
        await supabase.from('agendamentos').delete().in('transferencia_id', transferenciaIds)
      }

      toast.success('Excluídos com sucesso', { id: `delete_lote-${empresa.id}` })
      carregarPagamentos()
      setModalDetalhesDda(false)
      setModalDetalhesFolha(false)
      if (transferenciaIds.length > 0) onTransferenciaGlobal?.()
    } catch (e) {
      toast.error('Erro ao excluir', { id: `delete_lote-${empresa.id}` })
    }
  }

  const handleAgendarEmLote = async (ids: string[]) => {
    if (!confirm(`Deseja alterar ${ids.length} itens para AGENDADO?`)) return
    try {
      await supabase.from('pagamentos_dda').update({ status: 'agendado' }).in('id', ids)
      await supabase.from('agendamentos').update({ status: 'agendado' }).in('id', ids)
      toast.success('Status atualizado para Agendado!')
      carregarPagamentos()
    } catch (e) {
      toast.error('Erro ao atualizar')
    }
  }

  const handleVoltarAbertoEmLote = async (ids: string[]) => {
    if (!confirm(`Deseja alterar ${ids.length} itens para EM ABERTO?`)) return
    try {
      await supabase.from('pagamentos_dda').update({ status: 'aberto' }).in('id', ids)
      await supabase.from('agendamentos').update({ status: 'aberto' }).in('id', ids)
      toast.success('Status atualizado para Em Aberto!')
      carregarPagamentos()
    } catch (e) {
      toast.error('Erro ao atualizar')
    }
  }

  const toggleStatus = async (item: any) => {
    const novoStatus = item.status === 'agendado' ? 'aberto' : 'agendado'
    const tabela = item.origem === 'DDA' ? 'pagamentos_dda' : 'agendamentos'

    setPagamentos(prev => prev.map(p => p.id === item.id ? { ...p, status: novoStatus } : p))

    try {
      await supabase.from(tabela).update({ status: novoStatus }).eq('id', item.id)
    } catch (e) {
      toast.error('Erro ao atualizar status')
      carregarPagamentos()
    }
  }

  const handleExcluirIndividual = async (id: string, origem: string) => {
    if (!confirm('Deseja excluir este lançamento?')) return
    const tabela = origem === 'DDA' ? 'pagamentos_dda' : 'agendamentos'
    try {
      const transferenciaId = pagamentos.find(p => p.id === id)?.transferencia_id
      if (transferenciaId) {
        await supabase.from('agendamentos').delete().eq('transferencia_id', transferenciaId)
      } else {
        await supabase.from(tabela).delete().eq('id', id)
      }
      toast.success('Excluído!')
      carregarPagamentos()
      if (transferenciaId) onTransferenciaGlobal?.()
    } catch (e) {
      toast.error('Erro ao excluir')
    }
  }

  const handleEnviarParaContasAPagar = async (itensSelecionados: any[]) => {
    if (itensSelecionados.length === 0) return

    const itensValidos = itensSelecionados.filter(i => i.origem !== 'Transferência' && i.origem !== 'Transferência Recebida')

    if (itensValidos.length === 0) {
      toast.error('Transferências não podem ser enviadas para o Contas a Pagar.')
      return
    }

    try {
      // Se algum item selecionado tiver anexo_url === 'lazy', busca o anexo real sob demanda antes de gravar/enviar
      const itensComAnexoResolvido = await Promise.all(
        itensValidos.map(async (item) => {
          if (item.anexo_url === 'lazy') {
            const { data } = await supabase
              .from('agendamentos')
              .select('anexo_url')
              .eq('id', item.id)
              .single()
            return { ...item, anexo_url: data?.anexo_url || null }
          }
          return item
        })
      )

      const linhas = itensComAnexoResolvido.map(item => ({
        empresa_id: empresa.id,
        fornecedor: String(item.fornecedor || item.beneficiario || 'Não Informado').trim(),
        valor: Number(item.valor),
        vencimento: item.data_vencimento || item.data_pagamento || hoje,
        categoria: (item.categoria && item.categoria !== '—') ? item.categoria : 'Materiais para Revenda',
        descricao: item.descricao ? String(item.descricao).toUpperCase() : (item.documento ? `DOC: ${item.documento}` : null),
        doc: item.documento || `GP-${String(item.id).slice(0, 8)}`,
        emissao: item.competencia || item.data_vencimento || item.data_pagamento || hoje,
        conta_financeira: item.conta_pagamento || null,
        status: 'pendente',
        metadata: { anexo_url: item.anexo_url || null },
      }))

      // 1. Salvar no banco Supabase na tabela contas_pagar_importadas
      const { error } = await supabase
        .from('contas_pagar_importadas')
        .upsert(linhas, {
          onConflict: 'empresa_id,fornecedor,valor,vencimento,doc',
          ignoreDuplicates: true,
        })

      if (error) throw error

      // 2. Guardar em sessionStorage para exibição na tela de revisão
      const itensRevisao = itensComAnexoResolvido.map(item => ({
        fornecedor: String(item.fornecedor || item.beneficiario || 'Não Informado').trim(),
        valor: Number(item.valor),
        vencimento: item.data_vencimento || item.data_pagamento || hoje,
        categoria: (item.categoria && item.categoria !== '—') ? item.categoria : 'Materiais para Revenda',
        descricao: item.descricao ? String(item.descricao).toUpperCase() : (item.documento ? `DOC: ${item.documento}` : ''),
        doc: item.documento || `GP-${String(item.id).slice(0, 8)}`,
        emissao: item.competencia || item.data_vencimento || item.data_pagamento || hoje,
        conta_financeira: item.conta_pagamento || null,
        status: 'pendente',
        anexo_url: item.anexo_url || null,
        metadata: { anexo_url: item.anexo_url || null },
      }))

      if (typeof window !== 'undefined') {
        sessionStorage.setItem('itens_para_revisao', JSON.stringify(itensRevisao))
        localStorage.setItem('empresa_ativa_id', empresa.id)
      }

      toast.success(`${linhas.length} lançamento(s) enviado(s) para o Contas a Pagar!`)
      setEmpresaAtiva(empresa)
      router.push(`/contas-pagar?empresa_id=${empresa.id}&revisao=true`)
    } catch (err: any) {
      toast.error(err.message || 'Erro ao enviar para o Contas a Pagar')
    }
  }

  function abrirModalTransferir(itens: any[]) {
    if (itens.length === 0) return
    setItensParaTransferir(itens)
    setModalTransferirAberto(true)
  }

  const handleConfirmarTransferirLancamentos = async (destinoId: string) => {
    if (itensParaTransferir.length === 0) return
    setTransferindoLancamento(true)
    try {
      const itensDda = itensParaTransferir.filter(i => i.origem === 'DDA')
      const itensAgendamentos = itensParaTransferir.filter(i => i.origem !== 'DDA')

      if (itensAgendamentos.length > 0) {
        const idsAgendamentos = itensAgendamentos.map(i => i.id)
        const { error } = await supabase.from('agendamentos').update({ empresa_id: destinoId }).in('id', idsAgendamentos)
        if (error) throw error
      }

      if (itensDda.length > 0) {
        const linhasAgendamento = itensDda.map(item => ({
          empresa_id: destinoId,
          fornecedor: String(item.beneficiario || 'Não identificado').trim(),
          tipo: 'Boleto',
          valor: Number(item.valor),
          data_vencimento: item.data_vencimento,
          status: item.status || 'aberto',
          descricao: item.descricao || (item.documento ? `Boleto nº ${item.documento}` : 'Lançamento DDA Transferido'),
          categoria: item.categoria || 'Materiais para Revenda',
          conta_pagamento: item.conta_pagamento || null,
          competencia: item.competencia || null,
          data_pagamento: item.data_pagamento || null,
          chave_pix: item.chave_pix || null,
          cpf_cnpj: item.cpf_cnpj || null,
        }))

        const { error: insertError } = await supabase.from('agendamentos').insert(linhasAgendamento)
        if (insertError) throw insertError

        const idsDda = itensDda.map(i => i.id)
        const { error: deleteError } = await supabase.from('pagamentos_dda').delete().in('id', idsDda)
        if (deleteError) throw deleteError
      }

      toast.success(`${itensParaTransferir.length} lançamento(s) transferido(s) para a outra loja!`)
      setModalTransferirAberto(false)
      setItensParaTransferir([])
      setModalDetalhesDda(false)
      setModalDetalhesFolha(false)
      carregarPagamentos()
      onTransferenciaGlobal?.()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao transferir lançamento(s)')
    } finally {
      setTransferindoLancamento(false)
    }
  }

  function abrirEdicaoEmMassa(itens: any[]) {
    if (itens.length === 0) return
    setItensEdicaoMassa(itens)
    setModalEdicaoMassaAberto(true)
  }

  const handleConfirmarEdicaoEmMassa = async (dados: { categoria?: string; competencia?: string; contaPagamento?: string; dataPagamento?: string }) => {
    const payload: Record<string, string> = {}
    if (dados.categoria) payload.categoria = dados.categoria
    if (dados.competencia) payload.competencia = dados.competencia
    if (dados.contaPagamento) payload.conta_pagamento = dados.contaPagamento
    if (dados.dataPagamento) payload.data_pagamento = dados.dataPagamento
    if (Object.keys(payload).length === 0) return

    const ids = itensEdicaoMassa.map(i => i.id)
    if (ids.length === 0) return

    const tabela = itensEdicaoMassa[0]?.origem === 'DDA' ? 'pagamentos_dda' : 'agendamentos'

    setSalvandoEdicaoMassa(true)
    try {
      const { error } = await supabase.from(tabela).update(payload).in('id', ids)
      if (error) throw error

      if (dados.categoria && itensEdicaoMassa[0]?.origem === 'DDA') {
        const nomesUnicos = Array.from(new Set(
          itensEdicaoMassa.map(i => i.beneficiario).filter(Boolean)
        )) as string[]
        nomesUnicos.forEach(nome => aprenderCategoriaPorFornecedor(nome, dados.categoria as string))
      }

      toast.success(`${ids.length} lançamento(s) atualizado(s)!`)
      setModalEdicaoMassaAberto(false)
      setItensEdicaoMassa([])
      carregarPagamentos()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar em massa')
    } finally {
      setSalvandoEdicaoMassa(false)
    }
  }

  const handleSalvarEdicao = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!itemEditando) return
    const ehDda = itemEditando.origem === 'DDA'
    const tabela = ehDda ? 'pagamentos_dda' : 'agendamentos'

    const valorNumerico = Number(itemEditando.valor) || 0
    if (ehDda && (!itemEditando.beneficiario || !itemEditando.data_vencimento || !valorNumerico)) {
      toast.error('Preencha Beneficiário, Vencimento e Valor.')
      return
    }
    if (!ehDda && (!itemEditando.data_vencimento || !valorNumerico)) {
      toast.error('Preencha Vencimento e Valor.')
      return
    }

    try {
      const payload = ehDda
        ? {
            beneficiario: itemEditando.beneficiario,
            documento: itemEditando.documento,
            categoria: itemEditando.categoria || null,
            descricao: itemEditando.descricao,
            conta_pagamento: itemEditando.conta_pagamento,
            valor: valorNumerico,
            data_vencimento: itemEditando.data_vencimento,
            data_pagamento: itemEditando.data_pagamento || null,
            competencia: itemEditando.competencia || null,
            status: itemEditando.status,
          }
        : {
            fornecedor: itemEditando.fornecedor || null,
            tipo: itemEditando.tipo,
            categoria: itemEditando.categoria || null,
            descricao: itemEditando.descricao,
            valor: valorNumerico,
            data_vencimento: itemEditando.data_vencimento,
            data_pagamento: itemEditando.data_pagamento || null,
            competencia: itemEditando.competencia || null,
            conta_pagamento: itemEditando.conta_pagamento,
            chave_pix: itemEditando.chave_pix,
            cpf_cnpj: itemEditando.cpf_cnpj,
            status: itemEditando.status,
            codigo_barras: itemEditando.codigo_barras || null,
          }

      const { error } = await supabase.from(tabela).update(payload).eq('id', itemEditando.id)
      if (error) throw error

      if ((itemEditando.origem === 'DDA' || itemEditando.origem === 'Agendamento') && itemEditando.categoria) {
        const nomeParaAprender = ehDda ? itemEditando.beneficiario : itemEditando.fornecedor
        if (nomeParaAprender) aprenderCategoriaPorFornecedor(nomeParaAprender, itemEditando.categoria)
      }

      toast.success('Atualizado com sucesso!')
      setModalEdicaoAberto(false)
      carregarPagamentos()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar')
    }
  }

  return (
    <div className="bg-white dark:bg-dark-850/90 border border-slate-200/80 dark:border-dark-700/70 rounded-2xl overflow-hidden shadow-xs hover:shadow-md transition-shadow">
      <div className="p-4 sm:p-5 border-b border-slate-200/80 dark:border-dark-700 bg-slate-50/60 dark:bg-dark-900/40">
        {/* Linha 1: Cabeçalho Principal (Área Esquerda, Área Central e Área Direita) */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Área Esquerda: Nome da empresa, Status, Última atualização */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 rounded-xl bg-brand-500/10 dark:bg-brand-500/15 border border-brand-500/20 dark:border-brand-500/30 flex items-center justify-center text-brand-600 dark:text-brand-400 font-bold shadow-xs">
              {empresa.nome.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">
                  {empresa.nome}
                </h2>
                {/* Selo de Status Ativo */}
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  ATIVA
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500 dark:text-dark-400">
                <Clock size={11} className="text-slate-400 dark:text-dark-500" />
                <span>Última atualização: {new Date().toLocaleDateString('pt-BR')}</span>
              </div>
            </div>
          </div>

          {/* Área Central: Navegação de datas, Calendário, Botões anterior/próximo */}
          <div className="flex items-center justify-center gap-2 flex-wrap flex-1 min-w-0">
            <div className="flex items-center gap-1 bg-white dark:bg-dark-800 p-1 rounded-2xl border border-slate-200 dark:border-dark-700 shadow-xs">
              <button
                onClick={navegarPeriodoAnterior}
                title="Voltar período (anterior)"
                className="p-1.5 sm:p-2 hover:bg-slate-100 dark:hover:bg-dark-700 text-slate-600 hover:text-slate-900 dark:text-dark-300 dark:hover:text-white rounded-xl transition-colors flex items-center justify-center cursor-pointer"
              >
                <ChevronLeft size={16} />
              </button>

              <div className="relative">
                <button
                  onClick={() => setMenuPeriodoAberto(!menuPeriodoAberto)}
                  className="flex items-center gap-2 bg-slate-50 dark:bg-dark-750 hover:bg-slate-100 dark:hover:bg-dark-700 text-slate-800 dark:text-white rounded-xl px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold transition-all min-w-[140px] sm:min-w-[155px] justify-between cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <Calendar size={13} className="text-slate-500 dark:text-dark-400" />
                    {labelPeriodoAtivo()}
                  </span>
                  <ChevronDown size={13} className={menuPeriodoAberto ? 'rotate-180 transition-transform' : 'transition-transform'} />
                </button>

                {menuPeriodoAberto && (
                  <div className="absolute top-full mt-2 left-0 w-52 bg-white dark:bg-dark-800 border border-slate-200 dark:border-dark-600 rounded-xl shadow-2xl z-50 overflow-hidden">
                    {OPCOES_PERIODO.map(op => (
                      <button
                        key={op.key}
                        onClick={() => aplicarPeriodo(op.key)}
                        className={`w-full text-left px-4 py-2.5 text-sm font-semibold transition-colors cursor-pointer ${
                          periodoAtivo === op.key ? 'bg-brand-600 text-white' : 'text-slate-700 dark:text-dark-200 hover:bg-slate-100 dark:hover:bg-dark-700'
                        } ${op.key === 'personalizado' ? 'border-t border-slate-200 dark:border-dark-700' : ''}`}
                      >
                        {op.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={navegarPeriodoProximo}
                title="Avançar período (próximo)"
                className="p-1.5 sm:p-2 hover:bg-slate-100 dark:hover:bg-dark-700 text-slate-600 hover:text-slate-900 dark:text-dark-300 dark:hover:text-white rounded-xl transition-colors flex items-center justify-center cursor-pointer"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Período Personalizado */}
            {periodoAtivo === 'personalizado' && (
              <div className="flex items-center gap-2 animate-fade-in bg-white dark:bg-dark-800 px-2 py-1 rounded-xl border border-slate-200 dark:border-dark-700 shadow-xs">
                <input
                  type="date"
                  value={dataInicio}
                  onChange={e => {
                    const novaDataInicio = e.target.value
                    setDataInicio(novaDataInicio)
                    if (dataFim < novaDataInicio) setDataFim(novaDataInicio)
                  }}
                  className="bg-transparent border border-slate-200 dark:border-dark-600 text-slate-900 dark:text-white rounded-lg px-2.5 py-1 text-xs outline-none w-32 focus:border-brand-500"
                />
                <span className="text-slate-400 dark:text-dark-500 text-xs">até</span>
                <input
                  type="date"
                  value={dataFim}
                  min={dataInicio}
                  onChange={e => setDataFim(e.target.value)}
                  className="bg-transparent border border-slate-200 dark:border-dark-600 text-slate-900 dark:text-white rounded-lg px-2.5 py-1 text-xs outline-none w-32 focus:border-brand-500"
                />
                <button onClick={carregarPagamentos} className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-500 text-white px-2.5 py-1 rounded-lg text-xs font-bold transition-colors shadow-xs cursor-pointer">
                  <Search size={12} /> Filtrar
                </button>
              </div>
            )}
          </div>

          {/* Área Direita: Card Saldo em Caixa */}
          <div className="flex items-center justify-end shrink-0 self-start lg:self-center">
            <div className="relative group shrink-0">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 rounded-xl blur-xs opacity-70 group-hover:opacity-100 transition duration-300" />
              <div className="relative bg-white dark:bg-dark-850 border border-emerald-500/30 dark:border-emerald-500/40 rounded-xl px-3.5 py-2 text-right shadow-xs hover:shadow-emerald-500/10 transition-all flex flex-col justify-between min-w-[200px] sm:min-w-[210px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    <Wallet size={10} /> Saldo em Caixa
                  </span>
                  <span className="text-[9px] font-semibold text-slate-400 dark:text-dark-400">
                    {salvandoSaldo ? 'Salvando...' : 'Clique para editar'}
                  </span>
                </div>

                <div className="flex items-baseline gap-1 justify-end my-0.5">
                  <span className="text-emerald-600/70 dark:text-emerald-400/70 font-extrabold text-xs">R$</span>
                  <InputMoeda
                    value={saldoCaixaPendente}
                    onChange={setSaldoCaixaPendente}
                    disabled={salvandoSaldo}
                    onBlur={handleSalvarSaldoCaixa}
                    permiteNegativo
                    title="Digite o saldo real da conta desta loja (pode ser negativo)"
                    className={`text-lg sm:text-xl font-black bg-transparent text-right w-32 sm:w-36 outline-none border-b border-transparent hover:border-emerald-500/30 focus:border-emerald-500 transition-colors disabled:opacity-50 font-mono tabular-nums tracking-tight ${
                      saldoCaixaPendente < 0 ? 'text-rose-500 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  />
                </div>

                <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-slate-100 dark:border-dark-750">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <p className="text-[10px] font-medium text-slate-500 dark:text-dark-400 leading-none">
                    Disponível para operação
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Linha 2: Ações Operacionais (Importar Arquivos, Agendamento, Transferência) */}
        <div className="mt-4 pt-3.5 border-t border-slate-200/70 dark:border-dark-700/70 flex items-center justify-between flex-wrap gap-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Importar Arquivos */}
            <div className="relative">
              <button
                onClick={() => setMenuImportarAberto(!menuImportarAberto)}
                className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-xs cursor-pointer"
              >
                <Upload size={14} /> Importar Arquivos <ChevronDown size={13} className={menuImportarAberto ? 'rotate-180 transition-transform' : 'transition-transform'} />
              </button>

              {menuImportarAberto && (
                <div className="absolute top-full mt-2 left-0 w-56 bg-white dark:bg-dark-800 border border-slate-200 dark:border-dark-600 rounded-xl shadow-2xl z-50 overflow-hidden divide-y divide-slate-100 dark:divide-dark-700/50">
                  <label className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-dark-700 cursor-pointer transition-colors">
                    <FileText size={16} className="text-blue-500 dark:text-blue-400" />
                    <span className="text-sm font-semibold text-slate-800 dark:text-white">DDA</span>
                    <input data-loja={empresa.id} type="file" accept="image/*,application/pdf,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" className="hidden" onChange={e => handleImportarArquivo(e, 'dda')} disabled={importando} />
                  </label>
                  <label className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-dark-700 cursor-pointer transition-colors">
                    <FileText size={16} className="text-emerald-500 dark:text-emerald-400" />
                    <span className="text-sm font-semibold text-slate-800 dark:text-white">Folha de Pagamento</span>
                    <input data-loja={empresa.id} type="file" accept="application/pdf" className="hidden" onChange={e => handleImportarArquivo(e, 'folha')} disabled={importando} />
                  </label>
                </div>
              )}
            </div>

            {/* Agendamento */}
            <button
              onClick={() => setModalAgendamentoAberto(true)}
              className="flex items-center gap-1.5 bg-white dark:bg-dark-800 border border-slate-200 dark:border-dark-700 hover:bg-slate-100 dark:hover:bg-dark-750 text-slate-700 dark:text-white px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-xs cursor-pointer"
            >
              <Calendar size={14} className="text-blue-500 dark:text-blue-400" /> Agendamento
            </button>

            {/* Transferência */}
            <button
              onClick={() => setModalTransferenciaAberto(true)}
              className="flex items-center gap-1.5 bg-white dark:bg-dark-800 border border-slate-200 dark:border-dark-700 hover:bg-slate-100 dark:hover:bg-dark-750 text-slate-700 dark:text-white px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-xs cursor-pointer"
            >
              <ArrowRightLeft size={14} className="text-emerald-500 dark:text-emerald-400" /> Transferência
            </button>
          </div>

          {/* Opções da Loja / Limpar */}
          <div className="relative">
            <button
              onClick={() => setMenuExcluirAberto(!menuExcluirAberto)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-dark-800 border border-slate-200 dark:border-dark-700 hover:bg-rose-50 text-slate-500 hover:text-rose-600 dark:text-dark-300 dark:hover:text-rose-400 dark:hover:bg-rose-500/10 transition-colors cursor-pointer text-xs font-semibold shadow-xs"
              title="Opções da loja"
            >
              <Trash2 size={13} />
              <span>Opções da Loja</span>
              <ChevronDown size={12} className={menuExcluirAberto ? 'rotate-180 transition-transform' : 'transition-transform'} />
            </button>

            {menuExcluirAberto && (
              <div className="absolute top-full mt-2 right-0 w-64 bg-white dark:bg-dark-800 border border-slate-200 dark:border-dark-600 rounded-xl shadow-2xl z-50 overflow-hidden divide-y divide-slate-100 dark:divide-dark-700/50">
                <button
                  onClick={() => { setMenuExcluirAberto(false); handleLimparRegistrosDoDia() }}
                  className="w-full text-left px-4 py-3 text-sm font-semibold text-slate-700 dark:text-dark-200 hover:bg-slate-50 dark:hover:bg-dark-700 transition-colors cursor-pointer"
                >
                  Excluir lançamentos do período
                </button>
                <button
                  onClick={handleRemoverLojaDoGrupo}
                  className="w-full text-left px-4 py-3 text-sm font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors cursor-pointer"
                >
                  Remover loja deste grupo
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {selecionadosIndividuais.length > 0 && (
        <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border-b border-blue-200 dark:border-blue-500/30 flex flex-wrap items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center gap-3">
            <span className="bg-brand-600 text-white text-xs font-black px-2.5 py-1 rounded-full shadow-xs">
              {selecionadosIndividuais.length} selecionado{selecionadosIndividuais.length > 1 ? 's' : ''}
            </span>
            <span className="text-sm font-bold text-blue-900 dark:text-blue-200">
              Total: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                pagamentosIndividuais
                  .filter(p => selecionadosIndividuais.includes(p.id))
                  .reduce((acc, curr) => acc + Number(curr.valor), 0)
              )}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => {
                const itens = pagamentosIndividuais.filter(p => selecionadosIndividuais.includes(p.id))
                handleEnviarParaContasAPagar(itens)
              }}
              className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded-xl text-xs font-black transition-all shadow-xs cursor-pointer"
            >
              <Send size={14} /> Enviar p/ Contas a Pagar (Conta Azul)
            </button>

            <button
              type="button"
              onClick={() => {
                handleAgendarEmLote(selecionadosIndividuais)
                setSelecionadosIndividuais([])
              }}
              className="flex items-center gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              <CheckCircle2 size={14} /> Agendar
            </button>

            <button
              type="button"
              onClick={() => {
                const itens = pagamentosIndividuais.filter(p => selecionadosIndividuais.includes(p.id))
                abrirEdicaoEmMassa(itens)
              }}
              className="flex items-center gap-1.5 bg-white hover:bg-slate-100 dark:bg-dark-700 dark:hover:bg-dark-600 text-slate-800 dark:text-white px-3 py-2 rounded-xl text-xs font-semibold transition-all border border-slate-200 dark:border-dark-600 cursor-pointer shadow-xs"
            >
              <Edit2 size={14} /> Editar em Massa
            </button>

            <button
              type="button"
              onClick={() => {
                const itens = pagamentosIndividuais.filter(p => selecionadosIndividuais.includes(p.id))
                abrirModalTransferir(itens)
              }}
              className="flex items-center gap-1.5 bg-white hover:bg-slate-100 dark:bg-dark-700 dark:hover:bg-dark-600 text-emerald-600 dark:text-emerald-400 px-3 py-2 rounded-xl text-xs font-semibold transition-all border border-slate-200 dark:border-dark-600 cursor-pointer shadow-xs"
            >
              <ArrowRightLeft size={14} /> Transferir Loja
            </button>

            <button
              type="button"
              onClick={() => {
                handleExcluirEmLote(selecionadosIndividuais)
                setSelecionadosIndividuais([])
              }}
              className="flex items-center gap-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-600 dark:text-rose-400 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer"
            >
              <Trash2 size={14} /> Excluir
            </button>

            <button
              type="button"
              onClick={() => setSelecionadosIndividuais([])}
              className="text-slate-500 hover:text-slate-900 dark:text-dark-400 dark:hover:text-white px-2 py-1 text-xs transition-colors cursor-pointer"
            >
              Desmarcar
            </button>
          </div>
        </div>
      )}

      {/* Barra de Busca Rápida Local */}
      {pagamentos.length > 0 && (
        <div className="p-3 bg-slate-50/70 dark:bg-dark-900/60 border-b border-slate-200/80 dark:border-dark-700/70 flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-dark-400" />
            <input
              type="text"
              value={buscaLocal}
              onChange={e => setBuscaLocal(e.target.value)}
              placeholder="Busca rápida por fornecedor, descrição, conta ou valor..."
              className="w-full bg-white dark:bg-dark-800 border border-slate-200 dark:border-dark-600 rounded-xl pl-8 pr-8 py-1.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:border-brand-500 transition-colors shadow-xs"
            />
            {buscaLocal && (
              <button
                type="button"
                onClick={() => setBuscaLocal('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
                title="Limpar busca"
              >
                <X size={13} />
              </button>
            )}
          </div>
          {buscaLocal && (
            <span className="text-[11px] font-semibold text-slate-500 dark:text-dark-400">
              {pagamentosIndividuaisFiltrados.length} de {pagamentosIndividuais.length} resultado(s)
            </span>
          )}
        </div>
      )}

      <div className="overflow-x-auto min-h-[150px] custom-scrollbar">
        <table className="w-full text-left border-collapse min-w-[960px] xl:min-w-full">
          <thead>
            <tr className="bg-slate-100/95 dark:bg-dark-900/95 backdrop-blur-md border-b border-slate-200 dark:border-dark-700/80 text-[10px] uppercase font-bold tracking-widest text-slate-500 dark:text-dark-400">
              <th className="w-10 px-2 py-3 text-center">
                {pagamentosIndividuaisFiltrados.filter(p => p.origem !== 'Transferência' && p.origem !== 'Transferência Recebida').length > 0 && (
                  <input
                    type="checkbox"
                    checked={
                      pagamentosIndividuaisFiltrados.filter(p => p.origem !== 'Transferência' && p.origem !== 'Transferência Recebida').length > 0 &&
                      pagamentosIndividuaisFiltrados
                        .filter(p => p.origem !== 'Transferência' && p.origem !== 'Transferência Recebida')
                        .every(p => selecionadosIndividuais.includes(p.id))
                    }
                    onChange={toggleSelecionarTodosIndividuais}
                    className="rounded bg-white dark:bg-dark-800 border-slate-300 dark:border-dark-600 text-brand-600 focus:ring-0 cursor-pointer w-3.5 h-3.5"
                    title="Selecionar / Desmarcar todos os agendamentos visíveis"
                  />
                )}
              </th>
              <th className="w-24 px-3 py-3 whitespace-nowrap">TIPO</th>
              <th className="w-[23%] min-w-[190px] px-3 py-3">BENEFICIÁRIO / CONTA</th>
              <th className="w-[13%] min-w-[120px] px-3 py-3">CATEGORIA</th>
              <th className="w-[27%] min-w-[210px] px-3 py-3">DESCRIÇÃO</th>
              <th className="w-28 px-3 py-3 text-center whitespace-nowrap">SITUAÇÃO</th>
              <th className="w-28 px-3 py-3 whitespace-nowrap">VENCIMENTO</th>
              <th className="w-32 px-3 py-3 text-right whitespace-nowrap">VALOR</th>
              <th className="w-[136px] min-w-[136px] max-w-[136px] px-2 py-3 text-center whitespace-nowrap">AÇÕES</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-dark-700/50">
            {carregando ? (
              <tr>
                <td colSpan={9} className="p-12 text-center text-slate-400 dark:text-dark-500 font-semibold text-sm">
                  <RefreshCw className="animate-spin mx-auto mb-3 text-brand-500" size={24} />
                  Carregando lançamentos...
                </td>
              </tr>
            ) : pagamentos.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-14 px-4 text-center">
                  <div className="max-w-md mx-auto flex flex-col items-center">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/20 dark:border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-3 shadow-xs">
                      <CheckCircle2 size={24} />
                    </div>
                    <h4 className="text-slate-900 dark:text-white font-bold text-base">
                      Nenhum pagamento agendado
                    </h4>
                    <p className="text-slate-500 dark:text-dark-400 text-xs sm:text-sm mt-1 mb-5">
                      Tudo conciliado para esta loja no período selecionado.
                    </p>
                    <div className="flex items-center gap-2.5 flex-wrap justify-center">
                      <button
                        onClick={() => setMenuImportarAberto(true)}
                        className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                      >
                        <Upload size={14} /> Importar Arquivo
                      </button>
                      <button
                        onClick={() => setModalAgendamentoAberto(true)}
                        className="inline-flex items-center gap-2 bg-white dark:bg-dark-800 hover:bg-slate-50 dark:hover:bg-dark-700 text-slate-700 dark:text-white border border-slate-200 dark:border-dark-700 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                      >
                        <Plus size={14} className="text-brand-500" /> Criar Agendamento
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            ) : (!mostrarDda && !mostrarFolha && pagamentosIndividuaisFiltrados.length === 0) ? (
              <tr>
                <td colSpan={9} className="py-12 px-4 text-center text-slate-400 dark:text-dark-400 text-sm font-medium">
                  Nenhum lançamento encontrado para a busca "{buscaLocal}".
                </td>
              </tr>
            ) : (
              <>
                {mostrarDda && (
                  <tr className="bg-blue-50/50 dark:bg-dark-800/20 hover:bg-blue-100/50 dark:hover:bg-dark-800/40 transition-colors border-l-4 border-l-blue-500">
                    <td className="w-10 px-2 py-2.5 text-center"></td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="text-[10px] font-black uppercase px-2 py-1 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">DDA</span>
                    </td>
                    <td className="px-3 py-2.5 font-bold text-slate-900 dark:text-white text-sm truncate">Lançamentos DDA</td>
                    <td className="px-3 py-2.5 text-sm text-slate-600 dark:text-dark-300 truncate">{categoriaDda}</td>
                    <td className="px-3 py-2.5 text-sm text-slate-600 dark:text-dark-300 truncate">Total de {pagamentosDda.length} itens importados</td>
                    <td className="px-3 py-2.5 text-center whitespace-nowrap">
                      <span className={`text-[10px] font-bold px-3 py-1 rounded border uppercase tracking-wider ${situacaoDda.classe}`}>{situacaoDda.label}</span>
                    </td>
                    <td className="px-3 py-2.5 text-sm text-slate-500 dark:text-dark-300 font-semibold whitespace-nowrap">—</td>
                    <td className="px-3 py-2.5 font-black text-rose-600 dark:text-rose-400 text-sm text-right tabular-nums whitespace-nowrap">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(pagamentosDda.reduce((acc, curr) => acc + Number(curr.valor), 0))}
                    </td>
                    <td className="w-[136px] min-w-[136px] max-w-[136px] px-2 py-2.5 text-center whitespace-nowrap">
                      <button onClick={() => setModalDetalhesDda(true)} className="bg-white hover:bg-slate-100 dark:bg-dark-800 dark:hover:bg-dark-700 border border-slate-200 dark:border-dark-600 text-slate-700 dark:text-white rounded-lg p-1.5 transition-colors cursor-pointer shadow-xs" title="Visualizar Lançamentos">
                        <Search size={16} className="text-slate-500 dark:text-dark-300" />
                      </button>
                    </td>
                  </tr>
                )}

                {mostrarFolha && (
                  <tr className="bg-emerald-50/50 dark:bg-dark-800/10 hover:bg-emerald-100/50 dark:hover:bg-dark-800/30 transition-colors border-l-4 border-l-emerald-500">
                    <td className="w-10 px-2 py-2.5 text-center"></td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="text-[10px] font-black uppercase px-2 py-1 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">FOLHA</span>
                    </td>
                    <td className="px-3 py-2.5 font-bold text-slate-900 dark:text-white text-sm truncate">Folha de Pagamento</td>
                    <td className="px-3 py-2.5 text-sm text-slate-600 dark:text-dark-300 truncate">{categoriaFolha}</td>
                    <td className="px-3 py-2.5 text-sm text-slate-600 dark:text-dark-300 truncate">Total de {pagamentosFolha.length} colaboradores</td>
                    <td className="px-3 py-2.5 text-center whitespace-nowrap">
                      <span className={`text-[10px] font-bold px-3 py-1 rounded border uppercase tracking-wider ${situacaoFolha.classe}`}>{situacaoFolha.label}</span>
                    </td>
                    <td className="px-3 py-2.5 text-sm text-slate-500 dark:text-dark-300 font-semibold whitespace-nowrap">—</td>
                    <td className="px-3 py-2.5 font-black text-rose-600 dark:text-rose-400 text-sm text-right tabular-nums whitespace-nowrap">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(pagamentosFolha.reduce((acc, curr) => acc + Number(curr.valor), 0))}
                    </td>
                    <td className="w-[136px] min-w-[136px] max-w-[136px] px-2 py-2.5 text-center whitespace-nowrap">
                      <button onClick={() => setModalDetalhesFolha(true)} className="bg-white hover:bg-slate-100 dark:bg-dark-800 dark:hover:bg-dark-700 border border-slate-200 dark:border-dark-600 text-slate-700 dark:text-white rounded-lg p-1.5 transition-colors cursor-pointer shadow-xs" title="Visualizar Lançamentos">
                        <Search size={16} className="text-slate-500 dark:text-dark-300" />
                      </button>
                    </td>
                  </tr>
                )}

                {pagamentosIndividuaisFiltrados.map((pag, idx) => (
                  <tr key={pag.id || idx} className={cn("hover:bg-slate-100/60 dark:hover:bg-white/[0.035] transition-colors border-b border-slate-100 dark:border-dark-700/50 even:bg-slate-50/50 dark:even:bg-white/[0.015]", selecionadosIndividuais.includes(pag.id) ? "bg-blue-50/70 dark:bg-blue-950/20" : "bg-transparent")}>
                    <td className="w-10 px-2 py-2.5 text-center">
                      {pag.origem !== 'Transferência' && pag.origem !== 'Transferência Recebida' ? (
                        <input
                          type="checkbox"
                          checked={selecionadosIndividuais.includes(pag.id)}
                          onChange={() => toggleItemIndividual(pag.id)}
                          className="rounded bg-white dark:bg-dark-800 border-slate-300 dark:border-dark-600 text-brand-600 focus:ring-0 cursor-pointer w-3.5 h-3.5"
                        />
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={`text-[10px] font-black uppercase px-2 py-1 rounded ${
                        pag.origem === 'Transferência Recebida' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : pag.origem === 'Transferência' ? 'bg-slate-100 dark:bg-dark-700 text-slate-600 dark:text-dark-300'
                        : 'bg-violet-500/10 text-violet-600 dark:text-violet-400'
                      }`}>
                        {pag.origem === 'Agendamento' ? 'AGEND' : pag.origem === 'Transferência Recebida' ? 'TRANSF. RECEB.' : pag.origem}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-bold text-slate-900 dark:text-white text-sm" title={pag.fornecedor || pag.beneficiario || ''}>
                      <div className="truncate font-semibold">{pag.fornecedor || pag.beneficiario || '—'}</div>
                      {(() => {
                        const nomeNorm = normalizarNome(pag.fornecedor || pag.beneficiario || '')
                        const docBruto = pag.cpf_cnpj || mapaCnpjFornecedores[nomeNorm] || null
                        const docFormatado = formatarDocumentoFiscal(docBruto)
                        if (!docFormatado) return null
                        return (
                          <div className="text-[11px] font-normal text-slate-500 dark:text-dark-400 mt-0.5 select-all">
                            {docFormatado}
                          </div>
                        )
                      })()}
                      {pag.conta_pagamento && (
                        <div className="flex items-center gap-1 mt-0.5 text-[11px] font-normal text-slate-500 dark:text-dark-400 truncate" title={`Conta de pagamento: ${pag.conta_pagamento}`}>
                          <Wallet size={11} className="shrink-0 text-slate-400 dark:text-dark-500" />
                          <span className="truncate">{pag.conta_pagamento}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-sm text-slate-600 dark:text-dark-300 truncate" title={pag.categoria || ''}>
                      {pag.categoria || '—'}
                    </td>
                    <td className="px-3 py-2.5 text-sm text-slate-600 dark:text-dark-300">
                      {(() => {
                        const desc = pag.descricao ? String(pag.descricao).trim().toUpperCase() : ''
                        const doc = pag.documento && pag.documento !== 'S/N' ? String(pag.documento).trim().toUpperCase() : ''
                        let textoExibir = '—'
                        if (desc) {
                          textoExibir = doc && !desc.includes(doc) ? `${desc} - DOC: ${pag.documento}` : desc
                        } else if (doc) {
                          textoExibir = `DOC: ${pag.documento}`
                        }

                        return (
                          <>
                            <div className="truncate font-medium text-slate-800 dark:text-dark-200" title={textoExibir}>
                              {textoExibir}
                            </div>
                            {pag.codigo_barras && (
                              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setItemCodigoBarras(pag)
                                  }}
                                  className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-500 bg-blue-500/10 hover:bg-blue-500/20 px-2 py-0.5 rounded transition-colors cursor-pointer"
                                  title="Clique para visualizar o código de barras completo"
                                >
                                  <Barcode size={12} /> Ver código de barras
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    navigator.clipboard.writeText(pag.codigo_barras)
                                    toast.success('Código de barras copiado com sucesso!')
                                  }}
                                  className="p-1 hover:bg-slate-100 dark:hover:bg-dark-700 text-slate-400 hover:text-blue-500 rounded transition-colors flex-shrink-0 cursor-pointer"
                                  title="Copiar Código de Barras"
                                >
                                  <Copy size={11} />
                                </button>
                              </div>
                            )}
                          </>
                        )
                      })()}
                    </td>
                    <td className="px-3 py-2.5 text-center whitespace-nowrap">
                      <button onClick={() => toggleStatus(pag)} className={`text-[10px] font-bold px-2 py-1 rounded border uppercase tracking-wider transition-colors cursor-pointer ${
                        pag.status === 'agendado'
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-600 dark:text-amber-500 border-amber-500/20 hover:bg-amber-500/20'
                      }`}>
                        {pag.status === 'agendado' ? 'AGENDADO' : 'EM ABERTO'}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-sm whitespace-nowrap">
                      {(() => {
                        const dataRef = pag.data_vencimento || pag.data_pagamento
                        const estilo = getEstiloVencimento(dataRef, pag.status)
                        const dataFormatada = pag.data_pagamento ? pag.data_pagamento.split('-').reverse().join('/') : (pag.data_vencimento ? pag.data_vencimento.split('-').reverse().join('/') : '—')
                        return (
                          <div className="flex items-center gap-1.5 whitespace-nowrap">
                            <span className={cn("w-2 h-2 rounded-full shrink-0", estilo.dot)} title={
                              pag.status === 'agendado' ? 'Agendado' : (dataRef && dataRef < hoje ? 'Vencido' : dataRef === hoje ? 'Vence hoje' : 'A vencer')
                            } />
                            <span className={cn("text-xs tabular-nums", estilo.texto)}>
                              {dataFormatada}
                            </span>
                          </div>
                        )
                      })()}
                    </td>
                    <td className={`px-3 py-2.5 font-bold text-sm text-right tabular-nums whitespace-nowrap ${pag.origem === 'Transferência Recebida' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(pag.valor)}
                    </td>
                    <td className="w-[136px] min-w-[136px] max-w-[136px] px-2 py-2.5 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1">
                        {pag.anexo_url && (
                          <button
                            type="button"
                            onClick={() => handleAbrirAnexo(pag)}
                            className="bg-white hover:bg-blue-50 dark:bg-dark-800 dark:hover:bg-blue-500/10 border border-slate-200 dark:border-dark-600 text-blue-600 dark:text-blue-400 rounded-lg p-1.5 transition-colors cursor-pointer shadow-xs hover:border-blue-300"
                            title="Abrir anexo"
                          >
                            <Paperclip size={15} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setItemEditando(pag)
                            setModalEdicaoAberto(true)
                          }}
                          className="bg-white hover:bg-slate-100 dark:bg-dark-800 dark:hover:bg-dark-700 border border-slate-200 dark:border-dark-600 text-slate-700 dark:text-white rounded-lg p-1.5 transition-colors cursor-pointer shadow-xs hover:text-brand-600"
                          title="Editar lançamento"
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExcluirIndividual(pag.id, pag.origem)}
                          className="bg-white hover:bg-rose-50 dark:bg-dark-800 dark:hover:bg-rose-500/10 border border-slate-200 dark:border-dark-600 text-slate-500 hover:text-rose-600 dark:text-dark-300 dark:hover:text-rose-400 rounded-lg p-1.5 transition-colors cursor-pointer shadow-xs"
                          title="Excluir lançamento"
                        >
                          <Trash2 size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => abrirAcoesLancamento(pag)}
                          className="bg-white hover:bg-slate-100 dark:bg-dark-800 dark:hover:bg-dark-700 border border-slate-200 dark:border-dark-600 text-slate-400 hover:text-slate-700 dark:text-dark-400 dark:hover:text-white rounded-lg p-1.5 transition-colors cursor-pointer shadow-xs"
                          title="Ver detalhes completos"
                        >
                          <Search size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* KPIs da Loja Modernizados (Padrão Fintech Stripe/Brex) */}
      <div className="bg-slate-50/80 dark:bg-dark-900/60 border-t border-slate-200/80 dark:border-dark-700 px-6 py-5 grid grid-cols-1 sm:grid-cols-3 gap-4 transition-colors">
        <div className="bg-white dark:bg-dark-850 border border-slate-200/80 dark:border-dark-700/80 rounded-2xl p-4 shadow-xs hover:border-rose-500/30 transition-all flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-500 dark:text-dark-400 uppercase tracking-wider mb-1">Total Despesas</p>
            <p className="text-xl font-black text-rose-600 dark:text-rose-400 tabular-nums font-mono">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalDespesas)}
            </p>
            <p className="text-[10px] text-slate-400 dark:text-dark-500 mt-0.5">Saídas programadas</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 dark:bg-rose-500/15 border border-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center shadow-xs flex-shrink-0">
            <ArrowDownRight size={20} />
          </div>
        </div>

        <div className="bg-white dark:bg-dark-850 border border-slate-200/80 dark:border-dark-700/80 rounded-2xl p-4 shadow-xs hover:border-emerald-500/30 transition-all flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-500 dark:text-dark-400 uppercase tracking-wider mb-1">Entradas (Transf)</p>
            <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums font-mono">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalEntradas)}
            </p>
            <p className="text-[10px] text-slate-400 dark:text-dark-500 mt-0.5">Aportes e transferências</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-xs flex-shrink-0">
            <ArrowUpRight size={20} />
          </div>
        </div>

        <div className={`bg-white dark:bg-dark-850 border rounded-2xl p-4 shadow-xs transition-all flex items-center justify-between ${
          saldoFinalEstimado < 0
            ? 'border-rose-500/30 dark:border-rose-500/40 hover:border-rose-500/50'
            : 'border-emerald-500/30 dark:border-emerald-500/40 hover:border-emerald-500/50'
        }`}>
          <div>
            <p className="text-[11px] font-bold text-slate-500 dark:text-dark-400 uppercase tracking-wider mb-1">Saldo Final Estimado</p>
            <p className={`text-xl font-black tabular-nums font-mono ${
              saldoFinalEstimado < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
            }`}>
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(saldoFinalEstimado)}
            </p>
            <p className="text-[10px] text-slate-400 dark:text-dark-500 mt-0.5">Caixa + Entradas - Despesas</p>
          </div>
          <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shadow-xs flex-shrink-0 ${
            saldoFinalEstimado < 0
              ? 'bg-rose-500/10 dark:bg-rose-500/15 border-rose-500/20 text-rose-600 dark:text-rose-400'
              : 'bg-emerald-500/10 dark:bg-emerald-500/15 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
          }`}>
            {saldoFinalEstimado < 0 ? <TrendingDown size={20} /> : <TrendingUp size={20} />}
          </div>
        </div>
      </div>

      {modalAgendamentoAberto && (
        <ModalAgendamento
          open={modalAgendamentoAberto}
          onClose={() => setModalAgendamentoAberto(false)}
          empresaAtiva={empresa}
          onSuccess={carregarPagamentos}
        />
      )}

      {modalTransferenciaAberto && (
        <ModalTransferencia
          open={modalTransferenciaAberto}
          onClose={() => setModalTransferenciaAberto(false)}
          empresaAtiva={empresa}
          empresas={lojasDoGrupo}
          onSuccess={() => { carregarPagamentos(); onTransferenciaGlobal?.() }}
        />
      )}

      {modalFolhaAberto && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white dark:bg-[#11141c] border border-slate-200 dark:border-dark-600 rounded-2xl p-6 w-full max-w-md shadow-2xl relative overflow-hidden transition-colors">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Importar Folha de Pagamento</h2>
            <p className="text-slate-500 dark:text-dark-300 text-sm mb-6 leading-relaxed">Por favor, informe a data de vencimento desta folha. A competência será calculada automaticamente.</p>

            <div className="mb-6">
              <label className="block text-xs font-bold text-slate-600 dark:text-dark-400 uppercase tracking-widest mb-2">
                Data de Vencimento
              </label>
              <input
                type="date"
                value={vencimentoFolha}
                onChange={e => setVencimentoFolha(e.target.value)}
                className="w-full bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-dark-600 text-slate-900 dark:text-white rounded-xl px-4 py-2.5 outline-none focus:border-brand-500 transition-all text-sm"
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setModalFolhaAberto(false)}
                className="px-4 py-2 text-slate-600 hover:text-slate-900 dark:text-dark-300 dark:hover:text-white transition-colors text-sm font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (arquivoFolha) {
                    processarArquivo(arquivoFolha, 'folha', vencimentoFolha)
                  }
                }}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-xl text-sm font-bold transition-all shadow-xs cursor-pointer"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {modalDetalhesDda && (
        <ModalDetalhesLancamentos
          open={modalDetalhesDda}
          onClose={() => setModalDetalhesDda(false)}
          titulo={`Lançamentos DDA — ${empresa.nome}`}
          lancamentos={pagamentosDda}
          mapaCnpjFornecedores={mapaCnpjFornecedores}
          onDelete={handleExcluirEmLote}
          onAgendar={handleAgendarEmLote}
          onVoltarAberto={handleVoltarAbertoEmLote}
          onEditarItem={(item) => { setItemEditando(item); setModalEdicaoAberto(true); setEditandoCategoriaEdicao(false); setEditandoContaEdicao(false); setEditandoFornecedorEdicao(false); }}
          onToggleStatus={toggleStatus}
          onEnviarContasAPagar={handleEnviarParaContasAPagar}
          onTransferirItem={(item) => abrirModalTransferir([item])}
          onTransferirLote={(itens) => abrirModalTransferir(itens)}
          onEditarEmMassa={abrirEdicaoEmMassa}
        />
      )}

      {modalDetalhesFolha && (
        <ModalDetalhesLancamentos
          open={modalDetalhesFolha}
          onClose={() => setModalDetalhesFolha(false)}
          titulo={`Folha de Pagamento — ${empresa.nome}`}
          lancamentos={pagamentosFolha}
          mapaCnpjFornecedores={mapaCnpjFornecedores}
          onDelete={handleExcluirEmLote}
          onAgendar={handleAgendarEmLote}
          onVoltarAberto={handleVoltarAbertoEmLote}
          onEditarItem={(item) => { setItemEditando(item); setModalEdicaoAberto(true); setEditandoCategoriaEdicao(false); setEditandoContaEdicao(false); setEditandoFornecedorEdicao(false); }}
          onToggleStatus={toggleStatus}
          onEnviarContasAPagar={handleEnviarParaContasAPagar}
          onTransferirItem={(item) => abrirModalTransferir([item])}
          onTransferirLote={(itens) => abrirModalTransferir(itens)}
          onEditarEmMassa={abrirEdicaoEmMassa}
        />
      )}

      {modalEdicaoMassaAberto && (
        <ModalEdicaoEmMassa
          open={modalEdicaoMassaAberto}
          onClose={() => setModalEdicaoMassaAberto(false)}
          itens={itensEdicaoMassa}
          contas={contasFinanceiras}
          categorias={categoriasCA}
          onConfirmar={handleConfirmarEdicaoEmMassa}
          salvando={salvandoEdicaoMassa}
        />
      )}

      {modalTransferirAberto && (
        <ModalTransferirLancamento
          open={modalTransferirAberto}
          onClose={() => setModalTransferirAberto(false)}
          itens={itensParaTransferir}
          empresaAtual={empresa}
          empresasDestino={lojasDoGrupo.filter(e => e.id !== empresa.id)}
          onConfirmar={handleConfirmarTransferirLancamentos}
          transferindo={transferindoLancamento}
        />
      )}

      {modalEdicaoAberto && itemEditando && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
          <form onSubmit={handleSalvarEdicao} className="bg-white dark:bg-[#11141c] border border-slate-200 dark:border-dark-600 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] transition-colors">
            <div className="p-5 border-b border-slate-200 dark:border-dark-700 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-transparent">
              <h3 className="text-slate-900 dark:text-white font-bold text-lg">Editar Lançamento</h3>
              <button type="button" onClick={() => setModalEdicaoAberto(false)} className="text-slate-400 hover:text-slate-700 dark:text-dark-400 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-800 transition-colors cursor-pointer">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
              {itemEditando.origem === 'DDA' ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 dark:text-dark-400 uppercase mb-1">Beneficiário <span className="text-rose-500">*</span></label>
                      {editandoFornecedorEdicao ? (
                        <SelectorFornecedor
                          valorInicial={itemEditando.beneficiario || ''}
                          empresaId={empresa.id}
                          onSelect={nome => { setItemEditando({ ...itemEditando, beneficiario: nome }); setEditandoFornecedorEdicao(false) }}
                          onCancel={() => setEditandoFornecedorEdicao(false)}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setEditandoFornecedorEdicao(true)}
                          className="w-full text-left bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-dark-600 rounded-xl px-3 py-2 text-slate-900 dark:text-white text-sm hover:border-brand-500 transition-all truncate cursor-pointer shadow-xs"
                        >
                          {itemEditando.beneficiario || <span className="text-slate-400 dark:text-dark-500">Clique para buscar...</span>}
                        </button>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 dark:text-dark-400 uppercase mb-1">Documento</label>
                      <input type="text" value={itemEditando.documento || ''} onChange={e => setItemEditando({ ...itemEditando, documento: e.target.value })} className="w-full bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-dark-600 text-slate-900 dark:text-white rounded-xl px-3 py-2 outline-none focus:border-brand-500 transition-all text-sm" placeholder="Nº do documento" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 dark:text-dark-400 uppercase mb-1">Categoria</label>
                      {editandoCategoriaEdicao ? (
                        <SelectorCategoria
                          valorInicial={itemEditando.categoria || ''}
                          categorias={categoriasCA}
                          onSelect={nome => { setItemEditando({ ...itemEditando, categoria: nome }); setEditandoCategoriaEdicao(false) }}
                          onCancel={() => setEditandoCategoriaEdicao(false)}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setEditandoCategoriaEdicao(true)}
                          className="w-full text-left bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-dark-600 rounded-xl px-3 py-2 text-slate-900 dark:text-white text-sm hover:border-brand-500 transition-all truncate cursor-pointer shadow-xs"
                        >
                          {itemEditando.categoria || <span className="text-slate-400 dark:text-dark-500">Clique para buscar...</span>}
                        </button>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 dark:text-dark-400 uppercase mb-1">Conta de Pagamento</label>
                      {editandoContaEdicao ? (
                        <SelectorContaFinanceira
                          valorInicial={itemEditando.conta_pagamento || ''}
                          contas={contasFinanceiras}
                          onSelect={nome => { setItemEditando({ ...itemEditando, conta_pagamento: nome }); setEditandoContaEdicao(false) }}
                          onCancel={() => setEditandoContaEdicao(false)}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setEditandoContaEdicao(true)}
                          className="w-full text-left bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-dark-600 rounded-xl px-3 py-2 text-slate-900 dark:text-white text-sm hover:border-brand-500 transition-all truncate cursor-pointer shadow-xs"
                        >
                          {itemEditando.conta_pagamento || <span className="text-slate-400 dark:text-dark-500">Clique para buscar...</span>}
                        </button>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-dark-400 uppercase mb-1">Descrição</label>
                    <input type="text" value={itemEditando.descricao || ''} onChange={e => setItemEditando({ ...itemEditando, descricao: e.target.value })} className="w-full bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-dark-600 text-slate-900 dark:text-white rounded-xl px-3 py-2 outline-none focus:border-brand-500 transition-all text-sm" placeholder="Detalhes..." />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 dark:text-dark-400 uppercase mb-1">Valor (R$) <span className="text-rose-500">*</span></label>
                      <InputMoeda value={Number(itemEditando.valor) || 0} onChange={v => setItemEditando({ ...itemEditando, valor: v })} className="w-full bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-dark-600 text-slate-900 dark:text-white rounded-xl px-3 py-2 outline-none focus:border-brand-500 transition-all text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 dark:text-dark-400 uppercase mb-1">Vencimento <span className="text-rose-500">*</span></label>
                      <input type="date" value={itemEditando.data_vencimento || ''} onChange={e => setItemEditando({ ...itemEditando, data_vencimento: e.target.value })} className="w-full bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-dark-600 text-slate-900 dark:text-white rounded-xl px-3 py-2 outline-none focus:border-brand-500 transition-all text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 dark:text-dark-400 uppercase mb-1">Data Pagamento</label>
                      <input type="date" value={itemEditando.data_pagamento || ''} onChange={e => setItemEditando({ ...itemEditando, data_pagamento: e.target.value })} className="w-full bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-dark-600 text-slate-900 dark:text-white rounded-xl px-3 py-2 outline-none focus:border-brand-500 transition-all text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 dark:text-dark-400 uppercase mb-1">Competência</label>
                      <input type="date" value={itemEditando.competencia || ''} onChange={e => setItemEditando({ ...itemEditando, competencia: e.target.value })} className="w-full bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-dark-600 text-slate-900 dark:text-white rounded-xl px-3 py-2 outline-none focus:border-brand-500 transition-all text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 dark:text-dark-400 uppercase mb-1">Situação</label>
                      <select value={itemEditando.status || 'aberto'} onChange={e => setItemEditando({ ...itemEditando, status: e.target.value })} className="w-full bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-dark-600 text-slate-900 dark:text-white rounded-xl px-3 py-2 outline-none focus:border-brand-500 transition-all text-sm cursor-pointer">
                        <option value="aberto">Em aberto</option>
                        <option value="agendado">Agendado</option>
                      </select>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 dark:text-dark-400 uppercase mb-1">Fornecedor / Colaborador</label>
                      {editandoFornecedorEdicao ? (
                        <SelectorFornecedor
                          valorInicial={itemEditando.fornecedor || ''}
                          empresaId={empresa.id}
                          onSelect={nome => { setItemEditando({ ...itemEditando, fornecedor: nome }); setEditandoFornecedorEdicao(false) }}
                          onCancel={() => setEditandoFornecedorEdicao(false)}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setEditandoFornecedorEdicao(true)}
                          className="w-full text-left bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-dark-600 rounded-xl px-3 py-2 text-slate-900 dark:text-white text-sm hover:border-brand-500 transition-all truncate cursor-pointer shadow-xs"
                        >
                          {itemEditando.fornecedor || <span className="text-slate-400 dark:text-dark-500">Clique para buscar...</span>}
                        </button>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 dark:text-dark-400 uppercase mb-1">Forma de Pagamento</label>
                      <select value={itemEditando.tipo || 'Outros'} onChange={e => setItemEditando({ ...itemEditando, tipo: e.target.value })} className="w-full bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-dark-600 text-slate-900 dark:text-white rounded-xl px-3 py-2 outline-none focus:border-brand-500 transition-all text-sm cursor-pointer">
                        <option value="PIX">PIX</option>
                        <option value="Boleto">Boleto</option>
                        <option value="TED">TED</option>
                        <option value="Imposto">Imposto</option>
                        <option value="Folha Mensal">Folha Mensal</option>
                        <option value="Adiantamento">Adiantamento</option>
                        <option value="Transferência">Transferência (saída)</option>
                        <option value="Transferência Recebida">Transferência Recebida (entrada)</option>
                        <option value="Outros">Outros</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 dark:text-dark-400 uppercase mb-1">Categoria</label>
                      {editandoCategoriaEdicao ? (
                        <SelectorCategoria
                          valorInicial={itemEditando.categoria || ''}
                          categorias={categoriasCA}
                          onSelect={nome => { setItemEditando({ ...itemEditando, categoria: nome }); setEditandoCategoriaEdicao(false) }}
                          onCancel={() => setEditandoCategoriaEdicao(false)}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setEditandoCategoriaEdicao(true)}
                          className="w-full text-left bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-dark-600 rounded-xl px-3 py-2 text-slate-900 dark:text-white text-sm hover:border-brand-500 transition-all truncate flex items-center justify-between cursor-pointer shadow-xs"
                        >
                          <span className={itemEditando.categoria ? "text-slate-900 dark:text-white" : "text-slate-400 dark:text-dark-500"}>
                            {itemEditando.categoria || 'Clique para buscar categoria do Conta Azul...'}
                          </span>
                          <ChevronDown size={14} className="text-slate-400 dark:text-dark-500" />
                        </button>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 dark:text-dark-400 uppercase mb-1">Conta de Pagamento</label>
                      {editandoContaEdicao ? (
                        <SelectorContaFinanceira
                          valorInicial={itemEditando.conta_pagamento || ''}
                          contas={contasFinanceiras}
                          onSelect={nome => { setItemEditando({ ...itemEditando, conta_pagamento: nome }); setEditandoContaEdicao(false) }}
                          onCancel={() => setEditandoContaEdicao(false)}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setEditandoContaEdicao(true)}
                          className="w-full text-left bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-dark-600 rounded-xl px-3 py-2 text-slate-900 dark:text-white text-sm hover:border-brand-500 transition-all truncate cursor-pointer shadow-xs"
                        >
                          {itemEditando.conta_pagamento || <span className="text-slate-400 dark:text-dark-500">Clique para buscar...</span>}
                        </button>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-dark-400 uppercase mb-1">Descrição</label>
                    <input type="text" value={itemEditando.descricao || ''} onChange={e => setItemEditando({ ...itemEditando, descricao: e.target.value })} className="w-full bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-dark-600 text-slate-900 dark:text-white rounded-xl px-3 py-2 outline-none focus:border-brand-500 transition-all text-sm" placeholder="Detalhes..." />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 dark:text-dark-400 uppercase mb-1">Valor (R$) <span className="text-rose-500">*</span></label>
                      <InputMoeda value={Number(itemEditando.valor) || 0} onChange={v => setItemEditando({ ...itemEditando, valor: v })} className="w-full bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-dark-600 text-slate-900 dark:text-white rounded-xl px-3 py-2 outline-none focus:border-brand-500 transition-all text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 dark:text-dark-400 uppercase mb-1">Vencimento <span className="text-rose-500">*</span></label>
                      <input type="date" value={itemEditando.data_vencimento || ''} onChange={e => setItemEditando({ ...itemEditando, data_vencimento: e.target.value })} className="w-full bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-dark-600 text-slate-900 dark:text-white rounded-xl px-3 py-2 outline-none focus:border-brand-500 transition-all text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 dark:text-dark-400 uppercase mb-1">Data Pagamento</label>
                      <input type="date" value={itemEditando.data_pagamento || ''} onChange={e => setItemEditando({ ...itemEditando, data_pagamento: e.target.value })} className="w-full bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-dark-600 text-slate-900 dark:text-white rounded-xl px-3 py-2 outline-none focus:border-brand-500 transition-all text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 dark:text-dark-400 uppercase mb-1">Competência</label>
                      <input type="date" value={itemEditando.competencia || ''} onChange={e => setItemEditando({ ...itemEditando, competencia: e.target.value })} className="w-full bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-dark-600 text-slate-900 dark:text-white rounded-xl px-3 py-2 outline-none focus:border-brand-500 transition-all text-sm" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 dark:text-dark-400 uppercase mb-1">CPF/CNPJ</label>
                      <input type="text" value={itemEditando.cpf_cnpj || ''} onChange={e => setItemEditando({ ...itemEditando, cpf_cnpj: e.target.value })} className="w-full bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-dark-600 text-slate-900 dark:text-white rounded-xl px-3 py-2 outline-none focus:border-brand-500 transition-all text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 dark:text-dark-400 uppercase mb-1">Chave PIX</label>
                      <input type="text" value={itemEditando.chave_pix || ''} onChange={e => setItemEditando({ ...itemEditando, chave_pix: e.target.value })} className="w-full bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-dark-600 text-slate-900 dark:text-white rounded-xl px-3 py-2 outline-none focus:border-brand-500 transition-all text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 dark:text-dark-400 uppercase mb-1">Situação</label>
                      <select value={itemEditando.status || 'aberto'} onChange={e => setItemEditando({ ...itemEditando, status: e.target.value })} className="w-full bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-dark-600 text-slate-900 dark:text-white rounded-xl px-3 py-2 outline-none focus:border-brand-500 transition-all text-sm cursor-pointer">
                        <option value="aberto">Em aberto</option>
                        <option value="agendado">Agendado</option>
                      </select>
                    </div>
                  </div>
                  {(itemEditando.tipo === 'Boleto' || itemEditando.tipo === 'Imposto') && (
                    <div>
                      <label className="block text-xs font-bold text-slate-600 dark:text-dark-400 uppercase mb-1">Código de Barras</label>
                      <input type="text" value={itemEditando.codigo_barras || ''} onChange={e => setItemEditando({ ...itemEditando, codigo_barras: e.target.value })} className="w-full bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-dark-600 text-slate-900 dark:text-white rounded-xl px-3 py-2 outline-none focus:border-brand-500 transition-all text-sm" placeholder="Código de barras ou linha digitável" />
                    </div>
                  )}
                  {itemEditando.anexo_url && (
                    <button
                      type="button"
                      onClick={() => handleAbrirAnexo(itemEditando)}
                      className="inline-flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 font-semibold cursor-pointer"
                    >
                      <Paperclip size={14} /> Ver anexo
                    </button>
                  )}
                </>
              )}
            </div>
            <div className="p-5 border-t border-slate-200 dark:border-dark-700 flex justify-end gap-3 bg-slate-50/50 dark:bg-[#0b0e14] shrink-0">
              <button type="button" onClick={() => setModalEdicaoAberto(false)} className="px-4 py-2 text-slate-600 hover:text-slate-900 dark:text-dark-300 dark:hover:text-white font-semibold text-sm cursor-pointer">
                Cancelar
              </button>
              <button type="submit" className="bg-brand-600 hover:bg-brand-500 text-white px-6 py-2 rounded-xl text-sm font-bold shadow-xs cursor-pointer">
                Salvar
              </button>
            </div>
          </form>
        </div>
      )}
      {modalAcoesAberto && itemAcoes && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white dark:bg-[#11141c] border border-slate-200 dark:border-dark-600 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col transition-colors">
            
            <div className="p-5 border-b border-slate-200 dark:border-dark-700 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-transparent">
              <h3 className="text-slate-900 dark:text-white font-bold text-lg">Ações do Lançamento</h3>
              <button onClick={() => setModalAcoesAberto(false)} className="text-slate-400 hover:text-slate-700 dark:text-dark-400 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-800 transition-colors cursor-pointer">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-5 text-left">
              <div>
                <div className="flex justify-between items-start mb-2">
                  <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded ${
                    itemAcoes.origem === 'Transferência Recebida' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : itemAcoes.origem === 'Transferência' ? 'bg-slate-100 dark:bg-dark-700 text-slate-600 dark:text-dark-300'
                    : 'bg-violet-500/10 text-violet-600 dark:text-violet-400'
                  }`}>
                    {itemAcoes.origem === 'Agendamento' ? 'Agendamento' : itemAcoes.origem}
                  </span>
                  <span className={`text-lg font-black ${itemAcoes.origem === 'Transferência Recebida' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(itemAcoes.valor)}
                  </span>
                </div>
                <h4 className="text-slate-900 dark:text-white font-bold text-base truncate">{itemAcoes.fornecedor || itemAcoes.beneficiario || 'Sem Fornecedor'}</h4>
                <p className="text-slate-500 dark:text-dark-400 text-xs mt-1">Categoria: <span className="text-slate-800 dark:text-dark-200 font-semibold">{itemAcoes.categoria || '—'}</span></p>
                {itemAcoes.descricao && (
                  <p className="text-slate-600 dark:text-dark-300 text-sm mt-3 bg-slate-50 dark:bg-dark-800/40 p-3 rounded-xl border border-slate-200 dark:border-dark-700/50 italic">
                    "{itemAcoes.descricao}"
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50 dark:bg-dark-850 p-3 rounded-xl border border-slate-200 dark:border-dark-700/50">
                <div>
                  <span className="text-slate-400 dark:text-dark-500 uppercase font-bold block mb-1">Vencimento</span>
                  <span className="text-slate-900 dark:text-white font-semibold">
                    {itemAcoes.data_vencimento ? itemAcoes.data_vencimento.split('-').reverse().join('/') : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 dark:text-dark-500 uppercase font-bold block mb-1">Data Pagamento</span>
                  <span className="text-slate-900 dark:text-white font-semibold">
                    {itemAcoes.data_pagamento ? itemAcoes.data_pagamento.split('-').reverse().join('/') : '—'}
                  </span>
                </div>
              </div>

              {itemAcoes.codigo_barras ? (
                <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Código de Barras</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(itemAcoes.codigo_barras)
                        toast.success('Código de barras copiado!')
                      }}
                      className="flex items-center gap-1 text-[10px] font-black text-blue-600 dark:text-blue-400 hover:text-blue-500 transition-colors bg-blue-500/10 px-2.5 py-1 rounded-lg cursor-pointer"
                      title="Copiar Código de Barras"
                    >
                      <Copy size={12} /> Copiar
                    </button>
                  </div>
                  <div className="font-mono text-xs text-slate-900 dark:text-white break-all bg-slate-100 dark:bg-dark-900/60 p-2.5 rounded-lg border border-slate-200 dark:border-dark-700/50 tabular-nums tracking-widest select-all">
                    {itemAcoes.codigo_barras}
                  </div>
                </div>
              ) : (
                (itemAcoes.tipo === 'Boleto' || itemAcoes.tipo === 'Imposto') && (
                  <p className="text-slate-400 dark:text-dark-500 text-xs italic text-center">Nenhum código de barras cadastrado.</p>
                )
              )}

              <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-dark-700/50">
                <span className="text-[10px] font-bold text-slate-400 dark:text-dark-500 uppercase tracking-widest block mb-1">Ações disponíveis</span>
                
                <div className="grid grid-cols-2 gap-2.5">
                  {itemAcoes.anexo_url ? (
                    <button
                      type="button"
                      onClick={() => handleAbrirAnexo(itemAcoes)}
                      className="flex items-center justify-center gap-2 bg-slate-50 hover:bg-slate-100 dark:bg-dark-800 dark:hover:bg-dark-700 border border-slate-200 dark:border-dark-600 text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 py-2.5 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-xs"
                    >
                      <Paperclip size={14} /> Ver Anexo
                    </button>
                  ) : (
                    <button
                      disabled
                      className="flex items-center justify-center gap-2 bg-slate-100/50 dark:bg-dark-800/40 border border-slate-200 dark:border-dark-700/30 text-slate-400 dark:text-dark-500 py-2.5 px-3 rounded-xl text-xs font-semibold cursor-not-allowed"
                    >
                      <Paperclip size={14} /> Sem Anexo
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setModalAcoesAberto(false)
                      setItemEditando(itemAcoes)
                      setModalEdicaoAberto(true)
                      setEditandoCategoriaEdicao(false)
                      setEditandoContaEdicao(false)
                      setEditandoFornecedorEdicao(false)
                    }}
                    className="flex items-center justify-center gap-2 bg-slate-50 hover:bg-slate-100 dark:bg-dark-800 dark:hover:bg-dark-700 border border-slate-200 dark:border-dark-600 text-slate-800 dark:text-white py-2.5 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-xs"
                  >
                    <Edit2 size={14} /> Editar
                  </button>

                  {itemAcoes.origem !== 'Transferência' ? (
                    <button
                      onClick={() => {
                        setModalAcoesAberto(false)
                        handleEnviarParaContasAPagar([itemAcoes])
                      }}
                      className="flex items-center justify-center gap-2 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-600 dark:text-blue-400 py-2.5 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                    >
                      <Send size={14} /> Enviar p/ CP
                    </button>
                  ) : (
                    <div className="flex items-center justify-center text-slate-400 dark:text-dark-500 text-xs italic bg-slate-100 dark:bg-dark-800/20 rounded-xl border border-slate-200 dark:border-dark-700/20">
                      Transf. externa
                    </div>
                  )}

                  <button
                    onClick={() => {
                      setModalAcoesAberto(false)
                      handleExcluirIndividual(itemAcoes.id, itemAcoes.origem)
                    }}
                    className="flex items-center justify-center gap-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-600 dark:text-rose-400 py-2.5 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                  >
                    <Trash2 size={14} /> Excluir
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Modal de Visualização Expandida de Código de Barras */}
      {itemCodigoBarras && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white dark:bg-[#11141c] border border-slate-200 dark:border-dark-600 rounded-2xl p-6 w-full max-w-lg shadow-2xl relative overflow-hidden transition-colors">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-dark-700 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Barcode size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Código de Barras do Boleto</h3>
                  <p className="text-xs text-slate-500 dark:text-dark-400">Linha digitável / código para pagamento</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setItemCodigoBarras(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-dark-700 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-slate-50 dark:bg-dark-800/60 rounded-xl p-3.5 border border-slate-200 dark:border-dark-700/60 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 dark:text-dark-500 block uppercase font-bold text-[10px]">Beneficiário</span>
                  <span className="font-semibold text-slate-900 dark:text-white truncate block">
                    {itemCodigoBarras.beneficiario || itemCodigoBarras.fornecedor || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 dark:text-dark-500 block uppercase font-bold text-[10px]">Valor</span>
                  <span className="font-black text-rose-600 dark:text-rose-400 tabular-nums">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(itemCodigoBarras.valor || 0)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 dark:text-dark-500 block uppercase font-bold text-[10px]">Vencimento</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {itemCodigoBarras.data_vencimento ? itemCodigoBarras.data_vencimento.split('-').reverse().join('/') : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 dark:text-dark-500 block uppercase font-bold text-[10px]">Nº Documento</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {itemCodigoBarras.documento || 'S/N'}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-dark-400 uppercase tracking-wider mb-1.5">
                  Linha Digitável / Código Completo
                </label>
                <div className="font-mono text-sm text-slate-900 dark:text-white break-all bg-slate-100 dark:bg-dark-900/90 p-4 rounded-xl border border-slate-200 dark:border-dark-700 tabular-nums tracking-widest select-all leading-relaxed">
                  {itemCodigoBarras.codigo_barras}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setItemCodigoBarras(null)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-dark-300 hover:bg-slate-100 dark:hover:bg-dark-700 transition-colors cursor-pointer"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(itemCodigoBarras.codigo_barras)
                    toast.success('Código de barras copiado com sucesso!')
                  }}
                  className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                >
                  <Copy size={14} /> Copiar Código de Barras
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
