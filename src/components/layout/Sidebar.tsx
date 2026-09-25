'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, ArrowDownCircle, ArrowUpCircle,
  Building2, Settings, ChevronRight, User, LogOut,
  ShoppingBag, Receipt, FileCheck2, Link2, Layers,
  ShieldCheck, Sun, Moon, X
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { useAppConfig } from '@/contexts/AppConfigContext'
import { useSidebar } from '@/contexts/SidebarContext'
import { createClient } from '@/lib/supabase/client'
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
      { label: 'Vendas Serviços', href: '/vendas-servicos', icon: Receipt, badge: 'EM BREVE', badgeColor: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30' },
      { label: 'Notas Emitidas', href: '/notas-emitidas', icon: FileCheck2 },
      { label: 'Contas a Pagar', href: '/contas-pagar', icon: ArrowDownCircle },
      { label: 'Auditoria de Categorias', href: '/auditoria-categorias', icon: ShieldCheck, badge: 'EM BREVE', badgeColor: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30' },
      { label: 'Gestão Pagamentos', href: '/gestao-pagamentos', icon: Layers },
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
  const { isMobileOpen, closeMobile } = useSidebar()
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
      {/* Overlay Backdrop Blur Suave no Mobile / Tablet */}
      {isMobileOpen && (
        <div
          onClick={closeMobile}
          className="fixed inset-0 bg-slate-900/60 dark:bg-black/70 backdrop-blur-sm z-40 lg:hidden animate-in fade-in duration-200 cursor-pointer"
          aria-hidden="true"
        />
      )}

      {/* Aside com Drawer Responsivo */}
      <aside
        className={cn(
          "w-64 bg-white dark:bg-[#0c1017] border-r border-slate-200/80 dark:border-white/[0.08] flex flex-col select-none transition-all duration-300 z-50",
          // Em telas mobile/tablet: fixo à esquerda com animação de slide
          "fixed inset-y-0 left-0 lg:static lg:translate-x-0 flex-shrink-0 shadow-2xl lg:shadow-none",
          isMobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Logo do app + Botão Fechar Mobile (Logo ampliado e refinado) */}
        <div className="p-4 flex items-center justify-between min-h-[96px] lg:min-h-[112px] border-b border-slate-200/70 dark:border-white/[0.06] mb-1 bg-gradient-to-b from-slate-50/50 to-transparent dark:from-white/[0.02]">
          <img 
            src="/images/dinheiro-em-caixa-logo.png" 
            alt="Dinheiro em Caixa" 
            className="w-full max-w-[155px] lg:max-w-[185px] h-auto object-contain drop-shadow-sm transition-transform duration-300 hover:scale-[1.03]" 
          />
          <button
            onClick={closeMobile}
            className="lg:hidden p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-dark-800 transition-colors cursor-pointer"
            title="Fechar menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-2 space-y-4 overflow-y-auto">
          {navSections.map((section, sIdx) => (
            <div key={sIdx} className="space-y-1">
              {section.title && (
                <p className="px-3 pt-2.5 pb-1 text-[10px] font-bold text-slate-400 dark:text-dark-500 tracking-wider uppercase select-none">
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
                      'relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-200 group',
                      isActive 
                        ? 'bg-brand-500/10 dark:bg-brand-500/15 text-brand-600 dark:text-brand-400 font-semibold border border-brand-500/20 shadow-xs' 
                        : 'text-slate-600 dark:text-dark-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/90 dark:hover:bg-white/[0.06] hover:translate-x-0.5',
                      item.disabled && 'opacity-40 cursor-not-allowed pointer-events-none'
                    )}
                  >
                    {/* Indicador lateral sutil de item ativo estilo Linear */}
                    {isActive && (
                      <span className="absolute left-0 top-2 bottom-2 w-1 bg-brand-500 rounded-r-full shadow-xs" />
                    )}

                    <Icon size={17} className={cn(
                      'flex-shrink-0 transition-transform duration-200 group-hover:scale-110',
                      isActive ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400 dark:text-dark-400 group-hover:text-slate-700 dark:group-hover:text-white'
                    )} />
                    
                    <span className="flex-1 truncate">{item.label}</span>

                    {item.badge && !item.disabled && (
                      <span className={cn(
                        'text-[9px] px-1.5 py-0.5 rounded-full font-bold border tracking-wider',
                        item.badgeColor || 'bg-brand-500/10 dark:bg-brand-500/20 text-brand-600 dark:text-brand-400 border-brand-500/30'
                      )}>
                        {item.badge}
                      </span>
                    )}

                    {item.badge && item.disabled && (
                      <span className="text-[9px] bg-slate-100 dark:bg-dark-800 text-slate-400 dark:text-dark-500 border border-slate-200 dark:border-dark-700 px-1.5 py-0.5 rounded-full font-semibold">
                        {item.badge}
                      </span>
                    )}

                    {isActive && !item.disabled && (
                      <ChevronRight size={13} className="text-brand-600/70 dark:text-brand-400/70 ml-auto flex-shrink-0" />
                    )}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-slate-200/80 dark:border-white/[0.08] space-y-2 bg-slate-50/60 dark:bg-dark-900/70 backdrop-blur-md">
          {/* Avatar do Usuário Estilo SaaS Premium */}
          <div className="flex items-center justify-between bg-white dark:bg-dark-850/90 hover:bg-slate-50 dark:hover:bg-dark-800 border border-slate-200/80 dark:border-dark-700/80 rounded-2xl p-2.5 shadow-xs transition-all group">
            <div className="flex-1 flex items-center gap-3 min-w-0 text-left select-none">
              <div className="relative flex-shrink-0">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-500 p-[1.5px] shadow-xs">
                  <div className="w-full h-full bg-white dark:bg-dark-900 rounded-[10px] flex items-center justify-center">
                    <User size={15} className="text-brand-600 dark:text-brand-400" />
                  </div>
                </div>
                {/* Dot status Online */}
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full ring-2 ring-white dark:ring-dark-850" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-slate-900 dark:text-white text-xs font-bold truncate group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                  {config.nomeExibicao || userEmail || '...'}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-dark-400 truncate">
                  {config.nomeExibicao ? userEmail : (userEmail ? 'Conectado' : 'Carregando...')}
                </p>
              </div>
            </div>

            <button
              onClick={toggleTema}
              title={config.darkMode ? 'Mudar para Modo Claro' : 'Mudar para Modo Escuro'}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-dark-700/80 rounded-xl text-slate-500 dark:text-dark-300 hover:text-slate-900 dark:hover:text-white transition-all flex-shrink-0 ml-1 cursor-pointer"
            >
              {config.darkMode ? <Sun size={15} className="text-amber-400" /> : <Moon size={15} className="text-indigo-500" />}
            </button>
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-500 dark:text-dark-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all group cursor-pointer"
          >
            <LogOut size={15} className="text-slate-400 dark:text-dark-400 group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors" />
            <span>Sair do sistema</span>
          </button>

          {/* Logo Connecta AI */}
          <div className="pt-2 border-t border-slate-200/60 dark:border-white/[0.06] flex flex-col items-center">
            {config.appLogoUrl ? (
              <img src={config.appLogoUrl} alt={config.appNome} className="h-7 max-w-[110px] object-contain opacity-80 hover:opacity-100 transition-opacity" />
            ) : (
              <div className="flex items-center gap-2 opacity-80 hover:opacity-100 transition-opacity">
                <div className={`w-6 h-6 ${accentClasses.bg} rounded-lg flex items-center justify-center shadow-xs flex-shrink-0`}>
                  <span className="text-white font-black text-xs">{config.appNome.charAt(0)}</span>
                </div>
                <div>
                  <p className="text-slate-800 dark:text-white font-bold text-xs leading-tight">{config.appNome}</p>
                  <p className="text-slate-400 dark:text-dark-500 text-[8px] uppercase tracking-wider">Inteligência Financeira</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  )
}
