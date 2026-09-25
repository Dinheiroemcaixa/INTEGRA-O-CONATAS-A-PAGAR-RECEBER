import React, { useState } from 'react'
import type { VendaPreview } from '@/types'
import { formatCurrency } from '@/lib/utils'
import { CheckCircle, AlertCircle, ShoppingCart, ChevronDown, Edit } from 'lucide-react'

interface TabelaVendasPreviewProps {
  dados: VendaPreview[]
  selecionados: Set<number>
  onToggleSelec: (idx: number) => void
  onToggleTodos: () => void
  onRemover: (idx: number) => void
  onEditar?: (idx: number) => void
}

export default function TabelaVendasPreview({
  dados,
  selecionados,
  onToggleSelec,
  onToggleTodos,
  onRemover,
  onEditar,
}: TabelaVendasPreviewProps) {
  const [expandido, setExpandido] = useState<number | null>(null)
  const allSelected = dados.length > 0 && selecionados.size === dados.filter(d => d.valido).length

  return (
    <div className="bg-white dark:bg-dark-850/90 border border-slate-200/80 dark:border-dark-700/70 rounded-2xl overflow-hidden shadow-xs hover:shadow-md transition-shadow">
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full min-w-[720px] text-left text-xs text-slate-600 dark:text-dark-300">
          <thead className="sticky top-0 z-10 text-[10px] uppercase font-bold tracking-wider bg-slate-100/95 dark:bg-dark-900/95 backdrop-blur-md border-b border-slate-200 dark:border-dark-700/80 text-slate-600 dark:text-dark-400">
            <tr>
              <th className="py-3 px-3 w-10 text-center">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleTodos}
                  className="w-3.5 h-3.5 rounded border-slate-300 dark:border-dark-600 bg-white dark:bg-dark-800 text-brand-600 focus:ring-brand-500 cursor-pointer"
                />
              </th>
              <th className="py-3 px-3">Status</th>
              <th className="py-3 px-3">OS / Pedido</th>
              <th className="py-3 px-3 text-slate-900 dark:text-white font-bold">Cliente</th>
              <th className="py-3 px-3">Data</th>
              <th className="py-3 px-3 text-right">Valor Total</th>
              <th className="py-3 px-3">Forma Pag.</th>
              <th className="py-3 px-3">Itens</th>
              <th className="py-3 px-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/70 dark:divide-dark-800/60">
            {dados.map((venda, idx) => {
              const isSelected = selecionados.has(idx)
              const isExpanded = expandido === idx
              
              return (
                <React.Fragment key={idx}>
                  <tr
                    className={`group transition-colors duration-150 ${
                      !venda.valido 
                        ? 'bg-rose-50/60 dark:bg-rose-500/5 hover:bg-rose-100/60 dark:hover:bg-rose-500/10' 
                        : isSelected 
                          ? 'bg-brand-50/80 dark:bg-brand-500/10 hover:bg-brand-100/60 dark:hover:bg-brand-500/20' 
                          : 'even:bg-slate-50/50 dark:even:bg-white/[0.015] hover:bg-slate-100/60 dark:hover:bg-white/[0.035]'
                    }`}
                  >
                    <td className="py-3 px-3 text-center">
                      <input
                        type="checkbox"
                        disabled={!venda.valido}
                        checked={isSelected}
                        onChange={() => onToggleSelec(idx)}
                        className="w-3.5 h-3.5 rounded border-slate-300 dark:border-dark-600 bg-white dark:bg-dark-800 text-brand-600 focus:ring-brand-500 disabled:opacity-40 cursor-pointer"
                      />
                    </td>
                    <td className="py-3 px-3">
                      {venda.valido ? (
                        <div className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 px-2 py-0.5 rounded-full">
                          <CheckCircle size={11} /> <span>OK</span>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 px-2 py-0.5 rounded-full" title={venda.erros?.join(', ')}>
                          <AlertCircle size={11} /> <span>Erro</span>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3 font-mono font-semibold text-slate-800 dark:text-white text-xs">{venda.os_numero}</td>
                    <td className="py-3 px-3 font-medium text-slate-900 dark:text-white truncate max-w-[220px]" title={venda.cliente}>{venda.cliente}</td>
                    <td className="py-3 px-3 font-mono text-slate-600 dark:text-dark-300 tabular-nums">
                      {venda.data_venda ? new Date(venda.data_venda).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '-'}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 dark:text-white tabular-nums text-xs sm:text-sm">
                      {formatCurrency(venda.valor_total)}
                    </td>
                    <td className="py-3 px-3 text-xs">
                      {venda.forma_pagamento ? (
                        <span className="px-2 py-0.5 bg-slate-100 dark:bg-dark-700/80 rounded-md text-slate-700 dark:text-dark-300 border border-slate-200 dark:border-dark-600/60 font-medium">{venda.forma_pagamento}</span>
                      ) : '-'}
                    </td>
                    <td className="py-3 px-3">
                      <button 
                        onClick={() => setExpandido(isExpanded ? null : idx)}
                        className="inline-flex items-center gap-1.5 text-xs text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 px-2 py-1 rounded-lg hover:bg-brand-50 dark:hover:bg-brand-500/10 border border-transparent hover:border-brand-200 dark:hover:border-brand-500/20 transition-all cursor-pointer"
                      >
                        <ShoppingCart size={13} />
                        <span className="font-semibold">{venda.itens.length} prod.</span>
                        <ChevronDown size={13} className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {onEditar && (
                          <button
                            onClick={() => onEditar(idx)}
                            className="text-slate-400 dark:text-dark-400 hover:text-brand-600 dark:hover:text-brand-300 p-1.5 rounded-lg hover:bg-brand-50 dark:hover:bg-brand-400/10 transition-colors cursor-pointer"
                            title="Editar Venda"
                          >
                            <Edit size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => onRemover(idx)}
                          className="text-slate-400 dark:text-dark-400 hover:text-rose-600 dark:hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-400/10 transition-colors text-xs font-semibold cursor-pointer"
                          title="Remover"
                        >
                          Remover
                        </button>
                      </div>
                    </td>
                  </tr>
                  {/* Linha expandida de itens */}
                  {isExpanded && (
                    <tr className="bg-slate-50/80 dark:bg-dark-900/60">
                      <td colSpan={9} className="p-0 border-t border-slate-200 dark:border-dark-700/60">
                        <div className="px-8 py-5 animate-fade-in">
                          <h4 className="text-[11px] font-bold text-slate-500 dark:text-dark-400 mb-2.5 uppercase tracking-wider">Itens da Venda</h4>
                          <div className="bg-white dark:bg-dark-800 border border-slate-200 dark:border-dark-700 rounded-xl overflow-hidden shadow-xs">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-slate-100/90 dark:bg-dark-900/90 border-b border-slate-200 dark:border-dark-700 text-slate-600 dark:text-dark-400 text-[10px] uppercase font-bold tracking-wider">
                                <tr>
                                  <th className="px-4 py-2.5">Tipo</th>
                                  <th className="px-4 py-2.5 font-mono">Código</th>
                                  <th className="px-4 py-2.5">Descrição</th>
                                  <th className="px-4 py-2.5 text-center">Qtd</th>
                                  <th className="px-4 py-2.5 text-right">Vl Unit</th>
                                  <th className="px-4 py-2.5 text-right">Desc</th>
                                  <th className="px-4 py-2.5 text-right">Vl Total</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-dark-700/50">
                                {venda.itens.map((item, iItem) => (
                                  <tr key={iItem} className="hover:bg-slate-50 dark:hover:bg-dark-700/30 transition-colors">
                                    <td className="px-4 py-2 text-slate-700 dark:text-dark-200">{item.tipo || '-'}</td>
                                    <td className="px-4 py-2 font-mono text-slate-800 dark:text-white">{item.codigo || '-'}</td>
                                    <td className="px-4 py-2 font-medium text-slate-900 dark:text-white">{item.descricao}</td>
                                    <td className="px-4 py-2 font-mono text-slate-800 dark:text-white text-center tabular-nums">{item.quantidade}</td>
                                    <td className="px-4 py-2 font-mono text-slate-700 dark:text-white text-right tabular-nums">
                                      {formatCurrency(item.valor_unitario_original !== undefined ? item.valor_unitario_original : item.valor_unitario)}
                                    </td>
                                    <td className="px-4 py-2 font-mono text-rose-600 dark:text-rose-400 text-right tabular-nums">
                                      {formatCurrency(item.desconto || 0)}
                                    </td>
                                    <td className="px-4 py-2 font-mono font-bold text-slate-900 dark:text-white text-right tabular-nums">
                                      {formatCurrency(item.valor_total !== undefined ? item.valor_total : item.quantidade * item.valor_unitario)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
            {dados.length === 0 && (
              <tr>
                <td colSpan={9} className="py-12 text-center text-slate-400 dark:text-dark-400">
                  <ShoppingCart size={28} className="mx-auto mb-2 opacity-40" />
                  <p className="font-semibold text-slate-600 dark:text-dark-300 text-sm">Nenhuma venda importada</p>
                  <p className="text-xs text-slate-400 dark:text-dark-500 mt-0.5">Faça o upload de uma planilha de OS ou sincronize com o Datacar</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
