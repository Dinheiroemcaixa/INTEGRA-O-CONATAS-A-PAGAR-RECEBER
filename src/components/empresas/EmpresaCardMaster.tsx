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
  AlertCircle,
  Settings,
  Activity,
  Loader2
} from 'lucide-react'
import toast from 'react-hot-toast'

interface EmpresaCardMasterProps {
  empresa: Empresa
  isAtiva: boolean
  isSelecionada: boolean
  onSelecionarParaVer: () => void
  onDefinirComoAtiva: () => void
  onCopiarWhatsApp: (modulo: 'financeiro' | 'vendas') => void
  onAbrirAba?: (aba: 'geral' | 'integracoes' | 'fornecedores' | 'fiscal' | 'avancado') => void
  getAvatarGradient: (id: string) => string
}

export function EmpresaCardMaster({
  empresa,
  isAtiva,
  isSelecionada,
  onSelecionarParaVer,
  onDefinirComoAtiva,
  onCopiarWhatsApp,
  onAbrirAba,
  getAvatarGradient
}: EmpresaCardMasterProps) {
  const [copiadoCnpj, setCopiadoCnpj] = useState(false)
  const [copiadoLink, setCopiadoLink] = useState(false)
  const [modalAtivo, setModalAtivo] = useState<'datacar' | 'financeiro' | 'vendas' | 'nfse' | null>(null)
  const [testandoDatacar, setTestandoDatacar] = useState(false)

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

  const handleConectarOuReconectar = (modulo: 'financeiro' | 'vendas') => {
    const url = getOAuthUrl(modulo)
    window.location.href = url
  }

  const handleTestarConexaoDatacar = async () => {
    setTestandoDatacar(true)
    try {
      const res = await fetch('/api/datacar/testar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresa_id: empresa.id }),
      })
      const json = await res.json()
      if (res.ok && json.ok) {
        toast.success('Conexão Datacar validada com sucesso!')
      } else {
        toast.error(json.mensagem || json.error || 'Falha ao testar Datacar')
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao conectar ao Datacar')
    } finally {
      setTestandoDatacar(false)
    }
  }

  const handleNavegarParaAba = (aba: 'geral' | 'integracoes' | 'fornecedores' | 'fiscal' | 'avancado') => {
    setModalAtivo(null)
    if (onAbrirAba) {
      onAbrirAba(aba)
    } else {
      onSelecionarParaVer()
    }
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
              </div>

              {/* Razão Social */}
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

        {/* Grid de Semáforos Visuais Operacionais Clicáveis (4 Serviços) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mt-3.5 pt-3 border-t border-dark-700/50">
          {/* 1. Semáforo Datacar (Clicável) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setModalAtivo('datacar')
            }}
            title={hasDatacar ? 'Datacar Configurado - Clique para opções' : 'Datacar Não Configurado - Clique para configurar'}
            className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-medium flex items-center justify-between transition-all cursor-pointer hover:scale-[1.02] shadow-sm ${
              hasDatacar 
                ? 'bg-emerald-950/40 hover:bg-emerald-900/50 border-emerald-800/50 text-emerald-300' 
                : 'bg-dark-900/80 hover:bg-dark-800 border-dark-700/60 text-dark-400 hover:text-dark-200'
            }`}
          >
            <span className="flex items-center gap-1 truncate">
              <Database size={11} className={hasDatacar ? 'text-emerald-400' : 'text-dark-500'} />
              <span className="truncate font-semibold">Datacar</span>
            </span>
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${hasDatacar ? 'bg-emerald-400 shadow-glow-sm' : 'bg-dark-600'}`} />
          </button>

          {/* 2. Semáforo Conta Azul Financeiro (Clicável) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setModalAtivo('financeiro')
            }}
            title={hasCaFin ? 'CA Financeiro Conectado - Clique para gerenciar links' : 'CA Financeiro Não Conectado - Clique para autorizar'}
            className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-medium flex items-center justify-between transition-all cursor-pointer hover:scale-[1.02] shadow-sm ${
              hasCaFin 
                ? 'bg-emerald-950/40 hover:bg-emerald-900/50 border-emerald-800/50 text-emerald-300' 
                : 'bg-red-950/20 hover:bg-red-900/30 border-red-900/40 text-red-300 hover:text-red-200'
            }`}
          >
            <span className="flex items-center gap-1 truncate">
              <CreditCard size={11} className={hasCaFin ? 'text-emerald-400' : 'text-red-400'} />
              <span className="truncate font-semibold">CA Fin</span>
            </span>
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${hasCaFin ? 'bg-emerald-400 shadow-glow-sm' : 'bg-red-500'}`} />
          </button>

          {/* 3. Semáforo Conta Azul Vendas (Clicável) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setModalAtivo('vendas')
            }}
            title={hasCaVendas ? 'CA Vendas Conectado - Clique para gerenciar links' : 'CA Vendas Não Conectado - Clique para autorizar'}
            className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-medium flex items-center justify-between transition-all cursor-pointer hover:scale-[1.02] shadow-sm ${
              hasCaVendas 
                ? 'bg-emerald-950/40 hover:bg-emerald-900/50 border-emerald-800/50 text-emerald-300' 
                : 'bg-red-950/20 hover:bg-red-900/30 border-red-900/40 text-red-300 hover:text-red-200'
            }`}
          >
            <span className="flex items-center gap-1 truncate">
              <ShoppingBag size={11} className={hasCaVendas ? 'text-emerald-400' : 'text-red-400'} />
              <span className="truncate font-semibold">CA Vendas</span>
            </span>
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${hasCaVendas ? 'bg-emerald-400 shadow-glow-sm' : 'bg-red-500'}`} />
          </button>

          {/* 4. Semáforo NFS-e Gov.br (Clicável) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setModalAtivo('nfse')
            }}
            title={hasNfse ? 'NFS-e Gov.br Configurada - Clique para opções' : 'NFS-e Gov.br Pendente - Clique para configurar'}
            className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-medium flex items-center justify-between transition-all cursor-pointer hover:scale-[1.02] shadow-sm ${
              hasNfse 
                ? 'bg-emerald-950/40 hover:bg-emerald-900/50 border-emerald-800/50 text-emerald-300' 
                : 'bg-dark-900/80 hover:bg-dark-800 border-dark-700/60 text-dark-400 hover:text-dark-200'
            }`}
          >
            <span className="flex items-center gap-1 truncate">
              <FileText size={11} className={hasNfse ? 'text-emerald-400' : 'text-dark-500'} />
              <span className="truncate font-semibold">NFS-e</span>
            </span>
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${hasNfse ? 'bg-emerald-400 shadow-glow-sm' : 'bg-dark-600'}`} />
          </button>
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
                title="Copiar mensagem de WhatsApp do Financeiro"
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
                title="Copiar mensagem de WhatsApp de Vendas"
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

      {/* MODAIS RÁPIDOS PARA CADA SERVIÇO */}
      {modalAtivo && (
        <div 
          onClick={(e) => {
            e.stopPropagation()
            setModalAtivo(null)
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-dark-850 border border-dark-700/90 rounded-2xl p-5 max-w-sm w-full shadow-2xl space-y-4 animate-scaleUp"
          >
            {/* 1. CASO CONTA AZUL FINANCEIRO OU VENDAS */}
            {(modalAtivo === 'financeiro' || modalAtivo === 'vendas') && (() => {
              const isFin = modalAtivo === 'financeiro'
              const conectado = isFin ? hasCaFin : hasCaVendas
              const nomeServico = isFin ? 'Conta Azul Financeiro' : 'Conta Azul Vendas'

              return (
                <>
                  <div className="flex items-center justify-between pb-3 border-b border-dark-700/70">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                        isFin 
                          ? 'bg-blue-500/15 border border-blue-500/30 text-blue-400' 
                          : 'bg-purple-500/15 border border-purple-500/30 text-purple-400'
                      }`}>
                        {isFin ? <CreditCard size={18} /> : <ShoppingBag size={18} />}
                      </div>
                      <div>
                        <h4 className="font-bold text-white text-sm">{nomeServico}</h4>
                        <p className="text-xs text-dark-400 truncate max-w-[200px]">{empresa.nome}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setModalAtivo(null)}
                      className="p-1.5 text-dark-400 hover:text-white rounded-lg hover:bg-dark-700 transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {/* Status */}
                  <div className="p-3 bg-dark-900/80 rounded-xl border border-dark-700/60 flex items-center justify-between">
                    <span className="text-xs text-dark-400">Status:</span>
                    {conectado ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-glow-sm" />
                        <span>Conectado</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-400">
                        <span className="w-2 h-2 rounded-full bg-red-500" />
                        <span>Não Conectado</span>
                      </span>
                    )}
                  </div>

                  {/* Ações */}
                  <div className="space-y-2">
                    {conectado ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleCopiarLinkOAuth(modalAtivo)}
                          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-dark-800 hover:bg-dark-700 border border-dark-700/80 hover:border-dark-600 rounded-xl text-xs font-medium text-white transition-colors"
                        >
                          {copiadoLink ? <Check size={14} className="text-emerald-400" /> : <Link size={14} className="text-blue-400" />}
                          <span>{copiadoLink ? 'Link Copiado!' : 'Copiar Link de Autorização'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            onCopiarWhatsApp(modalAtivo)
                            toast.success('Mensagem de WhatsApp formatada com link copiada!')
                          }}
                          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/30 hover:border-emerald-500/50 rounded-xl text-xs font-medium text-emerald-300 transition-colors"
                        >
                          <MessageSquare size={14} className="text-emerald-400" />
                          <span>Copiar Mensagem WhatsApp</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleConectarOuReconectar(modalAtivo)}
                          className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 text-white rounded-xl text-xs font-semibold transition-colors shadow-sm ${
                            isFin ? 'bg-blue-600 hover:bg-blue-500' : 'bg-purple-600 hover:bg-purple-500'
                          }`}
                        >
                          <ExternalLink size={14} />
                          <span>Reconectar</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleNavegarParaAba('integracoes')}
                          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-dark-800/60 hover:bg-dark-800 border border-dark-700/50 rounded-xl text-xs font-medium text-dark-300 hover:text-white transition-colors"
                        >
                          <Settings size={13} />
                          <span>Abrir Configurações</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => handleConectarOuReconectar(modalAtivo)}
                          className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 text-white rounded-xl text-xs font-semibold transition-colors shadow-sm ${
                            isFin ? 'bg-blue-600 hover:bg-blue-500' : 'bg-purple-600 hover:bg-purple-500'
                          }`}
                        >
                          <ExternalLink size={14} />
                          <span>Conectar Agora</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCopiarLinkOAuth(modalAtivo)}
                          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-dark-800 hover:bg-dark-700 border border-dark-700/80 hover:border-dark-600 rounded-xl text-xs font-medium text-white transition-colors"
                        >
                          {copiadoLink ? <Check size={14} className="text-emerald-400" /> : <Link size={14} className="text-blue-400" />}
                          <span>{copiadoLink ? 'Link Copiado!' : 'Copiar Link'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            onCopiarWhatsApp(modalAtivo)
                            toast.success('Mensagem de WhatsApp formatada com link copiada!')
                          }}
                          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/30 hover:border-emerald-500/50 rounded-xl text-xs font-medium text-emerald-300 transition-colors"
                        >
                          <MessageSquare size={14} className="text-emerald-400" />
                          <span>Copiar Mensagem WhatsApp</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleNavegarParaAba('integracoes')}
                          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-dark-800/60 hover:bg-dark-800 border border-dark-700/50 rounded-xl text-xs font-medium text-dark-300 hover:text-white transition-colors"
                        >
                          <Settings size={13} />
                          <span>Abrir Configurações</span>
                        </button>
                      </>
                    )}
                  </div>
                </>
              )
            })()}

            {/* 2. CASO DATACAR ERP */}
            {modalAtivo === 'datacar' && (
              <>
                <div className="flex items-center justify-between pb-3 border-b border-dark-700/70">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                      <Database size={18} />
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-sm">Datacar ERP</h4>
                      <p className="text-xs text-dark-400 truncate max-w-[200px]">{empresa.nome}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setModalAtivo(null)}
                    className="p-1.5 text-dark-400 hover:text-white rounded-lg hover:bg-dark-700 transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Status */}
                <div className="p-3 bg-dark-900/80 rounded-xl border border-dark-700/60 flex items-center justify-between">
                  <span className="text-xs text-dark-400">Status:</span>
                  {hasDatacar ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-glow-sm" />
                      <span>Configurado</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-dark-400">
                      <span className="w-2 h-2 rounded-full bg-dark-500" />
                      <span>Não Configurado</span>
                    </span>
                  )}
                </div>

                {/* Ações */}
                <div className="space-y-2">
                  {hasDatacar ? (
                    <>
                      <button
                        type="button"
                        onClick={handleTestarConexaoDatacar}
                        disabled={testandoDatacar}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-colors shadow-sm"
                      >
                        {testandoDatacar ? <Loader2 size={14} className="animate-spin" /> : <Activity size={14} />}
                        <span>{testandoDatacar ? 'Testando Conexão...' : 'Testar Conexão'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleNavegarParaAba('integracoes')}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-dark-800 hover:bg-dark-700 border border-dark-700/80 hover:border-dark-600 rounded-xl text-xs font-medium text-white transition-colors"
                      >
                        <Settings size={14} className="text-primary-400" />
                        <span>Abrir Configurações</span>
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleNavegarParaAba('integracoes')}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-xs font-semibold transition-colors shadow-sm"
                    >
                      <Settings size={14} />
                      <span>Configurar Agora</span>
                    </button>
                  )}
                </div>
              </>
            )}

            {/* 3. CASO NFS-e GOV.BR */}
            {modalAtivo === 'nfse' && (
              <>
                <div className="flex items-center justify-between pb-3 border-b border-dark-700/70">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-400">
                      <FileText size={18} />
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-sm">NFS-e Gov.br</h4>
                      <p className="text-xs text-dark-400 truncate max-w-[200px]">{empresa.nome}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setModalAtivo(null)}
                    className="p-1.5 text-dark-400 hover:text-white rounded-lg hover:bg-dark-700 transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Status */}
                <div className="p-3 bg-dark-900/80 rounded-xl border border-dark-700/60 flex items-center justify-between">
                  <span className="text-xs text-dark-400">Status:</span>
                  {hasNfse ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-glow-sm" />
                      <span>Configurado</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400">
                      <span className="w-2 h-2 rounded-full bg-amber-400" />
                      <span>Pendente</span>
                    </span>
                  )}
                </div>

                {/* Ações */}
                <div className="space-y-2">
                  {hasNfse ? (
                    <button
                      type="button"
                      onClick={() => handleNavegarParaAba('fiscal')}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-dark-800 hover:bg-dark-700 border border-dark-700/80 hover:border-dark-600 rounded-xl text-xs font-medium text-white transition-colors"
                    >
                      <Settings size={14} className="text-teal-400" />
                      <span>Abrir Configuração Fiscal</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleNavegarParaAba('fiscal')}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-xs font-semibold transition-colors shadow-sm"
                    >
                      <Settings size={14} />
                      <span>Configurar Agora</span>
                    </button>
                  )}
                </div>
              </>
            )}

            <div className="pt-1 text-center">
              <button
                type="button"
                onClick={() => setModalAtivo(null)}
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
