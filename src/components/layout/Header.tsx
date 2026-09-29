'use client'

import React from 'react'
import { Menu } from 'lucide-react'
import { useSidebar } from '@/contexts/SidebarContext'
import ThemeSwitcher from '@/components/layout/ThemeSwitcher'

export default function Header() {
  const { toggleMobile } = useSidebar()

  return (
    <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-white/95 dark:bg-[#0c1017]/95 backdrop-blur-md border-b border-slate-200/80 dark:border-white/[0.08] sticky top-0 z-30 transition-colors">
      <div className="flex items-center gap-3">
        <button
          onClick={toggleMobile}
          type="button"
          aria-label="Abrir menu de navegação"
          className="p-2 rounded-xl text-slate-600 dark:text-dark-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-dark-800 transition-colors cursor-pointer border border-slate-200/80 dark:border-dark-700/60 shadow-2xs"
        >
          <Menu size={20} />
        </button>

        <div className="flex items-center gap-2">
          <img
            src="/images/dinheiro-em-caixa-logo.png"
            alt="Dinheiro em Caixa"
            className="h-7 w-auto object-contain"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <ThemeSwitcher compact={true} align="right" />
      </div>
    </header>
  )
}
