'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useEmpresa } from '@/contexts/EmpresaContext'
import { Search, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  valorInicial: string
  onSelect: (nome: string) => void
  onCancel: () => void
}

export default function SelectorFornecedor({ valorInicial, onSelect, onCancel }: Props) {
  const { empresaAtiva } = useEmpresa()
  const [busca, setBusca] = useState(valorInicial)
  const [resultados, setResultados] = useState<{ nome: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [aberto, setAberto] = useState(true)
  const supabase = createClient()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const buscar = async () => {
      if (!empresaAtiva || busca.length < 2) {
        setResultados([])
        return
      }

      setLoading(true)
      try {
        const { data, error } = await supabase
          .from('fornecedores_contaazul')
          .select('nome')
          .eq('empresa_id', empresaAtiva.id)
          .ilike('nome', `%${busca}%`)
          .limit(10)

        if (!error && data) {
          setResultados(data)
        }
      } catch (err) {
        console.error('Erro ao buscar fornecedores:', err)
      } finally {
        setLoading(false)
      }
    }

    const timer = setTimeout(buscar, 300)
    return () => clearTimeout(timer)
  }, [busca, empresaAtiva, supabase])

  return (
    <div className="relative w-full min-w-[200px]">
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
              onSelect(resultados[0].nome)
            }
          }}
          placeholder="Digite para buscar..."
          className="bg-transparent border-none outline-none text-white text-sm w-full"
        />
        <button onClick={onCancel} className="text-dark-500 hover:text-white">
          <X size={14} />
        </button>
      </div>

      {aberto && (busca.length >= 2) && (
        <div className="absolute z-50 mt-1 w-full bg-dark-800 border border-dark-600 rounded-lg shadow-2xl overflow-hidden max-h-[200px] overflow-y-auto">
          {loading && (
            <div className="p-3 flex items-center justify-center">
              <Loader2 size={16} className="animate-spin text-brand-400" />
            </div>
          )}
          {!loading && resultados.length === 0 && (
            <div className="p-3 text-xs text-dark-500 italic text-center">
              Nenhum fornecedor encontrado
            </div>
          )}
          {resultados.map((f, i) => (
            <button
              key={i}
              onClick={() => onSelect(f.nome)}
              className="w-full text-left px-3 py-2 text-sm text-white hover:bg-brand-600/20 hover:text-brand-400 transition-colors border-b border-dark-700 last:border-none"
            >
              {f.nome}
            </button>
          ))}
          {busca.length > 0 && (
            <button
              onClick={() => onSelect(busca)}
              className="w-full text-left px-3 py-2 text-[10px] text-dark-400 bg-dark-900 hover:bg-dark-700 italic border-t border-dark-600"
            >
              Usar "{busca}" (mesmo não cadastrado)
            </button>
          )}
        </div>
      )}
    </div>
  )
}
