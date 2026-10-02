'use client'

import { useState } from 'react'
import { X, Edit2, ArrowRightLeft, Trash2, Send, Tags, Copy, Barcode } from 'lucide-react'
import toast from 'react-hot-toast'
import { formatarDocumentoFiscal } from '@/lib/utils'
import { normalizarNome } from '@/lib/parsers/fornecedores-contaazul'

interface ModalDetalhesProps {
  open: boolean
  onClose: () => void
  titulo: string
  lancamentos: any[]
  mapaCnpjFornecedores?: Record<string, string>
  onDelete: (ids: string[]) => void
  onAgendar: (ids: string[]) => void
  onVoltarAberto: (ids: string[]) => void
  onEditarItem?: (item: any) => void
  onTransferirItem?: (item: any) => void
  onTransferirLote?: (itens: any[]) => void
  onToggleStatus?: (item: any) => void
  onEnviarContasAPagar?: (itens: any[]) => void
  onEditarEmMassa?: (itens: any[]) => void
}

export default function ModalDetalhesLancamentos({
  open,
  onClose,
  titulo,
  lancamentos,
  mapaCnpjFornecedores,
  onDelete,
  onAgendar,
  onVoltarAberto,
  onEditarItem,
  onTransferirItem,
  onTransferirLote,
  onToggleStatus,
  onEnviarContasAPagar,
  onEditarEmMassa
}: ModalDetalhesProps) {
  const [selecionados, setSelecionados] = useState<string[]>([])
  const [itemCodigoBarras, setItemCodigoBarras] = useState<any | null>(null)

  if (!open) return null

  const toggleSelect = (id: string) => {
    if (selecionados.includes(id)) {
      setSelecionados(selecionados.filter(i => i !== id))
    } else {
      setSelecionados([...selecionados, id])
    }
  }

  const toggleSelectAll = () => {
    if (selecionados.length === lancamentos.length) {
      setSelecionados([])
    } else {
      setSelecionados(lancamentos.map(l => l.id))
    }
  }

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)
    
  const total = lancamentos.reduce((acc, curr) => acc + Number(curr.valor), 0)
  
  const totalSelecionado = lancamentos
    .filter(l => selecionados.includes(l.id))
    .reduce((acc, curr) => acc + Number(curr.valor), 0)

  const totalPendente = total - totalSelecionado

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-[#11141c] border border-dark-700 rounded-2xl w-[97vw] max-w-[1600px] shadow-2xl flex flex-col h-[90vh]">
        
        {/* Header */}
        <div className="flex flex-col p-5 border-b border-dark-700 gap-4 shrink-0">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-bold text-xl">{titulo}</h3>
            <button onClick={onClose} className="p-1.5 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700 transition-all">
              <X size={20} />
            </button>
          </div>

           {/* Action Bar (Top) */}
          <div className="h-10 flex items-center justify-end">
             {selecionados.length > 0 && (() => {
                const hasAberto = selecionados.some(id => {
                  const item = lancamentos.find(l => l.id === id)
                  return item && item.status !== 'agendado'
                })
                const hasAgendado = selecionados.some(id => {
                  const item = lancamentos.find(l => l.id === id)
                  return item && item.status === 'agendado'
                })
                return (
                  <div className="flex items-center gap-2 animate-fade-in">
                     <button 
                       onClick={() => { onDelete(selecionados); setSelecionados([]) }}
                       className="bg-rose-500 hover:bg-rose-600 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                     >
                       Excluir ({selecionados.length})
                     </button>
                     {hasAberto && (
                       <button 
                         onClick={() => { onAgendar(selecionados); setSelecionados([]) }}
                         className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors"
                       >
                         Agendar
                       </button>
                     )}
                     {hasAgendado && (
                       <button
                         onClick={() => { onVoltarAberto(selecionados); setSelecionados([]) }}
                         className="bg-amber-500 hover:bg-amber-600 text-[#0b0e14] px-4 py-2 rounded-lg text-sm font-bold transition-colors"
                       >
                         Voltar para Aberto
                       </button>
                     )}
                     {onEditarEmMassa && (
                       <button
                         onClick={() => { onEditarEmMassa(lancamentos.filter(l => selecionados.includes(l.id))); setSelecionados([]) }}
                         className="bg-dark-600 hover:bg-dark-500 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-1.5"
                       >
                         <Tags size={14} /> Editar em Massa
                       </button>
                     )}
                     {onEnviarContasAPagar && (
                       <button
                         onClick={() => { onEnviarContasAPagar(lancamentos.filter(l => selecionados.includes(l.id))); setSelecionados([]) }}
                         className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-1.5"
                       >
                         <Send size={14} /> Enviar p/ Contas a Pagar
                       </button>
                     )}
                     {onTransferirLote && (
                       <button
                         onClick={() => { onTransferirLote(lancamentos.filter(l => selecionados.includes(l.id))); setSelecionados([]) }}
                         className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-1.5"
                       >
                         <ArrowRightLeft size={14} /> Transferir p/ Loja
                       </button>
                     )}
                  </div>
                )
             })()}
          </div>
        </div>

        {/* Content (Table) */}
        <div className="flex-1 overflow-auto custom-scrollbar p-0">
           <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-[#0b0e14] z-10">
                <tr className="border-b border-dark-700 text-[10px] uppercase font-bold tracking-widest text-dark-400">
                  <th className="px-6 py-4 w-12 text-center">
                    <input 
                      type="checkbox" 
                      checked={selecionados.length > 0 && selecionados.length === lancamentos.length}
                      onChange={toggleSelectAll}
                      className="rounded border-dark-500 bg-dark-800 text-blue-500 focus:ring-blue-500 cursor-pointer w-4 h-4"
                    />
                  </th>
                  <th className="px-6 py-4">Beneficiário</th>
                  <th className="px-6 py-4">Categoria</th>
                  <th className="px-6 py-4">Descrição</th>
                  <th className="px-6 py-4">Vencimento</th>
                  <th className="px-6 py-4">Data Pagamento</th>
                  <th className="px-6 py-4">Competência</th>
                  <th className="px-6 py-4">Situação</th>
                  <th className="px-6 py-4">Valor</th>
                  <th className="px-6 py-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-700/50">
                {lancamentos.length === 0 ? (
                  <tr>
                     <td colSpan={10} className="p-12 text-center text-dark-500 font-semibold text-sm">
                       Nenhum lançamento encontrado.
                     </td>
                  </tr>
                ) : (
                  lancamentos.map((pag, idx) => {
                     const desc = pag.descricao ? String(pag.descricao).trim().toUpperCase() : ''
                     const doc = pag.documento && pag.documento !== 'S/N' ? String(pag.documento).trim().toUpperCase() : ''
                     let descFinal = '—'
                     if (desc) {
                       descFinal = doc && !desc.includes(doc) ? `${desc} - DOC: ${pag.documento}` : desc
                     } else if (doc) {
                       descFinal = `DOC: ${pag.documento}`
                     } else if (pag.cpf_cnpj) {
                       descFinal = `CNPJ: ${pag.cpf_cnpj}`
                     }

                     const nome = pag.fornecedor || pag.beneficiario || '—'
                     
                     return (
                        <tr key={pag.id || idx} className={`transition-colors border-b border-dark-700/50 ${selecionados.includes(pag.id) ? 'bg-blue-500/10' : 'hover:bg-dark-800/30'}`}>
                           <td className="px-6 py-4 text-center">
                              <input 
                                type="checkbox" 
                                checked={selecionados.includes(pag.id)}
                                onChange={() => toggleSelect(pag.id)}
                                className="rounded border-dark-500 bg-dark-800 text-blue-500 focus:ring-blue-500 cursor-pointer w-4 h-4"
                              />
                           </td>
                           <td className="px-6 py-4 font-semibold text-white text-sm">
                              <div>{nome}</div>
                              {(() => {
                                const nomeNorm = normalizarNome(nome)
                                const docBruto = pag.cpf_cnpj || (mapaCnpjFornecedores ? mapaCnpjFornecedores[nomeNorm] : null)
                                const docFormatado = formatarDocumentoFiscal(docBruto)
                                if (!docFormatado) return null
                                return (
                                  <div className="text-[11px] font-normal text-slate-400 dark:text-dark-400 mt-0.5 select-all">
                                    {docFormatado}
                                  </div>
                                )
                              })()}
                              {pag.codigo_barras && (
                                <div className="flex items-center gap-1.5 mt-1">
                                  <button
                                    type="button"
                                    onClick={() => setItemCodigoBarras(pag)}
                                    className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 px-2 py-0.5 rounded transition-colors cursor-pointer"
                                    title="Clique para visualizar o código de barras completo"
                                  >
                                    <Barcode size={11} /> Ver código de barras
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      navigator.clipboard.writeText(pag.codigo_barras)
                                      toast.success('Código de barras copiado!')
                                    }}
                                    className="p-1 hover:bg-dark-700 text-dark-400 hover:text-blue-400 rounded transition-colors"
                                    title="Copiar Código de Barras"
                                  >
                                    <Copy size={11} />
                                  </button>
                                </div>
                              )}
                           </td>
                           <td className="px-6 py-4 text-sm text-dark-300 max-w-[220px] truncate">
                              {pag.categoria || '—'}
                           </td>
                           <td className="px-6 py-4 text-sm text-dark-300 max-w-[320px] truncate" title={descFinal}>
                              {descFinal}
                           </td>
                           <td className="px-6 py-4 text-sm text-dark-300">
                              {pag.data_vencimento ? pag.data_vencimento.split('-').reverse().join('/') : '—'}
                           </td>
                           <td className="px-6 py-4 text-sm text-dark-300">
                              {(pag.data_pagamento || pag.data_vencimento || (pag.created_at ? pag.created_at.split('T')[0] : null))
                                ? (pag.data_pagamento || pag.data_vencimento || pag.created_at.split('T')[0]).split('-').reverse().join('/')
                                : '—'}
                           </td>
                           <td className="px-6 py-4 text-sm text-dark-300">
                              {pag.competencia ? pag.competencia.split('-').reverse().join('/') : '—'}
                           </td>
                           <td className="px-6 py-4">
                              <button
                                 onClick={() => onToggleStatus && onToggleStatus(pag)}
                                 className={`text-[10px] font-bold px-2 py-1 rounded border uppercase tracking-wider transition-colors ${
                                  pag.status === 'agendado' 
                                  ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20' 
                                  : 'bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500/20'
                                 }`}
                              >
                                 {pag.status === 'agendado' ? 'AGENDADO' : 'EM ABERTO'}
                              </button>
                           </td>
                           <td className="px-6 py-4 font-bold text-white text-sm">
                              {formatCurrency(pag.valor)}
                           </td>
                           <td className="px-6 py-4 text-center">
                              <div className="flex items-center justify-center gap-2">
                                  {onEditarItem && (
                                    <button onClick={() => onEditarItem(pag)} className="text-dark-400 hover:text-white transition-colors p-1" title="Editar">
                                       <Edit2 size={14}/>
                                    </button>
                                  )}
                                  {onTransferirItem && (
                                    <button onClick={() => onTransferirItem(pag)} className="text-dark-400 hover:text-emerald-400 transition-colors p-1" title="Transferir">
                                       <ArrowRightLeft size={14}/>
                                    </button>
                                  )}
                                  {onEnviarContasAPagar && (
                                    <button onClick={() => onEnviarContasAPagar([pag])} className="text-dark-400 hover:text-blue-400 transition-colors p-1" title="Enviar para Contas a Pagar">
                                       <Send size={14}/>
                                    </button>
                                  )}
                                  <button onClick={() => onDelete([pag.id])} className="text-dark-400 hover:text-rose-400 transition-colors p-1" title="Excluir">
                                     <Trash2 size={14}/>
                                  </button>
                              </div>
                           </td>
                        </tr>
                     )
                  })
                )}
              </tbody>
           </table>
         </div>

         {/* Footer */}
         <div className="p-6 border-t border-dark-700 shrink-0 bg-[#0b0e14] rounded-b-2xl flex items-center justify-between">
            <div>
               <p className="text-[10px] font-bold text-dark-400 uppercase tracking-widest mb-1">Total {titulo.includes('DDA') ? 'DDA' : 'Folha'}</p>
               <p className="text-xl font-black text-white">{formatCurrency(total)}</p>
            </div>
            
            <div className="flex gap-12">
               <div className="text-right">
                  <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-1">Pendente</p>
                  <p className="text-xl font-black text-amber-500">{formatCurrency(totalPendente)}</p>
               </div>
               
               <div className="text-right">
                  <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest mb-1">Selecionado</p>
                  <p className="text-xl font-black text-blue-500">{formatCurrency(totalSelecionado)}</p>
               </div>
            </div>
         </div>
         
      </div>

      {/* Modal de Código de Barras Expandido */}
      {itemCodigoBarras && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-[#11141c] border border-dark-600 rounded-2xl p-6 w-full max-w-lg shadow-2xl relative overflow-hidden">
            <div className="flex items-center justify-between pb-4 border-b border-dark-700 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
                  <Barcode size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Código de Barras do Boleto</h3>
                  <p className="text-xs text-dark-400">Linha digitável / código para pagamento</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setItemCodigoBarras(null)}
                className="p-1 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-dark-800/60 rounded-xl p-3.5 border border-dark-700/60 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-dark-500 block uppercase font-bold text-[10px]">Beneficiário</span>
                  <span className="font-semibold text-white truncate block">
                    {itemCodigoBarras.beneficiario || itemCodigoBarras.fornecedor || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-dark-500 block uppercase font-bold text-[10px]">Valor</span>
                  <span className="font-black text-rose-400 tabular-nums">
                    {formatCurrency(itemCodigoBarras.valor || 0)}
                  </span>
                </div>
                <div>
                  <span className="text-dark-500 block uppercase font-bold text-[10px]">Vencimento</span>
                  <span className="font-semibold text-white">
                    {itemCodigoBarras.data_vencimento ? itemCodigoBarras.data_vencimento.split('-').reverse().join('/') : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-dark-500 block uppercase font-bold text-[10px]">Nº Documento</span>
                  <span className="font-semibold text-white">
                    {itemCodigoBarras.documento || 'S/N'}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-dark-400 uppercase tracking-wider mb-1.5">
                  Linha Digitável / Código Completo
                </label>
                <div className="font-mono text-sm text-white break-all bg-[#0b0e14] p-4 rounded-xl border border-dark-700 tabular-nums tracking-widest select-all leading-relaxed">
                  {itemCodigoBarras.codigo_barras}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setItemCodigoBarras(null)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-dark-300 hover:bg-dark-700 transition-colors cursor-pointer"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(itemCodigoBarras.codigo_barras)
                    toast.success('Código de barras copiado com sucesso!')
                  }}
                  className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                >
                  <Copy size={14} /> Copiar Código de Barras
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
