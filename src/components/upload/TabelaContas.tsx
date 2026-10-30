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

import type { ProgressoLoteData } from '@/components/ui/PainelProgressoLote'

interface Props {
  empresaId?: string
  onEnviarContaAzul?: () => void
  onExportarXls?: () => void
  enviandoCA?: boolean
  gerandoXls?: boolean
  progressoEnvio?: ProgressoLoteData | null
}

const STATUS_CONFIG = {
  pendente: { label: 'Pendente', icon: Clock, color: 'dx-status', bg: '' },
  enviado: { label: 'Enviado', icon: CheckCircle, color: 'dx-status is-ok', bg: '' },
  erro: { label: 'Erro', icon: AlertCircle, color: 'dx-status is-bad', bg: '' },
  cancelado: { label: 'Cancelado', icon: AlertCircle, color: 'dx-status is-muted', bg: '' },
}

export default function TabelaContas({
  empresaId,
  onEnviarContaAzul,
  onExportarXls,
  enviandoCA = false,
  gerandoXls = false,
  progressoEnvio = null,
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

  const qtdPendente = contas.filter((c) => c.status === 'pendente').length
  const qtdEnviado = contas.filter((c) => c.status === 'enviado').length
  const qtdErro = contas.filter((c) => c.status === 'erro').length

  const totalPaginas = Math.ceil(contas.length / ITENS_POR_PAGINA) || 1
  const contasExibidas = contas.slice((paginaAtual - 1) * ITENS_POR_PAGINA, paginaAtual * ITENS_POR_PAGINA)

  return (
    <div className="space-y-4">
      {/* Barra Operacional: Filtros à esquerda + Ações e Atualizar alinhados à direita */}
      <div className="dx-panel shadow-[var(--dx-shadow-card)] p-3 animate-fade-in">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
          {/* Esquerda: Filtros em Formato Pill */}
          <div className="dx-seg flex-wrap">
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
                    'dx-seg-btn',
                    isSelected && 'is-on'
                  )}
                >
                  <span>{label}</span>
                  <span className={cn(
                    'dx-count',
                    f === 'erro' && qtd > 0 && 'is-bad'
                  )}>
                    {qtd}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Direita: Ações em Lote + Limpar + Atualizar + Exportar XLS + Enviar ao Conta Azul */}
          <div className="dx-actions lg:justify-end">
            {contas.length > 0 && (
              <div className="dx-actions animate-fade-in">
                {selecionados.length > 0 && (
                  <span className="dx-chip">
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
                      className="dx-btn is-sm"
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
                      className="dx-btn is-sm"
                      title="Aplicar a mesma categoria a todas as contas selecionadas"
                    >
                      <Tags size={13} /> {selecionados.length > 0 ? `Categoria (${selecionados.length})` : 'Categoria'}
                    </button>
                  )}
                </div>

                {/* Transferir para Outra Loja */}
                <div className="relative">
                  {editandoEmMassaLoja ? (
                    <div className="dx-menu is-right p-1.5 w-56 space-y-0.5">
                      <p className="text-[11px] font-bold text-[var(--dx-muted)] px-2.5 py-1.5">Transferir para loja:</p>
                      {empresas.filter(e => e.id !== empresaId).map(emp => (
                        <button
                          key={emp.id}
                          onClick={() => handleMoverLoja(emp.id)}
                          className="dx-menu-item rounded-lg py-2 px-2.5 text-xs"
                        >
                          <Building2 size={13} className="text-[var(--dx-link)] flex-shrink-0" />
                          <span className="truncate">{emp.nome}</span>
                        </button>
                      ))}
                      <button
                        onClick={() => setEditandoEmMassaLoja(false)}
                        className="w-full text-center text-[11px] text-[var(--dx-muted)] hover:text-[var(--dx-ink)] py-1.5 cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setEditandoEmMassaLoja(true)}
                      className="dx-btn is-sm"
                      title="Transferir contas selecionadas para outra empresa"
                    >
                      <ArrowRightLeft size={13} /> {selecionados.length > 0 ? `Mover (${selecionados.length})` : 'Mover Loja'}
                    </button>
                  )}
                </div>

                {selecionados.length > 0 && (
                  <button
                    onClick={handleExcluirSelecionados}
                    className="dx-btn is-sm is-danger"
                  >
                    <Trash2 size={13} /> Excluir ({selecionados.length})
                  </button>
                )}
              </div>
            )}

            {contas.some(c => c.status === 'pendente') && (
              <button
                onClick={limparTudo}
                className="dx-btn is-sm is-danger"
              >
                <Trash2 size={13} />
                <span>Limpar Pendentes</span>
              </button>
            )}

            {/* Atualizar */}
            <button
              onClick={carregar}
              disabled={loading}
              className="dx-btn is-sm"
              title="Atualizar lista de contas"
            >
              {loading ? <Loader2 size={13} className="animate-spin text-[var(--dx-link)]" /> : <RefreshCw size={13} className="text-[var(--dx-link)]" />}
              <span>Atualizar</span>
            </button>

            {/* Exportar XLS */}
            {onExportarXls && (
              <button
                onClick={onExportarXls}
                disabled={gerandoXls}
                className="dx-btn is-sm is-ok"
                title="Exportar contas para planilha Excel"
              >
                {gerandoXls ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
                <span>{gerandoXls ? 'Exportando...' : 'Exportar XLS'}</span>
              </button>
            )}

            {/* Enviar ao Conta Azul */}
            {onEnviarContaAzul && (
              <button
                onClick={onEnviarContaAzul}
                disabled={enviandoCA}
                className="dx-btn is-sm is-primary"
                title="Enviar contas pendentes ao Conta Azul"
              >
                {enviandoCA ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Send size={14} />
                )}
                <span>
                  {enviandoCA 
                    ? `Enviando (${progressoEnvio?.processados || 0}/${progressoEnvio?.total || qtdPendente})...` 
                    : `Enviar ao Conta Azul (${qtdPendente})`}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabela com Sticky Header, Zebra Rows e Contraste Claro/Escuro */}
      {loading ? (
        <div className="dx-panel dx-loading">
          <Loader2 size={24} className="text-[var(--dx-link)] animate-spin" />
        </div>
      ) : contas.length === 0 ? (
        <div className="dx-panel dx-empty shadow-[var(--dx-shadow-card)]">
          <div className="dx-empty-ico">
            <Clock size={18} />
          </div>
          <div>
            <b>Nenhuma conta com status "{filtro}"</b>
            <p>
              Não há lançamentos financeiros registrados nesta categoria para a empresa selecionada.
            </p>
          </div>
        </div>
      ) : (
        <div className="dx-panel shadow-[var(--dx-shadow-card)] overflow-hidden">
          <div className="dx-table-wrap overflow-x-auto custom-scrollbar">
            <table className="dx-table min-w-[760px] select-none">
              <colgroup>
                <col style={{ width: '32px' }} />
                <col style={{ width: '38%' }} />
                <col style={{ width: '86px' }} />
                <col style={{ width: '74px' }} />
                <col style={{ width: '74px' }} />
                <col style={{ width: '92px' }} />
                <col style={{ width: '88px' }} />
                <col style={{ width: '60px' }} />
                <col style={{ width: '74px' }} />
                <col style={{ width: '34px' }} />
              </colgroup>
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="is-center">
                    <input
                      type="checkbox"
                      checked={contas.length > 0 && selecionados.length === contas.length}
                      onChange={toggleSelectAll}
                      className="dx-check"
                    />
                  </th>
                  <th>Fornecedor</th>
                  <th className="is-right">Valor</th>
                  <th className="is-center">Venc.</th>
                  <th className="is-center">Comp.</th>
                  <th>Categoria</th>
                  <th>Banco</th>
                  <th>Desc.</th>
                  <th className="is-center">Status</th>
                  <th className="is-center"></th>
                </tr>
              </thead>
              <tbody>
                {contasExibidas.map((conta) => {
                  const cfg = STATUS_CONFIG[conta.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.pendente
                  const Icon = cfg.icon
                  const isSelected = selecionados.includes(conta.id)

                  return (
                    <tr
                      key={conta.id}
                      className={cn(
                        (editandoCategoriaId === conta.id || editandoContaId === conta.id) && 'relative z-20',
                        isSelected && 'is-selected'
                      )}
                    >
                      {/* Checkbox */}
                      <td className="is-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(conta.id)}
                          className="dx-check"
                        />
                      </td>

                      {/* Fornecedor */}
                      <td className="overflow-hidden">
                        <span
                          className="dx-cell-name"
                          title={conta.fornecedor}
                        >
                          {conta.fornecedor}
                        </span>
                      </td>

                      {/* Valor */}
                      <td className="is-right whitespace-nowrap overflow-hidden">
                        <span className="dx-cell-money tabular-nums">
                          {formatCurrency(Number(conta.valor))}
                        </span>
                      </td>

                      {/* Vencimento */}
                      <td className="is-center whitespace-nowrap overflow-hidden">
                        <span className="dx-cell-date tabular-nums">
                          {formatDate(conta.vencimento)}
                        </span>
                      </td>

                      {/* Competência */}
                      <td className="is-center whitespace-nowrap overflow-hidden">
                        <span className="dx-cell-date tabular-nums">
                          {conta.emissao ? formatDate(conta.emissao) : '-'}
                        </span>
                      </td>

                      {/* Categoria editável inline */}
                      <td className={cn(editandoCategoriaId === conta.id ? "overflow-visible relative z-30" : "overflow-hidden")}>
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
                            className="dx-pill w-full"
                            title={conta.categoria || 'Materiais para Revenda'}
                          >
                            <span className="truncate">{conta.categoria || 'Materiais'}</span>
                            <Edit2 size={10} className="shrink-0" />
                          </button>
                        )}
                      </td>

                      {/* Conta Bancária (Banco) */}
                      <td className={cn(editandoContaId === conta.id ? "overflow-visible relative z-30" : "overflow-hidden")}>
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
                              'dx-pill w-full',
                              conta.conta_financeira ? 'is-accent' : 'is-warn'
                            )}
                            title={conta.conta_financeira || 'Selecionar Banco...'}
                          >
                            <span className="truncate">
                              <Landmark size={10} className="shrink-0" />
                              <span className="truncate">{conta.conta_financeira ? conta.conta_financeira.split('-')[0].trim() : 'Banco'}</span>
                            </span>
                            <Edit2 size={10} className="shrink-0" />
                          </button>
                        )}
                      </td>

                      {/* Descrição */}
                      <td className="overflow-hidden">
                        <span
                          className="dx-cell-text tabular-nums"
                          title={conta.descricao || ''}
                        >
                          {conta.descricao || '-'}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="is-center overflow-hidden">
                        <span
                          className={cn(
                            cfg.color,
                            cfg.bg
                          )}
                        >
                          <Icon size={10} className="shrink-0" />
                          {cfg.label}
                        </span>
                        {conta.status === 'erro' && conta.erro_mensagem && (
                          <p
                            className="dx-status-error"
                            title={conta.erro_mensagem}
                          >
                            {conta.erro_mensagem}
                          </p>
                        )}
                      </td>

                      {/* Ações */}
                      <td className="is-center overflow-hidden">
                        <div className="flex items-center justify-center gap-1">
                          {(conta.metadata?.anexo_url || conta.anexo_url) && (
                            <button
                              type="button"
                              onClick={() => visualizarAnexo(conta.metadata?.anexo_url || conta.anexo_url)}
                              className="dx-btn-icon is-ok"
                              title="Visualizar Anexo/Comprovante"
                            >
                              <Paperclip size={12} />
                            </button>
                          )}
                          <button
                            onClick={() => removerConta(conta.id)}
                            className="dx-btn-icon"
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
        <div className="dx-panel dx-listfoot shadow-[var(--dx-shadow-card)] rounded-[var(--dx-r-xl)] border border-[var(--dx-line)]">
          <div>
            Mostrando <b>{contasExibidas.length}</b> de <b>{contas.length}</b> registros
          </div>
          {totalPaginas > 1 && (
            <div className="dx-pager">
              <button
                onClick={() => setPaginaAtual(p => Math.max(1, p - 1))}
                disabled={paginaAtual === 1}
                className="dx-pager-btn"
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
                      'dx-pager-btn',
                      paginaAtual === p && 'is-on'
                    )}
                  >
                    {p}
                  </button>
                ))}
              <button
                onClick={() => setPaginaAtual(p => Math.min(totalPaginas, p + 1))}
                disabled={paginaAtual === totalPaginas}
                className="dx-pager-btn"
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
