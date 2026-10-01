'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useEmpresa } from '@/contexts/EmpresaContext'
import type { ResumoAuditoriaConciliacoesCA, ItemConciliadoAuditavel } from '@/lib/auditoria-conciliacoes-ca/tipos'
import {
  ShieldCheck, AlertTriangle, CheckCircle2, XCircle, Search, RefreshCw,
  Filter, Eye, ChevronLeft, ChevronRight, Building2, Calendar, TrendingUp,
  Info, AlertCircle, Sparkles, X, ArrowUpDown, FileText, ArrowRight,
  ShieldAlert, Tag, Check, HelpCircle
} from 'lucide-react'
import toast from 'react-hot-toast'

// ─── Helpers de Formatação Brasileira ──────────────────────────────────────────
const formatCurrency = (val: number) => {
  if (typeof val !== 'number' || isNaN(val)) return 'R$ 0,00'
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const formatDate = (d: string | null | undefined) => {
  if (!d) return '—'
  try {
    const part = d.split('T')[0]
    const [ano, mes, dia] = part.split('-')
    if (ano && mes && dia) return `${dia}/${mes}/${ano}`
    return new Date(d).toLocaleDateString('pt-BR')
  } catch {
    return d
  }
}

type PeriodoFiltro = '30' | '90' | '180' | '365' | 'todos'
type StatusFiltro = 'todos' | 'divergencias' | 'critico' | 'moderado' | 'compativel'

export default function AuditoriaConciliacoesCAPage() {
  const { empresas, empresaAtiva, setEmpresaAtiva } = useEmpresa()

  // Estados principais
  const [empresaIdSelecionada, setEmpresaIdSelecionada] = useState<string>('')
  const [periodoFiltro, setPeriodoFiltro] = useState<PeriodoFiltro>('todos')
  const [statusFiltro, setStatusFiltro] = useState<StatusFiltro>('todos')
  const [buscaTexto, setBuscaTexto] = useState<string>('')

  // Estado de Dados
  const [loading, setLoading] = useState<boolean>(false)
  const [resumo, setResumo] = useState<ResumoAuditoriaConciliacoesCA | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  // Estado do Modal "Ver Detalhes"
  const [itemSelecionado, setItemSelecionado] = useState<ItemConciliadoAuditavel | null>(null)

  // Paginação
  const [paginaAtual, setPaginaAtual] = useState<number>(1)
  const [itensPorPagina, setItensPorPagina] = useState<number>(20)

  // Sincronizar empresa selecionada com o contexto global
  useEffect(() => {
    if (empresaAtiva?.id) {
      setEmpresaIdSelecionada(empresaAtiva.id)
    } else if (empresas && empresas.length > 0 && !empresaIdSelecionada) {
      setEmpresaIdSelecionada(empresas[0].id)
    }
  }, [empresaAtiva, empresas, empresaIdSelecionada])

  // Cálculo do intervalo de datas a partir do período
  const calcularIntervaloDatas = useCallback((periodo: PeriodoFiltro) => {
    if (periodo === 'todos') {
      return { dataInicio: undefined, dataFim: undefined }
    }
    const dias = parseInt(periodo, 10)
    const fim = new Date()
    const inicio = new Date()
    inicio.setDate(fim.getDate() - dias)
    return {
      dataInicio: inicio.toISOString().split('T')[0],
      dataFim: fim.toISOString().split('T')[0]
    }
  }, [])

  // Buscar Auditoria (100% READ-ONLY)
  const carregarAuditoria = useCallback(async () => {
    if (!empresaIdSelecionada) return

    setLoading(true)
    setErro(null)
    try {
      const { dataInicio, dataFim } = calcularIntervaloDatas(periodoFiltro)
      const params = new URLSearchParams({
        empresa_id: empresaIdSelecionada,
        limite: '1000'
      })
      if (dataInicio) params.append('data_inicio', dataInicio)
      if (dataFim) params.append('data_fim', dataFim)

      const response = await fetch(`/api/auditoria-conciliacoes-ca?${params.toString()}`)
      const json = await response.json()

      if (!response.ok) {
        throw new Error(json.error || 'Erro ao carregar auditoria de conciliações.')
      }

      setResumo(json)
      setPaginaAtual(1)
    } catch (err: any) {
      console.error('[AuditoriaConciliacoesCA] Erro ao buscar auditoria:', err)
      setErro(err.message || 'Falha na comunicação com o motor de auditoria.')
      toast.error(err.message || 'Erro ao carregar dados.')
    } finally {
      setLoading(false)
    }
  }, [empresaIdSelecionada, periodoFiltro, calcularIntervaloDatas])

  // Executar carregamento ao alterar empresa ou período
  useEffect(() => {
    if (empresaIdSelecionada) {
      carregarAuditoria()
    }
  }, [empresaIdSelecionada, periodoFiltro, carregarAuditoria])

  // Filtragem dos itens detalhados em memória (Busca + Status)
  const itensFiltrados = useMemo(() => {
    if (!resumo?.lista_detalhada) return []

    return resumo.lista_detalhada.filter((item) => {
      // Filtro de Status
      if (statusFiltro === 'divergencias' && !item.em_risco_financeiro && item.motivos_divergencia.length === 0) {
        return false
      }
      if (statusFiltro === 'critico' && item.score_compatibilidade_fornecedor >= 50) {
        return false
      }
      if (statusFiltro === 'moderado' && (item.score_compatibilidade_fornecedor < 50 || item.score_compatibilidade_fornecedor >= 80)) {
        return false
      }
      if (statusFiltro === 'compativel' && item.score_compatibilidade_fornecedor < 80) {
        return false
      }

      // Filtro de Busca Textual
      if (buscaTexto.trim()) {
        const q = buscaTexto.toLowerCase().trim()
        const matchDesc = item.descricao_banco?.toLowerCase().includes(q)
        const matchForn = item.fornecedor_conciliado?.toLowerCase().includes(q)
        const matchCat = item.categoria_conciliada?.toLowerCase().includes(q)
        const matchFornSug = item.fornecedor_esperado_sugerido?.toLowerCase().includes(q)
        return matchDesc || matchForn || matchCat || matchFornSug
      }

      return true
    })
  }, [resumo, statusFiltro, buscaTexto])

  // Paginação dos itens filtrados
  const totalPaginas = Math.ceil(itensFiltrados.length / itensPorPagina) || 1
  const itensPaginados = useMemo(() => {
    const inicio = (paginaAtual - 1) * itensPorPagina
    return itensFiltrados.slice(inicio, inicio + itensPorPagina)
  }, [itensFiltrados, paginaAtual, itensPorPagina])

  // Empresa atualmente selecionada no seletor local
  const empresaAtualObj = useMemo(() => {
    return empresas.find((e) => e.id === empresaIdSelecionada) || empresaAtiva
  }, [empresas, empresaIdSelecionada, empresaAtiva])

  // Função auxiliar para obter cor do semáforo
  const obterSemaforo = (score: number) => {
    if (score >= 80) {
      return {
        cor: 'verde',
        label: 'Compatível',
        badgeClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
        dotClass: 'bg-emerald-500',
        textClass: 'text-emerald-600 dark:text-emerald-400',
        borderClass: 'border-emerald-500/30'
      }
    }
    if (score >= 50) {
      return {
        cor: 'amarelo',
        label: 'Suspeita Moderada',
        badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
        dotClass: 'bg-amber-500',
        textClass: 'text-amber-600 dark:text-amber-400',
        borderClass: 'border-amber-500/30'
      }
    }
    return {
      cor: 'vermelho',
      label: 'Suspeita Crítica',
      badgeClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30',
      dotClass: 'bg-rose-500',
      textClass: 'text-rose-600 dark:text-rose-400',
      borderClass: 'border-rose-500/30'
    }
  }

  return (
    <div className="space-y-6 pb-12 max-w-[1600px] mx-auto">
      {/* ─── CABEÇALHO DA PÁGINA ────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white dark:bg-dark-900 border border-slate-200 dark:border-dark-800 p-5 rounded-2xl shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 flex items-center justify-center font-bold">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                  Auditoria Inteligente de Conciliações
                </h1>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                  <Check className="w-3 h-3" /> Modo Read-Only
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                  FASE 2 VISUAL
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Auditoria pós-fato e validação algorítmica de lançamentos já conciliados dentro do ERP Conta Azul.
              </p>
            </div>
          </div>
        </div>

        {/* Controles de Empresa & Ação de Recarregar */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Seletor de Empresa */}
          <div className="flex items-center gap-2 bg-slate-50 dark:bg-dark-950/60 border border-slate-200 dark:border-dark-800 px-3 py-1.5 rounded-xl">
            <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              id="select-empresa-auditoria"
              aria-label="Selecionar empresa para auditoria"
              value={empresaIdSelecionada}
              onChange={(e) => {
                const novoId = e.target.value
                setEmpresaIdSelecionada(novoId)
                const emp = empresas.find((x) => x.id === novoId)
                if (emp) setEmpresaAtiva(emp)
              }}
              className="bg-transparent text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer pr-2 max-w-[200px] truncate"
            >
              {empresas.map((emp) => (
                <option key={emp.id} value={emp.id} className="bg-white dark:bg-dark-900 text-slate-900 dark:text-white">
                  {emp.nome}
                </option>
              ))}
            </select>
          </div>

          {/* Botão de Atualizar */}
          <button
            onClick={carregarAuditoria}
            disabled={loading || !empresaIdSelecionada}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Auditando...' : 'Atualizar Auditoria'}
          </button>
        </div>
      </div>

      {/* ─── CARD PRINCIPAL DE INDICADORES (6 KPIs) ─────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
        {/* KPI 1: Total Auditado */}
        <div className="bg-white dark:bg-dark-900 border border-slate-200 dark:border-dark-800 rounded-2xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium mb-1">
            <span>Total Auditado</span>
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <FileText className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {resumo ? resumo.total_auditado.toLocaleString('pt-BR') : '—'}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 truncate">
            {resumo ? `Volume: ${formatCurrency(resumo.valor_total_auditado)}` : 'Carregando base...'}
          </div>
        </div>

        {/* KPI 2: Total Consistente */}
        <div className="bg-white dark:bg-dark-900 border border-slate-200 dark:border-dark-800 rounded-2xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium mb-1">
            <span>Total Consistente</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {resumo ? resumo.total_consistentes.toLocaleString('pt-BR') : '—'}
          </div>
          <div className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400 truncate">
            {resumo && resumo.total_auditado > 0
              ? `${((resumo.total_consistentes / resumo.total_auditado) * 100).toFixed(1)}% sem ressalvas`
              : 'Sem divergências'}
          </div>
        </div>

        {/* KPI 3: Divergências de Fornecedor */}
        <div className="bg-white dark:bg-dark-900 border border-slate-200 dark:border-dark-800 rounded-2xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium mb-1">
            <span>Diverg. Fornecedor</span>
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <AlertTriangle className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
            {resumo ? resumo.divergencias_fornecedor.toLocaleString('pt-BR') : '—'}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 truncate">
            Score textual &lt; 80
          </div>
        </div>

        {/* KPI 4: Divergências de Categoria */}
        <div className="bg-white dark:bg-dark-900 border border-slate-200 dark:border-dark-800 rounded-2xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium mb-1">
            <span>Diverg. Categoria</span>
            <div className="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <Tag className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
            {resumo ? resumo.divergencias_categoria.toLocaleString('pt-BR') : '—'}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 truncate">
            Desvio de regra ou monoescopo
          </div>
        </div>

        {/* KPI 5: Valor Financeiro em Risco */}
        <div className="bg-white dark:bg-dark-900 border border-slate-200 dark:border-dark-800 rounded-2xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium mb-1">
            <span>Valor em Risco</span>
            <div className="w-7 h-7 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <ShieldAlert className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl font-bold text-rose-600 dark:text-rose-400 truncate">
            {resumo ? formatCurrency(resumo.valor_financeiro_em_risco) : '—'}
          </div>
          <div className="mt-1 text-[11px] text-rose-600/80 dark:text-rose-400/80 truncate">
            {resumo ? `${resumo.total_divergencias_geral} itens suspeitos` : 'Lançamentos suspeitos'}
          </div>
        </div>

        {/* KPI 6: Índice de Acurácia */}
        <div className="bg-white dark:bg-dark-900 border border-slate-200 dark:border-dark-800 rounded-2xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium mb-1">
            <span>Índice de Acurácia</span>
            <div className="w-7 h-7 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
            {resumo ? `${resumo.taxa_conformidade_percentual.toFixed(1)}%` : '—'}
          </div>
          {/* Barra visual de conformidade */}
          <div className="mt-2 w-full bg-slate-100 dark:bg-dark-800 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-indigo-600 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(resumo?.taxa_conformidade_percentual || 0, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* ─── CARD DE PADRÕES RECORRENTES (REGRA 4) ─────────────────────────── */}
      {resumo?.recorrencias_suspeitas && resumo.recorrencias_suspeitas.length > 0 && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2 text-amber-800 dark:text-amber-300 font-semibold text-xs">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span>Padrões de Erro Recorrente Detectados ({resumo.recorrencias_suspeitas.length})</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {resumo.recorrencias_suspeitas.map((rec, idx) => (
              <div
                key={idx}
                className="bg-white dark:bg-dark-900 border border-amber-500/20 rounded-xl p-3 text-xs space-y-1 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                    {rec.descricao_padrao}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold text-[10px]">
                    {rec.ocorrencias}x
                  </span>
                </div>
                <div className="text-slate-500 dark:text-slate-400 text-[11px] truncate">
                  Conciliado com: <strong className="text-slate-700 dark:text-slate-300">{rec.fornecedor_conciliado}</strong>
                </div>
                <div className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                  {rec.sugestao} ({formatCurrency(rec.valor_total)})
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── BARRA DE FILTROS & BUSCA ────────────────────────────────────────── */}
      <div className="bg-white dark:bg-dark-900 border border-slate-200 dark:border-dark-800 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Campo de Busca Textual */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por descrição, fornecedor ou categoria..."
              value={buscaTexto}
              onChange={(e) => {
                setBuscaTexto(e.target.value)
                setPaginaAtual(1)
              }}
              className="w-full bg-slate-50 dark:bg-dark-950/60 border border-slate-200 dark:border-dark-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            {buscaTexto && (
              <button
                onClick={() => setBuscaTexto('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filtros de Período (Últimos 30, 90, 180, 365 dias) */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-50 dark:bg-dark-950/60 border border-slate-200 dark:border-dark-800 p-1 rounded-xl">
            <span className="text-[11px] font-semibold text-slate-400 px-2 flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Período:
            </span>
            {(['30', '90', '180', '365', 'todos'] as PeriodoFiltro[]).map((p) => {
              const labelMap: Record<PeriodoFiltro, string> = {
                '30': '30d',
                '90': '90d',
                '180': '180d',
                '365': '365d',
                'todos': 'Histórico Completo'
              }
              const ativo = periodoFiltro === p
              return (
                <button
                  key={p}
                  onClick={() => setPeriodoFiltro(p)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                    ativo
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {labelMap[p]}
                </button>
              )
            })}
          </div>
        </div>

        {/* Linha Secundária: Filtro por Status / Semáforo */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-dark-800/60">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-400 mr-1 flex items-center gap-1">
              <Filter className="w-3 h-3" /> Status:
            </span>
            {[
              { id: 'todos', label: 'Todos os Lançamentos' },
              { id: 'divergencias', label: 'Somente Divergências' },
              { id: 'critico', label: '🔴 Suspeita Crítica (<50)' },
              { id: 'moderado', label: '🟡 Suspeita Moderada (50-79)' },
              { id: 'compativel', label: '🟢 Compatível (≥80)' },
            ].map((st) => {
              const ativo = statusFiltro === st.id
              return (
                <button
                  key={st.id}
                  onClick={() => {
                    setStatusFiltro(st.id as StatusFiltro)
                    setPaginaAtual(1)
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs transition-all ${
                    ativo
                      ? 'bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 font-semibold'
                      : 'bg-slate-100 dark:bg-dark-800/60 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-dark-800'
                  }`}
                >
                  {st.label}
                </button>
              )
            })}
          </div>

          <div className="text-xs text-slate-400">
            Exibindo <strong>{itensFiltrados.length}</strong> de{' '}
            <strong>{resumo?.total_auditado || 0}</strong> lançamentos
          </div>
        </div>
      </div>

      {/* ─── TABELA OPERACIONAL COM SEMÁFORO ──────────────────────────────────── */}
      <div className="bg-white dark:bg-dark-900 border border-slate-200 dark:border-dark-800 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center space-y-3">
            <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin mx-auto" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Executando auditoria algorítmica de conciliações...
            </p>
            <p className="text-xs text-slate-400">
              Analisando compatibilidade de vínculos, histórico de categorias e desvios de fornecedores.
            </p>
          </div>
        ) : erro ? (
          <div className="p-8 text-center space-y-2">
            <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
            <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">{erro}</p>
            <button
              onClick={carregarAuditoria}
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Tentar novamente
            </button>
          </div>
        ) : itensPaginados.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <CheckCircle2 className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Nenhum lançamento encontrado para os filtros selecionados.
            </p>
            <p className="text-xs text-slate-400">
              Ajuste o período, limpe o termo de busca ou altere o filtro de status.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-dark-800 bg-slate-50/75 dark:bg-dark-950/50 text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold">
                  <th className="py-3 px-4">Data</th>
                  <th className="py-3 px-4">Descrição Original (Banco)</th>
                  <th className="py-3 px-4">Fornecedor Conciliado</th>
                  <th className="py-3 px-4">Categoria Utilizada</th>
                  <th className="py-3 px-4 text-center">Score Semáforo</th>
                  <th className="py-3 px-4">Tipo Divergência</th>
                  <th className="py-3 px-4 text-right">Valor</th>
                  <th className="py-3 px-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-dark-800/60 font-normal">
                {itensPaginados.map((item) => {
                  const semaforo = obterSemaforo(item.score_compatibilidade_fornecedor)
                  const temDivergencia = item.em_risco_financeiro || item.motivos_divergencia.length > 0

                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-slate-50/80 dark:hover:bg-dark-850/50 transition-colors ${
                        item.score_compatibilidade_fornecedor < 50
                          ? 'bg-rose-500/[0.02]'
                          : item.score_compatibilidade_fornecedor < 80
                          ? 'bg-amber-500/[0.02]'
                          : ''
                      }`}
                    >
                      {/* Data */}
                      <td className="py-3 px-4 whitespace-nowrap text-slate-600 dark:text-slate-300 font-mono text-[11px]">
                        {formatDate(item.data_competencia || item.data_pagamento || item.data_vencimento)}
                      </td>

                      {/* Descrição Original do Banco */}
                      <td className="py-3 px-4 max-w-xs">
                        <div className="font-medium text-slate-800 dark:text-slate-200 truncate" title={item.descricao_banco}>
                          {item.descricao_banco || '—'}
                        </div>
                        {item.descricao_sanitizada && item.descricao_sanitizada !== item.descricao_banco && (
                          <div className="text-[10px] text-slate-400 truncate">
                            Termo limpo: {item.descricao_sanitizada}
                          </div>
                        )}
                      </td>

                      {/* Fornecedor Conciliado no Conta Azul */}
                      <td className="py-3 px-4 max-w-xs">
                        <div className="font-semibold text-slate-800 dark:text-slate-200 truncate" title={item.fornecedor_conciliado}>
                          {item.fornecedor_conciliado || 'Não informado'}
                        </div>
                        {item.fornecedor_esperado_sugerido && (
                          <div className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium truncate">
                            Sugerido De-Para: {item.fornecedor_esperado_sugerido}
                          </div>
                        )}
                      </td>

                      {/* Categoria Utilizada */}
                      <td className="py-3 px-4 max-w-xs">
                        <div className="text-slate-700 dark:text-slate-300 truncate" title={item.categoria_conciliada}>
                          {item.categoria_conciliada || 'Sem categoria'}
                        </div>
                        {item.categoria_esperada && item.categoria_esperada !== item.categoria_conciliada && (
                          <div className="text-[10px] text-amber-600 dark:text-amber-400 font-medium truncate">
                            Esperada: {item.categoria_esperada}
                          </div>
                        )}
                      </td>

                      {/* Score Semáforo */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <span className={`inline-block w-2.5 h-2.5 rounded-full ${semaforo.dotClass}`} />
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md font-bold text-xs border ${semaforo.badgeClass}`}
                          >
                            {Math.round(item.score_compatibilidade_fornecedor)}%
                          </span>
                        </div>
                      </td>

                      {/* Tipo da Divergência */}
                      <td className="py-3 px-4">
                        {!temDivergencia ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="w-3 h-3" /> Consistente
                          </span>
                        ) : (
                          <div className="flex flex-col gap-1 max-w-[220px]">
                            {item.score_compatibilidade_fornecedor < 50 && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 truncate">
                                <XCircle className="w-3 h-3 shrink-0" /> Fornecedor Crítico
                              </span>
                            )}
                            {item.score_compatibilidade_fornecedor >= 50 && item.score_compatibilidade_fornecedor < 80 && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 truncate">
                                <AlertTriangle className="w-3 h-3 shrink-0" /> Suspeita Moderada
                              </span>
                            )}
                            {item.divergencia_categoria && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400 truncate">
                                <Tag className="w-3 h-3 shrink-0" /> Categoria Desviante
                              </span>
                            )}
                            {item.padrao_recorrente_identificado && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 truncate">
                                <Sparkles className="w-3 h-3 shrink-0" /> Erro Recorrente
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Valor */}
                      <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                        {formatCurrency(item.valor)}
                      </td>

                      {/* Ações: Ver Detalhes */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <button
                          onClick={() => setItemSelecionado(item)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-dark-800 dark:hover:bg-dark-750 text-slate-700 dark:text-slate-200 transition-colors"
                          title="Visualizar detalhes da auditoria"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Ver Detalhes</span>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ─── CONTROLES DE PAGINAÇÃO ────────────────────────────────────────── */}
        {!loading && !erro && itensFiltrados.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-t border-slate-200 dark:border-dark-800 bg-slate-50/50 dark:bg-dark-950/30 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-500 dark:text-slate-400">Itens por página:</span>
              <select
                aria-label="Itens por página"
                value={itensPorPagina}
                onChange={(e) => {
                  setItensPorPagina(Number(e.target.value))
                  setPaginaAtual(1)
                }}
                className="bg-white dark:bg-dark-900 border border-slate-200 dark:border-dark-800 rounded-lg px-2 py-1 text-slate-800 dark:text-slate-200 focus:outline-none"
              >
                <option value={15}>15</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-slate-500 dark:text-slate-400">
                Página <strong>{paginaAtual}</strong> de <strong>{totalPaginas}</strong>
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPaginaAtual((p) => Math.max(p - 1, 1))}
                  disabled={paginaAtual <= 1}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-dark-800 text-slate-600 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-dark-800"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPaginaAtual((p) => Math.min(p + 1, totalPaginas))}
                  disabled={paginaAtual >= totalPaginas}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-dark-800 text-slate-600 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-dark-800"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── MODAL "VER DETALHES" (SOMENTE VISUALIZAÇÃO / READ-ONLY) ────────── */}
      {itemSelecionado && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white dark:bg-dark-900 border border-slate-200 dark:border-dark-800 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Header do Modal */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-dark-800 bg-slate-50/50 dark:bg-dark-950/40">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold border ${
                    obterSemaforo(itemSelecionado.score_compatibilidade_fornecedor).badgeClass
                  }`}
                >
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    Diagnóstico da Conciliação
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border ${
                        obterSemaforo(itemSelecionado.score_compatibilidade_fornecedor).badgeClass
                      }`}
                    >
                      {obterSemaforo(itemSelecionado.score_compatibilidade_fornecedor).label}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    ID Conta Azul: <span className="font-mono">{itemSelecionado.conta_azul_id || itemSelecionado.id}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setItemSelecionado(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-dark-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Conteúdo com Scroll */}
            <div className="p-6 overflow-y-auto space-y-5 text-xs">
              {/* Alerta de Operação Read-Only */}
              <div className="flex items-center gap-2 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-300">
                <Info className="w-4 h-4 shrink-0" />
                <span>
                  <strong>Painel 100% Read-Only:</strong> Esta análise é puramente consultiva para apoiar o fechamento contábil e a validação do DRE, sem efetuar mutações no Conta Azul.
                </span>
              </div>

              {/* Grid 1: Informações Gerais da Transação */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 bg-slate-50 dark:bg-dark-950/60 border border-slate-200 dark:border-dark-800 rounded-xl">
                <div>
                  <span className="text-[10px] uppercase font-semibold text-slate-400">Valor Auditado</span>
                  <div className="text-sm font-bold font-mono text-slate-900 dark:text-white">
                    {formatCurrency(itemSelecionado.valor)}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-semibold text-slate-400">Data Competência</span>
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    {formatDate(itemSelecionado.data_competencia)}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-semibold text-slate-400">Data Pagamento</span>
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    {formatDate(itemSelecionado.data_pagamento)}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-semibold text-slate-400">Status ERP</span>
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase">
                    {itemSelecionado.status || 'BAIXADO'}
                  </div>
                </div>
              </div>

              {/* Grid 2: Regra 1 — Compatibilidade Textual (Banco vs Fornecedor) */}
              <div className="border border-slate-200 dark:border-dark-800 rounded-xl p-4 space-y-3 bg-white dark:bg-dark-900">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-dark-800 pb-2">
                  <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-indigo-500" />
                    Regra 1: Vínculo de Fornecedor
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400">Score Algorítmico:</span>
                    <span
                      className={`font-bold font-mono text-xs px-2 py-0.5 rounded border ${
                        obterSemaforo(itemSelecionado.score_compatibilidade_fornecedor).badgeClass
                      }`}
                    >
                      {itemSelecionado.score_compatibilidade_fornecedor}%
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase">Descrição Original do Banco</span>
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-dark-950 font-medium text-slate-800 dark:text-slate-200 break-words">
                      {itemSelecionado.descricao_banco}
                    </div>
                    {itemSelecionado.descricao_sanitizada && (
                      <span className="text-[10px] text-slate-400">
                        Termos extraídos: <strong className="text-slate-600 dark:text-slate-300">{itemSelecionado.descricao_sanitizada}</strong>
                      </span>
                    )}
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase">Fornecedor Conciliado no ERP</span>
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-dark-950 font-bold text-slate-800 dark:text-slate-200 break-words">
                      {itemSelecionado.fornecedor_conciliado}
                    </div>
                    {itemSelecionado.fornecedor_esperado_sugerido && (
                      <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium">
                        Sugestão De-Para: <strong>{itemSelecionado.fornecedor_esperado_sugerido}</strong>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Grid 3: Regras 2 e 3 — Consistência de Categoria & Histórico */}
              <div className="border border-slate-200 dark:border-dark-800 rounded-xl p-4 space-y-3 bg-white dark:bg-dark-900">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-dark-800 pb-2">
                  <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Tag className="w-4 h-4 text-purple-500" />
                    Regras 2 & 3: Consistência Contábil de Categoria
                  </span>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      itemSelecionado.divergencia_categoria
                        ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                        : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    {itemSelecionado.divergencia_categoria ? 'Categoria Divergente' : 'Categoria Conforme'}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase">Categoria Aplicada na Conciliação</span>
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-dark-950 font-medium text-slate-800 dark:text-slate-200">
                      {itemSelecionado.categoria_conciliada || 'Não informada'}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase">Categoria Esperada pelo Motor</span>
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-dark-950 font-semibold text-indigo-600 dark:text-indigo-400">
                      {itemSelecionado.categoria_esperada || 'Sem regra homologada ou predominância histórica'}
                    </div>
                    {itemSelecionado.origem_categoria_esperada && (
                      <span className="text-[10px] text-slate-400">
                        Origem: <strong className="text-slate-600 dark:text-slate-300">{itemSelecionado.origem_categoria_esperada}</strong>
                      </span>
                    )}
                  </div>
                </div>

                {/* Perfil do Fornecedor */}
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-dark-950 text-slate-600 dark:text-slate-300 text-[11px]">
                  <span>Perfil Histórico do Fornecedor:</span>
                  <span className="font-semibold">
                    {itemSelecionado.tipo_escopo_fornecedor === 'MONOESCOPO'
                      ? `Monoescopo (${itemSelecionado.confianca_categoria_percentual}% predominância)`
                      : itemSelecionado.tipo_escopo_fornecedor === 'MULTIESCOPO'
                      ? 'Multiescopo (múltiplas categorias)'
                      : 'Novo fornecedor'}
                  </span>
                </div>
              </div>

              {/* Grid 4: Ocorrências Encontradas & Justificativa Técnica */}
              <div className="border border-slate-200 dark:border-dark-800 rounded-xl p-4 space-y-2 bg-white dark:bg-dark-900">
                <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                  Ocorrências Encontradas & Justificativa Técnica
                </span>

                {itemSelecionado.motivos_divergencia.length === 0 ? (
                  <div className="p-3 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[11px] font-medium flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Nenhuma anomalia identificada. Conciliação com alta compatibilidade e categoria consistente.</span>
                  </div>
                ) : (
                  <div className="space-y-1.5 pt-1">
                    {itemSelecionado.motivos_divergencia.map((motivo, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 p-2.5 rounded-lg bg-rose-500/5 dark:bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 text-[11px]"
                      >
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-500" />
                        <span>{motivo}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Rodapé do Modal */}
            <div className="flex items-center justify-between p-4 border-t border-slate-100 dark:border-dark-800 bg-slate-50/50 dark:bg-dark-950/40">
              <span className="text-[11px] text-slate-400">
                Ação restrita a consulta. Nenhuma alteração é gravada.
              </span>
              <button
                onClick={() => setItemSelecionado(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-200 dark:bg-dark-800 hover:bg-slate-300 dark:hover:bg-dark-750 text-slate-800 dark:text-white transition-colors"
              >
                Fechar Detalhes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
