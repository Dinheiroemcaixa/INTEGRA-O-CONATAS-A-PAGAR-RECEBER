'use client'

import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'

export type AccentColor = 'violet' | 'blue' | 'emerald' | 'rose' | 'amber' | 'cyan'
export type ThemeMode = 'light' | 'dark' | 'system'

export interface AppConfig {
  accentColor: AccentColor
  appLogoUrl: string | null
  appNome: string
  themeMode: ThemeMode
  darkModeResolved: boolean
  darkMode: boolean // Mantido para compatibilidade retroativa (equivale a darkModeResolved)
  nomeExibicao: string
}

const DEFAULT: AppConfig = {
  accentColor: 'violet',
  appLogoUrl: null,
  appNome: 'Connecta AI',
  themeMode: 'system',
  darkModeResolved: false,
  darkMode: false,
  nomeExibicao: '',
}

const APP_STORAGE_KEY = 'connecta_app_config'
export const THEME_STORAGE_KEY = 'connecta_theme'

export function resolveIsDark(mode: ThemeMode): boolean {
  if (typeof window === 'undefined') return false
  if (mode === 'dark') return true
  if (mode === 'light') return false
  return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
}

export function loadThemeModeShared(): ThemeMode {
  if (typeof window === 'undefined') return 'system'
  try {
    // 1. Tentar ler do cookie primeiro (síncrono e compartilhado entre sessões)
    const match = document.cookie.match(/(?:^|; )connecta_theme=([^;]*)/)
    if (match && ['light', 'dark', 'system'].includes(match[1])) {
      return match[1] as ThemeMode
    }

    // 2. Fallback para localStorage
    const saved = localStorage.getItem(THEME_STORAGE_KEY)
    if (saved && ['light', 'dark', 'system'].includes(saved)) {
      return saved as ThemeMode
    }

    // 3. Fallback de compatibilidade retroativa para boolean salvo como 'dark' / 'light'
    if (saved === 'dark') return 'dark'
    if (saved === 'light') return 'light'

    // 4. Fallback para classe já aplicada no <html>
    if (document.documentElement.classList.contains('dark')) return 'dark'
  } catch { /* empty */ }
  return 'system'
}

export function loadThemeShared(): boolean {
  return resolveIsDark(loadThemeModeShared())
}

export function saveThemeModeShared(mode: ThemeMode) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode)
    document.cookie = `${THEME_STORAGE_KEY}=${mode}; path=/; max-age=31536000; SameSite=Lax`
  } catch { /* empty */ }
}

export function saveThemeShared(darkMode: boolean) {
  saveThemeModeShared(darkMode ? 'dark' : 'light')
}

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

type PerfilPessoal = Pick<AppConfig, 'accentColor' | 'nomeExibicao'> & {
  tema?: ThemeMode
  darkMode?: boolean
}

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
  setThemeMode: (mode: ThemeMode) => void
  ACCENT_CLASSES: typeof ACCENT_CLASSES
}

const Ctx = createContext<AppConfigCtx | null>(null)

export function AppConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig>(() => {
    const initialMode = loadThemeModeShared()
    const isDark = resolveIsDark(initialMode)
    return {
      ...DEFAULT,
      ...loadAppShared(),
      themeMode: initialMode,
      darkModeResolved: isDark,
      darkMode: isDark,
    }
  })
  const userIdRef = useRef<string | null>(null)
  const isMountedRef = useRef(false)
  const supabase = createClient()

  // Aplica classe no HTML respeitando isolamento da tela de login
  const aplicarNoDocumento = (isDark: boolean) => {
    if (typeof window === 'undefined') return
    const isLogin = window.location.pathname.startsWith('/login')
    if (isLogin) {
      // Tela de login institucional fixa em Dark
      document.documentElement.classList.add('dark')
      document.documentElement.style.colorScheme = 'dark'
      return
    }

    if (isDark) {
      document.documentElement.classList.add('dark')
      document.documentElement.style.colorScheme = 'dark'
    } else {
      document.documentElement.classList.remove('dark')
      document.documentElement.style.colorScheme = 'light'
    }
  }

  // Efeito principal: Atualiza classes no DOM e persiste
  useEffect(() => {
    const isDark = resolveIsDark(config.themeMode)

    if (!isMountedRef.current) {
      isMountedRef.current = true
      aplicarNoDocumento(isDark)
      return
    }

    aplicarNoDocumento(isDark)
    saveThemeModeShared(config.themeMode)
  }, [config.themeMode])

  // Listener para quando themeMode === 'system' (reage à mudança do tema do Windows/macOS em tempo real)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mql = window.matchMedia('(prefers-color-scheme: dark)')

    const handleSystemChange = (e: MediaQueryListEvent) => {
      if (config.themeMode === 'system') {
        const isDark = e.matches
        aplicarNoDocumento(isDark)
        setConfig(prev => ({
          ...prev,
          darkModeResolved: isDark,
          darkMode: isDark,
        }))
      }
    }

    if (mql.addEventListener) {
      mql.addEventListener('change', handleSystemChange)
      return () => mql.removeEventListener('change', handleSystemChange)
    }
  }, [config.themeMode])

  // Sincroniza abas do navegador em tempo real via storage event
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY && e.newValue) {
        let newMode: ThemeMode = 'system'
        if (['light', 'dark', 'system'].includes(e.newValue)) {
          newMode = e.newValue as ThemeMode
        } else if (e.newValue === 'dark') {
          newMode = 'dark'
        } else if (e.newValue === 'light') {
          newMode = 'light'
        }
        const isDark = resolveIsDark(newMode)
        aplicarNoDocumento(isDark)
        setConfig(prev => (prev.themeMode !== newMode ? {
          ...prev,
          themeMode: newMode,
          darkModeResolved: isDark,
          darkMode: isDark
        } : prev))
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  // Carregamento de Perfil no Supabase
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

      // 1. Carrega do cache local instantaneamente
      const cache = loadPerfilCache(user.id)
      if (cache) {
        const cachedMode = cache.tema || (cache.darkMode !== undefined ? (cache.darkMode ? 'dark' : 'light') : undefined)
        if (cachedMode) {
          const isDark = resolveIsDark(cachedMode)
          setConfig(prev => ({
            ...prev,
            accentColor: cache.accentColor || prev.accentColor,
            nomeExibicao: cache.nomeExibicao || prev.nomeExibicao,
            themeMode: cachedMode,
            darkModeResolved: isDark,
            darkMode: isDark,
          }))
          aplicarNoDocumento(isDark)
        }
      }

      // 2. Consulta no Supabase (com tratamento defensivo caso a coluna tema ainda não exista)
      try {
        const { data, error } = await supabase
          .from('perfis_usuario')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle()

        if (cancelado || error || !data) return

        const temaBanco = (data as any)?.tema as ThemeMode | undefined
        const nextMode = temaBanco && ['light', 'dark', 'system'].includes(temaBanco)
          ? temaBanco
          : config.themeMode

        const isDark = resolveIsDark(nextMode)
        aplicarNoDocumento(isDark)

        const doBanco = {
          accentColor: (data.accent_color as AccentColor) || DEFAULT.accentColor,
          nomeExibicao: data.nome_exibicao || '',
          themeMode: nextMode,
          darkModeResolved: isDark,
          darkMode: isDark,
        }

        setConfig(prev => {
          const next = { ...prev, ...doBanco }
          savePerfilCache(user.id, {
            accentColor: next.accentColor,
            nomeExibicao: next.nomeExibicao,
            tema: next.themeMode,
            darkMode: next.darkModeResolved
          })
          return next
        })
      } catch (err) {
        console.warn('[AppConfig] Aviso ao consultar perfis_usuario:', err)
      }
    }

    carregarPerfil()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') carregarPerfil()
      if (event === 'SIGNED_OUT') {
        userIdRef.current = null
        const defaultMode = loadThemeModeShared()
        const isDark = resolveIsDark(defaultMode)
        aplicarNoDocumento(isDark)
        setConfig(prev => ({
          ...prev,
          accentColor: DEFAULT.accentColor,
          nomeExibicao: '',
          themeMode: defaultMode,
          darkModeResolved: isDark,
          darkMode: isDark
        }))
      }
    })

    return () => {
      cancelado = true
      subscription.unsubscribe()
    }
  }, [])

  const update = (partial: Partial<AppConfig>) => {
    setConfig(prev => {
      let nextMode = prev.themeMode
      if ('themeMode' in partial && partial.themeMode) {
        nextMode = partial.themeMode
      } else if ('darkMode' in partial && partial.darkMode !== undefined) {
        // Compatibilidade retroativa para update({ darkMode: boolean })
        nextMode = partial.darkMode ? 'dark' : 'light'
      }

      const isDark = resolveIsDark(nextMode)
      aplicarNoDocumento(isDark)

      const next: AppConfig = {
        ...prev,
        ...partial,
        themeMode: nextMode,
        darkModeResolved: isDark,
        darkMode: isDark
      }

      saveThemeModeShared(next.themeMode)

      if ('appLogoUrl' in partial || 'appNome' in partial) {
        saveAppShared({ appLogoUrl: next.appLogoUrl, appNome: next.appNome })
      }

      const userId = userIdRef.current
      if (userId) {
        savePerfilCache(userId, {
          accentColor: next.accentColor,
          nomeExibicao: next.nomeExibicao,
          tema: next.themeMode,
          darkMode: next.darkModeResolved
        })

        // Upsert no Supabase com tolerância caso a coluna ainda esteja sendo propagada
        const payloadBanco: any = {
          user_id: userId,
          accent_color: next.accentColor,
          nome_exibicao: next.nomeExibicao || null,
          tema: next.themeMode,
          updated_at: new Date().toISOString(),
        }

        supabase
          .from('perfis_usuario')
          .upsert(payloadBanco, { onConflict: 'user_id' })
          .then(({ error }) => {
            if (error) {
              // Se der erro por coluna tema inexistente, tenta salvar sem a coluna tema
              delete payloadBanco.tema
              supabase
                .from('perfis_usuario')
                .upsert(payloadBanco, { onConflict: 'user_id' })
                .then(() => {}, () => {})
            }
          })
      }

      window.dispatchEvent(new Event('app-config-updated'))
      return next
    })
  }

  const setThemeMode = (mode: ThemeMode) => {
    update({ themeMode: mode })
  }

  return (
    <Ctx.Provider value={{
      config,
      accentClasses: ACCENT_CLASSES[config.accentColor],
      update,
      setThemeMode,
      ACCENT_CLASSES
    }}>
      {children}
    </Ctx.Provider>
  )
}

export function useAppConfig() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAppConfig must be inside AppConfigProvider')
  return ctx
}
