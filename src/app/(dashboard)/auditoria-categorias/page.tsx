'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Landmark, ArrowRight, Loader2, ShieldCheck } from 'lucide-react'

export default function AuditoriaCategoriasRedirectPage() {
  const router = useRouter()

  useEffect(() => {
    // Redireciona automaticamente para a Auditoria de Conciliação Bancária
    const timeout = setTimeout(() => {
      router.replace('/auditoria-conciliacao')
    }, 1500)

    return () => clearTimeout(timeout)
  }, [router])

  return (
    <div className="min-h-[75vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white dark:bg-[#0c1017] border border-slate-200 dark:border-white/[0.08] rounded-2xl p-8 text-center shadow-xl space-y-6 animate-in fade-in zoom-in-95 duration-200">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 shadow-inner">
          <Landmark size={32} />
        </div>

        <div className="space-y-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <ShieldCheck size={14} /> Módulo Unificado
          </span>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Auditoria de Conciliação
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            A <strong>Auditoria de Categorias</strong> foi integrada à nova <strong>Auditoria Inteligente de Conciliação Bancária</strong>, que agora audita fornecedores, categorias, centros de custo, contas, valores e datas em uma única tela.
          </p>
        </div>

        <div className="flex items-center justify-center gap-2 text-xs font-medium text-slate-400 dark:text-slate-500">
          <Loader2 size={15} className="animate-spin text-emerald-500" />
          <span>Redirecionando automaticamente...</span>
        </div>

        <div className="pt-2">
          <Link
            href="/auditoria-conciliacao"
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition-all shadow-md hover:shadow-emerald-500/20 active:scale-[0.98]"
          >
            <span>Ir para Auditoria de Conciliação</span>
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </div>
  )
}
