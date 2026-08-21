'use client'

import { useEffect, useState } from 'react'
import { X, Tags, CheckCircle2, Loader2 } from 'lucide-react'
import SelectorCategoria from '@/components/upload/SelectorCategoria'
import SelectorContaFinanceira, { ContaFinanceiraOpcao } from '@/components/upload/SelectorContaFinanceira'

interface ModalEdicaoEmMassaProps {
  open: boolean
  onClose: () => void
  itens: any[]
  contas: ContaFinanceiraOpcao[]
  onConfirmar: (dados: { categoria?: string; competencia?: string; contaPagamento?: string; dataPagamento?: string }) => void
  salvando: boolean
}

export default function ModalEdicaoEmMassa({ open, onClose, itens, contas, onConfirmar, salvando }: ModalEdicaoEmMassaProps) {
  const [categoria, setCategoria] = useState('')
  const [editandoCategoria, setEditandoCategoria] = useState(false)
  const [competencia, setCompetencia] = useState('')
  const [dataPagamento, setDataPagamento] = useState('')
  const [contaPagamento, setContaPagamento] = useState('')
  const [editandoConta, setEditandoConta] = useState(false)

  useEffect(() => {
    if (open) {
      setCategoria('')
      setEditandoCategoria(false)
      setCompetencia('')
      setDataPagamento('')
      setContaPagamento('')
      setEditandoConta(false)
    }
  }, [open])

  if (!open) return null

  const podeConfirmar = !!(categoria || competencia || contaPagamento || dataPagamento)

  const handleConfirmar = () => {
    if (!podeConfirmar) return
    onConfirmar({
      categoria: categoria || undefined,
      competencia: competencia || undefined,
      contaPagamento: contaPagamento || undefined,
      dataPagamento: dataPagamento || undefined,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
      <div className="bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-md shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-dark-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center">
              <Tags size={18} className="text-blue-400" />
            </div>
            <div>
              <h3 className="text-white font-bold text-lg">Editar em massa</h3>
              <p className="text-dark-400 text-xs">{itens.length} lançamento(s) selecionado(s)</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800 transition-all">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-dark-400 uppercase">Categoria</label>
            {editandoCategoria ? (
              <SelectorCategoria
                valorInicial={categoria}
                onSelect={nome => { setCategoria(nome); setEditandoCategoria(false) }}
                onCancel={() => setEditandoCategoria(false)}
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditandoCategoria(true)}
                className="w-full text-left bg-dark-800 border border-dark-700 rounded-xl px-4 py-2.5 text-white text-sm hover:border-brand-500 transition-all truncate"
              >
                {categoria || <span className="text-dark-500">Clique para escolher...</span>}
              </button>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-dark-400 uppercase">Competência</label>
            <input
              type="date"
              value={competencia}
              onChange={e => setCompetencia(e.target.value)}
              className="w-full bg-dark-800 border border-dark-700 rounded-xl px-4 py-2.5 text-white text-sm focus:border-brand-500 outline-none transition-all"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-dark-400 uppercase">Data de Pagamento</label>
            <input
              type="date"
              value={dataPagamento}
              onChange={e => setDataPagamento(e.target.value)}
              className="w-full bg-dark-800 border border-dark-700 rounded-xl px-4 py-2.5 text-white text-sm focus:border-brand-500 outline-none transition-all"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-dark-400 uppercase">Conta de Pagamento</label>
            {editandoConta ? (
              <SelectorContaFinanceira
                valorInicial={contaPagamento}
                contas={contas}
                onSelect={nome => { setContaPagamento(nome); setEditandoConta(false) }}
                onCancel={() => setEditandoConta(false)}
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditandoConta(true)}
                className="w-full text-left bg-dark-800 border border-dark-700 rounded-xl px-4 py-2.5 text-white text-sm hover:border-brand-500 transition-all truncate"
              >
                {contaPagamento || <span className="text-dark-500">Clique para escolher...</span>}
              </button>
            )}
          </div>

          <p className="text-dark-500 text-xs">
            Só os campos preenchidos aqui são aplicados a todos os selecionados — deixe em branco o que não quiser mudar.
          </p>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-dark-700 flex justify-end gap-3 shrink-0 bg-dark-900 rounded-b-2xl">
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl font-semibold bg-dark-800 text-dark-300 hover:text-white hover:bg-dark-700 transition-all">
            Cancelar
          </button>
          <button
            onClick={handleConfirmar}
            disabled={!podeConfirmar || salvando}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/30 transition-all disabled:opacity-50"
          >
            {salvando ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            {salvando ? 'Salvando...' : `Aplicar a ${itens.length} lançamento(s)`}
          </button>
        </div>
      </div>
    </div>
  )
}
