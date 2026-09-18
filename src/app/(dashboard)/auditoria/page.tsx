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
  Clock,
  Database,
  FileText
} from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'
import type {
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
  const [periodo, setPeriodo] = useState<'3m' | '6m' | '12m' | 'todos'>('12m')
  const [marcoZero, setMarcoZero] = useState<string>('')
  const [confiancaMinima, setConfiancaMinima] = useState<number>(80)

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
          meses: periodo === '3m' ? 3 : periodo === '6m' ? 6 : 12
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
      const payload: Record<string, any> = {
        modulo: moduloAlvo,
        empresa_id: empresaAtiva.id,
        periodo,
        marco_zero: marcoZero || null,
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
            {/* Seletor de Período */}
            <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-white/5 text-xs text-slate-300">
              <Calendar className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-slate-400">Período:</span>
              <select
                value={periodo}
                onChange={(e) => setPeriodo(e.target.value as any)}
                className="bg-transparent text-white font-medium focus:outline-none cursor-pointer"
              >
                <option value="3m" className="bg-slate-900">Últimos 3 meses</option>
                <option value="6m" className="bg-slate-900">Últimos 6 meses</option>
                <option value="12m" className="bg-slate-900">Últimos 12 meses</option>
                <option value="todos" className="bg-slate-900">Todo o Histórico</option>
              </select>
            </div>

            {/* Marco Zero */}
            <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-white/5 text-xs text-slate-300">
              <span className="text-slate-400">Marco Zero:</span>
              <input
                type="date"
                value={marcoZero}
                onChange={(e) => setMarcoZero(e.target.value)}
                className="bg-transparent text-white focus:outline-none cursor-pointer"
                title="Ignorar lançamentos com vencimento anterior a esta data"
              />
              {marcoZero && (
                <button
                  onClick={() => setMarcoZero('')}
                  className="text-slate-400 hover:text-white text-[10px]"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Confiança Mínima */}
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

      {/* CONTEÚDO DA ABA 1: CONSISTÊNCIA DE CATEGORIAS */}
      {activeTab === 'consistencia' && (
        <div className="space-y-4">
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
                Calculado com recência ponderada (60d/180d), status e bônus oficial Conta Azul.
              </span>
            </div>
          </div>

          {fornecedoresFiltrados.length === 0 && !loading && (
            <div className="text-center py-12 bg-slate-900/30 border border-white/5 rounded-2xl">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3 opacity-80" />
              <h3 className="text-lg font-semibold text-white">Nenhuma inconsistência crítica encontrada!</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                Todos os lançamentos analisados estão em conformidade com as categorias históricas e padrões cadastrais.
              </p>
            </div>
          )}

          {fornecedoresFiltrados.map((forn) => {
            const isExpanded = expandedRow === forn.fornecedor_normalizado
            const valorTotalDivergenteForn = forn.divergencias.reduce((acc, d) => acc + d.valor, 0)

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
                      {forn.categoria_padrao_oficial && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          Oficial: {forn.categoria_padrao_oficial}
                        </span>
                      )}
                      {forn.is_pessoal_rh && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                          RH / Pessoal
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 flex items-center gap-2">
                      <span>Categoria esperada:</span>
                      <strong className="text-cyan-300 font-medium">
                        {forn.categoria_predominante}
                      </strong>
                      <span className="text-[11px] text-cyan-400/80 font-mono">
                        ({forn.confianca_percentual}% de confiança ponderada)
                      </span>
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
                  <div className="border-t border-white/5 bg-slate-950/50 p-4 space-y-4">
                    <div className="bg-slate-900/60 p-3 rounded-xl border border-white/5">
                      <div className="text-xs font-semibold text-slate-300 mb-2">
                        Distribuição Histórica das Categorias:
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {forn.distribuicao_categorias.map((dist) => (
                          <div
                            key={dist.categoria}
                            className={cn(
                              'px-2.5 py-1 rounded-lg text-xs flex items-center gap-2 border',
                              dist.categoria === forn.categoria_predominante
                                ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
                                : 'bg-slate-800/80 text-slate-400 border-white/5'
                            )}
                          >
                            <span>{dist.categoria}</span>
                            <span className="font-bold">{dist.percentual}%</span>
                            <span className="text-[10px] text-slate-400">({dist.quantidade}x)</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-900/80 text-slate-400 border-b border-white/10 uppercase tracking-wider text-[10px]">
                          <tr>
                            <th className="py-2.5 px-3">Vencimento</th>
                            <th className="py-2.5 px-3">Doc / NF</th>
                            <th className="py-2.5 px-3">Descrição</th>
                            <th className="py-2.5 px-3">Categoria Atual</th>
                            <th className="py-2.5 px-3">Categoria Esperada</th>
                            <th className="py-2.5 px-3 text-right">Valor</th>
                            <th className="py-2.5 px-3 text-center">Criticidade</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {forn.divergencias.map((div) => (
                            <tr key={div.id} className="hover:bg-slate-800/30">
                              <td className="py-2 px-3 text-slate-300 font-mono">
                                {div.vencimento ? new Date(div.vencimento).toLocaleDateString('pt-BR') : '-'}
                              </td>
                              <td className="py-2 px-3 text-slate-300 font-mono">
                                {div.doc || '-'}
                              </td>
                              <td className="py-2 px-3 text-slate-300 max-w-xs truncate" title={div.descricao || ''}>
                                {div.descricao || '-'}
                              </td>
                              <td className="py-2 px-3 text-rose-400 font-medium">
                                {div.categoria_atual}
                              </td>
                              <td className="py-2 px-3 text-cyan-400 font-medium">
                                {div.categoria_esperada}
                              </td>
                              <td className="py-2 px-3 text-right font-bold text-white font-mono">
                                R$ {div.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="py-2 px-3 text-center">
                                <span
                                  className={cn(
                                    'px-2 py-0.5 rounded text-[10px] font-bold border',
                                    div.criticidade === 'CRITICA' && 'bg-rose-500/10 text-rose-400 border-rose-500/30',
                                    div.criticidade === 'ALTA' && 'bg-amber-500/10 text-amber-400 border-amber-500/30',
                                    div.criticidade === 'ATENCAO' && 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30'
                                  )}
                                >
                                  {div.criticidade}
                                </span>
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

          {multiescopoFiltrados.length > 0 && (
            <div className="mt-8 space-y-3">
              <div className="flex items-center gap-2 text-slate-300 text-xs font-semibold">
                <Layers className="w-4 h-4 text-purple-400" />
                <span>Fornecedores Multiescopo Identificados (Várias Categorias Legítimas)</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {multiescopoFiltrados.map((m) => (
                  <div
                    key={m.fornecedor_normalizado}
                    className="p-3 bg-purple-950/20 border border-purple-500/20 rounded-xl space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">{m.fornecedor_original}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300">
                        {m.total_lancamentos} lançamentos
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Disperso em {m.distribuicao_categorias.length} categorias diferentes no Conta Azul. Não gera falso positivo.
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
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
