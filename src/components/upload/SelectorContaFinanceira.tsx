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

const BANCOS_PADRAO: ContaFinanceiraOpcao[] = [
  { id: '', descricao: 'Conta Corrente Principal' },
  { id: '', descricao: 'Itaú Unibanco' },
  { id: '', descricao: 'Bradesco' },
  { id: '', descricao: 'Banco do Brasil' },
  { id: '', descricao: 'Santander' },
  { id: '', descricao: 'Caixa Econômica Federal' },
  { id: '', descricao: 'Nubank' },
  { id: '', descricao: 'Banco Inter' },
  { id: '', descricao: 'Sicoob' },
  { id: '', descricao: 'Sicredi' },
  { id: '', descricao: 'C6 Bank' },
  { id: '', descricao: 'Banco Safra' },
  { id: '', descricao: 'BTG Pactual' },
  { id: '', descricao: 'Caixa Geral / Dinheiro' },
]

export default function SelectorContaFinanceira({ valorInicial, contas, onSelect, onCancel }: Props) {
  const [busca, setBusca] = useState(valorInicial || '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const listaDisponivel = contas && contas.length > 0 ? contas : BANCOS_PADRAO

  const filtrados = listaDisponivel.filter(c =>
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
            if (e.key === 'Enter') {
              if (filtrados.length > 0) {
                onSelect(filtrados[0].descricao, filtrados[0].id)
              } else if (busca.trim()) {
                onSelect(busca.trim(), '')
              }
            }
          }}
          placeholder="Buscar ou digitar banco..."
          className="bg-transparent border-none outline-none text-white text-xs w-full"
        />
        <button onClick={onCancel} className="text-dark-500 hover:text-white">
          <X size={14} />
        </button>
      </div>

      <div className="absolute z-50 mt-1 w-full bg-dark-800 border border-dark-600 rounded-lg shadow-2xl overflow-hidden max-h-[220px] overflow-y-auto">
        {filtrados.length === 0 && (
          <div className="p-3 text-[10px] text-dark-500 italic text-center">
            Nenhum banco encontrado nas opções padrão.
          </div>
        )}
        {filtrados.map((conta, idx) => (
          <button
            key={conta.id || idx}
            onClick={() => onSelect(conta.descricao, conta.id)}
            className="w-full text-left px-3 py-1.5 text-xs text-white hover:bg-blue-600/20 hover:text-blue-400 transition-colors border-b border-dark-700 last:border-none flex items-center justify-between"
          >
            <span>{conta.descricao}</span>
            {conta.id && <span className="text-[9px] text-blue-400/80 bg-blue-500/10 px-1.5 py-0.5 rounded">Conta Azul</span>}
          </button>
        ))}
        {busca && !filtrados.some(c => c.descricao.toLowerCase() === busca.toLowerCase()) && (
          <button
            onClick={() => onSelect(busca.trim(), '')}
            className="w-full text-left px-3 py-2 text-xs text-blue-400 bg-blue-950/40 hover:bg-blue-900/60 font-semibold border-t border-dark-600 flex items-center gap-1.5"
          >
            <span>Usar personalizada: "{busca}"</span>
          </button>
        )}
      </div>
    </div>
  )
}
