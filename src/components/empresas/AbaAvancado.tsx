'use client'

import React, { useState } from 'react'
import { Empresa } from '@/types'
import { 
  AlertTriangle, 
  Trash2, 
  Copy, 
  Check, 
  Calendar, 
  CreditCard, 
  Layers, 
  DollarSign, 
  ShieldAlert,
  Loader2
} from 'lucide-react'
import toast from 'react-hot-toast'

interface AbaAvancadoProps {
  empresa: Empresa
  onExcluirEmpresa: (empresaId: string) => Promise<void>
}

export function AbaAvancado({ empresa, onExcluirEmpresa }: AbaAvancadoProps) {
  const [copiadoId, setCopiadoId] = useState(false)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)
  const [excluindo, setExcluindo] = useState(false)

  const handleCopiarId = () => {
    navigator.clipboard.writeText(empresa.id)
    setCopiadoId(true)
    toast.success('ID da empresa copiado!')
    setTimeout(() => setCopiadoId(false), 2000)
  }

  const handleExecutarExclusao = async () => {
    setExcluindo(true)
    try {
      await onExcluirEmpresa(empresa.id)
    } finally {
      setExcluindo(false)
      setConfirmandoExclusao(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* 1. GESTÃO DE PAGAMENTOS & CONCILIAÇÃO OPERACIONAL */}
      <div className="bg-dark-800/80 border border-dark-700/70 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-dark-700/60">
          <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
            <Layers size={20} />
          </div>
          <div>
            <h4 className="font-semibold text-white text-base">Gestão de Pagamentos & Tesouraria</h4>
            <p className="text-xs text-dark-400">Vínculo com grupos de rateio e saldos em caixa</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3 bg-dark-900/80 rounded-xl border border-dark-700/60">
            <span className="text-xs text-dark-400 block mb-1">Grupo Alocado</span>
            <span className="text-sm font-semibold text-white">
              {empresa.grupo_id ? (
                <span className="font-mono text-purple-400">{empresa.grupo_id.slice(0, 12)}...</span>
              ) : (
                <span className="text-dark-500 font-normal">Nenhum grupo vinculado</span>
              )}
            </span>
          </div>

          <div className="p-3 bg-dark-900/80 rounded-xl border border-dark-700/60">
            <span className="text-xs text-dark-400 block mb-1">Saldo em Caixa Informado</span>
            <span className="text-sm font-semibold text-emerald-400 font-mono">
              {empresa.saldo_caixa !== null && empresa.saldo_caixa !== undefined
                ? `R$ ${Number(empresa.saldo_caixa).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                : 'R$ 0,00'}
            </span>
          </div>

          <div className="p-3 bg-dark-900/80 rounded-xl border border-dark-700/60">
            <span className="text-xs text-dark-400 block mb-1">Adicionado ao Grupo em</span>
            <span className="text-sm font-medium text-dark-300">
              {empresa.grupo_adicionado_em
                ? new Date(empresa.grupo_adicionado_em).toLocaleDateString('pt-BR')
                : 'Não vinculado'}
            </span>
          </div>
        </div>
      </div>

      {/* 2. INFORMAÇÕES DE AUDITORIA INTERNA */}
      <div className="bg-dark-800/80 border border-dark-700/70 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2.5 pb-3 border-b border-dark-700/60">
          <Calendar className="text-blue-400" size={18} />
          <h4 className="font-semibold text-white text-sm">Metadados & Auditoria do Registro</h4>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3 bg-dark-900/80 rounded-xl border border-dark-700/60 flex items-center justify-between">
            <div>
              <span className="text-dark-400 block mb-0.5">Identificador UUID (Supabase)</span>
              <span className="font-mono text-dark-200 text-[11px]">{empresa.id}</span>
            </div>
            <button
              type="button"
              onClick={handleCopiarId}
              className="p-1.5 hover:bg-dark-700 rounded-lg text-dark-400 hover:text-white transition-colors"
              title="Copiar UUID"
            >
              {copiadoId ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            </button>
          </div>

          <div className="p-3 bg-dark-900/80 rounded-xl border border-dark-700/60">
            <span className="text-dark-400 block mb-0.5">Data de Criação do Cadastro</span>
            <span className="text-white font-medium">
              {empresa.created_at
                ? new Date(empresa.created_at).toLocaleString('pt-BR')
                : 'Não registrada'}
            </span>
          </div>
        </div>
      </div>

      {/* 3. ZONA DE PERIGO (DESTRUTIVO) */}
      <div className="bg-red-950/20 border border-red-900/50 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-red-900/30">
          <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400 flex-shrink-0">
            <ShieldAlert size={20} />
          </div>
          <div>
            <h4 className="font-semibold text-red-300 text-base">Zona de Perigo</h4>
            <p className="text-xs text-red-400/80">Ações irreversíveis que afetam os registros e dados operacionais desta empresa</p>
          </div>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="max-w-xl text-xs text-dark-300 space-y-1">
            <p className="font-medium text-white">Excluir permanentemente esta empresa</p>
            <p className="text-dark-400">
              Esta ação removerá a empresa e todos os seus vínculos em cascata (fornecedores, regras De-Para, logs de integração e configurações fiscais). Esta operação não pode ser desfeita.
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
            <div className="flex items-center gap-2 p-2 bg-dark-900/90 border border-red-500/40 rounded-xl">
              <span className="text-xs text-red-300 font-medium px-2">Tem certeza absoluta?</span>
              <button
                type="button"
                onClick={() => setConfirmandoExclusao(false)}
                className="px-3 py-1 bg-dark-800 hover:bg-dark-700 text-dark-300 text-xs rounded-lg transition-colors"
                disabled={excluindo}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExecutarExclusao}
                disabled={excluindo}
                className="px-3 py-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1"
              >
                {excluindo ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                <span>{excluindo ? 'Excluindo...' : 'Sim, Excluir'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
