import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useEmpresa } from '@/contexts/EmpresaContext'
import type { ContaPagarImportada } from '@/types'
import { formatCurrency, formatDate, visualizarAnexo } from '@/lib/utils'
import { CheckCircle, Clock, AlertCircle, RefreshCw, Loader2, Trash2, Landmark, Paperclip, Tags, Edit2, ArrowRightLeft, Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'
import SelectorContaFinanceira, { type ContaFinanceiraOpcao } from '@/components/upload/SelectorContaFinanceira'
import SelectorCategoria from '@/components/upload/SelectorCategoria'

interface Props {
  empresaId?: string
}

const STATUS_CONFIG = {
  pendente: { label: 'Pendente', icon: Clock, color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
  enviado: { label: 'Enviado', icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-400/10' },
  erro: { label: 'Erro', icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-400/10' },
  cancelado: { label: 'Cancelado', icon: AlertCircle, color: 'text-dark-500', bg: 'bg-dark-700' },
}

export default function TabelaContas({ empresaId }: Props) {
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

  return (
    <div className="space-y-4">
      {/* Resumo Financeiro Rápido */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-dark-850/80 border border-amber-500/20 rounded-2xl p-4.5 flex items-center justify-between shadow-sm">
          <div>
            <span className="text-xs font-bold text-amber-400/90 uppercase tracking-wider block">Total Pendente</span>
            <span className="text-2xl font-black text-white font-mono tabular-nums tracking-tight mt-1 block">
              {formatCurrency(totalPendente)}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Clock size={20} />
          </div>
        </div>

        <div className="bg-dark-850/80 border border-emerald-500/20 rounded-2xl p-4.5 flex items-center justify-between shadow-sm">
          <div>
            <span className="text-xs font-bold text-emerald-400/90 uppercase tracking-wider block">Total Enviado ao Conta Azul</span>
            <span className="text-2xl font-black text-white font-mono tabular-nums tracking-tight mt-1 block">
              {formatCurrency(totalEnviado)}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <CheckCircle size={20} />
          </div>
        </div>
      </div>

      {/* Filtros e Ações em Lote */}
      <div className="flex items-center justify-between gap-3 flex-wrap bg-dark-850/90 p-3.5 rounded-2xl border border-dark-700/80 shadow-sm">
        <div className="flex items-center gap-1.5 bg-dark-900/80 p-1 rounded-xl border border-dark-700/60">
          {['pendente', 'enviado', 'erro'].map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={cn(
                'px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all capitalize',
                filtro === f
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-dark-400 hover:text-white hover:bg-dark-800/60'
              )}
            >
              {f === 'pendente' ? 'Pendentes' : f === 'enviado' ? 'Enviados' : 'Com Erro'}
            </button>
          ))}
        </div>

        {/* Ações em Lote (Sempre Visíveis quando há contas na tabela) */}
        {contas.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap animate-fade-in">
            {selecionados.length > 0 && (
              <span className="text-xs text-blue-400 font-bold px-2 py-1 bg-blue-500/10 rounded border border-blue-500/20">
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
                  className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3 py-2 rounded-xl transition-all shadow-md shadow-blue-600/20"
                  title="Aplicar o mesmo banco a todas as contas selecionadas (ou todas da lista)"
                >
                  <Landmark size={13} /> {selecionados.length > 0 ? `Banco (${selecionados.length})` : 'Banco em Lote'}
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
                  className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold px-3 py-2 rounded-xl transition-all shadow-sm"
                  title="Aplicar a mesma categoria a todas as contas selecionadas (ou todas da lista)"
                >
                  <Tags size={13} /> {selecionados.length > 0 ? `Categoria (${selecionados.length})` : 'Categoria em Lote'}
                </button>
              )}
            </div>

            {/* Transferir para Outra Loja */}
            <div className="relative">
              {editandoEmMassaLoja ? (
                <div className="absolute top-0 left-0 z-30 bg-dark-800 border border-dark-600 rounded-xl shadow-2xl p-2.5 min-w-[240px] animate-fade-in space-y-1.5">
                  <div className="flex items-center justify-between px-2 py-1 text-[11px] font-bold text-dark-400 border-b border-dark-700/60 mb-1">
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
                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-2 rounded-xl transition-all shadow-md shadow-emerald-600/20"
                  title="Transferir lançamentos selecionados (ou todos os pendentes) para outra empresa/loja"
                >
                  <ArrowRightLeft size={13} /> {selecionados.length > 0 ? `Mover Loja (${selecionados.length})` : 'Mover Loja'}
                </button>
              )}
            </div>

            {selecionados.length > 0 && (
              <button
                onClick={handleExcluirSelecionados}
                className="flex items-center gap-1.5 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-bold px-3 py-2 rounded-xl transition-colors"
              >
                <Trash2 size={13} /> Excluir ({selecionados.length})
              </button>
            )}
          </div>
        )}
        
        <div className="flex items-center gap-2 ml-auto">
          {contas.some(c => c.status === 'pendente') && (
            <button
              onClick={limparTudo}
              className="flex items-center gap-1.5 text-red-400 hover:text-red-300 hover:bg-red-400/10 text-xs px-3 py-1.5 rounded-lg transition-all"
            >
              <Trash2 size={14} />
              Limpar Pendentes
            </button>
          )}
          <button
            onClick={carregar}
            className="flex items-center gap-1.5 text-dark-400 hover:text-white text-sm px-3 py-1.5 rounded-lg hover:bg-dark-800 transition-all"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Atualizar
          </button>
        </div>
      </div>

      {/* Tabela */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 size={24} className="text-brand-400 animate-spin" />
        </div>
      ) : contas.length === 0 ? (
        <div className="bg-dark-800 border border-dark-700 rounded-xl p-12 text-center">
          <Clock size={32} className="text-dark-600 mx-auto mb-3" />
          <p className="text-white font-medium">Nenhuma conta encontrada</p>
          <p className="text-dark-400 text-sm mt-1">
            Não há contas com status "{filtro}"
          </p>
        </div>
      ) : (
        <div className="bg-dark-800 border border-dark-700 rounded-xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="table-bpo">
              <thead>
                <tr>
                  <th className="w-10 text-center">
                    <input
                      type="checkbox"
                      checked={contas.length > 0 && selecionados.length === contas.length}
                      onChange={toggleSelectAll}
                      className="rounded border-dark-600 bg-dark-900 text-blue-500 focus:ring-blue-500 cursor-pointer"
                    />
                  </th>
                  <th>Fornecedor</th>
                  <th className="text-right">Valor</th>
                  <th>Vencimento</th>
                  <th>Competência</th>
                  <th>Categoria</th>
                  <th>Conta Bancária</th>
                  <th>Descrição</th>
                  <th className="text-center">Status</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {contas.map((conta) => {
                  const cfg = STATUS_CONFIG[conta.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.pendente
                  const Icon = cfg.icon
                  const isSelected = selecionados.includes(conta.id)

                  return (
                    <tr key={conta.id} className={isSelected ? 'bg-blue-500/10' : ''}>
                      <td className="text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(conta.id)}
                          className="rounded border-dark-600 bg-dark-900 text-blue-500 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>
                      <td>
                        <span className="text-white font-medium">{conta.fornecedor}</span>
                      </td>
                      <td className="text-right">
                        <span className="text-green-400 font-semibold tabular-nums">
                          {formatCurrency(Number(conta.valor))}
                        </span>
                      </td>
                      <td>
                        <span className="text-dark-300">{formatDate(conta.vencimento)}</span>
                      </td>
                      <td>
                        <span className="text-dark-300">{conta.emissao ? formatDate(conta.emissao) : '-'}</span>
                      </td>

                      {/* Categoria editável inline */}
                      <td>
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
                            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-brand-400/10 text-brand-400 border border-brand-400/20 hover:bg-brand-400/20 transition-all font-medium"
                            title="Clique para alterar a categoria"
                          >
                            {conta.categoria || 'Materiais para Revenda'}
                            <Edit2 size={10} className="opacity-60" />
                          </button>
                        )}
                      </td>

                      {/* Conta Financeira (Banco) editável inline */}
                      <td>
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
                              'inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-semibold transition-all',
                              conta.conta_financeira
                                ? 'bg-blue-400/10 text-blue-400 border-blue-400/20 hover:bg-blue-400/20'
                                : 'bg-amber-400/10 text-amber-400 border-amber-400/30 hover:bg-amber-400/20'
                            )}
                            title="Clique para selecionar o banco no Conta Azul"
                          >
                            <Landmark size={11} />
                            {conta.conta_financeira || 'Selecionar Banco...'}
                            <Edit2 size={10} className="opacity-60" />
                          </button>
                        )}
                      </td>

                      <td>
                        <span className="text-dark-400 text-xs truncate max-w-[180px] block font-mono">
                          {conta.descricao || '-'}
                        </span>
                      </td>
                      <td className="text-center">
                        <span className={cn(
                          'inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium',
                          cfg.color, cfg.bg
                        )}>
                          <Icon size={11} />
                          {cfg.label}
                        </span>
                        {conta.status === 'erro' && conta.erro_mensagem && (
                          <p className="text-red-400/80 text-[10px] mt-1 max-w-[300px] break-words" title={conta.erro_mensagem}>
                            {conta.erro_mensagem.substring(0, 150)}{conta.erro_mensagem.length > 150 ? '...' : ''}
                          </p>
                        )}
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          {(conta.metadata?.anexo_url || conta.anexo_url) && (
                            <button
                              type="button"
                              onClick={() => visualizarAnexo(conta.metadata?.anexo_url || conta.anexo_url)}
                              className="text-emerald-400 hover:text-emerald-300 transition-colors p-1 bg-emerald-500/10 rounded"
                              title="Visualizar Anexo/Comprovante"
                            >
                              <Paperclip size={14} />
                            </button>
                          )}
                          <button
                            onClick={() => removerConta(conta.id)}
                            className="text-dark-500 hover:text-red-400 transition-colors p-1"
                            title="Excluir"
                          >
                            <Trash2 size={14} />
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
    </div>
  )
}
