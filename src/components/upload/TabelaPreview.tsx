'use client'

import { formatCurrency, formatDate } from '@/lib/utils'
import type { ContaPagarPreview } from '@/types'
import { CheckCircle, AlertCircle, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  dados: ContaPagarPreview[]
  selecionados: Set<number>
  onToggle: (idx: number) => void
  onToggleTodos: () => void
  onRemover: (idx: number) => void
}

export default function TabelaPreview({
  dados, selecionados, onToggle, onToggleTodos, onRemover
}: Props) {
  const todosSelecionados = selecionados.size === dados.length && dados.length > 0
  const algunsSelecionados = selecionados.size > 0 && selecionados.size < dados.length

  return (
    <div className="bg-dark-800 border border-dark-700 rounded-xl overflow-hidden">
      {/* Header da tabela */}
      <div className="px-4 py-3 border-b border-dark-700 flex items-center justify-between">
        <p className="text-sm text-dark-400">
          <span className="text-white font-semibold">{selecionados.size}</span> de{' '}
          <span className="text-white font-semibold">{dados.length}</span> registros selecionados
        </p>
        <div className="flex items-center gap-3">
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
              <th>NF / DOC</th>
              <th>Fornecedor</th>
              <th>Emissão</th>
              <th>Vencimento</th>
              <th className="text-right">Valor</th>
              <th className="text-center">Status</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {dados.map((item, idx) => (
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
                    onChange={() => onToggle(idx)}
                    disabled={!item.valido}
                    className="w-4 h-4 rounded border-dark-500 bg-dark-700 checked:bg-brand-600 disabled:opacity-30 cursor-pointer"
                  />
                </td>
                <td>
                  {/* NF extraído da descrição e DOC separado */}
                  <div className="flex flex-col gap-0.5">
                    <span className="text-white font-medium text-xs">
                      {item.descricao
                        ? item.descricao.split(' | DOC:')[0].replace('NF: ', '')
                        : '-'}
                    </span>
                    {item.doc && (
                      <span className="text-dark-400 text-xs">{item.doc}</span>
                    )}
                  </div>
                </td>
                <td>
                  <span className="text-white font-medium">{item.fornecedor}</span>
                </td>
                <td>
                  <span className="text-dark-300 text-xs">
                    {item.emissao ? formatDate(item.emissao) : (
                      <span className="text-dark-600">-</span>
                    )}
                  </span>
                </td>
                <td>
                  <span className="text-dark-300">
                    {item.vencimento ? formatDate(item.vencimento) : (
                      <span className="text-red-400 text-xs">Não identificado</span>
                    )}
                  </span>
                </td>
                <td className="text-right">
                  <span className="text-green-400 font-semibold tabular-nums">
                    {formatCurrency(item.valor)}
                  </span>
                </td>
                <td className="text-center">
                  {item.valido ? (
                    <span className="inline-flex items-center gap-1 text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">
                      <CheckCircle size={10} /> OK
                    </span>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1 text-xs text-red-400 bg-red-400/10 px-2 py-0.5 rounded-full cursor-help"
                      title={item.erros?.join(', ')}
                    >
                      <AlertCircle size={10} /> Erro
                    </span>
                  )}
                </td>
                <td>
                  <button
                    onClick={() => onRemover(idx)}
                    className="text-dark-600 hover:text-red-400 transition-colors p-1"
                    title="Remover linha"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
