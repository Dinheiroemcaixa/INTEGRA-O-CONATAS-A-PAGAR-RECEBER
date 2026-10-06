'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useUserPermissions, ModulosPermissoes, PERMISSOES_PADRAO, PERFIS_RAPIDOS } from '@/contexts/UserPermissionsContext'
import {
  KeyRound, Users, ShieldAlert, CheckCircle2, Clock, Lock,
  Search, RefreshCw, MoreVertical, Copy, RotateCcw, AlertTriangle,
  UserX, UserCheck, Shield, ChevronRight, Check, X, Eye, FileText,
  Sliders, ArrowRight, ShieldCheck, Mail, LogOut
} from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'

interface UsuarioAdmin {
  id: string
  email: string
  nome: string
  is_master: boolean
  status: 'PENDENTE' | 'APROVADO' | 'BLOQUEADO' | 'REJEITADO'
  permissoes: ModulosPermissoes
  forcar_troca_senha: boolean
  criado_em: string | null
  ultimo_acesso: string | null
}

interface LogAuditoria {
  id: string
  usuario_responsavel_email: string
  usuario_alvo_email: string
  acao: string
  detalhes: any
  created_at: string
}

const MODULOS_CONFIG: { key: keyof ModulosPermissoes; label: string; desc: string }[] = [
  { key: 'dashboard', label: 'Dashboard', desc: 'Visão geral financeira e métricas' },
  { key: 'gestao_pagamentos', label: 'Gestão de Pagamentos', desc: 'Controle de lotes, datas e agendamentos' },
  { key: 'conciliacao', label: 'Auditoria de Conciliações', desc: 'Conferência Conta Azul e divergências' },
  { key: 'contas_pagar', label: 'Contas a Pagar', desc: 'Importação e De-Para de fornecedores' },
  { key: 'contas_receber', label: 'Contas a Receber', desc: 'Gestão de recebíveis e cobrança' },
  { key: 'vendas', label: 'Vendas de Produtos', desc: 'Sincronização Datacar e faturamento NF-e' },
  { key: 'conta_azul', label: 'Conexões & Conta Azul', desc: 'Configuração OAuth e tokens de integração' },
  { key: 'relatorios', label: 'Relatórios & Notas Emitidas', desc: 'Consulta de NF-e, DANFE e XMLs' },
  { key: 'fiscal', label: 'Fiscal & Vendas Serviços', desc: 'Emissão NFS-e Gov.br e DPS' },
  { key: 'configuracoes', label: 'Empresas & Configurações', desc: 'Cadastro multi-empresas e regras' },
]

export default function CentralMestrePage() {
  const router = useRouter()
  const { isMaster, loading: loadingAuth, user: currentUser } = useUserPermissions()
  const supabase = useMemo(() => createClient(), [])

  const [abaAtiva, setAbaAtiva] = useState<'usuarios' | 'permissoes' | 'auditoria'>('usuarios')
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([])
  const [logs, setLogs] = useState<LogAuditoria[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<string>('TODOS')

  // Estado para Edição de Permissões
  const [usuarioSelecionadoId, setUsuarioSelecionadoId] = useState<string>('')
  const [permissoesEditadas, setPermissoesEditadas] = useState<ModulosPermissoes>(PERMISSOES_PADRAO)
  const [salvandoPermissoes, setSalvandoPermissoes] = useState(false)

  // Estado Modal Reset Senha
  const [modalResetAberto, setModalResetAberto] = useState(false)
  const [usuarioReset, setUsuarioReset] = useState<UsuarioAdmin | null>(null)
  const [tipoReset, setTipoReset] = useState<'TEMPORARIA' | 'LINK'>('TEMPORARIA')
  const [senhaGerada, setSenhaGerada] = useState<string | null>(null)
  const [linkGerado, setLinkGerado] = useState<string | null>(null)
  const [processandoReset, setProcessandoReset] = useState(false)

  // Estado Modal Copiar Permissões
  const [modalCopiarAberto, setModalCopiarAberto] = useState(false)
  const [usuarioDestinoCopiar, setUsuarioDestinoCopiar] = useState<UsuarioAdmin | null>(null)
  const [usuarioModeloId, setUsuarioModeloId] = useState<string>('')
  const [processandoCopiar, setProcessandoCopiar] = useState(false)

  // Redireciona se não for MASTER
  useEffect(() => {
    if (!loadingAuth && !isMaster) {
      toast.error('Acesso restrito. Este módulo requer permissões MASTER.')
      router.replace('/dashboard')
    }
  }, [isMaster, loadingAuth, router])

  const carregarDados = async () => {
    setCarregando(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: HeadersInit = {}
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }

      const [resUsers, resLogs] = await Promise.all([
        fetch('/api/central-mestre/usuarios', { headers }),
        fetch('/api/central-mestre/auditoria', { headers }),
      ])

      if (!resUsers.ok) {
        const errData = await resUsers.json().catch(() => ({}))
        throw new Error(errData.error || `Erro HTTP ${resUsers.status} ao carregar usuários.`)
      }

      const dataUsers = await resUsers.json()
      const dataLogs = resLogs.ok ? await resLogs.json() : { logs: [] }

      if (dataUsers.usuarios) {
        setUsuarios(dataUsers.usuarios)
        if (!usuarioSelecionadoId && dataUsers.usuarios.length > 0) {
          setUsuarioSelecionadoId(dataUsers.usuarios[0].id)
          setPermissoesEditadas(dataUsers.usuarios[0].permissoes || PERMISSOES_PADRAO)
        }
      }

      if (dataLogs.logs) {
        setLogs(dataLogs.logs)
      }
    } catch (err: any) {
      console.error('[CentralMestre] Erro ao carregar dados:', err)
      toast.error(err.message || 'Erro ao carregar dados da Central Mestre.')
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    if (isMaster) {
      carregarDados()
    }
  }, [isMaster])

  // Atualiza permissões do formulário quando muda o usuário selecionado
  useEffect(() => {
    const u = usuarios.find(x => x.id === usuarioSelecionadoId)
    if (u) {
      setPermissoesEditadas(u.permissoes || PERMISSOES_PADRAO)
    }
  }, [usuarioSelecionadoId, usuarios])

  // Ações de Usuário (Aprovar, Bloquear, etc.)
  const executarAcaoUsuario = async (acao: string, usuarioId: string, dadosExtras: any = {}) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }

      const res = await fetch('/api/central-mestre/usuarios', {
        method: 'POST',
        headers,
        body: JSON.stringify({ acao, usuarioId, ...dadosExtras }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Erro ao executar ação.')
      }

      toast.success(data.mensagem || 'Operação realizada com sucesso!')
      await carregarDados()
    } catch (err: any) {
      toast.error(err.message || 'Falha ao processar solicitação.')
    }
  }

  // Salvar Permissões
  const salvarPermissoes = async () => {
    if (!usuarioSelecionadoId) return
    setSalvandoPermissoes(true)
    try {
      await executarAcaoUsuario('ATUALIZAR_PERMISSOES', usuarioSelecionadoId, {
        permissoes: permissoesEditadas,
      })
    } finally {
      setSalvandoPermissoes(false)
    }
  }

  // Aplicar Perfil Rápido
  const aplicarPerfilRapido = (chavePerfil: keyof typeof PERFIS_RAPIDOS) => {
    const perfil = PERFIS_RAPIDOS[chavePerfil]
    if (perfil) {
      setPermissoesEditadas(perfil.permissoes)
      toast.success(`${perfil.nome} aplicado! Clique em "Salvar Permissões" para confirmar.`)
    }
  }

  // Confirmar Cópia de Permissões
  const confirmarCopiarPermissoes = async () => {
    if (!usuarioDestinoCopiar || !usuarioModeloId) {
      toast.error('Selecione o usuário modelo para copiar as permissões.')
      return
    }
    setProcessandoCopiar(true)
    try {
      await executarAcaoUsuario('COPIAR_PERMISSOES', usuarioDestinoCopiar.id, {
        usuarioModeloId,
      })
      setModalCopiarAberto(false)
      setUsuarioDestinoCopiar(null)
    } finally {
      setProcessandoCopiar(false)
    }
  }

  // Executar Reset de Senha
  const handleResetSenha = async () => {
    if (!usuarioReset) return
    setProcessandoReset(true)
    setSenhaGerada(null)
    setLinkGerado(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }

      const res = await fetch('/api/central-mestre/usuarios/reset-senha', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          usuarioId: usuarioReset.id,
          tipo: tipoReset,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Erro ao resetar senha.')

      if (data.tipo === 'TEMPORARIA') {
        setSenhaGerada(data.senhaTemporaria)
        toast.success('Senha temporária gerada com sucesso!')
      } else {
        setLinkGerado(data.linkRecuperacao)
        toast.success('Link de recuperação gerado!')
      }
      await carregarDados()
    } catch (err: any) {
      toast.error(err.message || 'Falha ao resetar senha.')
    } finally {
      setProcessandoReset(false)
    }
  }

  // Métricas
  const kpis = useMemo(() => {
    const total = usuarios.length
    const pendentes = usuarios.filter(u => u.status === 'PENDENTE').length
    const aprovados = usuarios.filter(u => u.status === 'APROVADO').length
    const bloqueados = usuarios.filter(u => u.status === 'BLOQUEADO' || u.status === 'REJEITADO').length
    return { total, pendentes, aprovados, bloqueados }
  }, [usuarios])

  // Filtragem da Lista
  const usuariosFiltrados = useMemo(() => {
    return usuarios.filter(u => {
      const matchBusca =
        u.email.toLowerCase().includes(busca.toLowerCase()) ||
        u.nome.toLowerCase().includes(busca.toLowerCase())

      if (!matchBusca) return false

      if (filtroStatus === 'TODOS') return true
      if (filtroStatus === 'PENDENTES') return u.status === 'PENDENTE'
      if (filtroStatus === 'APROVADOS') return u.status === 'APROVADO'
      if (filtroStatus === 'BLOQUEADOS') return u.status === 'BLOQUEADO' || u.status === 'REJEITADO'
      return true
    })
  }, [usuarios, busca, filtroStatus])

  if (loadingAuth || !isMaster) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <KeyRound className="animate-spin text-amber-500" size={32} />
          <p className="text-xs text-slate-500 font-medium">Validando credenciais MASTER...</p>
        </div>
      </div>
    )
  }

  const usuarioSelecionado = usuarios.find(u => u.id === usuarioSelecionadoId)

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* ========================================================================= */}
      {/* CABEÇALHO COM TEMA DARK FINTECH                                           */}
      {/* ========================================================================= */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-amber-950/40 border border-slate-800 p-6 sm:p-8 text-white shadow-xl">
        <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner">
              <KeyRound size={28} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                  Central Mestre
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  MASTER ONLY
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-400 max-w-2xl leading-relaxed">
                Painel exclusivo de governança, aprovação de novas contas, controle granular de permissões por card e histórico de auditoria.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            <button
              onClick={carregarDados}
              disabled={carregando}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-xs font-semibold text-slate-200 transition-all cursor-pointer"
              title="Atualizar dados"
            >
              <RefreshCw size={14} className={carregando ? 'animate-spin' : ''} />
              <span>Sincronizar</span>
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* CARDS DE KPIS                                                             */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-6 pt-6 border-t border-slate-800/80">
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3.5">
            <span className="text-[11px] font-medium text-slate-400">Total de Usuários</span>
            <div className="text-xl sm:text-2xl font-bold text-white mt-0.5">{kpis.total}</div>
          </div>

          <div className={`rounded-xl p-3.5 border transition-all ${
            kpis.pendentes > 0 
              ? 'bg-amber-500/15 border-amber-500/40 text-amber-300' 
              : 'bg-slate-800/50 border-slate-700/50 text-slate-300'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium">Aguardando Aprovação</span>
              {kpis.pendentes > 0 && (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              )}
            </div>
            <div className="text-xl sm:text-2xl font-bold mt-0.5">{kpis.pendentes}</div>
          </div>

          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3.5">
            <span className="text-[11px] font-medium text-emerald-400">Aprovados / Ativos</span>
            <div className="text-xl sm:text-2xl font-bold text-emerald-300 mt-0.5">{kpis.aprovados}</div>
          </div>

          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3.5">
            <span className="text-[11px] font-medium text-rose-400">Bloqueados / Rejeitados</span>
            <div className="text-xl sm:text-2xl font-bold text-rose-300 mt-0.5">{kpis.bloqueados}</div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SELETOR DE ABAS PRINCIPAIS                                                */}
      {/* ========================================================================= */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <button
          onClick={() => setAbaAtiva('usuarios')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            abaAtiva === 'usuarios'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Users size={16} />
          <span>Gestão de Usuários</span>
          {kpis.pendentes > 0 && (
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-red-600 text-white font-black">
              {kpis.pendentes}
            </span>
          )}
        </button>

        <button
          onClick={() => setAbaAtiva('permissoes')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            abaAtiva === 'permissoes'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Sliders size={16} />
          <span>Permissões por Card & Perfis</span>
        </button>

        <button
          onClick={() => setAbaAtiva('auditoria')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            abaAtiva === 'auditoria'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <FileText size={16} />
          <span>Trilha de Auditoria</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* ABA 1: GESTÃO DE USUÁRIOS & APROVAÇÕES PENDENTES                          */}
      {/* ========================================================================= */}
      {abaAtiva === 'usuarios' && (
        <div className="space-y-4">
          {/* Barra de Filtro e Busca */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-dark-900 border border-slate-200 dark:border-white/[0.08] p-3 rounded-2xl shadow-xs">
            <div className="relative flex-1 max-w-md">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome ou e-mail..."
                className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-dark-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {['TODOS', 'PENDENTES', 'APROVADOS', 'BLOQUEADOS'].map((st) => (
                <button
                  key={st}
                  onClick={() => setFiltroStatus(st)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    filtroStatus === st
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-dark-800'
                  }`}
                >
                  {st === 'TODOS' && 'Todos'}
                  {st === 'PENDENTES' && `Pendentes (${kpis.pendentes})`}
                  {st === 'APROVADOS' && 'Aprovados'}
                  {st === 'BLOQUEADOS' && 'Bloqueados'}
                </button>
              ))}
            </div>
          </div>

          {/* Tabela de Usuários */}
          <div className="bg-white dark:bg-dark-900 border border-slate-200 dark:border-white/[0.08] rounded-2xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-white/[0.02] border-b border-slate-200 dark:border-white/[0.08] text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    <th className="py-3 px-4">Usuário</th>
                    <th className="py-3 px-4">Papel / Mestre</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Criado em</th>
                    <th className="py-3 px-4">Último Acesso</th>
                    <th className="py-3 px-4 text-right">Ações Operacionais</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04] text-xs">
                  {usuariosFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-500 dark:text-slate-400">
                        Nenhum usuário encontrado com os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    usuariosFiltrados.map((u) => {
                      const ehProprioUsuario = u.id === currentUser?.id

                      return (
                        <tr
                          key={u.id}
                          className="hover:bg-slate-50/80 dark:hover:bg-white/[0.02] transition-colors"
                        >
                          {/* Nome e E-mail */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-dark-800 border border-slate-200 dark:border-dark-700 flex items-center justify-center font-bold text-xs text-slate-700 dark:text-slate-300 shrink-0">
                                {u.nome?.charAt(0).toUpperCase() || 'U'}
                              </div>
                              <div className="min-w-0">
                                <p className="font-bold text-slate-900 dark:text-white truncate">
                                  {u.nome}
                                  {ehProprioUsuario && (
                                    <span className="ml-1.5 text-[10px] text-amber-500 font-normal">
                                      (Você)
                                    </span>
                                  )}
                                </p>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
                                  {u.email}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* Papel */}
                          <td className="py-3.5 px-4">
                            {u.is_master ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                                <KeyRound size={11} />
                                MASTER
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                                Usuário Padrão
                              </span>
                            )}
                          </td>

                          {/* Status */}
                          <td className="py-3.5 px-4">
                            {u.status === 'APROVADO' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.8 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                <CheckCircle2 size={12} />
                                Aprovado
                              </span>
                            )}
                            {u.status === 'PENDENTE' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.8 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 animate-pulse">
                                <Clock size={12} />
                                Pendente
                              </span>
                            )}
                            {u.status === 'BLOQUEADO' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.8 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                                <ShieldAlert size={12} />
                                Bloqueado
                              </span>
                            )}
                            {u.status === 'REJEITADO' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.8 rounded-full text-[11px] font-semibold bg-slate-500/15 text-slate-600 dark:text-slate-400 border border-slate-500/20">
                                <UserX size={12} />
                                Rejeitado
                              </span>
                            )}
                          </td>

                          {/* Criado em */}
                          <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 text-[11px]">
                            {u.criado_em
                              ? format(new Date(u.criado_em), 'dd/MM/yyyy HH:mm', { locale: ptBR })
                              : '—'}
                          </td>

                          {/* Último Acesso */}
                          <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 text-[11px]">
                            {u.ultimo_acesso
                              ? format(new Date(u.ultimo_acesso), 'dd/MM/yyyy HH:mm', { locale: ptBR })
                              : 'Nunca acessou'}
                          </td>

                          {/* Ações */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Se estiver pendente, botões de ação imediata */}
                              {u.status === 'PENDENTE' ? (
                                <>
                                  <button
                                    onClick={() => executarAcaoUsuario('APROVAR', u.id)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shadow-xs transition-colors cursor-pointer"
                                  >
                                    <UserCheck size={13} />
                                    Aprovar
                                  </button>
                                  <button
                                    onClick={() => executarAcaoUsuario('REJEITAR', u.id)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-500 font-bold text-[11px] border border-rose-500/30 transition-colors cursor-pointer"
                                  >
                                    <UserX size={13} />
                                    Rejeitar
                                  </button>
                                </>
                              ) : (
                                <>
                                  {/* Permissões */}
                                  <button
                                    onClick={() => {
                                      setUsuarioSelecionadoId(u.id)
                                      setAbaAtiva('permissoes')
                                    }}
                                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-dark-800 transition-colors"
                                    title="Configurar Permissões deste Usuário"
                                  >
                                    <Sliders size={15} />
                                  </button>

                                  {/* Copiar Permissões */}
                                  <button
                                    onClick={() => {
                                      setUsuarioDestinoCopiar(u)
                                      setModalCopiarAberto(true)
                                    }}
                                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-dark-800 transition-colors"
                                    title="Copiar permissões para este usuário"
                                  >
                                    <Copy size={15} />
                                  </button>

                                  {/* Reset de Senha */}
                                  <button
                                    onClick={() => {
                                      setUsuarioReset(u)
                                      setSenhaGerada(null)
                                      setLinkGerado(null)
                                      setModalResetAberto(true)
                                    }}
                                    className="p-1.5 rounded-lg text-slate-500 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-dark-800 transition-colors"
                                    title="Redefinir senha do usuário"
                                  >
                                    <KeyRound size={15} />
                                  </button>

                                  {/* Bloquear / Desbloquear */}
                                  {!ehProprioUsuario && (
                                    u.status === 'BLOQUEADO' ? (
                                      <button
                                        onClick={() => executarAcaoUsuario('DESBLOQUEAR', u.id)}
                                        className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors"
                                        title="Desbloquear acesso do usuário"
                                      >
                                        <UserCheck size={15} />
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => executarAcaoUsuario('BLOQUEAR', u.id)}
                                        className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                                        title="Bloquear acesso do usuário"
                                      >
                                        <Lock size={15} />
                                      </button>
                                    )
                                  )}

                                  {/* Encerrar Sessões */}
                                  <button
                                    onClick={() => executarAcaoUsuario('ENCERRAR_SESSOES', u.id)}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-dark-800 transition-colors"
                                    title="Encerrar sessões ativas"
                                  >
                                    <LogOut size={15} />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 2: PERMISSÕES POR CARD & PERFIS RÁPIDOS                               */}
      {/* ========================================================================= */}
      {abaAtiva === 'permissoes' && (
        <div className="space-y-6">
          {/* Card Seletor de Usuário */}
          <div className="bg-white dark:bg-dark-900 border border-slate-200 dark:border-white/[0.08] p-5 rounded-2xl shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Selecione o Usuário para Ajustar os Acessos:
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Os cards liberados definem os módulos visíveis na barra lateral e o acesso às rotas da plataforma.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={usuarioSelecionadoId}
                  onChange={(e) => setUsuarioSelecionadoId(e.target.value)}
                  className="px-3.5 py-2 text-xs bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-dark-700 rounded-xl text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                >
                  {usuarios.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome} ({u.email}) {u.is_master ? '★ MASTER' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {usuarioSelecionado && (
              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-white/[0.06] flex items-center justify-between text-xs text-slate-500">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Status atual:</span>
                  <span className="font-mono font-bold text-emerald-500">{usuarioSelecionado.status}</span>
                </div>
                {usuarioSelecionado.is_master && (
                  <span className="text-amber-500 font-bold flex items-center gap-1">
                    <KeyRound size={13} />
                    Como MASTER, este usuário possui acesso irrestrito a todos os cards.
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Perfis Rápidos (Presets) */}
          <div className="bg-slate-50 dark:bg-white/[0.02] border border-slate-200/80 dark:border-white/[0.06] p-5 rounded-2xl">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <SparklesIcon size={16} className="text-amber-500" />
                  Perfis Rápidos (Carregar modelo com 1 clique)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Selecione um perfil pré-configurado para preencher a matriz de permissões instantaneamente:
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {Object.entries(PERFIS_RAPIDOS).map(([key, p]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => aplicarPerfilRapido(key as any)}
                  className="p-3.5 rounded-xl bg-white dark:bg-dark-900 border border-slate-200 dark:border-white/[0.08] hover:border-amber-500/50 hover:bg-amber-500/5 dark:hover:bg-amber-500/5 text-left transition-all group cursor-pointer"
                >
                  <p className="font-bold text-xs text-slate-900 dark:text-white group-hover:text-amber-500 transition-colors">
                    {p.nome}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">
                    {p.descricao}
                  </p>
                  <div className="mt-3 flex items-center gap-1 text-[11px] text-amber-500 font-semibold">
                    <span>Aplicar Preset</span>
                    <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Matriz Granular de Cards */}
          <div className="bg-white dark:bg-dark-900 border border-slate-200 dark:border-white/[0.08] p-5 rounded-2xl shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Sliders size={16} className="text-brand-500" />
                Liberação Individual por Card
              </h3>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const todosLiberados = Object.keys(PERMISSOES_PADRAO).reduce((acc, k) => {
                      acc[k] = true
                      return acc
                    }, {} as any)
                    setPermissoesEditadas(todosLiberados)
                  }}
                  className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-slate-100 dark:bg-dark-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200"
                >
                  Marcar Todos
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const todosBloqueados = Object.keys(PERMISSOES_PADRAO).reduce((acc, k) => {
                      acc[k] = false
                      return acc
                    }, {} as any)
                    setPermissoesEditadas(todosBloqueados)
                  }}
                  className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-slate-100 dark:bg-dark-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200"
                >
                  Desmarcar Todos
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {MODULOS_CONFIG.map(({ key, label, desc }) => {
                const ativo = !!permissoesEditadas[key]

                return (
                  <label
                    key={key}
                    className={`flex items-start gap-3.5 p-3.5 rounded-xl border transition-all cursor-pointer select-none ${
                      ativo
                        ? 'bg-amber-500/5 dark:bg-amber-500/10 border-amber-500/40 text-slate-900 dark:text-white'
                        : 'bg-slate-50/60 dark:bg-dark-850/50 border-slate-200 dark:border-dark-700 text-slate-600 dark:text-slate-400 opacity-75'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={ativo}
                      onChange={(e) => {
                        setPermissoesEditadas(prev => ({
                          ...prev,
                          [key]: e.target.checked,
                        }))
                      }}
                      className="mt-0.5 rounded text-amber-500 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold">{label}</span>
                        {ativo ? (
                          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                            Liberado
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            Bloqueado
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {desc}
                      </p>
                    </div>
                  </label>
                )
              })}
            </div>

            {/* Rodapé de Ações */}
            <div className="mt-6 pt-5 border-t border-slate-100 dark:border-white/[0.08] flex items-center justify-between">
              <p className="text-xs text-slate-500">
                Ao salvar, o usuário visualizará imediatamente apenas os cards com acesso concedido.
              </p>

              <button
                type="button"
                onClick={salvarPermissoes}
                disabled={salvandoPermissoes || !usuarioSelecionadoId}
                className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs transition-all shadow-md shadow-amber-500/20 disabled:opacity-50 cursor-pointer"
              >
                {salvandoPermissoes ? 'Salvando Permissões...' : 'Salvar Permissões'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 3: HISTÓRICO DE AUDITORIA                                             */}
      {/* ========================================================================= */}
      {abaAtiva === 'auditoria' && (
        <div className="bg-white dark:bg-dark-900 border border-slate-200 dark:border-white/[0.08] rounded-2xl shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-white/[0.08] flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Registro de Eventos Administrativos
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Auditoria de todas as ações de aprovação, bloqueio, redefinição de senhas e alterações de permissões.
              </p>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              Total: {logs.length} eventos registrados
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-white/[0.02] border-b border-slate-200 dark:border-white/[0.08] text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4">Data & Hora</th>
                  <th className="py-3 px-4">Ação</th>
                  <th className="py-3 px-4">Responsável (MASTER)</th>
                  <th className="py-3 px-4">Usuário Alvo</th>
                  <th className="py-3 px-4">Detalhes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04] text-xs font-mono">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-500 dark:text-slate-400 font-sans">
                      Nenhum registro de auditoria registrado ainda.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02]">
                      <td className="py-3 px-4 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {log.created_at
                          ? format(new Date(log.created_at), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR })
                          : '—'}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-slate-100 dark:bg-dark-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-dark-700">
                          {log.acao}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-700 dark:text-slate-300 font-medium">
                        {log.usuario_responsavel_email}
                      </td>
                      <td className="py-3 px-4 text-amber-600 dark:text-amber-400 font-medium">
                        {log.usuario_alvo_email}
                      </td>
                      <td className="py-3 px-4 text-[11px] text-slate-500 dark:text-slate-400 max-w-xs truncate">
                        {JSON.stringify(log.detalhes)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL RESET DE SENHA                                                      */}
      {/* ========================================================================= */}
      {modalResetAberto && usuarioReset && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white dark:bg-dark-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
                  <KeyRound size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Redefinir Senha
                  </h3>
                  <p className="text-[11px] text-slate-500 truncate max-w-[220px]">
                    {usuarioReset.email}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setModalResetAberto(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 mb-4 leading-relaxed">
              Por segurança, o sistema nunca exibe nem armazena a senha original. Você pode gerar uma senha provisória ou um link oficial de redefinição.
            </p>

            <div className="flex gap-2 mb-4">
              <button
                type="button"
                onClick={() => {
                  setTipoReset('TEMPORARIA')
                  setSenhaGerada(null)
                  setLinkGerado(null)
                }}
                className={`flex-1 py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                  tipoReset === 'TEMPORARIA'
                    ? 'bg-amber-500 text-slate-950 border-amber-500'
                    : 'bg-slate-50 dark:bg-dark-850 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-dark-700'
                }`}
              >
                Senha Temporária
              </button>
              <button
                type="button"
                onClick={() => {
                  setTipoReset('LINK')
                  setSenhaGerada(null)
                  setLinkGerado(null)
                }}
                className={`flex-1 py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                  tipoReset === 'LINK'
                    ? 'bg-amber-500 text-slate-950 border-amber-500'
                    : 'bg-slate-50 dark:bg-dark-850 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-dark-700'
                }`}
              >
                Link por E-mail
              </button>
            </div>

            {/* Resultado da Senha Temporária */}
            {senhaGerada && (
              <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
                <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 tracking-wider">
                  Senha Temporária Criada (Copie agora):
                </span>
                <div className="flex items-center justify-between mt-1">
                  <span className="font-mono font-bold text-sm text-emerald-600 dark:text-emerald-300 select-all">
                    {senhaGerada}
                  </span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(senhaGerada)
                      toast.success('Senha copiada para a área de transferência!')
                    }}
                    className="p-1 rounded bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500/30 text-[10px] font-bold"
                  >
                    Copiar
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  O usuário será obrigado a criar uma nova senha pessoal no próximo login.
                </p>
              </div>
            )}

            {/* Resultado do Link */}
            {linkGerado && (
              <div className="mb-4 p-3 bg-indigo-500/10 border border-indigo-500/30 rounded-xl">
                <span className="text-[10px] uppercase font-bold text-indigo-600 dark:text-indigo-400 tracking-wider">
                  Link de Redefinição Gerado:
                </span>
                <div className="flex items-center justify-between mt-1">
                  <span className="font-mono text-xs text-indigo-400 truncate max-w-[260px]">
                    {linkGerado}
                  </span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(linkGerado)
                      toast.success('Link copiado!')
                    }}
                    className="p-1 rounded bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 text-[10px] font-bold"
                  >
                    Copiar
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setModalResetAberto(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-dark-800"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={handleResetSenha}
                disabled={processandoReset}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs transition-colors disabled:opacity-50"
              >
                {processandoReset ? 'Processando...' : 'Gerar Nova Senha'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL COPIAR PERMISSÕES                                                   */}
      {/* ========================================================================= */}
      {modalCopiarAberto && usuarioDestinoCopiar && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white dark:bg-dark-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
                  <Copy size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Copiar Permissões
                  </h3>
                  <p className="text-[11px] text-slate-500 truncate max-w-[220px]">
                    Destino: {usuarioDestinoCopiar.nome}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setModalCopiarAberto(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 mb-4 leading-relaxed">
              Evite configurar manualmente cards repetidos. Escolha um usuário modelo e aplique exatamente os mesmos acessos a{' '}
              <strong className="text-slate-900 dark:text-white">{usuarioDestinoCopiar.nome}</strong>.
            </p>

            <div className="mb-5">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                Selecione o Usuário Modelo:
              </label>
              <select
                value={usuarioModeloId}
                onChange={(e) => setUsuarioModeloId(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs bg-slate-50 dark:bg-dark-850 border border-slate-200 dark:border-dark-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              >
                <option value="">Selecione um usuário...</option>
                {usuarios
                  .filter(u => u.id !== usuarioDestinoCopiar.id)
                  .map(u => (
                    <option key={u.id} value={u.id}>
                      {u.nome} ({u.email})
                    </option>
                  ))}
              </select>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalCopiarAberto(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-dark-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarCopiarPermissoes}
                disabled={processandoCopiar || !usuarioModeloId}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs transition-colors disabled:opacity-50"
              >
                {processandoCopiar ? 'Copiando...' : 'Copiar e Aplicar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SparklesIcon(props: any) {
  return (
    <svg
      {...props}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      <path d="M5 3v4" />
      <path d="M19 17v4" />
      <path d="M3 5h4" />
      <path d="M17 19h4" />
    </svg>
  )
}
