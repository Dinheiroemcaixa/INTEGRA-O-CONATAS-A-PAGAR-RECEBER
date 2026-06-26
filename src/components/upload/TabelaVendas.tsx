'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { VendaImportada } from '@/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import { CheckCircle, Clock, AlertCircle, RefreshCw, Loader2, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'

interface Props {
  empresaId?: string
}

const STATUS_CONFIG = {
  pendente: { label: 'Pendente', icon: Clock, color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
  enviado: { label: 'Enviado', icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-400/10' },
  erro: { label: 'Erro', icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-400/10' },
  cancelado: { label: 'Cancelado', icon: AlertCircle, color: 'text-dark-500', bg: 'bg-dark-700' },
}

export default function TabelaVendas({ empresaId }: Props) {
  const [vendas, setVendas] = useState<VendaImportada[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<string>('pendente')
  const supabase = createClient()

  const carregar = useCallback(async () => {
    if (!empresaId) { setLoading(false); return }
    setLoading(true)
    try {
      let query = supabase
        .from('vendas_importadas')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: false }) // Mais recentes primeiro

      if (filtro !== 'todos') {
        query = query.eq('status', filtro)
      }

      const { data, error } = await query
      if (error) throw error
      setVendas(data || [])
    } finally {
      setLoading(false)
    }
  }, [empresaId, filtro, supabase])

  useEffect(() => { carregar() }, [carregar])

  const removerVenda = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este registro?')) return
    try {
      const { error } = await supabase
        .from('vendas_importadas')
        .delete()
        .eq('id', id)
      
      if (error) throw error
      toast.success('Registro excluído')
      carregar()
    } catch (err) {
      toast.error('Erro ao excluir')
    }
  }

  const limparTudo = async () => {
    if (!confirm('Deseja excluir TODAS as vendas PENDENTES desta empresa?')) return
    try {
      const { error } = await supabase
        .from('vendas_importadas')
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

  const totalPendente = vendas.filter((v) => v.status === 'pendente').reduce((s, v) => s + Number(v.valor_total), 0)
  const totalEnviado = vendas.filter((v) => v.status === 'enviado').reduce((s, v) => s + Number(v.valor_total), 0)

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Resumo rápido */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-dark-800 border border-yellow-500/20 rounded-xl p-4">
          <p className="text-xs text-dark-400 mb-1">Total Pendente</p>
          <p className="text-yellow-400 text-xl font-bold">{formatCurrency(totalPendente)}</p>
        </div>
        <div className="bg-dark-800 border border-green-500/20 rounded-xl p-4">
          <p className="text-xs text-dark-400 mb-1">Total Enviado</p>
          <p className="text-green-400 text-xl font-bold">{formatCurrency(totalEnviado)}</p>
        </div>
      </div>

      {/* Controles */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {['todos', 'pendente', 'enviado', 'erro'].map(f => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize",
                filtro === f 
                  ? "bg-brand-600 text-white"
                  : "bg-dark-800 text-dark-400 hover:text-white hover:bg-dark-700"
              )}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <button 
            onClick={carregar}
            className="flex items-center gap-1.5 text-dark-400 hover:text-white text-sm px-3 py-1.5 rounded-lg hover:bg-dark-800 transition-all"
            title="Atualizar lista"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Atualizar
          </button>
          
          <button
            onClick={limparTudo}
            className="flex items-center gap-1.5 text-red-400 hover:text-red-300 hover:bg-red-400/10 text-xs px-3 py-1.5 rounded-lg transition-all"
          >
            <Trash2 size={14} />
            Limpar Pendentes
          </button>
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-dark-800 border border-dark-700 rounded-xl overflow-hidden relative">
        {loading && (
          <div className="absolute inset-0 bg-dark-900/50 backdrop-blur-sm z-10 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-dark-900/50 text-dark-400 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">OS/Pedido</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium text-right">Valor Total</th>
                <th className="px-4 py-3 font-medium text-right">Data</th>
                <th className="px-4 py-3 font-medium text-center">Itens</th>
                <th className="px-4 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-700/50 text-dark-300">
              {vendas.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-dark-500">
                    Nenhuma venda encontrada para este filtro.
                  </td>
                </tr>
              ) : (
                vendas.map((v) => {
                  const cfg = STATUS_CONFIG[v.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.pendente
                  const Icon = cfg.icon
                  return (
                    <tr key={v.id} className="hover:bg-dark-700/20 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span className={cn("inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold w-max uppercase tracking-wide", cfg.color, cfg.bg)}>
                            <Icon size={12} />
                            {cfg.label}
                          </span>
                          {v.erro_mensagem && (
                            <span className="text-[10px] text-red-400 max-w-[150px] truncate" title={v.erro_mensagem}>
                              {v.erro_mensagem}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-dark-300">
                        #{v.os_numero}
                      </td>
                      <td className="px-4 py-3 font-medium text-white max-w-[200px] truncate" title={v.cliente}>
                        {v.cliente}
                      </td>
                      <td className="px-4 py-3 font-bold text-white text-right tabular-nums">
                        {formatCurrency(Number(v.valor_total))}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-dark-400">
                        {formatDate(v.data_venda)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="px-2 py-1 bg-dark-700 rounded text-xs">
                          {(v.itens || []).length} itens
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => removerVenda(v.id)}
                          className="p-2 text-dark-500 hover:text-red-400 hover:bg-dark-700 rounded-lg transition-colors"
                          title="Excluir"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
