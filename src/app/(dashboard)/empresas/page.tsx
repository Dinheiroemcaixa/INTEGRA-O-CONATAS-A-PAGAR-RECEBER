'use client'

import React, { useState, useEffect, useCallback, Suspense, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { useEmpresa } from '@/contexts/EmpresaContext'
import { createClient } from '@/lib/supabase/client'
import { Empresa } from '@/types'
import { formatCNPJ } from '@/lib/utils'

// Subcomponentes da arquitetura Master-Detail
import { EmpresaCardMaster } from '@/components/empresas/EmpresaCardMaster'
import { AbaGeral } from '@/components/empresas/AbaGeral'
import { AbaIntegracoes } from '@/components/empresas/AbaIntegracoes'
import { AbaFornecedores } from '@/components/empresas/AbaFornecedores'
import { AbaFiscal } from '@/components/empresas/AbaFiscal'
import { AbaAvancado } from '@/components/empresas/AbaAvancado'
import { ModalNovaEmpresa } from '@/components/empresas/ModalNovaEmpresa'

import { 
  Building2, 
  Search, 
  Plus, 
  Zap, 
  Sparkles, 
  X, 
  Copy, 
  Star, 
  CheckCircle2, 
  AlertCircle, 
  Database, 
  CreditCard, 
  FileText, 
  Layers, 
  ShieldCheck, 
  Users, 
  Loader2,
  ArrowLeft,
  ChevronRight
} from 'lucide-react'
import toast from 'react-hot-toast'

// Gerador determinístico de gradiente para avatar
function getAvatarGradient(id: string) {
  const gradients = [
    'from-blue-600 to-indigo-700',
    'from-emerald-600 to-teal-700',
    'from-violet-600 to-purple-700',
    'from-amber-600 to-orange-700',
    'from-rose-600 to-pink-700',
    'from-cyan-600 to-blue-700',
  ]
  const index = id ? id.charCodeAt(0) % gradients.length : 0
  return gradients[index]
}

// Formatador de mensagem WhatsApp para autorização remota
function formatarMensagemWhatsApp(empresa: Empresa, modulo: 'financeiro' | 'vendas') {
  const isVendas = modulo === 'vendas'
  const nomeModulo = isVendas ? 'VENDAS / NF-E' : 'FINANCEIRO'
  const emailLogin = isVendas ? empresa.email_login_vendas : empresa.email_login
  const urlAuth = `${typeof window !== 'undefined' ? window.location.origin : ''}/api/conta-azul/autorizar?empresa_id=${empresa.id}&modulo=${modulo}`
  const nomeContaCa = (empresa.nome_fantasia || empresa.nome || empresa.razao_social || 'Empresa').trim()

  return `Olá! Preciso que você autorize a integração do Connecta AI com o Conta Azul (${nomeModulo}) da empresa *${empresa.nome}*.

*INSTRUÇÕES IMPORTANTES:*
1. Faça login na conta: *${emailLogin || 'seu e-mail de acesso'}*
2. Certifique-se de selecionar a empresa: *${nomeContaCa}*
3. Clique no link abaixo e autorize o acesso:

${urlAuth}

Essa autorização é necessária para emissão e sincronização contábil automática. Qualquer dúvida estou à disposição!`
}

function handleCopiarWhatsApp(empresa: Empresa, modulo: 'financeiro' | 'vendas') {
  const texto = formatarMensagemWhatsApp(empresa, modulo)
  navigator.clipboard.writeText(texto)
  toast.success(`Mensagem com link para o Conta Azul (${modulo === 'vendas' ? 'Vendas' : 'Financeiro'}) copiada!`)
}

type TipoAba = 'geral' | 'integracoes' | 'fornecedores' | 'fiscal' | 'avancado'

function EmpresasPageContent() {
  const { empresas, empresaAtiva, setEmpresaAtiva, recarregar } = useEmpresa()
  const supabase = createClient()
  const searchParams = useSearchParams()

  // Estados principais
  const [searchTerm, setSearchTerm] = useState('')
  const [empresaSelecionadaId, setEmpresaSelecionadaId] = useState<string | null>(null)
  const [abaAtiva, setAbaAtiva] = useState<TipoAba>('geral')
  const [modalNovaAberto, setModalNovaAberto] = useState(false)
  const [painelMobileAberto, setPainelMobileAberto] = useState(false)

  // Tratamento de callbacks OAuth via URL
  useEffect(() => {
    const sucesso = searchParams.get('sucesso')
    const erro = searchParams.get('erro')
    const isNew = searchParams.get('new')

    if (isNew === 'true') {
      setModalNovaAberto(true)
    }

    if (sucesso === 'conta_azul_conectado') {
      toast.success('Conta Azul conectado com sucesso!')
      recarregar()
      window.history.replaceState({}, '', '/empresas')
    } else if (erro) {
      const msgs: Record<string, string> = {
        autorizacao_negada: 'Autorização negada no Conta Azul.',
        parametros_invalidos: 'Parâmetros inválidos no retorno.',
      }
      toast.error(msgs[erro] || `Erro: ${decodeURIComponent(erro)}`)
      window.history.replaceState({}, '', '/empresas')
    }

    // Health-check silencioso em background para empresas que possuem token salvo
    if (empresas.length > 0) {
      const comToken = empresas.filter(e => !!e.access_token_conta_azul)
      if (comToken.length > 0) {
        Promise.all(
          comToken.map(async (emp) => {
            try {
              const res = await fetch(`/api/conta-azul/contas-financeiras?empresa_id=${emp.id}`)
              const data = await res.json()
              if (!res.ok || data.aviso || data.error) {
                return true
              }
            } catch {
              return true
            }
            return false
          })
        ).then((resultados) => {
          if (resultados.some(Boolean)) {
            recarregar()
          }
        })
      }
    }
  }, [searchParams, empresas, recarregar])

  // Define empresa selecionada inicial por padrão
  useEffect(() => {
    if (empresas.length > 0 && !empresaSelecionadaId) {
      if (empresaAtiva && empresas.some(e => e.id === empresaAtiva.id)) {
        setEmpresaSelecionadaId(empresaAtiva.id)
      } else {
        setEmpresaSelecionadaId(empresas[0].id)
      }
    }
  }, [empresas, empresaAtiva, empresaSelecionadaId])

  // Filtragem de empresas por busca
  const empresasFiltradas = useMemo(() => {
    if (!searchTerm.trim()) return empresas
    const q = searchTerm.toLowerCase().trim()
    const qDigitos = q.replace(/\D/g, '')

    return empresas.filter(emp => {
      const nomeMatch = (emp.nome || '').toLowerCase().includes(q)
      const razaoMatch = (emp.razao_social || '').toLowerCase().includes(q)
      const cnpjMatch = qDigitos ? (emp.cnpj || '').replace(/\D/g, '').includes(qDigitos) : false
      return nomeMatch || razaoMatch || cnpjMatch
    })
  }, [empresas, searchTerm])

  // Empresa atualmente em exibição no painel da direita
  const empresaSelecionada = useMemo(() => {
    return empresas.find(e => e.id === empresaSelecionadaId) || empresas[0] || null
  }, [empresas, empresaSelecionadaId])

  // Atualização em memória e recarga quando um subcomponente salva
  const handleEmpresaAtualizada = (empresaAtualizada: Empresa) => {
    recarregar()
    if (empresaAtiva?.id === empresaAtualizada.id) {
      setEmpresaAtiva(empresaAtualizada)
    }
  }

  // Ação de conectar Conta Azul
  const handleConectarContaAzul = (empresaId: string, modulo: 'financeiro' | 'vendas' = 'financeiro') => {
    window.location.href = `/api/conta-azul/autorizar?empresa_id=${empresaId}&modulo=${modulo}`
  }

  // Ação de desconectar Conta Azul
  const handleDesconectarContaAzul = async (empresaId: string, modulo: 'financeiro' | 'vendas' = 'financeiro') => {
    const isVendas = modulo === 'vendas'
    if (!confirm(`Deseja realmente desconectar a integração do Conta Azul (${isVendas ? 'Vendas' : 'Financeiro'}) desta empresa?`)) return

    try {
      const updateData = isVendas ? {
        access_token_conta_azul_vendas: null,
        refresh_token_conta_azul_vendas: null,
        data_expiracao_token_vendas: null,
        conta_azul_vendas_connected: false,
      } : {
        access_token_conta_azul: null,
        refresh_token_conta_azul: null,
        data_expiracao_token: null,
        conta_azul_connected: false,
      }

      const { error } = await supabase.from('empresas').update(updateData).eq('id', empresaId)
      if (error) throw error

      toast.success(`Conta Azul (${isVendas ? 'Vendas' : 'Financeiro'}) desconectado com sucesso!`)
      recarregar()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao desconectar Conta Azul')
    }
  }

  // Ação de exclusão em cascata segura
  const handleExcluirEmpresa = async (empresaId: string) => {
    try {
      const res = await fetch('/api/empresas/excluir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresa_id: empresaId })
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erro ao excluir')

      toast.success('Empresa excluída com sucesso!')
      setEmpresaSelecionadaId(null)
      recarregar()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao excluir a empresa')
    }
  }

  // Criação rápida em branco
  const handleCriarVazio = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        toast.error('Você precisa estar logado para cadastrar uma empresa.')
        return
      }

      const idTemp = Date.now().toString().slice(-4)
      const nomePadrao = `Nova Empresa ${idTemp}`

      const { data: nova, error } = await supabase
        .from('empresas')
        .insert({
          nome: nomePadrao,
          cnpj: '00000000000000',
          tipo_empresa: 'ambos',
        })
        .select()
        .single()

      if (error || !nova) throw error || new Error('Falha ao criar card')

      await supabase.from('usuarios_empresas').insert({
        usuario_id: user.id,
        empresa_id: nova.id,
      })

      toast.success('Card em branco criado! Preencha os dados ou copie o link para o cliente.')
      recarregar()
      setEmpresaSelecionadaId(nova.id)
      setAbaAtiva('geral')
      setPainelMobileAberto(true)
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar card em branco')
    }
  }

  return (
    <div className="space-y-5">
      {/* 1. CABEÇALHO CORPORATIVO SUPERIOR */}
      <div className="flex items-center justify-between flex-wrap gap-4 bg-dark-850/60 p-5 rounded-2xl border border-dark-700/60 backdrop-blur-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <Building2 className="text-blue-400" size={24} />
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Gestão de Empresas & Filiais
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-dark-400 mt-1">
            Controle unificado de identidades fiscais, credenciais Datacar, conexões Conta Azul e fornecedores
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={handleCriarVazio}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-dark-800 hover:bg-dark-700 text-white rounded-xl text-xs font-semibold border border-dark-600 hover:border-dark-500 transition-all shadow-sm"
          >
            <Zap size={14} className="text-amber-400" />
            <span>Cadastro Rápido</span>
          </button>

          <button
            type="button"
            onClick={() => setModalNovaAberto(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-all shadow-lg shadow-blue-500/10"
          >
            <Plus size={16} />
            <span>Adicionar Empresa</span>
          </button>
        </div>
      </div>

      {/* 2. LAYOUT MASTER-DETAIL (SPLIT-VIEW RESPONSIVO) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        
        {/* COLUNA ESQUERDA (MASTER): 5 COLUNAS NO DESKTOP (42%) */}
        <div className="lg:col-span-5 space-y-3">
          {/* Barra de Busca e Métricas da Lista */}
          <div className="bg-dark-800/80 border border-dark-700/70 p-3 rounded-2xl space-y-2">
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-dark-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nome, CNPJ ou razão social..."
                className="w-full bg-dark-900 border border-dark-600/80 rounded-xl pl-9 pr-3 py-2 text-white text-xs focus:ring-2 focus:ring-blue-500/50 outline-none placeholder:text-dark-500 transition-all"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 hover:text-white"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            <div className="flex items-center justify-between text-[11px] text-dark-400 px-1 pt-1 border-t border-dark-700/40">
              <span>{empresasFiltradas.length} {empresasFiltradas.length === 1 ? 'filial encontrada' : 'filiais encontradas'}</span>
              <span className="text-dark-300">
                Ativa no sistema: <strong className="text-emerald-400">{empresaAtiva?.nome || 'Nenhuma'}</strong>
              </span>
            </div>
          </div>

          {/* Lista de Filiais com Scroll Suave */}
          <div className="space-y-2.5 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
            {empresasFiltradas.length > 0 ? (
              empresasFiltradas.map((emp) => (
                <EmpresaCardMaster
                  key={emp.id}
                  empresa={emp}
                  isAtiva={empresaAtiva?.id === emp.id}
                  isSelecionada={empresaSelecionada?.id === emp.id}
                  onSelecionarParaVer={() => {
                    setEmpresaSelecionadaId(emp.id)
                    setPainelMobileAberto(true)
                  }}
                  onDefinirComoAtiva={() => {
                    setEmpresaAtiva(emp)
                    toast.success(`"${emp.nome}" agora é a empresa ativa no sistema!`)
                  }}
                  onCopiarWhatsApp={(modulo) => handleCopiarWhatsApp(emp, modulo)}
                  onAbrirAba={(aba) => {
                    setEmpresaSelecionadaId(emp.id)
                    setAbaAtiva(aba)
                    setPainelMobileAberto(true)
                  }}
                  getAvatarGradient={getAvatarGradient}
                />
              ))
            ) : (
              <div className="bg-dark-800/40 border border-dark-700/60 rounded-2xl p-8 text-center text-dark-400 space-y-2">
                <Building2 size={32} className="mx-auto text-dark-600" />
                <p className="text-sm font-medium text-dark-300">Nenhuma empresa localizada.</p>
                <p className="text-xs text-dark-500">Tente ajustar o termo da busca ou cadastre uma nova filial.</p>
              </div>
            )}
          </div>
        </div>

        {/* COLUNA DIREITA (DETAIL INSPECTOR): 7 COLUNAS NO DESKTOP (58%) */}
        <div className={`lg:col-span-7 ${
          painelMobileAberto ? 'fixed inset-0 z-40 p-4 bg-dark-950/95 overflow-y-auto flex flex-col lg:static lg:p-0 lg:bg-transparent' : 'hidden lg:block'
        }`}>
          {empresaSelecionada ? (
            <div className="bg-dark-850/90 border border-dark-700/80 rounded-2xl p-5 sm:p-6 shadow-xl space-y-5 backdrop-blur-sm">
              
              {/* Topo do Inspector de Detalhes */}
              <div className="flex items-start justify-between gap-4 pb-4 border-b border-dark-700/60">
                <div className="flex items-start gap-3.5 min-w-0">
                  {/* Botão Voltar (visível no mobile) */}
                  <button
                    type="button"
                    onClick={() => setPainelMobileAberto(false)}
                    className="lg:hidden p-2 rounded-xl bg-dark-800 text-dark-300 hover:text-white border border-dark-700 flex-shrink-0"
                  >
                    <ArrowLeft size={16} />
                  </button>

                  <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${getAvatarGradient(empresaSelecionada.id)} flex items-center justify-center text-white font-bold text-base shadow-md flex-shrink-0 mt-0.5`}>
                    {(empresaSelecionada.nome || 'E').slice(0, 2).toUpperCase()}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-lg sm:text-xl font-bold text-white truncate">
                        {empresaSelecionada.nome}
                      </h2>
                      {empresaAtiva?.id === empresaSelecionada.id && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          <Sparkles size={12} /> Ativa Globalmente
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-dark-400 truncate mt-0.5">
                      {empresaSelecionada.razao_social || empresaSelecionada.nome_fantasia || 'Sem razão social cadastrada'}
                    </p>

                    <div className="flex items-center gap-2 mt-1.5 text-xs text-dark-300 font-mono">
                      <span>{empresaSelecionada.cnpj ? formatCNPJ(empresaSelecionada.cnpj) : 'Sem CNPJ'}</span>
                      
                    </div>
                  </div>
                </div>

                {/* Botão de Tornar Ativa / Ativa */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {empresaAtiva?.id !== empresaSelecionada.id ? (
                    <button
                      type="button"
                      onClick={() => {
                        setEmpresaAtiva(empresaSelecionada)
                        toast.success(`"${empresaSelecionada.nome}" selecionada como empresa ativa!`)
                      }}
                      className="px-3.5 py-2 bg-dark-800 hover:bg-dark-700 text-white border border-dark-600 hover:border-emerald-500/50 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shadow-sm"
                    >
                      <Star size={13} className="text-amber-400" />
                      <span>Tornar Ativa</span>
                    </button>
                  ) : (
                    <span className="px-3 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-medium flex items-center gap-1.5">
                      <CheckCircle2 size={13} />
                      <span>Ativa no Sistema</span>
                    </span>
                  )}
                </div>
              </div>

              {/* BARRA DE NAVEGAÇÃO DAS 5 ABAS */}
              <div className="flex items-center gap-1.5 border-b border-dark-700/60 overflow-x-auto pb-1 text-xs">
                {[
                  { id: 'geral', label: 'Geral', icon: Building2 },
                  { id: 'integracoes', label: 'Integrações', icon: Layers },
                  { id: 'fornecedores', label: 'Fornecedores De/Para', icon: Users },
                  { id: 'fiscal', label: 'Fiscal & Certificado', icon: ShieldCheck },
                  { id: 'avancado', label: 'Avançado', icon: AlertCircle },
                ].map((tab) => {
                  const Icon = tab.icon
                  const ativa = abaAtiva === tab.id
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setAbaAtiva(tab.id as TipoAba)}
                      className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl font-medium transition-all whitespace-nowrap ${
                        ativa
                          ? 'bg-blue-600/20 text-blue-300 border border-blue-500/50 shadow-sm'
                          : 'text-dark-400 hover:text-white hover:bg-dark-800'
                      }`}
                    >
                      <Icon size={14} className={ativa ? 'text-blue-400' : 'text-dark-400'} />
                      <span>{tab.label}</span>
                    </button>
                  )
                })}
              </div>

              {/* CONTEÚDO DA ABA SELECIONADA */}
              <div className="pt-2 animate-fade-in">
                {abaAtiva === 'geral' && (
                  <AbaGeral
                    empresa={empresaSelecionada}
                    onUpdated={handleEmpresaAtualizada}
                  />
                )}

                {abaAtiva === 'integracoes' && (
                  <AbaIntegracoes
                    empresa={empresaSelecionada}
                    onUpdated={handleEmpresaAtualizada}
                    onConectarContaAzul={handleConectarContaAzul}
                    onDesconectarContaAzul={handleDesconectarContaAzul}
                    onCopiarWhatsApp={(modulo) => handleCopiarWhatsApp(empresaSelecionada, modulo)}
                    onIrParaAbaFiscal={() => setAbaAtiva('fiscal')}
                  />
                )}

                {abaAtiva === 'fornecedores' && (
                  <AbaFornecedores
                    empresa={empresaSelecionada}
                  />
                )}

                {abaAtiva === 'fiscal' && (
                  <AbaFiscal
                    empresa={empresaSelecionada}
                    onUpdated={handleEmpresaAtualizada}
                  />
                )}

                {abaAtiva === 'avancado' && (
                  <AbaAvancado
                    empresa={empresaSelecionada}
                    isAtiva={empresaAtiva?.id === empresaSelecionada.id}
                    onDefinirComoAtiva={() => {
                      setEmpresaAtiva(empresaSelecionada)
                      toast.success(`"${empresaSelecionada.nome}" agora é a empresa ativa no sistema!`)
                    }}
                    onExcluirEmpresa={handleExcluirEmpresa}
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="bg-dark-800/40 border border-dark-700/60 rounded-2xl p-12 text-center text-dark-400 space-y-2">
              <Building2 size={40} className="mx-auto text-dark-600" />
              <p className="text-base font-semibold text-white">Nenhuma empresa selecionada</p>
              <p className="text-xs text-dark-400">Selecione uma empresa na lista à esquerda para gerenciar seus dados e integrações.</p>
            </div>
          )}
        </div>
      </div>

      {/* 3. MODAL DE CADASTRO DE NOVA EMPRESA */}
      <ModalNovaEmpresa
        aberto={modalNovaAberto}
        onFechar={() => setModalNovaAberto(false)}
        onCriada={(nova) => {
          recarregar()
          setEmpresaSelecionadaId(nova.id)
          setAbaAtiva('geral')
        }}
      />
    </div>
  )
}

export default function EmpresasPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={32} className="animate-spin text-blue-500" />
          <p className="text-sm font-medium text-dark-400">Carregando painel de empresas...</p>
        </div>
      </div>
    }>
      <EmpresasPageContent />
    </Suspense>
  )
}
