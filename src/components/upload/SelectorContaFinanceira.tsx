'use client'

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Landmark } from 'lucide-react'

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

  const lista = contas || []
  const filtrados = lista.filter(c =>
    c.descricao.toLowerCase().includes(busca.toLowerCase())
  )

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

    const width = Math.min(Math.max(rect.width, 320), vw - 16)
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
  }, [aberto, busca, filtrados.length, updatePosition])

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
    <div ref={containerRef} className="relative w-full min-w-[150px]">
      <div className="flex items-center gap-2 bg-[var(--dx-input)] border border-[var(--dx-control-line)] focus-within:border-[var(--dx-link)] rounded-[10px] px-2.5 py-1 shadow-[var(--dx-shadow-seg)]">
        <Landmark size={14} className="text-[var(--dx-link)] shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={busca}
          onChange={(e) => { setBusca(e.target.value); setAberto(true) }}
          onFocus={() => setAberto(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onCancel()
            if (e.key === 'Enter' && filtrados.length > 0) {
              onSelect(filtrados[0].descricao, filtrados[0].id)
            }
          }}
          placeholder="Buscar conta no Conta Azul..."
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
          {filtrados.length === 0 && (
            <div className="p-3 text-[10px] text-[var(--dx-muted)] italic text-center">
              {lista.length === 0
                ? 'Carregando ou nenhuma conta cadastrada no Conta Azul para esta empresa.'
                : 'Nenhuma conta encontrada na busca.'}
            </div>
          )}
          {filtrados.map((conta) => (
            <button
              key={conta.id}
              type="button"
              onClick={() => onSelect(conta.descricao, conta.id)}
              className="w-full text-left px-3.5 py-2 text-xs text-[var(--dx-ink)] hover:bg-[var(--dx-selected)] hover:text-[var(--dx-link)] transition-all border-b border-[var(--dx-line-soft)] last:border-none flex items-center justify-between cursor-pointer"
            >
              <span className="truncate">{conta.descricao}</span>
              <span className="text-[9px] text-[var(--dx-ok)] bg-[var(--dx-ok-bg)] px-1.5 py-0.5 rounded border border-[var(--dx-ok)]/30 font-semibold shrink-0 ml-2">Conta Azul</span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}
