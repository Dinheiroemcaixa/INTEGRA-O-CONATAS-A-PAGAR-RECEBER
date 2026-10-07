'use client'

import React from 'react'
import Link from 'next/link'
import {
  ShoppingBag,
  FileText,
  ArrowDownToLine,
  Layers,
  ShieldCheck,
  ArrowRight,
  Database,
  Cloud,
  Link2,
  Cpu,
  Activity,
  CheckCircle2
} from 'lucide-react'
import SelectorEmpresa from '@/components/layout/SelectorEmpresa'

export default function DashboardPage() {
  return (
    <div className="space-y-7 sm:space-y-9 animate-fade-in flex flex-col min-h-full pb-8">
      {/* Topo: Barra com Seletor de Empresa Alinhado à Direita */}
      <div className="flex items-center justify-end w-full">
        <SelectorEmpresa />
      </div>

      {/* Hero Principal: Mensagem de Boas-Vindas à Esquerda + Diagrama do Ecossistema à Direita */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Lado Esquerdo: Mensagem Institucional Limpa e Direta */}
        <div className="lg:col-span-7 space-y-3.5">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-[1.15]">
            Bem-vindo ao{' '}
            <span className="text-emerald-500 dark:text-[#2ee88a] drop-shadow-[0_0_24px_rgba(46,232,138,0.35)]">
              Connecta AI
            </span>
          </h1>

          <p className="text-base sm:text-lg font-semibold text-slate-700 dark:text-slate-200">
            Plataforma de automação contábil, financeira e fiscal.
          </p>

          <p className="text-sm text-slate-500 dark:text-dark-300 leading-relaxed max-w-xl">
            Integre seus sistemas, automatize processos e tenha total controle das operações financeiras, fiscais e contábeis da sua empresa.
          </p>
        </div>

        {/* Lado Direito: Container do Diagrama de Integração do Ecossistema */}
        <div className="lg:col-span-5">
          <div className="relative rounded-3xl bg-slate-900/5 dark:bg-[#070e1c]/95 border border-slate-200/90 dark:border-cyan-500/30 p-6 sm:p-7 shadow-2xl overflow-hidden min-h-[160px] flex items-center justify-center">
            {/* Glow Central no Hub */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(46,232,138,0.14),rgba(56,189,248,0.1),transparent_75%)] pointer-events-none" />

            {/* Linhas de Conexão Estilo Circuito / Fibra Ótica SVG */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none" viewBox="0 0 420 160">
              <defs>
                <linearGradient id="circGradLeft" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.4" />
                  <stop offset="50%" stopColor="#2ee88a" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#2ee88a" stopOpacity="0.4" />
                </linearGradient>
                <linearGradient id="circGradRight" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#2ee88a" stopOpacity="0.4" />
                  <stop offset="50%" stopColor="#38bdf8" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.4" />
                </linearGradient>
                <filter id="circuitGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="2" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Fios Centrais */}
              <line x1="110" y1="80" x2="160" y2="80" stroke="url(#circGradLeft)" strokeWidth="2.5" filter="url(#circuitGlow)" />
              <line x1="260" y1="80" x2="310" y2="80" stroke="url(#circGradRight)" strokeWidth="2.5" filter="url(#circuitGlow)" />

              {/* Ramificações Superiores e Inferiores de Placa de Circuito */}
              <path d="M 110 68 L 130 68 L 145 76 L 160 76" stroke="rgba(56,189,248,0.4)" strokeWidth="1.5" fill="none" />
              <path d="M 110 92 L 130 92 L 145 84 L 160 84" stroke="rgba(46,232,138,0.4)" strokeWidth="1.5" fill="none" />
              <path d="M 260 76 L 275 76 L 290 68 L 310 68" stroke="rgba(56,189,248,0.4)" strokeWidth="1.5" fill="none" />
              <path d="M 260 84 L 275 84 L 290 92 L 310 92" stroke="rgba(46,232,138,0.4)" strokeWidth="1.5" fill="none" />

              {/* Nós de Conexão com Pulsos de Luz */}
              <circle cx="130" cy="68" r="2" fill="#38bdf8" />
              <circle cx="130" cy="92" r="2" fill="#2ee88a" />
              <circle cx="290" cy="68" r="2" fill="#38bdf8" />
              <circle cx="290" cy="92" r="2" fill="#2ee88a" />

              {/* Partículas de Dados em Trânsito Contínuo */}
              <circle r="3" fill="#2ee88a" filter="url(#circuitGlow)">
                <animateMotion dur="2.4s" repeatCount="indefinite" path="M 110 80 L 160 80" />
              </circle>
              <circle r="3" fill="#38bdf8" filter="url(#circuitGlow)">
                <animateMotion dur="2.4s" begin="1.2s" repeatCount="indefinite" path="M 160 80 L 110 80" />
              </circle>
              <circle r="3" fill="#38bdf8" filter="url(#circuitGlow)">
                <animateMotion dur="2.4s" repeatCount="indefinite" path="M 260 80 L 310 80" />
              </circle>
              <circle r="3" fill="#2ee88a" filter="url(#circuitGlow)">
                <animateMotion dur="2.4s" begin="1.2s" repeatCount="indefinite" path="M 310 80 L 260 80" />
              </circle>
            </svg>

            {/* Os Três Nós Centrais */}
            <div className="relative z-10 w-full flex items-center justify-between gap-2 max-w-sm mx-auto">
              {/* Card 1: Datacar */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/95 dark:bg-[#0c1424] border border-slate-200 dark:border-sky-500/30 shadow-md">
                <div className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" />
                    <circle cx="12" cy="12" r="3.5" />
                    <path d="M12 2v5M12 17v5M2 12h5M17 12h5" stroke="currentColor" strokeWidth="2" />
                  </svg>
                </div>
                <span className="text-xs font-bold text-slate-800 dark:text-white tracking-wide">
                  Datacar
                </span>
              </div>

              {/* Card 2: Connecta AI (Hub Proeminente com Glow Ciano/Esmeralda) */}
              <div className="relative flex flex-col items-center justify-center px-4 py-2.5 rounded-2xl bg-white dark:bg-[#071324] border-2 border-emerald-400 dark:border-cyan-400/80 shadow-[0_0_25px_rgba(6,182,212,0.35)]">
                <div className="w-9 h-9 rounded-full bg-slate-900 border border-emerald-400 flex items-center justify-center mb-1 shadow-md shadow-emerald-500/40">
                  <span className="text-emerald-400 font-black text-sm tracking-tighter">C</span>
                </div>
                <span className="text-[11px] font-black text-slate-900 dark:text-white tracking-wide">
                  Connecta AI
                </span>
              </div>

              {/* Card 3: Conta Azul */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/95 dark:bg-[#0c1424] border border-slate-200 dark:border-sky-500/30 shadow-md">
                <span className="text-xs font-bold text-slate-800 dark:text-white tracking-wide">
                  Conta Azul
                </span>
                <div className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 3C7.03 3 3 7.03 3 12s4.03 9 9 9 9-4.03 9-9c0-1.85-.56-3.57-1.52-5l-4.98 5-2.5-2.5 1.5-1.5 1 1 3.5-3.5C16.85 4.3 14.56 3 12 3z"/>
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Seção 2: Acesso Rápido aos Módulos */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
          Acesso Rápido aos Módulos
        </h2>

        {/* Grid de 5 Cards Responsivos */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {/* Card 1: Vendas Produtos */}
          <Link
            href="/vendas"
            className="group relative flex flex-col justify-between p-5 rounded-2xl bg-white dark:bg-[#0c1220] border border-slate-200/90 dark:border-white/[0.08] hover:border-emerald-500/60 dark:hover:border-emerald-500/50 hover:shadow-lg dark:hover:shadow-emerald-500/10 transition-all duration-200 transform hover:-translate-y-1"
          >
            <div>
              <div className="w-11 h-11 rounded-xl bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center mb-4 transition-transform group-hover:scale-110">
                <ShoppingBag size={20} />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-emerald-500 dark:group-hover:text-emerald-400 transition-colors">
                Vendas Produtos
              </h3>
              <p className="text-xs text-slate-600 dark:text-dark-300 mt-2 leading-relaxed">
                Sincronização Datacar, importação e emissão de NF-e.
              </p>
            </div>
            <div className="mt-5 flex items-center justify-end">
              <span className="w-8 h-8 rounded-full bg-slate-100 dark:bg-dark-800 text-slate-600 dark:text-dark-300 group-hover:bg-emerald-500 group-hover:text-white flex items-center justify-center transition-all duration-200">
                <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
              </span>
            </div>
          </Link>

          {/* Card 2: Vendas Serviços */}
          <Link
            href="/vendas-servicos"
            className="group relative flex flex-col justify-between p-5 rounded-2xl bg-white dark:bg-[#0c1220] border border-slate-200/90 dark:border-white/[0.08] hover:border-indigo-500/60 dark:hover:border-indigo-500/50 hover:shadow-lg dark:hover:shadow-indigo-500/10 transition-all duration-200 transform hover:-translate-y-1"
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-11 h-11 rounded-xl bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 border border-indigo-500/20 flex items-center justify-center transition-transform group-hover:scale-110">
                  <FileText size={20} />
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-500 dark:text-amber-400 tracking-wide uppercase">
                  EM BREVE
                </span>
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-indigo-500 dark:group-hover:text-indigo-400 transition-colors">
                Vendas Serviços
              </h3>
              <p className="text-xs text-slate-600 dark:text-dark-300 mt-2 leading-relaxed">
                Gestão de serviços, importação e emissão de NF-e.
              </p>
            </div>
            <div className="mt-5 flex items-center justify-end">
              <span className="w-8 h-8 rounded-full bg-slate-100 dark:bg-dark-800 text-slate-600 dark:text-dark-300 group-hover:bg-indigo-500 group-hover:text-white flex items-center justify-center transition-all duration-200">
                <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
              </span>
            </div>
          </Link>

          {/* Card 3: Contas a Pagar */}
          <Link
            href="/contas-pagar"
            className="group relative flex flex-col justify-between p-5 rounded-2xl bg-white dark:bg-[#0c1220] border border-slate-200/90 dark:border-white/[0.08] hover:border-sky-500/60 dark:hover:border-sky-500/50 hover:shadow-lg dark:hover:shadow-sky-500/10 transition-all duration-200 transform hover:-translate-y-1"
          >
            <div>
              <div className="w-11 h-11 rounded-xl bg-sky-500/10 text-sky-500 dark:text-sky-400 border border-sky-500/20 flex items-center justify-center mb-4 transition-transform group-hover:scale-110">
                <ArrowDownToLine size={20} />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-sky-500 dark:group-hover:text-sky-400 transition-colors">
                Contas a Pagar
              </h3>
              <p className="text-xs text-slate-600 dark:text-dark-300 mt-2 leading-relaxed">
                Importação, conferência e envio para Conta Azul.
              </p>
            </div>
            <div className="mt-5 flex items-center justify-end">
              <span className="w-8 h-8 rounded-full bg-slate-100 dark:bg-dark-800 text-slate-600 dark:text-dark-300 group-hover:bg-sky-500 group-hover:text-white flex items-center justify-center transition-all duration-200">
                <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
              </span>
            </div>
          </Link>

          {/* Card 4: Gestão Pagamentos */}
          <Link
            href="/gestao-pagamentos"
            className="group relative flex flex-col justify-between p-5 rounded-2xl bg-white dark:bg-[#0c1220] border border-slate-200/90 dark:border-white/[0.08] hover:border-amber-500/60 dark:hover:border-amber-500/50 hover:shadow-lg dark:hover:shadow-amber-500/10 transition-all duration-200 transform hover:-translate-y-1"
          >
            <div>
              <div className="w-11 h-11 rounded-xl bg-amber-500/10 text-amber-500 dark:text-amber-400 border border-amber-500/20 flex items-center justify-center mb-4 transition-transform group-hover:scale-110">
                <Layers size={20} />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-amber-500 dark:group-hover:text-amber-400 transition-colors">
                Gestão Pagamentos
              </h3>
              <p className="text-xs text-slate-600 dark:text-dark-300 mt-2 leading-relaxed">
                Controle de grupos, agendamentos e fluxo financeiro.
              </p>
            </div>
            <div className="mt-5 flex items-center justify-end">
              <span className="w-8 h-8 rounded-full bg-slate-100 dark:bg-dark-800 text-slate-600 dark:text-dark-300 group-hover:bg-amber-500 group-hover:text-white flex items-center justify-center transition-all duration-200">
                <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
              </span>
            </div>
          </Link>

          {/* Card 5: Auditoria Inteligente */}
          <Link
            href="/auditoria-conciliacoes-ca"
            className="group relative flex flex-col justify-between p-5 rounded-2xl bg-white dark:bg-[#0c1220] border border-slate-200/90 dark:border-white/[0.08] hover:border-purple-500/60 dark:hover:border-purple-500/50 hover:shadow-lg dark:hover:shadow-purple-500/10 transition-all duration-200 transform hover:-translate-y-1"
          >
            <div>
              <div className="w-11 h-11 rounded-xl bg-purple-500/10 text-purple-500 dark:text-purple-400 border border-purple-500/20 flex items-center justify-center mb-4 transition-transform group-hover:scale-110">
                <ShieldCheck size={20} />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-purple-500 dark:group-hover:text-purple-400 transition-colors">
                Auditoria Inteligente
              </h3>
              <p className="text-xs text-slate-600 dark:text-dark-300 mt-2 leading-relaxed">
                Conciliações, divergências e análises automáticas.
              </p>
            </div>
            <div className="mt-5 flex items-center justify-end">
              <span className="w-8 h-8 rounded-full bg-slate-100 dark:bg-dark-800 text-slate-600 dark:text-dark-300 group-hover:bg-purple-500 group-hover:text-white flex items-center justify-center transition-all duration-200">
                <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
              </span>
            </div>
          </Link>
        </div>
      </div>

      {/* Seção 3: Ecossistema Connecta AI & Status do Sistema */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bloco 1: Ecossistema Connecta AI (Institucional) */}
        <div className="rounded-2xl bg-white dark:bg-[#0c1220] border border-slate-200/90 dark:border-white/[0.08] p-5 sm:p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/[0.06]">
              <div className="flex items-center gap-2.5">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Ecossistema Connecta AI
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-dark-400">
                    Arquitetura e integrações corporativas
                  </p>
                </div>
              </div>
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                Monitorado
              </span>
            </div>

            <p className="text-xs text-slate-600 dark:text-dark-300 my-4 leading-relaxed font-medium">
              Todos os serviços operacionais e integrações monitorados pela plataforma.
            </p>

            {/* Lista dos 4 Serviços Oficiais com os pontos verdes */}
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-dark-850/50 border border-slate-200/70 dark:border-white/[0.04]">
                <div className="flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20 shrink-0" />
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 dark:text-white">Datacar DMS</h4>
                    <p className="text-[11px] text-slate-500 dark:text-dark-400">Extração contábil, balcão e vendas de concessionária</p>
                  </div>
                </div>
                <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-md">
                  Integrado
                </span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-dark-850/50 border border-slate-200/70 dark:border-white/[0.04]">
                <div className="flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20 shrink-0" />
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 dark:text-white">Connecta AI</h4>
                    <p className="text-[11px] text-slate-500 dark:text-dark-400">Motor inteligente de conferência, de-para e regras</p>
                  </div>
                </div>
                <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-md">
                  Ativo
                </span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-dark-850/50 border border-slate-200/70 dark:border-white/[0.04]">
                <div className="flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20 shrink-0" />
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 dark:text-white">Conta Azul</h4>
                    <p className="text-[11px] text-slate-500 dark:text-dark-400">ERP financeiro, faturamento fiscal e conciliação</p>
                  </div>
                </div>
                <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-md">
                  Conectado
                </span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-dark-850/50 border border-slate-200/70 dark:border-white/[0.04]">
                <div className="flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20 shrink-0" />
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 dark:text-white">Supabase Cloud</h4>
                    <p className="text-[11px] text-slate-500 dark:text-dark-400">Banco relacional, alta disponibilidade e governança</p>
                  </div>
                </div>
                <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-md">
                  Operacional
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Bloco 2: Status do Sistema (Idêntico ao mock de referência) */}
        <div className="rounded-2xl bg-white dark:bg-[#0c1220] border border-slate-200/90 dark:border-white/[0.08] p-5 sm:p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/[0.06]">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400">
                  <Activity size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Status do Sistema
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-dark-400">
                    Disponibilidade e conectividade contínua
                  </p>
                </div>
              </div>
              <span className="text-[11px] text-slate-400 hover:text-white transition-colors cursor-default">
                Ver detalhes
              </span>
            </div>

            <p className="text-xs text-slate-600 dark:text-dark-300 my-4 leading-relaxed font-medium">
              Monitoramento contínuo dos serviços de backend, banco de dados e APIs externas.
            </p>

            {/* Lista dos 4 Componentes de Status com Badges Verdes Online */}
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-dark-850/50 border border-slate-200/70 dark:border-white/[0.04]">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-slate-200/60 dark:bg-dark-700/60 text-slate-700 dark:text-dark-300">
                    <Database size={16} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 dark:text-white">Banco de Dados</h4>
                    <p className="text-[11px] text-slate-500 dark:text-dark-400">Supabase</p>
                  </div>
                </div>
                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-md border border-emerald-500/20">
                  Online
                </span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-dark-850/50 border border-slate-200/70 dark:border-white/[0.04]">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-slate-200/60 dark:bg-dark-700/60 text-slate-700 dark:text-dark-300">
                    <Cloud size={16} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 dark:text-white">Integrações</h4>
                    <p className="text-[11px] text-slate-500 dark:text-dark-400">Conta Azul / Datacar</p>
                  </div>
                </div>
                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-md border border-emerald-500/20">
                  Online
                </span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-dark-850/50 border border-slate-200/70 dark:border-white/[0.04]">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-slate-200/60 dark:bg-dark-700/60 text-slate-700 dark:text-dark-300">
                    <Link2 size={16} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 dark:text-white">APIs</h4>
                    <p className="text-[11px] text-slate-500 dark:text-dark-400">Conectividade ativa</p>
                  </div>
                </div>
                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-md border border-emerald-500/20">
                  Online
                </span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-dark-850/50 border border-slate-200/70 dark:border-white/[0.04]">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-slate-200/60 dark:bg-dark-700/60 text-slate-700 dark:text-dark-300">
                    <Cpu size={16} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 dark:text-white">Processamento</h4>
                    <p className="text-[11px] text-slate-500 dark:text-dark-400">Sistemas operacionais</p>
                  </div>
                </div>
                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-md border border-emerald-500/20">
                  Online
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


