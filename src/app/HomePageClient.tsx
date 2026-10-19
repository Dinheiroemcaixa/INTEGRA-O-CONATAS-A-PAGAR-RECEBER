'use client'

import Link from 'next/link'
import { DM_Sans } from 'next/font/google'
import {
  LogIn,
  Car,
  Building2,
  CreditCard,
  Receipt,
  ArrowDownToLine,
  RefreshCw,
  ArrowLeftRight,
} from 'lucide-react'

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
})

function DcxLinkMark({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={(size * 28) / 24}
      height={size}
      viewBox="0 0 28 24"
      className="flex-none block"
      aria-hidden="true"
    >
      <circle
        cx="10"
        cy="12"
        r="7"
        fill="none"
        stroke="#fff"
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle
        cx="18"
        cy="12"
        r="7"
        fill="none"
        stroke="#5FD68B"
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

export default function HomePageClient() {

  return (
    <div
      data-screen-label="Tela inicial"
      className={`${dmSans.className} relative min-h-screen bg-[#F7F9FB] dark:bg-[#07111d] text-[#0D2137] dark:text-[#f4f6fb] overflow-x-hidden selection:bg-[#5FD68B] selection:text-[#0D2137] antialiased transition-colors duration-200`}
    >
      <style
        dangerouslySetInnerHTML={{
          __html:
            'html:not(.dark) [data-screen-label="Tela inicial"] .dcx-on-dark, html:not(.dark) [data-screen-label="Tela inicial"] h2.dcx-on-dark-heading { color: #ffffff !important; }',
        }}
      />

      {/* HEADER INSTITUCIONAL DCX LINK */}
      <header className="sticky top-0 z-30 bg-[#0D2137] border-b border-white/10 shadow-sm">
        <div className="max-w-[1220px] mx-auto px-4 md:px-8 py-3 min-h-[68px] flex items-center justify-between gap-4 md:gap-7">
          {/* Esquerda: Marca DCX LINK */}
          <a
            href="#inicio"
            title="DCX LINK — O elo entre seus sistemas"
            className="dcx-on-dark flex items-center gap-2.5 !text-[#ffffff] flex-none group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5FD68B] rounded-lg py-1"
          >
            <DcxLinkMark size={22} />
            <div className="flex flex-col">
              <span className="dcx-on-dark text-[15px] md:text-[16px] font-medium tracking-[0.3em] !text-[#ffffff] leading-none">
                DCX LINK
              </span>
              <span className="hidden sm:inline text-[10px] font-medium text-[#A9B8C7] tracking-normal mt-1 leading-none">
                O elo entre seus sistemas
              </span>
            </div>
          </a>

          {/* Centro: Navegação Principal (Desktop) */}
          <nav
            aria-label="Navegação principal"
            className="hidden lg:flex items-center gap-1 flex-1 min-w-0 overflow-hidden whitespace-nowrap"
          >
            <a
              href="#agente-financeiro"
              className="dcx-on-dark !text-[#ffffff] hover:bg-white/[0.07] font-semibold text-[15px] px-3 py-2 rounded-[7px] flex items-center gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5FD68B]"
            >
              <span className="text-[#5FD68B] text-xs" aria-hidden="true">
                ✦
              </span>
              <span className="dcx-on-dark !text-[#ffffff]">Agente Financeiro</span>
              <span className="text-[9px] font-bold tracking-[0.06em] border border-[#5FD68B] text-[#5FD68B] px-1.5 py-0.5 rounded-[3px]">
                NOVO
              </span>
            </a>

            <a
              href="#como"
              className="dcx-on-dark !text-[#ffffff]/90 hover:!text-[#ffffff] hover:bg-white/[0.07] font-semibold text-[15px] px-3 py-2 rounded-[7px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5FD68B]"
            >
              Como funciona
            </a>

            <a
              href="#integracoes"
              className="dcx-on-dark !text-[#ffffff]/90 hover:!text-[#ffffff] hover:bg-white/[0.07] font-semibold text-[15px] px-3 py-2 rounded-[7px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5FD68B]"
            >
              Integrações
            </a>

            <a
              href="#recursos"
              className="text-[#5FD68B] bg-white/[0.08] hover:bg-white/[0.12] font-semibold text-[15px] px-3 py-2 rounded-[7px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5FD68B]"
            >
              Recursos
            </a>
          </nav>

          {/* Direita: Acesso ao Sistema */}
          <div className="flex items-center gap-2.5 flex-none">
            <Link
              href="/login"
              className="bg-[#5FD68B] hover:bg-[#7FE3A4] text-[#0D2137] font-bold text-sm md:text-[15px] px-4 py-2.5 rounded-[9px] transition-colors flex items-center gap-2 whitespace-nowrap shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <LogIn size={16} className="stroke-[2.2]" />
              <span>Entrar</span>
              <span className="hidden sm:inline">no sistema</span>
            </Link>
          </div>
        </div>

        {/* Barra de navegação rápida mobile/tablet */}
        <nav
          aria-label="Navegação rápida mobile"
          className="lg:hidden border-t border-white/10 px-4 py-2 flex items-center gap-2 overflow-x-auto text-xs font-semibold text-[#A9B8C7]"
        >
          <a
            href="#agente-financeiro"
            className="dcx-on-dark !text-[#ffffff] bg-white/[0.06] px-2.5 py-1 rounded-md flex items-center gap-1.5 whitespace-nowrap"
          >
            <span className="text-[#5FD68B]" aria-hidden="true">
              ✦
            </span>
            <span className="dcx-on-dark !text-[#ffffff]">Agente Financeiro</span>
            <span className="text-[8px] font-bold border border-[#5FD68B] text-[#5FD68B] px-1 py-0.2 rounded-[3px]">
              NOVO
            </span>
          </a>
          <a href="#como" className="px-2.5 py-1 rounded-md hover:!text-[#ffffff] whitespace-nowrap">
            Como funciona
          </a>
          <a
            href="#integracoes"
            className="px-2.5 py-1 rounded-md hover:!text-[#ffffff] whitespace-nowrap"
          >
            Integrações
          </a>
          <a
            href="#recursos"
            className="text-[#5FD68B] px-2.5 py-1 rounded-md hover:!text-[#ffffff] whitespace-nowrap"
          >
            Recursos
          </a>
        </nav>
      </header>

      {/* CONTEÚDO PRINCIPAL & HERO SECTION */}
      <main
        id="inicio"
        className="max-w-[1220px] mx-auto px-4 md:px-8 pt-8 md:pt-[56px] pb-16 md:pb-[80px]"
      >
        <div className="max-w-[1010px] mx-auto">
          {/* 1. Trilha de navegação (Breadcrumbs) idêntica à referência */}
          <nav
            aria-label="Trilha de navegação"
            className="flex items-center gap-[10px] text-[14px] flex-wrap"
          >
            <a
              href="#inicio"
              className="text-[#1B4F8A] dark:text-[#7FB4F0] underline underline-offset-[3px] decoration-[#9DB3C9] dark:decoration-[#7FB4F0]/50 hover:text-[#0D2137] dark:hover:!text-[#ffffff] transition-colors"
            >
              Início
            </a>
            <span className="text-[#8A99A8] text-[10px]" aria-hidden="true">
              ›
            </span>
            <a
              href="#recursos"
              className="text-[#1B4F8A] dark:text-[#7FB4F0] underline underline-offset-[3px] decoration-[#9DB3C9] dark:decoration-[#7FB4F0]/50 hover:text-[#0D2137] dark:hover:!text-[#ffffff] transition-colors"
            >
              BPO Financeiro
            </a>
            <span className="text-[#8A99A8] text-[10px]" aria-hidden="true">
              ›
            </span>
            <a
              href="#como"
              className="text-[#1B4F8A] dark:text-[#7FB4F0] underline underline-offset-[3px] decoration-[#9DB3C9] dark:decoration-[#7FB4F0]/50 hover:text-[#0D2137] dark:hover:!text-[#ffffff] transition-colors"
            >
              Automação com IA
            </a>
          </nav>

          {/* 2. Título Principal idêntico à referência */}
          <h1
            className="mt-[26px] text-[#0D2137] dark:!text-[#ffffff] font-bold tracking-[-0.045em] text-balance"
            style={{
              fontSize: 'clamp(36px, 4.6vw, 52px)',
              lineHeight: 1.12,
            }}
          >
            Contas a pagar, pagamentos e <span className="whitespace-nowrap">NF-e</span> no
            automático para sua empresa
          </h1>

          {/* 3. Linha de Assinatura e Credibilidade idêntica à referência */}
          <div className="flex items-center gap-[14px] mt-[28px] text-[14px] text-[#5A6B7C] dark:text-[#A9B8C7] flex-wrap">
            <div
              className="w-[34px] h-[34px] rounded-full bg-[#0D2137] dark:bg-[#10294A] border border-transparent dark:border-[#5FD68B]/40 text-[#5FD68B] text-[11px] font-bold flex items-center justify-center flex-none"
              aria-hidden="true"
            >
              DC
            </div>
            <span>
              Por{' '}
              <strong className="text-[#0D2137] dark:!text-[#ffffff] font-bold">
                Dinheiro em Caixa
              </strong>
              , BPO Financeiro
            </span>
            <span className="text-[#B4C0CC] dark:text-white/25" aria-hidden="true">
              ·
            </span>
            <span>Integrado ao Datacar e à Conta Azul</span>
            <span className="text-[#B4C0CC] dark:text-white/25" aria-hidden="true">
              ·
            </span>
            <span className="inline-flex items-center gap-[6px]">
              <span
                className="w-[11px] h-[11px] border-[1.5px] border-[#5A6B7C] dark:border-[#5FD68B] rounded-full inline-block"
                aria-hidden="true"
              />
              Implantação em 7 dias
            </span>
          </div>
        </div>

        {/* CONTAINER DA IMAGEM HERO OFICIAL (/images/hero-dados.png) */}
        <section
          id="agente-financeiro"
          aria-label="Visão da Plataforma DCX LINK"
          className="max-w-[900px] mx-auto mt-10 md:mt-12 rounded-[16px] overflow-hidden bg-[#E6ECF2] dark:bg-[#0D2137] shadow-lg border border-slate-200/80 dark:border-white/10"
        >
          <img
            src="/images/hero-dados.png"
            alt="DCX LINK — Dados conectados entre Datacar e Conta Azul"
            className="w-full h-auto max-h-[534px] object-cover block"
            loading="eager"
          />
        </section>

        {/* SEÇÃO DE RECURSOS (#recursos) PRESERVADA COM PALETA DCX LINK */}
        <section id="recursos" className="max-w-[980px] mx-auto mt-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
            <div className="bg-white dark:bg-[#0D2137] border border-slate-200/90 dark:border-white/10 rounded-2xl p-4 flex flex-col items-center gap-2 text-center hover:border-[#0D2137]/40 dark:hover:border-[#5FD68B]/50 transition-all shadow-xs group">
              <div className="w-10 h-10 rounded-xl bg-[#0D2137] dark:bg-[#10294A] text-[#5FD68B] flex items-center justify-center transition-transform group-hover:scale-105">
                <ArrowDownToLine size={18} />
              </div>
              <div className="text-sm font-bold text-[#0D2137] dark:text-white">Contas a Pagar</div>
              <div className="text-xs text-[#5A6B7C] dark:text-[#A9B8C7]">Captura automática</div>
            </div>

            <div className="bg-white dark:bg-[#0D2137] border border-slate-200/90 dark:border-white/10 rounded-2xl p-4 flex flex-col items-center gap-2 text-center hover:border-[#0D2137]/40 dark:hover:border-[#5FD68B]/50 transition-all shadow-xs group">
              <div className="w-10 h-10 rounded-xl bg-[#0D2137] dark:bg-[#10294A] text-[#5FD68B] flex items-center justify-center transition-transform group-hover:scale-105">
                <CreditCard size={18} />
              </div>
              <div className="text-sm font-bold text-[#0D2137] dark:text-white">
                Gestão de Pagamentos
              </div>
              <div className="text-xs text-[#5A6B7C] dark:text-[#A9B8C7]">Aprova & executa</div>
            </div>

            <div className="bg-white dark:bg-[#0D2137] border border-slate-200/90 dark:border-white/10 rounded-2xl p-4 flex flex-col items-center gap-2 text-center hover:border-[#0D2137]/40 dark:hover:border-[#5FD68B]/50 transition-all shadow-xs group">
              <div className="w-10 h-10 rounded-xl bg-[#0D2137] dark:bg-[#10294A] text-[#5FD68B] flex items-center justify-center transition-transform group-hover:scale-105">
                <Receipt size={18} />
              </div>
              <div className="text-sm font-bold text-[#0D2137] dark:text-white">Emissão de NFe</div>
              <div className="text-xs text-[#5A6B7C] dark:text-[#A9B8C7]">Nota automática</div>
            </div>

            <div className="bg-white dark:bg-[#0D2137] border border-slate-200/90 dark:border-white/10 rounded-2xl p-4 flex flex-col items-center gap-2 text-center hover:border-[#0D2137]/40 dark:hover:border-[#5FD68B]/50 transition-all shadow-xs group">
              <div className="w-10 h-10 rounded-xl bg-[#0D2137] dark:bg-[#10294A] text-[#5FD68B] flex items-center justify-center transition-transform group-hover:scale-105">
                <RefreshCw size={18} />
              </div>
              <div className="text-sm font-bold text-[#0D2137] dark:text-white">
                Datacar ↔ Conta Azul
              </div>
              <div className="text-xs text-[#5A6B7C] dark:text-[#A9B8C7]">Sincronizado</div>
            </div>
          </div>
        </section>
      </main>

      {/* COMO FUNCIONA (#como) */}
      <section
        id="como"
        className="relative z-10 max-w-[1120px] mx-auto px-4 md:px-8 py-14 border-t border-slate-200/80 dark:border-white/10"
      >
        <div className="text-center mb-10">
          <div className="text-xs font-bold tracking-[0.16em] text-[#1E8449] dark:text-[#5FD68B] uppercase mb-2">
            Como Funciona
          </div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-[#0D2137] dark:text-white">
            Fluxo Inteligente. Zero Digitação.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="bg-white dark:bg-[#0D2137] border border-slate-200/90 dark:border-white/10 rounded-2xl p-6 hover:border-[#5FD68B] dark:hover:border-[#5FD68B]/60 shadow-xs transition-all">
            <div className="flex items-center justify-between mb-4">
              <div className="w-11 h-11 rounded-xl bg-[#0D2137] dark:bg-[#10294A] text-[#5FD68B] flex items-center justify-center">
                <ArrowDownToLine size={20} />
              </div>
              <span className="text-2xl font-extrabold text-slate-300 dark:text-white/20">01</span>
            </div>
            <h3 className="text-lg font-bold text-[#0D2137] dark:text-white mb-2">
              Busca & Captura
            </h3>
            <p className="text-sm text-[#5A6B7C] dark:text-[#A9B8C7] leading-relaxed">
              O DCX LINK acessa o Datacar e extrai automaticamente as contas a pagar, contas a
              receber e vendas do período com total precisão.
            </p>
          </div>

          <div className="bg-white dark:bg-[#0D2137] border border-slate-200/90 dark:border-white/10 rounded-2xl p-6 hover:border-[#5FD68B] dark:hover:border-[#5FD68B]/60 shadow-xs transition-all">
            <div className="flex items-center justify-between mb-4">
              <div className="w-11 h-11 rounded-xl bg-[#0D2137] dark:bg-[#10294A] text-[#5FD68B] flex items-center justify-center">
                <CreditCard size={20} />
              </div>
              <span className="text-2xl font-extrabold text-slate-300 dark:text-white/20">02</span>
            </div>
            <h3 className="text-lg font-bold text-[#0D2137] dark:text-white mb-2">
              Gestão de Pagamentos
            </h3>
            <p className="text-sm text-[#5A6B7C] dark:text-[#A9B8C7] leading-relaxed">
              Organiza boletos, DDAs e agendamentos por loja e conta bancária. Permite aprovar e
              executar pagamentos sem retrabalho manual.
            </p>
          </div>

          <div className="bg-white dark:bg-[#0D2137] border border-slate-200/90 dark:border-white/10 rounded-2xl p-6 hover:border-[#5FD68B] dark:hover:border-[#5FD68B]/60 shadow-xs transition-all">
            <div className="flex items-center justify-between mb-4">
              <div className="w-11 h-11 rounded-xl bg-[#0D2137] dark:bg-[#10294A] text-[#5FD68B] flex items-center justify-center">
                <Receipt size={20} />
              </div>
              <span className="text-2xl font-extrabold text-slate-300 dark:text-white/20">03</span>
            </div>
            <h3 className="text-lg font-bold text-[#0D2137] dark:text-white mb-2">
              NFe & Conta Azul
            </h3>
            <p className="text-sm text-[#5A6B7C] dark:text-[#A9B8C7] leading-relaxed">
              Sincroniza os lançamentos aprovados com o Conta Azul e habilita a emissão automática
              de Notas Fiscais com um único clique.
            </p>
          </div>
        </div>
      </section>

      {/* INTEGRAÇÕES (#integracoes) */}
      <section
        id="integracoes"
        className="relative z-10 max-w-[1120px] mx-auto px-4 md:px-8 py-14 border-t border-slate-200/80 dark:border-white/10"
      >
        <div className="bg-[#0D2137] border border-white/10 rounded-3xl p-6 md:p-10 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl">
          <div className="max-w-xl">
            <div className="text-xs font-bold tracking-[0.16em] text-[#5FD68B] uppercase mb-2">
              Integrações Conectadas · DCX LINK
            </div>
            <h2 className="dcx-on-dark-heading text-xl md:text-2xl font-bold !text-[#ffffff] mb-3">
              Datacar e Conta Azul em Perfeita Sincronia
            </h2>
            <p className="text-sm text-[#A9B8C7] leading-relaxed mb-5">
              Integração nativa de alta velocidade conectando o seu ERP Datacar ao Conta Azul para
              automação financeira completa de BPO — o elo entre seus sistemas.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <div className="dcx-on-dark inline-flex items-center gap-2 bg-white/[0.06] border border-white/15 px-3.5 py-1.5 rounded-full text-xs !text-[#ffffff]">
                <span className="w-2 h-2 rounded-full bg-[#5FD68B]" />
                <span className="dcx-on-dark !text-[#ffffff]">
                  Conexões multi-empresas e multi-bancos ativas
                </span>
              </div>
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0D2137] bg-[#5FD68B] hover:bg-[#7FE3A4] px-3.5 py-1.5 rounded-full transition-colors"
              >
                <LogIn size={13} />
                Acessar painel
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-4 bg-[#10294A] border border-white/15 p-5 rounded-2xl shadow-lg">
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center text-amber-300 mb-1.5">
                <Car size={26} />
              </div>
              <div className="dcx-on-dark text-xs font-bold !text-[#ffffff]">Datacar</div>
            </div>

            <div className="text-[#5FD68B] p-2.5 bg-[#5FD68B]/15 rounded-xl border border-[#5FD68B]/30">
              <ArrowLeftRight size={18} />
            </div>

            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-[#5FD68B]/15 border border-[#5FD68B]/30 flex items-center justify-center text-[#5FD68B] mb-1.5">
                <Building2 size={26} />
              </div>
              <div className="dcx-on-dark text-xs font-bold !text-[#ffffff]">Conta Azul</div>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative z-10 max-w-[1120px] mx-auto px-4 md:px-8 py-12 border-t border-slate-200/80 dark:border-white/10 text-center md:text-left">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-[#5A6B7C] dark:text-[#A9B8C7]">
          <div className="flex items-center gap-3">
            <div className="bg-[#0D2137] px-2.5 py-1.5 rounded-lg flex items-center gap-2">
              <DcxLinkMark size={20} />
              <span className="dcx-on-dark font-semibold tracking-[0.24em] !text-[#ffffff] text-xs">
                DCX LINK
              </span>
            </div>
            <span className="font-semibold text-[#0D2137] dark:text-white">
              O elo entre seus sistemas
            </span>
          </div>
          <div>BPO Financeiro · Automação Inteligente · Gestão Eficiente</div>
          <div>© 2026 DCX LINK · Dinheiro em Caixa. Todos os direitos reservados.</div>
        </div>
      </footer>
    </div>
  )
}


