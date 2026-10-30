'use client'

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Search, X } from 'lucide-react'
import { LISTA_CATEGORIAS_FLAT } from '@/lib/conta-azul/constants'

interface Props {
  valorInicial: string
  categorias?: string[]
  onSelect: (nome: string) => void
  onCancel: () => void
}

export default function SelectorCategoria({ valorInicial, categorias = [], onSelect, onCancel }: Props) {
  const [busca, setBusca] = useState(valorInicial === 'Materiais para Revenda' ? '' : valorInicial)
  const [resultados, setResultados] = useState<string[]>([])
  const [aberto, setAberto] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [menuStyle, setMenuStyle] = useState<{
    top?: number
    bottom?: number
    left: number
    width: number
    maxHeight: number
  } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setMounted(true)
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const termo = busca.toLowerCase()
    const listaBase = categorias.length > 0 ? categorias : LISTA_CATEGORIAS_FLAT
    const filtrados = listaBase.filter(cat => 
      cat.toLowerCase().includes(termo)
    ).slice(0, 15)
    
    setResultados(filtrados)
  }, [busca, categorias])

  const updatePosition = useCallback(() => {
    if (!containerRef.current || typeof window === 'undefined') return
    const rect = containerRef.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const desiredMaxHeight = 260
    const bottomReserve = 64

    const spaceBelow = vh - rect.bottom - 12
    const spaceAbove = rect.top - 12
    const openUpward = (spaceBelow - bottomReserve < desiredMaxHeight) && spaceAbove > spaceBelow

    const width = Math.min(Math.max(rect.width, 340), vw - 16)
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
  }, [aberto, busca, resultados.length, updatePosition])

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

  return (
    <div ref={containerRef} className="relative w-full min-w-[170px]">
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
              onSelect(resultados[0])
            }
          }}
          placeholder="Buscar categoria..."
          className="bg-transparent border-none outline-none text-[var(--dx-ink)] placeholder:text-[var(--dx-muted)] text-xs w-full"
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
          className="z-[9999] bg-[var(--dx-card)] border border-[var(--dx-line)] rounded-[14px] shadow-[var(--dx-shadow-pop)] overflow-hidden overflow-y-auto animate-in fade-in duration-150"
        >
          {resultados.length === 0 && busca.length > 0 && (
            <div className="p-3 text-[10px] text-[var(--dx-muted)] italic text-center">
              Nenhuma categoria encontrada na lista padrão
            </div>
          )}
          
          {resultados.map((cat, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(cat)}
              className="w-full text-left px-3.5 py-2 text-xs text-[var(--dx-ink)] hover:bg-[var(--dx-selected)] hover:text-[var(--dx-link)] transition-all border-b border-[var(--dx-line-soft)] last:border-none cursor-pointer flex items-center justify-between"
            >
              {cat}
            </button>
          ))}

          {busca.length > 0 && !resultados.includes(busca) && (
            <button
              type="button"
              onClick={() => onSelect(busca)}
              className="w-full text-left px-3 py-1.5 text-[10px] text-[var(--dx-muted)] bg-[var(--dx-soft)] hover:bg-[var(--dx-selected)] hover:text-[var(--dx-link)] italic border-t border-[var(--dx-line)] transition-colors cursor-pointer"
            >
              Usar personalizada: "{busca}"
            </button>
          )}

          {busca.length === 0 && resultados.length === 0 && (
            <div className="p-3 text-[10px] text-[var(--dx-muted)] italic text-center">
              Digite para ver sugestões do DRE
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}
