'use client'

import React from 'react'
import { Empresa } from '@/types'
import { formatCNPJ } from '@/lib/utils'
import { 
  Copy, 
  Sparkles, 
  Building2, 
  MessageSquare, 
  Database, 
  FileText, 
  CreditCard, 
  ShoppingBag, 
  ChevronRight,
  Star
} from 'lucide-react'
import toast from 'react-hot-toast'

interface EmpresaCardMasterProps {
  empresa: Empresa
  isAtiva: boolean
  isSelecionada: boolean
  onSelecionarParaVer: () => void
  onDefinirComoAtiva: () => void
  onCopiarWhatsApp: (modulo: 'financeiro' | 'vendas') => void
  getAvatarGradient: (id: string) => string
}

export function EmpresaCardMaster({
  empresa,
  isAtiva,
  isSelecionada,
  onSelecionarParaVer,
  onDefinirComoAtiva,
  onCopiarWhatsApp,
  getAvatarGradient
}: EmpresaCardMasterProps) {

  const copiarCnpj = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!empresa.cnpj) return
    navigator.clipboard.writeText(empresa.cnpj.replace(/\D/g, ''))
    toast.success('CNPJ copiado!')
  }

  // Identificação de conexões para semáforos visuais
  const hasDatacar = !!(empresa.datacar_token && empresa.datacar_cod_emp && empresa.datacar_id_operador)
  const isSomenteBanco = (empresa.datacar_cod_emp || '').endsWith('_sb')
  const hasCaFin = !!(empresa.conta_azul_connected || empresa.access_token_conta_azul)
  const hasCaVendas = !!(empresa.conta_azul_vendas_connected || empresa.access_token_conta_azul_vendas)
  const hasNfse = !!(empresa.emite_nfse || empresa.optante_simples)

  const iniciais = (empresa.nome || 'E')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0].toUpperCase())
    .join('')

  return (
    <div
      onClick={onSelecionarParaVer}
      className={`relative group rounded-2xl p-4 transition-all duration-200 cursor-pointer border ${
        isSelecionada
          ? 'bg-dark-800/95 border-blue-500/80 shadow-lg shadow-blue-500/10 ring-1 ring-blue-500/50'
          : 'bg-dark-800/60 border-dark-700/70 hover:bg-dark-800/90 hover:border-dark-600/90'
      }`}
    >
      {/* Indicador de empresa selecionada na barra lateral */}
      {isSelecionada && (
        <div className="absolute -left-1 top-4 bottom-4 w-1.5 bg-blue-500 rounded-r-full shadow-glow-sm" />
      )}

      {/* Topo do Card: Avatar, Nome, Razão Social e Badge Ativa */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          {/* Avatar com Gradiente */}
          <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${getAvatarGradient(empresa.id)} flex items-center justify-center text-white font-bold text-sm shadow-md flex-shrink-0 mt-0.5`}>
            {iniciais || <Building2 size={18} />}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-white text-base truncate group-hover:text-blue-300 transition-colors">
                {empresa.nome}
              </h3>
            </div>

            {empresa.razao_social && empresa.razao_social !== empresa.nome && (
              <p className="text-xs text-dark-400 truncate mt-0.5">
                {empresa.razao_social}
              </p>
            )}

            <div className="flex items-center gap-2 mt-1.5 text-xs text-dark-300">
              <span className="font-mono bg-dark-900/80 px-2 py-0.5 rounded border border-dark-700/60 flex items-center gap-1.5">
                {empresa.cnpj ? formatCNPJ(empresa.cnpj) : 'Sem CNPJ'}
                {empresa.cnpj && (
                  <button
                    onClick={copiarCnpj}
                    title="Copiar CNPJ"
                    className="text-dark-400 hover:text-white transition-colors"
                  >
                    <Copy size={12} />
                  </button>
                )}
              </span>

              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider border ${
                empresa.tipo_empresa === 'ambos'
                  ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                  : empresa.tipo_empresa === 'vendas'
                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              }`}>
                {empresa.tipo_empresa || 'ambos'}
              </span>
            </div>
          </div>
        </div>

        {/* Badge / Ação Empresa Ativa */}
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {isAtiva ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-sm animate-pulse">
              <Sparkles size={13} className="text-emerald-400" />
              <span>Ativa</span>
            </span>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDefinirComoAtiva()
              }}
              title="Definir como empresa ativa no sistema"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-dark-400 hover:text-white bg-dark-900/60 hover:bg-dark-700/80 border border-dark-700/50 transition-colors"
            >
              <Star size={12} />
              <span>Tornar Ativa</span>
            </button>
          )}
        </div>
      </div>

      {/* Grid de Semáforos Visuais Compactos (4 Serviços) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mt-3.5 pt-3 border-t border-dark-700/50">
        {/* Semáforo Datacar */}
        <div 
          title={hasDatacar ? `Datacar conectado (Filial: ${empresa.datacar_cod_emp || 'N/D'})` : 'Datacar não configurado'}
          className={`px-2 py-1 rounded-lg border text-[11px] font-medium flex items-center justify-between ${
            hasDatacar 
              ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-300' 
              : 'bg-dark-900/60 border-dark-700/40 text-dark-500'
          }`}
        >
          <span className="flex items-center gap-1 truncate">
            <Database size={11} className="flex-shrink-0" />
            <span className="truncate">Datacar</span>
          </span>
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${hasDatacar ? 'bg-emerald-400 shadow-glow-sm' : 'bg-red-500/80'}`} />
        </div>

        {/* Semáforo Conta Azul Financeiro */}
        <div 
          title={hasCaFin ? 'Conta Azul Financeiro Conectado' : 'Conta Azul Financeiro Desconectado'}
          className={`px-2 py-1 rounded-lg border text-[11px] font-medium flex items-center justify-between ${
            hasCaFin 
              ? 'bg-blue-950/30 border-blue-800/40 text-blue-300' 
              : 'bg-dark-900/60 border-dark-700/40 text-dark-500'
          }`}
        >
          <span className="flex items-center gap-1 truncate">
            <CreditCard size={11} className="flex-shrink-0" />
            <span className="truncate">CA Fin</span>
          </span>
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${hasCaFin ? 'bg-emerald-400 shadow-glow-sm' : 'bg-red-500/80'}`} />
        </div>

        {/* Semáforo Conta Azul Vendas */}
        <div 
          title={hasCaVendas ? 'Conta Azul Vendas Conectado' : 'Conta Azul Vendas Desconectado'}
          className={`px-2 py-1 rounded-lg border text-[11px] font-medium flex items-center justify-between ${
            hasCaVendas 
              ? 'bg-purple-950/30 border-purple-800/40 text-purple-300' 
              : 'bg-dark-900/60 border-dark-700/40 text-dark-500'
          }`}
        >
          <span className="flex items-center gap-1 truncate">
            <ShoppingBag size={11} className="flex-shrink-0" />
            <span className="truncate">CA Vendas</span>
          </span>
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${hasCaVendas ? 'bg-emerald-400 shadow-glow-sm' : 'bg-red-500/80'}`} />
        </div>

        {/* Semáforo NFS-e Gov.br */}
        <div 
          title={hasNfse ? 'NFS-e Gov.br Habilitada' : 'NFS-e Gov.br Inativa'}
          className={`px-2 py-1 rounded-lg border text-[11px] font-medium flex items-center justify-between ${
            hasNfse 
              ? 'bg-teal-950/30 border-teal-800/40 text-teal-300' 
              : 'bg-dark-900/60 border-dark-700/40 text-dark-500'
          }`}
        >
          <span className="flex items-center gap-1 truncate">
            <FileText size={11} className="flex-shrink-0" />
            <span className="truncate">NFS-e</span>
          </span>
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${hasNfse ? 'bg-emerald-400 shadow-glow-sm' : 'bg-dark-600'}`} />
        </div>
      </div>

      {/* Rodapé do Card: Atalhos Rápidos */}
      <div className="flex items-center justify-between mt-3 pt-2 text-xs">
        <div className="flex items-center gap-2">
          {hasCaFin && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onCopiarWhatsApp('financeiro')
              }}
              title="Copiar link de WhatsApp do Financeiro"
              className="flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              <MessageSquare size={12} />
              <span>Whats Fin</span>
            </button>
          )}

          {hasCaVendas && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onCopiarWhatsApp('vendas')
              }}
              title="Copiar link de WhatsApp de Vendas"
              className="flex items-center gap-1 text-[11px] text-purple-400 hover:text-purple-300 transition-colors"
            >
              <MessageSquare size={12} />
              <span>Whats Vendas</span>
            </button>
          )}
        </div>

        <span className="inline-flex items-center gap-1 text-[11px] text-dark-400 group-hover:text-blue-400 font-medium transition-colors">
          <span>Ver Detalhes</span>
          <ChevronRight size={14} />
        </span>
      </div>
    </div>
  )
}
