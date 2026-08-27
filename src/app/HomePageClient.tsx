'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import { Eye, EyeOff, LogIn, Loader2, X, ArrowRight } from 'lucide-react'

export default function HomePageClient() {
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

  const handleResetSenha = async () => {
    if (!email) {
      toast.error('Por favor, preencha o campo de e-mail para receber o link de redefinição.')
      return
    }
    setCarregando(true)
    try {
      const redirectUrl = `${window.location.origin}/dashboard`
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl
      })
      if (error) throw error
      toast.success('E-mail de redefinição enviado! Verifique sua caixa de entrada.', { duration: 6000 })
    } catch (err: any) {
      toast.error(err.message || 'Erro ao enviar e-mail de redefinição.')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className="relative min-h-screen bg-[#070a13] text-[#f4f6fb] overflow-x-hidden selection:bg-emerald-500 selection:text-black">

      {/* Estilos inline para animação da energia fluindo no fio */}
      <style jsx global>{`
        @keyframes flowPulse {
          0% { stroke-dashoffset: 48; }
          100% { stroke-dashoffset: 0; }
        }
        @keyframes energyGlow {
          0%, 100% { filter: drop-shadow(0 0 6px #2ee88a); }
          50% { filter: drop-shadow(0 0 16px #2ee88a); }
        }
        @keyframes nodePulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 30px rgba(46,232,138,0.35); }
          50% { transform: scale(1.04); box-shadow: 0 0 60px rgba(46,232,138,0.6); }
        }
        .wire-flow {
          stroke-dasharray: 12 16;
          animation: flowPulse 0.8s linear infinite;
        }
        .wire-glow {
          animation: energyGlow 1.5s ease-in-out infinite;
        }
        .core-node {
          animation: nodePulse 3s ease-in-out infinite;
        }
      `}</style>

      {/* Ambient background glows */}
      <div className="absolute inset-0 pointer-events-none z-0 bg-[radial-gradient(900px_600px_at_78%_-8%,rgba(46,232,138,0.15),transparent_60%),radial-gradient(700px_500px_at_12%_8%,rgba(91,157,245,0.12),transparent_55%)]" />
      <div className="absolute inset-0 z-0 pointer-events-none bg-[radial-gradient(1px_1px_at_12%_18%,#fff,transparent),radial-gradient(1px_1px_at_44%_28%,#fff,transparent),radial-gradient(1px_1px_at_79%_22%,#fff,transparent)] opacity-40" />

      {/* NAV */}
      <nav className="relative z-20 max-w-[1180px] mx-auto px-4 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5 font-extrabold text-lg tracking-wider">
          <div className="w-8 h-8 rounded-lg bg-[#2ee88a] text-[#04150c] flex items-center justify-center font-black text-base shadow-lg shadow-[#2ee88a]/20">
            C
          </div>
          <span className="text-white">CONNECTA<span className="text-[#2ee88a] ml-1">AI</span></span>
        </div>

        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-[#8b94ab]">
          <a href="#como" className="hover:text-white transition-colors">Como funciona</a>
          <a href="#integracoes" className="hover:text-white transition-colors">Integrações</a>
          <a href="#recursos" className="hover:text-white transition-colors">Recursos</a>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setMostrarCard(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[#1c2436] bg-[#0c1120] hover:bg-[#151c2e] hover:border-[#2ee88a]/40 text-sm font-semibold text-[#f4f6fb] transition-all cursor-pointer shadow-md"
          >
            <LogIn size={15} className="text-[#2ee88a]" />
            Entrar
          </button>
        </div>
      </nav>

      {/* HERO SECTION */}
      <header className="relative z-10 max-w-[1080px] mx-auto px-4 pt-6 pb-12 text-center">
        {/* BADGE */}
        <div className="inline-flex items-center gap-2 bg-[#0c1120] border border-[#1c2436] px-4 py-1.5 rounded-full text-xs font-semibold tracking-wider text-[#8b94ab] uppercase mb-6 shadow-inner">
          <span className="w-2 h-2 rounded-full bg-[#2ee88a] animate-pulse" />
          BPO FINANCEIRO · GESTÃO FINANCEIRA COMPLETA
        </div>

        {/* TITLE */}
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-4 text-white drop-shadow-[0_0_50px_rgba(46,232,138,0.25)]">
          CONNECTA <span className="text-[#2ee88a]">AI</span>
        </h1>

        {/* TAGLINE */}
        <h2 className="text-2xl md:text-4xl font-bold max-w-3xl mx-auto leading-tight text-white mb-4">
          Contas a pagar, pagamentos e NFe, <span className="text-[#2ee88a]">tudo em um clique.</span>
        </h2>

        {/* SUBTITLE */}
        <p className="text-sm md:text-base text-[#8b94ab] max-w-2xl mx-auto leading-relaxed mb-8">
          O CONNECTA AI busca contas a pagar, contas a receber e vendas no seu sistema, deixa você conferir tudo, executa os pagamentos e emite a NFe automaticamente — do lançamento à nota fiscal, sem digitação e sem retrabalho.
        </p>

        {/* DIAGRAMA DINÂMICO DE ENERGIA FLUINDO NOS FIOS (SEM CONTAINER BALAOZÃO E SEM BOTÕES CENTRAIS) */}
        <div className="relative max-w-4xl mx-auto p-2 md:p-4 overflow-hidden mb-12">
          <div className="relative min-h-[380px] flex flex-col justify-between">
            
            {/* LINHAS SVG COM ENERGIA FLUINDO CONTINUAMENTE NOS FIOS */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 800 380" preserveAspectRatio="xMidYMid meet">
              <defs>
                <linearGradient id="gradTopLeft" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#f0b74f" />
                  <stop offset="100%" stopColor="#2ee88a" />
                </linearGradient>
                <linearGradient id="gradTopRight" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#2ee88a" />
                  <stop offset="100%" stopColor="#2ee88a" />
                </linearGradient>
                <linearGradient id="gradBottomLeft" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#5b9df5" />
                  <stop offset="100%" stopColor="#2ee88a" />
                </linearGradient>
                <linearGradient id="gradBottomRight" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#9b8cf0" />
                  <stop offset="100%" stopColor="#2ee88a" />
                </linearGradient>
              </defs>

              {/* Fios de base estáticos */}
              <line x1="200" y1="90" x2="400" y2="190" stroke="rgba(240,183,79,0.25)" strokeWidth="3" />
              <line x1="600" y1="90" x2="400" y2="190" stroke="rgba(46,232,138,0.25)" strokeWidth="3" />
              <line x1="200" y1="290" x2="400" y2="190" stroke="rgba(91,157,245,0.25)" strokeWidth="3" />
              <line x1="600" y1="290" x2="400" y2="190" stroke="rgba(155,140,240,0.25)" strokeWidth="3" />

              {/* Fios animados com feixes de energia fluindo sem parar */}
              <line x1="200" y1="90" x2="400" y2="190" stroke="url(#gradTopLeft)" strokeWidth="4" className="wire-flow wire-glow" />
              <line x1="400" y1="190" x2="600" y2="90" stroke="url(#gradTopRight)" strokeWidth="4" className="wire-flow wire-glow" />
              <line x1="200" y1="290" x2="400" y2="190" stroke="url(#gradBottomLeft)" strokeWidth="4" className="wire-flow wire-glow" />
              <line x1="400" y1="190" x2="600" y2="290" stroke="url(#gradBottomRight)" strokeWidth="4" className="wire-flow wire-glow" />

              {/* PARTÍCULAS (GRÃOZINHOS DE ENERGIA) TRAFEGANDO FISICAMENTE DE UM BALÃO PARA OUTRO */}
              {/* 1. Datacar -> Connecta AI (Entrada 1) */}
              <circle r="5.5" fill="#f0b74f" style={{ filter: 'drop-shadow(0 0 10px #f0b74f)' }}>
                <animateMotion dur="1.8s" repeatCount="indefinite" path="M 200 90 L 400 190" />
              </circle>
              <circle r="4.5" fill="#2ee88a" style={{ filter: 'drop-shadow(0 0 8px #2ee88a)' }}>
                <animateMotion dur="1.8s" begin="0.9s" repeatCount="indefinite" path="M 200 90 L 400 190" />
              </circle>

              {/* 2. Gestão de Pagamentos -> Connecta AI (Entrada 2) */}
              <circle r="5.5" fill="#5b9df5" style={{ filter: 'drop-shadow(0 0 10px #5b9df5)' }}>
                <animateMotion dur="1.8s" repeatCount="indefinite" path="M 200 290 L 400 190" />
              </circle>
              <circle r="4.5" fill="#2ee88a" style={{ filter: 'drop-shadow(0 0 8px #2ee88a)' }}>
                <animateMotion dur="1.8s" begin="0.9s" repeatCount="indefinite" path="M 200 290 L 400 190" />
              </circle>

              {/* 3. Connecta AI -> Conta Azul (Saída 1) */}
              <circle r="5.5" fill="#2ee88a" style={{ filter: 'drop-shadow(0 0 10px #2ee88a)' }}>
                <animateMotion dur="1.8s" repeatCount="indefinite" path="M 400 190 L 600 90" />
              </circle>
              <circle r="4.5" fill="#f0b74f" style={{ filter: 'drop-shadow(0 0 8px #f0b74f)' }}>
                <animateMotion dur="1.8s" begin="0.9s" repeatCount="indefinite" path="M 400 190 L 600 90" />
              </circle>

              {/* 4. Connecta AI -> Emissão de NFe (Saída 2) */}
              <circle r="5.5" fill="#9b8cf0" style={{ filter: 'drop-shadow(0 0 10px #9b8cf0)' }}>
                <animateMotion dur="1.8s" repeatCount="indefinite" path="M 400 190 L 600 290" />
              </circle>
              <circle r="4.5" fill="#2ee88a" style={{ filter: 'drop-shadow(0 0 8px #2ee88a)' }}>
                <animateMotion dur="1.8s" begin="0.9s" repeatCount="indefinite" path="M 400 190 L 600 290" />
              </circle>
            </svg>

            {/* PRIMEIRA LINHA DE NÓS (ORIGEM & DESTINO) */}
            <div className="flex justify-between items-center z-10 gap-4">
              {/* NÓ DATACAR */}
              <div className="bg-[#0c1120] border border-[#1c2436] rounded-2xl p-4 w-48 text-left shadow-xl hover:border-[#f0b74f] transition-all transform hover:-translate-y-1">
                <div className="w-9 h-9 rounded-lg bg-[#f0b74f]/15 text-[#f0b74f] flex items-center justify-center text-lg mb-2 shadow-sm">🚗</div>
                <div className="text-sm font-bold text-white">Datacar</div>
                <div className="text-[11px] text-[#586178]">Sistema de origem</div>
                <div className="mt-2 text-[10px] font-mono text-[#f0b74f] uppercase tracking-wider font-bold">● Extrai Dados</div>
              </div>

              {/* NÓ CONTA AZUL */}
              <div className="bg-[#0c1120] border border-[#1c2436] rounded-2xl p-4 w-48 text-left shadow-xl hover:border-[#2ee88a] transition-all transform hover:-translate-y-1">
                <div className="w-9 h-9 rounded-lg bg-[#2ee88a]/15 text-[#2ee88a] flex items-center justify-center text-lg mb-2 shadow-sm">📗</div>
                <div className="text-sm font-bold text-white">Conta Azul</div>
                <div className="text-[11px] text-[#586178]">Sistema de destino</div>
                <div className="mt-2 text-[10px] font-mono text-[#2ee88a] uppercase tracking-wider font-bold">● Importa & Lança</div>
              </div>
            </div>

            {/* CENTRO: NÓ PRINCIPAL CONNECTA AI (PULSANDO COM ENERGIA) */}
            <div className="self-center z-20 my-2">
              <div className="core-node bg-[#0c1120] border-2 border-[#2ee88a] rounded-3xl p-5 w-64 text-center bg-gradient-to-b from-[#0c1120] via-[#101e33] to-[#0c1120] cursor-pointer">
                <div className="w-12 h-12 rounded-2xl bg-[#2ee88a] text-[#04150c] flex items-center justify-center text-2xl font-black mx-auto mb-2 shadow-lg shadow-[#2ee88a]/40">
                  C
                </div>
                <div className="text-lg font-black text-white tracking-wide">CONNECTA AI</div>
                <div className="text-xs text-[#2ee88a] font-bold mt-0.5">Confere, Paga & Emite</div>
                <div className="mt-2 text-[10px] bg-[#2ee88a]/10 border border-[#2ee88a]/30 text-[#bdf5da] px-2.5 py-0.5 rounded-full inline-block font-semibold">
                  ⚡ Hub de IA & BPO Inteligente
                </div>
              </div>
            </div>

            {/* SEGUNDA LINHA DE NÓS (PAGAMENTOS & NFE) */}
            <div className="flex justify-between items-center z-10 gap-4">
              {/* NÓ GESTÃO PAGAMENTOS */}
              <div className="bg-[#0c1120] border border-[#1c2436] rounded-2xl p-4 w-48 text-left shadow-xl hover:border-[#5b9df5] transition-all transform hover:-translate-y-1">
                <div className="w-9 h-9 rounded-lg bg-[#5b9df5]/15 text-[#5b9df5] flex items-center justify-center text-lg mb-2 shadow-sm">💳</div>
                <div className="text-sm font-bold text-white">Gestão de Pagamentos</div>
                <div className="text-[11px] text-[#586178]">Aprova & executa</div>
                <div className="mt-2 text-[10px] font-mono text-[#5b9df5] uppercase tracking-wider font-bold">● Paga Boletos</div>
              </div>

              {/* NÓ NFE */}
              <div className="bg-[#0c1120] border border-[#1c2436] rounded-2xl p-4 w-48 text-left shadow-xl hover:border-[#9b8cf0] transition-all transform hover:-translate-y-1">
                <div className="w-9 h-9 rounded-lg bg-[#9b8cf0]/15 text-[#9b8cf0] flex items-center justify-center text-lg mb-2 shadow-sm">🧾</div>
                <div className="text-sm font-bold text-white">Emissão de NFe</div>
                <div className="text-[11px] text-[#586178]">Nota automática</div>
                <div className="mt-2 text-[10px] font-mono text-[#9b8cf0] uppercase tracking-wider font-bold">● Emite NFes</div>
              </div>
            </div>

          </div>
        </div>

        {/* AS 4 CAIXINHAS (DESCIDAS PARA BAIXO DO DIAGRAMA CONFORME SOLICITADO) */}
        <div id="recursos" className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-4xl mx-auto mb-12">
          <div className="bg-[#0c1120] border border-[#1c2436] rounded-2xl p-4 flex flex-col items-center gap-2 text-center hover:border-[#5b9df5]/50 transition-all shadow-md">
            <div className="w-10 h-10 rounded-xl bg-[#5b9df5]/15 text-[#5b9df5] flex items-center justify-center text-lg font-bold">
              📥
            </div>
            <div className="text-xs font-bold text-white">Contas a Pagar</div>
            <div className="text-[11px] text-[#586178]">Captura automática</div>
          </div>

          <div className="bg-[#0c1120] border border-[#1c2436] rounded-2xl p-4 flex flex-col items-center gap-2 text-center hover:border-[#2ee88a]/50 transition-all shadow-md">
            <div className="w-10 h-10 rounded-xl bg-[#2ee88a]/15 text-[#2ee88a] flex items-center justify-center text-lg font-bold">
              💳
            </div>
            <div className="text-xs font-bold text-white">Gestão de Pagamentos</div>
            <div className="text-[11px] text-[#586178]">Aprova & executa</div>
          </div>

          <div className="bg-[#0c1120] border border-[#1c2436] rounded-2xl p-4 flex flex-col items-center gap-2 text-center hover:border-[#9b8cf0]/50 transition-all shadow-md">
            <div className="w-10 h-10 rounded-xl bg-[#9b8cf0]/15 text-[#9b8cf0] flex items-center justify-center text-lg font-bold">
              🧾
            </div>
            <div className="text-xs font-bold text-white">Emissão de NFe</div>
            <div className="text-[11px] text-[#586178]">Nota automática</div>
          </div>

          <div className="bg-[#0c1120] border border-[#1c2436] rounded-2xl p-4 flex flex-col items-center gap-2 text-center hover:border-[#f0b74f]/50 transition-all shadow-md">
            <div className="w-10 h-10 rounded-xl bg-[#f0b74f]/15 text-[#f0b74f] flex items-center justify-center text-lg font-bold">
              🔄
            </div>
            <div className="text-xs font-bold text-white">Datacar ↔ Conta Azul</div>
            <div className="text-[11px] text-[#586178]">Sincronizado</div>
          </div>
        </div>

      </header>

      {/* COMO FUNCIONA */}
      <section id="como" className="relative z-10 max-w-[1120px] mx-auto px-4 py-16 border-t border-[#1c2436]/50">
        <div className="text-center mb-12">
          <div className="text-xs font-bold tracking-widest text-[#2ee88a] uppercase mb-2">Como Funciona</div>
          <h2 className="text-3xl md:text-4xl font-extrabold text-white">Fluxo Inteligente. Zero Digitação.</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-[#0c1120] border border-[#1c2436] rounded-2xl p-6 hover:border-[#2ee88a]/40 transition-all">
            <div className="flex items-center justify-between mb-4">
              <div className="w-11 h-11 rounded-xl bg-[#5b9df5]/15 text-[#5b9df5] flex items-center justify-center text-xl">
                📥
              </div>
              <span className="text-3xl font-black text-[#1c2436]">01</span>
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Busca & Captura</h3>
            <p className="text-sm text-[#8b94ab] leading-relaxed">
              O CONNECTA AI acessa o Datacar e extrai automaticamente as contas a pagar, contas a receber e vendas do período com total precisão.
            </p>
          </div>

          <div className="bg-[#0c1120] border border-[#1c2436] rounded-2xl p-6 hover:border-[#2ee88a]/40 transition-all">
            <div className="flex items-center justify-between mb-4">
              <div className="w-11 h-11 rounded-xl bg-[#2ee88a]/15 text-[#2ee88a] flex items-center justify-center text-xl">
                💳
              </div>
              <span className="text-3xl font-black text-[#1c2436]">02</span>
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Gestão de Pagamentos</h3>
            <p className="text-sm text-[#8b94ab] leading-relaxed">
              Organiza boletos, DDAs e agendamentos por loja e conta bancária. Permite aprovar e executar pagamentos sem retrabalho manual.
            </p>
          </div>

          <div className="bg-[#0c1120] border border-[#1c2436] rounded-2xl p-6 hover:border-[#2ee88a]/40 transition-all">
            <div className="flex items-center justify-between mb-4">
              <div className="w-11 h-11 rounded-xl bg-[#9b8cf0]/15 text-[#9b8cf0] flex items-center justify-center text-xl">
                🧾
              </div>
              <span className="text-3xl font-black text-[#1c2436]">03</span>
            </div>
            <h3 className="text-lg font-bold text-white mb-2">NFe & Conta Azul</h3>
            <p className="text-sm text-[#8b94ab] leading-relaxed">
              Sincroniza os lançamentos aprovados com o Conta Azul e habilita a emissão automática de Notas Fiscais com um único clique.
            </p>
          </div>
        </div>
      </section>

      {/* INTEGRAÇÕES */}
      <section id="integracoes" className="relative z-10 max-w-[1120px] mx-auto px-4 py-16 border-t border-[#1c2436]/50">
        <div className="bg-gradient-to-r from-[#0c1120] via-[#142238] to-[#0c1120] border border-[#1c2436] rounded-3xl p-8 md:p-12 flex flex-col md:flex-row items-center justify-between gap-8 shadow-2xl">
          <div className="max-w-xl">
            <div className="text-xs font-bold tracking-widest text-[#2ee88a] uppercase mb-2">Integrações Conectadas</div>
            <h2 className="text-2xl md:text-3xl font-extrabold text-white mb-4">Datacar e Conta Azul em Perfeita Sincronia</h2>
            <p className="text-sm text-[#8b94ab] leading-relaxed mb-6">
              Integração nativa de alta velocidade conectando o seu ERP Datacar ao Conta Azul para automação financeira completa de BPO.
            </p>
            <div className="inline-flex items-center gap-2 bg-[#0c1120] border border-[#1c2436] px-3.5 py-1.5 rounded-full text-xs text-[#8b94ab]">
              <span className="w-2 h-2 rounded-full bg-[#2ee88a]" />
              Conexões multi-empresas e multi-bancos ativas
            </div>
          </div>

          <div className="flex items-center gap-4 bg-[#0c1120] border border-[#1c2436] p-6 rounded-2xl shadow-xl">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-3xl mb-2">🚗</div>
              <div className="text-xs font-bold text-white">Datacar</div>
            </div>

            <div className="text-[#2ee88a] text-xl font-bold">⇄</div>

            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-[#2ee88a]/10 border border-[#2ee88a]/20 flex items-center justify-center text-3xl mb-2">📗</div>
              <div className="text-xs font-bold text-white">Conta Azul</div>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative z-10 max-w-[1120px] mx-auto px-4 py-12 border-t border-[#1c2436]/50 text-center md:text-left">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-[#8b94ab]">
          <div className="flex items-center gap-2 font-bold text-white">
            <div className="w-6 h-6 rounded-md bg-[#2ee88a] text-[#04150c] flex items-center justify-center font-black text-xs">C</div>
            <span>CONNECTA<span className="text-[#2ee88a]">AI</span></span>
          </div>
          <div>BPO Financeiro · Automação Inteligente · Gestão Eficiente</div>
          <div>© 2026 CONNECTA AI. Todos os direitos reservados.</div>
        </div>
      </footer>

      {/* LOGIN MODAL */}
      {mostrarCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-md z-20">
            <button 
              onClick={() => setMostrarCard(false)}
              className="absolute -top-3 -right-3 p-2 bg-[#0c1120] text-[#8b94ab] hover:text-white rounded-full border border-[#1c2436] shadow-xl transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="bg-[#0c1120] rounded-3xl border border-[#1c2436] p-8 shadow-2xl relative">
              <div className="text-center mb-6">
                <div className="w-14 h-14 rounded-2xl bg-[#2ee88a] text-[#04150c] flex items-center justify-center font-black text-2xl mx-auto mb-3 shadow-lg shadow-[#2ee88a]/30">
                  C
                </div>
                <h2 className="text-2xl font-extrabold text-white">
                  {modoRegistro ? 'Criar conta' : 'Entrar no CONNECTA AI'}
                </h2>
                <p className="text-xs text-[#8b94ab] mt-1">Acesse seu painel de gestão financeira e BPO</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[#8b94ab] uppercase tracking-wider mb-1.5">E-mail</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com.br"
                    required
                    className="w-full bg-[#070a13] border border-[#1c2436] rounded-xl px-4 py-3 text-sm text-white placeholder-[#586178] focus:outline-none focus:border-[#2ee88a] transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#8b94ab] uppercase tracking-wider mb-1.5">Senha</label>
                  <div className="relative">
                    <input
                      type={mostrarSenha ? 'text' : 'password'}
                      value={senha}
                      onChange={(e) => setSenha(e.target.value)}
                      placeholder="••••••••"
                      required
                      minLength={6}
                      className="w-full bg-[#070a13] border border-[#1c2436] rounded-xl px-4 py-3 pr-12 text-sm text-white placeholder-[#586178] focus:outline-none focus:border-[#2ee88a] transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setMostrarSenha(!mostrarSenha)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8b94ab] hover:text-white transition-colors"
                    >
                      {mostrarSenha ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {!modoRegistro && (
                  <div className="text-right">
                    <button
                      type="button"
                      onClick={handleResetSenha}
                      disabled={carregando}
                      className="text-xs text-[#8b94ab] hover:text-[#2ee88a] transition-colors font-medium cursor-pointer"
                    >
                      Esqueceu a senha?
                    </button>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={carregando}
                  className="w-full bg-[#2ee88a] hover:bg-[#25c474] disabled:opacity-60 text-[#04150c] font-extrabold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-[#2ee88a]/30 mt-4 cursor-pointer"
                >
                  {carregando ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />}
                  {modoRegistro ? 'Criar Conta' : 'Entrar na Plataforma'}
                </button>
              </form>

              <p className="text-center text-xs text-[#8b94ab] mt-6">
                {modoRegistro ? 'Já tem uma conta?' : 'Ainda não tem acesso?'}{' '}
                <button
                  onClick={() => setModoRegistro(!modoRegistro)}
                  className="text-[#2ee88a] hover:underline font-bold transition-colors cursor-pointer"
                >
                  {modoRegistro ? 'Fazer login' : 'Criar conta'}
                </button>
              </p>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
