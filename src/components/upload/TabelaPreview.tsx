import { useState, useEffect } from 'react'
import { formatCurrency, formatDate, visualizarAnexo } from '@/lib/utils'
import type { ContaPagarPreview } from '@/types'
import { CheckCircle, AlertCircle, Trash2, Edit2, ChevronDown, Paperclip, Check, RefreshCw, AlertTriangle, Landmark } from 'lucide-react'
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
  contasFinanceiras: ContaFinanceiraOpcao[]
  categoriasCA?: string[]
  onUpdateValor: (idx: number, novoValor: number) => void
  onUpdateVencimento: (idx: number, novaData: string) => void
  onUpdateEmissao: (idx: number, novaData: string) => void
  onUpdateDescricao: (idx: number, novaDesc: string) => void
}

function BadgeMatch({ 
  confianca, 
  score, 
  origem, 
  foiCorrigido 
}: { 
  confianca: string
  score: number
  origem?: string
  foiCorrigido?: boolean 
}) {
  // 1. Corrigido por Regra De-Para ou Ajuste Manual (AZUL)
  if (origem === 'depara' || origem === 'manual' || foiCorrigido) {
    return (
      <span 
        className="inline-flex items-center justify-center p-1 rounded-md text-primary-300 bg-primary-500/15 border border-primary-500/30 hover:bg-primary-500/25 hover:border-primary-500/50 shadow-xs cursor-help transition-all duration-150 flex-shrink-0" 
        title="Fornecedor conciliado por regra De-Para"
      >
        <RefreshCw size={12} className="stroke-[2.2]" />
      </span>
    )
  }

  // 2. Bateu direto com cadastro oficial do Conta Azul ou CNPJ (VERDE)
  if (origem === 'direto' || origem === 'cnpj' || confianca === 'exato' || score === 100) {
    return (
      <span 
        className="inline-flex items-center justify-center p-1 rounded-md text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 hover:bg-emerald-500/25 hover:border-emerald-500/50 shadow-xs cursor-help transition-all duration-150 flex-shrink-0" 
        title="Correspondência exata encontrada"
      >
        <Check size={12} className="stroke-[2.5]" />
      </span>
    )
  }

  // 3. Similaridade média/alta (AMARELO / SUGESTÃO)
  if (score >= 50) {
    return (
      <span 
        className="inline-flex items-center gap-1 text-xs text-amber-400 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-md font-medium shadow-xs whitespace-nowrap cursor-help flex-shrink-0" 
        title={`Sugestão por similaridade (${score}%) — revise antes de enviar`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
        🔍 {score}%
      </span>
    )
  }

  // 4. Não encontrado (AMARELO ALERTA)
  return (
    <span 
      className="inline-flex items-center justify-center p-1 rounded-md text-amber-400 bg-amber-500/15 border border-amber-500/30 hover:bg-amber-500/25 hover:border-amber-500/50 shadow-xs cursor-help transition-all duration-150 flex-shrink-0" 
      title="Fornecedor sem correspondência"
    >
      <AlertTriangle size={12} className="stroke-[2.2]" />
    </span>
  )
}


export default function TabelaPreview({
  dados, filtro, selecionados, onToggle, onToggleTodosLote, onRemover, onUpdateFornecedor, onUpdateCategoria,
  onRemoverLote, onUpdateCategoriaLote, onUpdateConta, onUpdateContaLote, onUpdateFornecedorLote, contasFinanceiras,
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

  const filtradosValidos = dadosFiltrados.filter(d => d.valido)
  const indicesFiltradosValidos = filtradosValidos.map(d => d.originalIdx as number)
  const todosFiltradosSelecionados = filtradosValidos.length > 0 && indicesFiltradosValidos.every(idx => selecionados.has(idx))
  const algunsFiltradosSelecionados = indicesFiltradosValidos.some(idx => selecionados.has(idx)) && !todosFiltradosSelecionados
  const temMatch = dados.some((d) => d.matchFornecedor)
  const exatosCount = dados.filter(d => {
    const m = d.matchFornecedor
    if (!m) return false
    const isDepara = m.origem === 'depara' || m.origem === 'manual' || (m.nomeOriginal !== m.nomeCorrigido && (m.confianca === 'exato' || m.confianca === 'alto'))
    return !isDepara && (m.origem === 'direto' || m.origem === 'cnpj' || m.confianca === 'exato' || m.score === 100)
  }).length

  const deparaCount = dados.filter(d => {
    const m = d.matchFornecedor
    if (!m) return false
    return m.origem === 'depara' || m.origem === 'manual' || (m.nomeOriginal !== m.nomeCorrigido && (m.confianca === 'exato' || m.confianca === 'alto'))
  }).length

  const naoEncontradosCount = dados.filter(d => {
    const m = d.matchFornecedor
    if (!m) return true
    const isDepara = m.origem === 'depara' || m.origem === 'manual' || (m.nomeOriginal !== m.nomeCorrigido && (m.confianca === 'exato' || m.confianca === 'alto'))
    const isExato = !isDepara && (m.origem === 'direto' || m.origem === 'cnpj' || m.confianca === 'exato' || m.score === 100)
    return !isDepara && !isExato
  }).length
  // Sempre que os filtros mudarem, desmarca automaticamente os itens que não estão mais visíveis/filtrados
  useEffect(() => {
    const indicesFiltradosValidosSet = new Set(indicesFiltradosValidos)
    const indicesParaDesmarcar: number[] = []

    selecionados.forEach((idx) => {
      if (!indicesFiltradosValidosSet.has(idx)) {
        indicesParaDesmarcar.push(idx)
      }
    })

    if (indicesParaDesmarcar.length > 0) {
      onToggleTodosLote(indicesParaDesmarcar, 'desmarcar')
    }
  }, [buscaFornecedor, buscaCategoria, buscaValor, filtro, onToggleTodosLote])

  return (
    <div className="bg-white dark:bg-dark-850/90 border border-slate-200/80 dark:border-dark-700/70 rounded-2xl overflow-hidden shadow-xs hover:shadow-md transition-shadow">
      {/* Header da tabela */}
      <div className="px-5 py-4 border-b border-slate-200 dark:border-dark-700 space-y-3.5">
        <div className="flex items-center justify-between flex-wrap gap-2.5">
          <p className="text-xs text-slate-500 dark:text-dark-400">
            Mostrando <span className="text-slate-900 dark:text-white font-bold font-mono">{dadosFiltrados.length}</span> de <span className="text-slate-900 dark:text-white font-bold font-mono">{dados.length}</span> registros
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            {exatosCount > 0 && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 px-2.5 py-1 rounded-full font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                {exatosCount} exatos
              </span>
            )}
            {deparaCount > 0 && (
              <span className="flex items-center gap-1.5 text-xs text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-500/15 border border-brand-200 dark:border-brand-500/30 px-2.5 py-1 rounded-full font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                {deparaCount} corrigidos
              </span>
            )}
            {naoEncontradosCount > 0 && (
              <span className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 px-2.5 py-1 rounded-full font-bold">
                <AlertCircle size={11} />
                {naoEncontradosCount} não encontrados
              </span>
            )}
            <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-semibold ml-1">
              <CheckCircle size={13} />
              {dados.filter((d) => d.valido).length} válidos
            </span>
            {dados.filter((d) => !d.valido).length > 0 && (
              <span className="flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400 font-semibold">
                <AlertCircle size={13} />
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
              className="h-9 w-full bg-slate-50 dark:bg-dark-900 border border-slate-200 dark:border-dark-700 rounded-xl px-3 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-dark-500 outline-none focus:border-brand-500 focus:bg-white dark:focus:bg-dark-900 focus:ring-1 focus:ring-brand-500 transition-colors shadow-2xs"
            />
          </div>
          <div className="relative">
            <input 
              type="text" 
              placeholder="Filtrar categoria..."
              value={buscaCategoria}
              onChange={(e) => setBuscaCategoria(e.target.value)}
              className="h-9 w-full bg-slate-50 dark:bg-dark-900 border border-slate-200 dark:border-dark-700 rounded-xl px-3 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-dark-500 outline-none focus:border-brand-500 focus:bg-white dark:focus:bg-dark-900 focus:ring-1 focus:ring-brand-500 transition-colors shadow-2xs"
            />
          </div>
          <div className="relative">
            <input 
              type="text" 
              placeholder="Filtrar valor..."
              value={buscaValor}
              onChange={(e) => setBuscaValor(e.target.value)}
              className="h-9 w-full bg-slate-50 dark:bg-dark-900 border border-slate-200 dark:border-dark-700 rounded-xl px-3 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-dark-500 outline-none focus:border-brand-500 focus:bg-white dark:focus:bg-dark-900 focus:ring-1 focus:ring-brand-500 transition-colors shadow-2xs"
            />
          </div>
        </div>

        {/* Painel de Edição em Lote */}
        {selecionados.size > 0 && (
          <div className="bg-brand-50/80 dark:bg-brand-950/60 border border-brand-200/80 dark:border-brand-500/30 rounded-xl p-3 flex items-center justify-between flex-wrap gap-2.5 animate-in slide-in-from-top-2">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs font-bold text-brand-700 dark:text-brand-300 px-2.5 py-1 rounded-full bg-brand-100 dark:bg-brand-500/20">{selecionados.size} selecionados</span>
              <div className="h-4 w-px bg-brand-200 dark:bg-dark-600 hidden sm:block" />
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
                        className="bg-white dark:bg-dark-900 border border-slate-200 dark:border-dark-600 rounded-lg px-2.5 py-1 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-dark-500 outline-none w-[160px] focus:border-brand-500 shadow-2xs"
                      />
                      {showBulkList && (
                        <div className="absolute z-50 mt-1 w-full bg-white dark:bg-dark-800 border border-slate-200 dark:border-dark-600 rounded-xl shadow-2xl overflow-hidden max-h-[200px] overflow-y-auto p-1 divide-y divide-slate-100 dark:divide-dark-700/60">
                          {((categoriasCA && categoriasCA.length > 0) ? categoriasCA : LISTA_CATEGORIAS_FLAT).filter(c => c.toLowerCase().includes(loteCategoria.toLowerCase())).slice(0, 10).map((cat, i) => (
                            <button
                              key={i}
                              onClick={() => { setLoteCategoria(cat); setShowBulkList(false) }}
                              className="w-full text-left px-2.5 py-1.5 text-xs text-slate-700 dark:text-white hover:bg-brand-50 dark:hover:bg-brand-600/20 rounded-md transition-colors truncate"
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
                      className="bg-brand-600 hover:bg-brand-500 text-white px-3 py-1 rounded-lg text-xs font-semibold disabled:opacity-50 transition-all cursor-pointer shadow-xs"
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
                        className="bg-white dark:bg-dark-900 border border-slate-200 dark:border-dark-600 rounded-lg px-2.5 py-1 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-dark-500 outline-none w-[160px] focus:border-brand-500 shadow-2xs"
                      />
                      {showBulkContaList && (
                        <div className="absolute z-50 mt-1 w-full bg-white dark:bg-dark-800 border border-slate-200 dark:border-dark-600 rounded-xl shadow-2xl overflow-hidden max-h-[200px] overflow-y-auto p-1 divide-y divide-slate-100 dark:divide-dark-700/60">
                          {contasFinanceiras.filter(c => c.descricao.toLowerCase().includes(loteConta.toLowerCase())).map((c) => (
                            <button
                              key={c.id}
                              onClick={() => { setLoteConta(c.descricao); setShowBulkContaList(false) }}
                              className="w-full text-left px-2.5 py-1.5 text-xs text-slate-700 dark:text-white hover:bg-brand-50 dark:hover:bg-brand-600/20 rounded-md transition-colors truncate"
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
                      className="bg-brand-600 hover:bg-brand-500 text-white px-3 py-1 rounded-lg text-xs font-semibold disabled:opacity-50 transition-all cursor-pointer shadow-xs"
                    >
                      Aplicar
                    </button>
                  </div>

                  {/* Limpar Fornecedor em Lote */}
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Limpar o fornecedor de todos os ${selecionados.size} itens selecionados?`)) {
                        onUpdateFornecedorLote(Array.from(selecionados), '')
                      }
                    }}
                    className="bg-amber-600 hover:bg-amber-500 text-white px-2.5 py-1 rounded-lg text-xs font-semibold transition-all shadow-xs cursor-pointer"
                    title="Remove o fornecedor selecionado para enviar em branco"
                  >
                    Limpar Fornecedor
                  </button>

                  <button onClick={() => { setShowBulkEdit(false); setShowBulkList(false); setShowBulkContaList(false) }} className="text-slate-500 dark:text-dark-400 hover:text-slate-900 dark:hover:text-white px-2 py-1 rounded-lg text-xs transition-all cursor-pointer">Fechar</button>
                </div>
              ) : (
                <button 
                  onClick={() => setShowBulkEdit(true)}
                  className="text-xs text-brand-700 dark:text-brand-300 hover:text-brand-900 dark:hover:text-white hover:bg-brand-100 dark:hover:bg-brand-600/30 px-2.5 py-1 rounded-lg border border-brand-200 dark:border-brand-500/30 font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
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
              className="text-xs text-rose-600 dark:text-rose-400 hover:text-white hover:bg-rose-600 px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-500/30 font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
            >
              <Trash2 size={12} /> Excluir selecionados
            </button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full min-w-[840px] text-xs border-collapse table-fixed select-text">
          <colgroup>
            <col style={{ width: '32px' }} />
            <col style={{ width: 'auto' }} />
            <col style={{ width: '90px' }} />
            <col style={{ width: '84px' }} />
            <col style={{ width: '88px' }} />
            <col style={{ width: '180px' }} />
            <col style={{ width: '160px' }} />
            <col style={{ width: '92px' }} />
            <col style={{ width: '56px' }} />
            <col style={{ width: '36px' }} />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-slate-100/95 dark:bg-dark-900/95 backdrop-blur-md text-slate-600 dark:text-dark-400 uppercase text-[10px] font-bold tracking-wider border-b border-slate-200 dark:border-dark-700/80">
            <tr>
              <th className="py-3 px-2 text-center">
                <input
                  type="checkbox"
                  checked={todosFiltradosSelecionados}
                  ref={(el) => { if (el) el.indeterminate = algunsFiltradosSelecionados }}
                  onChange={() => {
                    if (todosFiltradosSelecionados) {
                      onToggleTodosLote(indicesFiltradosValidos, 'desmarcar')
                    } else {
                      onToggleTodosLote(indicesFiltradosValidos, 'marcar')
                    }
                  }}
                  className="w-3.5 h-3.5 rounded border-slate-300 dark:border-dark-500 bg-white dark:bg-dark-700 text-brand-600 focus:ring-brand-500 cursor-pointer"
                />
              </th>
              <th className="py-3 px-2 text-left text-slate-900 dark:text-white font-bold">Fornecedor</th>
              <th className="py-3 px-2 text-right text-slate-700 dark:text-dark-300 font-semibold">Valor</th>
              <th className="py-3 px-1 text-center text-slate-700 dark:text-dark-300 font-semibold">Vencimento</th>
              <th className="py-3 px-1 text-center text-slate-700 dark:text-dark-300 font-semibold">Competência</th>
              <th className="py-3 px-2 text-left text-slate-700 dark:text-dark-300 font-semibold">Categoria</th>
              <th className="py-3 px-2 text-left text-slate-700 dark:text-dark-300 font-semibold">Conta</th>
              <th className="py-3 px-2 text-left text-slate-700 dark:text-dark-300 font-semibold">Descrição</th>
              <th className="py-3 px-1 text-center text-slate-700 dark:text-dark-300 font-semibold">Status</th>
              <th className="py-3 px-1 text-center"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/70 dark:divide-dark-800/60">
            {dadosFiltrados.map((item) => {
              const idx = item.originalIdx ?? 0
              const match = item.matchFornecedor
              const foiCorrigido = match && (
                match.origem === 'depara' || 
                match.origem === 'manual' || 
                (match.nomeOriginal !== match.nomeCorrigido && (match.confianca === 'exato' || match.confianca === 'alto'))
              )
              const isEditing = 
                editingIdx === idx ||
                editingCatIdx === idx ||
                editingContaIdx === idx ||
                editingValorIdx === idx ||
                editingVencIdx === idx ||
                editingEmissaoIdx === idx ||
                editingDescIdx === idx

              return (
                <tr
                  key={idx}
                  className={cn(
                    'group/row relative border-b border-slate-200/70 dark:border-dark-700/40 transition-colors duration-150',
                    !item.valido 
                      ? 'bg-rose-50/60 dark:bg-rose-500/5 hover:bg-rose-100/60 dark:hover:bg-rose-500/10'
                      : selecionados.has(idx)
                        ? 'bg-brand-50/80 dark:bg-brand-500/10 hover:bg-brand-100/60 dark:hover:bg-brand-500/20'
                        : 'even:bg-slate-50/50 dark:even:bg-white/[0.015] hover:bg-slate-100/60 dark:hover:bg-white/[0.035]',
                    isEditing && 'bg-slate-100/90 dark:bg-dark-800/95 ring-1 ring-inset ring-brand-500/30'
                  )}
                >
                  <td className="relative py-3 px-1 text-center">
                    {/* Barra vertical fina na extremidade esquerda durante o hover ou em edição */}
                    <span
                      aria-hidden="true"
                      className={cn(
                        'absolute left-0 top-0 bottom-0 w-[3px] transition-all duration-150 rounded-r-[1px] pointer-events-none',
                        isEditing
                          ? 'bg-brand-500'
                          : 'bg-transparent group-hover/row:bg-brand-500/60'
                      )}
                    />
                    <input
                      type="checkbox"
                      checked={selecionados.has(idx)}
                      onChange={() => onToggle(idx)}
                      className="w-3.5 h-3.5 rounded border-slate-300 dark:border-dark-500 bg-white dark:bg-dark-700 text-brand-600 focus:ring-brand-500 cursor-pointer"
                    />
                  </td>
                  <td className="py-3 px-2 overflow-hidden">
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
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={cn(
                              'font-semibold text-xs sm:text-[13px] block line-clamp-2 leading-snug break-words',
                              item.valido ? 'text-slate-900 dark:text-white' : 'text-rose-600 dark:text-red-400 font-bold'
                            )}
                            title={item.fornecedor}
                          >
                            {item.fornecedor}
                          </span>
                          {match && (
                            <BadgeMatch 
                              confianca={match.confianca} 
                              score={match.score} 
                              origem={match.origem} 
                              foiCorrigido={foiCorrigido} 
                            />
                          )}
                          <button 
                            onClick={() => setEditingIdx(idx)}
                            className="opacity-40 group-hover:opacity-100 transition-all text-slate-400 dark:text-dark-400 hover:text-brand-600 dark:hover:text-brand-300 hover:scale-110 p-1 rounded cursor-pointer"
                            title="Editar ou corrigir fornecedor"
                          >
                            <Edit2 size={12} />
                          </button>
                        </div>
                        {foiCorrigido && match.nomeOriginal !== item.fornecedor && (
                          <span className="text-xs text-slate-500 dark:text-dark-400 flex items-center gap-1 mt-0.5 font-mono">
                            original: {match.nomeOriginal}
                          </span>
                        )}
                        {item.ca_duplicidade?.encontrado && (
                          <div className="mt-1 flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/15 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-500/30 w-max cursor-help" title={`Possível duplicidade no Conta Azul:\nStatus: ${item.ca_duplicidade.status}\nData: ${item.ca_duplicidade.vencimento}\nValor: R$ ${item.ca_duplicidade.valor}\nFornecedor: ${item.ca_duplicidade.fornecedor}`}>
                            <AlertCircle size={10} />
                            <span>Possível Duplicidade CA</span>
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-2 text-right font-mono text-slate-900 dark:text-white text-xs sm:text-[13px] font-bold tabular-nums whitespace-nowrap">
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
                        className="w-full bg-white dark:bg-dark-900 border border-brand-500 rounded px-2 py-1 text-xs text-right outline-none text-slate-900 dark:text-white"
                      />
                    ) : (
                      <div className="group flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setEditingValorIdx(idx)}
                          className="opacity-40 group-hover:opacity-100 transition-all text-slate-400 dark:text-dark-400 hover:text-brand-600 dark:hover:text-brand-300 hover:scale-110 p-0.5 rounded cursor-pointer"
                          title="Editar valor"
                        >
                          <Edit2 size={11} />
                        </button>
                        <span>{formatCurrency(item.valor)}</span>
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-1 text-slate-600 dark:text-dark-300 text-xs font-mono text-center whitespace-nowrap tabular-nums">
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
                        className="w-full bg-white dark:bg-dark-900 border border-brand-500 rounded px-2 py-1 text-xs outline-none text-slate-900 dark:text-white"
                      />
                    ) : (
                      <div className="group flex items-center justify-center gap-1">
                        <span>{item.vencimento ? formatDate(item.vencimento) : '---'}</span>
                        <button
                          onClick={() => setEditingVencIdx(idx)}
                          className="opacity-40 group-hover:opacity-100 transition-all text-slate-400 dark:text-dark-400 hover:text-brand-600 dark:hover:text-brand-300 hover:scale-110 p-0.5 rounded cursor-pointer"
                          title="Editar vencimento"
                        >
                          <Edit2 size={11} />
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-1 text-slate-500 dark:text-dark-400 text-xs font-mono text-center whitespace-nowrap tabular-nums">
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
                        className="w-full bg-white dark:bg-dark-900 border border-brand-500 rounded px-2 py-1 text-xs outline-none text-slate-900 dark:text-white"
                      />
                    ) : (
                      <div className="group flex items-center justify-center gap-1">
                        <span>{item.emissao ? formatDate(item.emissao) : '---'}</span>
                        <button
                          onClick={() => setEditingEmissaoIdx(idx)}
                          className="opacity-40 group-hover:opacity-100 transition-all text-slate-400 dark:text-dark-400 hover:text-brand-600 dark:hover:text-brand-300 hover:scale-110 p-0.5 rounded cursor-pointer"
                          title="Editar competência (emissão)"
                        >
                          <Edit2 size={11} />
                        </button>
                      </div>
                    )}
                  </td>
                  <td className={cn("py-3 px-1.5 text-slate-700 dark:text-dark-200 text-xs", editingCatIdx === idx ? "overflow-visible relative" : "overflow-hidden")}>
                    {editingCatIdx === idx ? (
                      <SelectorCategoria 
                        valorInicial={item.categoria || 'Materiais para Revenda'}
                        categorias={categoriasCA}
                        onCancel={() => setEditingCatIdx(null)}
                        onSelect={(cat) => {
                          onUpdateCategoria(idx, cat)
                          setEditingCatIdx(null)
                        }}
                      />
                    ) : (
                      <div 
                        className="group flex items-center justify-between gap-1.5 bg-slate-100 dark:bg-dark-900/60 border border-slate-200 dark:border-dark-700/60 hover:border-brand-500 dark:hover:border-brand-500/60 hover:bg-slate-200/70 dark:hover:bg-dark-800 rounded-lg px-2.5 py-1.5 cursor-pointer transition-all"
                        onClick={() => setEditingCatIdx(idx)}
                        title={item.categoria || 'Materiais para Revenda'}
                      >
                        <span className="truncate text-slate-800 dark:text-dark-200 font-medium" title={item.categoria || 'Materiais para Revenda'}>
                          {item.categoria || 'Materiais para Revenda'}
                        </span>
                        <ChevronDown size={11} className="text-slate-400 dark:text-dark-500 group-hover:text-slate-600 dark:group-hover:text-dark-300 shrink-0" />
                      </div>
                    )}
                  </td>
                  <td className={cn("py-3 px-1.5 text-brand-700 dark:text-blue-300 text-xs", editingContaIdx === idx ? "overflow-visible relative" : "overflow-hidden")}>
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
                        className="group flex items-center justify-between gap-1.5 bg-brand-50/60 dark:bg-blue-950/20 border border-brand-200/80 dark:border-blue-500/25 hover:border-brand-400 dark:hover:border-blue-400/60 hover:bg-brand-100/50 dark:hover:bg-blue-900/30 rounded-lg px-2.5 py-1.5 cursor-pointer transition-all"
                        onClick={() => setEditingContaIdx(idx)}
                        title={item.conta_financeira || 'Selecionar conta...'}
                      >
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <Landmark size={12} className="text-brand-600 dark:text-blue-400 shrink-0" />
                          <span className="truncate text-brand-800 dark:text-blue-300 font-medium" title={item.conta_financeira || 'Selecionar conta...'}>
                            {item.conta_financeira || 'Selecionar conta...'}
                          </span>
                        </div>
                        <ChevronDown size={11} className="text-brand-500 dark:text-blue-500 group-hover:text-brand-700 dark:group-hover:text-blue-300 shrink-0 ml-1" />
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-1.5 text-slate-500 dark:text-dark-300 text-xs font-mono overflow-hidden">
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
                        className="w-full bg-white dark:bg-dark-900 border border-brand-500 rounded px-2 py-1 text-xs outline-none text-slate-900 dark:text-white"
                      />
                    ) : (
                      <div className="group flex items-center gap-1.5 truncate">
                        <span className="truncate" title={item.descricao}>{item.descricao || '---'}</span>
                        <button
                          onClick={() => setEditingDescIdx(idx)}
                          className="opacity-40 group-hover:opacity-100 transition-all text-slate-400 dark:text-dark-400 hover:text-brand-600 dark:hover:text-brand-300 hover:scale-110 p-0.5 rounded shrink-0 cursor-pointer"
                          title="Editar descrição"
                        >
                          <Edit2 size={11} />
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-1 text-center">
                    {item.valido ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30">
                        OK
                      </span>
                    ) : (
                      <div className="flex flex-col items-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30">
                          Erro
                        </span>
                        <p className="text-[9px] text-rose-600 dark:text-red-400/80 max-w-[100px] leading-tight mt-0.5">
                          {item.erros?.[0]}
                        </p>
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-1 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {(item.anexo_url || item.metadata?.anexo_url) && (
                        <button
                          type="button"
                          onClick={() => visualizarAnexo(item.anexo_url || item.metadata?.anexo_url)}
                          className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-white hover:bg-emerald-50 dark:hover:bg-emerald-600/30 border border-emerald-200 dark:border-emerald-500/20 p-1.5 rounded-lg transition-all cursor-pointer"
                          title="Visualizar Anexo/Comprovante"
                        >
                          <Paperclip size={13} />
                        </button>
                      )}
                      <button
                        onClick={() => onRemover(idx)}
                        className="text-slate-400 dark:text-dark-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/15 p-1.5 rounded-lg transition-all cursor-pointer"
                        title="Excluir"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
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
