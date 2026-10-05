'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useUserPermissions } from '@/contexts/UserPermissionsContext'
import { Loader2, Clock, ShieldAlert, XCircle, LogOut, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { user, perfil, status, loading, recarregarPerfil } = useUserPermissions()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    toast.success('Sessão encerrada.')
    window.location.replace('/login')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-dark-950 flex flex-col items-center justify-center transition-colors">
        <Loader2 size={36} className="text-brand-500 animate-spin mb-3" />
        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium tracking-wide">
          Verificando credenciais e permissões...
        </p>
      </div>
    )
  }

  if (!user) {
    if (typeof window !== 'undefined') {
      window.location.replace('/login')
    }
    return null
  }

  // Se a conta estiver PENDENTE de aprovação do MASTER
  if (status === 'PENDENTE' && !perfil?.is_master) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-800/80 backdrop-blur-md border border-amber-500/30 rounded-2xl p-6 sm:p-8 shadow-2xl text-center">
          <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center mx-auto mb-5 text-amber-400">
            <Clock size={32} className="animate-pulse" />
          </div>

          <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">
            Aguardando Aprovação
          </h2>

          <p className="text-sm text-slate-300 leading-relaxed mb-4">
            Sua conta foi criada com sucesso e está aguardando aprovação do administrador.
          </p>

          <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl p-3.5 mb-6 text-xs text-slate-400">
            <div className="text-slate-500 font-medium mb-1">E-mail cadastrado</div>
            <div className="text-slate-200 font-mono font-medium truncate">{user.email}</div>
            <div className="mt-2 text-[11px] text-amber-400/90 font-medium">
              Assim que o MASTER liberar seu acesso, seus módulos estarão disponíveis automaticamente.
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => recarregarPerfil()}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-xs transition-colors"
            >
              <RefreshCw size={15} />
              Verificar Novamente
            </button>
            <button
              onClick={handleLogout}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-700/70 hover:bg-slate-700 text-slate-200 font-medium text-xs transition-colors"
            >
              <LogOut size={15} />
              Sair
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Se a conta estiver BLOQUEADA
  if (status === 'BLOQUEADO' && !perfil?.is_master) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-800/80 backdrop-blur-md border border-rose-500/30 rounded-2xl p-6 sm:p-8 shadow-2xl text-center">
          <div className="w-16 h-16 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center justify-center mx-auto mb-5 text-rose-400">
            <ShieldAlert size={32} />
          </div>

          <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">
            Conta Suspensa
          </h2>

          <p className="text-sm text-slate-300 leading-relaxed mb-6">
            O acesso a esta conta foi bloqueado pelo administrador da plataforma. Para regularizar seu acesso, procure a gerência ou o suporte do Connecta AI.
          </p>

          <button
            onClick={handleLogout}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-medium text-xs transition-colors"
          >
            <LogOut size={15} />
            Encerrar Sessão
          </button>
        </div>
      </div>
    )
  }

  // Se a conta tiver sido REJEITADA
  if (status === 'REJEITADO' && !perfil?.is_master) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-800/80 backdrop-blur-md border border-red-500/30 rounded-2xl p-6 sm:p-8 shadow-2xl text-center">
          <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-center mx-auto mb-5 text-red-400">
            <XCircle size={32} />
          </div>

          <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">
            Cadastro Recusado
          </h2>

          <p className="text-sm text-slate-300 leading-relaxed mb-6">
            Sua solicitação de acesso não foi autorizada pelo administrador.
          </p>

          <button
            onClick={handleLogout}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-medium text-xs transition-colors"
          >
            <LogOut size={15} />
            Voltar para o Login
          </button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
