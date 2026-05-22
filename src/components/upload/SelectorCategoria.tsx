'use client'

import { useState, useEffect, useRef } from 'react'
import { Search, X, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LISTA_CATEGORIAS_FLAT } from '@/lib/conta-azul/constants'

interface Props {
  valorInicial: string
  onSelect: (nome: string) => void
  onCancel: () => void
}

export default function SelectorCategoria({ valorInicial, onSelect, onCancel }: Props) {
  const [busca, setBusca] = useState(valorInicial === 'Materiais para Revenda' ? '' : valorInicial)
  const [resultados, setResultados] = useState<string[]>([])
  const [aberto, setAberto] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const termo = busca.toLowerCase()
    const filtrados = LISTA_CATEGORIAS_FLAT.filter(cat => 
      cat.toLowerCase().includes(termo)
    ).slice(0, 15)
    
    setResultados(filtrados)
  }, [busca])

  return (
    <div className="relative w-full min-w-[220px]">
      <div className="flex items-center gap-2 bg-dark-700 border border-brand-500/50 rounded-lg px-2 py-1 shadow-lg shadow-brand-900/20">
        <Search size={14} className="text-brand-400" />
        <input
          ref={inputRef}
          type="text"
          value={busca}
          onChange={(e) => { setBusca(e.target.value); setAberto(true) }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onCancel()
            if (e.key === 'Enter' && resultados.length > 0) {
              onSelect(resultados[0])
            }
          }}
          placeholder="Buscar categoria..."
          className="bg-transparent border-none outline-none text-white text-xs w-full"
        />
        <button onClick={onCancel} className="text-dark-500 hover:text-white">
          <X size={14} />
        </button>
      </div>

      {aberto && (
        <div className="absolute z-50 mt-1 w-full bg-dark-800 border border-dark-600 rounded-lg shadow-2xl overflow-hidden max-h-[250px] overflow-y-auto">
          {resultados.length === 0 && busca.length > 0 && (
            <div className="p-3 text-[10px] text-dark-500 italic text-center">
              Nenhuma categoria encontrada na lista padrão
            </div>
          )}
          
          {resultados.map((cat, i) => (
            <button
              key={i}
              onClick={() => onSelect(cat)}
              className="w-full text-left px-3 py-1.5 text-xs text-white hover:bg-brand-600/20 hover:text-brand-400 transition-colors border-b border-dark-700 last:border-none"
            >
              {cat}
            </button>
          ))}

          {busca.length > 0 && !resultados.includes(busca) && (
            <button
              onClick={() => onSelect(busca)}
              className="w-full text-left px-3 py-1.5 text-[10px] text-dark-400 bg-dark-900 hover:bg-dark-700 italic border-t border-dark-600"
            >
              Usar personalizada: "{busca}"
            </button>
          )}

          {busca.length === 0 && resultados.length === 0 && (
            <div className="p-3 text-[10px] text-dark-500 italic text-center">
              Digite para ver sugestões do DRE
            </div>
          )}
        </div>
      )}
    </div>
  )
}
