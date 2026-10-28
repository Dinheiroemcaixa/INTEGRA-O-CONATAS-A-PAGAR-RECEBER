'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import {
  Mail, Lock, Eye, EyeOff, LogIn, Loader2,
  ShieldCheck, User
} from 'lucide-react'
import './login.css'

export default function LoginPageClient() {
  const [nome, setNome] = useState('')
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
        const { data: signUpData, error } = await supabase.auth.signUp({
          email,
          password: senha,
          options: {
            data: {
              name: nome.trim() || email.split('@')[0],
              nome: nome.trim() || email.split('@')[0],
            },
          },
        })
        if (error) throw error

        toast.success('Conta criada com sucesso! Aguardando aprovação do administrador.', { duration: 5000 })
        try {
          await fazerLogin(email, senha)
        } catch {
          // Se exigir confirmação de e-mail por link
          toast.success('Verifique sua caixa de entrada caso receba confirmação de e-mail.')
        }
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


  return (
    <div className="dcx-login">
      {/* Faixa de marca (celular e tablet) */}
      <div className="dcx-login-mhead">
        <span className="dcx-login-mk">
          <svg width="22" height="22" viewBox="0 0 26 26" className="flex-none block" aria-hidden="true">
                <circle cx="9.5" cy="13" r="6.5" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" />
                <circle cx="16.5" cy="13" r="6.5" fill="none" stroke="#5FD68B" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" />
              </svg>
        </span>
        <span className="dcx-login-wordmark">DCX <i>LINK</i></span>
      </div>

      <div className="dcx-login-grid">
        {/* Painel de marca (computador) */}
        <aside className="dcx-login-brand">
          <div className="dcx-login-logo">
            <span className="dcx-login-mk">
              <svg width="24" height="24" viewBox="0 0 26 26" className="flex-none block" aria-hidden="true">
                <circle cx="9.5" cy="13" r="6.5" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" />
                <circle cx="16.5" cy="13" r="6.5" fill="none" stroke="#5FD68B" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" />
              </svg>
            </span>
            <span>
              <b>DCX <i>LINK</i></b>
              <small>O elo entre seus sistemas</small>
            </span>
          </div>

          <div className="dcx-login-hero">
            <span className="dcx-login-label">PLATAFORMA DE INTEGRAÇÃO FINANCEIRA</span>
            <h1>Sua operação financeira, conectada e inteligente.</h1>
            <p>Conecte seu ERP ao Conta Azul e ao Gov.br. Acompanhe pagamentos, confira categorias e emita notas fiscais com segurança.</p>
            <div className="dcx-login-chain" aria-hidden="true">
              <span className="dcx-login-node">ERP</span>
              <span className="dcx-login-link" />
              <span className="dcx-login-node">DCX LINK</span>
              <span className="dcx-login-link" />
              <span className="dcx-login-node">Conta Azul</span>
              <span className="dcx-login-link" />
              <span className="dcx-login-node">Gov.br</span>
            </div>
          </div>

          <div className="dcx-login-foot">
            <span>© 2026 DCX LINK · Dinheiro em Caixa</span>
          </div>
        </aside>

        {/* Formulário */}
        <main className="dcx-login-side">
          <div className="dcx-login-top">
            <img className="dcx-login-company" src="/assets/logo-dinheiro-em-caixa.png" alt="Dinheiro em Caixa" />
            <span className="dcx-login-secure">
              <ShieldCheck size={16} />
              <span>Ambiente seguro</span>
            </span>
          </div>

          <div className="dcx-login-form">
            <h2>
              {modoEsqueciSenha
                ? 'Recuperar acesso'
                : modoRegistro
                  ? 'Criar nova conta'
                  : 'Acessar sua conta'}
            </h2>
            <p className="dcx-login-sub">
              {modoEsqueciSenha
                ? 'Informe seu e-mail para enviarmos o link de redefinição de senha.'
                : modoRegistro
                  ? 'Cadastre seu e-mail institucional para começar.'
                  : 'Entre com suas credenciais para acessar o painel financeiro.'}
            </p>

            <form onSubmit={handleSubmit}>
              {/* Campo Nome (apenas no modo cadastro) */}
              {modoRegistro && (
                <div className="dcx-login-field">
                  <label htmlFor="login-nome">Nome completo</label>
                  <div className="dcx-login-inp">
                    <span className="dcx-login-ico"><User size={18} /></span>
                    <input
                      id="login-nome"
                      type="text"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      placeholder="Ex: João da Silva"
                      required={modoRegistro}
                      autoComplete="name"
                    />
                  </div>
                </div>
              )}

              {/* Campo E-mail */}
              <div className="dcx-login-field">
                <label htmlFor="login-email">E-mail corporativo</label>
                <div className="dcx-login-inp">
                  <span className="dcx-login-ico"><Mail size={18} /></span>
                  <input
                    id="login-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nome@empresa.com.br"
                    required
                    autoComplete="email"
                  />
                </div>
              </div>

              {/* Campo Senha (não exibido no modo esqueci senha) */}
              {!modoEsqueciSenha && (
                <div className="dcx-login-field">
                  <div className="dcx-login-lblrow">
                    <label htmlFor="login-senha">Senha de acesso</label>
                    {!modoRegistro && (
                      <button
                        type="button"
                        onClick={() => setModoEsqueciSenha(true)}
                        className="dcx-login-forgot"
                      >
                        Esqueceu a senha?
                      </button>
                    )}
                  </div>
                  <div className="dcx-login-inp">
                    <span className="dcx-login-ico"><Lock size={18} /></span>
                    <input
                      id="login-senha"
                      className="has-eye"
                      type={mostrarSenha ? 'text' : 'password'}
                      value={senha}
                      onChange={(e) => setSenha(e.target.value)}
                      placeholder="••••••••••••"
                      required
                      minLength={6}
                      autoComplete={modoRegistro ? 'new-password' : 'current-password'}
                    />
                    <button
                      type="button"
                      onClick={() => setMostrarSenha(!mostrarSenha)}
                      className="dcx-login-eye"
                      aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                    >
                      {mostrarSenha ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
              )}

              {/* Botão de envio */}
              <button type="submit" disabled={carregando} className="dcx-login-btn">
                {carregando ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>Processando...</span>
                  </>
                ) : modoEsqueciSenha ? (
                  <span>Enviar link de recuperação</span>
                ) : modoRegistro ? (
                  <>
                    <LogIn size={18} />
                    <span>Cadastrar e entrar</span>
                  </>
                ) : (
                  <>
                    <LogIn size={18} />
                    <span>Entrar na plataforma</span>
                  </>
                )}
              </button>
            </form>

            {/* Alternância de modos */}
            <div className="dcx-login-alt">
              {modoEsqueciSenha ? (
                <p>
                  Lembrou a senha?{' '}
                  <button type="button" onClick={() => setModoEsqueciSenha(false)}>
                    Voltar ao login
                  </button>
                </p>
              ) : modoRegistro ? (
                <p>
                  Já possui uma conta?{' '}
                  <button type="button" onClick={() => setModoRegistro(false)}>
                    Fazer login
                  </button>
                </p>
              ) : (
                <p>
                  Ainda não tem acesso?{' '}
                  <button type="button" onClick={() => setModoRegistro(true)}>
                    Criar conta
                  </button>
                </p>
              )}
            </div>
          </div>

          <div className="dcx-login-legal">
            Ao continuar, você concorda com os Termos de Serviço e Política de Privacidade do DCX LINK.
          </div>
        </main>
      </div>
    </div>
  )
}
