'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import { Eye, EyeOff, LogIn, Loader2 } from 'lucide-react'
import { CosmicParallaxBg } from '@/components/layout/CosmicParallaxBg'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [modoRegistro, setModoRegistro] = useState(false)
  const [mostrarCard, setMostrarCard] = useState(false)
  const supabase = createClient()

  const fazerLogin = async (emailVal: string, senhaVal: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: emailVal,
      password: senhaVal,
    })
    if (error) throw error

    // Aguarda o supabase/ssr gravar os cookies no browser
    await new Promise(r => setTimeout(r, 1000))

    // Verifica via API se os cookies chegaram ao servidor
    const check = await fetch('/api/auth/check')
    const { authenticated } = await check.json()

    if (authenticated) {
      window.location.replace('/dashboard')
    } else {
      // Fallback: tenta mais uma vez com delay maior
      await new Promise(r => setTimeout(r, 1500))
      window.location.replace('/dashboard')
    }

    return data
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setCarregando(true)
    try {
      if (modoRegistro) {
        const { error } = await supabase.auth.signUp({ email, password: senha })
        if (error) throw error
        toast.success('Conta criada! Fazendo login...')
        await fazerLogin(email, senha)
      } else {
        await fazerLogin(email, senha)
        toast.success('Bem-vindo!')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      if (msg.includes('Invalid login credentials')) {
        toast.error('E-mail ou senha incorretos')
      } else if (msg.includes('Email not confirmed')) {
        toast.error('Confirme seu e-mail antes de entrar')
      } else {
        toast.error(msg)
      }
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <CosmicParallaxBg 
        head="Connecta AI" 
        text="BPO Financeiro, Automação Inteligente, Gestão Eficiente" 
      />

      {!mostrarCard && (
        <button
          onClick={() => setMostrarCard(true)}
          className="fixed top-6 right-8 z-30 flex items-center gap-2 bg-brand-600/80 hover:bg-brand-500 backdrop-blur-md text-white px-6 py-2.5 rounded-full font-medium transition-all duration-300 shadow-lg shadow-brand-900/40 hover:shadow-brand-900/60 hover:scale-105 border border-white/10"
        >
          <LogIn size={18} />
          Login
        </button>
      )}

      {mostrarCard && (
        <div className="relative w-full max-w-md animate-fade-in z-20">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-600 rounded-2xl mb-4 shadow-lg shadow-brand-900/50">
            <span className="text-2xl font-bold text-white">$</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Connecta AI</h1>
          <p className="text-dark-400 mt-1 text-sm">Inteligência Artificial para BPO Financeiro</p>
        </div>

        <div className="bg-dark-800 rounded-2xl border border-dark-700 p-8 shadow-2xl">
          <h2 className="text-xl font-semibold text-white mb-6">
            {modoRegistro ? 'Criar conta' : 'Entrar no sistema'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1.5">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com.br"
                required
                className="w-full bg-dark-900 border border-dark-600 rounded-lg px-4 py-3 text-white placeholder-dark-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1.5">Senha</label>
              <div className="relative">
                <input
                  type={mostrarSenha ? 'text' : 'password'}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="w-full bg-dark-900 border border-dark-600 rounded-lg px-4 py-3 pr-12 text-white placeholder-dark-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
                />
                <button
                  type="button"
                  onClick={() => setMostrarSenha(!mostrarSenha)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 hover:text-white transition-colors"
                >
                  {mostrarSenha ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={carregando}
              className="w-full bg-brand-600 hover:bg-brand-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-lg flex items-center justify-center gap-2 transition-all duration-200 shadow-lg shadow-brand-900/30 mt-2"
            >
              {carregando ? <Loader2 size={20} className="animate-spin" /> : <LogIn size={20} />}
              {modoRegistro ? 'Criar conta' : 'Entrar'}
            </button>
          </form>

          <p className="text-center text-sm text-dark-400 mt-6">
            {modoRegistro ? 'Já tem uma conta?' : 'Ainda não tem uma conta?'}{' '}
            <button
              onClick={() => setModoRegistro(!modoRegistro)}
              className="text-brand-400 hover:text-brand-300 font-medium transition-colors"
            >
              {modoRegistro ? 'Fazer login' : 'Criar conta'}
            </button>
          </p>
        </div>
      </div>
      )}
    </div>
  )
}
