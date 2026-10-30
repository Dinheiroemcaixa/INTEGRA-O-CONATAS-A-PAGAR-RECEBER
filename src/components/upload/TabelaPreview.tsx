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
        className="inline-flex items-center justify-center p-1 rounded-md text-[var(--dx-link)] bg-[var(--dx-selected)] border border-[var(--dx-line)] hover:border-[var(--dx-link)] cursor-help transition-all duration-150 flex-shrink-0" 
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
        className="inline-flex items-center justify-center p-1 rounded-md text-[var(--dx-ok)] bg-[var(--dx-ok-bg)] border border-[var(--dx-ok)]/30 hover:border-[var(--dx-ok)] cursor-help transition-all duration-150 flex-shrink-0" 
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
        className="inline-flex items-center gap-1 text-xs text-[var(--dx-warn)] bg-[var(--dx-warn-bg)] border border-[var(--dx-warn)]/30 px-2 py-0.5 rounded-md font-semibold whitespace-nowrap cursor-help flex-shrink-0" 
        title={`Sugestão por similaridade (${score}%) — revise antes de enviar`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--dx-warn)]" />
        🔍 {score}%
      </span>
    )
  }

  // 4. Não encontrado (AMARELO ALERTA)
  return (
    <span 
      className="inline-flex items-center justify-center p-1 rounded-md text-[var(--dx-warn)] bg-[var(--dx-warn-bg)] border border-[var(--dx-warn)]/30 hover:border-[var(--dx-warn)] cursor-help transition-all duration-150 flex-shrink-0" 
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
    <div className="dx-panel bg-[var(--dx-card)] border border-[var(--dx-line)] rounded-[16px] overflow-hidden shadow-[var(--dx-shadow-card)]">
      {/* Header da tabela */}
      <div className={cn("px-5 py-3.5 border-b border-[var(--dx-line)]", selecionados.size === 0 && "hidden")}>
        <div className="hidden">
          <p className="text-xs text-[var(--dx-muted)]">
            Mostrando <span className="text-[var(--dx-ink)] font-bold tabular-nums">{dadosFiltrados.length}</span> de <span className="text-[var(--dx-ink)] font-bold tabular-nums">{dados.length}</span> registros
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            {exatosCount > 0 && (
              <span className="flex items-center gap-1.5 text-xs text-[var(--dx-ok)] bg-[var(--dx-ok-bg)] border border-[var(--dx-ok)]/30 px-2.5 py-1 rounded-full font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--dx-ok)]" />
                {exatosCount} exatos
              </span>
            )}
            {deparaCount > 0 && (
              <span className="flex items-center gap-1.5 text-xs text-[var(--dx-link)] bg-[var(--dx-selected)] border border-[var(--dx-line)] px-2.5 py-1 rounded-full font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--dx-link)]" />
                {deparaCount} corrigidos
              </span>
            )}
            {naoEncontradosCount > 0 && (
              <span className="flex items-center gap-1.5 text-xs text-[var(--dx-warn)] bg-[var(--dx-warn-bg)] border border-[var(--dx-warn)]/30 px-2.5 py-1 rounded-full font-semibold">
                <AlertCircle size={11} />
                {naoEncontradosCount} não encontrados
              </span>
            )}
            <span className="flex items-center gap-1.5 text-xs text-[var(--dx-ok)] font-semibold ml-1">
              <CheckCircle size={13} />
              {dados.filter((d) => d.valido).length} válidos
            </span>
            {dados.filter((d) => !d.valido).length > 0 && (
              <span className="flex items-center gap-1.5 text-xs text-[var(--dx-bad)] font-semibold">
                <AlertCircle size={13} />
                {dados.filter((d) => !d.valido).length} com erro
              </span>
            )}
          </div>
        </div>

        {/* Barra de Filtros Pesquisa */}
        <div className="hidden">
          <div className="relative">
            <input 
              type="text" 
              placeholder="Filtrar fornecedor..."
              value={buscaFornecedor}
              onChange={(e) => setBuscaFornecedor(e.target.value)}
              className="dx-control"
            />
          </div>
          <div className="relative">
            <input 
              type="text" 
              placeholder="Filtrar categoria..."
              value={buscaCategoria}
              onChange={(e) => setBuscaCategoria(e.target.value)}
              className="dx-control"
            />
          </div>
          <div className="relative">
            <input 
              type="text" 
              placeholder="Filtrar valor..."
              value={buscaValor}
              onChange={(e) => setBuscaValor(e.target.value)}
              className="dx-control"
            />
          </div>
        </div>

        {/* Painel de Edição em Lote */}
        {selecionados.size > 0 && (
          <div className="gp-selbar bg-[var(--dx-selected)] border border-[var(--dx-line)] rounded-[14px] p-3 flex items-center justify-between flex-wrap gap-2.5 animate-in slide-in-from-top-2">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="dx-chip text-xs font-bold text-[var(--dx-link)] px-2.5 py-1 rounded-full bg-[var(--dx-card)] border border-[var(--dx-line)]">{selecionados.size} selecionados</span>
              <div className="h-4 w-px bg-[var(--dx-line)] hidden sm:block" />
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
                        className="dx-control !h-8 !w-[160px] !px-2.5 !text-xs"
                      />
                      {showBulkList && (
                        <div className="absolute z-50 mt-1 w-full bg-[var(--dx-card)] border border-[var(--dx-line)] rounded-[14px] shadow-[var(--dx-shadow-pop)] overflow-hidden max-h-[200px] overflow-y-auto p-1 divide-y divide-[var(--dx-line-soft)]">
                          {((categoriasCA && categoriasCA.length > 0) ? categoriasCA : LISTA_CATEGORIAS_FLAT).filter(c => c.toLowerCase().includes(loteCategoria.toLowerCase())).slice(0, 10).map((cat, i) => (
                            <button
                              key={i}
                              onClick={() => { setLoteCategoria(cat); setShowBulkList(false) }}
                              className="w-full text-left px-2.5 py-1.5 text-xs text-[var(--dx-ink)] hover:bg-[var(--dx-selected)] hover:text-[var(--dx-link)] rounded-md transition-colors truncate"
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
                      className="dx-btn is-sm is-primary"
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
                        className="dx-control !h-8 !w-[160px] !px-2.5 !text-xs"
                      />
                      {showBulkContaList && (
                        <div className="absolute z-50 mt-1 w-full bg-[var(--dx-card)] border border-[var(--dx-line)] rounded-[14px] shadow-[var(--dx-shadow-pop)] overflow-hidden max-h-[200px] overflow-y-auto p-1 divide-y divide-[var(--dx-line-soft)]">
                          {contasFinanceiras.filter(c => c.descricao.toLowerCase().includes(loteConta.toLowerCase())).map((c) => (
                            <button
                              key={c.id}
                              onClick={() => { setLoteConta(c.descricao); setShowBulkContaList(false) }}
                              className="w-full text-left px-2.5 py-1.5 text-xs text-[var(--dx-ink)] hover:bg-[var(--dx-selected)] hover:text-[var(--dx-link)] rounded-md transition-colors truncate"
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
                      className="dx-btn is-sm is-primary"
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
                    className="dx-btn is-sm bg-[var(--dx-warn-bg)] text-[var(--dx-warn)] border-[var(--dx-warn)]/40 hover:bg-[var(--dx-warn-bg)]"
                    title="Remove o fornecedor selecionado para enviar em branco"
                  >
                    Limpar Fornecedor
                  </button>

                  <button onClick={() => { setShowBulkEdit(false); setShowBulkList(false); setShowBulkContaList(false) }} className="dx-btn is-sm">Fechar</button>
                </div>
              ) : (
                <button 
                  onClick={() => setShowBulkEdit(true)}
                  className="dx-btn is-sm text-[var(--dx-link)] border-[var(--dx-line)]"
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
              className="dx-btn is-sm is-danger"
            >
              <Trash2 size={12} /> Excluir selecionados
            </button>
          </div>
        )}
      </div>

      <div className="dx-table-wrap overflow-x-auto custom-scrollbar">
        <table className="dx-table w-full min-w-[840px] text-xs border-collapse table-fixed select-text">
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
          <thead className="sticky top-0 z-10 bg-[var(--dx-soft)] text-[var(--dx-muted)] text-[11px] font-semibold border-b border-[var(--dx-line)]">
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
                  className="dx-check"
                />
              </th>
              <th className="py-3 px-2 text-left text-[var(--dx-muted)] font-semibold">Fornecedor</th>
              <th className="py-3 px-2 text-right text-[var(--dx-muted)] font-semibold">Valor</th>
              <th className="py-3 px-1 text-center text-[var(--dx-muted)] font-semibold">Vencimento</th>
              <th className="py-3 px-1 text-center text-[var(--dx-muted)] font-semibold">Competência</th>
              <th className="py-3 px-2 text-left text-[var(--dx-muted)] font-semibold">Categoria</th>
              <th className="py-3 px-2 text-left text-[var(--dx-muted)] font-semibold">Conta</th>
              <th className="py-3 px-2 text-left text-[var(--dx-muted)] font-semibold">Descrição</th>
              <th className="py-3 px-1 text-center text-[var(--dx-muted)] font-semibold">Status</th>
              <th className="py-3 px-1 text-center"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--dx-line-soft)]">
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
                    'group/row relative border-b border-[var(--dx-line-soft)] transition-colors duration-150',
                    !item.valido 
                      ? 'bg-[var(--dx-bad-bg)] hover:bg-[var(--dx-bad-bg)]'
                      : selecionados.has(idx)
                        ? 'is-selected bg-[var(--dx-selected)] hover:bg-[var(--dx-selected)]'
                        : 'hover:bg-[var(--dx-soft)]',
                    isEditing && 'z-20 bg-[var(--dx-selected)] ring-1 ring-inset ring-[var(--dx-link)]/40'
                  )}
                >
                  <td className="relative py-3 px-1 text-center">
                    {/* Barra vertical fina na extremidade esquerda durante o hover ou em edição */}
                    <span
                      aria-hidden="true"
                      className={cn(
                        'absolute left-0 top-0 bottom-0 w-[3px] transition-all duration-150 rounded-r-[1px] pointer-events-none',
                        isEditing || selecionados.has(idx)
                          ? 'bg-[var(--dx-link)]'
                          : 'bg-transparent group-hover/row:bg-[var(--dx-link)]/60'
                      )}
                    />
                    <input
                      type="checkbox"
                      checked={selecionados.has(idx)}
                      onChange={() => onToggle(idx)}
                      className="dx-check"
                    />
                  </td>
                  <td className={cn(
                    "py-3 px-2",
                    editingIdx === idx ? "overflow-visible relative z-30" : "overflow-hidden"
                  )}>
                    {editingIdx === idx ? (
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
                              'dx-cell-name font-semibold text-xs sm:text-[13px] block line-clamp-2 leading-snug break-words',
                              item.valido ? 'text-[var(--dx-ink)]' : 'text-[var(--dx-bad)] font-bold'
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
                            className="opacity-40 group-hover:opacity-100 transition-all text-[var(--dx-muted)] hover:text-[var(--dx-link)] hover:scale-110 p-1 rounded cursor-pointer"
                            title="Editar ou corrigir fornecedor"
                          >
                            <Edit2 size={12} />
                          </button>
                        </div>
                        {foiCorrigido && match.nomeOriginal !== item.fornecedor && (
                          <span className="text-xs text-[var(--dx-muted)] flex items-center gap-1 mt-0.5">
                            original: {match.nomeOriginal}
                          </span>
                        )}
                        {item.ca_duplicidade?.encontrado && (
                          <div className="mt-1 flex items-center gap-1 text-[11px] text-[var(--dx-warn)] bg-[var(--dx-warn-bg)] px-2 py-0.5 rounded-md border border-[var(--dx-warn)]/30 w-max cursor-help" title={`Possível duplicidade no Conta Azul:\nStatus: ${item.ca_duplicidade.status}\nData: ${item.ca_duplicidade.vencimento}\nValor: R$ ${item.ca_duplicidade.valor}\nFornecedor: ${item.ca_duplicidade.fornecedor}`}>
                            <AlertCircle size={10} />
                            <span>Possível Duplicidade CA</span>
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-2 text-right text-[var(--dx-ink)] text-xs sm:text-[13px] font-bold tabular-nums whitespace-nowrap">
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
                        className="dx-control !h-7 !px-2 !text-xs text-right"
                      />
                    ) : (
                      <div className="group flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setEditingValorIdx(idx)}
                          className="opacity-40 group-hover:opacity-100 transition-all text-[var(--dx-muted)] hover:text-[var(--dx-link)] hover:scale-110 p-0.5 rounded cursor-pointer"
                          title="Editar valor"
                        >
                          <Edit2 size={11} />
                        </button>
                        <span>{formatCurrency(item.valor)}</span>
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-1 text-[var(--dx-muted)] text-xs text-center whitespace-nowrap tabular-nums">
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
                        className="dx-control !h-7 !px-2 !text-xs"
                      />
                    ) : (
                      <div className="group flex items-center justify-center gap-1">
                        <span>{item.vencimento ? formatDate(item.vencimento) : '---'}</span>
                        <button
                          onClick={() => setEditingVencIdx(idx)}
                          className="opacity-40 group-hover:opacity-100 transition-all text-[var(--dx-muted)] hover:text-[var(--dx-link)] hover:scale-110 p-0.5 rounded cursor-pointer"
                          title="Editar vencimento"
                        >
                          <Edit2 size={11} />
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-1 text-[var(--dx-muted)] text-xs text-center whitespace-nowrap tabular-nums">
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
                        className="dx-control !h-7 !px-2 !text-xs"
                      />
                    ) : (
                      <div className="group flex items-center justify-center gap-1">
                        <span>{item.emissao ? formatDate(item.emissao) : '---'}</span>
                        <button
                          onClick={() => setEditingEmissaoIdx(idx)}
                          className="opacity-40 group-hover:opacity-100 transition-all text-[var(--dx-muted)] hover:text-[var(--dx-link)] hover:scale-110 p-0.5 rounded cursor-pointer"
                          title="Editar competência (emissão)"
                        >
                          <Edit2 size={11} />
                        </button>
                      </div>
                    )}
                  </td>
                  <td className={cn("py-3 px-1.5 text-[var(--dx-ink)] text-xs", editingCatIdx === idx ? "overflow-visible relative z-30" : "overflow-hidden")}>
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
                        className="dx-pill group flex items-center justify-between gap-1.5 w-full bg-[var(--dx-chip)] border border-[var(--dx-line)] hover:border-[var(--dx-control-line)] rounded-lg px-2.5 py-1.5 cursor-pointer transition-all"
                        onClick={() => setEditingCatIdx(idx)}
                        title={item.categoria || 'Materiais para Revenda'}
                      >
                        <span className="truncate text-[var(--dx-ink)] font-medium" title={item.categoria || 'Materiais para Revenda'}>
                          {item.categoria || 'Materiais para Revenda'}
                        </span>
                        <ChevronDown size={11} className="text-[var(--dx-muted)] group-hover:text-[var(--dx-ink)] shrink-0" />
                      </div>
                    )}
                  </td>
                  <td className={cn("py-3 px-1.5 text-[var(--dx-link)] text-xs", editingContaIdx === idx ? "overflow-visible relative z-30" : "overflow-hidden")}>
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
                        className="dx-pill is-accent group flex items-center justify-between gap-1.5 w-full bg-[var(--dx-selected)] border border-[var(--dx-line)] hover:border-[var(--dx-link)] rounded-lg px-2.5 py-1.5 cursor-pointer transition-all"
                        onClick={() => setEditingContaIdx(idx)}
                        title={item.conta_financeira || 'Selecionar conta...'}
                      >
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <Landmark size={12} className="text-[var(--dx-link)] shrink-0" />
                          <span className="truncate text-[var(--dx-link)] font-medium" title={item.conta_financeira || 'Selecionar conta...'}>
                            {item.conta_financeira || 'Selecionar conta...'}
                          </span>
                        </div>
                        <ChevronDown size={11} className="text-[var(--dx-link)] shrink-0 ml-1" />
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-1.5 text-[var(--dx-muted)] text-xs overflow-hidden">
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
                        className="dx-control !h-7 !px-2 !text-xs"
                      />
                    ) : (
                      <div className="group flex items-center gap-1.5 truncate">
                        <span className="truncate" title={item.descricao}>{item.descricao || '---'}</span>
                        <button
                          onClick={() => setEditingDescIdx(idx)}
                          className="opacity-40 group-hover:opacity-100 transition-all text-[var(--dx-muted)] hover:text-[var(--dx-link)] hover:scale-110 p-0.5 rounded shrink-0 cursor-pointer"
                          title="Editar descrição"
                        >
                          <Edit2 size={11} />
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-1 text-center">
                    {item.valido ? (
                      <span className="dx-status is-ok inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--dx-ok-bg)] text-[var(--dx-ok)]">
                        OK
                      </span>
                    ) : (
                      <div className="flex flex-col items-center">
                        <span className="dx-status is-bad inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--dx-bad-bg)] text-[var(--dx-bad)]">
                          Erro
                        </span>
                        <p className="dx-status-error text-[9px] text-[var(--dx-bad)] max-w-[100px] leading-tight mt-0.5">
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
                          className="dx-btn-icon is-ok"
                          title="Visualizar Anexo/Comprovante"
                        >
                          <Paperclip size={13} />
                        </button>
                      )}
                      <button
                        onClick={() => onRemover(idx)}
                        className="dx-btn-icon"
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
