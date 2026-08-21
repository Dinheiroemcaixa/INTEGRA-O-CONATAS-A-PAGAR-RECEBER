'use client'

import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'

export type AccentColor = 'violet' | 'blue' | 'emerald' | 'rose' | 'amber' | 'cyan'

export interface AppConfig {
  accentColor: AccentColor
  appLogoUrl: string | null
  appNome: string
  darkMode: boolean
  nomeExibicao: string
}

const DEFAULT: AppConfig = {
  accentColor: 'violet',
  appLogoUrl: null,
  appNome: 'Connecta AI',
  darkMode: true,
  nomeExibicao: '',
}

const APP_STORAGE_KEY = 'connecta_app_config'

function loadAppShared(): Pick<AppConfig, 'appLogoUrl' | 'appNome'> {
  if (typeof window === 'undefined') return { appLogoUrl: DEFAULT.appLogoUrl, appNome: DEFAULT.appNome }
  try {
    const raw = localStorage.getItem(APP_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return { appLogoUrl: parsed.appLogoUrl ?? DEFAULT.appLogoUrl, appNome: parsed.appNome ?? DEFAULT.appNome }
    }
  } catch { /* empty */ }
  return { appLogoUrl: DEFAULT.appLogoUrl, appNome: DEFAULT.appNome }
}

function saveAppShared(cfg: Pick<AppConfig, 'appLogoUrl' | 'appNome'>) {
  if (typeof window === 'undefined') return
  localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(cfg))
}

type PerfilPessoal = Pick<AppConfig, 'accentColor' | 'nomeExibicao' | 'darkMode'>

function perfilKey(userId: string) {
  return `connecta_perfil_${userId}`
}

function loadPerfilCache(userId: string): PerfilPessoal | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(perfilKey(userId))
    if (raw) return JSON.parse(raw)
  } catch { /* empty */ }
  return null
}

function savePerfilCache(userId: string, cfg: PerfilPessoal) {
  if (typeof window === 'undefined') return
  localStorage.setItem(perfilKey(userId), JSON.stringify(cfg))
}

const ACCENT_CLASSES: Record<AccentColor, { bg: string; text: string; border: string; ring: string }> = {
  violet: { bg: 'bg-violet-600', text: 'text-violet-400', border: 'border-violet-600', ring: 'ring-violet-500' },
  blue:   { bg: 'bg-blue-600',   text: 'text-blue-400',   border: 'border-blue-600',   ring: 'ring-blue-500' },
  emerald:{ bg: 'bg-emerald-600',text: 'text-emerald-400',border: 'border-emerald-600',ring: 'ring-emerald-500' },
  rose:   { bg: 'bg-rose-600',   text: 'text-rose-400',   border: 'border-rose-600',   ring: 'ring-rose-500' },
  amber:  { bg: 'bg-amber-500',  text: 'text-amber-400',  border: 'border-amber-500',  ring: 'ring-amber-400' },
  cyan:   { bg: 'bg-cyan-600',   text: 'text-cyan-400',   border: 'border-cyan-600',   ring: 'ring-cyan-500' },
}

interface AppConfigCtx {
  config: AppConfig
  accentClasses: typeof ACCENT_CLASSES[AccentColor]
  update: (partial: Partial<AppConfig>) => void
  ACCENT_CLASSES: typeof ACCENT_CLASSES
}

const Ctx = createContext<AppConfigCtx | null>(null)

export function AppConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig>(() => ({ ...DEFAULT, ...loadAppShared() }))
  const userIdRef = useRef<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    if (config.darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [config.darkMode])

  useEffect(() => {
    let cancelado = false

    async function carregarPerfil() {
      const { data: { user } } = await supabase.auth.getUser()
      if (cancelado) return
      if (!user) {
        userIdRef.current = null
        return
      }
      userIdRef.current = user.id

      const cache = loadPerfilCache(user.id)
      if (cache) {
        setConfig(prev => ({ ...prev, ...cache }))
      }

      const { data, error } = await supabase
        .from('perfis_usuario')
        .select('accent_color, nome_exibicao')
        .eq('user_id', user.id)
        .maybeSingle()

      if (cancelado || error || !data) return

      const doBanco = {
        accentColor: (data.accent_color as AccentColor) || DEFAULT.accentColor,
        nomeExibicao: data.nome_exibicao || '',
      }
      setConfig(prev => {
        const next = { ...prev, ...doBanco }
        savePerfilCache(user.id, {
          accentColor: next.accentColor,
          nomeExibicao: next.nomeExibicao,
          darkMode: next.darkMode
        })
        return next
      })
    }

    carregarPerfil()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') carregarPerfil()
      if (event === 'SIGNED_OUT') {
        userIdRef.current = null
        setConfig(prev => ({ ...prev, accentColor: DEFAULT.accentColor, nomeExibicao: '', darkMode: DEFAULT.darkMode }))
      }
    })

    return () => {
      cancelado = true
      subscription.unsubscribe()
    }
  }, [])

  const update = (partial: Partial<AppConfig>) => {
    setConfig(prev => {
      const next = { ...prev, ...partial }

      if ('appLogoUrl' in partial || 'appNome' in partial) {
        saveAppShared({ appLogoUrl: next.appLogoUrl, appNome: next.appNome })
      }

      if ('accentColor' in partial || 'nomeExibicao' in partial || 'darkMode' in partial) {
        const userId = userIdRef.current
        const perfil: PerfilPessoal = {
          accentColor: next.accentColor,
          nomeExibicao: next.nomeExibicao,
          darkMode: next.darkMode
        }
        if (userId) {
          savePerfilCache(userId, perfil)
          supabase
            .from('perfis_usuario')
            .upsert({
              user_id: userId,
              accent_color: perfil.accentColor,
              nome_exibicao: perfil.nomeExibicao || null,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id' })
            .then(({ error }) => {
              if (error) console.error('[AppConfig] Erro ao salvar perfil do usuário:', error?.message)
            })
        }
      }

      window.dispatchEvent(new Event('app-config-updated'))
      return next
    })
  }

  return (
    <Ctx.Provider value={{ config, accentClasses: ACCENT_CLASSES[config.accentColor], update, ACCENT_CLASSES }}>
      {children}
    </Ctx.Provider>
  )
}

export function useAppConfig() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAppConfig must be inside AppConfigProvider')
  return ctx
}
