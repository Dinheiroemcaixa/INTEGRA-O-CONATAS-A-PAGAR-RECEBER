'use client'

import { useEmpresa } from '@/contexts/EmpresaContext'
import SelectorEmpresa from '@/components/layout/SelectorEmpresa'

export default function DashboardPage() {
  const { empresaAtiva } = useEmpresa()

  return (
    <div className="space-y-6 animate-fade-in flex flex-col h-full min-h-[calc(100vh-8.5rem)]">
      {/* Cabeçalho Institucional Limpo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200/70 dark:border-white/[0.08]">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight leading-tight">
            Bem-vindo ao Connecta AI
          </h1>
          <p className="text-xs text-slate-500 dark:text-dark-400 mt-0.5 font-normal">
            Plataforma corporativa de automação contábil, financeira e fiscal.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SelectorEmpresa />
        </div>
      </div>

      {/* Área Central Vazia Preparada para Imagem Futura */}
      <div className="flex-1 w-full flex items-center justify-center p-2 sm:p-6 lg:p-8">
        <div className="w-full max-w-5xl h-full min-h-[360px] sm:min-h-[460px] lg:min-h-[520px] rounded-3xl border border-slate-200/80 dark:border-white/[0.06] bg-slate-50/40 dark:bg-white/[0.015] backdrop-blur-xs flex items-center justify-center relative overflow-hidden transition-all duration-300 shadow-2xs">
          {/* Espaço reservado exclusivamente para inserção de imagem/banner futuro */}
        </div>
      </div>
    </div>
  )
}
