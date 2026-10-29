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
      <div className="flex items-center gap-2 bg-white dark:bg-dark-700 border border-blue-300 dark:border-blue-500/50 rounded-lg px-2 py-1 shadow-xs dark:shadow-lg dark:shadow-blue-900/20">
        <Landmark size={14} className="text-blue-600 dark:text-blue-400 shrink-0" />
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
          className="bg-transparent border-none outline-none text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-dark-400 text-xs w-full"
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
          className="z-[9999] bg-white dark:bg-dark-800 border border-slate-200 dark:border-dark-600 rounded-xl shadow-2xl overflow-hidden overflow-y-auto ring-1 ring-black/5 dark:ring-black/50 animate-in fade-in duration-150"
        >
          {filtrados.length === 0 && (
            <div className="p-3 text-[10px] text-slate-500 dark:text-dark-400 italic text-center">
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
              className="w-full text-left px-3.5 py-2 text-xs text-slate-800 dark:text-white hover:bg-blue-50 dark:hover:bg-blue-600/25 hover:text-blue-700 dark:hover:text-blue-300 transition-all border-b border-slate-100 dark:border-dark-700/60 last:border-none flex items-center justify-between cursor-pointer"
            >
              <span className="truncate">{conta.descricao}</span>
              <span className="text-[9px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-500/20 font-mono shrink-0 ml-2">Conta Azul</span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}
