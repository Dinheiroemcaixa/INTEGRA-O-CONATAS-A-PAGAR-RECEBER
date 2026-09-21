'use client'

import React from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowDownCircle } from 'lucide-react'

export default function AuditoriaPage() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="bg-dark-900 border border-dark-700 rounded-2xl p-8 text-center space-y-4 shadow-xl">
        <h2 className="text-xl font-bold text-white">Módulo em Manutenção</h2>
        <p className="text-dark-400 text-sm max-w-md mx-auto">
          As rotinas de auditoria e governança foram pausadas para estabilidade operacional do sistema.
          Acesse os módulos operacionais de Contas a Pagar e Vendas para prosseguir com suas rotinas financeiras.
        </p>
        <div className="pt-4 flex justify-center gap-3">
          <Link
            href="/contas-pagar"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs transition-all shadow-md"
          >
            <ArrowDownCircle size={15} />
            <span>Ir para Contas a Pagar</span>
          </Link>
          <Link
            href="/dashboard"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-dark-800 hover:bg-dark-750 border border-dark-600 text-slate-200 text-xs font-semibold transition-all"
          >
            <ArrowLeft size={15} />
            <span>Voltar ao Dashboard</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
