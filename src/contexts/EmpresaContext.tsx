'use client'

import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Empresa } from '@/types'

export type StatusConexaoCA = 'CONECTADA' | 'RENOVANDO' | 'ATENCAO' | 'DESCONECTADA'

export function getStatusConexaoEmpresa(
  empresa: Empresa | null | undefined,
  modulo: 'financeiro' | 'vendas' = 'financeiro'
): { status: StatusConexaoCA; conectado: boolean; label: string } {
  if (!empresa) {
    return { status: 'DESCONECTADA', conectado: false, label: 'Não Conectado' }
  }

  if (modulo === 'financeiro') {
    const token = empresa.access_token_conta_azul?.trim()
    const refresh = empresa.refresh_token_conta_azul?.trim()
    const connected = empresa.conta_azul_connected
    const expStr = empresa.data_expiracao_token

    if (connected === false && !token) {
      return { status: 'DESCONECTADA', conectado: false, label: 'Não Conectado' }
    }
    if (!token || connected === false) {
      return { status: 'DESCONECTADA', conectado: false, label: 'Não Conectado' }
    }
    if (expStr) {
      const expTime = new Date(expStr).getTime()
      if (!isNaN(expTime) && expTime <= Date.now() && !refresh) {
        return { status: 'DESCONECTADA', conectado: false, label: 'Sessão Expirada' }
      }
    }
    return { status: 'CONECTADA', conectado: true, label: 'API Financeiro Conectada' }
  } else {
    const token = empresa.access_token_conta_azul_vendas?.trim()
    const refresh = empresa.refresh_token_conta_azul_vendas?.trim()
    const connected = empresa.conta_azul_vendas_connected
    const expStr = empresa.data_expiracao_token_vendas

    if (connected === false && !token) {
      return { status: 'DESCONECTADA', conectado: false, label: 'Não Conectado' }
    }
    if (!token || connected === false) {
      return { status: 'DESCONECTADA', conectado: false, label: 'Não Conectado' }
    }
    if (expStr) {
      const expTime = new Date(expStr).getTime()
      if (!isNaN(expTime) && expTime <= Date.now() && !refresh) {
        return { status: 'DESCONECTADA', conectado: false, label: 'Sessão Expirada' }
      }
    }
    return { status: 'CONECTADA', conectado: true, label: 'API Vendas Conectada' }
  }
}

export function isEmpresaCaConectada(
  empresa: Empresa | null | undefined,
  modulo: 'financeiro' | 'vendas' = 'financeiro'
): boolean {
  return getStatusConexaoEmpresa(empresa, modulo).conectado
}

interface EmpresaContextType {
  empresas: Empresa[]
  empresaAtiva: Empresa | null
  setEmpresaAtiva: (empresa: Empresa) => void
  loading: boolean
  recarregar: () => Promise<void>
}

const EmpresaContext = createContext<EmpresaContextType | undefined>(undefined)

export function EmpresaProvider({ children }: { children: ReactNode }) {
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [empresaAtiva, setEmpresaAtivaState] = useState<Empresa | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const empresaAtivaIdRef = useRef<string | null>(null)
  const lastFocusReloadRef = useRef<number>(0)
  const checkingStatusIdRef = useRef<string | null>(null)

  const carregarEmpresas = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data, error } = await supabase
        .from('empresas')
        .select('*')
        .order('nome')

      if (error) throw error

      setEmpresas(data || [])

      // Recuperar empresa ativa atual ou do localStorage, sempre atualizando com o objeto fresco do banco
      const currentOrSavedId = empresaAtivaIdRef.current || (typeof window !== 'undefined' ? localStorage.getItem('empresa_ativa_id') : null)
      const saved = data?.find((e) => e.id === currentOrSavedId)
      if (saved) {
        empresaAtivaIdRef.current = saved.id
        setEmpresaAtivaState(saved)
      } else if (data && data.length > 0) {
        empresaAtivaIdRef.current = data[0].id
        setEmpresaAtivaState(data[0])
      }
    } catch (err) {
      console.error('Erro ao carregar empresas:', err)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  const setEmpresaAtiva = useCallback((empresa: Empresa) => {
    empresaAtivaIdRef.current = empresa.id
    setEmpresaAtivaState(empresa)
    if (typeof window !== 'undefined') {
      localStorage.setItem('empresa_ativa_id', empresa.id)
    }
  }, [])

  useEffect(() => {
    carregarEmpresas()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') carregarEmpresas()
      if (event === 'SIGNED_OUT') {
        empresaAtivaIdRef.current = null
        setEmpresas([])
        setEmpresaAtivaState(null)
      }
    })

    // Listener de foco da janela com throttle de 15s
    const handleFocus = () => {
      const now = Date.now()
      if (now - lastFocusReloadRef.current >= 15000) {
        lastFocusReloadRef.current = now
        carregarEmpresas()
      }
    }
    window.addEventListener('focus', handleFocus)

    return () => {
      subscription.unsubscribe()
      window.removeEventListener('focus', handleFocus)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Verificação centralizada de renovação se empresaAtiva estiver expirada ou a menos de 5 min de expirar
  useEffect(() => {
    if (!empresaAtiva?.id) return
    if (!empresaAtiva.access_token_conta_azul || !empresaAtiva.refresh_token_conta_azul) return

    const expStr = empresaAtiva.data_expiracao_token
    if (!expStr) return

    const expTime = new Date(expStr).getTime()
    if (isNaN(expTime)) return

    const cincoMinMs = 5 * 60 * 1000
    if (expTime - Date.now() > cincoMinMs) return

    const checkKey = `${empresaAtiva.id}:${expStr}`
    if (checkingStatusIdRef.current === checkKey) return
    checkingStatusIdRef.current = checkKey

    fetch(`/api/conta-azul/status?empresa_id=${empresaAtiva.id}&modulo=financeiro`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && (data.renovado || data.status === 'DESCONECTADA' || data.conectado === false)) {
          carregarEmpresas()
        }
      })
      .catch(() => {})
  }, [
    empresaAtiva?.id,
    empresaAtiva?.access_token_conta_azul,
    empresaAtiva?.refresh_token_conta_azul,
    empresaAtiva?.data_expiracao_token,
    carregarEmpresas,
  ])

  return (
    <EmpresaContext.Provider
      value={{
        empresas,
        empresaAtiva,
        setEmpresaAtiva,
        loading,
        recarregar: carregarEmpresas,
      }}
    >
      {children}
    </EmpresaContext.Provider>
  )
}

export function useEmpresa() {
  const ctx = useContext(EmpresaContext)
  if (!ctx) throw new Error('useEmpresa deve ser usado dentro de EmpresaProvider')
  return ctx
}

