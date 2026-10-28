'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'

interface SidebarContextType {
  isMobileOpen: boolean
  openMobile: () => void
  closeMobile: () => void
  toggleMobile: () => void
  /** Menu lateral recolhido (somente ícones) — vale apenas em telas desktop */
  isCollapsed: boolean
  setCollapsed: (v: boolean) => void
  toggleCollapsed: () => void
}

const SidebarContext = createContext<SidebarContextType>({
  isMobileOpen: false,
  openMobile: () => {},
  closeMobile: () => {},
  toggleMobile: () => {},
  isCollapsed: false,
  setCollapsed: () => {},
  toggleCollapsed: () => {},
})

const COLLAPSED_KEY = 'dcx_sidebar_collapsed'

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const pathname = usePathname()

  // Restaura a preferência salva (após a hidratação, evita divergência SSR)
  useEffect(() => {
    try {
      if (localStorage.getItem(COLLAPSED_KEY) === '1') setIsCollapsed(true)
    } catch {}
  }, [])

  const setCollapsed = (v: boolean) => {
    setIsCollapsed(v)
    try {
      localStorage.setItem(COLLAPSED_KEY, v ? '1' : '0')
    } catch {}
  }
  const toggleCollapsed = () => setCollapsed(!isCollapsed)

  // Fecha a sidebar mobile automaticamente quando o usuário navega para outra rota
  useEffect(() => {
    setIsMobileOpen(false)
  }, [pathname])

  // Fecha a sidebar mobile ao pressionar a tecla ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMobileOpen) {
        setIsMobileOpen(false)
      }
    }

    if (isMobileOpen) {
      window.addEventListener('keydown', handleKeyDown)
      // Trava o scroll do body em telas mobile enquanto a drawer estiver aberta
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [isMobileOpen])

  const openMobile = () => setIsMobileOpen(true)
  const closeMobile = () => setIsMobileOpen(false)
  const toggleMobile = () => setIsMobileOpen((prev) => !prev)

  return (
    <SidebarContext.Provider value={{ isMobileOpen, openMobile, closeMobile, toggleMobile, isCollapsed, setCollapsed, toggleCollapsed }}>
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar() {
  return useContext(SidebarContext)
}
