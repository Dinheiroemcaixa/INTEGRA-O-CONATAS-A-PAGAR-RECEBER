'use client'

import { useState, useCallback, useEffect } from 'react'
import { useEmpresa } from '@/contexts/EmpresaContext'
import { createClient } from '@/lib/supabase/client'
import DropZoneVendas from '@/components/upload/DropZoneVendas'
import TabelaVendasPreview from '@/components/upload/TabelaVendasPreview'
import ModalEditarVenda from '@/components/upload/ModalEditarVenda'
import SelectorEmpresa from '@/components/layout/SelectorEmpresa'
import type { VendaPreview, ResultadoImportacaoVendas } from '@/types'
import {
  Upload, ArrowLeft, Loader2,
  CheckCircle, AlertCircle, Send, ShoppingCart,
  Database, RefreshCw, ChevronDown, ChevronUp,
  Trash2
} from 'lucide-react'
import toast from 'react-hot-toast'

type Etapa = 'upload' | 'preview'
type SubAba = 'datacar' | 'planilha'

interface VendaImportada {
  id: string
  cliente: string
  os_numero: string
  data_venda: string | null
  valor_total: number
  forma_pagamento: string | null
  itens: Array<{
    codigo: string
    descricao: string
    quantidade: number
    valor_unitario: number
    valor_unitario_original?: number
    desconto?: number
    tipo?: 'produto' | 'servico'
  }>
  status: string
  dados_datacar: Record<string, unknown> | null
  created_at: string
}

export default function VendasPage() {
  const { empresaAtiva } = useEmpresa()
  const supabase = createClient()

  // Sub-aba ativa
  const [subAba, setSubAba] = useState<SubAba>('datacar')

  // ─── Estado da sub-aba Datacar ───────────────────────────────
  const [vendasDatacar, setVendasDatacar] = useState<VendaImportada[]>([])
  const [carregandoDatacar, setCarregandoDatacar] = useState(false)
  const [selecionadosDatacar, setSelecionadosDatacar] = useState<Set<string>>(new Set())
  const [expandidoDatacar, setExpandidoDatacar] = useState<string | null>(null)
  const [enviandoDatacar, setEnviandoDatacar] = useState(false)
  const [filtroStatusDatacar, setFiltroStatusDatacar] = useState<'pendente' | 'enviado' | 'todos'>('pendente')

  // ─── Estado da sub-aba Planilha ──────────────────────────────
  const [etapa, setEtapa] = useState<Etapa>('upload')
  const [resultado, setResultado] = useState<ResultadoImportacaoVendas | null>(null)
  const [dadosEditados, setDadosEditados] = useState<VendaPreview[]>([])
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set())
  const [enviandoCA, setEnviandoCA] = useState(false)
  const [editandoIdx, setEditandoIdx] = useState<number | null>(null)

  // ─── Carregar vendas do Datacar ──────────────────────────────
  const carregarVendasDatacar = useCallback(async () => {
    if (!empresaAtiva) return
    setCarregandoDatacar(true)
    try {
      let query = supabase
        .from('vendas_importadas')
        .select('*')
        .eq('empresa_id', empresaAtiva.id)
        .order('created_at', { ascending: false })

      if (filtroStatusDatacar !== 'todos') {
        query = query.eq('status', filtroStatusDatacar)
      }

      const { data, error } = await query
      if (error) throw error
      setVendasDatacar(data || [])
      setSelecionadosDatacar(new Set())
    } catch (err) {
      toast.error('Erro ao carregar vendas importadas do Datacar')
      console.error(err)
    } finally {
      setCarregandoDatacar(false)
    }
  }, [empresaAtiva, filtroStatusDatacar, supabase])

  useEffect(() => {
    if (subAba === 'datacar') carregarVendasDatacar()
  }, [subAba, carregarVendasDatacar])

  // ─── Toggles Datacar ─────────────────────────────────────────
  const toggleSelecionadoDatacar = (id: string) => {
    setSelecionadosDatacar(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const toggleTodosDatacar = () => {
    const pendentes = vendasDatacar.filter(v => v.status === 'pendente').map(v => v.id)
    if (selecionadosDatacar.size === pendentes.length) {
      setSelecionadosDatacar(new Set())
    } else {
      setSelecionadosDatacar(new Set(pendentes))
    }
  }

  const removerVendaDatacar = async (id: string) => {
    if (!confirm('Remover esta venda do Card? Ela poderá ser reimportada do Datacar.')) return
    const { error } = await supabase.from('vendas_importadas').delete().eq('id', id)
    if (error) { toast.error('Erro ao remover venda'); return }
    toast.success('Venda removida do Card')
    carregarVendasDatacar()
  }

  // ─── Enviar para Conta Azul (vindas do Datacar) ──────────────
  const handleEnviarDatacarParaCA = async () => {
    if (!empresaAtiva) { toast.error('Selecione uma empresa'); return }
    if (selecionadosDatacar.size === 0) { toast.error('Selecione ao menos uma venda'); return }

    setEnviandoDatacar(true)
    try {
      const vendasSelecionadas = vendasDatacar.filter(v => selecionadosDatacar.has(v.id))
      
      // Converte para o formato esperado pelo endpoint de envio do CA
      const vendasFormatadas = vendasSelecionadas.map(v => ({
        cliente: v.cliente,
        cliente_cpf_cnpj: v.dados_datacar?.cliente_cpf_cnpj as string | undefined,
        os_numero: v.os_numero,
        data_venda: v.data_venda,
        valor_total: v.valor_total,
        forma_pagamento: v.forma_pagamento,
        itens: v.itens,
        valido: true,
      }))

      const res = await fetch('/api/conta-azul/enviar-vendas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empresa_id: empresaAtiva.id,
          vendas: vendasFormatadas
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao enviar vendas')

      // Atualiza status das enviadas com sucesso no banco
      if (data.sucessos > 0) {
        const idsEnviadas = vendasSelecionadas.slice(0, data.sucessos).map(v => v.id)
        await supabase
          .from('vendas_importadas')
          .update({ status: 'enviado' })
          .in('id', idsEnviadas)
        toast.success(`${data.sucessos} vendas criadas no Conta Azul com sucesso!`)
      }

      if (data.erros > 0) {
        toast.error(`${data.erros} vendas com erro. Verifique os logs.`)
        if (data.detalhesErros?.length > 0) {
          data.detalhesErros.slice(0, 3).forEach((errMsg: string) => {
            toast.error(errMsg, { duration: 6000 })
          })
        }
      }

      carregarVendasDatacar()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao enviar para o Conta Azul'
      toast.error(msg)
    } finally {
      setEnviandoDatacar(false)
    }
  }

  // ─── Handlers sub-aba Planilha ───────────────────────────────
  const handleSaveEdicao = (vendaAtualizada: VendaPreview) => {
    if (editandoIdx !== null) {
      setDadosEditados(prev => {
        const novos = [...prev]
        novos[editandoIdx] = vendaAtualizada
        return novos
      })
      setEditandoIdx(null)
      toast.success('Venda atualizada com sucesso!')
    }
  }

  const handleResultado = useCallback(async (res: ResultadoImportacaoVendas) => {
    setResultado(res)
    setDadosEditados(res.dados)
    const validos = new Set<number>(
      res.dados.reduce((acc: number[], d, i) => { if (d.valido) acc.push(i); return acc }, [])
    )
    setSelecionados(validos)
    setEtapa('preview')
  }, [])

  const toggleItem = (idx: number) => {
    setSelecionados((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx); else next.add(idx)
      return next
    })
  }

  const toggleTodos = () => {
    const validosIdx = dadosEditados.reduce((acc: number[], d, i) => {
      if (d.valido) acc.push(i); return acc
    }, [])
    if (selecionados.size === validosIdx.length) {
      setSelecionados(new Set())
    } else {
      setSelecionados(new Set(validosIdx))
    }
  }

  const removerItem = (idx: number) => {
    setDadosEditados((prev) => prev.filter((_, i) => i !== idx))
    setSelecionados((prev) => {
      const next = new Set<number>()
      prev.forEach((i) => { if (i < idx) next.add(i); else if (i > idx) next.add(i - 1) })
      return next
    })
  }

  const handleEnviarContaAzul = async () => {
    if (!empresaAtiva) { toast.error('Selecione uma empresa primeiro'); return }
    if (selecionados.size === 0) { toast.error('Selecione ao menos uma venda'); return }

    setEnviandoCA(true)
    try {
      const itensParaEnviar = dadosEditados.filter((_, i) => selecionados.has(i))
      
      const res = await fetch('/api/conta-azul/enviar-vendas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empresa_id: empresaAtiva.id,
          vendas: itensParaEnviar
        }),
      })
      
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao enviar vendas')
      
      if (data.sucessos > 0) toast.success(`${data.sucessos} vendas enviadas com sucesso!`)
      if (data.erros > 0) {
        toast.error(`${data.erros} vendas com erro. Verifique os logs.`)
        if (data.detalhesErros && data.detalhesErros.length > 0) {
          data.detalhesErros.slice(0, 3).forEach((errMsg: string) => {
            toast.error(errMsg, { duration: 6000 })
          })
          if (data.detalhesErros.length > 3) {
            toast.error(`E mais ${data.detalhesErros.length - 3} erro(s)...`, { duration: 6000 })
          }
        }
      }
      
      setEtapa('upload')
      setResultado(null)
      setDadosEditados([])
      setSelecionados(new Set())
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao enviar para o Conta Azul'
      toast.error(msg)
    } finally {
      setEnviandoCA(false)
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────
  const formatCurrency = (val: number) =>
    val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  const formatDate = (dt: string | null) => {
    if (!dt) return '-'
    try {
      const d = new Date(dt + 'T12:00:00')
      if (isNaN(d.getTime())) return dt
      return d.toLocaleDateString('pt-BR')
    } catch { return dt }
  }

  const pendenteCount = vendasDatacar.filter(v => v.status === 'pendente').length

  // ─── Render ──────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <ShoppingCart className="text-brand-500" />
              Vendas
            </h1>
            <span className="px-2 py-0.5 bg-brand-500/20 text-brand-400 text-[10px] font-bold rounded border border-brand-500/30 uppercase tracking-wider">
              Novo Módulo
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <SelectorEmpresa />
          {subAba === 'planilha' && etapa !== 'upload' && (
            <button
              onClick={() => { setEtapa('upload'); setResultado(null); setDadosEditados([]) }}
              className="flex items-center gap-2 text-dark-400 hover:text-white text-sm px-3 py-2 rounded-lg hover:bg-dark-800 transition-all"
            >
              <ArrowLeft size={16} /> Voltar
            </button>
          )}
        </div>
      </div>

      {/* Sub-abas: Datacar | Planilha */}
      <div className="flex border-b border-dark-700 gap-0">
        <button
          onClick={() => setSubAba('datacar')}
          className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold transition-all border-b-2 ${
            subAba === 'datacar'
              ? 'border-blue-400 text-blue-400 bg-dark-800/40'
              : 'border-transparent text-dark-400 hover:text-white hover:bg-dark-800/20'
          }`}
        >
          <Database size={15} />
          Importadas do Datacar
          {pendenteCount > 0 && (
            <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full font-bold">
              {pendenteCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setSubAba('planilha')}
          className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold transition-all border-b-2 ${
            subAba === 'planilha'
              ? 'border-brand-400 text-brand-400 bg-dark-800/40'
              : 'border-transparent text-dark-400 hover:text-white hover:bg-dark-800/20'
          }`}
        >
          <Upload size={15} />
          Upload de Planilha
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════
          SUB-ABA: IMPORTADAS DO DATACAR
      ══════════════════════════════════════════════════════ */}
      {subAba === 'datacar' && (
        <div className="space-y-4">
          {!empresaAtiva ? (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 flex items-center gap-3">
              <AlertCircle size={18} className="text-yellow-400 flex-shrink-0" />
              <p className="text-yellow-300 text-sm">
                Selecione uma empresa no menu superior para ver as vendas importadas.
              </p>
            </div>
          ) : (
            <>
              {/* Toolbar */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <select
                    value={filtroStatusDatacar}
                    onChange={e => setFiltroStatusDatacar(e.target.value as any)}
                    className="bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-blue-500/50 outline-none"
                  >
                    <option value="pendente">Pendentes</option>
                    <option value="enviado">Enviadas ao CA</option>
                    <option value="todos">Todas</option>
                  </select>
                  <button
                    onClick={carregarVendasDatacar}
                    disabled={carregandoDatacar}
                    className="flex items-center gap-2 px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-dark-300 hover:text-white text-sm transition-all"
                  >
                    <RefreshCw size={14} className={carregandoDatacar ? 'animate-spin' : ''} />
                    Atualizar
                  </button>
                </div>
                {selecionadosDatacar.size > 0 && (
                  <button
                    onClick={handleEnviarDatacarParaCA}
                    disabled={enviandoDatacar}
                    className="flex items-center gap-2 px-5 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white rounded-lg text-sm font-bold transition-all shadow-lg"
                  >
                    {enviandoDatacar ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    {enviandoDatacar ? 'Enviando...' : `Criar ${selecionadosDatacar.size} Venda(s) no Conta Azul`}
                  </button>
                )}
              </div>

              {/* Loading */}
              {carregandoDatacar && (
                <div className="flex items-center justify-center py-16">
                  <Loader2 size={28} className="animate-spin text-blue-400" />
                </div>
              )}

              {/* Sem vendas */}
              {!carregandoDatacar && vendasDatacar.length === 0 && (
                <div className="bg-dark-800 border border-dark-700 rounded-xl p-12 text-center">
                  <Database size={40} className="text-dark-600 mx-auto mb-3" />
                  <p className="text-dark-400 text-sm font-medium">
                    {filtroStatusDatacar === 'pendente'
                      ? 'Nenhuma venda pendente. Busque OS/Pedidos na aba Datacar e clique em "Salvar no Card Vendas".'
                      : 'Nenhuma venda encontrada para o filtro selecionado.'}
                  </p>
                </div>
              )}

              {/* Lista de vendas */}
              {!carregandoDatacar && vendasDatacar.length > 0 && (
                <div className="bg-dark-800 border border-dark-700 rounded-xl overflow-hidden">
                  {/* Cabeçalho da lista */}
                  <div className="flex items-center gap-3 px-4 py-2.5 bg-dark-900/40 border-b border-dark-700 text-xs text-dark-400 font-semibold">
                    <input
                      type="checkbox"
                      checked={
                        selecionadosDatacar.size > 0 &&
                        selecionadosDatacar.size === vendasDatacar.filter(v => v.status === 'pendente').length
                      }
                      onChange={toggleTodosDatacar}
                      className="accent-blue-500"
                    />
                    <span className="flex-1">CLIENTE / OS</span>
                    <span className="w-28 text-right">VALOR</span>
                    <span className="w-24 text-right">DATA</span>
                    <span className="w-20 text-center">STATUS</span>
                    <span className="w-16"></span>
                  </div>

                  <div className="max-h-[520px] overflow-y-auto divide-y divide-dark-700/50">
                    {vendasDatacar.map(venda => (
                      <div key={venda.id} className="hover:bg-dark-700/20 transition-colors">
                        <div
                          className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                          onClick={() => setExpandidoDatacar(expandidoDatacar === venda.id ? null : venda.id)}
                        >
                          {venda.status === 'pendente' ? (
                            <input
                              type="checkbox"
                              checked={selecionadosDatacar.has(venda.id)}
                              onChange={e => { e.stopPropagation(); toggleSelecionadoDatacar(venda.id) }}
                              onClick={e => e.stopPropagation()}
                              className="accent-blue-500"
                            />
                          ) : (
                            <CheckCircle size={14} className="text-emerald-400 flex-shrink-0 ml-0.5" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-medium truncate">{venda.cliente}</p>
                            <p className="text-dark-500 text-xs font-mono">OS #{venda.os_numero}</p>
                          </div>
                          <span className="text-white text-sm font-bold tabular-nums w-28 text-right">
                            {formatCurrency(venda.valor_total)}
                          </span>
                          <span className="text-dark-400 text-xs w-24 text-right tabular-nums">
                            {formatDate(venda.data_venda)}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full w-20 text-center ${
                            venda.status === 'enviado'
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : 'bg-yellow-500/15 text-yellow-400'
                          }`}>
                            {venda.status === 'enviado' ? 'Enviado CA' : 'Pendente'}
                          </span>
                          <div className="w-16 flex items-center justify-end gap-1">
                            <button
                              onClick={e => { e.stopPropagation(); removerVendaDatacar(venda.id) }}
                              className="p-1 text-dark-600 hover:text-red-400 transition-colors"
                              title="Remover do Card"
                            >
                              <Trash2 size={13} />
                            </button>
                            {expandidoDatacar === venda.id
                              ? <ChevronUp size={14} className="text-dark-500" />
                              : <ChevronDown size={14} className="text-dark-500" />
                            }
                          </div>
                        </div>

                        {/* Detalhes expandidos */}
                        {expandidoDatacar === venda.id && (
                          <div className="px-4 pb-3 pt-1 border-t border-dark-700/30 mx-4 mb-2 animate-fade-in">
                            {/* Informações do cliente */}
                            <div className="text-xs text-dark-400 space-y-0.5 mb-2">
                              {venda.dados_datacar?.vendedor ? (
                                <p><strong className="text-dark-300">Vendedor:</strong> {String(venda.dados_datacar.vendedor)}</p>
                              ) : null}
                              {venda.dados_datacar?.veiculo ? (
                                <p><strong className="text-dark-300">Veículo:</strong> {String(venda.dados_datacar.veiculo)}</p>
                              ) : null}
                              {venda.dados_datacar?.cliente_cpf_cnpj ? (
                                <p><strong className="text-dark-300">CPF/CNPJ:</strong> {String(venda.dados_datacar.cliente_cpf_cnpj)}</p>
                              ) : null}
                              {(venda.dados_datacar?.cliente_logradouro || venda.dados_datacar?.cliente_cidade) ? (
                                <p>
                                  <strong className="text-dark-300">Endereço:</strong>{' '}
                                  {[venda.dados_datacar.cliente_logradouro, venda.dados_datacar.cliente_numero, venda.dados_datacar.cliente_complemento]
                                    .filter(Boolean).map(String).join(', ')}
                                  {venda.dados_datacar.cliente_bairro ? ` — ${String(venda.dados_datacar.cliente_bairro)}` : ''}
                                  {venda.dados_datacar.cliente_cidade ? ` — ${String(venda.dados_datacar.cliente_cidade)}` : ''}
                                  {venda.dados_datacar.cliente_uf ? `/${String(venda.dados_datacar.cliente_uf)}` : ''}
                                  {venda.dados_datacar.cliente_cep ? ` CEP: ${String(venda.dados_datacar.cliente_cep)}` : ''}
                                </p>
                              ) : null}
                              {venda.forma_pagamento && (
                                <p><strong className="text-dark-300">Pagamento:</strong> {venda.forma_pagamento}</p>
                              )}
                            </div>

                            {/* Itens */}
                            {venda.itens.length > 0 && (
                              <div className="mt-2">
                                <p className="text-dark-300 text-xs font-semibold mb-1">Itens ({venda.itens.length}):</p>
                                <div className="bg-dark-900/60 rounded-lg p-2 space-y-1.5 max-h-40 overflow-y-auto">
                                  {venda.itens.map((item, j) => (
                                    <div key={j} className="flex flex-col gap-1 text-[11px] border-b border-dark-700/50 pb-1.5 last:border-0 last:pb-0">
                                      <div className="flex items-center gap-2">
                                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold flex-shrink-0 ${
                                          item.tipo === 'produto' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-pink-500/20 text-pink-400'
                                        }`}>
                                          {item.tipo === 'produto' ? 'PEÇA' : 'SERV'}
                                        </span>
                                        <span className="text-dark-500 w-6 text-right flex-shrink-0">{item.quantidade}x</span>
                                        <span className="text-dark-300 flex-1 truncate">
                                          {item.codigo && <span className="text-blue-400 font-mono mr-2">[{item.codigo}]</span>}
                                          {item.descricao}
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-end gap-3 text-[10px] pl-8">
                                        <span className="text-dark-400">Bruto: {formatCurrency((item.valor_unitario_original ?? item.valor_unitario) * item.quantidade)}</span>
                                        {(item.desconto ?? 0) > 0 && (
                                          <span className="text-orange-400">Desc: {formatCurrency((item.desconto ?? 0) * item.quantidade)}</span>
                                        )}
                                        <span className="text-white font-semibold">Líq: {formatCurrency(item.valor_unitario * item.quantidade)}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Rodapé da lista */}
                  <div className="flex items-center justify-between px-4 py-3 bg-dark-900/30 border-t border-dark-700 text-sm">
                    <p className="text-dark-400">
                      <strong className="text-white">{selecionadosDatacar.size}</strong> selecionadas ·{' '}
                      <strong className="text-white">{vendasDatacar.length}</strong> total
                    </p>
                    {selecionadosDatacar.size > 0 && (
                      <button
                        onClick={handleEnviarDatacarParaCA}
                        disabled={enviandoDatacar}
                        className="flex items-center gap-2 px-5 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white rounded-lg text-sm font-bold transition-all"
                      >
                        {enviandoDatacar ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                        {enviandoDatacar ? 'Enviando...' : 'Criar Vendas no Conta Azul'}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          SUB-ABA: UPLOAD DE PLANILHA
      ══════════════════════════════════════════════════════ */}
      {subAba === 'planilha' && (
        <div className="space-y-4">
          {/* Stepper */}
          <div className="flex items-center gap-2">
            {(['upload', 'preview'] as Etapa[]).map((e, i) => {
              const labels = ['1. Upload da Planilha', '2. Revisão e Envio']
              const isActive = etapa === e
              const isDone = ['upload', 'preview'].indexOf(etapa) > i
              return (
                <div key={e} className="flex items-center gap-2">
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    isActive ? 'bg-brand-600 text-white' :
                    isDone ? 'bg-green-600/20 text-green-400' :
                    'bg-dark-800 text-dark-500'
                  }`}>
                    {isDone && <CheckCircle size={12} />}
                    {labels[i]}
                  </div>
                  {i < 1 && <div className="w-8 h-px bg-dark-700" />}
                </div>
              )
            })}
          </div>

          {/* ETAPA 1: Upload */}
          {etapa === 'upload' && (
            <div className="space-y-4">
              {!empresaAtiva ? (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 flex items-center gap-3">
                  <AlertCircle size={18} className="text-yellow-400 flex-shrink-0" />
                  <p className="text-yellow-300 text-sm">
                    Selecione uma empresa no menu superior antes de importar vendas.
                  </p>
                </div>
              ) : null}
              <DropZoneVendas onResultado={handleResultado} />
              <div className="bg-dark-800/50 border border-dark-700 rounded-xl p-4">
                <p className="text-sm text-dark-400 font-medium mb-2">💡 Formatos suportados e regras de extração:</p>
                <ul className="text-xs text-dark-500 space-y-1">
                  <li>• <strong className="text-dark-300">Excel (.xlsx)</strong> — Planilha com layout de Vendas (OS/PED, CLIENTE, ENCERR, Pagamentos, Itens)</li>
                  <li>• Serão importados os itens classificados como produto <strong className="text-brand-400">("P")</strong> na coluna TIPO.</li>
                  <li>• O <strong className="text-dark-300">Cliente</strong> será vinculado via Conta Azul ou criado se não existir.</li>
                </ul>
              </div>
            </div>
          )}

          {/* ETAPA 2: Preview */}
          {etapa === 'preview' && resultado && (
            <div className="space-y-4">
              {/* Resumo */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-dark-800 border border-dark-700 rounded-xl p-4">
                  <p className="text-dark-400 text-xs mb-1">Total de Vendas</p>
                  <p className="text-white text-2xl font-bold">{dadosEditados.length}</p>
                </div>
                <div className="bg-dark-800 border border-green-500/20 rounded-xl p-4">
                  <p className="text-dark-400 text-xs mb-1">Válidas</p>
                  <p className="text-green-400 text-2xl font-bold">
                    {dadosEditados.filter(d => d.valido).length}
                  </p>
                </div>
              </div>

              <TabelaVendasPreview
                dados={dadosEditados}
                selecionados={selecionados}
                onToggleSelec={toggleItem}
                onToggleTodos={toggleTodos}
                onRemover={removerItem}
                onEditar={(idx) => setEditandoIdx(idx)}
              />

              <div className="flex items-center justify-between p-4 bg-dark-800 border border-dark-700 rounded-xl mt-4">
                <p className="text-dark-300 text-sm">
                  <strong className="text-white">{selecionados.size}</strong> vendas selecionadas para envio.
                </p>
                <button
                  onClick={handleEnviarContaAzul}
                  disabled={enviandoCA || selecionados.size === 0 || !empresaAtiva}
                  className="bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all shadow-lg"
                >
                  {enviandoCA ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  {enviandoCA ? 'Enviando...' : 'Criar Vendas no Conta Azul'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal Edição (planilha) */}
      {editandoIdx !== null && (
        <ModalEditarVenda
          venda={dadosEditados[editandoIdx]}
          onSave={handleSaveEdicao}
          onClose={() => setEditandoIdx(null)}
        />
      )}
    </div>
  )
}
