'use client'

import Link from 'next/link'
import { Plus_Jakarta_Sans, IBM_Plex_Mono } from 'next/font/google'
import './homepage.css'

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-plus-jakarta',
  display: 'swap',
})

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
})

export default function HomePageClient() {
  return (
    <div className={`dcx-landing-wrapper ${plusJakarta.variable} ${ibmPlexMono.variable}`}>
      <main className="tela">
        <div className="fundo" aria-hidden="true"></div>

        <section className="visual">
          <div className="hud" aria-hidden="true">
            <svg viewBox="0 0 1000 1000" preserveAspectRatio="none">
              <circle
                cx="500"
                cy="640"
                r="60"
                fill="none"
                stroke="rgba(255,255,255,.55)"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx="500"
                cy="640"
                r="110"
                fill="none"
                stroke="rgba(143,176,255,.45)"
                strokeWidth="1"
                strokeDasharray="3 7"
                vectorEffect="non-scaling-stroke"
              />
              <circle cx="500" cy="640" r="6" fill="#fff" />
              <path
                id="l1"
                d="M500 640 L260 440"
                stroke="rgba(255,255,255,.5)"
                fill="none"
                vectorEffect="non-scaling-stroke"
              />
              <path
                id="l2"
                d="M500 640 L800 400"
                stroke="rgba(255,255,255,.5)"
                fill="none"
                vectorEffect="non-scaling-stroke"
              />
              <path
                id="l3"
                d="M500 640 L830 760"
                stroke="rgba(255,255,255,.5)"
                fill="none"
                vectorEffect="non-scaling-stroke"
              />
              <circle r="4" fill="#8FB0FF">
                <animateMotion dur="2.8s" repeatCount="indefinite" path="M500 640 L260 440" />
              </circle>
              <circle r="4" fill="#8FB0FF">
                <animateMotion dur="3.2s" begin=".6s" repeatCount="indefinite" path="M800 400 L500 640" />
              </circle>
              <circle r="4" fill="#8FB0FF">
                <animateMotion dur="3s" begin="1.2s" repeatCount="indefinite" path="M500 640 L830 760" />
              </circle>
            </svg>
            <div className="no" style={{ left: '26%', top: '44%' }}>
              <span className="ic">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 8h15M15 5l3 3-3 3M21 16H6M9 13l-3 3 3 3" />
                </svg>
              </span>
              <span className="no-texto">Gestão de Pagamentos</span>
            </div>
            <div className="no" style={{ left: '80%', top: '40%' }}>
              <span className="ic">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h4" />
                </svg>
              </span>
              <span className="no-texto">Contas a Pagar</span>
            </div>
            <div className="no" style={{ left: '83%', top: '76%' }}>
              <span className="ic">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 20h16M7 16v-4M12 16V9M17 16V6M5 9l5-4 4 3 5-4" />
                </svg>
              </span>
              <span className="no-texto">Vendas</span>
            </div>
          </div>

          <div className="chamada">
            <span className="rotulo">PLATAFORMA DE INTEGRAÇÃO FINANCEIRA</span>
            <h1>Sua operação financeira, conectada e inteligente.</h1>
          </div>
        </section>

        <aside className="painel">
          <div className="marca">
            <img src="/assets/logo-dinheiro-em-caixa.png" alt="Dinheiro em Caixa" />
            <div className="produto">
              <span className="elo" aria-hidden="true">
                <i />
                <i />
              </span>
              <div>
                <strong>DCX LINK</strong>
                <span>O elo entre seus sistemas</span>
              </div>
            </div>
          </div>

          <div className="acesso">
            <h2>Bem-vindo ao DCX LINK</h2>
            <p>Acesse a plataforma que integra as rotinas financeiras e comerciais da sua empresa.</p>
            <Link className="btn-entrar" href="/login">
              <span>Entrar no sistema</span>
              <span className="seta">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </span>
            </Link>
            <div className="seguro">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5B6880" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="11" width="14" height="10" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
              Acesso seguro para clientes Dinheiro em Caixa
            </div>
          </div>

          <div className="modulos">
            <span className="titulo">MÓDULOS DISPONÍVEIS</span>
            <div className="grade">
              <div className="modulo">
                <div className="ic">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1E4FD8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 8h15M15 5l3 3-3 3M21 16H6M9 13l-3 3 3 3" />
                  </svg>
                </div>
                <span className="modulo-texto">Gestão de Pagamentos</span>
              </div>
              <div className="modulo">
                <div className="ic">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1E4FD8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h4" />
                  </svg>
                </div>
                <span className="modulo-texto">Contas a Pagar</span>
              </div>
              <div className="modulo">
                <div className="ic">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1E4FD8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 20h16M7 16v-4M12 16V9M17 16V6M5 9l5-4 4 3 5-4" />
                  </svg>
                </div>
                <span className="modulo-texto">Vendas</span>
              </div>
            </div>
            <div className="rodape">
              <span>© 2026 Dinheiro em Caixa</span>
              <span>Terceirização Financeira</span>
            </div>
          </div>
        </aside>
      </main>
    </div>
  )
}
