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
  ChevronDown,
  ChevronUp,
  X,
  Link,
  Settings,
  Activity,
  Loader2,
  SlidersHorizontal,
  Users
} from 'lucide-react'
import toast from 'react-hot-toast'
import { AbaGeral } from './AbaGeral'
import { AbaIntegracoes } from './AbaIntegracoes'
import { AbaFornecedores } from './AbaFornecedores'
import { AbaFiscal } from './AbaFiscal'
import { AbaAvancado } from './AbaAvancado'

export type TipoAbaEmpresa = 'geral' | 'integracoes' | 'fornecedores' | 'fiscal' | 'avancado'

interface EmpresaCardAccordionProps {
  empresa: Empresa
  isAtiva: boolean
  menuAtivo: TipoAbaEmpresa | null
  onToggleMenu: (menu: TipoAbaEmpresa) => void
  onDefinirComoAtiva: () => void
  onEmpresaAtualizada: (empresaAtualizada: Empresa) => void
  onConectarContaAzul: (empresaId: string, modulo?: 'financeiro' | 'vendas') => void
  onDesconectarContaAzul: (empresaId: string, modulo?: 'financeiro' | 'vendas') => Promise<void>
  onCopiarWhatsApp: (modulo: 'financeiro' | 'vendas') => void
  onExcluirEmpresa: (empresaId: string) => Promise<void>
  getAvatarGradient: (id: string) => string
}

export function EmpresaCardAccordion({
  empresa,
  isAtiva,
  menuAtivo,
  onToggleMenu,
  onDefinirComoAtiva,
  onEmpresaAtualizada,
  onConectarContaAzul,
  onDesconectarContaAzul,
  onCopiarWhatsApp,
  onExcluirEmpresa,
  getAvatarGradient
}: EmpresaCardAccordionProps) {
  // Estados de cópia e modais rápidos de semáforo
  const [copiadoCnpj, setCopiadoCnpj] = useState(false)
  const [copiadoLink, setCopiadoLink] = useState(false)
  const [modalSemaforo, setModalSemaforo] = useState<'datacar' | 'financeiro' | 'vendas' | 'nfse' | null>(null)
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

  const abasDisponiveis: Array<{ id: TipoAbaEmpresa; label: string; icon: React.ReactNode }> = [
    { id: 'geral', label: 'Geral', icon: <Building2 size={13} /> },
    { id: 'integracoes', label: 'Integrações', icon: <SlidersHorizontal size={13} /> },
    { id: 'fornecedores', label: 'Fornecedores', icon: <Users size={13} /> },
    { id: 'fiscal', label: 'Fiscal', icon: <FileText size={13} /> },
    { id: 'avancado', label: 'Avançado', icon: <Settings size={13} /> },
  ]

  const estaExpandido = Boolean(menuAtivo)

  return (
    <>
      <div className={`rounded-xl border transition-all duration-150 ${
        estaExpandido 
          ? 'bg-dark-850 border-primary-500/50 shadow-lg shadow-primary-500/5 ring-1 ring-primary-500/20' 
          : 'bg-dark-850/80 hover:bg-dark-850 border-dark-700/60 hover:border-dark-600/80 shadow-xs'
      }`}>
        {/* HEADER COMPACTO DO CARD */}
        <div className="px-3.5 py-3 sm:px-4 sm:py-3.5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
            {/* Esquerda: Avatar + Identificação Enxuta */}
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`w-9 h-9 rounded-lg bg-gradient-to-br ${getAvatarGradient(
                  empresa.id
                )} flex items-center justify-center text-white font-bold text-xs shadow-xs flex-shrink-0 relative`}
              >
                {empresa.nome ? empresa.nome.slice(0, 2).toUpperCase() : <Building2 size={16} />}
                {isAtiva && (
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 border-2 border-dark-900 rounded-full shadow-glow-sm" />
                )}
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-white text-sm truncate leading-snug">
                    {empresa.nome}
                  </h3>
                  {isAtiva && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                      <Sparkles size={9} />
                      <span>Ativa</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 text-[11px] text-dark-400 font-mono mt-0.5 truncate">
                  {empresa.cnpj && (
                    <div className="flex items-center gap-1">
                      <span>{formatCNPJ(empresa.cnpj)}</span>
                      <button
                        type="button"
                        onClick={handleCopiarCnpj}
                        title="Copiar CNPJ"
                        className="p-0.5 text-dark-400 hover:text-white rounded hover:bg-dark-700/60 transition-colors"
                      >
                        {copiadoCnpj ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                      </button>
                    </div>
                  )}

                  {empresa.razao_social && empresa.razao_social !== empresa.nome && (
                    <>
                      <span className="text-dark-600 font-sans">•</span>
                      <span className="text-dark-400 truncate max-w-xs font-sans" title={empresa.razao_social}>
                        {empresa.razao_social}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Direita: Semáforos Compactos + Ação Empresa Ativa */}
            <div className="flex items-center gap-2 flex-wrap ml-auto md:ml-0">
              {/* Semáforos em Pílulas Compactas e Discretas */}
              <div className="flex items-center gap-1.5">
                {/* 1. Datacar */}
                <button
                  type="button"
                  onClick={() => setModalSemaforo('datacar')}
                  title={hasDatacar ? 'Datacar Configuração' : 'Datacar Não Configuração'}
                  className={`px-2 py-1 rounded-md border text-[10px] font-medium flex items-center gap-1.5 transition-all cursor-pointer hover:bg-dark-700/60 ${
                    hasDatacar 
                      ? 'bg-dark-900/60 border-dark-700/50 text-dark-200' 
                      : 'bg-dark-900/40 border-dark-700/40 text-dark-400'
                  }`}
                >
                  <Database size={11} className={hasDatacar ? 'text-emerald-400' : 'text-dark-500'} />
                  <span>Datacar</span>
                  <span className={`w-1.5 h-1.5 rounded-full ${hasDatacar ? 'bg-emerald-400 shadow-glow-sm' : 'bg-dark-600'}`} />
                </button>

                {/* 2. CA Fin */}
                <button
                  type="button"
                  onClick={() => setModalSemaforo('financeiro')}
                  title={hasCaFin ? 'CA Financeiro Conectado' : 'CA Financeiro Desconectado'}
                  className={`px-2 py-1 rounded-md border text-[10px] font-medium flex items-center gap-1.5 transition-all cursor-pointer hover:bg-dark-700/60 ${
                    hasCaFin 
                      ? 'bg-dark-900/60 border-dark-700/50 text-dark-200' 
                      : 'bg-red-950/20 border-red-900/40 text-red-300'
                  }`}
                >
                  <CreditCard size={11} className={hasCaFin ? 'text-emerald-400' : 'text-red-400'} />
                  <span>CA Fin</span>
                  <span className={`w-1.5 h-1.5 rounded-full ${hasCaFin ? 'bg-emerald-400 shadow-glow-sm' : 'bg-red-500'}`} />
                </button>

                {/* 3. CA Vendas */}
                <button
                  type="button"
                  onClick={() => setModalSemaforo('vendas')}
                  title={hasCaVendas ? 'CA Vendas Conectado' : 'CA Vendas Desconectado'}
                  className={`px-2 py-1 rounded-md border text-[10px] font-medium flex items-center gap-1.5 transition-all cursor-pointer hover:bg-dark-700/60 ${
                    hasCaVendas 
                      ? 'bg-dark-900/60 border-dark-700/50 text-dark-200' 
                      : 'bg-red-950/20 border-red-900/40 text-red-300'
                  }`}
                >
                  <ShoppingBag size={11} className={hasCaVendas ? 'text-emerald-400' : 'text-red-400'} />
                  <span>CA Vendas</span>
                  <span className={`w-1.5 h-1.5 rounded-full ${hasCaVendas ? 'bg-emerald-400 shadow-glow-sm' : 'bg-red-500'}`} />
                </button>

                {/* 4. NFS-e */}
                <button
                  type="button"
                  onClick={() => setModalSemaforo('nfse')}
                  title={hasNfse ? 'NFS-e Gov.br Configurada' : 'NFS-e Gov.br Pendente'}
                  className={`px-2 py-1 rounded-md border text-[10px] font-medium flex items-center gap-1.5 transition-all cursor-pointer hover:bg-dark-700/60 ${
                    hasNfse 
                      ? 'bg-dark-900/60 border-dark-700/50 text-dark-200' 
                      : 'bg-dark-900/40 border-dark-700/40 text-dark-400'
                  }`}
                >
                  <FileText size={11} className={hasNfse ? 'text-emerald-400' : 'text-dark-500'} />
                  <span>NFS-e</span>
                  <span className={`w-1.5 h-1.5 rounded-full ${hasNfse ? 'bg-emerald-400 shadow-glow-sm' : 'bg-dark-600'}`} />
                </button>
              </div>

              {/* Botão Tornar Ativa Discreto */}
              {!isAtiva && (
                <button
                  type="button"
                  onClick={onDefinirComoAtiva}
                  title="Definir como empresa ativa"
                  className="px-2 py-1 rounded-md text-[10px] font-medium text-dark-400 hover:text-white bg-dark-900/50 hover:bg-dark-800 border border-dark-700/50 transition-colors flex items-center gap-1"
                >
                  <Star size={11} className="text-dark-400 hover:text-amber-400" />
                  <span>Tornar Ativa</span>
                </button>
              )}
            </div>
          </div>

          {/* ABAS HORIZONTAIS DISCRETAS */}
          <div className="flex items-center gap-1 mt-2.5 pt-2 border-t border-dark-700/40 overflow-x-auto no-scrollbar flex-nowrap [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {abasDisponiveis.map(aba => {
              const ativa = menuAtivo === aba.id
              return (
                <button
                  key={aba.id}
                  type="button"
                  onClick={() => onToggleMenu(aba.id)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                    ativa
                      ? 'bg-primary-950/60 text-primary-300 border border-primary-500/40 font-semibold shadow-xs'
                      : 'text-dark-400 hover:text-dark-200 hover:bg-dark-800/60'
                  }`}
                >
                  {aba.icon}
                  <span>{aba.label}</span>
                  {ativa ? (
                    <ChevronUp size={11} className="text-primary-400" />
                  ) : (
                    <ChevronDown size={11} className="text-dark-500" />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* CONTEÚDO EXPANDIDO (ACCORDION COLLAPSE) */}
        {estaExpandido && (
          <div className="border-t border-dark-700/60 p-4 sm:p-5 bg-dark-900/70 rounded-b-xl animate-fadeIn">
            {menuAtivo === 'geral' && (
              <AbaGeral
                empresa={empresa}
                onUpdated={onEmpresaAtualizada}
              />
            )}

            {menuAtivo === 'integracoes' && (
              <AbaIntegracoes
                empresa={empresa}
                onUpdated={onEmpresaAtualizada}
                onConectarContaAzul={onConectarContaAzul}
                onDesconectarContaAzul={onDesconectarContaAzul}
                onCopiarWhatsApp={onCopiarWhatsApp}
                onIrParaAbaFiscal={() => onToggleMenu('fiscal')}
              />
            )}

            {menuAtivo === 'fornecedores' && (
              <AbaFornecedores
                empresa={empresa}
              />
            )}

            {menuAtivo === 'fiscal' && (
              <AbaFiscal
                empresa={empresa}
                onUpdated={onEmpresaAtualizada}
              />
            )}

            {menuAtivo === 'avancado' && (
              <AbaAvancado
                empresa={empresa}
                isAtiva={isAtiva}
                onDefinirComoAtiva={onDefinirComoAtiva}
                onExcluirEmpresa={onExcluirEmpresa}
              />
            )}
          </div>
        )}
      </div>

      {/* MODAL RÁPIDO DOS SEMÁFOROS */}
      {modalSemaforo && (
        <div 
          onClick={() => setModalSemaforo(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-dark-850 border border-dark-700/90 rounded-2xl p-5 max-w-sm w-full shadow-2xl space-y-4 animate-scaleUp"
          >
            {/* 1. CONTA AZUL FINANCEIRO OU VENDAS */}
            {(modalSemaforo === 'financeiro' || modalSemaforo === 'vendas') && (() => {
              const isFin = modalSemaforo === 'financeiro'
              const conectado = isFin ? hasCaFin : hasCaVendas
              const nomeServico = isFin ? 'Conta Azul Financeiro' : 'Conta Azul Vendas'

              return (
                <>
                  <div className="flex items-center justify-between pb-3 border-b border-dark-700/70">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        isFin 
                          ? 'bg-blue-500/15 border border-blue-500/30 text-blue-400' 
                          : 'bg-purple-500/15 border border-purple-500/30 text-purple-400'
                      }`}>
                        {isFin ? <CreditCard size={16} /> : <ShoppingBag size={16} />}
                      </div>
                      <div>
                        <h4 className="font-bold text-white text-sm">{nomeServico}</h4>
                        <p className="text-xs text-dark-400 truncate max-w-[200px]">{empresa.nome}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setModalSemaforo(null)}
                      className="p-1.5 text-dark-400 hover:text-white rounded-lg hover:bg-dark-700 transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {/* Status */}
                  <div className="p-2.5 bg-dark-900/80 rounded-xl border border-dark-700/60 flex items-center justify-between">
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
                          onClick={() => handleCopiarLinkOAuth(modalSemaforo)}
                          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-dark-800 hover:bg-dark-700 border border-dark-700/80 hover:border-dark-600 rounded-xl text-xs font-medium text-white transition-colors"
                        >
                          {copiadoLink ? <Check size={14} className="text-emerald-400" /> : <Link size={14} className="text-blue-400" />}
                          <span>{copiadoLink ? 'Link Copiado!' : 'Copiar Link de Autorização'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            onCopiarWhatsApp(modalSemaforo)
                            toast.success('Mensagem de WhatsApp formatada com link copiada!')
                          }}
                          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/30 hover:border-emerald-500/50 rounded-xl text-xs font-medium text-emerald-300 transition-colors"
                        >
                          <MessageSquare size={14} className="text-emerald-400" />
                          <span>Copiar Mensagem WhatsApp</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleConectarOuReconectar(modalSemaforo)}
                          className={`w-full flex items-center justify-center gap-2 px-3 py-2 text-white rounded-xl text-xs font-semibold transition-colors shadow-sm ${
                            isFin ? 'bg-blue-600 hover:bg-blue-500' : 'bg-purple-600 hover:bg-purple-500'
                          }`}
                        >
                          <ExternalLink size={14} />
                          <span>Reconectar</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setModalSemaforo(null)
                            onToggleMenu('integracoes')
                          }}
                          className="w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-dark-800/60 hover:bg-dark-800 border border-dark-700/50 rounded-xl text-xs font-medium text-dark-300 hover:text-white transition-colors"
                        >
                          <Settings size={13} />
                          <span>Abrir Configurações</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => handleConectarOuReconectar(modalSemaforo)}
                          className={`w-full flex items-center justify-center gap-2 px-3 py-2 text-white rounded-xl text-xs font-semibold transition-colors shadow-sm ${
                            isFin ? 'bg-blue-600 hover:bg-blue-500' : 'bg-purple-600 hover:bg-purple-500'
                          }`}
                        >
                          <ExternalLink size={14} />
                          <span>Conectar Agora</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCopiarLinkOAuth(modalSemaforo)}
                          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-dark-800 hover:bg-dark-700 border border-dark-700/80 hover:border-dark-600 rounded-xl text-xs font-medium text-white transition-colors"
                        >
                          {copiadoLink ? <Check size={14} className="text-emerald-400" /> : <Link size={14} className="text-blue-400" />}
                          <span>{copiadoLink ? 'Link Copiado!' : 'Copiar Link'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            onCopiarWhatsApp(modalSemaforo)
                            toast.success('Mensagem de WhatsApp formatada com link copiada!')
                          }}
                          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/30 hover:border-emerald-500/50 rounded-xl text-xs font-medium text-emerald-300 transition-colors"
                        >
                          <MessageSquare size={14} className="text-emerald-400" />
                          <span>Copiar Mensagem WhatsApp</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setModalSemaforo(null)
                            onToggleMenu('integracoes')
                          }}
                          className="w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-dark-800/60 hover:bg-dark-800 border border-dark-700/50 rounded-xl text-xs font-medium text-dark-300 hover:text-white transition-colors"
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

            {/* 2. DATACAR ERP */}
            {modalSemaforo === 'datacar' && (
              <>
                <div className="flex items-center justify-between pb-3 border-b border-dark-700/70">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                      <Database size={16} />
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-sm">Datacar ERP</h4>
                      <p className="text-xs text-dark-400 truncate max-w-[200px]">{empresa.nome}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setModalSemaforo(null)}
                    className="p-1.5 text-dark-400 hover:text-white rounded-lg hover:bg-dark-700 transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Status */}
                <div className="p-2.5 bg-dark-900/80 rounded-xl border border-dark-700/60 flex items-center justify-between">
                  <span className="text-xs text-dark-400">Status:</span>
                  {hasDatacar ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-glow-sm" />
                      <span>Configuração</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-dark-400">
                      <span className="w-2 h-2 rounded-full bg-dark-500" />
                      <span>Não Configuração</span>
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
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-colors shadow-sm"
                      >
                        {testandoDatacar ? <Loader2 size={14} className="animate-spin" /> : <Activity size={14} />}
                        <span>{testandoDatacar ? 'Testando Conexão...' : 'Testar Conexão'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setModalSemaforo(null)
                          onToggleMenu('integracoes')
                        }}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-dark-800 hover:bg-dark-700 border border-dark-700/80 hover:border-dark-600 rounded-xl text-xs font-medium text-white transition-colors"
                      >
                        <Settings size={14} className="text-primary-400" />
                        <span>Abrir Configurações</span>
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setModalSemaforo(null)
                        onToggleMenu('integracoes')
                      }}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-xs font-semibold transition-colors shadow-sm"
                    >
                      <Settings size={14} />
                      <span>Configuraçãora</span>
                    </button>
                  )}
                </div>
              </>
            )}

            {/* 3. NFS-e GOV.BR */}
            {modalSemaforo === 'nfse' && (
              <>
                <div className="flex items-center justify-between pb-3 border-b border-dark-700/70">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-400">
                      <FileText size={16} />
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-sm">NFS-e Gov.br</h4>
                      <p className="text-xs text-dark-400 truncate max-w-[200px]">{empresa.nome}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setModalSemaforo(null)}
                    className="p-1.5 text-dark-400 hover:text-white rounded-lg hover:bg-dark-700 transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Status */}
                <div className="p-2.5 bg-dark-900/80 rounded-xl border border-dark-700/60 flex items-center justify-between">
                  <span className="text-xs text-dark-400">Status:</span>
                  {hasNfse ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-glow-sm" />
                      <span>Configuração</span>
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
                      onClick={() => {
                        setModalSemaforo(null)
                        onToggleMenu('fiscal')
                      }}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-dark-800 hover:bg-dark-700 border border-dark-700/80 hover:border-dark-600 rounded-xl text-xs font-medium text-white transition-colors"
                    >
                      <Settings size={14} className="text-teal-400" />
                      <span>Abrir Configuração Fiscal</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setModalSemaforo(null)
                        onToggleMenu('fiscal')
                      }}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-xs font-semibold transition-colors shadow-sm"
                    >
                      <Settings size={14} />
                      <span>Configuraçãora</span>
                    </button>
                  )}
                </div>
              </>
            )}

            <div className="pt-1 text-center">
              <button
                type="button"
                onClick={() => setModalSemaforo(null)}
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
