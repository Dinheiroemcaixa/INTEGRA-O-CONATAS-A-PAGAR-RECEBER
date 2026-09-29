'use client'

import React, { useState } from 'react'
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Clock,
  X,
  ChevronDown,
  ChevronUp
} from 'lucide-react'

export interface ProgressoLoteData {
  ativo: boolean
  concluido: boolean
  cancelado: boolean
  total: number
  processados: number
  sucessos: number
  erros: number
  itemAtual?: string
  detalheItemAtual?: string
  segundosDecorridos: number
  detalhesErros: string[]
  tituloModulo?: string
  unidadeItem?: string
}

interface PainelProgressoLoteProps {
  progresso: ProgressoLoteData | null
  onInterromper: () => void
  onFechar: () => void
  renderSticky?: boolean
  className?: string
}

export function formatTempoDecorrido(segundos: number): string {
  const mins = Math.floor(segundos / 60).toString().padStart(2, '0')
  const secs = (segundos % 60).toString().padStart(2, '0')
  return `${mins}:${secs}`
}

export default function PainelProgressoLote({
  progresso,
  onInterromper,
  onFechar,
  renderSticky = true,
  className = ''
}: PainelProgressoLoteProps) {
  const [mostrarErros, setMostrarErros] = useState(false)

  if (!progresso || !progresso.ativo) return null

  const total = Math.max(1, progresso.total || 1)
  const percentual = Math.min(100, Math.round((progresso.processados / total) * 100))
  const unidade = progresso.unidadeItem || 'contas'
  const restantes = Math.max(0, progresso.total - progresso.processados)

  return (
    <>
      {/* ─── Card Superior de Progresso (UX Fintech) ──────────── */}
      <div className={`bg-slate-900 border border-blue-500/40 rounded-2xl p-5 shadow-2xl space-y-4 animate-fade-in relative overflow-hidden ${className}`}>
        {/* Barra luminosa no topo */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400" />

        {/* Cabeçalho */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
              progresso.concluido
                ? progresso.erros > 0
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : progresso.cancelado
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
            }`}>
              {progresso.concluido ? (
                progresso.erros > 0 ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />
              ) : progresso.cancelado ? (
                <AlertCircle size={20} />
              ) : (
                <Loader2 size={20} className="animate-spin text-blue-400" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-white font-bold text-sm tracking-wide">
                  {progresso.concluido 
                    ? (progresso.erros > 0 ? 'Sincronização Finalizada com Avisos' : 'Sincronização Concluída!')
                    : progresso.cancelado
                    ? 'Sincronização Interrompida'
                    : 'Sincronizando com Conta Azul...'}
                </h4>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold">
                  {percentual}%
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {progresso.concluido
                  ? `${progresso.sucessos} ${unidade} sincronizadas com sucesso e ${progresso.erros} com falha.`
                  : progresso.cancelado
                  ? `Processamento interrompido. ${progresso.sucessos} ${unidade} foram enviadas antes da parada.`
                  : `Processando ${progresso.itemAtual || 'item'} • ${progresso.detalheItemAtual || 'Em andamento'}`}
              </p>
            </div>
          </div>

          {/* Timer e Botões de Controle */}
          <div className="flex items-center gap-2.5 self-end sm:self-center">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700 text-xs font-mono text-slate-300">
              <Clock size={13} className="text-blue-400" />
              <span>{formatTempoDecorrido(progresso.segundosDecorridos)}</span>
            </div>

            {!progresso.concluido && !progresso.cancelado ? (
              <button
                type="button"
                onClick={onInterromper}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold transition-all cursor-pointer"
                title={`Interromper envio das próximas ${unidade}`}
              >
                <X size={13} />
                <span>Interromper</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onFechar}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-all cursor-pointer border border-slate-700"
              >
                <span>Fechar</span>
              </button>
            )}
          </div>
        </div>

        {/* Barra de Progresso Visual */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Progresso: <strong className="text-white">{progresso.processados}</strong> de <strong className="text-white">{progresso.total}</strong> {unidade}</span>
            <span className="font-mono text-blue-400 font-bold">{percentual}%</span>
          </div>
          <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-700/80 shadow-inner">
            <div
              className="h-full rounded-full transition-all duration-300 ease-out bg-gradient-to-r from-blue-600 via-indigo-500 to-emerald-400 shadow-[0_0_12px_rgba(59,130,246,0.5)]"
              style={{ width: `${percentual}%` }}
            />
          </div>
        </div>

        {/* Badges de Resumo em Tempo Real */}
        <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-slate-800/80 text-xs">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
              <CheckCircle2 size={13} />
              {progresso.sucessos} com sucesso
            </span>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold border ${
              progresso.erros > 0
                ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}>
              <AlertCircle size={13} />
              {progresso.erros} com erro
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/60 text-slate-400 border border-slate-700 text-[11px]">
              ⏳ {restantes} restantes
            </span>
          </div>

          {progresso.detalhesErros.length > 0 && (
            <button
              type="button"
              onClick={() => setMostrarErros(!mostrarErros)}
              className="text-xs text-rose-400 hover:text-rose-300 underline font-semibold flex items-center gap-1 cursor-pointer"
            >
              {mostrarErros ? (
                <>
                  <span>Ocultar detalhes</span>
                  <ChevronUp size={13} />
                </>
              ) : (
                <>
                  <span>Ver {progresso.detalhesErros.length} detalhe(s) de erro</span>
                  <ChevronDown size={13} />
                </>
              )}
            </button>
          )}
        </div>

        {/* Detalhes de Erros (Accordion) */}
        {mostrarErros && progresso.detalhesErros.length > 0 && (
          <div className="p-3 bg-rose-950/40 border border-rose-500/30 rounded-xl space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar text-xs">
            <p className="text-rose-300 font-bold">Falhas registradas no envio:</p>
            <ul className="space-y-1 text-slate-300 font-mono text-[11px]">
              {progresso.detalhesErros.map((err, idx) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <span className="text-rose-400 font-bold">•</span>
                  <span>{err}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ─── Banner Sticky Inferior (Flutuante na rolagem) ──── */}
      {renderSticky && !progresso.concluido && !progresso.cancelado && (
        <div className="fixed bottom-5 right-5 left-5 md:left-72 md:right-8 z-50 bg-slate-900/95 backdrop-blur-md border border-blue-500/50 rounded-2xl p-4 shadow-2xl animate-fade-in text-white flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
              <Loader2 size={18} className="animate-spin text-blue-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs truncate">Sincronizando com Conta Azul...</span>
                <span className="font-mono text-xs text-blue-400 font-bold px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20">
                  {percentual}%
                </span>
              </div>
              <p className="text-[11px] text-slate-300 truncate mt-0.5">
                {progresso.itemAtual || 'Item'} <strong>{progresso.processados}</strong> de <strong>{progresso.total}</strong> • {progresso.detalheItemAtual || 'Processando lote'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="font-mono text-xs text-slate-300 bg-slate-800 px-2.5 py-1.5 rounded-xl border border-slate-700 flex items-center gap-1.5">
              <Clock size={12} className="text-blue-400" />
              {formatTempoDecorrido(progresso.segundosDecorridos)}
            </span>
            <button
              type="button"
              onClick={onInterromper}
              className="px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-bold transition-all cursor-pointer"
            >
              Parar
            </button>
          </div>
        </div>
      )}
    </>
  )
}
