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
  Cpu
} from 'lucide-react'
import SelectorEmpresa from '@/components/layout/SelectorEmpresa'
import './dashboard.css'

// Módulos de acesso rápido (mesmos destinos e textos da versão anterior)
const MODULOS = [
  {
    href: '/gestao-pagamentos',
    grupo: 'Financeiro',
    tom: 'fin',
    destaque: true,
    icon: Layers,
    titulo: 'Gestão Pagamentos',
    texto: 'Controle de grupos, agendamentos e fluxo financeiro.'
  },
  {
    href: '/contas-pagar',
    grupo: 'Financeiro',
    tom: 'fin',
    icon: ArrowDownToLine,
    titulo: 'Contas a Pagar',
    texto: 'Importação, conferência e envio para Conta Azul.'
  },
  {
    href: '/auditoria-conciliacoes-ca',
    grupo: 'Financeiro',
    tom: 'fin',
    icon: ShieldCheck,
    titulo: 'Auditoria Inteligente',
    texto: 'Conciliações, divergências e análises automáticas.'
  },
  {
    href: '/vendas',
    grupo: 'Vendas',
    tom: 'ven',
    icon: ShoppingBag,
    titulo: 'Vendas Produtos',
    texto: 'Sincronização Datacar, importação e emissão de NF-e.'
  },
  {
    href: '/vendas-servicos',
    grupo: 'Vendas',
    tom: 'ven',
    icon: FileText,
    titulo: 'Vendas Serviços',
    emBreve: true,
    texto: 'Gestão de serviços, importação e emissão de NF-e.'
  }
]

// Serviços do ecossistema (mesmos textos e status da versão anterior)
const ECOSSISTEMA = [
  { nome: 'Datacar DMS', texto: 'Extração contábil, balcão e vendas de concessionária', status: 'Integrado' },
  { nome: 'DCX LINK', texto: 'Motor inteligente de conferência, de-para e regras', status: 'Ativo', central: true },
  { nome: 'Conta Azul', texto: 'ERP financeiro, faturamento fiscal e conciliação', status: 'Conectado' },
  { nome: 'Supabase Cloud', texto: 'Banco relacional, alta disponibilidade e governança', status: 'Operacional' }
]

// Componentes do status do sistema (mesmos textos da versão anterior)
const STATUS = [
  { icon: Database, nome: 'Banco de Dados', texto: 'Supabase' },
  { icon: Cloud, nome: 'Integrações', texto: 'Conta Azul / Datacar' },
  { icon: Link2, nome: 'APIs', texto: 'Conectividade ativa' },
  { icon: Cpu, nome: 'Processamento', texto: 'Sistemas operacionais' }
]

export default function DashboardPage() {
  return (
    <div className="dcx-home animate-fade-in">
      {/* Faixa principal: boas-vindas sobre a imagem + seletor de empresa */}
      <section className="dcx-hero">
        <div className="dcx-hero-top">
          <SelectorEmpresa />
        </div>

        <span className="dcx-chip">
          <i aria-hidden="true" />
          Sistema ativo
        </span>

        <h1>Bem-vindo ao DCX LINK</h1>
        <p className="dcx-lead">Plataforma de automação contábil, financeira e fiscal.</p>
        <p className="dcx-txt">
          Integre seus sistemas, automatize processos e tenha total controle das operações financeiras, fiscais e contábeis da sua empresa.
        </p>
      </section>

      <div className="dcx-wrap">
        {/* Acesso Rápido aos Módulos */}
        <h2 className="dcx-sr-only">Acesso Rápido aos Módulos</h2>
        <div className="dcx-mods">
          {MODULOS.map((m) => {
            const Icon = m.icon
            return (
              <Link
                key={m.href}
                href={m.href}
                className={`dcx-card dcx-${m.tom}${m.destaque ? ' dcx-first' : ''}`}
              >
                <span className="dcx-group">{m.grupo}</span>
                <span className="dcx-ci">
                  <Icon size={26} strokeWidth={1.8} />
                </span>
                <h3>
                  {m.titulo}
                  {m.emBreve && <em className="dcx-soon">EM BREVE</em>}
                </h3>
                <p>{m.texto}</p>
                <span className="dcx-go">
                  <span>
                    <ArrowRight size={16} strokeWidth={2.2} />
                  </span>
                </span>
              </Link>
            )
          })}
        </div>

        {/* Ecossistema DCX LINK + Status do Sistema */}
        <div className="dcx-two">
          <section className="dcx-pan">
            <h2>Ecossistema DCX LINK</h2>
            <p className="dcx-pan-sub">
              Todos os serviços operacionais e integrações monitorados pela plataforma.
            </p>
            <div className="dcx-tl">
              {ECOSSISTEMA.map((s) => (
                <div key={s.nome} className={`dcx-tn${s.central ? ' dcx-core' : ''}`}>
                  <i aria-hidden="true" />
                  <b>{s.nome}</b>
                  <small>{s.texto}</small>
                  <em>{s.status}</em>
                </div>
              ))}
            </div>
          </section>

          <section className="dcx-pan">
            <div className="dcx-pan-head">
              <h2>Status do Sistema</h2>
              <span className="dcx-details">Ver detalhes</span>
            </div>
            <p className="dcx-pan-sub">
              Monitoramento contínuo dos serviços de backend, banco de dados e APIs externas.
            </p>
            <div className="dcx-st">
              {STATUS.map((s) => {
                const Icon = s.icon
                return (
                  <div key={s.nome} className="dcx-si">
                    <span className="dcx-sic">
                      <Icon size={19} strokeWidth={1.9} />
                    </span>
                    <div>
                      <b>{s.nome}</b>
                      <small>{s.texto}</small>
                      <em>Online</em>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
