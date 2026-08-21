'use client'

import { useEffect, useState } from 'react'
import { X, ArrowRightLeft, CheckCircle2, Loader2 } from 'lucide-react'
import { Empresa } from '@/types'

interface ModalTransferirLancamentoProps {
  open: boolean
  onClose: () => void
  itens: any[]
  empresaAtual: Empresa | null
  empresasDestino: Empresa[]
  onConfirmar: (destinoId: string) => void
  transferindo: boolean
}

export default function ModalTransferirLancamento({
  open, onClose, itens, empresaAtual, empresasDestino, onConfirmar, transferindo
}: ModalTransferirLancamentoProps) {
  const [destino, setDestino] = useState('')

  useEffect(() => {
    if (open) setDestino('')
  }, [open])

  if (!open) return null

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

  const total = itens.reduce((acc, i) => acc + (Number(i.valor) || 0), 0)

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
      <div className="bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-dark-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
              <ArrowRightLeft size={18} className="text-emerald-400" />
            </div>
            <div>
              <h3 className="text-white font-bold text-lg">Transferir para outra loja</h3>
              <p className="text-dark-400 text-xs">
                {itens.length} lançamento(s) de {empresaAtual?.nome} — {formatCurrency(total)}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800 transition-all">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="max-h-40 overflow-y-auto space-y-1.5 bg-dark-800/50 border border-dark-700 rounded-xl p-3">
            {itens.map((item, idx) => (
              <div key={item.id || idx} className="flex items-center justify-between text-sm gap-3">
                <span className="text-dark-200 truncate">{item.fornecedor || item.beneficiario || '—'}</span>
                <span className="text-dark-400 font-semibold shrink-0">{formatCurrency(Number(item.valor) || 0)}</span>
              </div>
            ))}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-dark-400 uppercase">Transferir para <span className="text-rose-400">*</span></label>
            <select
              value={destino}
              onChange={e => setDestino(e.target.value)}
              className="w-full bg-dark-800 border border-dark-700 rounded-xl px-4 py-2.5 text-white text-sm focus:border-brand-500 outline-none transition-all"
            >
              <option value="" disabled>Selecione a loja de destino...</option>
              {empresasDestino.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.nome}</option>
              ))}
            </select>
          </div>

          <p className="text-dark-500 text-xs">
            O(s) lançamento(s) sai(em) daqui e passa(m) a pertencer à loja de destino — não fica nada duplicado na loja de origem.
          </p>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-dark-700 flex justify-end gap-3 shrink-0 bg-dark-900 rounded-b-2xl">
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl font-semibold bg-dark-800 text-dark-300 hover:text-white hover:bg-dark-700 transition-all">
            Cancelar
          </button>
          <button
            onClick={() => destino && onConfirmar(destino)}
            disabled={!destino || transferindo}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30 transition-all disabled:opacity-50"
          >
            {transferindo ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            {transferindo ? 'Transferindo...' : 'Confirmar Transferência'}
          </button>
        </div>
      </div>
    </div>
  )
}
