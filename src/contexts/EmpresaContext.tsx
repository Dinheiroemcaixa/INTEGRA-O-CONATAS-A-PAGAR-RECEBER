'use client'

import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Empresa } from '@/types'

export type StatusConexaoCA = 'CONECTADA' | 'RENOVANDO' | 'ATENCAO' | 'DESCONECTADA'

export type TokenExpirationClassification =
  | 'ACTIVE_LOCK'
  | 'EXPIRED_LOCK'
  | 'VALID_TOKEN'
  | 'EXPIRING_SOON'
  | 'EXPIRED_TOKEN'
  | 'MISSING'

const LOCK_EPOCH_OFFSET_MS = 1_000_000_000_000
const LOCK_EPOCH_MAX_MS = 978_307_200_000 // 2001-01-01T00:00:00.000Z
const EXPIRATION_SAFETY_MARGIN_MS = 5 * 60 * 1000

export function classifyTokenExpirationState(
  rawExp: string | null | undefined,
  nowMs: number = Date.now()
): TokenExpirationClassification {
  if (typeof rawExp !== 'string' || rawExp.trim().length === 0) return 'MISSING'
  const ms = new Date(rawExp).getTime()
  if (Number.isNaN(ms)) return 'MISSING'
  if (ms > 0 && ms < LOCK_EPOCH_MAX_MS) {
    const leaseUntilMs = ms + LOCK_EPOCH_OFFSET_MS
    return leaseUntilMs > nowMs ? 'ACTIVE_LOCK' : 'EXPIRED_LOCK'
  }
  if (ms <= nowMs) return 'EXPIRED_TOKEN'
  if (ms <= nowMs + EXPIRATION_SAFETY_MARGIN_MS) return 'EXPIRING_SOON'
  return 'VALID_TOKEN'
}

export function getStatusConexaoEmpresa(
  empresa: Empresa | null | undefined,
  modulo: 'financeiro' | 'vendas' = 'financeiro',
  nowMs: number = Date.now()
): { status: StatusConexaoCA; conectado: boolean; label: string } {
  if (!empresa) {
    return { status: 'DESCONECTADA', conectado: false, label: 'Não Conectado' }
  }

  const token =
    modulo === 'vendas'
      ? empresa.access_token_conta_azul_vendas?.trim()
      : empresa.access_token_conta_azul?.trim()
  const refresh =
    modulo === 'vendas'
      ? empresa.refresh_token_conta_azul_vendas?.trim()
      : empresa.refresh_token_conta_azul?.trim()
  const connected =
    modulo === 'vendas'
      ? empresa.conta_azul_vendas_connected
      : empresa.conta_azul_connected
  const expStr =
    modulo === 'vendas'
      ? empresa.data_expiracao_token_vendas
      : empresa.data_expiracao_token

  if (!token || connected === false) {
    return { status: 'DESCONECTADA', conectado: false, label: 'Não Conectado' }
  }

  const expState = classifyTokenExpirationState(expStr, nowMs)

  if (expState === 'ACTIVE_LOCK') {
    if (refresh) {
      return { status: 'RENOVANDO', conectado: true, label: 'Renovando conexão...' }
    }
    return { status: 'DESCONECTADA', conectado: false, label: 'Sessão Expirada' }
  }

  if (expState === 'EXPIRED_LOCK' || expState === 'EXPIRED_TOKEN') {
    if (!refresh) {
      return { status: 'DESCONECTADA', conectado: false, label: 'Sessão Expirada' }
    }
    return { status: 'ATENCAO', conectado: true, label: 'Renovação Pendente' }
  }

  if (expState === 'EXPIRING_SOON' || expState === 'VALID_TOKEN') {
    return {
      status: 'CONECTADA',
      conectado: true,
      label: modulo === 'vendas' ? 'API Vendas Conectada' : 'API Financeiro Conectada',
    }
  }

  // expState === 'MISSING'
  if (refresh) {
    return { status: 'ATENCAO', conectado: true, label: 'Verificação Pendente' }
  }
  return { status: 'DESCONECTADA', conectado: false, label: 'Sessão Expirada' }
}

export function isEmpresaCaConectada(
  empresa: Empresa | null | undefined,
  modulo: 'financeiro' | 'vendas' = 'financeiro',
  nowMs: number = Date.now()
): boolean {
  return getStatusConexaoEmpresa(empresa, modulo, nowMs).conectado
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
  const inFlightStatusRef = useRef<boolean>(false)

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
    if (inFlightStatusRef.current) return

    const modulosParaVerificar: Array<{ modulo: 'financeiro' | 'vendas'; expStr: string | null | undefined }> = []

    if (empresaAtiva.access_token_conta_azul && empresaAtiva.refresh_token_conta_azul) {
      const finState = classifyTokenExpirationState(empresaAtiva.data_expiracao_token)
      if (finState === 'EXPIRING_SOON' || finState === 'EXPIRED_TOKEN' || finState === 'EXPIRED_LOCK') {
        modulosParaVerificar.push({ modulo: 'financeiro', expStr: empresaAtiva.data_expiracao_token })
      }
    }

    if (empresaAtiva.access_token_conta_azul_vendas && empresaAtiva.refresh_token_conta_azul_vendas) {
      const venState = classifyTokenExpirationState(empresaAtiva.data_expiracao_token_vendas)
      if (venState === 'EXPIRING_SOON' || venState === 'EXPIRED_TOKEN' || venState === 'EXPIRED_LOCK') {
        modulosParaVerificar.push({ modulo: 'vendas', expStr: empresaAtiva.data_expiracao_token_vendas })
      }
    }

    if (modulosParaVerificar.length === 0) return

    const checkKey = `${empresaAtiva.id}:${modulosParaVerificar.map((m) => `${m.modulo}:${m.expStr || ''}`).join('|')}`
    if (checkingStatusIdRef.current === checkKey) return
    checkingStatusIdRef.current = checkKey
    inFlightStatusRef.current = true

    ;(async () => {
      try {
        let precisaRecarregar = false
        for (const item of modulosParaVerificar) {
          const res = await fetch(`/api/conta-azul/status?empresa_id=${empresaAtiva.id}&modulo=${item.modulo}`)
          const data = res.ok ? await res.json() : null
          if (data && (data.renovado || data.status === 'DESCONECTADA' || data.conectado === false)) {
            precisaRecarregar = true
          }
        }
        if (precisaRecarregar) {
          await carregarEmpresas()
        }
      } catch {
        // Falha silenciosa de rede
      } finally {
        inFlightStatusRef.current = false
      }
    })()
  }, [
    empresaAtiva?.id,
    empresaAtiva?.access_token_conta_azul,
    empresaAtiva?.refresh_token_conta_azul,
    empresaAtiva?.data_expiracao_token,
    empresaAtiva?.access_token_conta_azul_vendas,
    empresaAtiva?.refresh_token_conta_azul_vendas,
    empresaAtiva?.data_expiracao_token_vendas,
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

