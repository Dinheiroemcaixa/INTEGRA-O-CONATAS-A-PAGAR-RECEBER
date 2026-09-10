'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, ShoppingBag, Receipt, ArrowDownCircle, 
  CheckCircle2, FileCheck2, Building2, Link2, ChevronRight, 
  User, LogOut, Sun, Moon
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { useAppConfig } from '@/contexts/AppConfigContext'
import { createClient } from '@/lib/supabase/client'
import ModalPerfil from './ModalPerfil'
import toast from 'react-hot-toast'

const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Vendas Produtos', href: '/vendas', icon: ShoppingBag, badge: 'NF-e' },
  { label: 'Vendas Serviços', href: '/vendas-servicos', icon: Receipt, badge: 'NFS-e' },
  { label: 'Contas a Pagar', href: '/contas-pagar', icon: ArrowDownCircle },
  { label: 'Gestão de Pagamentos', href: '/gestao-pagamentos', icon: CheckCircle2 },
  { label: 'Notas Emitidas', href: '/notas-emitidas', icon: FileCheck2 },
  { label: 'Empresas & Certificados', href: '/empresas', icon: Building2 },
  { label: 'Conexões & APIs', href: '/conectar', icon: Link2 },
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
      <aside className="w-64 bg-dark-950 border-r border-dark-800 flex flex-col z-20 select-none">

        {/* Logo do app */}
        <div className="p-4 flex flex-col items-center justify-center gap-3 min-h-[110px] border-b border-dark-800/80 mb-1 bg-dark-950/50">
          <img 
            src="/images/dinheiro-em-caixa-logo.png" 
            alt="Dinheiro em Caixa" 
            className="w-full max-w-[165px] h-auto object-contain drop-shadow-md transition-transform duration-300 hover:scale-[1.02]" 
          />
        </div>

        {/* Nav Links */}
        <nav className="flex-1 px-3 py-3 space-y-1.5 overflow-y-auto custom-scrollbar">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 group relative',
                  isActive 
                    ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30 shadow-sm shadow-blue-500/10' 
                    : 'text-dark-400 hover:text-dark-100 hover:bg-dark-900/80 border border-transparent'
                )}
              >
                <Icon 
                  size={17} 
                  className={cn(
                    'transition-colors flex-shrink-0',
                    isActive ? 'text-blue-400' : 'text-dark-400 group-hover:text-dark-200'
                  )} 
                />
                <span className="flex-1 truncate tracking-wide">{item.label}</span>
                
                {item.badge && (
                  <span className={cn(
                    'text-[9px] px-1.5 py-0.5 rounded-md font-mono font-bold tracking-wider',
                    isActive 
                      ? 'bg-blue-500/25 text-blue-300 border border-blue-500/40' 
                      : 'bg-dark-800 text-dark-400 border border-dark-700 group-hover:text-dark-300'
                  )}>
                    {item.badge}
                  </span>
                )}

                {isActive && (
                  <ChevronRight size={13} className="text-blue-400/80 flex-shrink-0" />
                )}
              </Link>
            )
          })}
        </nav>

        {/* Footer — Perfil + Alternar Tema + Logout */}
        <div className="p-3 border-t border-dark-800/80 space-y-2 bg-dark-950/80">
          <div className="flex items-center justify-between bg-dark-900/90 hover:bg-dark-850 border border-dark-800 hover:border-dark-700 rounded-xl px-3 py-2 transition-all shadow-sm">
            <button
              onClick={() => setModalPerfil(true)}
              className="flex-1 flex items-center gap-2.5 min-w-0 text-left group"
            >
              <div className="w-7 h-7 bg-blue-600/20 border border-blue-500/30 rounded-full flex items-center justify-center flex-shrink-0">
                <User size={13} className="text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-bold truncate">{userEmail || '...'}</p>
                <p className="text-[9px] text-dark-400 font-medium">Perfil & Ajustes</p>
              </div>
            </button>

            {/* Alternar Tema */}
            <button
              onClick={toggleTema}
              title={config.darkMode ? 'Mudar para Modo Claro' : 'Mudar para Modo Escuro'}
              className="p-1.5 hover:bg-dark-800 rounded-lg text-dark-400 hover:text-white transition-all flex-shrink-0 ml-1"
            >
              {config.darkMode ? <Sun size={14} className="text-amber-400" /> : <Moon size={14} className="text-blue-400" />}
            </button>
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-dark-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all group"
          >
            <LogOut size={15} className="text-dark-400 group-hover:text-rose-400 transition-colors" />
            <span>Sair do Sistema</span>
          </button>

          {/* Logo Connecta AI no rodapé */}
          <div className="pt-2 border-t border-dark-800/50 flex flex-col items-center">
            {config.appLogoUrl ? (
              <img src={config.appLogoUrl} alt={config.appNome} className="h-6 max-w-[100px] object-contain mix-blend-screen opacity-70 hover:opacity-100 transition-opacity" />
            ) : (
              <div className="flex items-center gap-2 opacity-75 hover:opacity-100 transition-opacity">
                <div className="w-5 h-5 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-md flex items-center justify-center shadow-sm flex-shrink-0">
                  <span className="text-white font-black text-[10px]">{config.appNome.charAt(0)}</span>
                </div>
                <div>
                  <p className="text-white font-bold text-[11px] leading-tight">{config.appNome}</p>
                  <p className="text-dark-500 text-[8px] uppercase tracking-wider font-mono">Inteligência Financeira</p>
                </div>
              </div>
            )}
          </div>

          <p className="text-[9px] text-dark-600 text-center select-none font-mono">dev: AH Cardoso</p>
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
