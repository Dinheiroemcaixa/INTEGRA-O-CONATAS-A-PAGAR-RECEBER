"use client"

import { useState, useEffect, useMemo } from 'react'
import {
  Search, Calendar, RefreshCw, ChevronDown, ChevronLeft, ChevronRight,
  ArrowDownRight, ArrowUpRight, TrendingUp, TrendingDown, Clock, Wallet
} from 'lucide-react'
import { obterDataHojeBrasilia } from '@/components/agendamento/ModalAgendamento'
import { Empresa } from '@/types'
import { cn } from '@/lib/utils'

const PALETA_CORES_LOJA = ['#1d74f2', '#087f50', '#7c3aed', '#b45309', '#0369a1', '#be123c'] as const

const OPCOES_PERIODO: { key: string; label: string }[] = [
  { key: 'hoje', label: 'Hoje' },
  { key: 'semana', label: 'Esta semana' },
  { key: 'mes', label: 'Este mês' },
  { key: 'ano', label: 'Este ano' },
  { key: '30dias', label: 'Últimos 30 dias' },
  { key: '12meses', label: 'Últimos 12 meses' },
  { key: 'tudo', label: 'Todo o período' },
  { key: 'personalizado', label: 'Período personalizado' },
]

const fmtBRL = (valor: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(valor) || 0)

function roundMoeda(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100
}

function chaveUnicaPagamento(p: any, fallbackIdx: number): string {
  const prefixo = p?.origem === 'DDA' ? 'dda' : 'agend'
  if (p?.id !== undefined && p?.id !== null && String(p.id) !== '') {
    return `${prefixo}::${String(p.id)}`
  }
  return `${prefixo}::idx-${fallbackIdx}`
}

export function obterCorAvatarLoja(index: number): string {
  const idx = ((Math.trunc(index) % PALETA_CORES_LOJA.length) + PALETA_CORES_LOJA.length) % PALETA_CORES_LOJA.length
  return PALETA_CORES_LOJA[idx]
}

export function filtrarLancamentoPorPeriodo(
  item: { data_pagamento?: string | null; data_vencimento?: string | null },
  dataInicio: string,
  dataFim: string
): boolean {
  const dtPgto = item?.data_pagamento ? String(item.data_pagamento).trim() : ''
  if (dtPgto) {
    return dtPgto >= dataInicio && dtPgto <= dataFim
  }
  const dtVenc = item?.data_vencimento ? String(item.data_vencimento).trim() : ''
  return Boolean(dtVenc && dtVenc >= dataInicio && dtVenc <= dataFim)
}

export function identificarTransferenciasInternasPareadas(
  pagamentos: any[],
  idsLojasConsideradas: Set<string>
): Set<string> {
  const saidasPorTransf = new Set<string>()
  const entradasPorTransf = new Set<string>()

  for (const p of pagamentos || []) {
    if (!p?.transferencia_id || !p?.empresa_id || !idsLojasConsideradas.has(p.empresa_id)) continue
    const tid = String(p.transferencia_id)
    if (p.origem === 'Transferência') {
      saidasPorTransf.add(tid)
    } else if (p.origem === 'Transferência Recebida') {
      entradasPorTransf.add(tid)
    }
  }

  const pareadas = new Set<string>()
  saidasPorTransf.forEach(tid => {
    if (entradasPorTransf.has(tid)) {
      pareadas.add(tid)
    }
  })
  return pareadas
}

export interface IndicadoresConsolidados {
  saldoCaixaConsolidado: number
  idsTransferenciaInterna: Set<string>
  totalDespesas: number
  totalEntradas: number
  totalTransferenciasInternas: number
  saldoFinalEstimado: number
}

export function calcularIndicadoresConsolidados(
  lojasConsideradas: Empresa[],
  pagamentosConsiderados: any[]
): IndicadoresConsolidados {
  const lojasUnicas = new Map<string, Empresa>()
  for (const l of lojasConsideradas || []) {
    if (l?.id && !lojasUnicas.has(l.id)) {
      lojasUnicas.set(l.id, l)
    }
  }
  const idsLojas = new Set(lojasUnicas.keys())

  const saldoCaixaConsolidado = roundMoeda(
    Array.from(lojasUnicas.values()).reduce((acc, l) => acc + Number(l.saldo_caixa || 0), 0)
  )

  const vistos = new Set<string>()
  const pagamentosEscopo: any[] = []
  ;(pagamentosConsiderados || []).forEach((p, idx) => {
    if (!p?.empresa_id || !idsLojas.has(p.empresa_id)) return
    const chave = chaveUnicaPagamento(p, idx)
    if (vistos.has(chave)) return
    vistos.add(chave)
    pagamentosEscopo.push(p)
  })

  const idsTransferenciaInterna = identificarTransferenciasInternasPareadas(pagamentosEscopo, idsLojas)

  let somaDespesas = 0
  let somaEntradas = 0
  let somaTransfInternas = 0
  const transfInternaContada = new Set<string>()

  for (const p of pagamentosEscopo) {
    const valor = Number(p.valor || 0)
    const tid = p.transferencia_id ? String(p.transferencia_id) : ''
    const ehInterna = Boolean(tid && idsTransferenciaInterna.has(tid))

    if (ehInterna) {
      if (p.origem === 'Transferência' && !transfInternaContada.has(tid)) {
        transfInternaContada.add(tid)
        somaTransfInternas += valor
      }
      continue
    }

    if (p.origem === 'Transferência Recebida') {
      somaEntradas += valor
    } else {
      somaDespesas += valor
    }
  }

  const totalDespesas = roundMoeda(somaDespesas)
  const totalEntradas = roundMoeda(somaEntradas)
  const totalTransferenciasInternas = roundMoeda(somaTransfInternas)
  const saldoFinalEstimado = roundMoeda(saldoCaixaConsolidado + totalEntradas - totalDespesas)

  return {
    saldoCaixaConsolidado,
    idsTransferenciaInterna,
    totalDespesas,
    totalEntradas,
    totalTransferenciasInternas,
    saldoFinalEstimado,
  }
}

export interface PeriodoGlobalGrupo {
  inicio: string
  fim: string
  periodoAtivo: string
}

export interface GrupoConsolidadoCardProps {
  grupoId: string
  nomeGrupo: string
  lojas: Empresa[]
  pagamentosUnificados: any[]
  periodoGlobal: PeriodoGlobalGrupo
  onAplicarPeriodoGlobal: (periodo: PeriodoGlobalGrupo) => void
  onRefreshGlobal: () => void
  onAbrirLoja?: (lojaId: string) => void
}

export default function GrupoConsolidadoCard({
  nomeGrupo,
  lojas,
  pagamentosUnificados,
  periodoGlobal,
  onAplicarPeriodoGlobal,
  onRefreshGlobal,
}: GrupoConsolidadoCardProps) {
  const [menuPeriodoAberto, setMenuPeriodoAberto] = useState(false)
  const [dataInicioCustom, setDataInicioCustom] = useState(periodoGlobal.inicio)
  const [dataFimCustom, setDataFimCustom] = useState(periodoGlobal.fim)
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<Date>(() => new Date())

  useEffect(() => {
    setDataInicioCustom(periodoGlobal.inicio)
    setDataFimCustom(periodoGlobal.fim)
  }, [periodoGlobal.inicio, periodoGlobal.fim])

  useEffect(() => {
    setUltimaAtualizacao(new Date())
  }, [pagamentosUnificados])

  const { inicio: dataInicio, fim: dataFim, periodoAtivo } = periodoGlobal

  function fmtISO(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  function parseDataLocal(s: string) {
    const [y, m, d] = s.split('-').map(Number)
    return new Date(y, m - 1, d)
  }

  function aplicarPeriodo(key: string) {
    if (key === 'personalizado') {
      setMenuPeriodoAberto(false)
      onAplicarPeriodoGlobal({
        inicio: dataInicio,
        fim: dataFim,
        periodoAtivo: 'personalizado',
      })
      return
    }

    const baseHoje = obterDataHojeBrasilia()
    const agora = parseDataLocal(baseHoje)
    let novoInicio = dataInicio
    let novoFim = dataFim

    if (key === 'hoje') {
      novoInicio = novoFim = baseHoje
    } else if (key === 'semana') {
      const diaSemana = agora.getDay()
      const diff = diaSemana === 0 ? -6 : 1 - diaSemana
      const seg = new Date(agora)
      seg.setDate(agora.getDate() + diff)
      const dom = new Date(seg)
      dom.setDate(seg.getDate() + 6)
      novoInicio = fmtISO(seg)
      novoFim = fmtISO(dom)
    } else if (key === 'mes') {
      novoInicio = fmtISO(new Date(agora.getFullYear(), agora.getMonth(), 1))
      novoFim = fmtISO(new Date(agora.getFullYear(), agora.getMonth() + 1, 0))
    } else if (key === 'ano') {
      novoInicio = fmtISO(new Date(agora.getFullYear(), 0, 1))
      novoFim = fmtISO(new Date(agora.getFullYear(), 11, 31))
    } else if (key === '30dias') {
      const passado = new Date(agora)
      passado.setDate(agora.getDate() - 30)
      novoInicio = fmtISO(passado)
      novoFim = baseHoje
    } else if (key === '12meses') {
      const passado = new Date(agora)
      passado.setFullYear(agora.getFullYear() - 1)
      novoInicio = fmtISO(passado)
      novoFim = baseHoje
    } else if (key === 'tudo') {
      novoInicio = '2000-01-01'
      novoFim = '2099-12-31'
    }

    setMenuPeriodoAberto(false)
    onAplicarPeriodoGlobal({
      inicio: novoInicio,
      fim: novoFim,
      periodoAtivo: key,
    })
  }

  function labelPeriodoAtivo() {
    return dataInicio === dataFim
      ? dataInicio.split('-').reverse().join('/')
      : `${dataInicio.split('-').reverse().join('/')} até ${dataFim.split('-').reverse().join('/')}`
  }

  function navegarPeriodoAnterior() {
    if (periodoAtivo === 'hoje' || dataInicio === dataFim) {
      const d = parseDataLocal(dataInicio)
      d.setDate(d.getDate() - 1)
      const iso = fmtISO(d)
      onAplicarPeriodoGlobal({ inicio: iso, fim: iso, periodoAtivo: 'hoje' })
    } else if (periodoAtivo === 'semana') {
      const dIni = parseDataLocal(dataInicio)
      const dFim = parseDataLocal(dataFim)
      dIni.setDate(dIni.getDate() - 7)
      dFim.setDate(dFim.getDate() - 7)
      onAplicarPeriodoGlobal({ inicio: fmtISO(dIni), fim: fmtISO(dFim), periodoAtivo })
    } else if (periodoAtivo === 'mes') {
      const dIni = parseDataLocal(dataInicio)
      dIni.setMonth(dIni.getMonth() - 1)
      dIni.setDate(1)
      const dFim = new Date(dIni.getFullYear(), dIni.getMonth() + 1, 0)
      onAplicarPeriodoGlobal({ inicio: fmtISO(dIni), fim: fmtISO(dFim), periodoAtivo })
    } else if (periodoAtivo === 'ano') {
      const dIni = parseDataLocal(dataInicio)
      dIni.setFullYear(dIni.getFullYear() - 1)
      dIni.setMonth(0)
      dIni.setDate(1)
      const dFim = new Date(dIni.getFullYear(), 11, 31)
      onAplicarPeriodoGlobal({ inicio: fmtISO(dIni), fim: fmtISO(dFim), periodoAtivo })
    } else if (periodoAtivo === '30dias') {
      const dIni = parseDataLocal(dataInicio)
      const dFim = parseDataLocal(dataFim)
      dIni.setDate(dIni.getDate() - 30)
      dFim.setDate(dFim.getDate() - 30)
      onAplicarPeriodoGlobal({ inicio: fmtISO(dIni), fim: fmtISO(dFim), periodoAtivo })
    } else {
      const dIni = parseDataLocal(dataInicio)
      const dFim = parseDataLocal(dataFim)
      dIni.setDate(dIni.getDate() - 1)
      dFim.setDate(dFim.getDate() - 1)
      onAplicarPeriodoGlobal({ inicio: fmtISO(dIni), fim: fmtISO(dFim), periodoAtivo })
    }
  }

  function navegarPeriodoProximo() {
    if (periodoAtivo === 'hoje' || dataInicio === dataFim) {
      const d = parseDataLocal(dataInicio)
      d.setDate(d.getDate() + 1)
      const iso = fmtISO(d)
      onAplicarPeriodoGlobal({ inicio: iso, fim: iso, periodoAtivo: 'hoje' })
    } else if (periodoAtivo === 'semana') {
      const dIni = parseDataLocal(dataInicio)
      const dFim = parseDataLocal(dataFim)
      dIni.setDate(dIni.getDate() + 7)
      dFim.setDate(dFim.getDate() + 7)
      onAplicarPeriodoGlobal({ inicio: fmtISO(dIni), fim: fmtISO(dFim), periodoAtivo })
    } else if (periodoAtivo === 'mes') {
      const dIni = parseDataLocal(dataInicio)
      dIni.setMonth(dIni.getMonth() + 1)
      dIni.setDate(1)
      const dFim = new Date(dIni.getFullYear(), dIni.getMonth() + 1, 0)
      onAplicarPeriodoGlobal({ inicio: fmtISO(dIni), fim: fmtISO(dFim), periodoAtivo })
    } else if (periodoAtivo === 'ano') {
      const dIni = parseDataLocal(dataInicio)
      dIni.setFullYear(dIni.getFullYear() + 1)
      dIni.setMonth(0)
      dIni.setDate(1)
      const dFim = new Date(dIni.getFullYear(), 11, 31)
      onAplicarPeriodoGlobal({ inicio: fmtISO(dIni), fim: fmtISO(dFim), periodoAtivo })
    } else if (periodoAtivo === '30dias') {
      const dIni = parseDataLocal(dataInicio)
      const dFim = parseDataLocal(dataFim)
      dIni.setDate(dIni.getDate() + 30)
      dFim.setDate(dFim.getDate() + 30)
      onAplicarPeriodoGlobal({ inicio: fmtISO(dIni), fim: fmtISO(dFim), periodoAtivo })
    } else {
      const dIni = parseDataLocal(dataInicio)
      const dFim = parseDataLocal(dataFim)
      dIni.setDate(dIni.getDate() + 1)
      dFim.setDate(dFim.getDate() + 1)
      onAplicarPeriodoGlobal({ inicio: fmtISO(dIni), fim: fmtISO(dFim), periodoAtivo })
    }
  }

  const indicadores = useMemo(
    () => calcularIndicadoresConsolidados(lojas, pagamentosUnificados),
    [lojas, pagamentosUnificados]
  )

  const saldoNegativo = indicadores.saldoCaixaConsolidado < 0

  return (
    <section className="gp-card overflow-hidden">
      {/* a) Cabeçalho consolidado + Período global + Atualizar todas */}
      <div className="gp-head">
        <div className="gp-head-top">
          <div className="gp-id">
            <div
              className="gp-avatar"
              style={{ background: 'linear-gradient(145deg, #1d74f2 0%, #4f46e5 100%)' }}
              aria-hidden="true"
            >
              ∑
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="gp-loja-nome" title="Visão Consolidada — Todas as Lojas">
                  Visão Consolidada — Todas as Lojas
                </h2>
                <span className="gp-badge">
                  {lojas.length} {lojas.length === 1 ? 'loja empilhada' : 'lojas empilhadas'}
                </span>
              </div>
              <p className="gp-loja-sub">
                <span>{nomeGrupo}</span>
                <span className="gp-dot">•</span>
                <span>Todos os cartões das lojas do grupo exibidos em sequência</span>
              </p>
            </div>
          </div>

          <div className="gp-metrics">
            {/* 1. Saldo em caixa do grupo */}
            <div className="gp-saldo">
              <p className="gp-m-label"><Wallet size={13} /> Saldo em caixa do grupo</p>
              <div className="gp-saldo-row">
                <div className="gp-saldo-val">
                  <span
                    className={cn(
                      'font-extrabold text-[25px] leading-tight tabular-nums tracking-tight',
                      saldoNegativo ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'
                    )}
                  >
                    {fmtBRL(indicadores.saldoCaixaConsolidado)}
                  </span>
                </div>
                <span className={cn('gp-saldo-pill', saldoNegativo && 'is-neg')}>
                  {saldoNegativo ? 'Negativo' : 'Disponível'}
                </span>
              </div>
              <p className="gp-saldo-hint">Soma real das lojas (edite no cartão de cada loja abaixo)</p>
            </div>

            {/* 2. Período de consulta (sincroniza todas as lojas abaixo) */}
            <div className="gp-periodo">
              <p className="gp-m-label"><Calendar size={13} /> Período de consulta (todas as lojas)</p>
              <div className="gp-nav">
                <button
                  type="button"
                  onClick={navegarPeriodoAnterior}
                  title="Voltar período em todas as lojas"
                  aria-label="Voltar período em todas as lojas"
                  className="gp-nav-btn"
                >
                  <ChevronLeft size={16} />
                </button>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setMenuPeriodoAberto(!menuPeriodoAberto)}
                    className="gp-periodo-btn"
                    aria-expanded={menuPeriodoAberto}
                  >
                    <span><Calendar size={13} />{labelPeriodoAtivo()}</span>
                    <ChevronDown size={13} className={menuPeriodoAberto ? 'rotate-180 transition-transform' : 'transition-transform'} />
                  </button>

                  {menuPeriodoAberto && (
                    <div className="absolute top-full mt-2 left-0 w-52 bg-white dark:bg-[#0f1523] border border-slate-200 dark:border-white/[0.1] rounded-xl shadow-2xl shadow-black/30 z-50 overflow-hidden">
                      {OPCOES_PERIODO.map(op => (
                        <button
                          key={op.key}
                          type="button"
                          onClick={() => aplicarPeriodo(op.key)}
                          className={`w-full text-left px-4 py-2.5 text-sm font-semibold transition-colors cursor-pointer ${
                            periodoAtivo === op.key
                              ? 'bg-blue-600 text-white'
                              : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06]'
                          } ${op.key === 'personalizado' ? 'border-t border-slate-200 dark:border-white/[0.07]' : ''}`}
                        >
                          {op.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={navegarPeriodoProximo}
                  title="Avançar período em todas as lojas"
                  aria-label="Avançar período em todas as lojas"
                  className="gp-nav-btn"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              {periodoAtivo === 'personalizado' && (
                <div className="gp-custom animate-fade-in">
                  <input
                    type="date"
                    value={dataInicioCustom}
                    onChange={e => {
                      const novaDataInicio = e.target.value
                      setDataInicioCustom(novaDataInicio)
                      if (dataFimCustom < novaDataInicio) setDataFimCustom(novaDataInicio)
                    }}
                    aria-label="Data inicial do grupo"
                  />
                  <em>até</em>
                  <input
                    type="date"
                    value={dataFimCustom}
                    min={dataInicioCustom}
                    onChange={e => setDataFimCustom(e.target.value)}
                    aria-label="Data final do grupo"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      onAplicarPeriodoGlobal({
                        inicio: dataInicioCustom,
                        fim: dataFimCustom < dataInicioCustom ? dataInicioCustom : dataFimCustom,
                        periodoAtivo: 'personalizado',
                      })
                    }
                    className="gp-btn is-primary"
                    style={{ height: 32 }}
                  >
                    <Search size={12} /> Filtrar todas
                  </button>
                </div>
              )}
            </div>

            {/* 3. Atualizar todas */}
            <div className="gp-upd">
              <div>
                <p className="gp-m-label"><Clock size={13} /> Atualizar todas</p>
                <p className="gp-upd-val">{ultimaAtualizacao.toLocaleDateString('pt-BR')}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setUltimaAtualizacao(new Date())
                  onRefreshGlobal()
                }}
                className="gp-refresh"
                title="Recarregar lançamentos de todas as lojas do grupo"
                aria-label="Recarregar lançamentos de todas as lojas do grupo"
              >
                <RefreshCw size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Indicadores Gerais do Grupo */}
      <div className="gp-resumo">
        <div className="gp-res">
          <div>
            <p className="gp-res-label">Total de despesas</p>
            <p className="gp-res-val is-bad">{fmtBRL(indicadores.totalDespesas)}</p>
            <p className="gp-res-sub">
              {indicadores.totalTransferenciasInternas > 0
                ? `Exclui ${fmtBRL(indicadores.totalTransferenciasInternas)} de transf. internas`
                : 'Saídas programadas das lojas no período'}
            </p>
          </div>
          <span className="gp-res-ico is-bad"><ArrowDownRight size={20} /></span>
        </div>

        <div className="gp-res">
          <div>
            <p className="gp-res-label">Entradas (transferências)</p>
            <p className="gp-res-val is-ok">{fmtBRL(indicadores.totalEntradas)}</p>
            <p className="gp-res-sub">
              {indicadores.totalTransferenciasInternas > 0
                ? `Transf. internas neutras: ${fmtBRL(indicadores.totalTransferenciasInternas)}`
                : 'Aportes e transferências externas'}
            </p>
          </div>
          <span className="gp-res-ico is-ok"><ArrowUpRight size={20} /></span>
        </div>

        <div className={cn('gp-res is-final', indicadores.saldoFinalEstimado < 0 && 'is-neg')}>
          <div>
            <p className="gp-res-label">Saldo final estimado</p>
            <p className={cn('gp-res-val', indicadores.saldoFinalEstimado < 0 ? 'is-bad' : 'is-ok')}>
              {fmtBRL(indicadores.saldoFinalEstimado)}
            </p>
            <p className="gp-res-sub">Caixa consolidado + entradas − despesas</p>
          </div>
          <span className={cn('gp-res-ico', indicadores.saldoFinalEstimado < 0 ? 'is-bad' : 'is-ok')}>
            {indicadores.saldoFinalEstimado < 0 ? <TrendingDown size={20} /> : <TrendingUp size={20} />}
          </span>
        </div>
      </div>
    </section>
  )
}
