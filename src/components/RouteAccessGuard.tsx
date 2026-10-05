'use client'

import React from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useUserPermissions } from '@/contexts/UserPermissionsContext'
import { Lock, ArrowLeft, ShieldAlert } from 'lucide-react'

// Mapeamento de prefixos de rota para a chave do card de permissão
const ROTA_PARA_CARD: Record<string, string> = {
  '/dashboard': 'dashboard',
  '/gestao-pagamentos': 'gestao_pagamentos',
  '/contas-pagar': 'contas_pagar',
  '/contas-receber': 'contas_receber',
  '/vendas': 'vendas',
  '/vendas-servicos': 'fiscal',
  '/notas-emitidas': 'relatorios',
  '/auditoria-conciliacoes-ca': 'conciliacao',
  '/empresas': 'configuracoes',
  '/conectar': 'conta_azul',
}

export default function RouteAccessGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { isMaster, temPermissao, loading } = useUserPermissions()

  if (loading) {
    return <>{children}</>
  }

  // 1. Rota exclusiva de MASTER
  if (pathname.startsWith('/central-mestre')) {
    if (!isMaster) {
      return (
        <div className="min-h-[70vh] flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white dark:bg-dark-900 border border-amber-500/30 rounded-2xl p-6 sm:p-8 shadow-xl text-center">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center mx-auto mb-4">
              <ShieldAlert size={28} />
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
              Acesso Restrito ao Administrador Mestre
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-6">
              A Central Mestre é destinada exclusivamente ao proprietário do sistema.
            </p>
            <button
              onClick={() => router.push('/dashboard')}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold text-xs transition-colors"
            >
              <ArrowLeft size={14} />
              Voltar ao Dashboard
            </button>
          </div>
        </div>
      )
    }
    return <>{children}</>
  }

  // Se for MASTER, tem acesso a todos os módulos
  if (isMaster) {
    return <>{children}</>
  }

  // 2. Identificar card correspondente à rota
  let cardNecessario: string | null = null
  for (const [rota, cardKey] of Object.entries(ROTA_PARA_CARD)) {
    if (pathname === rota || pathname.startsWith(rota + '/')) {
      cardNecessario = cardKey
      break
    }
  }

  // Se a rota requer um card específico e o usuário não possui permissão
  if (cardNecessario && !temPermissao(cardNecessario)) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-dark-900 border border-slate-200 dark:border-white/[0.08] rounded-2xl p-6 sm:p-8 shadow-xl text-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center mx-auto mb-4">
            <Lock size={28} />
          </div>

          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
            Você não possui acesso a este módulo
          </h2>

          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-6">
            A liberação deste card deve ser realizada pelo administrador na Central Mestre do Connecta AI.
          </p>

          <button
            onClick={() => router.push('/dashboard')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold text-xs transition-colors cursor-pointer"
          >
            <ArrowLeft size={14} />
            Voltar ao Dashboard
          </button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
