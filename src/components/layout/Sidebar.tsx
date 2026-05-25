'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  ArrowDownCircle,
  ArrowUpCircle,
  Building2,
  Settings,
  ChevronRight,
  Zap,
} from 'lucide-react'

const navItems = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    label: 'Contas a Pagar',
    href: '/contas-pagar',
    icon: ArrowDownCircle,
    badge: 'ATIVO',
  },
  {
    label: 'Contas a Receber',
    href: '/contas-receber',
    icon: ArrowUpCircle,
    badge: 'EM BREVE',
    disabled: true,
  },
  {
    label: 'Empresas',
    href: '/empresas',
    icon: Building2,
  },
  {
    label: 'Configurações',
    href: '/configuracoes',
    icon: Settings,
    disabled: true,
  },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-64 bg-dark-900 border-r border-dark-700 flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-dark-700">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-brand-600 rounded-lg flex items-center justify-center shadow-md">
            <Zap size={18} className="text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-tight">Connecta AI</p>
            <p className="text-dark-500 text-[10px] uppercase tracking-wider">Inteligência Financeira</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.disabled ? '#' : item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group',
                isActive
                  ? 'bg-brand-600 text-white shadow-md shadow-brand-900/40'
                  : 'text-dark-400 hover:text-white hover:bg-dark-800',
                item.disabled && 'opacity-40 cursor-not-allowed pointer-events-none'
              )}
            >
              <Icon size={18} className={cn(isActive ? 'text-white' : 'text-dark-400 group-hover:text-white')} />
              <span className="flex-1">{item.label}</span>
              {item.badge && !item.disabled && (
                <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full font-semibold">
                  {item.badge}
                </span>
              )}
              {item.badge && item.disabled && (
                <span className="text-[10px] bg-dark-700 text-dark-500 px-1.5 py-0.5 rounded-full font-semibold">
                  {item.badge}
                </span>
              )}
              {isActive && !item.disabled && (
                <ChevronRight size={14} className="text-white/60" />
              )}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-dark-700 space-y-2">
        <div className="bg-brand-950/50 border border-brand-800/30 rounded-lg p-3">
          <p className="text-xs text-brand-300 font-semibold mb-0.5">🚀 Sistema ativo</p>
          <p className="text-xs text-dark-500">Integração Conta Azul pronta</p>
        </div>
        <div className="rounded-lg p-3 bg-dark-800 border border-dark-700">
          <p className="text-[10px] text-dark-500 uppercase tracking-wider mb-0.5">Desenvolvedor</p>
          <p className="text-xs text-dark-300 font-semibold">AH CARDOSO</p>
          <p className="text-[10px] text-dark-500 mt-1">Versão 01 — dev</p>
        </div>
      </div>
    </aside>
  )
}
