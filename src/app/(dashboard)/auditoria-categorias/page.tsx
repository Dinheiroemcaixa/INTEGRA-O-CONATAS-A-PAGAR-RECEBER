'use client'

import React, { useState, useEffect } from 'react'
import { useEmpresa } from '@/contexts/EmpresaContext'
import SelectorEmpresa from '@/components/layout/SelectorEmpresa'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  ShieldCheck, AlertTriangle, CheckCircle2, Calendar,
  Search, RefreshCw, Wrench, Sparkles, Filter,
  Building2, ArrowUpDown, ChevronRight, HelpCircle,
  X, Check, AlertCircle, Info, Database
} from 'lucide-react'
import toast from 'react-hot-toast'

interface ItemAuditoria {
  id: string
  contaAzulId?: string | null
  fornecedor: string
  categoriaEsperada: string
  categoriaAtual: string
  percentualConfianca: number
  totalHistoricoFornecedor: number
  status: 'divergente' | 'consistente' | 'novo_fornecedor'
  valor: number
  dataCompetencia: string
  dataVencimento?: string | null
  descricao?: string | null
}

interface ResumoAuditoria {
  totalAuditado: number
  totalConsistentes: number
  totalDivergentes: number
  totalNovosFornecedores: number
  valorTotalAuditado: number
  valorTotalDivergente: number
  taxaDivergencia: number
  periodoAuditado: {
    inicio: string
    fim: string
  }
  periodoHistoricoAprendizado: {
    inicio: string
    fim: string
  }
  itens: ItemAuditoria[]
}

export default function AuditoriaCategoriasPage() {
  const { empresaAtiva } = useEmpresa()

  // Período padrão: mês atual
  const getHojeIso = () => new Date().toISOString().slice(0, 10)
  const getPrimeiroDiaMesIso = () => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
  }

  const [dataInicio, setDataInicio] = useState<string>(getPrimeiroDiaMesIso())
  const [dataFim, setDataFim] = useState<string>(getHojeIso())
  const [loading, setLoading] = useState<boolean>(false)
  const [resultado, setResultado] = useState<ResumoAuditoria | null>(null)
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'divergente' | 'consistente' | 'novo_fornecedor'>('todos')
  const [buscaFornecedor, setBuscaFornecedor] = useState<string>('')
  const [modalFase2Aberto, setModalFase2Aberto] = useState<boolean>(false)

  // Presets de data
  const aplicarPreset = (tipo: 'mes_atual' | 'mes_anterior' | 'ultimos_30d' | 'ano_atual') => {
    const hoje = new Date()
    if (tipo === 'mes_atual') {
      const ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
      setDataInicio(ini.toISOString().slice(0, 10))
      setDataFim(hoje.toISOString().slice(0, 10))
    } else if (tipo === 'mes_anterior') {
      const ini = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)
      const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0)
      setDataInicio(ini.toISOString().slice(0, 10))
      setDataFim(fim.toISOString().slice(0, 10))
    } else if (tipo === 'ultimos_30d') {
      const ini = new Date(hoje.getTime() - 30 * 24 * 60 * 60 * 1000)
      setDataInicio(ini.toISOString().slice(0, 10))
      setDataFim(hoje.toISOString().slice(0, 10))
    } else if (tipo === 'ano_atual') {
      const ini = new Date(hoje.getFullYear(), 0, 1)
      setDataInicio(ini.toISOString().slice(0, 10))
      setDataFim(hoje.toISOString().slice(0, 10))
    }
  }

  const executarAuditoria = async () => {
    if (!empresaAtiva) {
      toast.error('Selecione uma empresa antes de executar a auditoria.')
      return
    }
    if (!dataInicio || !dataFim) {
      toast.error('Informe a data inicial e a data final.')
      return
    }
    if (dataInicio > dataFim) {
      toast.error('A data inicial não pode ser superior à data final.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auditoria-categorias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empresa_id: empresaAtiva.id,
          data_inicio: dataInicio,
          data_fim: dataFim
        })
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao processar auditoria.')
      }

      setResultado(data)
      if (data.totalAuditado === 0) {
        toast('Nenhum lançamento encontrado no Conta Azul para o período selecionado.', {
          icon: 'ℹ️'
        })
      } else if (data.totalDivergentes > 0) {
        toast.error(`${data.totalDivergentes} divergência(s) detectada(s)!`)
      } else {
        toast.success('Auditoria concluída com 100% de consistência!')
      }
    } catch (err: any) {
      console.error(err)
      toast.error(err.message || 'Falha ao executar auditoria de categorias.')
    } finally {
      setLoading(false)
    }
  }

  // Filtragem dos itens da tabela
  const itensFiltrados = (resultado?.itens || []).filter(item => {
    const matchStatus = filtroStatus === 'todos' || item.status === filtroStatus
    const matchBusca = buscaFornecedor === '' ||
      item.fornecedor.toLowerCase().includes(buscaFornecedor.toLowerCase()) ||
      item.categoriaAtual.toLowerCase().includes(buscaFornecedor.toLowerCase()) ||
      item.categoriaEsperada.toLowerCase().includes(buscaFornecedor.toLowerCase())
    return matchStatus && matchBusca
  })

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 select-none">
      {/* Topo / Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-dark-900 border border-dark-700/80 p-6 rounded-2xl shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400">
              <ShieldCheck size={26} />
            </div>
            <div>
              <h1 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                Auditoria de Categorias
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Inteligência Histórica
                </span>
              </h1>
              <p className="text-xs text-dark-400">
                Aprende o padrão dos fornecedores nos 6 meses anteriores e identifica desvios de categorização no Conta Azul.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <SelectorEmpresa />
        </div>
      </div>

      {/* Painel de Filtros e Disparo */}
      <div className="bg-dark-900 border border-dark-700/80 p-6 rounded-2xl space-y-4 shadow-lg">
        <div className="flex items-center justify-between border-b border-dark-700/60 pb-3">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
            <Calendar size={18} className="text-amber-400" />
            <span>Período a Auditar</span>
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-dark-400 mr-1 hidden sm:inline">Atalhos:</span>
            <button
              onClick={() => aplicarPreset('mes_atual')}
              className="px-2.5 py-1 rounded-lg bg-dark-800 hover:bg-dark-700 border border-dark-600 text-dark-300 hover:text-white transition-all text-xs"
            >
              Mês Atual
            </button>
            <button
              onClick={() => aplicarPreset('mes_anterior')}
              className="px-2.5 py-1 rounded-lg bg-dark-800 hover:bg-dark-700 border border-dark-600 text-dark-300 hover:text-white transition-all text-xs"
            >
              Mês Anterior
            </button>
            <button
              onClick={() => aplicarPreset('ultimos_30d')}
              className="px-2.5 py-1 rounded-lg bg-dark-800 hover:bg-dark-700 border border-dark-600 text-dark-300 hover:text-white transition-all text-xs"
            >
              Últimos 30d
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-xs font-semibold text-dark-300 mb-1.5">
              Data Inicial (Competência)
            </label>
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="w-full px-3 py-2.5 bg-dark-800 border border-dark-600 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-dark-300 mb-1.5">
              Data Final (Competência)
            </label>
            <input
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="w-full px-3 py-2.5 bg-dark-800 border border-dark-600 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          <div>
            <button
              onClick={executarAuditoria}
              disabled={loading || !empresaAtiva}
              className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {loading ? (
                <>
                  <RefreshCw size={18} className="animate-spin" />
                  <span>Analisando Histórico...</span>
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  <span>Executar Auditoria</span>
                </>
              )}
            </button>
          </div>
        </div>

        {resultado && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-xs text-dark-400 border-t border-dark-700/40">
            <div className="flex items-center gap-2">
              <Database size={14} className="text-indigo-400" />
              <span>
                Base de Aprendizado Histórico:{' '}
                <strong className="text-slate-300">
                  {formatDate(resultado.periodoHistoricoAprendizado.inicio)} até {formatDate(resultado.periodoHistoricoAprendizado.fim)}
                </strong>{' '}
                (últimos 6 meses)
              </span>
            </div>

            
          </div>
        )}
      </div>

      {/* Cards de Métricas e Filtros Rápidos */}
      {resultado && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Lançamentos Auditados (Todos) */}
          <button
            type="button"
            onClick={() => setFiltroStatus('todos')}
            className={`text-left p-5 rounded-2xl shadow-md transition-all duration-200 cursor-pointer transform hover:-translate-y-0.5 ${
              filtroStatus === 'todos'
                ? 'bg-dark-850 border-2 border-amber-500 shadow-amber-500/10 shadow-lg ring-1 ring-amber-500/40'
                : 'bg-dark-900 border border-dark-700/80 hover:border-dark-500 hover:shadow-lg'
            }`}
          >
            <div className="flex items-center justify-between">
              <p className={`text-xs font-semibold ${filtroStatus === 'todos' ? 'text-amber-400' : 'text-dark-400'}`}>
                Lançamentos Auditados
              </p>
              {filtroStatus === 'todos' && (
                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  Ativo
                </span>
              )}
            </div>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-2xl font-black text-white">{resultado.totalAuditado}</span>
              <span className="text-xs text-dark-400">{formatCurrency(resultado.valorTotalAuditado)}</span>
            </div>
          </button>

          {/* Card 2: Consistentes */}
          <button
            type="button"
            onClick={() => setFiltroStatus('consistente')}
            className={`text-left p-5 rounded-2xl shadow-md transition-all duration-200 cursor-pointer transform hover:-translate-y-0.5 ${
              filtroStatus === 'consistente'
                ? 'bg-emerald-500/[0.08] border-2 border-emerald-500 shadow-emerald-500/10 shadow-lg ring-1 ring-emerald-500/40'
                : 'bg-dark-900 border border-dark-700/80 hover:border-emerald-500/50 hover:shadow-lg'
            }`}
          >
            <div className="flex items-center justify-between">
              <p className={`text-xs font-semibold ${filtroStatus === 'consistente' ? 'text-emerald-300' : 'text-dark-400'}`}>
                Consistentes
              </p>
              <div className="flex items-center gap-1.5">
                {filtroStatus === 'consistente' && (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Ativo
                  </span>
                )}
                <span className="p-1 rounded bg-emerald-500/10 text-emerald-400">
                  <CheckCircle2 size={14} />
                </span>
              </div>
            </div>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-2xl font-black text-emerald-400">{resultado.totalConsistentes}</span>
              <span className="text-xs text-dark-400 font-bold">
                {resultado.totalAuditado > 0
                  ? Math.round((resultado.totalConsistentes / resultado.totalAuditado) * 100)
                  : 0}%
              </span>
            </div>
          </button>

          {/* Card 3: Divergências Detectadas */}
          <button
            type="button"
            onClick={() => setFiltroStatus('divergente')}
            className={`text-left p-5 rounded-2xl shadow-md transition-all duration-200 cursor-pointer transform hover:-translate-y-0.5 ${
              filtroStatus === 'divergente'
                ? 'bg-rose-500/15 border-2 border-rose-500 shadow-rose-500/20 shadow-lg ring-1 ring-rose-500/50'
                : 'bg-dark-900 border border-rose-500/30 bg-rose-500/5 hover:border-rose-500/60 hover:shadow-lg'
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs text-rose-300 font-semibold">Divergências Detectadas</p>
              <div className="flex items-center gap-1.5">
                {filtroStatus === 'divergente' && (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-rose-500/30 text-rose-300 border border-rose-500/40">
                    Ativo
                  </span>
                )}
                <span className="p-1 rounded bg-rose-500/20 text-rose-400">
                  <AlertTriangle size={14} />
                </span>
              </div>
            </div>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-2xl font-black text-rose-400">{resultado.totalDivergentes}</span>
              <span className="text-xs text-rose-300 font-bold">
                {formatCurrency(resultado.valorTotalDivergente)}
              </span>
            </div>
          </button>

          {/* Card 4: Novos Fornecedores */}
          <button
            type="button"
            onClick={() => setFiltroStatus('novo_fornecedor')}
            className={`text-left p-5 rounded-2xl shadow-md transition-all duration-200 cursor-pointer transform hover:-translate-y-0.5 ${
              filtroStatus === 'novo_fornecedor'
                ? 'bg-sky-500/[0.08] border-2 border-sky-500 shadow-sky-500/10 shadow-lg ring-1 ring-sky-500/40'
                : 'bg-dark-900 border border-dark-700/80 hover:border-sky-500/50 hover:shadow-lg'
            }`}
          >
            <div className="flex items-center justify-between">
              <p className={`text-xs font-semibold ${filtroStatus === 'novo_fornecedor' ? 'text-sky-300' : 'text-dark-400'}`}>
                Novos Fornecedores
              </p>
              <div className="flex items-center gap-1.5">
                {filtroStatus === 'novo_fornecedor' && (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                    Ativo
                  </span>
                )}
                <span className="p-1 rounded bg-sky-500/10 text-sky-400">
                  <Info size={14} />
                </span>
              </div>
            </div>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-2xl font-black text-sky-400">{resultado.totalNovosFornecedores}</span>
              <span className="text-xs text-dark-400">Sem histórico prévio</span>
            </div>
          </button>
        </div>
      )}

      {/* Tabela de Resultados */}
      {resultado && (
        <div className="bg-dark-900 border border-dark-700/80 rounded-2xl overflow-hidden shadow-xl space-y-4 p-5">
          {/* Barra de Filtros e Ações da Tabela */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-dark-700/60 pb-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[240px]">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
                <input
                  type="text"
                  placeholder="Buscar por fornecedor ou categoria..."
                  value={buscaFornecedor}
                  onChange={(e) => setBuscaFornecedor(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-dark-800 border border-dark-600 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>

              {/* Filtro de Status */}
              <div className="flex items-center gap-1 bg-dark-800 p-1 rounded-xl border border-dark-700 text-xs">
                <button
                  onClick={() => setFiltroStatus('todos')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                    filtroStatus === 'todos' ? 'bg-dark-700 text-white shadow' : 'text-dark-400 hover:text-slate-200'
                  }`}
                >
                  Todos ({resultado.itens.length})
                </button>
                <button
                  onClick={() => setFiltroStatus('divergente')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                    filtroStatus === 'divergente' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'text-dark-400 hover:text-rose-400'
                  }`}
                >
                  Divergentes ({resultado.totalDivergentes})
                </button>
                <button
                  onClick={() => setFiltroStatus('consistente')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                    filtroStatus === 'consistente' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'text-dark-400 hover:text-emerald-400'
                  }`}
                >
                  Consistentes ({resultado.totalConsistentes})
                </button>
                <button
                  onClick={() => setFiltroStatus('novo_fornecedor')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                    filtroStatus === 'novo_fornecedor' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30' : 'text-dark-400 hover:text-sky-400'
                  }`}
                >
                  Novos ({resultado.totalNovosFornecedores})
                </button>
              </div>
            </div>

            {/* BOTÃO FASE 2: Corrigir Divergências */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setModalFase2Aberto(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/20 transition-all"
              >
                <Wrench size={15} />
                <span>Corrigir Divergências</span>
                <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-indigo-950/80 text-indigo-300 border border-indigo-400/30">
                  Fase 2
                </span>
              </button>
            </div>
          </div>

          {/* Indicador Visual do Filtro Ativo */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 bg-dark-800/60 border border-dark-700/60 rounded-xl text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-dark-400 font-medium">Exibindo:</span>
              {filtroStatus === 'todos' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold bg-amber-500/10 border border-amber-500/30 text-amber-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  {resultado.totalAuditado} Lançamentos Auditados
                </span>
              )}
              {filtroStatus === 'consistente' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {resultado.totalConsistentes} Consistentes
                </span>
              )}
              {filtroStatus === 'divergente' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold bg-rose-500/10 border border-rose-500/30 text-rose-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
                  {resultado.totalDivergentes} Divergências Detectadas
                </span>
              )}
              {filtroStatus === 'novo_fornecedor' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold bg-sky-500/10 border border-sky-500/30 text-sky-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
                  {resultado.totalNovosFornecedores} Novos Fornecedores
                </span>
              )}
              {buscaFornecedor.trim() !== '' && (
                <span className="text-dark-400">
                  filtrado por termo <strong className="text-slate-300 font-semibold">&quot;{buscaFornecedor}&quot;</strong> ({itensFiltrados.length} encontrados)
                </span>
              )}
            </div>

            {filtroStatus !== 'todos' && (
              <button
                type="button"
                onClick={() => setFiltroStatus('todos')}
                className="text-dark-400 hover:text-white transition-colors underline text-[11px]"
              >
                Limpar filtro de status
              </button>
            )}
          </div>

          {/* Listagem em Tabela */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300 border-collapse">
              <thead>
                <tr className="border-b border-dark-700/80 bg-dark-950/50 text-[11px] font-bold text-dark-400 uppercase tracking-wider">
                  <th className="py-3 px-4">Fornecedor</th>
                  <th className="py-3 px-4">Categoria Esperada (Histórica)</th>
                  <th className="py-3 px-4">Categoria Atual (Conta Azul)</th>
                  <th className="py-3 px-4 text-center">Confiança</th>
                  <th className="py-3 px-4 text-right">Valor</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-800/60 font-medium">
                {itensFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-dark-400">
                      Nenhum lançamento encontrado para os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  itensFiltrados.map((item) => {
                    const isDivergente = item.status === 'divergente'
                    const isConsistente = item.status === 'consistente'

                    return (
                      <tr
                        key={item.id}
                        className={`transition-colors hover:bg-dark-800/50 ${
                          isDivergente ? 'bg-rose-500/[0.04]' : ''
                        }`}
                      >
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-white max-w-[240px] truncate" title={item.fornecedor}>
                            {item.fornecedor}
                          </div>
                          <div className="text-[10px] text-dark-400 flex items-center gap-1.5 mt-0.5">
                            <span>{formatDate(item.dataCompetencia)}</span>
                            {item.descricao && item.descricao !== item.fornecedor && (
                              <span className="truncate max-w-[180px]" title={item.descricao}>
                                • {item.descricao}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-200">
                            {item.categoriaEsperada}
                          </div>
                          {item.totalHistoricoFornecedor > 0 && (
                            <div className="text-[10px] text-dark-400 mt-0.5">
                              Base: {item.totalHistoricoFornecedor} lançamentos prévios
                            </div>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          <div className={`font-semibold ${
                            isDivergente ? 'text-rose-400 font-bold' : 'text-slate-300'
                          }`}>
                            {item.categoriaAtual}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          {item.totalHistoricoFornecedor > 0 ? (
                            <div className="flex flex-col items-center gap-1">
                              <span className="font-mono text-[11px] font-bold text-slate-200">
                                {item.percentualConfianca}%
                              </span>
                              <div className="w-16 h-1.5 bg-dark-700 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    item.percentualConfianca >= 80
                                      ? 'bg-emerald-500'
                                      : item.percentualConfianca >= 50
                                      ? 'bg-amber-500'
                                      : 'bg-rose-500'
                                  }`}
                                  style={{ width: `${item.percentualConfianca}%` }}
                                />
                              </div>
                            </div>
                          ) : (
                            <span className="text-dark-500 text-[11px]">-</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-200">
                          {formatCurrency(item.valor)}
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          {isDivergente && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                              <AlertTriangle size={12} />
                              Divergente
                            </span>
                          )}
                          {isConsistente && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              <CheckCircle2 size={12} />
                              Consistente
                            </span>
                          )}
                          {item.status === 'novo_fornecedor' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-sky-500/20 text-sky-300 border border-sky-500/30">
                              <Info size={12} />
                              Sem Histórico
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL FASE 2: Preparação de Estrutura */}
      {modalFase2Aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-dark-900 border border-dark-700 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl relative">
            <button
              onClick={() => setModalFase2Aberto(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800 transition-colors"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-500/10 border border-indigo-500/30 rounded-xl text-indigo-400">
                <Wrench size={24} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  Fase 2: Correção de Divergências
                </h3>
                <p className="text-xs text-dark-400">
                  Estrutura preparada para automação via API do Conta Azul.
                </p>
              </div>
            </div>

            <div className="bg-dark-800/80 border border-dark-700 rounded-xl p-4 text-xs text-slate-300 space-y-2.5 leading-relaxed">
              <p>
                <strong className="text-indigo-300">Status Operacional:</strong> Apenas preparação de interface e mapeamento. Nenhuma alteração automática foi disparada contra o Conta Azul, respeitando os requisitos de segurança.
              </p>
              <p>
                Quando a Fase 2 for formalmente liberada, esta funcionalidade permitirá:
              </p>
              <ul className="list-disc list-inside space-y-1 text-dark-300 pl-1">
                <li>Atualizar a categoria do lançamento diretamente no Conta Azul via PUT /v1/finance/payable.</li>
                <li>Gravar log de auditoria com usuário responsável e data da correção.</li>
                <li>Atualizar a tabela espelho imediatamente após a retificação.</li>
              </ul>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setModalFase2Aberto(false)}
                className="px-4 py-2 rounded-xl bg-dark-800 hover:bg-dark-700 border border-dark-600 text-slate-200 text-xs font-semibold transition-all"
              >
                Compreendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
