'use client'

import { useState } from 'react'
import {
  Search, Loader2, FileText, ShoppingCart, Calendar,
  Download, AlertCircle, CheckCircle2, ChevronDown, ChevronUp
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
  itens: { codigo: string; descricao: string; quantidade: number; valor_unitario: number }[]
  valido: boolean
  erros?: string[]
  _datacar?: Record<string, unknown>
}

export default function PainelSincronizacao({ empresa }: Props) {
  const hoje = new Date().toISOString().split('T')[0]
  const primeiroDia = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]

  const [tab, setTab] = useState<'contas' | 'vendas'>('contas')
  const [dtIni, setDtIni] = useState(primeiroDia)
  const [dtFim, setDtFim] = useState(hoje)
  const [buscando, setBuscando] = useState(false)

  // Contas a Pagar
  const [contasResultado, setContasResultado] = useState<ContaPagarResult[] | null>(null)
  const [contasMeta, setContasMeta] = useState<{ total: number; validos: number; invalidos: number } | null>(null)

  // Vendas
  const [vendasResultado, setVendasResultado] = useState<VendaResult[] | null>(null)
  const [vendasMeta, setVendasMeta] = useState<{ total: number; validos: number; invalidos: number } | null>(null)

  // Expandir detalhes
  const [expandido, setExpandido] = useState<number | null>(null)

  const temCredenciais = !!empresa.datacar_token && !!empresa.datacar_cod_emp && !!empresa.datacar_id_operador

  const handleBuscarContas = async () => {
    setBuscando(true)
    setContasResultado(null)
    setContasMeta(null)
    try {
      const res = await fetch('/api/datacar/buscar-contas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresa_id: empresa.id, dtIni, dtFim, tipoPeriodo: 'venc' }),
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
        body: JSON.stringify({ empresa_id: empresa.id, dtIni, dtFim, tipoPeriodo: 'encerramento' }),
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
    <div className="bg-dark-800 border border-dark-700 rounded-xl overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-dark-700">
        <button
          onClick={() => { setTab('contas'); setExpandido(null) }}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold transition-all ${
            tab === 'contas'
              ? 'bg-dark-700/50 text-orange-400 border-b-2 border-orange-400'
              : 'text-dark-400 hover:text-white hover:bg-dark-700/30'
          }`}
        >
          <FileText size={16} /> Contas a Pagar
          {contasMeta && <span className="text-[10px] bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full">{contasMeta.total}</span>}
        </button>
        <button
          onClick={() => { setTab('vendas'); setExpandido(null) }}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold transition-all ${
            tab === 'vendas'
              ? 'bg-dark-700/50 text-blue-400 border-b-2 border-blue-400'
              : 'text-dark-400 hover:text-white hover:bg-dark-700/30'
          }`}
        >
          <ShoppingCart size={16} /> Vendas (OS/Pedidos)
          {vendasMeta && <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">{vendasMeta.total}</span>}
        </button>
      </div>

      {/* Filtros */}
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
          <button
            onClick={tab === 'contas' ? handleBuscarContas : handleBuscarVendas}
            disabled={buscando}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm transition-all text-white ${
              buscando ? 'bg-dark-700 text-dark-500' :
              tab === 'contas' ? 'bg-orange-600 hover:bg-orange-500' : 'bg-blue-600 hover:bg-blue-500'
            }`}
          >
            {buscando ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            {buscando ? 'Buscando no Datacar...' : `Buscar ${tab === 'contas' ? 'Contas a Pagar' : 'Vendas'}`}
          </button>
        </div>
      </div>

      {/* Resultados Contas a Pagar */}
      {tab === 'contas' && contasMeta && (
        <div>
          {/* Resumo */}
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

          {/* Lista */}
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
                    {conta._datacar?.cnpjEmit ? <p><strong className="text-dark-300">CNPJ Emissor:</strong> {String(conta._datacar.cnpjEmit)}</p> : null}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Resultados Vendas */}
      {tab === 'vendas' && vendasMeta && (
        <div>
          {/* Resumo */}
          <div className="flex items-center gap-4 p-4 bg-dark-900/20 border-b border-dark-700">
            <div className="flex items-center gap-2 text-sm">
              <Download size={14} className="text-blue-400" />
              <span className="text-dark-300">
                <strong className="text-white">{vendasMeta.total}</strong> OS/Pedidos encontrados
              </span>
            </div>
            <span className="text-emerald-400 text-xs font-semibold">{vendasMeta.validos} válidos</span>
            {vendasMeta.invalidos > 0 && (
              <span className="text-red-400 text-xs font-semibold">{vendasMeta.invalidos} com problemas</span>
            )}
            <span className="ml-auto text-white font-bold text-sm">
              Total: {formatCurrency((vendasResultado || []).reduce((s, v) => s + v.valor_total, 0))}
            </span>
          </div>

          {/* Lista */}
          <div className="max-h-[500px] overflow-y-auto">
            {(vendasResultado || []).map((venda, i) => (
              <div key={i} className={`border-b border-dark-700/50 hover:bg-dark-700/20 transition-colors ${
                !venda.valido ? 'bg-red-500/5' : ''
              }`}>
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                  onClick={() => setExpandido(expandido === i ? null : i)}
                >
                  {venda.valido
                    ? <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />
                    : <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
                  }
                  <span className="text-dark-500 text-xs font-mono w-14">#{venda.os_numero}</span>
                  <span className="text-white text-sm font-medium flex-1 truncate">{venda.cliente}</span>
                  <span className="text-white text-sm font-bold tabular-nums">{formatCurrency(venda.valor_total)}</span>
                  <span className="text-dark-400 text-xs tabular-nums w-24 text-right">{formatDate(venda.data_venda)}</span>
                  {expandido === i ? <ChevronUp size={14} className="text-dark-500" /> : <ChevronDown size={14} className="text-dark-500" />}
                </div>
                {expandido === i && (
                  <div className="px-4 pb-3 pt-0 text-xs text-dark-400 space-y-1 animate-fade-in border-t border-dark-700/30 mx-4">
                    {venda._datacar?.vendedor ? <p><strong className="text-dark-300">Vendedor:</strong> {String(venda._datacar.vendedor)}</p> : null}
                    {venda._datacar?.veiculo ? <p><strong className="text-dark-300">Veículo:</strong> {String(venda._datacar.veiculo)}</p> : null}
                    {venda._datacar?.cliente_cpf_cnpj ? <p><strong className="text-dark-300">CPF/CNPJ:</strong> {String(venda._datacar.cliente_cpf_cnpj)}</p> : null}
                    {venda.forma_pagamento && <p><strong className="text-dark-300">Pagamento:</strong> {venda.forma_pagamento}</p>}
                    {venda.itens.length > 0 && (
                      <div className="mt-2">
                        <p className="text-dark-300 font-semibold mb-1">Itens ({venda.itens.length}):</p>
                        <div className="bg-dark-900/60 rounded-lg p-2 space-y-1 max-h-32 overflow-y-auto">
                          {venda.itens.map((item, j) => (
                            <div key={j} className="flex items-center gap-2 text-[11px]">
                              <span className="text-dark-500 w-8 text-right">{item.quantidade}x</span>
                              <span className="text-dark-300 flex-1 truncate">{item.descricao}</span>
                              <span className="text-white tabular-nums">{formatCurrency(item.valor_unitario)}</span>
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
        </div>
      )}

      {/* Empty state */}
      {tab === 'contas' && !contasMeta && !buscando && (
        <div className="p-12 text-center">
          <FileText size={40} className="text-dark-700 mx-auto mb-3" />
          <p className="text-dark-500 text-sm">Selecione o período e clique em &quot;Buscar Contas a Pagar&quot;</p>
        </div>
      )}
      {tab === 'vendas' && !vendasMeta && !buscando && (
        <div className="p-12 text-center">
          <ShoppingCart size={40} className="text-dark-700 mx-auto mb-3" />
          <p className="text-dark-500 text-sm">Selecione o período e clique em &quot;Buscar Vendas&quot;</p>
        </div>
      )}

      {/* Loading state */}
      {buscando && (
        <div className="p-12 text-center">
          <Loader2 size={32} className="text-orange-400 animate-spin mx-auto mb-3" />
          <p className="text-dark-400 text-sm">Buscando dados do Datacar...</p>
          <p className="text-dark-600 text-xs mt-1">Isso pode levar alguns segundos</p>
        </div>
      )}
    </div>
  )
}
