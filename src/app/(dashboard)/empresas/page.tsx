'use client'

import React, { useState, useMemo, useEffect, useCallback, Suspense } from 'react'
import { useEmpresa } from '@/contexts/EmpresaContext'
import { Empresa } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { useSearchParams } from 'next/navigation'
import { 
  Building2, 
  Plus, 
  Search, 
  Sparkles, 
  FileText
} from 'lucide-react'
import toast from 'react-hot-toast'
import { ModalNovaEmpresa } from '@/components/empresas/ModalNovaEmpresa'
import { EmpresaCardAccordion, type TipoAbaEmpresa } from '@/components/empresas/EmpresaCardAccordion'

// Função determinística para gerar gradientes de avatar por ID
function getAvatarGradient(id: string) {
  const gradients = [
    'from-blue-600 to-indigo-700',
    'from-emerald-600 to-teal-700',
    'from-purple-600 to-pink-700',
    'from-amber-500 to-orange-700',
    'from-cyan-600 to-blue-800',
    'from-rose-600 to-red-800',
  ]
  let sum = 0
  for (let i = 0; i < id.length; i++) {
    sum += id.charCodeAt(i)
  }
  return gradients[sum % gradients.length]
}

// Formata mensagem WhatsApp para autorização remota
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

function EmpresasPageContent() {
  const { empresas, empresaAtiva, setEmpresaAtiva, recarregar } = useEmpresa()
  const supabase = createClient()
  const searchParams = useSearchParams()

  // Estados principais
  const [searchTerm, setSearchTerm] = useState('')
  const [modalNovaAberto, setModalNovaAberto] = useState(false)

  // ESTADO COORDENADO: Apenas uma empresa e um menu expandido por vez na página inteira
  const [expansaoAtiva, setExpansaoAtiva] = useState<{ empresaId: string; menu: TipoAbaEmpresa } | null>(null)

  const handleToggleMenu = useCallback((empresaId: string, menu: TipoAbaEmpresa) => {
    setExpansaoAtiva(prev => {
      // Comportamento Accordion Moderno: clicar na aba já aberta recolhe totalmente
      if (prev && prev.empresaId === empresaId && prev.menu === menu) {
        return null
      }
      // Clicar em aba fechada ou trocar de aba abre a nova e fecha as demais
      return { empresaId, menu }
    })
  }, [])

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

    // Health-check silencioso em background
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
      if (expansaoAtiva?.empresaId === empresaId) {
        setExpansaoAtiva(null)
      }
      recarregar()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao excluir a empresa')
    }
  }

  // Copiar mensagem WhatsApp
  const handleCopiarWhatsApp = (empresa: Empresa, modulo: 'financeiro' | 'vendas') => {
    const texto = formatarMensagemWhatsApp(empresa, modulo)
    navigator.clipboard.writeText(texto)
    toast.success(`Mensagem de autorização do ${modulo === 'vendas' ? 'Vendas' : 'Financeiro'} copiada!`)
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

      toast.success('Card em branco criado!')
      recarregar()
      setExpansaoAtiva({ empresaId: nova.id, menu: 'geral' })
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar card em branco')
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-3.5 sm:px-6 py-5 space-y-4">
      {/* CABEÇALHO COMPACTO DA PÁGINA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-dark-700/60">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary-500/15 border border-primary-500/30 flex items-center justify-center text-primary-400">
            <Building2 size={18} />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight leading-tight">
              Empresas & Configurações
            </h1>
            <p className="text-xs text-dark-400">
              Gestão de filiais, credenciais e integrações
            </p>
          </div>
        </div>

        {/* Botões de Ação */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCriarVazio}
            title="Criar card rápido em branco"
            className="px-3 py-1.5 bg-dark-800 hover:bg-dark-700 text-dark-300 hover:text-white border border-dark-700 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
          >
            <FileText size={13} />
            <span>Card Rápido</span>
          </button>

          <button
            type="button"
            onClick={() => setModalNovaAberto(true)}
            className="px-3.5 py-1.5 bg-primary-600 hover:bg-primary-500 text-white rounded-lg text-xs font-semibold transition-all shadow-xs flex items-center gap-1.5"
          >
            <Plus size={14} />
            <span>Nova Empresa</span>
          </button>
        </div>
      </div>

      {/* BARRA DE BUSCA E STATUS */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-dark-400 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome, razão social ou CNPJ..."
            className="w-full h-10 bg-dark-900 border border-dark-700 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 rounded-lg pl-9 pr-3.5 text-sm text-white placeholder-dark-500 outline-none transition-colors font-normal"
          />
        </div>

        <div className="flex items-center gap-2.5 text-xs text-dark-400">
          <span>
            Total: <strong className="text-white">{empresas.length}</strong> {empresas.length === 1 ? 'empresa' : 'empresas'}
          </span>
          {empresaAtiva && (
            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
              <Sparkles size={11} />
              <span>Ativa: <strong>{empresaAtiva.nome}</strong></span>
            </span>
          )}
        </div>
      </div>

      {/* LISTA VERTICAL DE EMPRESAS COMPACTAS */}
      <div className="space-y-2.5">
        {empresasFiltradas.length > 0 ? (
          empresasFiltradas.map((emp) => (
            <EmpresaCardAccordion
              key={emp.id}
              empresa={emp}
              isAtiva={empresaAtiva?.id === emp.id}
              menuAtivo={expansaoAtiva?.empresaId === emp.id ? expansaoAtiva.menu : null}
              onToggleMenu={(menu) => handleToggleMenu(emp.id, menu)}
              onDefinirComoAtiva={() => {
                setEmpresaAtiva(emp)
                toast.success(`"${emp.nome}" agora é a empresa ativa no sistema!`)
              }}
              onEmpresaAtualizada={handleEmpresaAtualizada}
              onConectarContaAzul={handleConectarContaAzul}
              onDesconectarContaAzul={handleDesconectarContaAzul}
              onCopiarWhatsApp={(modulo) => handleCopiarWhatsApp(emp, modulo)}
              onExcluirEmpresa={handleExcluirEmpresa}
              getAvatarGradient={getAvatarGradient}
            />
          ))
        ) : (
          <div className="bg-dark-850/60 border border-dark-700/60 rounded-xl p-8 text-center space-y-2.5">
            <Building2 size={32} className="mx-auto text-dark-500" />
            <p className="text-sm font-semibold text-white">Nenhuma empresa encontrada</p>
            <p className="text-xs text-dark-400 max-w-sm mx-auto">
              {searchTerm
                ? 'Nenhum resultado para os termos digitados.'
                : 'Cadastre sua primeira empresa para começar.'}
            </p>
            {!searchTerm && (
              <button
                type="button"
                onClick={() => setModalNovaAberto(true)}
                className="mt-1.5 inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 hover:bg-primary-500 text-white rounded-lg text-xs font-semibold transition-colors"
              >
                <Plus size={13} />
                <span>Cadastrar Empresa</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* MODAL NOVA EMPRESA */}
      <ModalNovaEmpresa
        aberto={modalNovaAberto}
        onFechar={() => setModalNovaAberto(false)}
        onCriada={(nova) => {
          recarregar()
          if (!empresaAtiva) {
            setEmpresaAtiva(nova)
          }
        }}
      />
    </div>
  )
}

export default function EmpresasPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[50vh] text-dark-400 text-xs">
        Carregando central de empresas...
      </div>
    }>
      <EmpresasPageContent />
    </Suspense>
  )
}
