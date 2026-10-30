'use client'

import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
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
  const [mounted, setMounted] = useState(false)
  const [menuStyle, setMenuStyle] = useState<{
    top?: number
    bottom?: number
    left: number
    width: number
    maxHeight: number
  } | null>(null)
  const supabase = useMemo(() => createClient(), [])
  const containerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setMounted(true)
    inputRef.current?.focus()
  }, [])

  const updatePosition = useCallback(() => {
    if (!containerRef.current || typeof window === 'undefined') return
    const rect = containerRef.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const desiredMaxHeight = 220
    const bottomReserve = 64

    const spaceBelow = vh - rect.bottom - 12
    const spaceAbove = rect.top - 12
    const openUpward = (spaceBelow - bottomReserve < desiredMaxHeight) && spaceAbove > spaceBelow

    const width = Math.min(Math.max(rect.width, 260), vw - 16)
    const left = Math.max(8, Math.min(rect.left, vw - width - 8))

    if (openUpward) {
      setMenuStyle({
        bottom: vh - rect.top + 4,
        left,
        width,
        maxHeight: Math.max(120, Math.min(desiredMaxHeight, spaceAbove - 8)),
      })
    } else {
      setMenuStyle({
        top: rect.bottom + 4,
        left,
        width,
        maxHeight: Math.max(120, Math.min(desiredMaxHeight, spaceBelow - 8)),
      })
    }
  }, [])

  useLayoutEffect(() => {
    if (!aberto) return
    updatePosition()
  }, [aberto, busca, resultados.length, loading, updatePosition])

  useEffect(() => {
    if (!aberto) return
    updatePosition()
    const handleScroll = () => updatePosition()
    const handleResize = () => updatePosition()

    window.addEventListener('scroll', handleScroll, true)
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', handleResize)
    }
  }, [aberto, updatePosition])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        (!menuRef.current || !menuRef.current.contains(target))
      ) {
        onCancel()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onCancel])

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
    <div ref={containerRef} className="relative w-full min-w-[200px]">
      <div className="flex items-center gap-2 bg-[var(--dx-input)] border border-[var(--dx-control-line)] focus-within:border-[var(--dx-link)] rounded-[10px] px-2.5 py-1 shadow-[var(--dx-shadow-seg)]">
        <Search size={14} className="text-[var(--dx-link)] shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={busca}
          onChange={(e) => { setBusca(e.target.value); setAberto(true) }}
          onFocus={() => setAberto(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onCancel()
            if (e.key === 'Enter' && resultados.length > 0) {
              onSelect(resultados[0].nome)
            }
          }}
          placeholder="Digite para buscar ou selecione..."
          className="bg-transparent border-none outline-none text-[var(--dx-ink)] placeholder:text-[var(--dx-muted)] text-xs sm:text-sm w-full"
        />
        <button 
          type="button" 
          onClick={onCancel} 
          className="text-[var(--dx-muted)] hover:text-[var(--dx-ink)] p-0.5 transition-colors cursor-pointer"
          title="Cancelar"
        >
          <X size={14} />
        </button>
      </div>

      {aberto && mounted && menuStyle && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: menuStyle.top,
            bottom: menuStyle.bottom,
            left: menuStyle.left,
            width: menuStyle.width,
            maxHeight: menuStyle.maxHeight,
          }}
          className="z-[9999] bg-[var(--dx-card)] border border-[var(--dx-line)] rounded-[14px] shadow-[var(--dx-shadow-pop)] overflow-hidden overflow-y-auto animate-in fade-in duration-100"
        >
          {loading && (
            <div className="p-3 flex items-center justify-center">
              <Loader2 size={16} className="animate-spin text-[var(--dx-link)]" />
            </div>
          )}
          {!loading && resultados.length === 0 && (
            <div className="p-3 text-xs text-[var(--dx-muted)] italic text-center">
              Nenhum fornecedor encontrado
            </div>
          )}
          {!loading && resultados.length > 0 && busca.trim().length === 0 && (
            <div className="px-3 py-1.5 text-[10px] font-semibold text-[var(--dx-muted)] uppercase tracking-wider bg-[var(--dx-soft)] border-b border-[var(--dx-line-soft)]">
              Fornecedores cadastrados
            </div>
          )}
          {!loading && resultados.map((f, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(f.nome)}
              className="w-full text-left px-3 py-2 text-xs sm:text-sm text-[var(--dx-ink)] hover:bg-[var(--dx-selected)] hover:text-[var(--dx-link)] transition-colors border-b border-[var(--dx-line-soft)] last:border-none cursor-pointer flex items-center justify-between"
            >
              <span className="truncate">{f.nome}</span>
            </button>
          ))}
          {busca.trim().length > 0 && (
            <button
              type="button"
              onClick={() => onSelect(busca)}
              className="w-full text-left px-3 py-2 text-[11px] text-[var(--dx-muted)] bg-[var(--dx-soft)] hover:bg-[var(--dx-selected)] hover:text-[var(--dx-link)] italic border-t border-[var(--dx-line)] transition-colors cursor-pointer"
            >
              Usar "{busca}" (mesmo não cadastrado)
            </button>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}
