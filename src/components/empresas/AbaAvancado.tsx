'use client'

import React, { useState } from 'react'
import { Empresa } from '@/types'
import { 
  Trash2, 
  Copy, 
  Check, 
  Sparkles,
  Star,
  ShieldAlert,
  Loader2,
  Fingerprint
} from 'lucide-react'
import toast from 'react-hot-toast'

interface AbaAvancadoProps {
  empresa: Empresa
  isAtiva?: boolean
  onDefinirComoAtiva?: () => void
  onExcluirEmpresa: (empresaId: string) => Promise<void>
}

export function AbaAvancado({ 
  empresa, 
  isAtiva = false, 
  onDefinirComoAtiva, 
  onExcluirEmpresa 
}: AbaAvancadoProps) {
  const [copiadoId, setCopiadoId] = useState(false)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)
  const [nomeConfirmacao, setNomeConfirmacao] = useState('')
  const [excluindo, setExcluindo] = useState(false)

  const handleCopiarId = () => {
    navigator.clipboard.writeText(empresa.id)
    setCopiadoId(true)
    toast.success('UUID da empresa copiado com sucesso!')
    setTimeout(() => setCopiadoId(false), 2000)
  }

  const handleExecutarExclusao = async () => {
    setExcluindo(true)
    try {
      await onExcluirEmpresa(empresa.id)
    } finally {
      setExcluindo(false)
      setConfirmandoExclusao(false)
      setNomeConfirmacao('')
    }
  }

  return (
    <div className="space-y-6">
      {/* 1. STATUS OPERACIONAL NO SISTEMA & IDENTIFICADOR */}
      <div className="bg-dark-800/80 border border-dark-700/70 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-dark-700/60">
          <div className="w-10 h-10 rounded-xl bg-primary-500/15 border border-primary-500/30 flex items-center justify-center text-primary-400">
            <Fingerprint size={20} />
          </div>
          <div>
            <h4 className="font-semibold text-white text-base">Operação & Identificação Global</h4>
            <p className="text-xs text-dark-400">Seleção ativa e UUID único no banco de dados</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Card: Empresa Ativa */}
          <div className="p-4 bg-dark-900/80 rounded-xl border border-dark-700/60 flex items-center justify-between flex-wrap gap-2">
            <div>
              <span className="text-xs text-dark-400 block mb-1">Status no Sistema</span>
              {isAtiva ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  <Sparkles size={13} className="text-emerald-400" />
                  <span>Empresa Ativa</span>
                </span>
              ) : (
                <span className="text-xs text-dark-400 font-medium">Inativa para seleção global</span>
              )}
            </div>

            {!isAtiva && onDefinirComoAtiva && (
              <button
                type="button"
                onClick={onDefinirComoAtiva}
                className="px-3.5 py-1.5 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <Star size={13} />
                <span>Tornar Empresa Ativa</span>
              </button>
            )}
          </div>

          {/* Card: UUID do Supabase */}
          <div className="p-4 bg-dark-900/80 rounded-xl border border-dark-700/60 flex items-center justify-between">
            <div className="min-w-0 pr-2">
              <span className="text-xs text-dark-400 block mb-1">Identificador UUID</span>
              <span className="font-mono text-dark-200 text-xs truncate block" title={empresa.id}>
                {empresa.id}
              </span>
            </div>
            <button
              type="button"
              onClick={handleCopiarId}
              className="p-2 hover:bg-dark-800 rounded-xl text-dark-400 hover:text-white border border-dark-700/60 transition-colors flex-shrink-0"
              title="Copiar UUID"
            >
              {copiadoId ? <Check size={15} className="text-emerald-400" /> : <Copy size={15} />}
            </button>
          </div>
        </div>
      </div>

      {/* 2. ZONA DE PERIGO (EXCLUSÃO SEGURA) */}
      <div className="bg-red-950/20 border border-red-900/50 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-red-900/30">
          <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400 flex-shrink-0">
            <ShieldAlert size={20} />
          </div>
          <div>
            <h4 className="font-semibold text-red-300 text-base">Zona de Perigo</h4>
            <p className="text-xs text-red-400/80">Exclusão irreversível da empresa e limpeza em cascata</p>
          </div>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="max-w-xl text-xs text-dark-300 space-y-1">
            <p className="font-medium text-white">Excluir permanentemente esta empresa</p>
            <p className="text-dark-400">
              Esta ação removerá a empresa e todos os registros associados em cascata (fornecedores, regras De/Para, logs e configurações).
            </p>
          </div>

          {!confirmandoExclusao ? (
            <button
              type="button"
              onClick={() => setConfirmandoExclusao(true)}
              className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 hover:text-red-300 border border-red-500/40 rounded-xl text-xs font-semibold transition-colors flex items-center gap-2"
            >
              <Trash2 size={14} />
              <span>Excluir Empresa</span>
            </button>
          ) : (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-3 bg-dark-900/90 border border-red-500/40 rounded-xl w-full sm:w-auto">
              <span className="text-xs text-red-300 font-medium px-1">
                Confirmar exclusão de <strong className="text-white">{empresa.nome}</strong>?
              </span>
              <div className="flex items-center gap-2 mt-2 sm:mt-0">
                <button
                  type="button"
                  onClick={() => setConfirmandoExclusao(false)}
                  className="px-3 py-1.5 bg-dark-800 hover:bg-dark-700 text-dark-300 text-xs rounded-lg transition-colors"
                  disabled={excluindo}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleExecutarExclusao}
                  disabled={excluindo}
                  className="px-3.5 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5"
                >
                  {excluindo ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  <span>{excluindo ? 'Excluindo...' : 'Sim, Excluir'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
