'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Search, Loader2, FileText, ShoppingCart, Calendar,
  Download, AlertCircle, CheckCircle2, ChevronDown, ChevronUp, ClipboardList, RefreshCw, Send, Check
} from 'lucide-react'
import toast from 'react-hot-toast'

interface Props {
  empresa: {
    id: string
    nome: string
    datacar_token?: string | null
    datacar_cod_emp?: string | null
    datacar_id_operador?: string | null
  }
}

interface ContaPagarResult {
  fornecedor: string
  valor: number
  vencimento: string
  emissao?: string | null
  doc?: string | null
  categoria?: string | null
  descricao?: string | null
  valido: boolean
  erros?: string[]
  _datacar?: Record<string, unknown>
}

interface VendaResult {
  cliente: string
  os_numero: string
  data_venda: string
  valor_total: number
  forma_pagamento?: string
  situacao?: string
  itens: { codigo: string; descricao: string; quantidade: number; valor_unitario: number; tipo?: 'produto' | 'servico' }[]
  valido: boolean
  erros?: string[]
  _datacar?: Record<string, unknown>
}

interface RevisaoResult {
  id: string
  os_numero: string
  cliente: string
  cliente_cpf_cnpj: string | null
  valor_total: number
  data_venda: string
  forma_pagamento: string | null
  status: 'pendente' | 'aprovado' | 'ignorado' | 'erro' | 'concluido'
  erro_envio: string | null
  itens: { codigo: string; descricao: string; quantidade: number; valor_unitario: number; tipo?: string }[]
}

export default function PainelSincronizacao({ empresa }: Props) {
  const hoje = new Date().toISOString().split('T')[0]
  const primeiroDia = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]

  const [tab, setTab] = useState<'contas' | 'vendas' | 'revisao'>('contas')
  const [dtIni, setDtIni] = useState(primeiroDia)
  const [dtFim, setDtFim] = useState(hoje)
  const [buscando, setBuscando] = useState(false)

  // Contas a Pagar
  const [contasResultado, setContasResultado] = useState<ContaPagarResult[] | null>(null)
  const [contasMeta, setContasMeta] = useState<{ total: number; validos: number; invalidos: number } | null>(null)
  const [tipoPeriodoContas, setTipoPeriodoContas] = useState<'venc' | 'emis' | 'pgto' | 'digit'>('venc')
  const [enviandoContas, setEnviandoContas] = useState(false)

  // Vendas
  const [vendasResultado, setVendasResultado] = useState<VendaResult[] | null>(null)
  const [vendasMeta, setVendasMeta] = useState<{ total: number; validos: number; invalidos: number } | null>(null)
  const [tipoPeriodoVendas, setTipoPeriodoVendas] = useState<'encerramento' | 'criacao' | 'conclusao'>('encerramento')
  const [filtroVendas, setFiltroVendas] = useState<'tudo' | 'produtos' | 'servicos'>('tudo')
  const [filtroSituacao, setFiltroSituacao] = useState<'todas' | 'em_andamento' | 'concluida' | 'encerrada' | 'cancelada'>('todas')
  const [salvandoRevisao, setSalvandoRevisao] = useState(false)

  // Revisão
  const [revisaoResultado, setRevisaoResultado] = useState<RevisaoResult[]>([])
  const [buscandoRevisao, setBuscandoRevisao] = useState(false)
  const [enviandoRevisao, setEnviandoRevisao] = useState(false)

  // Expandir detalhes
  const [expandido, setExpandido] = useState<string | number | null>(null)

  const supabase = createClient()

  const temCredenciais = !!empresa.datacar_token && !!empresa.datacar_cod_emp && !!empresa.datacar_id_operador

  useEffect(() => {
    if (tab === 'revisao') {
      handleBuscarRevisao()
    }
  }, [tab])

  const handleBuscarContas = async () => {
    setBuscando(true)
    setContasResultado(null)
    setContasMeta(null)
    try {
      const res = await fetch('/api/datacar/buscar-contas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresa_id: empresa.id, dtIni, dtFim, tipoPeriodo: tipoPeriodoContas }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao buscar contas')

      setContasResultado(data.dados)
      setContasMeta({ total: data.total, validos: data.validos, invalidos: data.invalidos })
      toast.success(`${data.total} contas a pagar encontradas!`)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao buscar contas a pagar')
    } finally {
      setBuscando(false)
    }
  }

  const handleBuscarVendas = async () => {
    setBuscando(true)
    setVendasResultado(null)
    setVendasMeta(null)
    try {
      const res = await fetch('/api/datacar/buscar-vendas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresa_id: empresa.id, dtIni, dtFim, tipoPeriodo: tipoPeriodoVendas }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao buscar vendas')

      setVendasResultado(data.dados)
      setVendasMeta({ total: data.total, validos: data.validos, invalidos: data.invalidos })
      toast.success(`${data.total} OS/Pedidos encontrados!`)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao buscar vendas')
    } finally {
      setBuscando(false)
    }
  }

  const handleBuscarRevisao = async () => {
    setBuscandoRevisao(true)
    try {
      const res = await fetch(`/api/vendas-revisao/listar?empresa_id=${empresa.id}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao buscar revisão')
      setRevisaoResultado(data.dados || [])
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao buscar revisão')
    } finally {
      setBuscandoRevisao(false)
    }
  }

  const handleSincronizarContas = async () => {
    if (!contasResultado) return
    setEnviandoContas(true)
    try {
      const contasParaEnviar = contasResultado.filter(c => c.valido)
      if (contasParaEnviar.length === 0) {
        toast.error('Nenhuma conta válida para enviar.')
        return
      }

      const toastId = toast.loading(`Salvando e enviando ${contasParaEnviar.length} contas para o Conta Azul...`)
      
      const itens = contasParaEnviar.map((d) => ({
        empresa_id: empresa.id,
        fornecedor: d.fornecedor,
        valor: d.valor,
        vencimento: d.vencimento,
        categoria: d.categoria || 'Materiais para Revenda',
        conta_financeira: null,
        conta_financeira_id: null,
        descricao: d.descricao || null,
        doc: d.doc || null,
        emissao: d.emissao || null,
        status: 'pendente',
      }))

      const { data, error } = await supabase
        .from('contas_pagar_importadas')
        .upsert(itens, {
          onConflict: 'empresa_id,fornecedor,valor,vencimento,doc',
          ignoreDuplicates: true,
        })
        .select('id')

      if (error) throw error

      if (data && data.length > 0) {
        const ids = data.map(d => d.id)
        const res = await fetch('/api/conta-azul/enviar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ empresa_id: empresa.id, contas_ids: ids, limite: 100 }),
        })
        const resData = await res.json()
        if (!res.ok) throw new Error(resData.error || 'Erro ao enviar para CA')
        
        toast.success(`Sincronização concluída! ${resData.sucessos || 0} enviados, ${resData.erros || 0} erros.`)
      } else {
         toast.success('Sincronização concluída (as contas já estavam salvas).')
      }

      toast.dismiss(toastId)
      setContasResultado(null)
      setContasMeta(null)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao sincronizar contas')
    } finally {
      setEnviandoContas(false)
    }
  }

  const handleSalvarRevisao = async () => {
    if (!vendasParaExibir) return
    setSalvandoRevisao(true)
    try {
      const vendasParaSalvar = vendasParaExibir.map(v => {
        let itensFiltrados = v.itens
        if (filtroVendas === 'produtos') itensFiltrados = v.itens.filter(i => i.tipo === 'produto')
        if (filtroVendas === 'servicos') itensFiltrados = v.itens.filter(i => i.tipo === 'servico')
        
        const valorTotalRecalculado = itensFiltrados.reduce((acc, i) => acc + (i.quantidade * i.valor_unitario), 0)
        
        return {
          ...v,
          itens: itensFiltrados,
          valor_total: parseFloat(valorTotalRecalculado.toFixed(2)),
          valido: v.valido && itensFiltrados.length > 0 && valorTotalRecalculado > 0
        }
      })

      const toastId = toast.loading(`Salvando ${vendasParaSalvar.length} vendas para revisão...`)
      
      const res = await fetch('/api/vendas-revisao/salvar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresa_id: empresa.id, vendas: vendasParaSalvar }),
      })
      const data = await res.json()
      
      toast.dismiss(toastId)
      
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar para revisão')
      
      toast.success(`${data.salvos} OS enviadas para revisão!`)
      
      // Muda a aba para a revisão para o usuário aprovar e enviar
      setTab('revisao')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar vendas')
    } finally {
      setSalvandoRevisao(false)
    }
  }

  const handleAprovarRevisao = async (id: string, novoStatus: 'aprovado' | 'pendente' | 'ignorado') => {
    try {
      const res = await fetch('/api/vendas-revisao/listar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: novoStatus })
      })
      if (!res.ok) throw new Error('Erro ao atualizar status')
      
      setRevisaoResultado(prev => prev.map(r => r.id === id ? { ...r, status: novoStatus } : r))
      toast.success('Status atualizado')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao atualizar')
    }
  }

  const handleEnviarContaAzul = async () => {
    const aprovadas = revisaoResultado.filter(r => r.status === 'aprovado' || (r.status === 'erro' && r.valor_total > 0))
    if (aprovadas.length === 0) {
      toast.error('Não há OS aprovadas para enviar.')
      return
    }

    setEnviandoRevisao(true)
    const toastId = toast.loading(`Enviando ${aprovadas.length} vendas para o Conta Azul...`)
    
    try {
      const res = await fetch('/api/vendas-revisao/enviar-ca', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresa_id: empresa.id, ids: aprovadas.map(a => a.id) })
      })
      const data = await res.json()
      
      if (!res.ok) throw new Error(data.error || 'Erro ao enviar para CA')
      
      toast.success(`${data.sucessos} OS sincronizadas! ${data.erros} erros.`)
      
      // Recarrega a lista
      handleBuscarRevisao()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao enviar para CA')
    } finally {
      setEnviandoRevisao(false)
      toast.dismiss(toastId)
    }
  }

  // Filtragem local das vendas (antes de mandar pra revisão)
  const vendasParaExibir = vendasResultado?.filter(v => {
    if (filtroSituacao !== 'todas' && v.situacao !== filtroSituacao) return false
    return true
  })

  const formatCurrency = (val: number) =>
    val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  const formatDate = (dt: string) => {
    if (!dt) return '-'
    try {
      const d = new Date(dt)
      if (isNaN(d.getTime())) return dt
      return d.toLocaleDateString('pt-BR')
    } catch { return dt }
  }

  if (!temCredenciais) {
    return (
      <div className="bg-dark-800 border border-dark-700 rounded-xl p-8 text-center">
        <AlertCircle size={40} className="text-dark-600 mx-auto mb-3" />
        <p className="text-dark-400 text-sm">Configure as credenciais do Datacar acima para poder buscar dados.</p>
      </div>
    )
  }

  return (
    <div className="bg-dark-800 border border-dark-700 rounded-xl overflow-hidden shadow-2xl">
      {/* Tabs */}
      <div className="flex border-b border-dark-700 bg-dark-900/50">
        <button
          onClick={() => { setTab('contas'); setExpandido(null) }}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-4 text-sm font-semibold transition-all ${
            tab === 'contas'
              ? 'bg-dark-800 text-orange-400 border-b-2 border-orange-400'
              : 'text-dark-400 hover:text-white hover:bg-dark-800/80'
          }`}
        >
          <FileText size={16} /> Contas a Pagar
        </button>
        <button
          onClick={() => { setTab('vendas'); setExpandido(null) }}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-4 text-sm font-semibold transition-all ${
            tab === 'vendas'
              ? 'bg-dark-800 text-blue-400 border-b-2 border-blue-400'
              : 'text-dark-400 hover:text-white hover:bg-dark-800/80'
          }`}
        >
          <ShoppingCart size={16} /> Busca Datacar (Vendas)
        </button>
        <button
          onClick={() => { setTab('revisao'); setExpandido(null) }}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-4 text-sm font-semibold transition-all ${
            tab === 'revisao'
              ? 'bg-dark-800 text-indigo-400 border-b-2 border-indigo-400'
              : 'text-dark-400 hover:text-white hover:bg-dark-800/80'
          }`}
        >
          <ClipboardList size={16} /> Vendas em Revisão
          {revisaoResultado.filter(r => r.status === 'pendente' || r.status === 'erro').length > 0 && (
            <span className="bg-indigo-500 text-white text-[10px] px-1.5 py-0.5 rounded-full ml-1 animate-pulse">
              {revisaoResultado.filter(r => r.status === 'pendente' || r.status === 'erro').length}
            </span>
          )}
        </button>
      </div>

      {/* ============================================================== */}
      {/* ABA CONTAS A PAGAR */}
      {/* ============================================================== */}
      {tab === 'contas' && (
        <>
          <div className="p-4 border-b border-dark-700 bg-dark-900/30">
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <label className="text-xs text-dark-400 font-medium mb-1 flex items-center gap-1">
                  <Calendar size={12} /> Data Início
                </label>
                <input
                  type="date"
                  value={dtIni}
                  onChange={(e) => setDtIni(e.target.value)}
                  className="bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-orange-500/50 outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-dark-400 font-medium mb-1 flex items-center gap-1">
                  <Calendar size={12} /> Data Fim
                </label>
                <input
                  type="date"
                  value={dtFim}
                  onChange={(e) => setDtFim(e.target.value)}
                  className="bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-orange-500/50 outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-dark-400 font-medium mb-1 block">Pesquisar por:</label>
                <select
                  value={tipoPeriodoContas}
                  onChange={(e) => setTipoPeriodoContas(e.target.value as any)}
                  className="bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-orange-500/50 outline-none"
                >
                  <option value="venc">Vencimento</option>
                  <option value="emis">Emissão</option>
                  <option value="pgto">Pagamento</option>
                  <option value="digit">Digitação no Sistema</option>
                </select>
              </div>
              <button
                onClick={handleBuscarContas}
                disabled={buscando}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm transition-all text-white ${
                  buscando ? 'bg-dark-700 text-dark-500' : 'bg-orange-600 hover:bg-orange-500'
                }`}
              >
                {buscando ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                {buscando ? 'Buscando...' : 'Buscar Contas'}
              </button>
            </div>
          </div>

          {!contasMeta && !buscando && (
            <div className="p-12 text-center">
              <FileText size={40} className="text-dark-700 mx-auto mb-3" />
              <p className="text-dark-500 text-sm">Selecione o período e clique em &quot;Buscar Contas&quot;</p>
            </div>
          )}

          {buscando && (
            <div className="p-12 text-center">
              <Loader2 size={32} className="text-orange-400 animate-spin mx-auto mb-3" />
              <p className="text-dark-400 text-sm">Buscando dados no Datacar...</p>
            </div>
          )}

          {contasMeta && !buscando && (
            <div>
              <div className="flex items-center gap-4 p-4 bg-dark-900/20 border-b border-dark-700">
                <div className="flex items-center gap-2 text-sm">
                  <Download size={14} className="text-orange-400" />
                  <span className="text-dark-300">
                    <strong className="text-white">{contasMeta.total}</strong> títulos encontrados
                  </span>
                </div>
                <span className="text-emerald-400 text-xs font-semibold">{contasMeta.validos} válidos</span>
                {contasMeta.invalidos > 0 && (
                  <span className="text-red-400 text-xs font-semibold">{contasMeta.invalidos} com problemas</span>
                )}
                <span className="ml-auto text-white font-bold text-sm">
                  Total: {formatCurrency((contasResultado || []).reduce((s, c) => s + c.valor, 0))}
                </span>
              </div>

              <div className="p-4 bg-orange-900/10 border-b border-dark-700 flex justify-end">
                <button
                  onClick={handleSincronizarContas}
                  disabled={enviandoContas || (contasMeta.validos === 0)}
                  className="bg-orange-600 hover:bg-orange-500 disabled:opacity-50 px-5 py-2 rounded-lg text-sm font-bold text-white transition-all flex items-center gap-2 shadow-lg"
                >
                  {enviandoContas ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                  Sincronizar com Conta Azul
                </button>
              </div>

              <div className="max-h-[500px] overflow-y-auto">
                {(contasResultado || []).map((conta, i) => (
                  <div key={i} className={`border-b border-dark-700/50 hover:bg-dark-700/20 transition-colors ${
                    !conta.valido ? 'bg-red-500/5' : ''
                  }`}>
                    <div
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                      onClick={() => setExpandido(expandido === i ? null : i)}
                    >
                      {conta.valido
                        ? <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />
                        : <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
                      }
                      <span className="text-white text-sm font-medium flex-1 truncate">{conta.fornecedor}</span>
                      <span className="text-white text-sm font-bold tabular-nums">{formatCurrency(conta.valor)}</span>
                      <span className="text-dark-400 text-xs tabular-nums w-24 text-right">{formatDate(conta.vencimento)}</span>
                      {expandido === i ? <ChevronUp size={14} className="text-dark-500" /> : <ChevronDown size={14} className="text-dark-500" />}
                    </div>
                    {expandido === i && (
                      <div className="px-4 pb-3 pt-0 text-xs text-dark-400 space-y-1 animate-fade-in border-t border-dark-700/30 mx-4">
                        {conta.doc && <p><strong className="text-dark-300">Documento:</strong> {conta.doc}</p>}
                        {conta.emissao && <p><strong className="text-dark-300">Emissão:</strong> {formatDate(conta.emissao)}</p>}
                        {conta.categoria && <p><strong className="text-dark-300">Categoria:</strong> {conta.categoria}</p>}
                        {conta.descricao && <p><strong className="text-dark-300">Obs:</strong> {conta.descricao}</p>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ============================================================== */}
      {/* ABA BUSCA VENDAS */}
      {/* ============================================================== */}
      {tab === 'vendas' && (
        <>
          <div className="p-4 border-b border-dark-700 bg-dark-900/30">
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <label className="text-xs text-dark-400 font-medium mb-1 flex items-center gap-1">
                  <Calendar size={12} /> Data Início
                </label>
                <input
                  type="date"
                  value={dtIni}
                  onChange={(e) => setDtIni(e.target.value)}
                  className="bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-blue-500/50 outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-dark-400 font-medium mb-1 flex items-center gap-1">
                  <Calendar size={12} /> Data Fim
                </label>
                <input
                  type="date"
                  value={dtFim}
                  onChange={(e) => setDtFim(e.target.value)}
                  className="bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-blue-500/50 outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-dark-400 font-medium mb-1 block">Pesquisar Data por:</label>
                <select
                  value={tipoPeriodoVendas}
                  onChange={(e) => setTipoPeriodoVendas(e.target.value as any)}
                  className="bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-blue-500/50 outline-none"
                >
                  <option value="encerramento">Data de Encerramento</option>
                  <option value="conclusao">Data de Conclusão</option>
                  <option value="criacao">Data de Criação</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-dark-400 font-medium mb-1 block">Situação OS:</label>
                <select
                  value={filtroSituacao}
                  onChange={(e) => setFiltroSituacao(e.target.value as any)}
                  className="bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-blue-500/50 outline-none"
                >
                  <option value="todas">Todas</option>
                  <option value="em_andamento">Em Andamento</option>
                  <option value="concluida">Concluída</option>
                  <option value="encerrada">Encerrada</option>
                  <option value="cancelada">Cancelada</option>
                </select>
              </div>
              <button
                onClick={handleBuscarVendas}
                disabled={buscando}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm transition-all text-white ${
                  buscando ? 'bg-dark-700 text-dark-500' : 'bg-blue-600 hover:bg-blue-500'
                }`}
              >
                {buscando ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                {buscando ? 'Buscando...' : 'Buscar OS'}
              </button>
            </div>
          </div>

          {!vendasMeta && !buscando && (
            <div className="p-12 text-center">
              <ShoppingCart size={40} className="text-dark-700 mx-auto mb-3" />
              <p className="text-dark-500 text-sm">Selecione o período e filtros, depois clique em &quot;Buscar OS&quot;</p>
            </div>
          )}

          {buscando && (
            <div className="p-12 text-center">
              <Loader2 size={32} className="text-blue-400 animate-spin mx-auto mb-3" />
              <p className="text-dark-400 text-sm">Buscando dados no Datacar...</p>
            </div>
          )}

          {vendasMeta && !buscando && (
            <div>
              <div className="flex items-center gap-4 p-4 bg-dark-900/20 border-b border-dark-700 flex-wrap">
                <div className="flex items-center gap-2 text-sm">
                  <Download size={14} className="text-blue-400" />
                  <span className="text-dark-300">
                    <strong className="text-white">{vendasParaExibir?.length}</strong> OS filtradas (de {vendasMeta.total})
                  </span>
                </div>
                <span className="ml-auto text-white font-bold text-sm">
                  Total da Seleção: {formatCurrency((vendasParaExibir || []).reduce((s, v) => s + v.valor_total, 0))}
                </span>
              </div>

              <div className="p-4 bg-blue-900/10 border-b border-dark-700 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-dark-300 font-medium">Exportar (Tipos de item):</span>
                  <select
                    value={filtroVendas}
                    onChange={(e) => setFiltroVendas(e.target.value as any)}
                    className="bg-dark-900 border border-dark-600 rounded-lg px-3 py-1.5 text-white text-sm focus:ring-2 focus:ring-blue-500/50 outline-none"
                  >
                    <option value="tudo">Produtos e Serviços</option>
                    <option value="produtos">Apenas Produtos (Peças)</option>
                    <option value="servicos">Apenas Serviços</option>
                  </select>
                </div>
                <button
                  onClick={handleSalvarRevisao}
                  disabled={salvandoRevisao || (vendasParaExibir?.length === 0)}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-5 py-2 rounded-lg text-sm font-bold text-white transition-all flex items-center gap-2 shadow-lg"
                >
                  {salvandoRevisao ? <Loader2 size={16} className="animate-spin" /> : <ClipboardList size={16} />}
                  Salvar OS para Revisão ({vendasParaExibir?.length || 0})
                </button>
              </div>

              <div className="max-h-[500px] overflow-y-auto">
                {(vendasParaExibir || []).map((venda, i) => (
                  <div key={i} className={`border-b border-dark-700/50 hover:bg-dark-700/20 transition-colors ${
                    !venda.valido ? 'bg-red-500/5' : ''
                  }`}>
                    <div
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                      onClick={() => setExpandido(expandido === `v_${i}` ? null : `v_${i}`)}
                    >
                      {venda.valido
                        ? <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />
                        : <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
                      }
                      <span className="text-dark-500 text-xs font-mono w-14">#{venda.os_numero}</span>
                      
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                        venda.situacao === 'cancelada' ? 'border-red-500 text-red-500' :
                        venda.situacao === 'encerrada' ? 'border-emerald-500 text-emerald-500' :
                        venda.situacao === 'concluida' ? 'border-blue-500 text-blue-500' :
                        'border-yellow-500 text-yellow-500'
                      }`}>
                        {venda.situacao?.toUpperCase()}
                      </span>
                      
                      <span className="text-white text-sm font-medium flex-1 truncate">{venda.cliente}</span>
                      <span className="text-white text-sm font-bold tabular-nums">{formatCurrency(venda.valor_total)}</span>
                      <span className="text-dark-400 text-xs tabular-nums w-24 text-right">{formatDate(venda.data_venda)}</span>
                      {expandido === `v_${i}` ? <ChevronUp size={14} className="text-dark-500" /> : <ChevronDown size={14} className="text-dark-500" />}
                    </div>
                    {expandido === `v_${i}` && (
                      <div className="px-4 pb-3 pt-0 text-xs text-dark-400 space-y-1 animate-fade-in border-t border-dark-700/30 mx-4">
                        {venda.erros && venda.erros.length > 0 && (
                          <div className="mb-2 p-2 bg-red-500/10 border border-red-500/20 rounded-md text-red-400">
                            <strong>Erros:</strong> {venda.erros.join(', ')}
                          </div>
                        )}
                        {venda._datacar?.vendedor ? <p><strong className="text-dark-300">Vendedor:</strong> {String(venda._datacar.vendedor)}</p> : null}
                        {venda._datacar?.veiculo ? <p><strong className="text-dark-300">Veículo:</strong> {String(venda._datacar.veiculo)}</p> : null}
                        {venda._datacar?.cliente_cpf_cnpj ? <p><strong className="text-dark-300">CPF/CNPJ:</strong> {String(venda._datacar.cliente_cpf_cnpj)}</p> : null}
                        {venda.forma_pagamento && <p><strong className="text-dark-300">Pagamento:</strong> {venda.forma_pagamento}</p>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ============================================================== */}
      {/* ABA REVISÃO */}
      {/* ============================================================== */}
      {tab === 'revisao' && (
        <>
          <div className="p-4 bg-indigo-900/10 border-b border-dark-700 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <ClipboardList size={20} className="text-indigo-400" />
              <div>
                <h3 className="text-white font-medium text-sm">Painel de Revisão</h3>
                <p className="text-dark-400 text-xs">Vendas extraídas aguardando envio para o Conta Azul</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleBuscarRevisao}
                disabled={buscandoRevisao}
                className="text-dark-400 hover:text-white p-2"
                title="Atualizar lista"
              >
                <RefreshCw size={16} className={buscandoRevisao ? 'animate-spin' : ''} />
              </button>
              <button
                onClick={handleEnviarContaAzul}
                disabled={enviandoRevisao || revisaoResultado.filter(r => r.status === 'aprovado' || r.status === 'erro').length === 0}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-5 py-2.5 rounded-lg text-sm font-bold text-white transition-all flex items-center gap-2 shadow-lg"
              >
                {enviandoRevisao ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                Enviar Aprovados para CA
              </button>
            </div>
          </div>

          {buscandoRevisao ? (
            <div className="p-12 text-center">
              <Loader2 size={32} className="text-indigo-400 animate-spin mx-auto mb-3" />
              <p className="text-dark-400 text-sm">Carregando OS em revisão...</p>
            </div>
          ) : revisaoResultado.length === 0 ? (
            <div className="p-12 text-center">
              <CheckCircle2 size={40} className="text-emerald-500/50 mx-auto mb-3" />
              <p className="text-dark-400 text-sm">Nenhuma OS pendente de revisão.</p>
              <p className="text-dark-500 text-xs mt-1">Busque no Datacar e clique em &quot;Salvar OS para Revisão&quot;.</p>
            </div>
          ) : (
            <div className="max-h-[600px] overflow-y-auto bg-dark-900/20">
              {revisaoResultado.map((venda) => (
                <div key={venda.id} className="border-b border-dark-700 p-4 hover:bg-dark-800/50 transition-colors">
                  <div className="flex flex-wrap items-center gap-4">
                    
                    {/* Status Badge */}
                    <div className="w-28 shrink-0">
                      <select 
                        value={venda.status}
                        onChange={(e) => handleAprovarRevisao(venda.id, e.target.value as any)}
                        disabled={venda.status === 'concluido'}
                        className={`w-full text-xs font-bold rounded px-2 py-1.5 outline-none cursor-pointer border ${
                          venda.status === 'pendente' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' :
                          venda.status === 'aprovado' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                          venda.status === 'concluido' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' :
                          venda.status === 'erro' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                          'bg-dark-700 text-dark-300 border-dark-600'
                        }`}
                      >
                        <option value="pendente">PENDENTE</option>
                        <option value="aprovado">APROVAR</option>
                        <option value="ignorado">IGNORAR</option>
                        {venda.status === 'concluido' && <option value="concluido">CONCLUÍDO</option>}
                        {venda.status === 'erro' && <option value="erro">ERRO</option>}
                      </select>
                    </div>

                    <div className="flex-1 min-w-[200px]">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-dark-400 text-xs font-mono">#{venda.os_numero}</span>
                        <h4 className="text-white text-sm font-bold truncate">{venda.cliente}</h4>
                        {venda.cliente_cpf_cnpj && (
                          <span className="text-dark-500 text-[10px] px-1.5 py-0.5 bg-dark-700/50 rounded">
                            {venda.cliente_cpf_cnpj}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-dark-400">
                        <span>Data: {formatDate(venda.data_venda)}</span>
                        <span>Pgto: {venda.forma_pagamento || 'Não informado'}</span>
                        <span className="text-white font-medium ml-auto">
                          Total: {formatCurrency(venda.valor_total)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Erro de envio (se houver) */}
                  {venda.erro_envio && (
                    <div className="mt-3 p-2 bg-red-500/10 border border-red-500/20 rounded-lg flex gap-2">
                      <AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
                      <div className="text-xs text-red-300 leading-relaxed">
                        <strong>Erro ao enviar:</strong> {venda.erro_envio}
                      </div>
                    </div>
                  )}

                  {/* Detalhes de itens */}
                  <div className="mt-3">
                    <button 
                      onClick={() => setExpandido(expandido === `rev_${venda.id}` ? null : `rev_${venda.id}`)}
                      className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1"
                    >
                      {expandido === `rev_${venda.id}` ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      {venda.itens?.length || 0} itens faturados
                    </button>
                    
                    {expandido === `rev_${venda.id}` && (
                      <div className="mt-2 bg-dark-900/50 rounded-lg p-2 space-y-1">
                        {(venda.itens || []).map((item, idx) => (
                          <div key={idx} className="flex justify-between items-center text-[11px] px-2 py-1 border-b border-dark-800/50 last:border-0">
                            <div className="flex gap-2">
                              <span className="text-dark-500 w-8 text-right">{item.quantidade}x</span>
                              <span className="text-dark-300 truncate max-w-[200px]">{item.descricao}</span>
                            </div>
                            <span className="text-dark-400">{formatCurrency(item.valor_unitario)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
