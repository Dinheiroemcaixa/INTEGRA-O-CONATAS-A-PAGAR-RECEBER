'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, ArrowDownCircle, ArrowUpCircle,
  Building2, Settings, ChevronRight, User, LogOut,
  ShoppingBag, Receipt, FileCheck2, Link2, Layers,
  Sun, Moon
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { useAppConfig } from '@/contexts/AppConfigContext'
import { createClient } from '@/lib/supabase/client'
import ModalPerfil from './ModalPerfil'
import toast from 'react-hot-toast'

interface NavSection {
  title?: string
  items: {
    label: string
    href: string
    icon: any
    badge?: string
    badgeColor?: string
    disabled?: boolean
  }[]
}

const navSections: NavSection[] = [
  {
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    ]
  },
  {
    title: 'OPERAÇÃO & FISCAL',
    items: [
      { label: 'Vendas Produtos', href: '/vendas', icon: ShoppingBag },
      { label: 'Vendas Serviços', href: '/vendas-servicos', icon: Receipt, badge: 'NOVO', badgeColor: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30' },
      { label: 'Notas Emitidas', href: '/notas-emitidas', icon: FileCheck2 },
      { label: 'Contas a Pagar', href: '/contas-pagar', icon: ArrowDownCircle, badge: 'ATIVO', badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
      { label: 'Gestão Pagamentos', href: '/gestao-pagamentos', icon: Layers, badge: 'NOVO', badgeColor: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
      { label: 'Contas a Receber', href: '/contas-receber', icon: ArrowUpCircle, badge: 'EM BREVE', disabled: true },
    ]
  },
  {
    title: 'SISTEMA & INTEGRAÇÕES',
    items: [
      { label: 'Empresas', href: '/empresas', icon: Building2 },
      { label: 'Conexões & APIs', href: '/conectar', icon: Link2 },
    ]
  }
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { config, update, accentClasses } = useAppConfig()
  const [modalPerfil, setModalPerfil] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setUserEmail(data.user.email)
    })
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    toast.success('Saindo...')
    router.push('/')
    router.refresh()
  }

  const toggleTema = () => {
    const novoModo = !config.darkMode
    update({ darkMode: novoModo })
    toast.success(novoModo ? 'Modo Escuro ativado 🌙' : 'Modo Claro ativado ☀️')
  }

  return (
    <>
      <aside className="w-64 bg-dark-900 border-r border-dark-700/80 flex flex-col select-none">

        {/* Logo do app */}
        <div className="p-4 flex flex-col items-center justify-center gap-3 min-h-[110px] border-b border-dark-700/50 mb-1">
          <img 
            src="/images/dinheiro-em-caixa-logo.png" 
            alt="Dinheiro em Caixa" 
            className="w-full max-w-[170px] h-auto object-contain drop-shadow-md transition-transform hover:scale-[1.02]" 
          />
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-2 space-y-4 overflow-y-auto">
          {navSections.map((section, sIdx) => (
            <div key={sIdx} className="space-y-1">
              {section.title && (
                <p className="px-3 pt-2 pb-1 text-[10px] font-bold text-dark-500 tracking-wider uppercase">
                  {section.title}
                </p>
              )}
              {section.items.map((item) => {
                const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href + '/'))
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.disabled ? '#' : item.href}
                    className={cn(
                      'relative flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-150 group',
                      isActive 
                        ? `${accentClasses.bg} text-white shadow-lg shadow-emerald-950/40 font-semibold` 
                        : 'text-dark-400 hover:text-white hover:bg-dark-800/70',
                      item.disabled && 'opacity-40 cursor-not-allowed pointer-events-none'
                    )}
                  >
                    {/* Indicador sutil de item ativo */}
                    {isActive && (
                      <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-white rounded-r-full shadow-sm" />
                    )}

                    <Icon size={16} className={cn(
                      'flex-shrink-0 transition-transform duration-150 group-hover:scale-110',
                      isActive ? 'text-white' : 'text-dark-400 group-hover:text-white'
                    )} />
                    
                    <span className="flex-1 truncate">{item.label}</span>

                    {item.badge && !item.disabled && (
                      <span className={cn(
                        'text-[9px] px-1.5 py-0.5 rounded-full font-bold border tracking-wider',
                        item.badgeColor || 'bg-brand-500/20 text-brand-400 border-brand-500/30'
                      )}>
                        {item.badge}
                      </span>
                    )}

                    {item.badge && item.disabled && (
                      <span className="text-[9px] bg-dark-800 text-dark-500 border border-dark-700 px-1.5 py-0.5 rounded-full font-semibold">
                        {item.badge}
                      </span>
                    )}

                    {isActive && !item.disabled && (
                      <ChevronRight size={13} className="text-white/60 ml-auto" />
                    )}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-dark-700/80 space-y-2 bg-dark-900/60 backdrop-blur-sm">
          <div className="flex items-center justify-between bg-dark-800/80 hover:bg-dark-700/80 border border-dark-700/70 hover:border-dark-600 rounded-xl px-2.5 py-2 transition-all">
            <button
              onClick={() => setModalPerfil(true)}
              className="flex-1 flex items-center gap-2.5 min-w-0 text-left group"
            >
              <div className={`w-7 h-7 ${accentClasses.bg}/20 border ${accentClasses.border}/40 rounded-full flex items-center justify-center flex-shrink-0`}>
                <User size={13} className={accentClasses.text} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-semibold truncate">{userEmail || '...'}</p>
                <p className="text-[9px] text-dark-400">Opções & Perfil</p>
              </div>
            </button>

            <button
              onClick={toggleTema}
              title={config.darkMode ? 'Mudar para Modo Claro' : 'Mudar para Modo Escuro'}
              className="p-1.5 hover:bg-dark-600/50 rounded-lg text-dark-300 hover:text-white transition-all flex-shrink-0 ml-1"
            >
              {config.darkMode ? <Sun size={14} className="text-amber-400" /> : <Moon size={14} className="text-blue-400" />}
            </button>
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-dark-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all group"
          >
            <LogOut size={15} className="text-dark-400 group-hover:text-rose-400 transition-colors" />
            <span>Sair do sistema</span>
          </button>

          {/* Logo Connecta AI */}
          <div className="pt-2 border-t border-dark-700/50 flex flex-col items-center">
            {config.appLogoUrl ? (
              <img src={config.appLogoUrl} alt={config.appNome} className="h-7 max-w-[110px] object-contain mix-blend-screen opacity-70 hover:opacity-100 transition-opacity" />
            ) : (
              <div className="flex items-center gap-2 opacity-80 hover:opacity-100 transition-opacity">
                <div className={`w-6 h-6 ${accentClasses.bg} rounded-lg flex items-center justify-center shadow-sm flex-shrink-0`}>
                  <span className="text-white font-black text-xs">{config.appNome.charAt(0)}</span>
                </div>
                <div>
                  <p className="text-white font-bold text-xs leading-tight">{config.appNome}</p>
                  <p className="text-dark-500 text-[8px] uppercase tracking-wider">Inteligência Financeira</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      <ModalPerfil
        open={modalPerfil}
        onClose={() => setModalPerfil(false)}
        userEmail={userEmail}
      />
    </>
  )
}
