'use client'

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

export type UserStatus = 'PENDENTE' | 'APROVADO' | 'BLOQUEADO' | 'REJEITADO'

export interface ModulosPermissoes {
  dashboard: boolean
  gestao_pagamentos: boolean
  conciliacao: boolean
  contas_pagar: boolean
  contas_receber: boolean
  vendas: boolean
  conta_azul: boolean
  relatorios: boolean
  fiscal: boolean
  configuracoes: boolean
  [key: string]: boolean
}

export const PERMISSOES_PADRAO: ModulosPermissoes = {
  dashboard: true,
  gestao_pagamentos: true,
  conciliacao: true,
  contas_pagar: true,
  contas_receber: false,
  vendas: true,
  conta_azul: true,
  relatorios: true,
  fiscal: true,
  configuracoes: true,
}

// Mapeamento dos Perfis Rápidos conforme especificação
export const PERFIS_RAPIDOS: Record<string, { nome: string; descricao: string; permissoes: ModulosPermissoes }> = {
  financeiro: {
    nome: 'Perfil Financeiro',
    descricao: 'Dashboard, Gestão de Pagamentos e Relatórios',
    permissoes: {
      dashboard: true,
      gestao_pagamentos: true,
      conciliacao: false,
      contas_pagar: false,
      contas_receber: false,
      vendas: false,
      conta_azul: false,
      relatorios: true,
      fiscal: false,
      configuracoes: false,
    },
  },
  conciliacao: {
    nome: 'Perfil Conciliação',
    descricao: 'Dashboard, Gestão de Pagamentos, Conciliação e Relatórios',
    permissoes: {
      dashboard: true,
      gestao_pagamentos: true,
      conciliacao: true,
      contas_pagar: false,
      contas_receber: false,
      vendas: false,
      conta_azul: false,
      relatorios: true,
      fiscal: false,
      configuracoes: false,
    },
  },
  fiscal: {
    nome: 'Perfil Fiscal',
    descricao: 'Dashboard, Fiscal e Relatórios',
    permissoes: {
      dashboard: true,
      gestao_pagamentos: false,
      conciliacao: false,
      contas_pagar: false,
      contas_receber: false,
      vendas: false,
      conta_azul: false,
      relatorios: true,
      fiscal: true,
      configuracoes: false,
    },
  },
  gestor: {
    nome: 'Perfil Gestor',
    descricao: 'Acesso completo a todos os módulos operacionais',
    permissoes: {
      dashboard: true,
      gestao_pagamentos: true,
      conciliacao: true,
      contas_pagar: true,
      contas_receber: true,
      vendas: true,
      conta_azul: true,
      relatorios: true,
      fiscal: true,
      configuracoes: true,
    },
  },
}

export interface UserPerfil {
  id: string
  user_id: string
  email: string | null
  is_master: boolean
  status: UserStatus
  permissoes: ModulosPermissoes
  forcar_troca_senha: boolean
  ultimo_acesso: string | null
  criado_em: string | null
}

interface UserPermissionsContextType {
  user: User | null
  perfil: UserPerfil | null
  isMaster: boolean
  status: UserStatus
  loading: boolean
  temPermissao: (cardKey: string) => boolean
  recarregarPerfil: () => Promise<void>
}

const UserPermissionsContext = createContext<UserPermissionsContextType | undefined>(undefined)

export function UserPermissionsProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [perfil, setPerfil] = useState<UserPerfil | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const carregarPerfil = useCallback(async () => {
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      if (!currentUser) {
        setUser(null)
        setPerfil(null)
        setLoading(false)
        return
      }

      setUser(currentUser)

      const { data, error } = await supabase
        .from('perfis_usuario')
        .select('*')
        .eq('user_id', currentUser.id)
        .maybeSingle()

      if (error) {
        console.warn('[UserPermissions] Aviso ao carregar perfil:', error.message)
      }

      if (data) {
        setPerfil({
          id: data.id,
          user_id: data.user_id,
          email: data.email || currentUser.email || null,
          is_master: !!data.is_master,
          status: (data.status as UserStatus) || 'PENDENTE',
          permissoes: {
            ...PERMISSOES_PADRAO,
            ...(data.permissoes || {}),
          },
          forcar_troca_senha: !!data.forcar_troca_senha,
          ultimo_acesso: data.ultimo_acesso,
          criado_em: data.criado_em,
        })
      } else {
        // Fallback defensivo para não travar sessão enquanto trigger propaga
        const isOwner = currentUser.email?.toLowerCase() === 'ramoncardosobiologo@gmail.com'
        setPerfil({
          id: 'temp-' + currentUser.id,
          user_id: currentUser.id,
          email: currentUser.email || null,
          is_master: isOwner,
          status: 'APROVADO',
          permissoes: PERMISSOES_PADRAO,
          forcar_troca_senha: false,
          ultimo_acesso: null,
          criado_em: null,
        })
      }
    } catch (err) {
      console.error('[UserPermissions] Erro inesperado:', err)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    carregarPerfil()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        carregarPerfil()
      } else if (event === 'SIGNED_OUT') {
        setUser(null)
        setPerfil(null)
        setLoading(false)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [carregarPerfil, supabase])

  const temPermissao = useCallback((cardKey: string): boolean => {
    if (!perfil) return false
    // Usuário MASTER tem acesso irrestrito
    if (perfil.is_master) return true
    // Se o usuário não estiver aprovado, não acessa nada
    if (perfil.status !== 'APROVADO') return false
    // Card específico
    return !!perfil.permissoes[cardKey]
  }, [perfil])

  return (
    <UserPermissionsContext.Provider
      value={{
        user,
        perfil,
        isMaster: !!perfil?.is_master,
        status: perfil?.status || 'PENDENTE',
        loading,
        temPermissao,
        recarregarPerfil: carregarPerfil,
      }}
    >
      {children}
    </UserPermissionsContext.Provider>
  )
}

export function useUserPermissions() {
  const context = useContext(UserPermissionsContext)
  if (!context) {
    throw new Error('useUserPermissions deve ser usado dentro de UserPermissionsProvider')
  }
  return context
}
