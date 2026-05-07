'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ContaPagarImportada } from '@/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import { CheckCircle, Clock, AlertCircle, RefreshCw, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

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
  const [filtro, setFiltro] = useState<string>('todos')
  const supabase = createClient()

  const carregar = useCallback(async () => {
    if (!empresaId) { setLoading(false); return }
    setLoading(true)
    try {
      let query = supabase
        .from('contas_pagar_importadas')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('vencimento', { ascending: true })

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

      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        {['todos', 'pendente', 'enviado', 'erro'].map((f) => (
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
            {f === 'todos' ? 'Todos' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <button
          onClick={carregar}
          className="ml-auto flex items-center gap-1.5 text-dark-400 hover:text-white text-sm px-3 py-1.5 rounded-lg hover:bg-dark-800 transition-all"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Atualizar
        </button>
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
            {filtro !== 'todos' ? `Não há contas com status "${filtro}"` : 'Faça upload de um arquivo para importar contas'}
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
                  <th>Descrição</th>
                  <th className="text-center">Status</th>
                  <th>ID Conta Azul</th>
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
                          <p className="text-red-400 text-[10px] mt-0.5 max-w-[150px] truncate" title={conta.erro_mensagem}>
                            {conta.erro_mensagem}
                          </p>
                        )}
                      </td>
                      <td>
                        <span className="text-dark-500 text-xs font-mono">
                          {conta.conta_azul_id || '-'}
                        </span>
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
