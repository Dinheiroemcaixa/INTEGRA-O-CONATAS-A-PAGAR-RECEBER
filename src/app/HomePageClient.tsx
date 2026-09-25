'use client'

import Link from 'next/link'
import {
  LogIn,
  Car, Building2, CreditCard, Receipt,
  ArrowDownToLine, RefreshCw, Zap, ArrowLeftRight,
  Sun, Moon
} from 'lucide-react'
import { useAppConfig } from '@/contexts/AppConfigContext'

export default function HomePageClient() {
  const { config, update } = useAppConfig()

  return (
    <div className="relative min-h-screen bg-slate-50 dark:bg-[#070a13] text-slate-800 dark:text-[#f4f6fb] overflow-x-hidden selection:bg-emerald-500 selection:text-white dark:selection:text-black transition-colors duration-200">

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
      <div className="absolute inset-0 pointer-events-none z-0 bg-[radial-gradient(900px_600px_at_78%_-8%,rgba(46,232,138,0.08),transparent_60%),radial-gradient(700px_500px_at_12%_8%,rgba(91,157,245,0.08),transparent_55%)] dark:bg-[radial-gradient(900px_600px_at_78%_-8%,rgba(46,232,138,0.15),transparent_60%),radial-gradient(700px_500px_at_12%_8%,rgba(91,157,245,0.12),transparent_55%)]" />
      <div className="absolute inset-0 z-0 pointer-events-none bg-[radial-gradient(1px_1px_at_12%_18%,#cbd5e1,transparent),radial-gradient(1px_1px_at_44%_28%,#cbd5e1,transparent),radial-gradient(1px_1px_at_79%_22%,#cbd5e1,transparent)] dark:bg-[radial-gradient(1px_1px_at_12%_18%,#fff,transparent),radial-gradient(1px_1px_at_44%_28%,#fff,transparent),radial-gradient(1px_1px_at_79%_22%,#fff,transparent)] opacity-40" />

      {/* NAV COMPACTA */}
      <nav className="relative z-20 max-w-[1180px] mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5 font-extrabold text-lg tracking-wider">
          <div className="w-7 h-7 rounded-lg bg-[#2ee88a] text-[#04150c] flex items-center justify-center font-black text-sm shadow-md shadow-[#2ee88a]/20">
            C
          </div>
          <span className="text-slate-900 dark:text-white text-base">CONNECTA<span className="text-[#2ee88a] ml-1">AI</span></span>
        </div>

        <div className="hidden md:flex items-center gap-6 text-xs font-semibold text-slate-600 dark:text-[#8b94ab]">
          <a href="#como" className="hover:text-slate-900 dark:hover:text-white transition-colors">Como funciona</a>
          <a href="#integracoes" className="hover:text-slate-900 dark:hover:text-white transition-colors">Integrações</a>
          <a href="#recursos" className="hover:text-slate-900 dark:hover:text-white transition-colors">Recursos</a>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => update({ darkMode: !config.darkMode })}
            title={config.darkMode ? 'Mudar para Modo Claro' : 'Mudar para Modo Escuro'}
            className="p-1.5 rounded-xl border border-slate-200 dark:border-[#1c2436] bg-white dark:bg-[#0c1120] hover:bg-slate-100 dark:hover:bg-[#151c2e] text-slate-600 dark:text-[#8b94ab] hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer shadow-xs"
          >
            {config.darkMode ? <Sun size={14} className="text-amber-400" /> : <Moon size={14} className="text-indigo-500" />}
          </button>

          <Link
            href="/login"
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-[#1c2436] bg-white dark:bg-[#0c1120] hover:bg-slate-100 dark:hover:bg-[#151c2e] hover:border-[#2ee88a]/40 text-xs font-semibold text-slate-800 dark:text-[#f4f6fb] transition-all cursor-pointer shadow-xs"
          >
            <LogIn size={14} className="text-[#2ee88a]" />
            Entrar
          </Link>
        </div>
      </nav>

      {/* HERO SECTION COMPACTADA (OTIMIZADA PARA PRIMEIRA DOBRA EM NOTEBOOKS) */}
      <header className="relative z-10 max-w-[1080px] mx-auto px-4 pt-1 pb-4 text-center">
        {/* BADGE */}
        <div className="inline-flex items-center gap-2 bg-white dark:bg-[#0c1120] border border-slate-200 dark:border-[#1c2436] px-3 py-1 rounded-full text-[11px] font-semibold tracking-wider text-slate-600 dark:text-[#8b94ab] uppercase mb-2 shadow-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-[#2ee88a] animate-pulse" />
          BPO FINANCEIRO · GESTÃO FINANCEIRA COMPLETA
        </div>

        {/* TITLE */}
        <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight mb-1 text-slate-900 dark:text-white drop-shadow-[0_0_40px_rgba(46,232,138,0.15)] dark:drop-shadow-[0_0_40px_rgba(46,232,138,0.25)]">
          CONNECTA <span className="text-[#2ee88a]">AI</span>
        </h1>

        {/* TAGLINE */}
        <h2 className="text-base md:text-2xl font-bold max-w-2xl mx-auto leading-tight text-slate-800 dark:text-white mb-1.5">
          Contas a pagar, pagamentos e NFe, <span className="text-[#2ee88a]">tudo em um clique.</span>
        </h2>

        {/* SUBTITLE */}
        <p className="text-xs md:text-sm text-slate-600 dark:text-[#8b94ab] max-w-2xl mx-auto leading-relaxed mb-4">
          O CONNECTA AI busca contas a pagar, contas a receber e vendas no seu sistema, deixa você conferir tudo, executa os pagamentos e emite a NFe automaticamente — do lançamento à nota fiscal, sem digitação e sem retrabalho.
        </p>

        {/* DIAGRAMA DINÂMICO DE ENERGIA FLUINDO NOS FIOS (ANIMAÇÃO 100% PRESERVADA) */}
        <div className="relative max-w-4xl mx-auto px-2 py-1 overflow-hidden mb-5">
          <div className="relative min-h-[340px] flex flex-col justify-between">
            
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
            <div className="flex justify-between items-center z-10 gap-3">
              {/* NÓ DATACAR */}
              <div className="bg-white dark:bg-[#0c1120] border border-slate-200/90 dark:border-[#1c2436] rounded-xl p-3 w-44 text-left shadow-lg dark:shadow-xl hover:border-[#f0b74f] transition-all transform hover:-translate-y-0.5">
                <div className="w-8 h-8 rounded-lg bg-[#f0b74f]/15 text-[#f0b74f] flex items-center justify-center text-base mb-1.5 shadow-xs">
                  <Car size={16} />
                </div>
                <div className="text-xs font-bold text-slate-900 dark:text-white">Datacar</div>
                <div className="text-[10px] text-slate-500 dark:text-[#586178]">Sistema de origem</div>
                <div className="mt-1 text-[9px] font-mono text-[#f0b74f] uppercase tracking-wider font-bold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#f0b74f] animate-pulse inline-block" />
                  Extrai Dados
                </div>
              </div>

              {/* NÓ CONTA AZUL */}
              <div className="bg-white dark:bg-[#0c1120] border border-slate-200/90 dark:border-[#1c2436] rounded-xl p-3 w-44 text-left shadow-lg dark:shadow-xl hover:border-[#2ee88a] transition-all transform hover:-translate-y-0.5">
                <div className="w-8 h-8 rounded-lg bg-[#2ee88a]/15 text-[#2ee88a] flex items-center justify-center text-base mb-1.5 shadow-xs">
                  <Building2 size={16} />
                </div>
                <div className="text-xs font-bold text-slate-900 dark:text-white">Conta Azul</div>
                <div className="text-[10px] text-slate-500 dark:text-[#586178]">Sistema de destino</div>
                <div className="mt-1 text-[9px] font-mono text-[#2ee88a] uppercase tracking-wider font-bold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#2ee88a] animate-pulse inline-block" />
                  Importa & Lança
                </div>
              </div>
            </div>

            {/* CENTRO: NÓ PRINCIPAL CONNECTA AI (PULSANDO COM ENERGIA) */}
            <div className="self-center z-20 my-1">
              <div className="core-node bg-white dark:bg-[#0c1120] border-2 border-emerald-500 dark:border-[#2ee88a] rounded-2xl p-3.5 w-56 text-center bg-gradient-to-b from-white via-emerald-50/30 to-white dark:from-[#0c1120] dark:via-[#101e33] dark:to-[#0c1120] cursor-pointer shadow-xl dark:shadow-2xl">
                <div className="w-9 h-9 rounded-xl bg-[#2ee88a] text-[#04150c] flex items-center justify-center text-lg font-black mx-auto mb-1.5 shadow-lg shadow-[#2ee88a]/30">
                  C
                </div>
                <div className="text-base font-black text-slate-900 dark:text-white tracking-wide">CONNECTA AI</div>
                <div className="text-[11px] text-emerald-600 dark:text-[#2ee88a] font-bold mt-0.5">Confere, Paga & Emite</div>
                <div className="mt-1.5 text-[9px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-[#bdf5da] px-2 py-0.5 rounded-full inline-flex items-center gap-1 font-semibold">
                  <Zap size={10} className="fill-emerald-500 dark:fill-[#2ee88a] text-emerald-500 dark:text-[#2ee88a]" /> Hub de IA & BPO Inteligente
                </div>
              </div>
            </div>

            {/* SEGUNDA LINHA DE NÓS (PAGAMENTOS & NFE) */}
            <div className="flex justify-between items-center z-10 gap-3">
              {/* NÓ GESTÃO PAGAMENTOS */}
              <div className="bg-white dark:bg-[#0c1120] border border-slate-200/90 dark:border-[#1c2436] rounded-xl p-3 w-44 text-left shadow-lg dark:shadow-xl hover:border-[#5b9df5] transition-all transform hover:-translate-y-0.5">
                <div className="w-8 h-8 rounded-lg bg-[#5b9df5]/15 text-[#5b9df5] flex items-center justify-center text-base mb-1.5 shadow-xs">
                  <CreditCard size={16} />
                </div>
                <div className="text-xs font-bold text-slate-900 dark:text-white">Gestão de Pagamentos</div>
                <div className="text-[10px] text-slate-500 dark:text-[#586178]">Aprova & executa</div>
                <div className="mt-1 text-[9px] font-mono text-[#5b9df5] uppercase tracking-wider font-bold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#5b9df5] animate-pulse inline-block" />
                  Paga Boletos
                </div>
              </div>

              {/* NÓ NFE */}
              <div className="bg-white dark:bg-[#0c1120] border border-slate-200/90 dark:border-[#1c2436] rounded-xl p-3 w-44 text-left shadow-lg dark:shadow-xl hover:border-[#9b8cf0] transition-all transform hover:-translate-y-0.5">
                <div className="w-8 h-8 rounded-lg bg-[#9b8cf0]/15 text-[#9b8cf0] flex items-center justify-center text-base mb-1.5 shadow-xs">
                  <Receipt size={16} />
                </div>
                <div className="text-xs font-bold text-slate-900 dark:text-white">Emissão de NFe</div>
                <div className="text-[10px] text-slate-500 dark:text-[#586178]">Nota automática</div>
                <div className="mt-1 text-[9px] font-mono text-[#9b8cf0] uppercase tracking-wider font-bold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#9b8cf0] animate-pulse inline-block" />
                  Emite NFes
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* AS 4 CAIXINHAS DE RECURSOS COM ÍCONES LUCIDE */}
        <div id="recursos" className="grid grid-cols-2 md:grid-cols-4 gap-2.5 max-w-4xl mx-auto mb-8">
          <div className="bg-white dark:bg-[#0c1120] border border-slate-200 dark:border-[#1c2436] rounded-xl p-3 flex flex-col items-center gap-1.5 text-center hover:border-[#5b9df5]/50 transition-all shadow-xs dark:shadow-md group">
            <div className="w-8 h-8 rounded-lg bg-[#5b9df5]/15 text-[#5b9df5] flex items-center justify-center transition-transform group-hover:scale-110">
              <ArrowDownToLine size={16} />
            </div>
            <div className="text-xs font-bold text-slate-900 dark:text-white">Contas a Pagar</div>
            <div className="text-[10px] text-slate-500 dark:text-[#586178]">Captura automática</div>
          </div>

          <div className="bg-white dark:bg-[#0c1120] border border-slate-200 dark:border-[#1c2436] rounded-xl p-3 flex flex-col items-center gap-1.5 text-center hover:border-[#2ee88a]/50 transition-all shadow-xs dark:shadow-md group">
            <div className="w-8 h-8 rounded-lg bg-[#2ee88a]/15 text-[#2ee88a] flex items-center justify-center transition-transform group-hover:scale-110">
              <CreditCard size={16} />
            </div>
            <div className="text-xs font-bold text-slate-900 dark:text-white">Gestão de Pagamentos</div>
            <div className="text-[10px] text-slate-500 dark:text-[#586178]">Aprova & executa</div>
          </div>

          <div className="bg-white dark:bg-[#0c1120] border border-slate-200 dark:border-[#1c2436] rounded-xl p-3 flex flex-col items-center gap-1.5 text-center hover:border-[#9b8cf0]/50 transition-all shadow-xs dark:shadow-md group">
            <div className="w-8 h-8 rounded-lg bg-[#9b8cf0]/15 text-[#9b8cf0] flex items-center justify-center transition-transform group-hover:scale-110">
              <Receipt size={16} />
            </div>
            <div className="text-xs font-bold text-slate-900 dark:text-white">Emissão de NFe</div>
            <div className="text-[10px] text-slate-500 dark:text-[#586178]">Nota automática</div>
          </div>

          <div className="bg-white dark:bg-[#0c1120] border border-slate-200 dark:border-[#1c2436] rounded-xl p-3 flex flex-col items-center gap-1.5 text-center hover:border-[#f0b74f]/50 transition-all shadow-xs dark:shadow-md group">
            <div className="w-8 h-8 rounded-lg bg-[#f0b74f]/15 text-[#f0b74f] flex items-center justify-center transition-transform group-hover:scale-110">
              <RefreshCw size={16} />
            </div>
            <div className="text-xs font-bold text-slate-900 dark:text-white">Datacar ↔ Conta Azul</div>
            <div className="text-[10px] text-slate-500 dark:text-[#586178]">Sincronizado</div>
          </div>
        </div>

      </header>

      {/* COMO FUNCIONA COM ÍCONES LUCIDE */}
      <section id="como" className="relative z-10 max-w-[1120px] mx-auto px-4 py-12 border-t border-slate-200 dark:border-[#1c2436]/50">
        <div className="text-center mb-10">
          <div className="text-xs font-bold tracking-widest text-emerald-600 dark:text-[#2ee88a] uppercase mb-1.5">Como Funciona</div>
          <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white">Fluxo Inteligente. Zero Digitação.</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="bg-white dark:bg-[#0c1120] border border-slate-200 dark:border-[#1c2436] rounded-2xl p-5 hover:border-emerald-500/40 dark:hover:border-[#2ee88a]/40 shadow-xs dark:shadow-md transition-all">
            <div className="flex items-center justify-between mb-3.5">
              <div className="w-10 h-10 rounded-xl bg-[#5b9df5]/15 text-[#5b9df5] flex items-center justify-center">
                <ArrowDownToLine size={20} />
              </div>
              <span className="text-2xl font-black text-slate-200 dark:text-[#1c2436]">01</span>
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1.5">Busca & Captura</h3>
            <p className="text-xs text-slate-600 dark:text-[#8b94ab] leading-relaxed">
              O CONNECTA AI acessa o Datacar e extrai automaticamente as contas a pagar, contas a receber e vendas do período com total precisão.
            </p>
          </div>

          <div className="bg-white dark:bg-[#0c1120] border border-slate-200 dark:border-[#1c2436] rounded-2xl p-5 hover:border-emerald-500/40 dark:hover:border-[#2ee88a]/40 shadow-xs dark:shadow-md transition-all">
            <div className="flex items-center justify-between mb-3.5">
              <div className="w-10 h-10 rounded-xl bg-[#2ee88a]/15 text-[#2ee88a] flex items-center justify-center">
                <CreditCard size={20} />
              </div>
              <span className="text-2xl font-black text-slate-200 dark:text-[#1c2436]">02</span>
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1.5">Gestão de Pagamentos</h3>
            <p className="text-xs text-slate-600 dark:text-[#8b94ab] leading-relaxed">
              Organiza boletos, DDAs e agendamentos por loja e conta bancária. Permite aprovar e executar pagamentos sem retrabalho manual.
            </p>
          </div>

          <div className="bg-white dark:bg-[#0c1120] border border-slate-200 dark:border-[#1c2436] rounded-2xl p-5 hover:border-emerald-500/40 dark:hover:border-[#2ee88a]/40 shadow-xs dark:shadow-md transition-all">
            <div className="flex items-center justify-between mb-3.5">
              <div className="w-10 h-10 rounded-xl bg-[#9b8cf0]/15 text-[#9b8cf0] flex items-center justify-center">
                <Receipt size={20} />
              </div>
              <span className="text-2xl font-black text-slate-200 dark:text-[#1c2436]">03</span>
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1.5">NFe & Conta Azul</h3>
            <p className="text-xs text-slate-600 dark:text-[#8b94ab] leading-relaxed">
              Sincroniza os lançamentos aprovados com o Conta Azul e habilita a emissão automática de Notas Fiscais com um único clique.
            </p>
          </div>
        </div>
      </section>

      {/* INTEGRAÇÕES COM ÍCONES LUCIDE */}
      <section id="integracoes" className="relative z-10 max-w-[1120px] mx-auto px-4 py-12 border-t border-slate-200 dark:border-[#1c2436]/50">
        <div className="bg-gradient-to-r from-slate-100 via-emerald-50/20 to-slate-100 dark:from-[#0c1120] dark:via-[#142238] dark:to-[#0c1120] border border-slate-200 dark:border-[#1c2436] rounded-3xl p-6 md:p-10 flex flex-col md:flex-row items-center justify-between gap-6 shadow-lg dark:shadow-2xl">
          <div className="max-w-xl">
            <div className="text-xs font-bold tracking-widest text-emerald-600 dark:text-[#2ee88a] uppercase mb-1.5">Integrações Conectadas</div>
            <h2 className="text-xl md:text-2xl font-extrabold text-slate-900 dark:text-white mb-3">Datacar e Conta Azul em Perfeita Sincronia</h2>
            <p className="text-xs md:text-sm text-slate-600 dark:text-[#8b94ab] leading-relaxed mb-4">
              Integração nativa de alta velocidade conectando o seu ERP Datacar ao Conta Azul para automação financeira completa de BPO.
            </p>
            <div className="inline-flex items-center gap-2 bg-white dark:bg-[#0c1120] border border-slate-200 dark:border-[#1c2436] px-3 py-1 rounded-full text-xs text-slate-600 dark:text-[#8b94ab] shadow-xs">
              <span className="w-2 h-2 rounded-full bg-[#2ee88a]" />
              Conexões multi-empresas e multi-bancos ativas
            </div>
          </div>

          <div className="flex items-center gap-4 bg-white dark:bg-[#0c1120] border border-slate-200 dark:border-[#1c2436] p-5 rounded-2xl shadow-md dark:shadow-xl">
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 dark:text-amber-400 mb-1.5">
                <Car size={26} />
              </div>
              <div className="text-xs font-bold text-slate-900 dark:text-white">Datacar</div>
            </div>

            <div className="text-emerald-600 dark:text-[#2ee88a] p-2 bg-emerald-500/10 dark:bg-[#2ee88a]/10 rounded-xl border border-emerald-500/20 dark:border-[#2ee88a]/20">
              <ArrowLeftRight size={18} />
            </div>

            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 dark:bg-[#2ee88a]/10 border border-emerald-500/20 dark:border-[#2ee88a]/20 flex items-center justify-center text-emerald-600 dark:text-[#2ee88a] mb-1.5">
                <Building2 size={26} />
              </div>
              <div className="text-xs font-bold text-slate-900 dark:text-white">Conta Azul</div>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative z-10 max-w-[1120px] mx-auto px-4 py-12 border-t border-slate-200 dark:border-[#1c2436]/50 text-center md:text-left">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-[#8b94ab]">
          <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
            <div className="w-6 h-6 rounded-md bg-[#2ee88a] text-[#04150c] flex items-center justify-center font-black text-xs">C</div>
            <span>CONNECTA<span className="text-emerald-600 dark:text-[#2ee88a]">AI</span></span>
          </div>
          <div>BPO Financeiro · Automação Inteligente · Gestão Eficiente</div>
          <div>© 2026 CONNECTA AI. Todos os direitos reservados.</div>
        </div>
      </footer>

    </div>
  )
}
