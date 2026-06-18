'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ContaPagarImportada } from '@/types'
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

export default function TabelaContas({ empresaId }: Props) {
  const [contas, setContas] = useState<ContaPagarImportada[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<string>('pendente')
  const supabase = createClient()

  const carregar = useCallback(async () => {
    if (!empresaId) { setLoading(false); return }
    setLoading(true)
    try {
      let query = supabase
        .from('contas_pagar_importadas')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: false }) // Mais recentes primeiro

      if (filtro !== 'todos') {
        query = query.eq('status', filtro)
      }

      const { data, error } = await query
      if (error) throw error
      setContas(data || [])
    } finally {
      setLoading(false)
    }
  }, [empresaId, filtro, supabase])

  useEffect(() => { carregar() }, [carregar])

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

  const totalPendente = contas.filter((c) => c.status === 'pendente').reduce((s, c) => s + Number(c.valor), 0)
  const totalEnviado = contas.filter((c) => c.status === 'enviado').reduce((s, c) => s + Number(c.valor), 0)

  return (
    <div className="space-y-4">
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

      {/* Filtros e Ações em Lote */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {['pendente', 'enviado', 'erro'].map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-all capitalize',
                filtro === f
                  ? 'bg-brand-600 text-white'
                  : 'bg-dark-800 text-dark-400 hover:text-white hover:bg-dark-700'
              )}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        
        <div className="flex items-center gap-2">
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
        <div className="bg-dark-800 border border-dark-700 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table-bpo">
              <thead>
                <tr>
                  <th>Fornecedor</th>
                  <th className="text-right">Valor</th>
                  <th>Vencimento</th>
                  <th>Competência</th>
                  <th>Categoria</th>
                  <th>Conta</th>
                  <th>Descrição</th>
                  <th className="text-center">Status</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {contas.map((conta) => {
                  const cfg = STATUS_CONFIG[conta.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.pendente
                  const Icon = cfg.icon
                  return (
                    <tr key={conta.id}>
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
                      <td>
                        <span className="text-dark-400 text-xs px-2 py-0.5 rounded-full bg-brand-400/10 text-brand-400 border border-brand-400/20">
                          {conta.categoria || 'Materiais para Revenda'}
                        </span>
                      </td>
                      <td>
                        <span className="text-blue-400 text-xs px-2 py-0.5 rounded-full bg-blue-400/10 border border-blue-400/20">
                          {conta.conta_financeira || '-'}
                        </span>
                      </td>
                      <td>
                        <span className="text-dark-400 text-xs truncate max-w-[180px] block">
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
                        <button
                          onClick={() => removerConta(conta.id)}
                          className="text-dark-500 hover:text-red-400 transition-colors p-1"
                          title="Excluir"
                        >
                          <Trash2 size={14} />
                        </button>
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

