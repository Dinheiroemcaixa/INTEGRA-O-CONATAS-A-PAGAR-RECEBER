'use client'

import { useState, useRef, useEffect } from 'react'
import { Search, X, Landmark } from 'lucide-react'

export interface ContaFinanceiraOpcao {
  id: string
  descricao: string
}

interface Props {
  valorInicial: string
  contas: ContaFinanceiraOpcao[]
  onSelect: (nome: string, id: string) => void
  onCancel: () => void
}

export default function SelectorContaFinanceira({ valorInicial, contas, onSelect, onCancel }: Props) {
  const [busca, setBusca] = useState(valorInicial || '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const filtrados = contas.filter(c =>
    c.descricao.toLowerCase().includes(busca.toLowerCase())
  )

  return (
    <div className="relative w-full min-w-[200px]">
      <div className="flex items-center gap-2 bg-dark-700 border border-blue-500/50 rounded-lg px-2 py-1 shadow-lg shadow-blue-900/20">
        <Landmark size={14} className="text-blue-400" />
        <input
          ref={inputRef}
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onCancel()
            if (e.key === 'Enter' && filtrados.length > 0) {
              onSelect(filtrados[0].descricao, filtrados[0].id)
            }
          }}
          placeholder="Buscar conta..."
          className="bg-transparent border-none outline-none text-white text-xs w-full"
        />
        <button onClick={onCancel} className="text-dark-500 hover:text-white">
          <X size={14} />
        </button>
      </div>

      <div className="absolute z-50 mt-1 w-full bg-dark-800 border border-dark-600 rounded-lg shadow-2xl overflow-hidden max-h-[200px] overflow-y-auto">
        {filtrados.length === 0 && (
          <div className="p-3 text-[10px] text-dark-500 italic text-center">
            Nenhuma conta encontrada
          </div>
        )}
        {filtrados.map((conta) => (
          <button
            key={conta.id}
            onClick={() => onSelect(conta.descricao, conta.id)}
            className="w-full text-left px-3 py-1.5 text-xs text-white hover:bg-blue-600/20 hover:text-blue-400 transition-colors border-b border-dark-700 last:border-none"
          >
            {conta.descricao}
          </button>
        ))}
        {busca && !filtrados.some(c => c.descricao.toLowerCase() === busca.toLowerCase()) && (
          <button
            onClick={() => onSelect(busca, '')}
            className="w-full text-left px-3 py-1.5 text-[10px] text-dark-400 bg-dark-900 hover:bg-dark-700 italic border-t border-dark-600"
          >
            Usar "{busca}"
          </button>
        )}
      </div>
    </div>
  )
}
