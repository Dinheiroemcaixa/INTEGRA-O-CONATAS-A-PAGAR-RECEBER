import { useState } from 'react'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { ContaPagarPreview } from '@/types'
import { CheckCircle, AlertCircle, Trash2, Edit2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import SelectorFornecedor from './SelectorFornecedor'

interface Props {
  dados: ContaPagarPreview[]
  selecionados: Set<number>
  onToggle: (idx: number) => void
  onToggleTodos: () => void
  onRemover: (idx: number) => void
  onUpdateFornecedor: (idx: number, novoNome: string) => void
}

function BadgeMatch({ confianca, score }: { confianca: string; score: number }) {
  if (confianca === 'exato' || score === 100) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded-full font-medium" title="Nome exato encontrado no ContaAzul">
        <CheckCircle size={9} /> exato
      </span>
    )
  }
  
  if (score >= 80) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-yellow-400 bg-yellow-400/10 px-1.5 py-0.5 rounded-full font-medium" title={`Match automático — confiança ${score}%`}>
        ✓ {score}%
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded-full font-medium" title={`Match fraco — verifique — confiança ${score}%`}>
      <AlertCircle size={9} /> {score}%
    </span>
  )
}


export default function TabelaPreview({
  dados, selecionados, onToggle, onToggleTodos, onRemover, onUpdateFornecedor
}: Props) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  
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
              const isEditing = editingIdx === idx

              return (
                <tr
                  key={idx}
                  className={cn(
                    !item.valido && 'bg-red-500/5',
                    selecionados.has(idx) && item.valido && 'bg-brand-600/5',
                    isEditing && 'bg-brand-900/10'
                  )}
                >
                  <td>
                    <input
                      type="checkbox"
                      checked={selecionados.has(idx)}
                      onChange={() => onToggle(idx)}
                      className="w-4 h-4 rounded border-dark-500 bg-dark-700 checked:bg-brand-600 cursor-pointer"
                    />
                  </td>
                  <td className="min-w-[250px]">
                    {isEditing ? (
                      <SelectorFornecedor 
                        valorInicial={item.fornecedor}
                        onCancel={() => setEditingIdx(null)}
                        onSelect={(nome) => {
                          onUpdateFornecedor(idx, nome)
                          setEditingIdx(null)
                        }}
                      />
                    ) : (
                      <div className="flex flex-col group relative">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            'font-medium transition-colors',
                            foiCorrigido ? 'text-emerald-400' : 'text-white',
                            !item.valido && 'text-red-400'
                          )}>
                            {item.fornecedor}
                          </span>
                          {match && <BadgeMatch confianca={match.confianca} score={match.score} />}
                          <button 
                            onClick={() => setEditingIdx(idx)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-dark-500 hover:text-brand-400 p-1"
                            title="Editar fornecedor"
                          >
                            <Edit2 size={12} />
                          </button>
                        </div>
                        {foiCorrigido && (
                          <span className="text-[10px] text-dark-500 flex items-center gap-1">
                            original: {match.nomeOriginal}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="text-right font-mono text-white">
                    {formatCurrency(item.valor)}
                  </td>
                  <td className="text-dark-300 text-sm">
                    {item.vencimento ? formatDate(item.vencimento) : '---'}
                  </td>
                  <td className="text-dark-400 text-xs max-w-[200px] truncate" title={item.descricao}>
                    {item.descricao || '---'}
                  </td>
                  <td className="text-center">
                    {item.valido ? (
                      <span className="text-emerald-400 text-[10px] font-bold uppercase tracking-wider">OK</span>
                    ) : (
                      <div className="flex flex-col items-center">
                        <span className="text-red-400 text-[10px] font-bold uppercase tracking-wider">Erro</span>
                        <p className="text-[9px] text-red-400/70 max-w-[100px] leading-tight">
                          {item.erros?.[0]}
                        </p>
                      </div>
                    )}
                  </td>
                  <td>
                    <button
                      onClick={() => onRemover(idx)}
                      className="text-dark-500 hover:text-red-400 transition-colors p-1"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}