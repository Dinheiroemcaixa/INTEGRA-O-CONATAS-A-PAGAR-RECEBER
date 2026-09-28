'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useEmpresa } from '@/contexts/EmpresaContext'
import { Search, Loader2, X } from 'lucide-react'

interface Props {
  valorInicial: string
  onSelect: (nome: string) => void
  onCancel: () => void
  /** ID da empresa/loja pra buscar os fornecedores. Se não vier, usa a
   * empresa ativa do contexto global (comportamento antigo) — necessário
   * em telas como Gestão de Pagamentos, onde cada card é de uma loja
   * diferente e não tem relação com a "empresa ativa" do menu superior. */
  empresaId?: string
}

export default function SelectorFornecedor({ valorInicial, onSelect, onCancel, empresaId }: Props) {
  const { empresaAtiva } = useEmpresa()
  const empresaIdFinal = empresaId || empresaAtiva?.id
  const [busca, setBusca] = useState(valorInicial)
  const [resultados, setResultados] = useState<{ nome: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [aberto, setAberto] = useState(true)
  const supabase = useMemo(() => createClient(), [])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const buscar = async () => {
      if (!empresaIdFinal) {
        setResultados([])
        return
      }

      const termo = busca.trim()

      // Se tiver apenas 1 caractere, aguarda o próximo para não fazer queries curtas demais
      if (termo.length === 1) {
        return
      }

      setLoading(true)
      try {
        let query = supabase
          .from('fornecedores_contaazul')
          .select('nome')
          .eq('empresa_id', empresaIdFinal)

        if (termo.length >= 2) {
          query = query.ilike('nome', `%${termo}%`)
        } else {
          // Campo vazio: carrega os 10 primeiros em ordem alfabética
          query = query.order('nome', { ascending: true })
        }

        const { data, error } = await query.limit(10)

        if (!error && data) {
          setResultados(data)
        }
      } catch (err) {
        console.error('Erro ao buscar fornecedores:', err)
      } finally {
        setLoading(false)
      }
    }

    const delay = busca.trim().length === 0 ? 0 : 300
    const timer = setTimeout(buscar, delay)
    return () => clearTimeout(timer)
  }, [busca, empresaIdFinal, supabase])

  return (
    <div className="relative w-full min-w-[200px]">
      <div className="flex items-center gap-2 bg-white dark:bg-dark-700 border border-slate-300 dark:border-brand-500/50 rounded-lg px-2 py-1 shadow-xs dark:shadow-lg dark:shadow-brand-900/20">
        <Search size={14} className="text-brand-600 dark:text-brand-400 shrink-0" />
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
          placeholder="Digite para buscar ou selecione..."
          className="bg-transparent border-none outline-none text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-dark-400 text-xs sm:text-sm w-full"
        />
        <button 
          type="button" 
          onClick={onCancel} 
          className="text-slate-400 hover:text-slate-700 dark:text-dark-500 dark:hover:text-white p-0.5 transition-colors cursor-pointer"
          title="Cancelar"
        >
          <X size={14} />
        </button>
      </div>

      {aberto && (
        <div className="absolute z-50 mt-1 w-full bg-white dark:bg-dark-800 border border-slate-200 dark:border-dark-600 rounded-lg shadow-2xl overflow-hidden max-h-[220px] overflow-y-auto ring-1 ring-black/5 animate-in fade-in duration-100">
          {loading && (
            <div className="p-3 flex items-center justify-center">
              <Loader2 size={16} className="animate-spin text-brand-500 dark:text-brand-400" />
            </div>
          )}
          {!loading && resultados.length === 0 && (
            <div className="p-3 text-xs text-slate-500 dark:text-dark-400 italic text-center">
              Nenhum fornecedor encontrado
            </div>
          )}
          {!loading && resultados.length > 0 && busca.trim().length === 0 && (
            <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 dark:text-dark-400 uppercase tracking-wider bg-slate-50/80 dark:bg-dark-900/60 border-b border-slate-100 dark:border-dark-700/60">
              Fornecedores cadastrados
            </div>
          )}
          {!loading && resultados.map((f, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(f.nome)}
              className="w-full text-left px-3 py-2 text-xs sm:text-sm text-slate-800 dark:text-white hover:bg-brand-50 dark:hover:bg-brand-600/20 hover:text-brand-700 dark:hover:text-brand-400 transition-colors border-b border-slate-100 dark:border-dark-700 last:border-none cursor-pointer flex items-center justify-between"
            >
              <span className="truncate">{f.nome}</span>
            </button>
          ))}
          {busca.trim().length > 0 && (
            <button
              type="button"
              onClick={() => onSelect(busca)}
              className="w-full text-left px-3 py-2 text-[11px] text-slate-600 dark:text-dark-300 bg-slate-50 dark:bg-dark-900 hover:bg-slate-100 dark:hover:bg-dark-700 italic border-t border-slate-200 dark:border-dark-600 transition-colors cursor-pointer"
            >
              Usar "{busca}" (mesmo não cadastrado)
            </button>
          )}
        </div>
      )}
    </div>
  )
}
