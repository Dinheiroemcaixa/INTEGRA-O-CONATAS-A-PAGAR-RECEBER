'use client'

import React, { useState } from 'react'
import { Empresa } from '@/types'
import { formatCNPJ } from '@/lib/utils'
import { 
  Building2, 
  CreditCard, 
  ShoppingBag, 
  Database, 
  FileText, 
  Sparkles, 
  Star, 
  Copy, 
  Check, 
  MessageSquare, 
  ExternalLink,
  ChevronRight,
  X,
  Link,
  ShieldCheck,
  AlertCircle
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
  const [copiadoCnpj, setCopiadoCnpj] = useState(false)
  const [copiadoLink, setCopiadoLink] = useState(false)
  const [modalModulo, setModalModulo] = useState<'financeiro' | 'vendas' | null>(null)

  const hasDatacar = Boolean(empresa.datacar_token)
  const hasCaFin = Boolean(empresa.conta_azul_connected || empresa.access_token_conta_azul)
  const hasCaVendas = Boolean(empresa.conta_azul_vendas_connected || empresa.access_token_conta_azul_vendas)
  const hasNfse = Boolean(empresa.emite_nfse || (empresa as any).configuracao_fiscal?.[0]?.emissao_ativa)

  const handleCopiarCnpj = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!empresa.cnpj) return
    navigator.clipboard.writeText(empresa.cnpj.replace(/\D/g, ''))
    setCopiadoCnpj(true)
    toast.success('CNPJ copiado!')
    setTimeout(() => setCopiadoCnpj(false), 2000)
  }

  // Gera a URL do OAuth do Conta Azul para o módulo
  const getOAuthUrl = (modulo: 'financeiro' | 'vendas') => {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    return `${origin}/api/conta-azul/autorizar?empresa_id=${empresa.id}&modulo=${modulo}`
  }

  const handleCopiarLinkOAuth = (modulo: 'financeiro' | 'vendas') => {
    const url = getOAuthUrl(modulo)
    navigator.clipboard.writeText(url)
    setCopiadoLink(true)
    toast.success('Link de autorização OAuth copiado!')
    setTimeout(() => setCopiadoLink(false), 2000)
  }

  const handleReconectar = (modulo: 'financeiro' | 'vendas') => {
    const url = getOAuthUrl(modulo)
    window.location.href = url
  }

  return (
    <>
      <div
        onClick={onSelecionarParaVer}
        className={`group relative p-4 rounded-2xl transition-all duration-200 cursor-pointer border text-left ${
          isSelecionada
            ? 'bg-dark-800/95 border-primary-500/80 shadow-lg shadow-primary-500/10 ring-1 ring-primary-500/40'
            : 'bg-dark-850/70 hover:bg-dark-800/80 border-dark-700/60 hover:border-dark-600/80'
        }`}
      >
        {/* Barra lateral de seleção ativa */}
        {isSelecionada && (
          <div className="absolute left-0 top-3 bottom-3 w-1 bg-gradient-to-b from-primary-400 to-primary-600 rounded-r-full" />
        )}

        {/* Topo do Card: Avatar, Identificação e Status Ativo */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            {/* Avatar com Gradiente Exclusivo */}
            <div
              className={`w-11 h-11 rounded-xl bg-gradient-to-br ${getAvatarGradient(
                empresa.id
              )} flex items-center justify-center text-white font-bold text-sm shadow-md flex-shrink-0 relative`}
            >
              {empresa.nome ? empresa.nome.slice(0, 2).toUpperCase() : <Building2 size={18} />}
              {isAtiva && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 border-2 border-dark-900 rounded-full shadow-glow-sm" />
              )}
            </div>

            {/* Informações Textuais */}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3 className="font-bold text-white text-sm truncate leading-snug group-hover:text-primary-300 transition-colors">
                  {empresa.nome}
                </h3>
                {empresa.tipo_empresa && (
                  <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-dark-700/60 text-dark-300 border border-dark-600/40">
                    {empresa.tipo_empresa}
                  </span>
                )}
              </div>

              {/* Razão Social (se houver e for diferente do apelido) */}
              {empresa.razao_social && empresa.razao_social !== empresa.nome && (
                <p className="text-xs text-dark-400 truncate mt-0.5">
                  {empresa.razao_social}
                </p>
              )}

              {/* CNPJ com botão de cópia */}
              {empresa.cnpj && (
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-xs font-mono text-dark-400">
                    {formatCNPJ(empresa.cnpj)}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopiarCnpj}
                    title="Copiar CNPJ"
                    className="p-0.5 text-dark-400 hover:text-white rounded hover:bg-dark-700/50 transition-colors"
                  >
                    {copiadoCnpj ? (
                      <Check size={12} className="text-emerald-400" />
                    ) : (
                      <Copy size={12} />
                    )}
                  </button>
                </div>
              )}
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
                type="button"
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

        {/* Grid de Semáforos Visuais Operacionais com Atalhos Interativos */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mt-3.5 pt-3 border-t border-dark-700/50">
          {/* Semáforo Datacar */}
          <div 
            title={hasDatacar ? `Datacar conectado (Filial: ${empresa.datacar_cod_emp || 'N/D'})` : 'Datacar não configurado'}
            className={`px-2 py-1.5 rounded-lg border text-[11px] font-medium flex items-center justify-between select-none ${
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

          {/* Semáforo Conta Azul Financeiro - ATALHO INTERATIVO CLICÁVEL */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setModalModulo('financeiro')
            }}
            title={hasCaFin ? 'Clique para gerenciar link ou WhatsApp do CA Financeiro (Conectado)' : 'Clique para gerar autorização OAuth do CA Financeiro (Desconectado)'}
            className={`px-2 py-1.5 rounded-lg border text-[11px] font-medium flex items-center justify-between transition-all group/btn ${
              hasCaFin 
                ? 'bg-blue-950/40 hover:bg-blue-900/50 border-blue-800/50 text-blue-300 hover:border-blue-700 shadow-sm cursor-pointer' 
                : 'bg-dark-900/80 hover:bg-dark-800 border-dark-700/60 text-dark-400 hover:text-dark-200 hover:border-dark-600 cursor-pointer'
            }`}
          >
            <span className="flex items-center gap-1 truncate">
              <CreditCard size={11} className="flex-shrink-0 group-hover/btn:text-blue-400 transition-colors" />
              <span className="truncate font-semibold">CA Fin</span>
            </span>
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${hasCaFin ? 'bg-emerald-400 shadow-glow-sm' : 'bg-red-500/80'}`} />
          </button>

          {/* Semáforo Conta Azul Vendas - ATALHO INTERATIVO CLICÁVEL */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setModalModulo('vendas')
            }}
            title={hasCaVendas ? 'Clique para gerenciar link ou WhatsApp do CA Vendas (Conectado)' : 'Clique para gerar autorização OAuth do CA Vendas (Desconectado)'}
            className={`px-2 py-1.5 rounded-lg border text-[11px] font-medium flex items-center justify-between transition-all group/btn ${
              hasCaVendas 
                ? 'bg-purple-950/40 hover:bg-purple-900/50 border-purple-800/50 text-purple-300 hover:border-purple-700 shadow-sm cursor-pointer' 
                : 'bg-dark-900/80 hover:bg-dark-800 border-dark-700/60 text-dark-400 hover:text-dark-200 hover:border-dark-600 cursor-pointer'
            }`}
          >
            <span className="flex items-center gap-1 truncate">
              <ShoppingBag size={11} className="flex-shrink-0 group-hover/btn:text-purple-400 transition-colors" />
              <span className="truncate font-semibold">CA Vendas</span>
            </span>
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${hasCaVendas ? 'bg-emerald-400 shadow-glow-sm' : 'bg-red-500/80'}`} />
          </button>

          {/* Semáforo NFS-e Gov.br */}
          <div 
            title={hasNfse ? 'NFS-e Gov.br Habilitada' : 'NFS-e Gov.br Inativa'}
            className={`px-2 py-1.5 rounded-lg border text-[11px] font-medium flex items-center justify-between select-none ${
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
                type="button"
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
                type="button"
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

          <div className="flex items-center gap-1 text-[11px] text-dark-400 group-hover:text-white transition-colors ml-auto">
            <span>Ver detalhes</span>
            <ChevronRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>
      </div>

      {/* MODAL / POPOVER DE AÇÃO RÁPIDA DE AUTORIZAÇÃO CONTA AZUL */}
      {modalModulo && (
        <div 
          onClick={(e) => {
            e.stopPropagation()
            setModalModulo(null)
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-dark-850 border border-dark-700/90 rounded-2xl p-5 max-w-sm w-full shadow-2xl space-y-4"
          >
            {/* Cabeçalho do Modal Rápido */}
            <div className="flex items-center justify-between pb-3 border-b border-dark-700/70">
              <div className="flex items-center gap-2.5">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                  modalModulo === 'financeiro' 
                    ? 'bg-blue-500/15 border border-blue-500/30 text-blue-400' 
                    : 'bg-purple-500/15 border border-purple-500/30 text-purple-400'
                }`}>
                  {modalModulo === 'financeiro' ? <CreditCard size={18} /> : <ShoppingBag size={18} />}
                </div>
                <div>
                  <h4 className="font-bold text-white text-sm">
                    Conta Azul {modalModulo === 'financeiro' ? 'Financeiro' : 'Vendas'}
                  </h4>
                  <p className="text-xs text-dark-400 truncate max-w-[200px]">{empresa.nome}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalModulo(null)}
                className="p-1.5 text-dark-400 hover:text-white rounded-lg hover:bg-dark-700 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Status Atual da Conexão */}
            <div className="p-3 bg-dark-900/80 rounded-xl border border-dark-700/60 flex items-center justify-between">
              <span className="text-xs text-dark-400">Status da Conexão:</span>
              {(modalModulo === 'financeiro' ? hasCaFin : hasCaVendas) ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                  <ShieldCheck size={14} className="text-emerald-400" />
                  <span>Conectado</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-400">
                  <AlertCircle size={14} className="text-red-400" />
                  <span>Desconectado</span>
                </span>
              )}
            </div>

            {/* Ações Rápidas (Copiar Link, WhatsApp, Reconectar/Conectar) */}
            <div className="space-y-2">
              {/* Botão Copiar Link OAuth */}
              <button
                type="button"
                onClick={() => handleCopiarLinkOAuth(modalModulo)}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-dark-800 hover:bg-dark-700 border border-dark-700/80 hover:border-dark-600 rounded-xl text-xs font-medium text-white transition-colors"
              >
                {copiadoLink ? <Check size={14} className="text-emerald-400" /> : <Link size={14} className="text-blue-400" />}
                <span>{copiadoLink ? 'Link Copiado para Área de Transferência!' : 'Copiar Link OAuth'}</span>
              </button>

              {/* Botão Copiar WhatsApp */}
              <button
                type="button"
                onClick={() => {
                  onCopiarWhatsApp(modalModulo)
                  toast.success('Mensagem de WhatsApp formatada com link copiada!')
                }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/30 hover:border-emerald-500/50 rounded-xl text-xs font-medium text-emerald-300 transition-colors"
              >
                <MessageSquare size={14} className="text-emerald-400" />
                <span>Copiar Mensagem WhatsApp</span>
              </button>

              {/* Botão Conectar / Reconectar */}
              <button
                type="button"
                onClick={() => handleReconectar(modalModulo)}
                className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 text-white rounded-xl text-xs font-semibold transition-colors shadow-sm ${
                  modalModulo === 'financeiro' 
                    ? 'bg-blue-600 hover:bg-blue-500' 
                    : 'bg-purple-600 hover:bg-purple-500'
                }`}
              >
                <ExternalLink size={14} />
                <span>
                  {(modalModulo === 'financeiro' ? hasCaFin : hasCaVendas) 
                    ? 'Reconectar OAuth' 
                    : 'Conectar Conta Azul Agora'}
                </span>
              </button>
            </div>

            <div className="pt-1 text-center">
              <button
                type="button"
                onClick={() => setModalModulo(null)}
                className="text-xs text-dark-400 hover:text-white transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
