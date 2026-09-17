import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useEmpresa } from '@/contexts/EmpresaContext'
import type { ContaPagarImportada } from '@/types'
import { formatCurrency, formatDate, visualizarAnexo } from '@/lib/utils'
import { CheckCircle, Clock, AlertCircle, RefreshCw, Loader2, Trash2, Landmark, Paperclip, Tags, Edit2, ArrowRightLeft, Building2, ChevronRight, ListFilter, Send, FileDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'
import SelectorContaFinanceira, { type ContaFinanceiraOpcao } from '@/components/upload/SelectorContaFinanceira'
import SelectorCategoria from '@/components/upload/SelectorCategoria'

interface Props {
  empresaId?: string
  onEnviarContaAzul?: () => void
  onExportarXls?: () => void
  enviandoCA?: boolean
  gerandoXls?: boolean
}

const STATUS_CONFIG = {
  pendente: { label: 'Pendente', icon: Clock, color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
  enviado: { label: 'Enviado', icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-400/10' },
  erro: { label: 'Erro', icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-400/10' },
  cancelado: { label: 'Cancelado', icon: AlertCircle, color: 'text-dark-500', bg: 'bg-dark-700' },
}

export default function TabelaContas({
  empresaId,
  onEnviarContaAzul,
  onExportarXls,
  enviandoCA = false,
  gerandoXls = false,
}: Props) {
  const { empresas, setEmpresaAtiva } = useEmpresa()
  const [contas, setContas] = useState<ContaPagarImportada[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<string>('pendente')
  const [selecionados, setSelecionados] = useState<string[]>([])
  const [contasFinanceirasCA, setContasFinanceirasCA] = useState<ContaFinanceiraOpcao[]>([])
  const [editandoContaId, setEditandoContaId] = useState<string | null>(null)
  const [editandoCategoriaId, setEditandoCategoriaId] = useState<string | null>(null)
  const [editandoEmMassaConta, setEditandoEmMassaConta] = useState(false)
  const [editandoEmMassaCat, setEditandoEmMassaCat] = useState(false)
  const [editandoEmMassaLoja, setEditandoEmMassaLoja] = useState(false)
  const [paginaAtual, setPaginaAtual] = useState(1)
  const ITENS_POR_PAGINA = 15

  const supabase = createClient()

  // Buscar lista de Contas Financeiras (Bancos) no Conta Azul
  useEffect(() => {
    if (!empresaId) { setContasFinanceirasCA([]); return }
    fetch(`/api/conta-azul/contas-financeiras?empresa_id=${empresaId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.contas && Array.isArray(data.contas)) {
          setContasFinanceirasCA(data.contas.map((c: any) => ({ id: c.id, descricao: c.descricao })))
        }
      })
      .catch(() => {})
  }, [empresaId])

  const carregar = useCallback(async () => {
    if (!empresaId) { setLoading(false); return }
    setLoading(true)
    try {
      let query = supabase
        .from('contas_pagar_importadas')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: false })
        .limit(200)

      if (filtro !== 'todos') {
        query = query.eq('status', filtro)
      }

      const { data, error } = await query
      if (error) throw error
      setContas(data || [])
      setSelecionados([])
    } finally {
      setLoading(false)
    }
  }, [empresaId, filtro, supabase])

  useEffect(() => { carregar() }, [carregar])

  const toggleSelect = (id: string) => {
    setSelecionados(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  }

  const toggleSelectAll = () => {
    if (selecionados.length === contas.length) {
      setSelecionados([])
    } else {
      setSelecionados(contas.map(c => c.id))
    }
  }

  const handleAtualizarContaIndividual = async (id: string, nomeConta: string, contaId: string) => {
    try {
      const { error } = await supabase
        .from('contas_pagar_importadas')
        .update({
          conta_financeira: nomeConta || null,
          conta_financeira_id: contaId || null,
        })
        .eq('id', id)

      if (error) throw error
      toast.success('Banco atualizado!')
      setEditandoContaId(null)
      carregar()
    } catch (e: any) {
      toast.error(e.message || 'Erro ao atualizar banco')
    }
  }

  const handleAtualizarCategoriaIndividual = async (id: string, categoria: string) => {
    try {
      const { error } = await supabase
        .from('contas_pagar_importadas')
        .update({ categoria })
        .eq('id', id)

      if (error) throw error
      toast.success('Categoria atualizada!')
      setEditandoCategoriaId(null)
      carregar()
    } catch (e: any) {
      toast.error(e.message || 'Erro ao atualizar categoria')
    }
  }

  const handleAplicarBancoEmLote = async (nomeConta: string, contaId: string) => {
    const idsAlvo = selecionados.length > 0 ? selecionados : contas.map(c => c.id)
    if (idsAlvo.length === 0) { toast.error('Nenhuma conta na lista'); return }
    try {
      const { error } = await supabase
        .from('contas_pagar_importadas')
        .update({
          conta_financeira: nomeConta || null,
          conta_financeira_id: contaId || null,
        })
        .in('id', idsAlvo)

      if (error) throw error
      toast.success(`Banco "${nomeConta}" aplicado em ${idsAlvo.length} conta(s)!`)
      setEditandoEmMassaConta(false)
      carregar()
    } catch (e: any) {
      toast.error(e.message || 'Erro ao atualizar banco em lote')
    }
  }

  const handleAplicarCategoriaEmLote = async (categoria: string) => {
    const idsAlvo = selecionados.length > 0 ? selecionados : contas.map(c => c.id)
    if (idsAlvo.length === 0) { toast.error('Nenhuma conta na lista'); return }
    try {
      const { error } = await supabase
        .from('contas_pagar_importadas')
        .update({ categoria })
        .in('id', idsAlvo)

      if (error) throw error
      toast.success(`Categoria "${categoria}" aplicada em ${idsAlvo.length} conta(s)!`)
      setEditandoEmMassaCat(false)
      carregar()
    } catch (e: any) {
      toast.error(e.message || 'Erro ao atualizar categoria em lote')
    }
  }

  const removerConta = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este registro?')) return
    try {
      const { error } = await supabase
        .from('contas_pagar_importadas')
        .delete()
        .eq('id', id)
      
      if (error) throw error
      toast.success('Registro excluído')
      carregar()
    } catch (err) {
      toast.error('Erro ao excluir')
    }
  }

  const handleExcluirSelecionados = async () => {
    if (selecionados.length === 0) return
    if (!confirm(`Excluir os ${selecionados.length} registros selecionados?`)) return
    try {
      const { error } = await supabase
        .from('contas_pagar_importadas')
        .delete()
        .in('id', selecionados)

      if (error) throw error
      toast.success(`${selecionados.length} registro(s) excluído(s)!`)
      carregar()
    } catch (e) {
      toast.error('Erro ao excluir registros')
    }
  }

  const limparTudo = async () => {
    if (!confirm('Deseja excluir TODAS as contas PENDENTES desta empresa?')) return
    try {
      const { error } = await supabase
        .from('contas_pagar_importadas')
        .delete()
        .eq('empresa_id', empresaId)
        .eq('status', 'pendente')
      
      if (error) throw error
      toast.success('Limpeza concluída')
      carregar()
    } catch (err) {
      toast.error('Erro ao limpar')
    }
  }

  const handleMoverLoja = async (novaEmpresaId: string) => {
    const targetEmpresa = empresas.find(e => e.id === novaEmpresaId)
    if (!targetEmpresa) return

    const idsParaMover = selecionados.length > 0
      ? selecionados
      : contas.filter(c => c.status === 'pendente').map(c => c.id)

    if (idsParaMover.length === 0) {
      toast.error('Nenhum lançamento selecionado ou pendente para transferir.')
      setEditandoEmMassaLoja(false)
      return
    }

    if (!confirm(`Deseja transferir ${idsParaMover.length} lançamento(s) para a loja "${targetEmpresa.nome}"?`)) {
      setEditandoEmMassaLoja(false)
      return
    }

    try {
      const res = await fetch('/api/contas-pagar/mover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: idsParaMover,
          empresa_origem_id: empresaId,
          empresa_destino_id: novaEmpresaId,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao transferir lançamentos')

      toast.success(data.message || `${idsParaMover.length} lançamento(s) transferido(s) para ${targetEmpresa.nome}!`)
      setEditandoEmMassaLoja(false)
      setSelecionados([])

      // Limpa qualquer query param antigo da URL
      if (typeof window !== 'undefined') {
        window.history.replaceState({}, '', window.location.pathname)
      }

      // Muda o seletor da empresa ativa para a loja destino
      setEmpresaAtiva(targetEmpresa)
    } catch (err: any) {
      toast.error(err.message || 'Erro ao transferir lançamentos')
    }
  }

  const totalPendente = contas.filter((c) => c.status === 'pendente').reduce((s, c) => s + Number(c.valor), 0)
  const totalEnviado = contas.filter((c) => c.status === 'enviado').reduce((s, c) => s + Number(c.valor), 0)
  const qtdPendente = contas.filter((c) => c.status === 'pendente').length
  const qtdEnviado = contas.filter((c) => c.status === 'enviado').length
  const qtdErro = contas.filter((c) => c.status === 'erro').length

  const totalPaginas = Math.ceil(contas.length / ITENS_POR_PAGINA) || 1
  const contasExibidas = contas.slice((paginaAtual - 1) * ITENS_POR_PAGINA, paginaAtual * ITENS_POR_PAGINA)

  return (
    <div className="space-y-4">
      {/* Faixa Executiva: 2 KPIs Compactos Financeiros + Botões de Ação na Mesma Linha (Fase 6.1) */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 animate-fade-in">
        {/* 2 KPIs Compactos */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
          {/* Total Pendente */}
          <div className="bg-dark-900/90 border border-dark-700/70 hover:border-amber-500/40 rounded-xl px-4 py-2.5 shadow-xs transition-all flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8.5 h-8.5 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 flex-shrink-0">
                <Clock size={16} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-dark-400 uppercase tracking-wide">
                    Total Pendente
                  </span>
                  <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    {qtdPendente}
                  </span>
                </div>
                <p className="text-lg sm:text-xl font-extrabold font-mono text-amber-400 tabular-nums leading-tight mt-0.5">
                  {formatCurrency(totalPendente)}
                </p>
              </div>
            </div>
          </div>

          {/* Total Enviado */}
          <div className="bg-dark-900/90 border border-dark-700/70 hover:border-emerald-500/40 rounded-xl px-4 py-2.5 shadow-xs transition-all flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8.5 h-8.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 flex-shrink-0">
                <CheckCircle size={16} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-dark-400 uppercase tracking-wide">
                    Total Enviado
                  </span>
                  <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    {qtdEnviado}
                  </span>
                </div>
                <p className="text-lg sm:text-xl font-extrabold font-mono text-emerald-400 tabular-nums leading-tight mt-0.5">
                  {formatCurrency(totalEnviado)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Botões de Ação com presença visual destacada (h-10) na mesma linha */}
        {(onEnviarContaAzul || onExportarXls) && (
          <div className="flex items-center gap-2.5 flex-wrap flex-shrink-0">
            {onEnviarContaAzul && (
              <button
                onClick={onEnviarContaAzul}
                disabled={enviandoCA}
                className="h-10 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors shadow-sm cursor-pointer"
              >
                {enviandoCA ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                <span>{enviandoCA ? 'Enviando...' : 'Enviar ao Conta Azul'}</span>
              </button>
            )}
            {onExportarXls && (
              <button
                onClick={onExportarXls}
                disabled={gerandoXls}
                className="h-10 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white px-4 rounded-lg text-sm font-medium flex items-center gap-2 transition-all shadow-sm cursor-pointer"
              >
                {gerandoXls ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
                <span>{gerandoXls ? 'Exportando...' : 'Exportar XLS'}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Barra Operacional: Filtros à esquerda + Ações e Atualizar alinhados à direita */}
      <div className="bg-dark-850/90 border border-dark-700/60 rounded-xl p-2.5 sm:p-3 shadow-xs animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          {/* Esquerda: Filtros em Formato Pill */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {(['pendente', 'enviado', 'erro'] as const).map((f) => {
              const isSelected = filtro === f
              const qtd = f === 'pendente' ? qtdPendente : f === 'enviado' ? qtdEnviado : qtdErro
              const label = f === 'pendente' ? 'Pendente' : f === 'enviado' ? 'Enviado' : 'Erro'
              return (
                <button
                  key={f}
                  onClick={() => {
                    setFiltro(f)
                    setPaginaAtual(1)
                  }}
                  className={cn(
                    'h-8 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5',
                    isSelected
                      ? 'bg-brand-600 text-white shadow-xs'
                      : 'bg-dark-900/90 text-dark-400 hover:text-white hover:bg-dark-800 border border-dark-700/60'
                  )}
                >
                  <span>{label}</span>
                  <span className={cn(
                    'px-1.5 py-0.2 rounded-md text-[10px] font-mono tabular-nums font-bold',
                    isSelected
                      ? 'bg-white/20 text-white'
                      : f === 'erro' && qtd > 0
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        : 'bg-dark-800 text-dark-400'
                  )}>
                    {qtd}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Direita: Ações em Lote + Limpar + Botão Atualizar com alinhamento visual perfeito */}
          <div className="flex items-center gap-2 flex-wrap ml-auto">
            {contas.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap animate-fade-in">
                {selecionados.length > 0 && (
                  <span className="text-xs text-brand-300 font-semibold px-2.5 py-1 bg-brand-500/15 rounded-md border border-brand-500/30">
                    {selecionados.length} selecionada(s)
                  </span>
                )}

                {/* Atribuir Banco em Lote */}
                <div className="relative">
                  {editandoEmMassaConta ? (
                    <SelectorContaFinanceira
                      valorInicial=""
                      contas={contasFinanceirasCA}
                      onSelect={(nome, id) => handleAplicarBancoEmLote(nome, id)}
                      onCancel={() => setEditandoEmMassaConta(false)}
                    />
                  ) : (
                    <button
                      onClick={() => setEditandoEmMassaConta(true)}
                      className="flex items-center gap-1.5 bg-dark-800 hover:bg-dark-700 text-dark-200 hover:text-white border border-dark-700 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors shadow-xs cursor-pointer"
                      title="Aplicar o mesmo banco a todas as contas selecionadas"
                    >
                      <Landmark size={13} /> {selecionados.length > 0 ? `Banco (${selecionados.length})` : 'Banco'}
                    </button>
                  )}
                </div>

                {/* Atribuir Categoria em Lote */}
                <div className="relative">
                  {editandoEmMassaCat ? (
                    <SelectorCategoria
                      valorInicial=""
                      onSelect={(cat) => handleAplicarCategoriaEmLote(cat)}
                      onCancel={() => setEditandoEmMassaCat(false)}
                    />
                  ) : (
                    <button
                      onClick={() => setEditandoEmMassaCat(true)}
                      className="flex items-center gap-1.5 bg-dark-800 hover:bg-dark-700 text-dark-200 hover:text-white border border-dark-700 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors shadow-xs cursor-pointer"
                      title="Aplicar a mesma categoria a todas as contas selecionadas"
                    >
                      <Tags size={13} /> {selecionados.length > 0 ? `Categoria (${selecionados.length})` : 'Categoria'}
                    </button>
                  )}
                </div>

                {/* Transferir para Outra Loja */}
                <div className="relative">
                  {editandoEmMassaLoja ? (
                    <div className="absolute top-0 right-0 z-30 bg-dark-800 border border-dark-600 rounded-xl shadow-2xl p-2.5 min-w-[240px] animate-fade-in space-y-1.5">
                      <div className="flex items-center justify-between px-2.5 py-1.5 text-xs font-bold text-dark-400 border-b border-dark-700/60 mb-1">
                        <span>Transferir para Loja:</span>
                        <button type="button" onClick={() => setEditandoEmMassaLoja(false)} className="text-dark-500 hover:text-white text-xs">✕</button>
                      </div>
                      {empresas.filter(e => e.id !== empresaId).length === 0 ? (
                        <p className="text-xs text-dark-500 px-2 py-2">Nenhuma outra loja cadastrada.</p>
                      ) : (
                        empresas.filter(e => e.id !== empresaId).map((emp) => (
                          <button
                            key={emp.id}
                            type="button"
                            onClick={() => handleMoverLoja(emp.id)}
                            className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-semibold text-white hover:bg-emerald-600/20 hover:text-emerald-300 transition-colors text-left border border-transparent hover:border-emerald-500/30"
                          >
                            <span className="truncate">{emp.nome}</span>
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${emp.access_token_conta_azul ? 'bg-emerald-400' : 'bg-dark-600'}`} />
                          </button>
                        ))
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditandoEmMassaLoja(true)}
                      className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-all shadow-sm cursor-pointer"
                      title="Transferir lançamentos para outra empresa"
                    >
                      <ArrowRightLeft size={13} /> {selecionados.length > 0 ? `Mover (${selecionados.length})` : 'Mover Loja'}
                    </button>
                  )}
                </div>

                {selecionados.length > 0 && (
                  <button
                    onClick={handleExcluirSelecionados}
                    className="flex items-center gap-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                  >
                    <Trash2 size={13} /> Excluir ({selecionados.length})
                  </button>
                )}
              </div>
            )}

            {contas.some(c => c.status === 'pendente') && (
              <button
                onClick={limparTudo}
                className="flex items-center gap-1.5 text-red-400 hover:text-red-300 hover:bg-red-400/10 text-xs px-2.5 py-1.5 rounded-lg transition-all cursor-pointer"
              >
                <Trash2 size={13} />
                <span>Limpar Pendentes</span>
              </button>
            )}

            <button
              onClick={carregar}
              disabled={loading}
              className="flex items-center gap-1.5 text-dark-300 hover:text-white text-xs font-medium px-3 py-1.5 rounded-lg border border-dark-700 bg-dark-900/60 hover:bg-dark-800 transition-all cursor-pointer shadow-xs"
              title="Atualizar lista de contas"
            >
              {loading ? <Loader2 size={13} className="animate-spin text-brand-400" /> : <RefreshCw size={13} className="text-brand-400" />}
              <span>Atualizar</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabela */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 size={22} className="text-brand-400 animate-spin" />
        </div>
      ) : contas.length === 0 ? (
        <div className="bg-dark-850/80 border border-dark-700/60 rounded-xl py-7 px-4 text-center space-y-2 shadow-xs">
          <div className="w-9 h-9 rounded-lg bg-dark-900 border border-dark-700/80 flex items-center justify-center mx-auto text-dark-400 shadow-inner">
            <Clock size={16} className="text-dark-400" />
          </div>
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-white">Nenhuma conta com status "{filtro}"</p>
            <p className="text-xs text-dark-400 max-w-sm mx-auto leading-relaxed">
              Não há lançamentos financeiros registrados nesta categoria para a empresa selecionada.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-dark-850/90 border border-dark-700/70 rounded-xl overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse table-fixed select-none">
              <colgroup>
                <col style={{ width: '32px' }} />
                <col style={{ minWidth: '160px' }} />
                <col style={{ width: '90px' }} />
                <col style={{ width: '82px' }} />
                <col style={{ width: '88px' }} />
                <col style={{ width: '115px' }} />
                <col style={{ width: '125px' }} />
                <col style={{ width: '85px' }} />
                <col style={{ width: '85px' }} />
                <col style={{ width: '36px' }} />
              </colgroup>
              <thead>
                <tr className="bg-dark-900/90 text-dark-400 uppercase text-[10px] font-semibold tracking-wide border-b border-dark-700/80">
                  <th className="py-2.5 px-1 text-center">
                    <input
                      type="checkbox"
                      checked={contas.length > 0 && selecionados.length === contas.length}
                      onChange={toggleSelectAll}
                      className="rounded border-dark-600 bg-dark-900 text-brand-500 focus:ring-brand-500 cursor-pointer w-3.5 h-3.5"
                    />
                  </th>
                  <th className="py-2.5 px-2 text-left">Fornecedor</th>
                  <th className="py-2.5 px-2 text-right">Valor</th>
                  <th className="py-2.5 px-1.5 text-center">Vencimento</th>
                  <th className="py-2.5 px-1.5 text-center">Competência</th>
                  <th className="py-2.5 px-2 text-left">Categoria</th>
                  <th className="py-2.5 px-2 text-left">Conta Bancária</th>
                  <th className="py-2.5 px-1.5 text-left">Descrição</th>
                  <th className="py-2.5 px-1 text-center">Status</th>
                  <th className="py-2.5 px-1 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-800/60">
                {contasExibidas.map((conta) => {
                  const cfg = STATUS_CONFIG[conta.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.pendente
                  const Icon = cfg.icon
                  const isSelected = selecionados.includes(conta.id)

                  return (
                    <tr
                      key={conta.id}
                      className={cn(
                        'hover:bg-dark-700/35 transition-colors duration-150',
                        isSelected ? 'bg-brand-500/10' : 'even:bg-dark-800/20'
                      )}
                    >
                      {/* Checkbox */}
                      <td className="py-2 px-1 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(conta.id)}
                          className="rounded border-dark-600 bg-dark-900 text-brand-500 focus:ring-brand-500 cursor-pointer w-3.5 h-3.5"
                        />
                      </td>

                      {/* Fornecedor - Espaço útil ampliado e sem quebra */}
                      <td className="py-2 px-2 overflow-hidden">
                        <span
                          className="text-white font-medium text-xs block truncate whitespace-nowrap"
                          title={conta.fornecedor}
                        >
                          {conta.fornecedor}
                        </span>
                      </td>

                      {/* Valor */}
                      <td className="py-2 px-2 text-right whitespace-nowrap overflow-hidden">
                        <span className="text-green-400 font-semibold tabular-nums text-xs">
                          {formatCurrency(Number(conta.valor))}
                        </span>
                      </td>

                      {/* Vencimento */}
                      <td className="py-2 px-1 text-center whitespace-nowrap overflow-hidden">
                        <span className="text-dark-300 text-[11px] tabular-nums">
                          {formatDate(conta.vencimento)}
                        </span>
                      </td>

                      {/* Competência */}
                      <td className="py-2 px-1 text-center whitespace-nowrap overflow-hidden">
                        <span className="text-dark-300 text-[11px] tabular-nums">
                          {conta.emissao ? formatDate(conta.emissao) : '-'}
                        </span>
                      </td>

                      {/* Categoria editável inline compacta */}
                      <td className="py-2 px-1.5 overflow-hidden">
                        {editandoCategoriaId === conta.id ? (
                          <SelectorCategoria
                            valorInicial={conta.categoria || ''}
                            onSelect={(cat) => handleAtualizarCategoriaIndividual(conta.id, cat)}
                            onCancel={() => setEditandoCategoriaId(null)}
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => setEditandoCategoriaId(conta.id)}
                            className="inline-flex items-center justify-between w-full gap-1 text-[11px] px-1.5 py-0.5 rounded bg-dark-800 hover:bg-dark-700 text-dark-200 hover:text-white border border-dark-700 transition-colors font-medium truncate"
                            title="Clique para alterar a categoria"
                          >
                            <span className="truncate">{conta.categoria || 'Materiais para Revenda'}</span>
                            <Edit2 size={9} className="opacity-50 shrink-0" />
                          </button>
                        )}
                      </td>

                      {/* Conta Financeira (Banco) editável inline compacta */}
                      <td className="py-2 px-1.5 overflow-hidden">
                        {editandoContaId === conta.id ? (
                          <SelectorContaFinanceira
                            valorInicial={conta.conta_financeira || ''}
                            contas={contasFinanceirasCA}
                            onSelect={(nome, id) => handleAtualizarContaIndividual(conta.id, nome, id)}
                            onCancel={() => setEditandoContaId(null)}
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => setEditandoContaId(conta.id)}
                            className={cn(
                              'inline-flex items-center justify-between w-full gap-1 text-[11px] px-1.5 py-0.5 rounded-full border font-medium transition-all truncate',
                              conta.conta_financeira
                                ? 'bg-brand-500/15 text-brand-300 border-brand-500/30 hover:bg-primary-500/25'
                                : 'bg-amber-400/10 text-amber-400 border-amber-400/30 hover:bg-amber-400/20'
                            )}
                            title="Clique para selecionar o banco no Conta Azul"
                          >
                            <span className="inline-flex items-center gap-1 truncate">
                              <Landmark size={10} className="shrink-0 opacity-80" />
                              <span className="truncate">{conta.conta_financeira || 'Banco...'}</span>
                            </span>
                            <Edit2 size={9} className="opacity-50 shrink-0" />
                          </button>
                        )}
                      </td>

                      {/* Descrição */}
                      <td className="py-2 px-1.5 overflow-hidden">
                        <span
                          className="text-dark-400 text-[11px] truncate block font-mono"
                          title={conta.descricao || ''}
                        >
                          {conta.descricao || '-'}
                        </span>
                      </td>

                      {/* Status compacto */}
                      <td className="py-2 px-1 text-center overflow-hidden">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap',
                            cfg.color,
                            cfg.bg
                          )}
                        >
                          <Icon size={9} className="shrink-0" />
                          {cfg.label}
                        </span>
                        {conta.status === 'erro' && conta.erro_mensagem && (
                          <p
                            className="text-red-400/90 text-[10px] mt-0.5 truncate"
                            title={conta.erro_mensagem}
                          >
                            {conta.erro_mensagem}
                          </p>
                        )}
                      </td>

                      {/* Ações */}
                      <td className="py-2 px-1 text-center overflow-hidden">
                        <div className="flex items-center justify-center gap-0.5">
                          {(conta.metadata?.anexo_url || conta.anexo_url) && (
                            <button
                              type="button"
                              onClick={() => visualizarAnexo(conta.metadata?.anexo_url || conta.anexo_url)}
                              className="text-emerald-400 hover:text-emerald-300 transition-colors p-0.5 bg-emerald-500/10 rounded"
                              title="Visualizar Anexo/Comprovante"
                            >
                              <Paperclip size={12} />
                            </button>
                          )}
                          <button
                            onClick={() => removerConta(conta.id)}
                            className="text-dark-500 hover:text-red-400 transition-colors p-0.5"
                            title="Excluir"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Rodapé com paginação e contagem */}
      {contas.length > 0 && (
        <div className="flex items-center justify-between flex-wrap gap-3 px-1 py-1 text-xs text-dark-400">
          <div>
            Mostrando <span className="font-semibold text-white">{contasExibidas.length}</span> de <span className="font-semibold text-white">{contas.length}</span> registros
          </div>
          {totalPaginas > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPaginaAtual(p => Math.max(1, p - 1))}
                disabled={paginaAtual === 1}
                className="w-7 h-7 rounded-lg border border-dark-700 bg-dark-900 text-dark-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors cursor-pointer"
              >
                ‹
              </button>
              {Array.from({ length: totalPaginas }, (_, i) => i + 1)
                .slice(Math.max(0, paginaAtual - 3), Math.min(totalPaginas, paginaAtual + 2))
                .map((p) => (
                  <button
                    key={p}
                    onClick={() => setPaginaAtual(p)}
                    className={cn(
                      'w-7 h-7 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center',
                      paginaAtual === p
                        ? 'bg-brand-600 text-white shadow-xs'
                        : 'border border-dark-700 bg-dark-900 text-dark-400 hover:text-white hover:bg-dark-800'
                    )}
                  >
                    {p}
                  </button>
                ))}
              <button
                onClick={() => setPaginaAtual(p => Math.min(totalPaginas, p + 1))}
                disabled={paginaAtual === totalPaginas}
                className="w-7 h-7 rounded-lg border border-dark-700 bg-dark-900 text-dark-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors cursor-pointer"
              >
                ›
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
