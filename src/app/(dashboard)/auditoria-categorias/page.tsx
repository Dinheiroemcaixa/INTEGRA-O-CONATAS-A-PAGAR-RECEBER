'use client'

import React, { useState, useEffect } from 'react'
import { useEmpresa } from '@/contexts/EmpresaContext'
import SelectorEmpresa from '@/components/layout/SelectorEmpresa'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  ShieldCheck, AlertTriangle, CheckCircle2, Calendar,
  Search, RefreshCw, Wrench, Sparkles, Filter,
  Building2, ArrowUpDown, ChevronRight, HelpCircle,
  X, Check, AlertCircle, Info, Database, CheckCheck
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
  statusDivergencia?: 'PENDENTE' | 'JUSTIFICADA' | 'CORRIGIDA' | 'VALIDADA'
  motivoJustificativa?: string | null
  justificadoPor?: string | null
  justificadoEm?: string | null
}

interface ResumoAuditoria {
  totalAuditado: number
  totalConsistentes: number
  totalDivergentes: number
  totalNovosFornecedores: number
  totalPendentes?: number
  totalJustificadas?: number
  totalCorrigidas?: number
  totalValidadas?: number
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
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'divergente' | 'divergente_pendente' | 'divergente_justificada' | 'divergente_corrigida' | 'divergente_validada' | 'consistente' | 'novo_fornecedor'>('todos')
  const [buscaFornecedor, setBuscaFornecedor] = useState<string>('')
  const [statusDivergenciaForm, setStatusDivergenciaForm] = useState<'PENDENTE' | 'JUSTIFICADA' | 'CORRIGIDA' | 'VALIDADA'>('PENDENTE')
  const [motivoJustificativaForm, setMotivoJustificativaForm] = useState<string>('')
  const [salvandoJustificativa, setSalvandoJustificativa] = useState<boolean>(false)
  const [validandoContaAzul, setValidandoContaAzul] = useState<boolean>(false)

  const [modalFase2Aberto, setModalFase2Aberto] = useState<boolean>(false)
  const [itemSelecionado, setItemSelecionado] = useState<ItemAuditoria | null>(null)

  useEffect(() => {
    if (itemSelecionado) {
      setStatusDivergenciaForm(itemSelecionado.statusDivergencia || 'PENDENTE')
      setMotivoJustificativaForm(itemSelecionado.motivoJustificativa || '')
    }
  }, [itemSelecionado])
  const [dadosHistorico, setDadosHistorico] = useState<{
    fornecedor: string
    totalHistorico: number
    distribuicaoCategorias: Array<{ categoria: string; quantidade: number; valorTotal: number; percentual: number }>
    ultimosLancamentos: Array<{
      id: string
      contaAzulId?: string | null
      categoria: string
      valor: number
      dataCompetencia: string
      dataVencimento?: string | null
      descricao?: string | null
      status?: string | null
    }>
  } | null>(null)
  const [carregandoHistorico, setCarregandoHistorico] = useState<boolean>(false)

  // Fechar gaveta/modal com tecla ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (itemSelecionado) setItemSelecionado(null)
        if (modalFase2Aberto) setModalFase2Aberto(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [itemSelecionado, modalFase2Aberto])

  const abrirDetalhesFornecedor = async (item: ItemAuditoria) => {
    setItemSelecionado(item)
    setDadosHistorico(null)
    if (!empresaAtiva?.id) return

    setCarregandoHistorico(true)
    try {
      const res = await fetch(`/api/auditoria-categorias?empresa_id=${empresaAtiva.id}&fornecedor=${encodeURIComponent(item.fornecedor)}`)
      if (res.ok) {
        const data = await res.json()
        setDadosHistorico(data)
      } else {
        console.warn('Não foi possível carregar histórico do fornecedor')
      }
    } catch (err) {
      console.error('Erro ao buscar histórico do fornecedor:', err)
    } finally {
      setCarregandoHistorico(false)
    }
  }

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

  const handleSalvarJustificativa = async () => {
    if (!empresaAtiva?.id) {
      toast.error('Selecione uma empresa ativa.')
      return
    }
    if (!itemSelecionado?.contaAzulId) {
      toast.error('Identificador do Conta Azul não localizado para este lançamento.')
      return
    }

    try {
      setSalvandoJustificativa(true)
      const res = await fetch('/api/auditoria-categorias/justificar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empresa_id: empresaAtiva.id,
          conta_azul_id: itemSelecionado.contaAzulId,
          fornecedor_nome: itemSelecionado.fornecedor,
          categoria_original: itemSelecionado.categoriaAtual,
          categoria_sugerida: itemSelecionado.categoriaEsperada,
          status_divergencia: statusDivergenciaForm,
          motivo_justificativa: motivoJustificativaForm,
          usuario_email: 'auditor@connecta.ai'
        })
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao gravar justificativa contábil')
      }

      toast.success('Justificativa contábil gravada com sucesso!')

      const agoraIso = new Date().toISOString()
      const novoStatus = statusDivergenciaForm
      const novoMotivo = motivoJustificativaForm

      setItemSelecionado((prev) =>
        prev
          ? {
              ...prev,
              statusDivergencia: novoStatus,
              motivoJustificativa: novoMotivo,
              justificadoEm: agoraIso
            }
          : null
      )

      setResultado((prev) => {
        if (!prev) return null
        const novosItens = prev.itens.map((it) => {
          if (it.contaAzulId === itemSelecionado.contaAzulId) {
            return {
              ...it,
              statusDivergencia: novoStatus,
              motivoJustificativa: novoMotivo,
              justificadoEm: agoraIso
            }
          }
          return it
        })

        let pend = 0
        let just = 0
        let corr = 0
        let valid = 0
        novosItens.forEach((it) => {
          if (it.status === 'divergente') {
            if (it.statusDivergencia === 'JUSTIFICADA') just++
            else if (it.statusDivergencia === 'CORRIGIDA') corr++
            else if (it.statusDivergencia === 'VALIDADA') valid++
            else pend++
          }
        })

        return {
          ...prev,
          itens: novosItens,
          totalPendentes: pend,
          totalJustificadas: just,
          totalCorrigidas: corr,
          totalValidadas: valid
        }
      })
    } catch (err: any) {
      console.error('Erro ao gravar justificativa:', err)
      toast.error(err.message || 'Falha ao salvar justificativa.')
    } finally {
      setSalvandoJustificativa(false)
    }
  }

  const handleValidarNoContaAzul = async () => {
    if (!empresaAtiva?.id) {
      toast.error('Selecione uma empresa ativa.')
      return
    }
    if (!itemSelecionado?.contaAzulId) {
      toast.error('Identificador do Conta Azul não localizado para este lançamento.')
      return
    }

    try {
      setValidandoContaAzul(true)
      const res = await fetch('/api/auditoria-categorias/validar-correcao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empresa_id: empresaAtiva.id,
          conta_azul_id: itemSelecionado.contaAzulId,
          usuario_email: 'auditor@connecta.ai'
        })
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao validar correção no Conta Azul')
      }

      if (data.validado) {
        toast.success(data.mensagem || 'Correção confirmada com sucesso no Conta Azul!')

        const agoraIso = new Date().toISOString()
        const novaCat = data.categoriaEncontrada

        setItemSelecionado((prev) =>
          prev
            ? {
                ...prev,
                categoriaAtual: novaCat,
                statusDivergencia: 'VALIDADA',
                motivoJustificativa: `Validado via integração Conta Azul em ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}. Categoria confirmada: "${novaCat}".`,
                justificadoEm: agoraIso
              }
            : null
        )

        setStatusDivergenciaForm('VALIDADA')
        setMotivoJustificativaForm(`Validado via integração Conta Azul em ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}. Categoria confirmada: "${novaCat}".`)

        setResultado((prev) => {
          if (!prev) return null
          const novosItens = prev.itens.map((it) => {
            if (it.contaAzulId === itemSelecionado.contaAzulId) {
              return {
                ...it,
                categoriaAtual: novaCat,
                statusDivergencia: 'VALIDADA' as const,
                justificadoEm: agoraIso
              }
            }
            return it
          })

          let pend = 0
          let just = 0
          let corr = 0
          let valid = 0
          novosItens.forEach((it) => {
            if (it.status === 'divergente') {
              if (it.statusDivergencia === 'JUSTIFICADA') just++
              else if (it.statusDivergencia === 'CORRIGIDA') corr++
              else if (it.statusDivergencia === 'VALIDADA') valid++
              else pend++
            }
          })

          return {
            ...prev,
            itens: novosItens,
            totalPendentes: pend,
            totalJustificadas: just,
            totalCorrigidas: corr,
            totalValidadas: valid
          }
        })
      } else {
        toast.error(data.mensagem || 'A alteração ainda não foi realizada no Conta Azul.', { duration: 6000 })
      }
    } catch (err: any) {
      console.error('Erro ao validar correção no Conta Azul:', err)
      toast.error(err.message || 'Falha ao consultar Conta Azul.')
    } finally {
      setValidandoContaAzul(false)
    }
  }

  // Filtragem dos itens da tabela
  const itensFiltrados = (resultado?.itens || []).filter(item => {
    let matchStatus = true
    if (filtroStatus === 'todos') matchStatus = true
    else if (filtroStatus === 'divergente') matchStatus = item.status === 'divergente'
    else if (filtroStatus === 'divergente_pendente') matchStatus = item.status === 'divergente' && (!item.statusDivergencia || item.statusDivergencia === 'PENDENTE')
    else if (filtroStatus === 'divergente_justificada') matchStatus = item.status === 'divergente' && item.statusDivergencia === 'JUSTIFICADA'
    else if (filtroStatus === 'divergente_corrigida') matchStatus = item.status === 'divergente' && item.statusDivergencia === 'CORRIGIDA'
    else if (filtroStatus === 'divergente_validada') matchStatus = item.status === 'divergente' && item.statusDivergencia === 'VALIDADA'
    else if (filtroStatus === 'consistente') matchStatus = item.status === 'consistente'
    else if (filtroStatus === 'novo_fornecedor') matchStatus = item.status === 'novo_fornecedor'
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
            {resultado.totalDivergentes > 0 && (
              <div className="flex items-center gap-1.5 mt-2.5 pt-2 border-t border-rose-500/20 text-[10px]">
                <span className="text-rose-300 font-bold">
                  Pend: <strong>{resultado.totalPendentes ?? resultado.totalDivergentes}</strong>
                </span>
                <span className="text-dark-500">•</span>
                <span className="text-amber-300 font-semibold">
                  Just: <strong>{resultado.totalJustificadas ?? 0}</strong>
                </span>
                <span className="text-dark-500">•</span>
                <span className="text-purple-300 font-semibold">
                  Corr: <strong>{resultado.totalCorrigidas ?? 0}</strong>
                </span>
                <span className="text-dark-500">•</span>
                <span className="text-emerald-300 font-semibold">
                  Valid: <strong>{resultado.totalValidadas ?? 0}</strong>
                </span>
              </div>
            )}
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
                  onClick={() => setFiltroStatus('divergente_pendente')}
                  className={`px-2 py-1 rounded-lg font-semibold transition-all flex items-center gap-1 text-[11px] ${
                    filtroStatus === 'divergente_pendente' ? 'bg-rose-500/30 text-rose-200 border border-rose-500/50 shadow' : 'text-dark-400 hover:text-rose-300'
                  }`}
                  title="Filtrar divergências pendentes"
                >
                  <AlertTriangle size={11} className="text-rose-400" />
                  Pendentes ({resultado.totalPendentes ?? resultado.totalDivergentes})
                </button>
                <button
                  onClick={() => setFiltroStatus('divergente_justificada')}
                  className={`px-2 py-1 rounded-lg font-semibold transition-all flex items-center gap-1 text-[11px] ${
                    filtroStatus === 'divergente_justificada' ? 'bg-amber-500/30 text-amber-200 border border-amber-500/50 shadow' : 'text-dark-400 hover:text-amber-300'
                  }`}
                  title="Filtrar divergências justificadas"
                >
                  <HelpCircle size={11} className="text-amber-400" />
                  Justificadas ({resultado.totalJustificadas ?? 0})
                </button>
                <button
                  onClick={() => setFiltroStatus('divergente_corrigida')}
                  className={`px-2 py-1 rounded-lg font-semibold transition-all flex items-center gap-1 text-[11px] ${
                    filtroStatus === 'divergente_corrigida' ? 'bg-purple-500/30 text-purple-200 border border-purple-500/50 shadow' : 'text-dark-400 hover:text-purple-300'
                  }`}
                  title="Filtrar divergências corrigidas"
                >
                  <Check size={11} className="text-purple-400" />
                  Corrigidas ({resultado.totalCorrigidas ?? 0})
                </button>
                <button
                  onClick={() => setFiltroStatus('divergente_validada')}
                  className={`px-2 py-1 rounded-lg font-semibold transition-all flex items-center gap-1 text-[11px] ${
                    filtroStatus === 'divergente_validada' ? 'bg-emerald-500/30 text-emerald-200 border border-emerald-500/50 shadow' : 'text-dark-400 hover:text-emerald-300'
                  }`}
                  title="Filtrar divergências validadas no Conta Azul"
                >
                  <CheckCheck size={11} className="text-emerald-400" />
                  Validadas ({resultado.totalValidadas ?? 0})
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
              {filtroStatus === 'divergente_validada' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {resultado.totalValidadas ?? 0} Divergências Validadas no Conta Azul
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
                  <th className="py-3 px-3 text-center w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-800/60 font-medium">
                {itensFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-dark-400">
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
                        onClick={() => abrirDetalhesFornecedor(item)}
                        className={`transition-colors hover:bg-dark-800/80 cursor-pointer group ${
                          isDivergente ? 'bg-rose-500/[0.06]' : ''
                        }`}
                        title="Clique para visualizar o histórico completo deste fornecedor"
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
                            item.statusDivergencia === 'VALIDADA' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40" title={item.motivoJustificativa || 'Divergência Validada no ERP Conta Azul'}>
                                <CheckCheck size={12} className="text-emerald-400" />
                                Divergente Validada
                              </span>
                            ) : item.statusDivergencia === 'JUSTIFICADA' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40" title={item.motivoJustificativa || 'Divergência Justificada'}>
                                <HelpCircle size={12} className="text-amber-400" />
                                Divergente Justificada
                              </span>
                            ) : item.statusDivergencia === 'CORRIGIDA' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-purple-500/20 text-purple-300 border border-purple-500/40" title={item.motivoJustificativa || 'Divergência Corrigida no ERP'}>
                                <Check size={12} className="text-purple-400" />
                                Divergente Corrigida
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                                <AlertTriangle size={12} className="text-rose-400" />
                                Divergente Pendente
                              </span>
                            )
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
                        <td className="py-3.5 px-3 text-center">
                          <ChevronRight size={16} className="text-dark-500 group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all inline-block" />
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

      
      {/* DRAWER LATERAL: Detalhes e Histórico Completo do Fornecedor */}
      {itemSelecionado && (
        <div 
          className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-xs transition-opacity duration-300 animate-fadeIn"
          onClick={() => setItemSelecionado(null)}
        >
          <div 
            className="w-full max-w-2xl bg-dark-900 border-l border-dark-700/80 h-full flex flex-col shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header do Drawer */}
            <div className="p-5 sm:p-6 border-b border-dark-700/80 bg-dark-950/60 flex items-start justify-between gap-4">
              <div className="space-y-1.5 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-dark-800 border border-dark-700 text-amber-400">
                    <Building2 size={16} />
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-white truncate max-w-[360px] sm:max-w-[440px]" title={itemSelecionado.fornecedor}>
                    {itemSelecionado.fornecedor}
                  </h3>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {itemSelecionado.status === 'divergente' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                      <AlertTriangle size={12} />
                      Classificação Divergente
                    </span>
                  )}
                  {itemSelecionado.status === 'consistente' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      <CheckCircle2 size={12} />
                      Classificação Consistente
                    </span>
                  )}
                  {itemSelecionado.status === 'novo_fornecedor' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30">
                      <Info size={12} />
                      Novo Fornecedor / Sem Histórico
                    </span>
                  )}
                  <span className="text-dark-400 text-xs">
                    Competência: <strong className="text-slate-300">{formatDate(itemSelecionado.dataCompetencia)}</strong>
                  </span>
                </div>
              </div>

              <button
                onClick={() => setItemSelecionado(null)}
                className="p-2 rounded-xl bg-dark-800 border border-dark-700 text-dark-400 hover:text-white hover:bg-dark-700 transition-colors"
                title="Fechar painel"
              >
                <X size={18} />
              </button>
            </div>

            {/* Conteúdo com Scroll */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
              {/* Explicação Visual do Motivo da Classificação */}
              <div className={`p-4 rounded-2xl border text-xs leading-relaxed space-y-2 ${
                itemSelecionado.status === 'divergente'
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                  : itemSelecionado.status === 'consistente'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                  : 'bg-sky-500/10 border-sky-500/30 text-sky-200'
              }`}>
                <div className="flex items-center gap-2 font-bold text-sm">
                  {itemSelecionado.status === 'divergente' && (
                    <>
                      <AlertTriangle size={18} className="text-rose-400 shrink-0" />
                      <span>Motivo da Inconsistência: Quebra do Padrão Histórico</span>
                    </>
                  )}
                  {itemSelecionado.status === 'consistente' && (
                    <>
                      <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
                      <span>Classificação Validada: Padrão Histórico Confirmado</span>
                    </>
                  )}
                  {itemSelecionado.status === 'novo_fornecedor' && (
                    <>
                      <Info size={18} className="text-sky-400 shrink-0" />
                      <span>Primeira Ocorrência / Fornecedor Recente</span>
                    </>
                  )}
                </div>

                <p className="text-slate-300 text-xs leading-relaxed">
                  {itemSelecionado.status === 'divergente' && (
                    <>
                      Este fornecedor utiliza predominantemente a categoria <strong className="text-white font-bold underline">{itemSelecionado.categoriaEsperada}</strong> com <strong className="text-white font-bold">{itemSelecionado.percentualConfianca}% de confiança</strong> (base de {itemSelecionado.totalHistoricoFornecedor} lançamentos analisados nos últimos 6 meses). O lançamento atual foi categorizado no Conta Azul como <strong className="text-rose-400 font-bold underline">{itemSelecionado.categoriaAtual}</strong>, caracterizando um desvio contábil.
                    </>
                  )}
                  {itemSelecionado.status === 'consistente' && (
                    <>
                      A categoria <strong className="text-white font-bold underline">{itemSelecionado.categoriaAtual}</strong> coincide perfeitamente com a categoria predominante no histórico deste fornecedor (<strong className="text-white font-bold">{itemSelecionado.percentualConfianca}%</strong> de aderência estatística em {itemSelecionado.totalHistoricoFornecedor} lançamentos prévios).
                    </>
                  )}
                  {itemSelecionado.status === 'novo_fornecedor' && (
                    <>
                      Não foram identificados lançamentos deste fornecedor nos últimos 6 meses anteriores ao período auditado. A categoria atual <strong className="text-white font-bold">&quot;{itemSelecionado.categoriaAtual}&quot;</strong> servirá como base de aprendizado para futuras auditorias.
                    </>
                  )}
                </p>
              </div>

              {/* Cards de Métricas Comparativas */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 bg-dark-800/80 border border-dark-700/80 rounded-xl space-y-1">
                  <span className="text-[10px] font-bold text-dark-400 uppercase tracking-wider block">
                    Categoria Atual
                  </span>
                  <p className={`text-xs font-bold truncate ${
                    itemSelecionado.status === 'divergente' ? 'text-rose-400' : 'text-slate-200'
                  }`} title={itemSelecionado.categoriaAtual}>
                    {itemSelecionado.categoriaAtual}
                  </p>
                </div>

                <div className="p-3.5 bg-dark-800/80 border border-dark-700/80 rounded-xl space-y-1">
                  <span className="text-[10px] font-bold text-dark-400 uppercase tracking-wider block">
                    Histórica Esperada
                  </span>
                  <p className="text-xs font-bold text-emerald-400 truncate" title={itemSelecionado.categoriaEsperada}>
                    {itemSelecionado.categoriaEsperada}
                  </p>
                </div>

                <div className="p-3.5 bg-dark-800/80 border border-dark-700/80 rounded-xl space-y-1">
                  <span className="text-[10px] font-bold text-dark-400 uppercase tracking-wider block">
                    Confiança
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-black text-amber-400 font-mono">
                      {itemSelecionado.percentualConfianca}%
                    </span>
                    <div className="flex-1 h-1.5 bg-dark-700 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-amber-400 rounded-full" 
                        style={{ width: `${itemSelecionado.percentualConfianca}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="p-3.5 bg-dark-800/80 border border-dark-700/80 rounded-xl space-y-1">
                  <span className="text-[10px] font-bold text-dark-400 uppercase tracking-wider block">
                    Base Histórica
                  </span>
                  <p className="text-xs font-black text-sky-400 font-mono">
                    {itemSelecionado.totalHistoricoFornecedor} lançamentos
                  </p>
                </div>
              </div>

              {/* Detalhes do Lançamento Auditado */}
              <div className="p-4 bg-dark-800/50 border border-dark-700/60 rounded-2xl space-y-3">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <Database size={14} className="text-amber-400" />
                  Dados do Lançamento Auditado
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="text-dark-400 text-[11px] block">Valor:</span>
                    <strong className="text-white font-mono text-sm">{formatCurrency(itemSelecionado.valor)}</strong>
                  </div>
                  <div>
                    <span className="text-dark-400 text-[11px] block">Data de Competência:</span>
                    <strong className="text-slate-200">{formatDate(itemSelecionado.dataCompetencia)}</strong>
                  </div>
                  <div>
                    <span className="text-dark-400 text-[11px] block">Vencimento:</span>
                    <span className="text-slate-300">{formatDate(itemSelecionado.dataVencimento)}</span>
                  </div>
                  {itemSelecionado.descricao && (
                    <div className="col-span-2 sm:col-span-3">
                      <span className="text-dark-400 text-[11px] block">Descrição / Observação:</span>
                      <p className="text-slate-300 bg-dark-900/60 p-2 rounded-lg border border-dark-700/50 text-[11px] mt-0.5">
                        {itemSelecionado.descricao}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* BLOCO DE GOVERNANÇA E JUSTIFICATIVA CONTÁBIL */}
              <div className="p-4 bg-gradient-to-b from-dark-800/90 to-dark-800/40 border border-amber-500/30 rounded-2xl space-y-4 shadow-lg shadow-black/20">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-2">
                    <ShieldCheck size={16} className="text-amber-400" />
                    Governança & Justificativa Contábil
                  </h4>
                  {itemSelecionado.justificadoEm && (
                    <span className="text-[10px] text-dark-400">
                      Atualizado em: {formatDate(itemSelecionado.justificadoEm)}
                    </span>
                  )}
                </div>

                {/* Validação Automática via API Conta Azul */}
                <div className="p-3 bg-dark-900/80 border border-emerald-500/30 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-emerald-300 flex items-center gap-1.5">
                      <CheckCheck size={14} className="text-emerald-400" />
                      Validação Automática no Conta Azul
                    </span>
                    {itemSelecionado.statusDivergencia === 'VALIDADA' && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                        Validada no ERP
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-dark-300">
                    Após corrigir a categoria diretamente no ERP Conta Azul, clique no botão abaixo para reconsultar a API e certificar a correção.
                  </p>
                  <button
                    type="button"
                    onClick={handleValidarNoContaAzul}
                    disabled={validandoContaAzul || !itemSelecionado.contaAzulId}
                    className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs rounded-lg shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    {validandoContaAzul ? (
                      <>
                        <RefreshCw size={13} className="animate-spin" />
                        <span>Consultando Conta Azul...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw size={13} />
                        <span>Verificar no Conta Azul</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Status da Divergência */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1.5">
                    Status da Divergência:
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <button
                      type="button"
                      onClick={() => setStatusDivergenciaForm('PENDENTE')}
                      className={`px-3 py-2 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition-all ${
                        statusDivergenciaForm === 'PENDENTE'
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/60 shadow-md shadow-rose-500/10'
                          : 'bg-dark-900 border-dark-700 text-dark-400 hover:text-slate-200'
                      }`}
                    >
                      <AlertTriangle size={13} className={statusDivergenciaForm === 'PENDENTE' ? 'text-rose-400' : ''} />
                      Pendente
                    </button>

                    <button
                      type="button"
                      onClick={() => setStatusDivergenciaForm('JUSTIFICADA')}
                      className={`px-3 py-2 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition-all ${
                        statusDivergenciaForm === 'JUSTIFICADA'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/60 shadow-md shadow-amber-500/10'
                          : 'bg-dark-900 border-dark-700 text-dark-400 hover:text-slate-200'
                      }`}
                    >
                      <HelpCircle size={13} className={statusDivergenciaForm === 'JUSTIFICADA' ? 'text-amber-400' : ''} />
                      Justificada
                    </button>

                    <button
                      type="button"
                      onClick={() => setStatusDivergenciaForm('CORRIGIDA')}
                      className={`px-3 py-2 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition-all ${
                        statusDivergenciaForm === 'CORRIGIDA'
                          ? 'bg-purple-500/20 text-purple-300 border-purple-500/60 shadow-md shadow-purple-500/10'
                          : 'bg-dark-900 border-dark-700 text-dark-400 hover:text-slate-200'
                      }`}
                    >
                      <Check size={13} className={statusDivergenciaForm === 'CORRIGIDA' ? 'text-purple-400' : ''} />
                      Corrigida
                    </button>

                    <button
                      type="button"
                      onClick={() => setStatusDivergenciaForm('VALIDADA')}
                      className={`px-3 py-2 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition-all ${
                        statusDivergenciaForm === 'VALIDADA'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/60 shadow-md shadow-emerald-500/10'
                          : 'bg-dark-900 border-dark-700 text-dark-400 hover:text-slate-200'
                      }`}
                    >
                      <CheckCheck size={13} className={statusDivergenciaForm === 'VALIDADA' ? 'text-emerald-400' : ''} />
                      Validada
                    </button>
                  </div>
                </div>

                {/* Campo Textarea de Justificativa */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                    Motivo da Justificativa Contábil:
                  </label>
                  <textarea
                    rows={3}
                    value={motivoJustificativaForm}
                    onChange={(e) => setMotivoJustificativaForm(e.target.value)}
                    placeholder="Descreva a justificativa contábil ou motivo da divergência para registro de governança..."
                    className="w-full p-2.5 bg-dark-900 border border-dark-700 rounded-xl text-xs text-slate-200 placeholder-dark-500 focus:outline-none focus:border-amber-500 transition-colors resize-none"
                  />
                  {itemSelecionado.justificadoPor && (
                    <p className="text-[10px] text-dark-400 mt-1">
                      Registrado por: <strong className="text-slate-300">{itemSelecionado.justificadoPor}</strong>
                    </p>
                  )}
                </div>

                {/* Botão de Gravação */}
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={handleSalvarJustificativa}
                    disabled={salvandoJustificativa}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-dark-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
                  >
                    {salvandoJustificativa ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        <span>Gravando...</span>
                      </>
                    ) : (
                      <>
                        <Check size={14} />
                        <span>Gravar Justificativa</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Distribuição Histórica de Categorias */}
              {dadosHistorico && dadosHistorico.distribuicaoCategorias && dadosHistorico.distribuicaoCategorias.length > 0 && (
                <div className="p-4 bg-dark-800/50 border border-dark-700/60 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                      <Filter size={14} className="text-indigo-400" />
                      Distribuição de Categorias no Histórico
                    </h4>
                    <span className="text-[11px] text-dark-400">
                      Total: {dadosHistorico.totalHistorico} lançamentos
                    </span>
                  </div>

                  <div className="space-y-2.5 pt-1">
                    {dadosHistorico.distribuicaoCategorias.map((cat, idx) => (
                      <div key={idx} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-200 truncate max-w-[280px]">
                            {cat.categoria}
                          </span>
                          <span className="text-dark-400 font-mono text-[11px]">
                            {cat.quantidade}x ({cat.percentual}%) • {formatCurrency(cat.valorTotal)}
                          </span>
                        </div>
                        <div className="h-2 bg-dark-950 rounded-full overflow-hidden border border-dark-700/50">
                          <div
                            className={`h-full rounded-full ${
                              cat.categoria === itemSelecionado.categoriaEsperada
                                ? 'bg-emerald-500'
                                : cat.categoria === itemSelecionado.categoriaAtual
                                ? 'bg-amber-500'
                                : 'bg-slate-600'
                            }`}
                            style={{ width: `${cat.percentual}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Últimos Lançamentos Encontrados no Histórico */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <Calendar size={14} className="text-sky-400" />
                    Últimos Lançamentos Encontrados no Histórico
                  </h4>
                  {carregandoHistorico && (
                    <span className="text-[11px] text-amber-400 flex items-center gap-1.5">
                      <RefreshCw size={12} className="animate-spin" />
                      Carregando...
                    </span>
                  )}
                </div>

                {carregandoHistorico && !dadosHistorico ? (
                  <div className="p-8 text-center text-dark-400 bg-dark-800/40 rounded-2xl border border-dark-700/50 space-y-2">
                    <RefreshCw size={24} className="animate-spin mx-auto text-amber-400" />
                    <p className="text-xs">Consultando histórico do fornecedor na base espelho...</p>
                  </div>
                ) : dadosHistorico && dadosHistorico.ultimosLancamentos && dadosHistorico.ultimosLancamentos.length > 0 ? (
                  <div className="bg-dark-800/40 border border-dark-700/60 rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto max-h-72 overflow-y-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="sticky top-0 bg-dark-950 border-b border-dark-700/80 text-[10px] text-dark-400 uppercase font-bold tracking-wider">
                          <tr>
                            <th className="py-2.5 px-3">Data</th>
                            <th className="py-2.5 px-3">Categoria</th>
                            <th className="py-2.5 px-3">Descrição</th>
                            <th className="py-2.5 px-3 text-right">Valor</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-dark-700/50 font-medium text-slate-300 text-[11px]">
                          {dadosHistorico.ultimosLancamentos.map((lanc) => {
                            const matchPredominante = lanc.categoria === itemSelecionado.categoriaEsperada
                            return (
                              <tr key={lanc.id} className="hover:bg-dark-700/40 transition-colors">
                                <td className="py-2.5 px-3 whitespace-nowrap text-dark-300">
                                  {formatDate(lanc.dataCompetencia)}
                                </td>
                                <td className="py-2.5 px-3">
                                  <span className={`font-semibold ${
                                    matchPredominante ? 'text-emerald-400' : 'text-amber-300'
                                  }`}>
                                    {lanc.categoria}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 max-w-[160px] truncate text-dark-400" title={lanc.descricao || ''}>
                                  {lanc.descricao || '-'}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-200 whitespace-nowrap">
                                  {formatCurrency(lanc.valor)}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 text-center text-dark-400 bg-dark-800/30 rounded-2xl border border-dark-700/40 text-xs">
                    Nenhum lançamento anterior registrado para este fornecedor.
                  </div>
                )}
              </div>
            </div>

            {/* Footer do Drawer */}
            <div className="p-4 border-t border-dark-700/80 bg-dark-950/80 flex items-center justify-between">
              <span className="text-[11px] text-dark-400">
                Pressione <kbd className="px-1.5 py-0.5 rounded bg-dark-800 border border-dark-700 text-slate-300 text-[10px]">ESC</kbd> ou clique fora para fechar
              </span>
              <button
                onClick={() => setItemSelecionado(null)}
                className="px-4 py-2 rounded-xl bg-dark-800 hover:bg-dark-700 text-white font-semibold text-xs border border-dark-700 transition-colors"
              >
                Fechar Painel
              </button>
            </div>
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
