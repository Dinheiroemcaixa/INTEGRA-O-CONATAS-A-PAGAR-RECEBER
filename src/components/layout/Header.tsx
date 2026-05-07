'use client'

import { useEmpresa } from '@/contexts/EmpresaContext'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { User, LogOut, ChevronDown, Building2, Check } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import { formatCNPJ } from '@/lib/utils'
import toast from 'react-hot-toast'

export default function Header({ user }: { user: SupabaseUser }) {
  const { empresas, empresaAtiva, setEmpresaAtiva } = useEmpresa()
  const [openEmpresa, setOpenEmpresa] = useState(false)
  const [openUser, setOpenUser] = useState(false)
  const router = useRouter()
  const supabase = createClient()
  const refEmpresa = useRef<HTMLDivElement>(null)
  const refUser = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (refEmpresa.current && !refEmpresa.current.contains(e.target as Node)) setOpenEmpresa(false)
      if (refUser.current && !refUser.current.contains(e.target as Node)) setOpenUser(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    toast.success('Saindo...')
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="h-16 bg-dark-900 border-b border-dark-700 flex items-center justify-between px-6 flex-shrink-0">
      {/* Seletor de empresa */}
      <div ref={refEmpresa} className="relative">
        <button
          onClick={() => setOpenEmpresa(!openEmpresa)}
          className="flex items-center gap-2.5 bg-dark-800 hover:bg-dark-700 border border-dark-600
                     rounded-lg px-3 py-2 transition-all group"
        >
          <Building2 size={16} className="text-brand-400" />
          <span className="text-white text-sm font-medium max-w-[180px] truncate">
            {empresaAtiva?.nome || 'Selecionar empresa'}
          </span>
          <ChevronDown size={14} className={`text-dark-400 transition-transform ${openEmpresa ? 'rotate-180' : ''}`} />
        </button>

        {openEmpresa && (
          <div className="absolute top-full mt-2 left-0 w-72 bg-dark-800 border border-dark-600
                          rounded-xl shadow-2xl z-50 overflow-hidden animate-fade-in">
            <div className="px-3 py-2 border-b border-dark-700">
              <p className="text-xs text-dark-400 font-medium uppercase tracking-wider">Suas empresas</p>
            </div>
            {empresas.length === 0 ? (
              <div className="px-4 py-6 text-center text-dark-500 text-sm">
                Nenhuma empresa cadastrada
              </div>
            ) : (
              empresas.map((emp) => (
                <button
                  key={emp.id}
                  onClick={() => { setEmpresaAtiva(emp); setOpenEmpresa(false) }}
                  className="w-full flex items-center gap-3 px-3 py-3 hover:bg-dark-700 transition-colors text-left"
                >
                  <div className="w-8 h-8 bg-brand-600/20 border border-brand-600/30 rounded-lg flex items-center justify-center flex-shrink-0">
                    <span className="text-brand-400 font-bold text-xs">
                      {emp.nome.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{emp.nome}</p>
                    <p className="text-dark-500 text-xs">{emp.cnpj ? formatCNPJ(emp.cnpj) : 'CNPJ não informado'}</p>
                  </div>
                  {empresaAtiva?.id === emp.id && (
                    <Check size={14} className="text-green-400 flex-shrink-0" />
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* User menu */}
      <div ref={refUser} className="relative">
        <button
          onClick={() => setOpenUser(!openUser)}
          className="flex items-center gap-2.5 hover:bg-dark-800 rounded-lg px-3 py-2 transition-all"
        >
          <div className="w-8 h-8 bg-brand-600 rounded-full flex items-center justify-center">
            <User size={14} className="text-white" />
          </div>
          <span className="text-dark-300 text-sm hidden sm:block max-w-[160px] truncate">
            {user.email}
          </span>
          <ChevronDown size={14} className="text-dark-500" />
        </button>

        {openUser && (
          <div className="absolute top-full mt-2 right-0 w-56 bg-dark-800 border border-dark-600
                          rounded-xl shadow-2xl z-50 overflow-hidden animate-fade-in">
            <div className="px-4 py-3 border-b border-dark-700">
              <p className="text-white text-sm font-medium truncate">{user.email}</p>
              <p className="text-dark-500 text-xs mt-0.5">Conta ativa</p>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-dark-700 hover:text-red-300 transition-colors text-sm"
            >
              <LogOut size={16} />
              Sair do sistema
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
