import { useState } from 'react'
import { formatCurrency, formatDate, visualizarAnexo } from '@/lib/utils'
import type { ContaPagarPreview } from '@/types'
import { CheckCircle2, AlertCircle, Trash2, Edit2, ChevronDown, Paperclip, Search, Sparkles, Filter, Layers } from 'lucide-react'
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
  onToggleTodosLote: (indices: number[], acao: 'marcar' | 'desmarcar') => void
  onRemover: (idx: number) => void
  onUpdateFornecedor: (idx: number, novoNome: string) => void
  onUpdateCategoria: (idx: number, novaCategoria: string) => void
  onUpdateConta: (idx: number, novaConta: string, contaId: string) => void
  onRemoverLote: (indices: number[]) => void
  onUpdateCategoriaLote: (indices: number[], novaCategoria: string) => void
  onUpdateContaLote: (indices: number[], novaConta: string) => void
  onUpdateFornecedorLote: (indices: number[], novoFornecedor: string) => void
  contasFinanceiras?: ContaFinanceiraOpcao[]
  categoriasCA?: string[]
  onUpdateValor: (idx: number, novoValor: number) => void
  onUpdateVencimento: (idx: number, novaData: string) => void
  onUpdateEmissao: (idx: number, novaData: string) => void
  onUpdateDescricao: (idx: number, novaDesc: string) => void
}

function BadgeMatch({ confianca, score }: { confianca: string; score: number }) {
  if (confianca === 'exato' || score === 100) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md font-mono font-medium" title="Nome exato encontrado no ContaAzul">
        <CheckCircle2 size={10} /> exato
      </span>
    )
  }
  
  if (score >= 80) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md font-mono font-medium" title={`Match automático — confiança ${score}%`}>
        <Sparkles size={10} /> {score}%
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-md font-mono font-medium" title={`Match fraco — verifique — confiança ${score}%`}>
      <AlertCircle size={10} /> {score}%
    </span>
  )
}

export default function TabelaPreview({
  dados, filtro, selecionados, onToggle, onToggleTodosLote, onRemover, onUpdateFornecedor, onUpdateCategoria,
  onRemoverLote, onUpdateCategoriaLote, onUpdateConta, onUpdateContaLote, onUpdateFornecedorLote, contasFinanceiras = [],
  categoriasCA = [], onUpdateValor, onUpdateVencimento, onUpdateEmissao, onUpdateDescricao
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
  const [showBulkEdit, setShowBulkEdit] = useState(false)
  const [showBulkList, setShowBulkList] = useState(false)
  const [showBulkContaList, setShowBulkContaList] = useState(false)

  // Filtragem local
  const dadosFiltrados = dados.filter(item => {
    if (filtro === 'erro' && item.valido) return false
    if (filtro === 'revisao' && (!item.valido || !item.matchFornecedor || item.matchFornecedor.confianca === 'exato')) return false

    if (buscaFornecedor && !item.fornecedor.toLowerCase().includes(buscaFornecedor.toLowerCase())) return false
    if (buscaCategoria && !item.categoria?.toLowerCase().includes(buscaCategoria.toLowerCase())) return false
    if (buscaValor && !item.valor.toString().includes(buscaValor)) return false

    return true
  })

  const todosVisiveisSelecionados = dadosFiltrados.length > 0 && dadosFiltrados.every(d => selecionados.has(d.originalIdx ?? 0))

  const handleToggleTodosVisiveis = () => {
    const indices = dadosFiltrados.map(d => d.originalIdx ?? 0)
    if (todosVisiveisSelecionados) {
      onToggleTodosLote(indices, 'desmarcar')
    } else {
      onToggleTodosLote(indices, 'marcar')
    }
  }

  const handleAplicarCategoriaLote = (cat: string) => {
    const indices = Array.from(selecionados)
    onUpdateCategoriaLote(indices, cat)
    setShowBulkList(false)
    setShowBulkEdit(false)
  }

  const handleAplicarContaLote = (conta: string) => {
    const indices = Array.from(selecionados)
    onUpdateContaLote(indices, conta)
    setShowBulkContaList(false)
    setShowBulkEdit(false)
  }

  const handleExcluirLote = () => {
    const indices = Array.from(selecionados)
    if (confirm(`Deseja realmente excluir os ${indices.length} registros selecionados?`)) {
      onRemoverLote(indices)
      setShowBulkEdit(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* Barra de Filtros Rápidos e Ações em Massa */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-dark-900/60 p-3 rounded-2xl border border-dark-700/80 backdrop-blur-sm shadow-lg">
        <div className="flex items-center gap-2 flex-wrap flex-1">
          <div className="relative flex-1 min-w-[140px] max-w-xs">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
            <input
              type="text"
              placeholder="Buscar fornecedor..."
              value={buscaFornecedor}
              onChange={e => setBuscaFornecedor(e.target.value)}
              className="w-full bg-dark-950 border border-dark-700/80 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-dark-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
            />
          </div>
          <div className="relative flex-1 min-w-[130px] max-w-xs">
            <Filter size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
            <input
              type="text"
              placeholder="Buscar categoria..."
              value={buscaCategoria}
              onChange={e => setBuscaCategoria(e.target.value)}
              className="w-full bg-dark-950 border border-dark-700/80 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-dark-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
            />
          </div>
          <div className="relative w-28">
            <input
              type="text"
              placeholder="Valor..."
              value={buscaValor}
              onChange={e => setBuscaValor(e.target.value)}
              className="w-full bg-dark-950 border border-dark-700/80 rounded-xl px-3 py-1.5 text-xs text-white placeholder:text-dark-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-mono transition-all"
            />
          </div>
          {(buscaFornecedor || buscaCategoria || buscaValor) && (
            <button
              onClick={() => {
                setBuscaFornecedor('')
                setBuscaCategoria('')
                setBuscaValor('')
              }}
              className="text-xs text-dark-400 hover:text-white px-2 py-1 transition-colors cursor-pointer"
            >
              Limpar
            </button>
          )}
        </div>

        {/* Painel de Ações em Massa */}
        {selecionados.size > 0 && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowBulkEdit(!showBulkEdit)}
              className="flex items-center gap-2 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-500 text-white px-3.5 py-1.5 rounded-xl font-bold text-xs shadow-md shadow-blue-900/30 transition-all cursor-pointer whitespace-nowrap"
            >
              <Layers size={14} />
              <span>Ações em Massa ({selecionados.size})</span>
              <ChevronDown size={13} className={cn("transition-transform duration-200", showBulkEdit ? "rotate-180" : "")} />
            </button>

            {showBulkEdit && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-dark-900 border border-dark-700/90 rounded-2xl shadow-2xl p-2 z-50 space-y-1 backdrop-blur-xl animate-fade-in">
                <button
                  type="button"
                  onClick={() => {
                    setShowBulkList(true)
                    setShowBulkContaList(false)
                  }}
                  className="w-full text-left px-3 py-2 text-xs font-semibold text-dark-200 hover:text-white hover:bg-dark-800 rounded-xl transition-all flex items-center justify-between"
                >
                  <span>Alterar Categoria ({selecionados.size})</span>
                  <ChevronDown size={12} className="-rotate-90 text-dark-500" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowBulkContaList(true)
                    setShowBulkList(false)
                  }}
                  className="w-full text-left px-3 py-2 text-xs font-semibold text-dark-200 hover:text-white hover:bg-dark-800 rounded-xl transition-all flex items-center justify-between"
                >
                  <span>Alterar Conta Financeira ({selecionados.size})</span>
                  <ChevronDown size={12} className="-rotate-90 text-dark-500" />
                </button>

                <div className="h-px bg-dark-800 my-1" />

                <button
                  type="button"
                  onClick={handleExcluirLote}
                  className="w-full text-left px-3 py-2 text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl transition-all flex items-center gap-2"
                >
                  <Trash2 size={13} />
                  <span>Excluir Selecionados</span>
                </button>

                {/* Submenu Categorias */}
                {showBulkList && (
                  <div className="p-2 border-t border-dark-800 max-h-48 overflow-y-auto space-y-1 custom-scrollbar">
                    <p className="text-[10px] font-bold text-dark-400 uppercase tracking-wider mb-1">Selecione a categoria:</p>
                    {(categoriasCA.length > 0 ? categoriasCA : LISTA_CATEGORIAS_FLAT).map(cat => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => handleAplicarCategoriaLote(cat)}
                        className="w-full text-left px-2 py-1 text-[11px] text-dark-300 hover:text-white hover:bg-dark-800 rounded-lg truncate transition-all"
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}

                {/* Submenu Contas Financeiras */}
                {showBulkContaList && (
                  <div className="p-2 border-t border-dark-800 max-h-48 overflow-y-auto space-y-1 custom-scrollbar">
                    <p className="text-[10px] font-bold text-dark-400 uppercase tracking-wider mb-1">Selecione a conta:</p>
                    {contasFinanceiras.map(conta => (
                      <button
                        key={conta.id}
                        type="button"
                        onClick={() => handleAplicarContaLote(conta.descricao)}
                        className="w-full text-left px-2 py-1 text-[11px] text-dark-300 hover:text-white hover:bg-dark-800 rounded-lg truncate transition-all"
                      >
                        {conta.descricao}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabela de Lançamentos */}
      <div className="bg-dark-900/60 border border-dark-700/80 rounded-2xl overflow-hidden shadow-xl backdrop-blur-sm">
        <div className="overflow-x-auto custom-scrollbar max-h-[600px]">
          <table className="w-full text-left border-collapse">
            <thead className="bg-dark-950/90 text-dark-400 text-[11px] font-bold uppercase tracking-wider sticky top-0 z-20 backdrop-blur-md border-b border-dark-700/80 select-none">
              <tr>
                <th className="p-3.5 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={todosVisiveisSelecionados}
                    onChange={handleToggleTodosVisiveis}
                    className="rounded border-dark-700 bg-dark-900 text-blue-500 focus:ring-blue-500/20 cursor-pointer"
                  />
                </th>
                <th className="p-3.5 min-w-[200px]">Fornecedor</th>
                <th className="p-3.5 text-right min-w-[120px]">Valor</th>
                <th className="p-3.5 min-w-[130px]">Vencimento</th>
                <th className="p-3.5 min-w-[130px]">Competência</th>
                <th className="p-3.5 min-w-[180px]">Categoria</th>
                <th className="p-3.5 min-w-[170px]">Conta Financeira</th>
                <th className="p-3.5 min-w-[180px]">Descrição</th>
                <th className="p-3.5 text-center w-20">Status</th>
                <th className="p-3.5 text-center w-16">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-800/60 text-xs">
              {dadosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-dark-400">
                    Nenhum registro encontrado com os filtros aplicados.
                  </td>
                </tr>
              ) : (
                dadosFiltrados.map(item => {
                  const idx = item.originalIdx ?? 0
                  const isSelected = selecionados.has(idx)

                  return (
                    <tr
                      key={idx}
                      className={cn(
                        "hover:bg-dark-850/60 transition-colors group",
                        isSelected ? "bg-blue-500/5" : "",
                        !item.valido ? "bg-rose-500/5" : ""
                      )}
                    >
                      <td className="p-3.5 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => onToggle(idx)}
                          className="rounded border-dark-700 bg-dark-900 text-blue-500 focus:ring-blue-500/20 cursor-pointer"
                        />
                      </td>

                      {/* Fornecedor */}
                      <td className="p-3.5">
                        {editingIdx === idx ? (
                          <SelectorFornecedor
                            valorInicial={item.fornecedor}
                            onSelect={nome => {
                              onUpdateFornecedor(idx, nome)
                              setEditingIdx(null)
                            }}
                            onCancel={() => setEditingIdx(null)}
                          />
                        ) : (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span className="text-white font-bold tracking-tight text-xs">
                                {item.fornecedor}
                              </span>
                              <button
                                type="button"
                                onClick={() => setEditingIdx(idx)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-dark-400 hover:text-blue-400 p-0.5"
                                title="Editar fornecedor"
                              >
                                <Edit2 size={11} />
                              </button>
                            </div>
                            {item.matchFornecedor && (
                              <div className="flex items-center gap-1.5">
                                <BadgeMatch
                                  confianca={item.matchFornecedor.confianca}
                                  score={item.matchFornecedor.score}
                                />
                                {item.matchFornecedor.nomeCorrigido && item.matchFornecedor.nomeCorrigido !== item.fornecedor && (
                                  <span className="text-[10px] text-dark-400 truncate max-w-[140px]">
                                    → {item.matchFornecedor.nomeCorrigido}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Valor */}
                      <td className="p-3.5 text-right font-mono font-bold tabular-nums">
                        {editingValorIdx === idx ? (
                          <input
                            type="number"
                            step="0.01"
                            defaultValue={item.valor}
                            autoFocus
                            onBlur={e => {
                              onUpdateValor(idx, parseFloat(e.target.value) || 0)
                              setEditingValorIdx(null)
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                onUpdateValor(idx, parseFloat(e.currentTarget.value) || 0)
                                setEditingValorIdx(null)
                              } else if (e.key === 'Escape') setEditingValorIdx(null)
                            }}
                            className="w-24 bg-dark-950 border border-blue-500 rounded-lg px-2 py-1 text-xs text-right text-white outline-none font-mono"
                          />
                        ) : (
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="text-emerald-400 text-xs">
                              {formatCurrency(item.valor)}
                            </span>
                            <button
                              type="button"
                              onClick={() => setEditingValorIdx(idx)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-dark-400 hover:text-blue-400 p-0.5"
                              title="Editar valor"
                            >
                              <Edit2 size={11} />
                            </button>
                          </div>
                        )}
                      </td>

                      {/* Vencimento */}
                      <td className="p-3.5 font-mono text-dark-300">
                        {editingVencIdx === idx ? (
                          <input
                            type="date"
                            defaultValue={item.vencimento}
                            autoFocus
                            onBlur={e => {
                              onUpdateVencimento(idx, e.target.value)
                              setEditingVencIdx(null)
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                onUpdateVencimento(idx, e.currentTarget.value)
                                setEditingVencIdx(null)
                              } else if (e.key === 'Escape') setEditingVencIdx(null)
                            }}
                            className="bg-dark-950 border border-blue-500 rounded-lg px-2 py-1 text-xs text-white outline-none font-mono"
                          />
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span>{formatDate(item.vencimento)}</span>
                            <button
                              type="button"
                              onClick={() => setEditingVencIdx(idx)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-dark-400 hover:text-blue-400 p-0.5"
                              title="Editar vencimento"
                            >
                              <Edit2 size={11} />
                            </button>
                          </div>
                        )}
                      </td>

                      {/* Emissão / Competência */}
                      <td className="p-3.5 font-mono text-dark-300">
                        {editingEmissaoIdx === idx ? (
                          <input
                            type="date"
                            defaultValue={item.emissao || ''}
                            autoFocus
                            onBlur={e => {
                              onUpdateEmissao(idx, e.target.value)
                              setEditingEmissaoIdx(null)
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                onUpdateEmissao(idx, e.currentTarget.value)
                                setEditingEmissaoIdx(null)
                              } else if (e.key === 'Escape') setEditingEmissaoIdx(null)
                            }}
                            className="bg-dark-950 border border-blue-500 rounded-lg px-2 py-1 text-xs text-white outline-none font-mono"
                          />
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span>{item.emissao ? formatDate(item.emissao) : '---'}</span>
                            <button
                              type="button"
                              onClick={() => setEditingEmissaoIdx(idx)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-dark-400 hover:text-blue-400 p-0.5"
                              title="Editar emissão"
                            >
                              <Edit2 size={11} />
                            </button>
                          </div>
                        )}
                      </td>

                      {/* Categoria */}
                      <td className="p-3.5">
                        {editingCatIdx === idx ? (
                          <SelectorCategoria
                            valorInicial={item.categoria || 'Materiais para Revenda'}
                            categorias={categoriasCA}
                            onCancel={() => setEditingCatIdx(null)}
                            onSelect={cat => {
                              onUpdateCategoria(idx, cat)
                              setEditingCatIdx(null)
                            }}
                          />
                        ) : (
                          <div
                            onClick={() => setEditingCatIdx(idx)}
                            className="flex items-center justify-between gap-1.5 bg-dark-950/70 border border-dark-700/60 hover:border-blue-500/50 rounded-xl px-2.5 py-1.5 cursor-pointer transition-all text-xs"
                          >
                            <span className="truncate text-dark-200">
                              {item.categoria || 'Materiais para Revenda'}
                            </span>
                            <ChevronDown size={11} className="text-dark-500 flex-shrink-0" />
                          </div>
                        )}
                      </td>

                      {/* Conta Financeira */}
                      <td className="p-3.5">
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
                            onClick={() => setEditingContaIdx(idx)}
                            className="flex items-center justify-between gap-1.5 bg-blue-950/20 border border-blue-500/30 hover:border-blue-500/60 rounded-xl px-2.5 py-1.5 cursor-pointer transition-all text-xs"
                          >
                            <span className="truncate text-blue-300 font-medium">
                              {item.conta_financeira || 'Selecionar conta...'}
                            </span>
                            <ChevronDown size={11} className="text-blue-400 flex-shrink-0" />
                          </div>
                        )}
                      </td>

                      {/* Descrição */}
                      <td className="p-3.5 text-dark-400">
                        {editingDescIdx === idx ? (
                          <input
                            type="text"
                            defaultValue={item.descricao || ''}
                            autoFocus
                            onBlur={e => {
                              onUpdateDescricao(idx, e.target.value)
                              setEditingDescIdx(null)
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                onUpdateDescricao(idx, e.currentTarget.value)
                                setEditingDescIdx(null)
                              } else if (e.key === 'Escape') setEditingDescIdx(null)
                            }}
                            className="w-full bg-dark-950 border border-blue-500 rounded-lg px-2 py-1 text-xs text-white outline-none"
                          />
                        ) : (
                          <div className="flex items-center gap-1.5 truncate max-w-[200px]">
                            <span className="truncate text-xs" title={item.descricao}>
                              {item.descricao || '---'}
                            </span>
                            <button
                              type="button"
                              onClick={() => setEditingDescIdx(idx)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-dark-400 hover:text-blue-400 p-0.5 flex-shrink-0"
                              title="Editar descrição"
                            >
                              <Edit2 size={11} />
                            </button>
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="p-3.5 text-center">
                        {item.valido ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md font-mono">
                            OK
                          </span>
                        ) : (
                          <div className="flex flex-col items-center">
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-md font-mono">
                              Erro
                            </span>
                            <p className="text-[9px] text-rose-400/80 max-w-[90px] leading-tight truncate mt-0.5" title={item.erros?.[0]}>
                              {item.erros?.[0]}
                            </p>
                          </div>
                        )}
                      </td>

                      {/* Ações */}
                      <td className="p-3.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {(item.anexo_url || item.metadata?.anexo_url) && (
                            <button
                              type="button"
                              onClick={() => visualizarAnexo(item.anexo_url || item.metadata?.anexo_url)}
                              className="text-emerald-400 hover:text-emerald-300 transition-colors p-1 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-lg cursor-pointer"
                              title="Visualizar Anexo/Comprovante"
                            >
                              <Paperclip size={13} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onRemover(idx)}
                            className="text-dark-500 hover:text-rose-400 hover:bg-rose-500/10 p-1 rounded-lg transition-colors cursor-pointer"
                            title="Excluir item"
                          >
                            <Trash2 size={13} />
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
      </div>
    </div>
  )
}
