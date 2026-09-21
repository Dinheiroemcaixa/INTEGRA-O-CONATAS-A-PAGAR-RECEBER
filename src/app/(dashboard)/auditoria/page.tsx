'use client'

import React, { useState, useEffect } from 'react'
import { useEmpresa } from '@/contexts/EmpresaContext'
import SelectorEmpresa from '@/components/layout/SelectorEmpresa'
import {
  ShieldCheck,
  ShieldAlert,
  Users,
  Copy,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Filter,
  Calendar,
  Layers,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Loader2,
  Search,
  DollarSign,
  ArrowRight,
  Info,
  RefreshCw,
  BookmarkCheck,
  PlusCircle,
  Check,
  Sliders,
  Clock,
  Database,
  FileText
} from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'
import type {
  FornecedorRegra,
  ConsistenciaResult,
  SemelhantesResult,
  DuplicidadesResult,
  HistoricoResult,
  FornecedorConsistenciaAudit
} from '@/lib/auditoria'

type TabAuditoria = 'consistencia' | 'semelhantes' | 'duplicidades' | 'historico'

export default function AuditoriaPage() {
  const { empresaAtiva, loading: loadingEmpresa } = useEmpresa()

  const [activeTab, setActiveTab] = useState<TabAuditoria>('consistencia')

  // A) Base Histórica de Aprendizagem (para aprender o padrão dos fornecedores)
  const [historicoAprendizagem, setHistoricoAprendizagem] = useState<'3m' | '6m' | '12m' | 'todos'>('12m')

  // B) Período a Auditar (quais lançamentos serão auditados para divergências)
  type PresetPeriodoAuditado = 'todos' | 'hoje' | 'ontem' | '7d' | '15d' | '30d' | 'mes_atual' | 'mes_anterior' | 'personalizado'
  const [presetAuditado, setPresetAuditado] = useState<PresetPeriodoAuditado>('todos')
  const [dataInicioAudit, setDataInicioAudit] = useState<string>('')
  const [dataFimAudit, setDataFimAudit] = useState<string>('')

  const [confiancaMinima, setConfiancaMinima] = useState<number>(80)

  // Helper para calcular o intervalo de datas do período auditado
  const calcularRangeAuditado = (): string | null => {
    if (presetAuditado === 'todos') return null

    const formatYMD = (d: Date) => d.toISOString().split('T')[0]
    const hoje = new Date()

    if (presetAuditado === 'hoje') {
      const d = formatYMD(hoje)
      return `${d}:${d}`
    }
    if (presetAuditado === 'ontem') {
      const ontem = new Date()
      ontem.setDate(hoje.getDate() - 1)
      const d = formatYMD(ontem)
      return `${d}:${d}`
    }
    if (presetAuditado === '7d') {
      const dIni = new Date()
      dIni.setDate(hoje.getDate() - 7)
      return `${formatYMD(dIni)}:${formatYMD(hoje)}`
    }
    if (presetAuditado === '15d') {
      const dIni = new Date()
      dIni.setDate(hoje.getDate() - 15)
      return `${formatYMD(dIni)}:${formatYMD(hoje)}`
    }
    if (presetAuditado === '30d') {
      const dIni = new Date()
      dIni.setDate(hoje.getDate() - 30)
      return `${formatYMD(dIni)}:${formatYMD(hoje)}`
    }
    if (presetAuditado === 'mes_atual') {
      const dIni = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
      const dFim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)
      return `${formatYMD(dIni)}:${formatYMD(dFim)}`
    }
    if (presetAuditado === 'mes_anterior') {
      const dIni = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)
      const dFim = new Date(hoje.getFullYear(), hoje.getMonth(), 0)
      return `${formatYMD(dIni)}:${formatYMD(dFim)}`
    }
    if (presetAuditado === 'personalizado') {
      if (dataInicioAudit && dataFimAudit) {
        return `${dataInicioAudit}:${dataFimAudit}`
      }
      if (dataInicioAudit) {
        return dataInicioAudit
      }
      return null
    }
    return null
  }

  const [loading, setLoading] = useState<boolean>(false)
  const [sincronizando, setSincronizando] = useState<boolean>(false)
  const [executado, setExecutado] = useState<boolean>(false)

  // Status da sincronização
  const [totalEspelhados, setTotalEspelhados] = useState<number>(0)
  const [ultimaSincronizacao, setUltimaSincronizacao] = useState<string | null>(null)

  // Estados com os resultados dos módulos
  const [dadosConsistencia, setDadosConsistencia] = useState<ConsistenciaResult | null>(null)
  const [dadosSemelhantes, setDadosSemelhantes] = useState<SemelhantesResult | null>(null)
  const [dadosDuplicidades, setDadosDuplicidades] = useState<DuplicidadesResult | null>(null)
  const [dadosHistorico, setDadosHistorico] = useState<HistoricoResult | null>(null)

  // Filtros de busca no cliente
  const [buscaFornecedor, setBuscaFornecedor] = useState<string>('')
  
  // Governança Contábil (Fase 5A: Memória e Regras)
  const [subTabConsistencia, setSubTabConsistencia] = useState<'divergencias' | 'pendentes' | 'regras'>('divergencias')
  const [regrasCadastradas, setRegrasCadastradas] = useState<FornecedorRegra[]>([])
  const [carregandoRegras, setCarregandoRegras] = useState<boolean>(false)
  const [modalRegraAberto, setModalRegraAberto] = useState<boolean>(false)
  const [salvandoRegra, setSalvandoRegra] = useState<boolean>(false)
  const [formRegra, setFormRegra] = useState<{
    fornecedor_nome: string
    fornecedor_id_conta_azul?: string | null
    categoria_nome: string
    tipo_regra: 'PADRAO' | 'DIA_DO_MES' | 'MES_DO_ANO' | 'FAIXA_VALOR'
    valor_regra: string
    prioridade: number
  }>({
    fornecedor_nome: '',
    fornecedor_id_conta_azul: null,
    categoria_nome: '',
    tipo_regra: 'PADRAO',
    valor_regra: '',
    prioridade: 10
  })
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  const toggleExpand = (fornecedorKey: string) => {
    setExpandedRow((prev) => (prev === fornecedorKey ? null : fornecedorKey))
  }

  // Buscar status atual da tabela espelho
  const carregarStatusSincronizacao = async () => {
    if (!empresaAtiva?.id) return
    try {
      const res = await fetch(`/api/conta-azul/contas-pagar/sincronizar?empresa_id=${empresaAtiva.id}`)
      if (res.ok) {
        const data = await res.json()
        setTotalEspelhados(data.total_espelhados || 0)
        setUltimaSincronizacao(data.ultima_sincronizacao || null)
      }
    } catch (err) {
      console.error('Erro ao consultar status da sincronização:', err)
    }
  }

  // Carregar regras contábeis da empresa
  const carregarRegrasContabeis = async () => {
    if (!empresaAtiva?.id) return
    setCarregandoRegras(true)
    try {
      const res = await fetch(`/api/auditoria/regras?empresa_id=${empresaAtiva.id}`)
      if (res.ok) {
        const data = await res.json()
        setRegrasCadastradas(data.regras || [])
      }
    } catch (e) {
      console.error('Erro ao carregar regras:', e)
    } finally {
      setCarregandoRegras(false)
    }
  }

  // Aprovar categoria diretamente como regra PADRAO (Governança com 1 clique)
  const aprovarCategoriaPadrao = async (
    fornecedor_nome: string,
    categoria_nome: string,
    fornecedor_id_conta_azul?: string | null
  ) => {
    if (!empresaAtiva?.id) return
    const toastId = toast.loading(`Aprovando "${categoria_nome}" para ${fornecedor_nome}...`)
    try {
      const res = await fetch('/api/auditoria/regras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empresa_id: empresaAtiva.id,
          fornecedor_nome,
          fornecedor_id_conta_azul: fornecedor_id_conta_azul || null,
          categoria_nome,
          tipo_regra: 'PADRAO',
          prioridade: 10
        })
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Erro ao homologar categoria.')
      }

      toast.success(`Categoria "${categoria_nome}" oficializada com sucesso!`, { id: toastId })
      await carregarRegrasContabeis()
      await executarAuditoria(activeTab)
    } catch (e: any) {
      toast.error(e.message || 'Falha ao salvar regra.', { id: toastId })
    }
  }

  // Salvar regra avançada (Dia do Mês, Mês do Ano, Faixa de Valor)
  const salvarRegraAvancada = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!empresaAtiva?.id) return
    if (!formRegra.fornecedor_nome || !formRegra.categoria_nome) {
      toast.error('Preencha o fornecedor e a categoria.')
      return
    }

    setSalvandoRegra(true)
    const toastId = toast.loading('Salvando regra contábil...')
    try {
      const res = await fetch('/api/auditoria/regras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empresa_id: empresaAtiva.id,
          ...formRegra
        })
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Falha ao cadastrar regra.')
      }

      toast.success('Regra de auditoria criada com sucesso!', { id: toastId })
      setModalRegraAberto(false)
      await carregarRegrasContabeis()
      await executarAuditoria(activeTab)
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar.', { id: toastId })
    } finally {
      setSalvandoRegra(false)
    }
  }

  // Excluir ou desativar regra
  const excluirRegra = async (id: string) => {
    if (!confirm('Deseja realmente remover esta regra de auditoria?')) return
    try {
      const res = await fetch(`/api/auditoria/regras?id=${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Regra removida.')
        await carregarRegrasContabeis()
        await executarAuditoria(activeTab)
      }
    } catch (e) {
      toast.error('Falha ao remover regra.')
    }
  }

  // Abrir modal configurado
  const abrirModalCriarRegra = (
    fornecedor_nome = '',
    categoria_nome = '',
    fornecedor_id_conta_azul: string | null = null,
    tipo: 'PADRAO' | 'DIA_DO_MES' | 'MES_DO_ANO' | 'FAIXA_VALOR' = 'DIA_DO_MES',
    valor_sugerido = ''
  ) => {
    setFormRegra({
      fornecedor_nome,
      categoria_nome,
      fornecedor_id_conta_azul,
      tipo_regra: tipo,
      valor_regra: valor_sugerido,
      prioridade: tipo === 'PADRAO' ? 10 : 20
    })
    setModalRegraAberto(true)
  }

  // Carregar regras ao selecionar empresa
  useEffect(() => {
    if (empresaAtiva?.id) {
      carregarRegrasContabeis()
    }
  }, [empresaAtiva?.id])

    // Disparar sincronização com o Conta Azul
  const sincronizarContaAzul = async () => {
    if (!empresaAtiva?.id) {
      toast.error('Selecione uma empresa antes de sincronizar.')
      return
    }

    setSincronizando(true)
    const toastId = toast.loading('Buscando contas a pagar no Conta Azul (ERP)...')

    try {
      const res = await fetch('/api/conta-azul/contas-pagar/sincronizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empresa_id: empresaAtiva.id,
          meses: historicoAprendizagem === '3m' ? 3 : historicoAprendizagem === '6m' ? 6 : 12
        })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Erro ao sincronizar com o Conta Azul.')
      }

      toast.success(
        `Sincronização concluída! ${data.total_sincronizados} lançamentos espelhados.`,
        { id: toastId }
      )

      await carregarStatusSincronizacao()
      // Dispara a auditoria automaticamente sobre a nova base
      await executarAuditoria(activeTab)
    } catch (err: any) {
      console.error(err)
      toast.error(err.message || 'Falha ao sincronizar com o ERP.', { id: toastId })
    } finally {
      setSincronizando(false)
    }
  }

  // Executar auditoria sob demanda via POST /api/auditoria
  const executarAuditoria = async (moduloAlvo = activeTab) => {
    if (!empresaAtiva?.id) {
      toast.error('Selecione uma empresa antes de executar a auditoria.')
      return
    }

    setLoading(true)
    try {
      const rangeAuditado = calcularRangeAuditado()
      const payload: Record<string, any> = {
        modulo: moduloAlvo,
        empresa_id: empresaAtiva.id,
        periodo: historicoAprendizagem,
        marco_zero: rangeAuditado,
        confianca_minima: confiancaMinima
      }

      const res = await fetch('/api/auditoria', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Erro ao processar auditoria.')
      }

      if (moduloAlvo === 'consistencia') {
        setDadosConsistencia(data)
      } else if (moduloAlvo === 'semelhantes') {
        setDadosSemelhantes(data)
      } else if (moduloAlvo === 'duplicidades') {
        setDadosDuplicidades(data)
      } else if (moduloAlvo === 'historico') {
        setDadosHistorico(data)
      }

      setExecutado(true)
      toast.success('Auditoria processada com sucesso!')
    } catch (err: any) {
      console.error(err)
      toast.error(err.message || 'Falha ao executar auditoria.')
    } finally {
      setLoading(false)
    }
  }

  const handleTabChange = (tab: TabAuditoria) => {
    setActiveTab(tab)
    if (tab === 'consistencia' && !dadosConsistencia && empresaAtiva?.id) {
      executarAuditoria('consistencia')
    } else if (tab === 'semelhantes' && !dadosSemelhantes && empresaAtiva?.id) {
      executarAuditoria('semelhantes')
    } else if (tab === 'duplicidades' && !dadosDuplicidades && empresaAtiva?.id) {
      executarAuditoria('duplicidades')
    } else if (tab === 'historico' && !dadosHistorico && empresaAtiva?.id) {
      executarAuditoria('historico')
    }
  }

  useEffect(() => {
    if (empresaAtiva?.id) {
      carregarStatusSincronizacao()
      executarAuditoria('consistencia')
    }
  }, [empresaAtiva?.id])

  const fornecedoresFiltrados = (dadosConsistencia?.fornecedores_divergentes || []).filter((f) =>
    f.fornecedor_original.toLowerCase().includes(buscaFornecedor.toLowerCase())
  )

  const multiescopoFiltrados = (dadosConsistencia?.fornecedores_multiescopo || []).filter((f) =>
    f.fornecedor_original.toLowerCase().includes(buscaFornecedor.toLowerCase())
  )

  const fonteAtual = dadosConsistencia?.fonte_dados || 'CONTA_AZUL_ESPELHO'

  return (
    <div className="min-h-screen bg-[#0a0f1d] text-slate-100 p-4 md:p-8 space-y-6">
      {/* Cabeçalho da Área */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 shadow-inner">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
                  Auditoria Financeira
                </h1>
                <span
                  className={cn(
                    'text-[11px] font-semibold tracking-wider px-2.5 py-0.5 rounded-full border',
                    fonteAtual === 'CONTA_AZUL_ESPELHO'
                      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                      : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                  )}
                >
                  {fonteAtual === 'CONTA_AZUL_ESPELHO' ? 'FONTE: CONTA AZUL (ERP)' : 'FONTE: LOCAL'}
                </span>
                <span className="text-[11px] font-semibold tracking-wider px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                  FASE 2
                </span>
              </div>
              <p className="text-sm text-slate-400 mt-0.5">
                Diagnóstico de integridade cadastral e consistência dos lançamentos do Conta Azul
              </p>
            </div>
          </div>
        </div>

        {/* Seletor de Loja */}
        <div className="flex items-center gap-3">
          <SelectorEmpresa />
        </div>
      </div>

      {/* Painel de Controles & Sincronização */}
      <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-4 shadow-xl backdrop-blur-md space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* 1. Período a Auditar */}
            <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-cyan-500/20 text-xs text-slate-300">
              <Filter className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-cyan-300 font-medium">Auditar:</span>
              <select
                value={presetAuditado}
                onChange={(e) => setPresetAuditado(e.target.value as any)}
                className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer"
              >
                <option value="todos" className="bg-slate-900">Todo o Período Histórico</option>
                <option value="hoje" className="bg-slate-900">Hoje</option>
                <option value="ontem" className="bg-slate-900">Ontem</option>
                <option value="7d" className="bg-slate-900">Últimos 7 dias</option>
                <option value="15d" className="bg-slate-900">Últimos 15 dias</option>
                <option value="30d" className="bg-slate-900">Últimos 30 dias</option>
                <option value="mes_atual" className="bg-slate-900">Este Mês</option>
                <option value="mes_anterior" className="bg-slate-900">Mês Anterior</option>
                <option value="personalizado" className="bg-slate-900">Personalizado (De / Até)</option>
              </select>
            </div>

            {/* Inputs de Data para Período Personalizado */}
            {presetAuditado === 'personalizado' && (
              <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-white/10 text-xs text-slate-300">
                <span className="text-slate-400">De:</span>
                <input
                  type="date"
                  value={dataInicioAudit}
                  onChange={(e) => setDataInicioAudit(e.target.value)}
                  className="bg-transparent text-white focus:outline-none cursor-pointer"
                />
                <span className="text-slate-400 ml-1">Até:</span>
                <input
                  type="date"
                  value={dataFimAudit}
                  onChange={(e) => setDataFimAudit(e.target.value)}
                  className="bg-transparent text-white focus:outline-none cursor-pointer"
                />
                {(dataInicioAudit || dataFimAudit) && (
                  <button
                    onClick={() => { setDataInicioAudit(''); setDataFimAudit(''); }}
                    className="text-slate-400 hover:text-white text-[10px] ml-1"
                    title="Limpar datas"
                  >
                    ✕
                  </button>
                )}
              </div>
            )}

            {/* 2. Base Histórica de Aprendizagem */}
            <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-white/5 text-xs text-slate-300">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-slate-400">Aprendizagem:</span>
              <select
                value={historicoAprendizagem}
                onChange={(e) => setHistoricoAprendizagem(e.target.value as any)}
                className="bg-transparent text-white font-medium focus:outline-none cursor-pointer"
                title="Janela histórica utilizada para aprender a categoria padrão de cada fornecedor"
              >
                <option value="12m" className="bg-slate-900">Últimos 12 meses (Recomendado)</option>
                <option value="6m" className="bg-slate-900">Últimos 6 meses</option>
                <option value="3m" className="bg-slate-900">Últimos 3 meses</option>
                <option value="todos" className="bg-slate-900">Todo o Histórico</option>
              </select>
            </div>

            {/* 3. Confiança Mínima */}
            {activeTab === 'consistencia' && (
              <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-white/5 text-xs text-slate-300">
                <span className="text-slate-400">Confiança:</span>
                <select
                  value={confiancaMinima}
                  onChange={(e) => setConfiancaMinima(Number(e.target.value))}
                  className="bg-transparent text-white font-medium focus:outline-none cursor-pointer"
                >
                  <option value={70} className="bg-slate-900">≥ 70%</option>
                  <option value={80} className="bg-slate-900">≥ 80% (Padrão)</option>
                  <option value={90} className="bg-slate-900">≥ 90% (Rigoroso)</option>
                </select>
              </div>
            )}
          </div>

          {/* Botões de Ação */}
          <div className="flex items-center gap-2.5">
            {/* Botão Sincronizar ERP */}
            <button
              onClick={sincronizarContaAzul}
              disabled={sincronizando || !empresaAtiva}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 font-semibold text-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              title="Baixar lançamentos de contas a pagar diretamente do Conta Azul para a base espelho"
            >
              <RefreshCw className={cn('w-3.5 h-3.5 text-cyan-400', sincronizando && 'animate-spin')} />
              <span>{sincronizando ? 'Sincronizando ERP...' : 'Sincronizar ERP'}</span>
            </button>

            {/* Botão Analisar Auditoria */}
            <button
              onClick={() => executarAuditoria(activeTab)}
              disabled={loading || !empresaAtiva}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold text-xs tracking-wide shadow-lg shadow-cyan-500/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Analisando...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Analisar Auditoria</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Indicador de Status da Tabela Espelho */}
        <div className="pt-2 border-t border-white/5 flex flex-wrap items-center justify-between text-[11px] text-slate-400 gap-2">
          <div className="flex items-center gap-2">
            <Database className="w-3.5 h-3.5 text-cyan-400" />
            <span>
              Base Espelho do Conta Azul:{' '}
              <strong className="text-white">{totalEspelhados.toLocaleString('pt-BR')}</strong> lançamentos armazenados
            </span>
          </div>
          {ultimaSincronizacao && (
            <div className="flex items-center gap-1.5 text-slate-400">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>Última sincronização: {new Date(ultimaSincronizacao).toLocaleString('pt-BR')}</span>
            </div>
          )}
        </div>
      </div>

      {/* Cards de Risco Financeiro */}
      {dadosConsistencia && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900/70 border border-white/10 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Lançamentos Auditados</span>
              <FileText className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="mt-2">
              <div className="text-2xl font-bold text-white">
                {dadosConsistencia.resumo.total_lancamentos_auditados.toLocaleString('pt-BR')}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {dadosConsistencia.resumo.total_fornecedores_auditados} fornecedores distintos
              </p>
            </div>
          </div>

          <div className="bg-slate-900/70 border border-white/10 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Conformidade Cadastral</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="mt-2">
              <div className="text-2xl font-bold text-emerald-400">
                {dadosConsistencia.resumo.taxa_conformidade_cadastral}%
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {dadosConsistencia.resumo.fornecedores_consistentes} fornecedores 100% regulares
              </p>
            </div>
          </div>

          <div className="bg-slate-900/70 border border-white/10 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Divergências Detectadas</span>
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>
            <div className="mt-2">
              <div className="text-2xl font-bold text-amber-400">
                {dadosConsistencia.resumo.fornecedores_com_divergencia}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {dadosConsistencia.resumo.fornecedores_multiescopo} identificados como multiescopo
              </p>
            </div>
          </div>

          <div className="bg-gradient-to-br from-rose-950/40 to-slate-900 border border-rose-500/30 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
            <div className="flex items-center justify-between text-rose-300 text-xs font-semibold">
              <span>Risco Financeiro Sob Suspeita</span>
              <DollarSign className="w-4 h-4 text-rose-400" />
            </div>
            <div className="mt-2">
              <div className="text-2xl font-bold text-rose-400">
                R$ {dadosConsistencia.resumo.valor_total_divergente.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <p className="text-[11px] text-rose-300/80 mt-1">
                {dadosConsistencia.resumo.percentual_risco_financeiro}% do total auditado (R$ {dadosConsistencia.resumo.valor_total_auditado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Navegação entre as 4 Abas */}
      <div className="flex items-center gap-2 border-b border-white/10 overflow-x-auto pb-1">
        <button
          onClick={() => handleTabChange('consistencia')}
          className={cn(
            'flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-all whitespace-nowrap',
            activeTab === 'consistencia'
              ? 'border-cyan-500 text-cyan-400 bg-cyan-500/10 rounded-t-xl'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          )}
        >
          <ShieldAlert className="w-4 h-4" />
          <span>(1) Consistência de Categorias</span>
          {dadosConsistencia && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {dadosConsistencia.resumo.fornecedores_com_divergencia}
            </span>
          )}
        </button>

        <button
          onClick={() => handleTabChange('semelhantes')}
          className={cn(
            'flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-all whitespace-nowrap',
            activeTab === 'semelhantes'
              ? 'border-cyan-500 text-cyan-400 bg-cyan-500/10 rounded-t-xl'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          )}
        >
          <Users className="w-4 h-4" />
          <span>(2) Fornecedores Semelhantes</span>
          {dadosSemelhantes && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
              {dadosSemelhantes.resumo.total_grupos_duplicidade_encontrados}
            </span>
          )}
        </button>

        <button
          onClick={() => handleTabChange('duplicidades')}
          className={cn(
            'flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-all whitespace-nowrap',
            activeTab === 'duplicidades'
              ? 'border-cyan-500 text-cyan-400 bg-cyan-500/10 rounded-t-xl'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          )}
        >
          <Copy className="w-4 h-4" />
          <span>(3) Possíveis Duplicidades</span>
          {dadosDuplicidades && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30">
              {dadosDuplicidades.resumo.total_grupos_duplicidade}
            </span>
          )}
        </button>

        <button
          onClick={() => handleTabChange('historico')}
          className={cn(
            'flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-all whitespace-nowrap',
            activeTab === 'historico'
              ? 'border-cyan-500 text-cyan-400 bg-cyan-500/10 rounded-t-xl'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          )}
        >
          <TrendingUp className="w-4 h-4" />
          <span>(4) Histórico & Conformidade</span>
        </button>
      </div>

      {/* CONTEÚDO DA ABA 1: CONSISTÊNCIA DE CATEGORIAS (GOVERNANÇA + ESTATÍSTICA) */}
      {activeTab === 'consistencia' && dadosConsistencia && (
        <div className="space-y-4">
          {/* SUB-ABAS DE GOVERNANÇA: Divergências vs Pendentes vs Regras */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 p-2 rounded-2xl border border-white/10 shadow-lg">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setSubTabConsistencia('divergencias')}
                className={cn(
                  'flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all',
                  subTabConsistencia === 'divergencias'
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                )}
              >
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                <span>Inconsistências Detectadas</span>
                <span className="px-1.5 py-0.2 rounded-full bg-rose-500/20 text-[10px] font-mono">
                  {dadosConsistencia.resumo.fornecedores_com_divergencia}
                </span>
              </button>

              <button
                onClick={() => setSubTabConsistencia('pendentes')}
                className={cn(
                  'flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all',
                  subTabConsistencia === 'pendentes'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                )}
              >
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>Pendentes de Homologação</span>
                <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-[10px] font-mono">
                  {dadosConsistencia.resumo.fornecedores_pendentes || 0}
                </span>
              </button>

              <button
                onClick={() => setSubTabConsistencia('regras')}
                className={cn(
                  'flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all',
                  subTabConsistencia === 'regras'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                )}
              >
                <BookmarkCheck className="w-3.5 h-3.5 text-cyan-400" />
                <span>Regras Homologadas (Memória)</span>
                <span className="px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-[10px] font-mono">
                  {dadosConsistencia.resumo.total_regras_ativas || regrasCadastradas.length}
                </span>
              </button>
            </div>

            <button
              onClick={() => abrirModalCriarRegra()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 text-xs font-semibold transition-all shadow-md"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Nova Regra de Fornecedor</span>
            </button>
          </div>

          {/* BARRA DE FILTRO POR NOME */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/40 p-3 rounded-xl border border-white/5">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={buscaFornecedor}
                onChange={(e) => setBuscaFornecedor(e.target.value)}
                placeholder="Filtrar por nome do fornecedor..."
                className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-800/80 border border-white/10 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="text-xs text-slate-400 flex items-center gap-2">
              <Info className="w-4 h-4 text-cyan-400" />
              <span>
                {subTabConsistencia === 'divergencias' && 'Exibindo violações de regras homologadas e anomalias estatísticas.'}
                {subTabConsistencia === 'pendentes' && 'Fornecedores sem regra homologada aguardando validação do usuário.'}
                {subTabConsistencia === 'regras' && 'Base de conhecimento contábil validada pelo usuário.'}
              </span>
            </div>
          </div>

          {/* ========================================================= */}
          {/* SUB-ABA: INCONSISTÊNCIAS DETECTADAS                       */}
          {/* ========================================================= */}
          {subTabConsistencia === 'divergencias' && (
            <div className="space-y-4">
              {fornecedoresFiltrados.length === 0 && !loading && (
                <div className="text-center py-12 bg-slate-900/30 border border-white/5 rounded-2xl">
                  <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3 opacity-80" />
                  <h3 className="text-lg font-semibold text-white">Nenhuma inconsistência encontrada no período!</h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                    Todos os lançamentos analisados estão em perfeita conformidade com as regras homologadas e histórico contábil.
                  </p>
                </div>
              )}

              {fornecedoresFiltrados.map((forn) => {
                const isExpanded = expandedRow === forn.fornecedor_normalizado
                const valorTotalDivergenteForn = forn.divergencias.reduce((acc, d) => acc + d.valor, 0)
                const possuiRegra = forn.status_governanca === 'DIVERGENTE' && forn.regra_ativa

                return (
                  <div
                    key={forn.fornecedor_normalizado}
                    className="bg-slate-900/80 border border-white/10 rounded-2xl overflow-hidden shadow-lg transition-all"
                  >
                    <div
                      onClick={() => toggleExpand(forn.fornecedor_normalizado)}
                      className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 cursor-pointer hover:bg-slate-800/40 select-none"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2.5">
                          <span className="font-semibold text-white text-sm">
                            {forn.fornecedor_original}
                          </span>
                          {possuiRegra ? (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/30 font-medium">
                              Regra Homologada Violada
                            </span>
                          ) : (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 font-medium">
                              Inferência Histórica ({forn.confianca_percentual}%)
                            </span>
                          )}
                          {forn.is_pessoal_rh && (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                              RH / Folha
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 flex items-center gap-2">
                          <span>Categoria esperada:</span>
                          <strong className="text-cyan-300 font-medium">
                            {forn.categoria_predominante}
                          </strong>
                        </div>
                      </div>

                      <div className="flex items-center justify-between lg:justify-end gap-6">
                        <div className="text-right">
                          <div className="text-xs text-slate-400">Divergências</div>
                          <div className="text-sm font-bold text-amber-400">
                            {forn.divergencias.length} lançamentos
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-xs text-slate-400">Impacto Financeiro</div>
                          <div className="text-sm font-bold text-rose-400">
                            R$ {valorTotalDivergenteForn.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </div>
                        </div>

                        <div className="p-1 rounded-lg bg-slate-800 text-slate-300">
                          {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-white/5 bg-slate-950/40 p-4 space-y-3">
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs text-left">
                            <thead className="bg-slate-800/40 text-slate-400 font-semibold uppercase text-[10px]">
                              <tr>
                                <th className="p-2.5">Documento / Venc.</th>
                                <th className="p-2.5">Descrição</th>
                                <th className="p-2.5">Valor</th>
                                <th className="p-2.5">Categoria Atual</th>
                                <th className="p-2.5">Categoria Esperada</th>
                                <th className="p-2.5">Motivo Técnico</th>
                                <th className="p-2.5 text-right">Ações de Governança</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                              {forn.divergencias.map((div) => (
                                <tr key={div.id} className="hover:bg-slate-800/20">
                                  <td className="p-2.5 text-slate-300 whitespace-nowrap">
                                    <div className="font-semibold text-white">{div.doc || 'S/N'}</div>
                                    <div className="text-[10px] text-slate-400">{div.vencimento || 'Sem data'}</div>
                                  </td>
                                  <td className="p-2.5 text-slate-300 max-w-[200px] truncate" title={div.descricao || ''}>
                                    {div.descricao || 'Sem descrição'}
                                  </td>
                                  <td className="p-2.5 text-slate-200 font-mono font-semibold whitespace-nowrap">
                                    R$ {div.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                  </td>
                                  <td className="p-2.5 whitespace-nowrap">
                                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30">
                                      {div.categoria_atual}
                                    </span>
                                  </td>
                                  <td className="p-2.5 whitespace-nowrap">
                                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                      {div.categoria_esperada}
                                    </span>
                                  </td>
                                  <td className="p-2.5 text-[11px] text-slate-300 max-w-[280px]">
                                    {div.motivo}
                                  </td>
                                  <td className="p-2.5 text-right whitespace-nowrap space-x-1.5">
                                    <button
                                      onClick={() => aprovarCategoriaPadrao(forn.fornecedor_original, div.categoria_atual, forn.fornecedor_id_conta_azul)}
                                      className="px-2 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-[10px] font-semibold transition-all"
                                      title="Oficializar esta categoria atual como a nova regra PADRÃO para o fornecedor"
                                    >
                                      Oficializar "{div.categoria_atual}"
                                    </button>
                                    <button
                                      onClick={() => abrirModalCriarRegra(forn.fornecedor_original, div.categoria_atual, forn.fornecedor_id_conta_azul, 'DIA_DO_MES', '01-08')}
                                      className="px-2 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 text-[10px] font-semibold transition-all"
                                      title="Criar regra baseada no dia do vencimento ou faixa de valor"
                                    >
                                      Criar Regra Contextual
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* ========================================================= */}
          {/* SUB-ABA: PENDENTES DE HOMOLOGAÇÃO                         */}
          {/* ========================================================= */}
          {subTabConsistencia === 'pendentes' && (
            <div className="space-y-4">
              {(!dadosConsistencia.fornecedores_pendentes || dadosConsistencia.fornecedores_pendentes.length === 0) ? (
                <div className="text-center py-12 bg-slate-900/30 border border-white/5 rounded-2xl">
                  <BookmarkCheck className="w-12 h-12 text-emerald-400 mx-auto mb-3 opacity-80" />
                  <h3 className="text-lg font-semibold text-white">Todos os fornecedores estão homologados!</h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                    Não existem fornecedores pendentes de validação no período selecionado.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {dadosConsistencia.fornecedores_pendentes
                    .filter((p) => p.fornecedor_original.toLowerCase().includes(buscaFornecedor.toLowerCase()))
                    .map((pend) => (
                      <div
                        key={pend.fornecedor_normalizado}
                        className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 shadow-lg flex flex-col justify-between space-y-3"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="font-semibold text-white text-sm truncate" title={pend.fornecedor_original}>
                              {pend.fornecedor_original}
                            </h4>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-mono">
                              {pend.total_lancamentos} lanç.
                            </span>
                          </div>

                          <div className="text-xs text-slate-400">
                            Total movimentado:{' '}
                            <strong className="text-slate-200">
                              R$ {pend.total_valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </strong>
                          </div>

                          <div className="p-2.5 rounded-xl bg-slate-800/60 border border-white/5 text-xs space-y-1">
                            <div className="text-slate-400 text-[10px] uppercase font-semibold flex items-center gap-1">
                              <Sparkles className="w-3 h-3 text-cyan-400" />
                              <span>Sugestão da IA / Histórico:</span>
                            </div>
                            <div className="text-cyan-300 font-bold text-sm">
                              {pend.categoria_predominante}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              Confiança estatística: {pend.confianca_percentual}%
                            </div>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-white/5 flex items-center gap-2">
                          <button
                            onClick={() => aprovarCategoriaPadrao(pend.fornecedor_original, pend.categoria_predominante, pend.fornecedor_id_conta_azul)}
                            className="flex-1 py-1.5 px-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs transition-all shadow-md flex items-center justify-center gap-1.5"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Aprovar Categoria</span>
                          </button>
                          <button
                            onClick={() => abrirModalCriarRegra(pend.fornecedor_original, pend.categoria_predominante, pend.fornecedor_id_conta_azul)}
                            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/10 text-xs transition-all"
                            title="Criar regra personalizada"
                          >
                            <Sliders className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* SUB-ABA: REGRAS HOMOLOGADAS (BASE DE CONHECIMENTO)        */}
          {/* ========================================================= */}
          {subTabConsistencia === 'regras' && (
            <div className="space-y-4">
              {regrasCadastradas.length === 0 ? (
                <div className="text-center py-12 bg-slate-900/30 border border-white/5 rounded-2xl">
                  <BookmarkCheck className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                  <h3 className="text-lg font-semibold text-white">Nenhuma regra homologada ainda</h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                    Aprove fornecedores ou crie regras personalizadas para construir a memória contábil da sua empresa.
                  </p>
                  <button
                    onClick={() => abrirModalCriarRegra()}
                    className="mt-4 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-bold text-xs transition-all"
                  >
                    Cadastrar Primeira Regra
                  </button>
                </div>
              ) : (
                <div className="bg-slate-900/80 border border-white/10 rounded-2xl overflow-hidden shadow-lg">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-800/60 text-slate-400 font-semibold uppercase text-[10px]">
                        <tr>
                          <th className="p-3">Fornecedor</th>
                          <th className="p-3">Categoria Oficial</th>
                          <th className="p-3">Tipo de Regra</th>
                          <th className="p-3">Critério / Valor</th>
                          <th className="p-3">Prioridade</th>
                          <th className="p-3 text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {regrasCadastradas
                          .filter((r) => r.fornecedor_nome.toLowerCase().includes(buscaFornecedor.toLowerCase()))
                          .map((regra) => (
                            <tr key={regra.id} className="hover:bg-slate-800/20">
                              <td className="p-3 font-semibold text-white">
                                {regra.fornecedor_nome}
                              </td>
                              <td className="p-3">
                                <span className="px-2.5 py-0.5 rounded-full text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium">
                                  {regra.categoria_nome}
                                </span>
                              </td>
                              <td className="p-3">
                                <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-white/10 text-[11px] font-mono">
                                  {regra.tipo_regra}
                                </span>
                              </td>
                              <td className="p-3 text-slate-300 font-mono">
                                {regra.valor_regra || 'Todas as contas'}
                              </td>
                              <td className="p-3 text-slate-400 font-mono">
                                {regra.prioridade}
                              </td>
                              <td className="p-3 text-right">
                                <button
                                  onClick={() => excluirRegra(regra.id)}
                                  className="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-[11px] transition-all"
                                >
                                  Remover
                                </button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* MODAL DE CRIAÇÃO / EDIÇÃO DE REGRA CONTÁBIL */}
      {modalRegraAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg bg-slate-900 border border-white/10 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <BookmarkCheck className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-semibold text-white">Regra Contábil de Fornecedor</h3>
              </div>
              <button
                onClick={() => setModalRegraAberto(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={salvarRegraAvancada} className="space-y-3.5">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Nome do Fornecedor:</label>
                <input
                  type="text"
                  value={formRegra.fornecedor_nome}
                  onChange={(e) => setFormRegra({ ...formRegra, fornecedor_nome: e.target.value })}
                  required
                  placeholder="Ex: GOMMA PNEUS LTDA"
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-white/10 text-white text-xs focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Categoria Contábil Oficial:</label>
                <input
                  type="text"
                  value={formRegra.categoria_nome}
                  onChange={(e) => setFormRegra({ ...formRegra, categoria_nome: e.target.value })}
                  required
                  placeholder="Ex: Materiais para Revenda ou Salários"
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-white/10 text-white text-xs focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Tipo da Regra:</label>
                  <select
                    value={formRegra.tipo_regra}
                    onChange={(e) => setFormRegra({ ...formRegra, tipo_regra: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-white/10 text-white text-xs focus:outline-none focus:border-cyan-500 cursor-pointer"
                  >
                    <option value="PADRAO">Padrão Geral</option>
                    <option value="DIA_DO_MES">Dia do Mês (Vencimento)</option>
                    <option value="MES_DO_ANO">Mês do Ano (ex: 13º)</option>
                    <option value="FAIXA_VALOR">Faixa de Valor</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Critério / Parâmetro:</label>
                  <input
                    type="text"
                    value={formRegra.valor_regra}
                    onChange={(e) => setFormRegra({ ...formRegra, valor_regra: e.target.value })}
                    placeholder={
                      formRegra.tipo_regra === 'DIA_DO_MES'
                        ? 'Ex: 01-08 ou 18-22'
                        : formRegra.tipo_regra === 'MES_DO_ANO'
                        ? 'Ex: 11,12'
                        : formRegra.tipo_regra === 'FAIXA_VALOR'
                        ? 'Ex: >=500 ou <500'
                        : 'Não aplicável'
                    }
                    disabled={formRegra.tipo_regra === 'PADRAO'}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-white/10 text-white text-xs focus:outline-none focus:border-cyan-500 disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-white/10 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setModalRegraAberto(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvandoRegra}
                  className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-bold text-xs transition-all shadow-md disabled:opacity-50"
                >
                  {salvandoRegra ? 'Salvando...' : 'Salvar Regra'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONTEÚDO DA ABA 2: FORNECEDORES SEMELHANTES */}
      {activeTab === 'semelhantes' && dadosSemelhantes && (
        <div className="space-y-4">
          <div className="bg-slate-900/40 p-4 rounded-xl border border-white/5 text-xs text-slate-300 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-cyan-400" />
              <span>
                Funil em 4 etapas: <strong>1º CNPJ</strong> → <strong>2º De-Para</strong> → <strong>3º Nome Normalizado</strong> → <strong>4º Levenshtein (≥85%)</strong>.
              </span>
            </div>
            <div className="font-semibold text-cyan-400">
              {dadosSemelhantes.resumo.potencial_unificacao_fornecedores} duplicidades potenciais
            </div>
          </div>

          {dadosSemelhantes.grupos.length === 0 ? (
            <div className="text-center py-12 bg-slate-900/30 border border-white/5 rounded-2xl">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3 opacity-80" />
              <h3 className="text-lg font-semibold text-white">Nenhum fornecedor duplicado detectado!</h3>
              <p className="text-xs text-slate-400 mt-1">
                A base de fornecedores do Conta Azul está completamente saneada e normalizada.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {dadosSemelhantes.grupos.map((grupo) => (
                <div
                  key={grupo.id}
                  className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 space-y-3 shadow-lg"
                >
                  <div className="flex items-center justify-between gap-2 border-b border-white/5 pb-2">
                    <span className="font-bold text-sm text-white">{grupo.fornecedor_principal}</span>
                    <span
                      className={cn(
                        'text-[10px] font-bold px-2 py-0.5 rounded border',
                        grupo.criterio === 'CNPJ_DUPLICADO' && 'bg-rose-500/10 text-rose-400 border-rose-500/30',
                        grupo.criterio === 'DEPARA_EXISTENTE' && 'bg-blue-500/10 text-blue-400 border-blue-500/30',
                        grupo.criterio === 'NOME_NORMALIZADO' && 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
                        grupo.criterio === 'SIMILARIDADE_TEXTUAL' && 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      )}
                    >
                      {grupo.criterio.replace('_', ' ')} ({grupo.similaridade_percentual}%)
                    </span>
                  </div>

                  <p className="text-xs text-slate-400">{grupo.sugestao}</p>

                  <div className="space-y-1.5 pt-1">
                    <div className="text-[11px] font-semibold text-slate-300">Variações Encontradas:</div>
                    {grupo.variacoes.map((v, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-800/50 border border-white/5"
                      >
                        <div>
                          <div className="font-medium text-slate-200">{v.nome}</div>
                          {v.cnpj && <div className="text-[10px] text-slate-400 font-mono">CNPJ: {v.cnpj}</div>}
                        </div>
                        <div className="text-right text-[11px]">
                          <div className="font-bold text-white">{v.total_lancamentos} lançamentos</div>
                          <div className="text-slate-400 font-mono">
                            R$ {v.valor_acumulado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CONTEÚDO DA ABA 3: POSSÍVEIS DUPLICIDADES */}
      {activeTab === 'duplicidades' && dadosDuplicidades && (
        <div className="space-y-4">
          <div className="bg-slate-900/40 p-4 rounded-xl border border-white/5 text-xs text-slate-300 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Copy className="w-4 h-4 text-rose-400" />
              <span>
                Detecção de lançamentos redundantes: mesmo documento e valor OU mesmo valor com vencimento próximo (± 3 dias).
              </span>
            </div>
            <div className="font-semibold text-rose-400">
              R$ {dadosDuplicidades.resumo.valor_total_em_risco_duplicidade.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} em risco
            </div>
          </div>

          {dadosDuplicidades.grupos.length === 0 ? (
            <div className="text-center py-12 bg-slate-900/30 border border-white/5 rounded-2xl">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3 opacity-80" />
              <h3 className="text-lg font-semibold text-white">Nenhuma duplicidade detectada!</h3>
              <p className="text-xs text-slate-400 mt-1">
                Não foram identificados lançamentos redundantes no período selecionado.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {dadosDuplicidades.grupos.map((grupo) => (
                <div
                  key={grupo.id}
                  className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 shadow-lg space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/5 pb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-white">{grupo.fornecedor}</span>
                        <span
                          className={cn(
                            'text-[10px] font-bold px-2 py-0.5 rounded border',
                            grupo.criticidade === 'CRITICA' && 'bg-rose-500/10 text-rose-400 border-rose-500/30',
                            grupo.criticidade === 'ALTA' && 'bg-amber-500/10 text-amber-400 border-amber-500/30',
                            grupo.criticidade === 'ATENCAO' && 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30'
                          )}
                        >
                          {grupo.criticidade}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{grupo.motivo}</p>
                    </div>

                    <div className="text-right">
                      <div className="text-xs text-slate-400">Excedente em Risco</div>
                      <div className="text-sm font-bold text-rose-400 font-mono">
                        R$ {grupo.valor_excedente_risco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {grupo.itens.map((item) => (
                      <div
                        key={item.id}
                        className="p-2.5 rounded-xl bg-slate-800/40 border border-white/5 space-y-1 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Doc: {item.doc || 'S/N'}</span>
                          <span className="font-mono text-cyan-300 font-bold">
                            {item.vencimento ? new Date(item.vencimento).toLocaleDateString('pt-BR') : '-'}
                          </span>
                        </div>
                        <div className="text-slate-200 truncate" title={item.descricao || ''}>
                          {item.descricao || '-'}
                        </div>
                        <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[11px]">
                          <span className="text-slate-400">{item.categoria || '-'}</span>
                          <span className="font-bold text-white font-mono">
                            R$ {item.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CONTEÚDO DA ABA 4: HISTÓRICO & CONFORMIDADE */}
      {activeTab === 'historico' && dadosHistorico && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-slate-900/70 border border-white/10 rounded-2xl p-4 shadow-lg">
              <div className="text-xs text-slate-400">Índice de Maturidade Cadastral</div>
              <div className="text-3xl font-bold text-cyan-400 mt-2">
                {dadosHistorico.resumo_geral.indice_maturidade_cadastral} / 100
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Baseado em pagamentos confirmados, regras De-Para e categorias padrão
              </p>
            </div>

            <div className="bg-slate-900/70 border border-white/10 rounded-2xl p-4 shadow-lg">
              <div className="text-xs text-slate-400">Regras De-Para Ativas</div>
              <div className="text-3xl font-bold text-emerald-400 mt-2">
                {dadosHistorico.resumo_geral.total_regras_depara_ativas}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Equivalências aprendidas cadastradas no sistema
              </p>
            </div>

            <div className="bg-slate-900/70 border border-white/10 rounded-2xl p-4 shadow-lg">
              <div className="text-xs text-slate-400">Fornecedores c/ Categoria Padrão</div>
              <div className="text-3xl font-bold text-blue-400 mt-2">
                {dadosHistorico.resumo_geral.total_fornecedores_com_categoria_padrao}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Cadastrados diretamente no Conta Azul
              </p>
            </div>
          </div>

          <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 shadow-lg space-y-3">
            <div className="text-xs font-semibold text-slate-300">
              Evolução Histórica Mensal dos Lançamentos:
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900 text-slate-400 border-b border-white/10 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-2.5 px-3">Mês/Ano</th>
                    <th className="py-2.5 px-3 text-right">Lançamentos</th>
                    <th className="py-2.5 px-3 text-right">Valor Total</th>
                    <th className="py-2.5 px-3 text-right text-emerald-400">Quitados</th>
                    <th className="py-2.5 px-3 text-right text-amber-400">Pendentes</th>
                    <th className="py-2.5 px-3 text-right">Taxa de Conclusão</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {dadosHistorico.evolucao_mensal.map((m) => (
                    <tr key={m.mes_ano} className="hover:bg-slate-800/30">
                      <td className="py-2 px-3 font-semibold text-white">{m.mes_label}</td>
                      <td className="py-2 px-3 text-right text-slate-300">{m.total_lancamentos}</td>
                      <td className="py-2 px-3 text-right font-mono text-slate-300">
                        R$ {m.valor_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2 px-3 text-right font-bold text-emerald-400">{m.total_enviados}</td>
                      <td className="py-2 px-3 text-right text-amber-400">{m.total_pendentes}</td>
                      <td className="py-2 px-3 text-right font-bold text-cyan-400 font-mono">
                        {m.taxa_aprovacao_percentual}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
