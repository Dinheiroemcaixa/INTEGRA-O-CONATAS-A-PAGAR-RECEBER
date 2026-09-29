'use client'

import { useState, useRef, useEffect } from 'react'
import { Sun, Moon, Monitor, Check } from 'lucide-react'
import { useAppConfig, type ThemeMode } from '@/contexts/AppConfigContext'
import { cn } from '@/lib/utils'

interface ThemeSwitcherProps {
  className?: string
  align?: 'left' | 'right'
  compact?: boolean
  placement?: 'top' | 'bottom'
}

const OPCOES: Array<{
  modo: ThemeMode
  label: string
  descricao: string
  icon: typeof Sun
  iconColor: string
}> = [
  {
    modo: 'light',
    label: 'Claro',
    descricao: 'Aparência clara permanente',
    icon: Sun,
    iconColor: 'text-amber-500 dark:text-amber-400',
  },
  {
    modo: 'dark',
    label: 'Escuro',
    descricao: 'Aparência escura permanente',
    icon: Moon,
    iconColor: 'text-indigo-500 dark:text-indigo-400',
  },
  {
    modo: 'system',
    label: 'Sistema',
    descricao: 'Sincronizar com o dispositivo',
    icon: Monitor,
    iconColor: 'text-slate-500 dark:text-slate-400',
  },
]

export default function ThemeSwitcher({
  className,
  align = 'right',
  compact = false,
  placement = 'bottom',
}: ThemeSwitcherProps) {
  const { config, setThemeMode } = useAppConfig()
  const [aberto, setAberto] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Fecha o dropdown ao clicar fora ou pressionar ESC
  useEffect(() => {
    if (!aberto) return

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setAberto(false)
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAberto(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [aberto])

  // Ícone ativo a exibir no botão principal
  const opcaoAtiva = OPCOES.find(o => o.modo === config.themeMode) || OPCOES[2]
  const IconeAtivo = opcaoAtiva.icon

  return (
    <div className={cn('relative inline-block text-left', className)} ref={menuRef}>
      {/* Botão Gatilho */}
      <button
        type="button"
        onClick={() => setAberto(prev => !prev)}
        className={cn(
          'flex items-center justify-center rounded-xl border transition-all duration-200 cursor-pointer shadow-xs',
          'border-slate-200/80 dark:border-dark-700/60 bg-white dark:bg-dark-850 hover:bg-slate-100 dark:hover:bg-dark-800 text-slate-700 dark:text-dark-200',
          compact ? 'w-9 h-9' : 'h-9 px-2.5 gap-2'
        )}
        title={`Tema: ${opcaoAtiva.label} (Clique para alterar)`}
        aria-label="Selecionar tema visual"
        aria-expanded={aberto}
      >
        <IconeAtivo size={16} className={opcaoAtiva.iconColor} />
        {!compact && (
          <span className="text-xs font-semibold capitalize hidden sm:inline-block">
            {opcaoAtiva.label}
          </span>
        )}
      </button>

      {/* Dropdown Menu com as 3 Opções */}
      {aberto && (
        <div
          className={cn(
            'absolute w-52 rounded-2xl border p-1.5 shadow-xl z-50 animate-fade-in backdrop-blur-md max-h-[80vh] overflow-y-auto',
            placement === 'top' ? 'bottom-full mb-2' : 'mt-1.5',
            'bg-white/95 dark:bg-dark-850/95 border-slate-200/90 dark:border-dark-700/80',
            align === 'right' ? 'right-0' : 'left-0'
          )}
          role="menu"
        >
          <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-dark-400 border-b border-slate-100 dark:border-dark-750/60 mb-1">
            Preferência de Tema
          </div>

          <div className="space-y-0.5">
            {OPCOES.map((item) => {
              const ItemIcon = item.icon
              const isSelected = config.themeMode === item.modo

              return (
                <button
                  key={item.modo}
                  type="button"
                  onClick={() => {
                    setThemeMode(item.modo)
                    setAberto(false)
                  }}
                  className={cn(
                    'w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-left text-xs font-medium transition-all duration-150 cursor-pointer',
                    isSelected
                      ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400 font-bold'
                      : 'text-slate-700 dark:text-dark-300 hover:bg-slate-100 dark:hover:bg-dark-800 hover:text-slate-900 dark:hover:text-white'
                  )}
                  role="menuitem"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <ItemIcon size={15} className={item.iconColor} />
                    <div className="min-w-0">
                      <p className="truncate leading-snug">{item.label}</p>
                      <p className="text-[10px] text-slate-400 dark:text-dark-400 truncate font-normal">
                        {item.descricao}
                      </p>
                    </div>
                  </div>

                  {isSelected && (
                    <Check size={14} className="text-brand-600 dark:text-brand-400 flex-shrink-0 ml-1.5" />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
