import { useState } from 'react'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { ContaPagarPreview } from '@/types'
import { CheckCircle, AlertCircle, Trash2, Edit2, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import SelectorFornecedor from './SelectorFornecedor'
import SelectorCategoria from './SelectorCategoria'
import SelectorContaFinanceira, { ContaFinanceiraOpcao } from './SelectorContaFinanceira'
import { LISTA_CATEGORIAS_FLAT } from '@/lib/conta-azul/constants'

interface Props {
  dados: (ContaPagarPreview & { originalIdx?: number })[]
  filtro: 'todos' | 'erro' | 'revisao'
  selecionados: Set<number>
  onToggle: (idx: number) => void
  onToggleTodos: () => void
  onRemover: (idx: number) => void
  onUpdateFornecedor: (idx: number, novoNome: string) => void
  onUpdateCategoria: (idx: number, novaCategoria: string) => void
  onUpdateConta: (idx: number, novaConta: string, contaId: string) => void
  onRemoverLote: (indices: number[]) => void
  onUpdateCategoriaLote: (indices: number[], novaCategoria: string) => void
  onUpdateContaLote: (indices: number[], novaConta: string) => void
  contasFinanceiras: ContaFinanceiraOpcao[]
  onUpdateValor: (idx: number, novoValor: number) => void
  onUpdateVencimento: (idx: number, novaData: string) => void
  onUpdateEmissao: (idx: number, novaData: string) => void
  onUpdateDescricao: (idx: number, novaDesc: string) => void
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
  dados, filtro, selecionados, onToggle, onToggleTodos, onRemover, onUpdateFornecedor, onUpdateCategoria,
  onRemoverLote, onUpdateCategoriaLote, onUpdateConta, onUpdateContaLote, contasFinanceiras,
  onUpdateValor, onUpdateVencimento, onUpdateEmissao, onUpdateDescricao
}: Props) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editingCatIdx, setEditingCatIdx] = useState<number | null>(null)
  const [editingContaIdx, setEditingContaIdx] = useState<number | null>(null)
  const [editingValorIdx, setEditingValorIdx] = useState<number | null>(null)
  const [editingVencIdx, setEditingVencIdx] = useState<number | null>(null)
  const [editingEmissaoIdx, setEditingEmissaoIdx] = useState<number | null>(null)
  const [editingDescIdx, setEditingDescIdx] = useState<number | null>(null)
  const [buscaFornecedor, setBuscaFornecedor] = useState('')
  const [buscaCategoria, setBuscaCategoria] = useState('')
  const [buscaValor, setBuscaValor] = useState('')
  const [loteCategoria, setLoteCategoria] = useState('')
  const [loteConta, setLoteConta] = useState('')
  const [showBulkEdit, setShowBulkEdit] = useState(false)
  const [showBulkList, setShowBulkList] = useState(false)
  const [showBulkContaList, setShowBulkContaList] = useState(false)
  
  // Filtrar os dados para exibição
  const dadosFiltrados = dados.filter(d => {
    // Filtro de status (bolinhas)
    if (filtro === 'erro' && d.valido) return false
    if (filtro === 'revisao' && (!d.valido || !d.matchFornecedor || d.matchFornecedor.confianca === 'exato')) return false
    
    // Filtros de texto/valor
    if (buscaFornecedor && !d.fornecedor.toLowerCase().includes(buscaFornecedor.toLowerCase())) return false
    if (buscaCategoria && ! (d.categoria || 'Materiais para Revenda').toLowerCase().includes(buscaCategoria.toLowerCase())) return false
    if (buscaValor && !d.valor.toString().includes(buscaValor)) return false
    
    return true
  })

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
      <div className="px-4 py-3 border-b border-dark-700 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-sm text-dark-400">
            Mostrando <span className="text-white font-semibold">{dadosFiltrados.length}</span> de <span className="text-white font-semibold">{dados.length}</span> registros
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

        {/* Barra de Filtros Pesquisa */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative">
            <input 
              type="text" 
              placeholder="Filtrar fornecedor..."
              value={buscaFornecedor}
              onChange={(e) => setBuscaFornecedor(e.target.value)}
              className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div className="relative">
            <input 
              type="text" 
              placeholder="Filtrar categoria..."
              value={buscaCategoria}
              onChange={(e) => setBuscaCategoria(e.target.value)}
              className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div className="relative">
            <input 
              type="text" 
              placeholder="Filtrar valor..."
              value={buscaValor}
              onChange={(e) => setBuscaValor(e.target.value)}
              className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
        </div>

        {/* Painel de Edição em Lote */}
        {selecionados.size > 0 && (
          <div className="bg-brand-600/10 border border-brand-600/30 rounded-lg p-3 flex items-center justify-between animate-in slide-in-from-top-2">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-brand-400">{selecionados.size} selecionados</span>
              <div className="h-4 w-px bg-dark-600" />
              {showBulkEdit ? (
                <div className="flex items-center gap-3 flex-wrap">
                  {/* Categoria em Lote */}
                  <div className="flex items-center gap-2 relative">
                    <div className="relative">
                      <input 
                        type="text" 
                        placeholder="Categoria para todos..."
                        value={loteCategoria}
                        onChange={(e) => { setLoteCategoria(e.target.value); setShowBulkList(true) }}
                        onFocus={() => setShowBulkList(true)}
                        className="bg-dark-900 border border-dark-600 rounded px-2 py-1 text-xs text-white outline-none w-[160px]"
                      />
                      {showBulkList && (
                        <div className="absolute z-50 mt-1 w-full bg-dark-800 border border-dark-600 rounded-lg shadow-2xl overflow-hidden max-h-[200px] overflow-y-auto">
                          {LISTA_CATEGORIAS_FLAT.filter(c => c.toLowerCase().includes(loteCategoria.toLowerCase())).slice(0, 10).map((cat, i) => (
                            <button
                              key={i}
                              onClick={() => { setLoteCategoria(cat); setShowBulkList(false) }}
                              className="w-full text-left px-3 py-1.5 text-[10px] text-white hover:bg-brand-600/20 transition-colors"
                            >
                              {cat}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button 
                      onClick={() => {
                        onUpdateCategoriaLote(Array.from(selecionados), loteCategoria)
                        setShowBulkList(false)
                        setLoteCategoria('')
                      }}
                      disabled={!loteCategoria}
                      className="bg-brand-600 text-white px-2 py-1 rounded text-[10px] font-bold disabled:opacity-50"
                    >
                      Aplicar
                    </button>
                  </div>

                  {/* Conta em Lote */}
                  <div className="flex items-center gap-2 relative">
                    <div className="relative">
                      <input 
                        type="text" 
                        placeholder="Conta para todos..."
                        value={loteConta}
                        onChange={(e) => { setLoteConta(e.target.value); setShowBulkContaList(true) }}
                        onFocus={() => setShowBulkContaList(true)}
                        className="bg-dark-900 border border-dark-600 rounded px-2 py-1 text-xs text-white outline-none w-[160px]"
                      />
                      {showBulkContaList && (
                        <div className="absolute z-50 mt-1 w-full bg-dark-800 border border-dark-600 rounded-lg shadow-2xl overflow-hidden max-h-[200px] overflow-y-auto">
                          {contasFinanceiras.filter(c => c.descricao.toLowerCase().includes(loteConta.toLowerCase())).map((c) => (
                            <button
                              key={c.id}
                              onClick={() => { setLoteConta(c.descricao); setShowBulkContaList(false) }}
                              className="w-full text-left px-3 py-1.5 text-[10px] text-white hover:bg-blue-600/20 transition-colors"
                            >
                              {c.descricao}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button 
                      onClick={() => {
                        onUpdateContaLote(Array.from(selecionados), loteConta)
                        setShowBulkContaList(false)
                        setLoteConta('')
                      }}
                      disabled={!loteConta}
                      className="bg-blue-600 text-white px-2 py-1 rounded text-[10px] font-bold disabled:opacity-50"
                    >
                      Aplicar
                    </button>
                  </div>

                  <button onClick={() => { setShowBulkEdit(false); setShowBulkList(false); setShowBulkContaList(false) }} className="text-dark-400 text-[10px]">Fechar</button>
                </div>
              ) : (
                <button 
                  onClick={() => setShowBulkEdit(true)}
                  className="text-xs text-brand-400 hover:text-brand-300 font-semibold flex items-center gap-1"
                >
                  <Edit2 size={12} /> Alterar em Lote
                </button>
              )}
            </div>
            <button 
              onClick={() => {
                if (confirm(`Remover todos os ${selecionados.size} itens selecionados?`)) {
                  onRemoverLote(Array.from(selecionados))
                }
              }}
              className="text-xs text-red-400 hover:text-red-300 font-semibold flex items-center gap-1"
            >
              <Trash2 size={12} /> Excluir selecionados
            </button>
          </div>
        )}
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
              <th>Competência</th>
              <th>Categoria</th>
              <th>Conta</th>
              <th>Descrição</th>
              <th className="text-center">Status</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {dadosFiltrados.map((item) => {
              const idx = item.originalIdx ?? 0
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
                            className="opacity-40 group-hover:opacity-100 transition-opacity text-dark-500 hover:text-brand-400 p-1"
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
                        {item.ca_duplicidade?.encontrado && (
                          <div className="mt-1 flex items-center gap-1 text-[10px] text-amber-400 bg-amber-400/10 px-2 py-1 rounded border border-amber-400/20 w-max cursor-help" title={`Possível duplicidade no Conta Azul:\nStatus: ${item.ca_duplicidade.status}\nData: ${item.ca_duplicidade.vencimento}\nValor: R$ ${item.ca_duplicidade.valor}\nFornecedor: ${item.ca_duplicidade.fornecedor}`}>
                            <AlertCircle size={10} />
                            <span>Possível Duplicidade CA</span>
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="text-right font-mono text-white min-w-[120px]">
                    {editingValorIdx === idx ? (
                      <input
                        type="number"
                        step="0.01"
                        defaultValue={item.valor}
                        autoFocus
                        onBlur={(e) => {
                          const val = parseFloat(e.target.value)
                          if (!isNaN(val)) onUpdateValor(idx, val)
                          setEditingValorIdx(null)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const val = parseFloat(e.currentTarget.value)
                            if (!isNaN(val)) onUpdateValor(idx, val)
                            setEditingValorIdx(null)
                          } else if (e.key === 'Escape') setEditingValorIdx(null)
                        }}
                        className="w-full bg-dark-900 border border-brand-500 rounded px-2 py-1 text-xs text-right outline-none"
                      />
                    ) : (
                      <div className="group flex items-center justify-end gap-2">
                        <button
                          onClick={() => setEditingValorIdx(idx)}
                          className="opacity-40 group-hover:opacity-100 transition-opacity text-dark-500 hover:text-brand-400 p-1 flex-shrink-0"
                          title="Editar valor"
                        >
                          <Edit2 size={12} />
                        </button>
                        <span>{formatCurrency(item.valor)}</span>
                      </div>
                    )}
                  </td>
                  <td className="text-dark-300 text-sm min-w-[140px]">
                    {editingVencIdx === idx ? (
                      <input
                        type="date"
                        defaultValue={item.vencimento || ''}
                        autoFocus
                        onBlur={(e) => {
                          onUpdateVencimento(idx, e.target.value)
                          setEditingVencIdx(null)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            onUpdateVencimento(idx, e.currentTarget.value)
                            setEditingVencIdx(null)
                          } else if (e.key === 'Escape') setEditingVencIdx(null)
                        }}
                        className="w-full bg-dark-900 border border-brand-500 rounded px-2 py-1 text-xs outline-none"
                      />
                    ) : (
                      <div className="group flex items-center gap-2">
                        <span>{item.vencimento ? formatDate(item.vencimento) : '---'}</span>
                        <button
                          onClick={() => setEditingVencIdx(idx)}
                          className="opacity-40 group-hover:opacity-100 transition-opacity text-dark-500 hover:text-brand-400 p-1 flex-shrink-0"
                          title="Editar vencimento"
                        >
                          <Edit2 size={12} />
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="text-dark-300 text-sm min-w-[140px]">
                    {editingEmissaoIdx === idx ? (
                      <input
                        type="date"
                        defaultValue={item.emissao || ''}
                        autoFocus
                        onBlur={(e) => {
                          onUpdateEmissao(idx, e.target.value)
                          setEditingEmissaoIdx(null)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            onUpdateEmissao(idx, e.currentTarget.value)
                            setEditingEmissaoIdx(null)
                          } else if (e.key === 'Escape') setEditingEmissaoIdx(null)
                        }}
                        className="w-full bg-dark-900 border border-brand-500 rounded px-2 py-1 text-xs outline-none"
                      />
                    ) : (
                      <div className="group flex items-center gap-2">
                        <span>{item.emissao ? formatDate(item.emissao) : '---'}</span>
                        <button
                          onClick={() => setEditingEmissaoIdx(idx)}
                          className="opacity-40 group-hover:opacity-100 transition-opacity text-dark-500 hover:text-brand-400 p-1 flex-shrink-0"
                          title="Editar competência (emissão)"
                        >
                          <Edit2 size={12} />
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="text-dark-300 text-xs min-w-[200px]">
                    {editingCatIdx === idx ? (
                      <SelectorCategoria 
                        valorInicial={item.categoria || 'Materiais para Revenda'}
                        onCancel={() => setEditingCatIdx(null)}
                        onSelect={(cat) => {
                          onUpdateCategoria(idx, cat)
                          setEditingCatIdx(null)
                        }}
                      />
                    ) : (
                      <div 
                        className="group flex items-center justify-between gap-2 bg-dark-900/50 border border-dark-700/50 hover:border-dark-600 rounded px-2 py-1 cursor-pointer transition-all"
                        onClick={() => setEditingCatIdx(idx)}
                      >
                        <span className="truncate">
                          {item.categoria || 'Materiais para Revenda'}
                        </span>
                        <ChevronDown size={12} className="text-dark-500 group-hover:text-dark-300" />
                      </div>
                    )}
                  </td>
                  <td className="text-dark-300 text-xs min-w-[180px]">
                    {editingContaIdx === idx ? (
                      <SelectorContaFinanceira 
                        valorInicial={item.conta_financeira || ''}
                        contas={contasFinanceiras}
                        onCancel={() => setEditingContaIdx(null)}
                        onSelect={(nome, id) => {
                          onUpdateConta(idx, nome, id)
                          setEditingContaIdx(null)
                        }}
                      />
                    ) : (
                      <div 
                        className="group flex items-center justify-between gap-2 bg-blue-900/10 border border-blue-500/20 hover:border-blue-500/40 rounded px-2 py-1 cursor-pointer transition-all"
                        onClick={() => setEditingContaIdx(idx)}
                      >
                        <span className="truncate text-blue-300">
                          {item.conta_financeira || 'Selecionar conta...'}
                        </span>
                        <ChevronDown size={12} className="text-blue-500 group-hover:text-blue-300" />
                      </div>
                    )}
                  </td>
                  <td className="text-dark-400 text-xs max-w-[200px]">
                    {editingDescIdx === idx ? (
                      <input
                        type="text"
                        defaultValue={item.descricao || ''}
                        autoFocus
                        onBlur={(e) => {
                          onUpdateDescricao(idx, e.target.value)
                          setEditingDescIdx(null)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            onUpdateDescricao(idx, e.currentTarget.value)
                            setEditingDescIdx(null)
                          } else if (e.key === 'Escape') setEditingDescIdx(null)
                        }}
                        className="w-full bg-dark-900 border border-brand-500 rounded px-2 py-1 text-xs outline-none"
                      />
                    ) : (
                      <div className="group flex items-center gap-2 truncate">
                        <span className="truncate" title={item.descricao}>{item.descricao || '---'}</span>
                        <button
                          onClick={() => setEditingDescIdx(idx)}
                          className="opacity-40 group-hover:opacity-100 transition-opacity text-dark-500 hover:text-brand-400 p-1 flex-shrink-0"
                          title="Editar descrição"
                        >
                          <Edit2 size={12} />
                        </button>
                      </div>
                    )}
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
