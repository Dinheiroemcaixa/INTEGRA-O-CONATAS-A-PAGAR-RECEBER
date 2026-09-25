'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import {
  Mail, Lock, Eye, EyeOff, LogIn, Loader2, ArrowLeft,
  Car, Building2, Receipt, ShieldCheck, CheckCircle2,
  Sun, Moon, Zap, BarChart3, Layers, Sparkles
} from 'lucide-react'
import { useAppConfig } from '@/contexts/AppConfigContext'

export default function LoginPageClient() {
  const { config, update } = useAppConfig()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [modoRegistro, setModoRegistro] = useState(false)
  const [modoEsqueciSenha, setModoEsqueciSenha] = useState(false)
  const supabase = createClient()

  const fazerLogin = async (emailVal: string, senhaVal: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: emailVal,
      password: senhaVal,
    })
    if (error) throw error

    await new Promise(r => setTimeout(r, 1000))
    const check = await fetch('/api/auth/check')
    const { authenticated } = await check.json()

    if (authenticated) {
      window.location.replace('/dashboard')
    } else {
      await new Promise(r => setTimeout(r, 1500))
      window.location.replace('/dashboard')
    }

    return data
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setCarregando(true)
    try {
      if (modoEsqueciSenha) {
        if (!email) {
          toast.error('Preencha seu e-mail para receber as instruções de recuperação.')
          return
        }
        const redirectUrl = `${window.location.origin}/dashboard`
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: redirectUrl
        })
        if (error) throw error
        toast.success('E-mail de redefinição enviado! Verifique sua caixa de entrada.', { duration: 6000 })
        setModoEsqueciSenha(false)
      } else if (modoRegistro) {
        const { error } = await supabase.auth.signUp({ email, password: senha })
        if (error) throw error
        toast.success('Conta criada com sucesso! Fazendo login...')
        await fazerLogin(email, senha)
      } else {
        await fazerLogin(email, senha)
        toast.success('Login autorizado!')
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

  const beneficios = [
    {
      titulo: 'Integração Datacar DMS',
      descricao: 'Captura automática de ordens de serviço, peças aplicadas e movimentações diárias sem digitação.',
      icon: Car,
      corIcon: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
    },
    {
      titulo: 'Integração Conta Azul API v2',
      descricao: 'Sincronização bidirecional de lançamentos financeiros, centros de custos e conciliação bancária.',
      icon: Building2,
      corIcon: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
    },
    {
      titulo: 'Emissão Automática de NF-e & NFS-e',
      descricao: 'Faturamento em lote de peças com DANFE oficial e transmissão direta ao Emissor Nacional Gov.br.',
      icon: Receipt,
      corIcon: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
    },
    {
      titulo: 'Gestão Financeira Centralizada',
      descricao: 'Semáforo de consistência de fornecedores, agendamento de pagamentos e DDA unificado por loja.',
      icon: BarChart3,
      corIcon: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
    },
  ]

  return (
    <div className="min-h-screen w-full flex bg-slate-50 dark:bg-[#080b12] text-slate-900 dark:text-white transition-colors duration-200">
      
      {/* ========================================================================= */}
      {/* COLUNA ESQUERDA — BRANDING & BENEFÍCIOS INSTITUCIONAIS (DESKTOP)          */}
      {/* ========================================================================= */}
      <div className="hidden lg:flex lg:w-1/2 relative flex-col justify-between p-12 xl:p-16 overflow-hidden bg-[#070b14] text-white border-r border-slate-200/10 dark:border-white/[0.06]">
        
        {/* Glows e Ambient Lights decorativos */}
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-emerald-500/15 filter blur-3xl pointer-events-none" />
        <div className="absolute top-1/2 -right-24 w-96 h-96 rounded-full bg-blue-500/10 filter blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 left-1/3 w-96 h-96 rounded-full bg-purple-500/10 filter blur-3xl pointer-events-none" />

        {/* Topo: Logo */}
        <div className="relative z-10">
          <Link href="/" className="inline-flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-[#2ee88a] text-[#04150c] flex items-center justify-center font-black text-xl shadow-lg shadow-[#2ee88a]/30 group-hover:scale-105 transition-transform">
              C
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-extrabold tracking-wider leading-none">
                CONNECTA<span className="text-[#2ee88a] ml-1">AI</span>
              </span>
              <span className="text-[10px] text-slate-400 font-medium tracking-widest uppercase mt-0.5">
                BPO Financeiro & Automação Fiscal
              </span>
            </div>
          </Link>
        </div>

        {/* Centro: Título Institucional e Benefícios */}
        <div className="relative z-10 my-auto py-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs font-semibold mb-6">
            <Sparkles size={13} className="text-emerald-400 animate-pulse" />
            <span>PLATAFORMA MULTI-TENANT DE ALTA PERFORMANCE</span>
          </div>

          <h1 className="text-3xl xl:text-4xl font-black tracking-tight leading-tight text-white mb-4">
            Gestão financeira e fiscal integrada, <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#2ee88a] via-emerald-400 to-teal-300">sem retrabalho.</span>
          </h1>

          <p className="text-sm xl:text-base text-slate-300 leading-relaxed mb-8 max-w-xl">
            Conecte seu ERP ao ecossistema Conta Azul e Gov.br. Monitore pagamentos, audite categorias e emita notas fiscais com total conformidade.
          </p>

          {/* Lista dos 4 Benefícios */}
          <div className="space-y-4 max-w-xl">
            {beneficios.map((b, idx) => {
              const IconComp = b.icon
              return (
                <div 
                  key={idx}
                  className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06] backdrop-blur-xs hover:bg-white/[0.06] hover:border-emerald-500/30 transition-all duration-200"
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${b.corIcon}`}>
                    <IconComp size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white leading-snug">
                      {b.titulo}
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed mt-0.5">
                      {b.descricao}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Rodapé da Coluna Esquerda */}
        <div className="relative z-10 flex items-center justify-between pt-6 border-t border-white/[0.08] text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-emerald-400" />
            <span>Conexão Criptografada SSL 256-bit</span>
          </div>
          <div>© 2026 Connecta AI</div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* COLUNA DIREITA — FORMULÁRIO DE LOGIN (MOBILE & DESKTOP)                  */}
      {/* ========================================================================= */}
      <div className="w-full lg:w-1/2 flex flex-col justify-between p-6 sm:p-10 lg:p-12 xl:p-16 relative">
        
        {/* Barra Superior de Ações Rápidas */}
        <div className="flex items-center justify-between w-full">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors py-1.5 px-3 rounded-lg hover:bg-slate-200/60 dark:hover:bg-white/[0.06]"
          >
            <ArrowLeft size={14} />
            <span>Voltar ao início</span>
          </Link>

          <button
            onClick={() => update({ darkMode: !config.darkMode })}
            title={config.darkMode ? 'Mudar para Modo Claro' : 'Mudar para Modo Escuro'}
            className="p-2 rounded-xl border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-[#121622] hover:bg-slate-100 dark:hover:bg-[#1a2030] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer shadow-xs"
          >
            {config.darkMode ? <Sun size={15} className="text-amber-400" /> : <Moon size={15} className="text-indigo-500" />}
          </button>
        </div>

        {/* Bloco Central do Formulário */}
        <div className="w-full max-w-md mx-auto my-auto py-8">
          
          {/* Logo exibido apenas no Mobile */}
          <div className="lg:hidden flex items-center justify-center gap-2.5 mb-8 text-center">
            <div className="w-9 h-9 rounded-xl bg-[#2ee88a] text-[#04150c] flex items-center justify-center font-black text-lg shadow-md shadow-[#2ee88a]/30">
              C
            </div>
            <span className="text-lg font-extrabold tracking-wider text-slate-900 dark:text-white">
              CONNECTA<span className="text-[#2ee88a] ml-1">AI</span>
            </span>
          </div>

          <div className="mb-6">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              {modoEsqueciSenha 
                ? 'Recuperar acesso' 
                : modoRegistro 
                  ? 'Criar nova conta' 
                  : 'Acessar sua conta'}
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1.5">
              {modoEsqueciSenha 
                ? 'Informe seu e-mail para enviarmos o link de redefinição de senha' 
                : modoRegistro 
                  ? 'Cadastre seu e-mail institucional para começar' 
                  : 'Entre com suas credenciais para acessar o painel financeiro'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* Campo E-mail */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                E-mail Corporativo
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                  <Mail size={16} />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nome@empresa.com.br"
                  required
                  autoComplete="email"
                  className="w-full pl-10 pr-4 py-2.5 h-11 text-sm bg-white dark:bg-[#121622] border border-slate-300 dark:border-white/[0.12] rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-xs"
                />
              </div>
            </div>

            {/* Campo Senha (não exibido no modo esqueci senha) */}
            {!modoEsqueciSenha && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Senha de Acesso
                  </label>
                  {!modoRegistro && (
                    <button
                      type="button"
                      onClick={() => setModoEsqueciSenha(true)}
                      className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                    >
                      Esqueceu a senha?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                    <Lock size={16} />
                  </div>
                  <input
                    type={mostrarSenha ? 'text' : 'password'}
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    minLength={6}
                    autoComplete={modoRegistro ? 'new-password' : 'current-password'}
                    className="w-full pl-10 pr-11 py-2.5 h-11 text-sm bg-white dark:bg-[#121622] border border-slate-300 dark:border-white/[0.12] rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarSenha(!mostrarSenha)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                  >
                    {mostrarSenha ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            )}

            {/* Botão de Envio */}
            <button
              type="submit"
              disabled={carregando}
              className="w-full h-11 bg-emerald-500 hover:bg-emerald-600 dark:bg-[#2ee88a] dark:hover:bg-[#25c474] disabled:opacity-60 text-white dark:text-[#04150c] font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-md shadow-emerald-500/20 dark:shadow-[#2ee88a]/30 mt-5 cursor-pointer text-sm"
            >
              {carregando ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Processando...</span>
                </>
              ) : modoEsqueciSenha ? (
                <span>Enviar Link de Recuperação</span>
              ) : modoRegistro ? (
                <>
                  <LogIn size={16} />
                  <span>Cadastrar e Entrar</span>
                </>
              ) : (
                <>
                  <LogIn size={16} />
                  <span>Entrar na Plataforma</span>
                </>
              )}
            </button>
          </form>

          {/* Links e Alternâncias */}
          <div className="mt-6 pt-5 border-t border-slate-200/80 dark:border-white/[0.08] text-center text-xs text-slate-600 dark:text-slate-400">
            {modoEsqueciSenha ? (
              <p>
                Lembrou a senha?{' '}
                <button
                  type="button"
                  onClick={() => setModoEsqueciSenha(false)}
                  className="text-emerald-600 dark:text-emerald-400 font-bold hover:underline cursor-pointer"
                >
                  Voltar ao login
                </button>
              </p>
            ) : modoRegistro ? (
              <p>
                Já possui uma conta?{' '}
                <button
                  type="button"
                  onClick={() => setModoRegistro(false)}
                  className="text-emerald-600 dark:text-emerald-400 font-bold hover:underline cursor-pointer"
                >
                  Fazer login
                </button>
              </p>
            ) : (
              <p>
                Ainda não tem acesso?{' '}
                <button
                  type="button"
                  onClick={() => setModoRegistro(true)}
                  className="text-emerald-600 dark:text-emerald-400 font-bold hover:underline cursor-pointer"
                >
                  Criar conta
                </button>
              </p>
            )}
          </div>
        </div>

        {/* Rodapé Coluna Direita */}
        <div className="w-full text-center text-[11px] text-slate-500 dark:text-slate-500 pt-4">
          <span>Ao continuar, você concorda com os Termos de Serviço e Política de Privacidade do Connecta AI.</span>
        </div>

      </div>

    </div>
  )
}
