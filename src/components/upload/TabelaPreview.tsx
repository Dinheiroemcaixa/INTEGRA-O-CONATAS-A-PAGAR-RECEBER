'use client'

import { formatCurrency, formatDate } from '@/lib/utils'
import type { ContaPagarPreview } from '@/types'
import { CheckCircle, AlertCircle, Trash2, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  dados: ContaPagarPreview[]
  selecionados: Set<number>
  onToggle: (idx: number) => void
  onToggleTodos: () => void
  onRemover: (idx: number) => void
}

function BadgeMatch({ confianca, score }: { confianca: string; score: number }) {
  if (confianca === 'exato') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded-full font-medium" title="Nome exato encontrado no ContaAzul">
        <CheckCircle size={9} /> exato
      </span>
    )
  }
  if (confianca === 'alto') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded-full font-medium" title={`Match automático — confiança ${score}%`}>
        ✓ {score}%
      </span>
    )
  }
  if (confianca === 'medio') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-yellow-400 bg-yellow-400/10 px-1.5 py-0.5 rounded-full font-medium" title={`Match incerto — verifique — confiança ${score}%`}>
        ~ {score}%
      </span>
    )
  }
  if (confianca === 'baixo') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-orange-400 bg-orange-400/10 px-1.5 py-0.5 rounded-full font-medium" title={`Match fraco — confiança ${score}%`}>
        ? {score}%
      </span>
    )
  }
  return null
}

export default function TabelaPreview({
  dados, selecionados, onToggle, onToggleTodos, onRemover
}: Props) {
  const todosSelecionados = selecionados.size === dados.length && dados.length > 0
  const algunsSelecionados = selecionados.size > 0 && selecionados.size < dados.length
  const temMatch = dados.some((d) => d.matchFornecedor)
  const corrigidos = dados.filter(
    (d) => d.matchFornecedor && (d.matchFornecedor.confianca === 'exato' || d.matchFornecedor.confianca === 'alto')
      && d.matchFornecedor.nomeOriginal !== d.matchFornecedor.nomeCorrigido
  ).length

  return (
    <div className="bg-dark-800 border border-dark-700 rounded-xl overflow-hidden">
      {/* Header da tabela */}
      <div className="px-4 py-3 border-b border-dark-700 flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-dark-400">
          <span className="text-white font-semibold">{selecionados.size}</span> de{' '}
          <span className="text-white font-semibold">{dados.length}</span> registros selecionados
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          {temMatch && corrigidos > 0 && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">
              <CheckCircle size={11} />
              {corrigidos} fornecedores corrigidos
            </span>
          )}
          <span className="flex items-center gap-1.5 text-xs text-green-400">
            <CheckCircle size={12} />
            {dados.filter((d) => d.valido).length} válidos
          </span>
          {dados.filter((d) => !d.valido).length > 0 && (
            <span className="flex items-center gap-1.5 text-xs text-red-400">
              <AlertCircle size={12} />
              {dados.filter((d) => !d.valido).length} com erro
            </span>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="table-bpo">
          <thead>
            <tr>
              <th className="w-10">
                <input
                  type="checkbox"
                  checked={todosSelecionados}
                  ref={(el) => { if (el) el.indeterminate = algunsSelecionados }}
                  onChange={onToggleTodos}
                  className="w-4 h-4 rounded border-dark-500 bg-dark-700 checked:bg-brand-600 cursor-pointer"
                />
              </th>
              <th>Fornecedor</th>
              <th className="text-right">Valor</th>
              <th>Vencimento</th>
              <th>Descrição</th>
              <th className="text-center">Status</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {dados.map((item, idx) => {
              const match = item.matchFornecedor
              const foiCorrigido = match && match.nomeOriginal !== match.nomeCorrigido
                && (match.confianca === 'exato' || match.confianca === 'alto')
              const temDuvida = match && (match.confianca === 'medio' || match.confianca === 'baixo')

              return (
                <tr
                  key={idx}
                  className={cn(
                    !item.valido && 'bg-red-500/5',
                    selecionados.has(idx) && item.valido && 'bg-brand-600/5'
                  )}
                >
                  <td>
                    <input
                      type="checkbox"
                      checked={selecionados.has(idx)}
                      onChange={