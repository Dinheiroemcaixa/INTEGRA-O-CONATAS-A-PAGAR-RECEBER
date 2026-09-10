'use client'

import { useState, useCallback, useEffect } from 'react'
import { useEmpresa } from '@/contexts/EmpresaContext'
import type { ContaFinanceiraOpcao } from '@/components/upload/SelectorContaFinanceira'
import { createClient } from '@/lib/supabase/client'
import TabelaPreview from '@/components/upload/TabelaPreview'
import type { ContaPagarPreview, Empresa } from '@/types'
import { Loader2, FileDown, Trash2, Save, Upload, CheckCircle2, AlertTriangle, AlertCircle, Layers } from 'lucide-react'
import toast from 'react-hot-toast'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface Props {
  dadosIniciais: ContaPagarPreview[]
  contasFinanceirasCA?: ContaFinanceiraOpcao[]
  categoriasCA?: string[]
  onSalvar: (dados: ContaPagarPreview[]) => void
  onBaixarXls?: (dados: ContaPagarPreview[]) => void
  salvando: boolean
  empresaAtiva?: Empresa | null
  nomeArquivo?: string
}

export default function ContasPreviewSection({
  dadosIniciais,
  contasFinanceirasCA = [],
  categoriasCA = [],
  onSalvar,
  onBaixarXls,
  salvando,
  empresaAtiva,
  nomeArquivo
}: Props) {
  const [dadosEditados, setDadosEditados] = useState<(ContaPagarPreview & { originalIdx?: number })[]>(dadosIniciais)
  const [filtroPreview, setFiltroPreview] = useState<'todos' | 'erro' | 'revisao'>('todos')
  const [selecionados, setSelecionados] = useState<Set<number>>(
    new Set(dadosIniciais.map((_, i) => i))
  )
  const [loadingMatch, setLoadingMatch] = useState(false)
  const supabase = createClient()

  // Auto match fornecedores do Conta Azul
  useEffect(() => {
    async function realizarAutoMatch() {
      if (!empresaAtiva || dadosIniciais.length === 0) return
      
      const precisaMatch = dadosIniciais.some(d => !d.matchFornecedor)
      if (!precisaMatch) {
        setDadosEditados(dadosIniciais)
        return
      }

      setLoadingMatch(true)
      try {
        const { data: fornecedoresCA } = await supabase
          .from('fornecedores_contaazul')
          .select('nome, cnpj, categoria_padrao, nome_normalizado')
          .eq('empresa_id', empresaAtiva.id)

        if (!fornecedoresCA || fornecedoresCA.length === 0) {
          setDadosEditados(dadosIniciais)
          setLoadingMatch(false)
          return
        }

        const norm = (s: string) =>
          s.toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]/g, '')
            .trim()

        const atualizados: (ContaPagarPreview & { originalIdx?: number })[] = dadosIniciais.map(item => {
          if (item.matchFornecedor) return item

          const nomeItemNorm = norm(item.fornecedor)
          
          const exato = fornecedoresCA.find(f => 
            norm(f.nome) === nomeItemNorm || 
            (f.nome_normalizado && norm(f.nome_normalizado) === nomeItemNorm)
          )

          if (exato) {
            return {
              ...item,
              fornecedor: exato.nome,
              categoria: exato.categoria_padrao || item.categoria,
              matchFornecedor: {
                nomeOriginal: item.fornecedor,
                nomeCorrigido: exato.nome,
                cnpj: exato.cnpj || '',
                categoria: exato.categoria_padrao || item.categoria,
                confianca: 'exato',
                score: 100
              }
            }
          }

          const parcial = fornecedoresCA.find(f => {
            const fNorm = norm(f.nome)
            return fNorm.includes(nomeItemNorm) || nomeItemNorm.includes(fNorm)
          })

          if (parcial) {
            return {
              ...item,
              fornecedor: parcial.nome,
              categoria: parcial.categoria_padrao || item.categoria,
              matchFornecedor: {
                nomeOriginal: item.fornecedor,
                nomeCorrigido: parcial.nome,
                cnpj: parcial.cnpj || '',
                categoria: parcial.categoria_padrao || item.categoria,
                confianca: 'alto',
                score: 80
              }
            }
          }

          return item
        })

        setDadosEditados(atualizados)
      } catch (err) {
        console.error('Erro ao realizar match de fornecedores:', err)
        setDadosEditados(dadosIniciais)
      } finally {
        setLoadingMatch(false)
      }
    }

    realizarAutoMatch()
  }, [dadosIniciais, empresaAtiva, supabase])

  const toggleItem = useCallback((idx: number) => {
    setSelecionados(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }, [])

  const toggleTodosLote = useCallback((indices: number[], acao: 'marcar' | 'desmarcar') => {
    setSelecionados(prev => {
      const next = new Set(prev)
      indices.forEach(idx => {
        if (acao === 'marcar') next.add(idx)
        else next.delete(idx)
      })
      return next
    })
  }, [])

  const removerItem = useCallback((idx: number) => {
    setDadosEditados(prev => prev.filter((_, i) => i !== idx))
    setSelecionados(prev => {
      const next = new Set<number>()
      prev.forEach(i => {
        if (i < idx) next.add(i)
        else if (i > idx) next.add(i - 1)
      })
      return next
    })
  }, [])

  const removerEmLote = useCallback((indices: number[]) => {
    const indicesSet = new Set(indices)
    setDadosEditados(prev => prev.filter((_, i) => !indicesSet.has(i)))
    setSelecionados(prev => {
      const next = new Set<number>()
      let shift = 0
      dadosEditados.forEach((_, i) => {
        if (indicesSet.has(i)) {
          shift++
        } else if (prev.has(i)) {
          next.add(i - shift)
        }
      })
      return next
    })
    toast.success(`${indices.length} registros excluídos.`)
  }, [dadosEditados])

  const updateFornecedor = useCallback((idx: number, novoNome: string) => {
    setDadosEditados(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], fornecedor: novoNome }
      return next
    })
  }, [])

  const updateFornecedorEmLote = useCallback((indices: number[], novoFornecedor: string) => {
    setDadosEditados(prev => {
      const next = [...prev]
      indices.forEach(idx => {
        if (next[idx]) next[idx] = { ...next[idx], fornecedor: novoFornecedor }
      })
      return next
    })
    toast.success(`Fornecedor atualizado em ${indices.length} registros.`)
  }, [])

  const updateCategoria = useCallback((idx: number, novaCategoria: string) => {
    setDadosEditados(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], categoria: novaCategoria }
      return next
    })
  }, [])

  const updateCategoriaEmLote = useCallback((indices: number[], novaCategoria: string) => {
    setDadosEditados(prev => {
      const next = [...prev]
      indices.forEach(idx => {
        if (next[idx]) next[idx] = { ...next[idx], categoria: novaCategoria }
      })
      return next
    })
    toast.success(`Categoria atualizada em ${indices.length} registros.`)
  }, [])

  const updateConta = useCallback((idx: number, novaConta: string, contaId: string) => {
    setDadosEditados(prev => {
      const next = [...prev]
      next[idx] = { 
        ...next[idx], 
        conta_financeira: novaConta,
        conta_financeira_id: contaId
      }
      return next
    })
  }, [])

  const updateContaEmLote = useCallback((indices: number[], novaConta: string) => {
    const contaObj = contasFinanceirasCA.find(c => c.descricao === novaConta)
    setDadosEditados(prev => {
      const next = [...prev]
      indices.forEach(idx => {
        if (next[idx]) {
          next[idx] = { 
            ...next[idx], 
            conta_financeira: novaConta,
            conta_financeira_id: contaObj?.id || next[idx].conta_financeira_id
          }
        }
      })
      return next
    })
    toast.success(`Conta financeira atualizada em ${indices.length} registros.`)
  }, [contasFinanceirasCA])

  const updateValor = useCallback((idx: number, novoValor: number) => {
    setDadosEditados(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], valor: novoValor }
      return next
    })
  }, [])

  const updateVencimento = useCallback((idx: number, novaData: string) => {
    setDadosEditados(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], vencimento: novaData }
      return next
    })
  }, [])

  const updateEmissao = useCallback((idx: number, novaData: string) => {
    setDadosEditados(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], emissao: novaData }
      return next
    })
  }, [])

  const updateDescricao = useCallback((idx: number, novaDesc: string) => {
    setDadosEditados(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], descricao: novaDesc }
      return next
    })
  }, [])

  const excluirTudoFiltrado = () => {
    let indicesParaRemover: number[] = []
    if (filtroPreview === 'erro') {
      indicesParaRemover = dadosEditados
        .map((d, i) => (!d.valido ? i : -1))
        .filter(i => i !== -1)
    } else if (filtroPreview === 'revisao') {
      indicesParaRemover = dadosEditados
        .map((d, i) => (d.valido && d.matchFornecedor && d.matchFornecedor.confianca !== 'exato' ? i : -1))
        .filter(i => i !== -1)
    }

    if (indicesParaRemover.length === 0) return

    if (confirm(`Deseja realmente excluir todos os ${indicesParaRemover.length} registros deste filtro?`)) {
      removerEmLote(indicesParaRemover)
      setFiltroPreview('todos')
    }
  }

  const handleClickSalvar = () => {
    const selecionadosArray = dadosEditados.filter((_, i) => selecionados.has(i))
    if (selecionadosArray.length === 0) {
      toast.error('Selecione pelo menos um registro para salvar.')
      return
    }
    onSalvar(selecionadosArray)
  }

  const handleClickBaixarXls = () => {
    if (!onBaixarXls) return
    const selecionadosArray = dadosEditados.filter((_, i) => selecionados.has(i))
    if (selecionadosArray.length === 0) {
      toast.error('Selecione pelo menos um registro para exportar.')
      return
    }
    onBaixarXls(selecionadosArray)
  }

  const valorSelecionado = dadosEditados
    .filter((_, i) => selecionados.has(i))
    .reduce((sum, c) => sum + (c.valor || 0), 0)

  if (loadingMatch) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-dark-900/60 rounded-3xl border border-dark-700/80 backdrop-blur-sm shadow-xl">
        <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4" />
        <p className="text-white font-bold text-base">Analisando fornecedores...</p>
        <p className="text-dark-400 text-xs mt-1">Comparando nomes e sugerindo categorias inteligentes</p>
      </div>
    )
  }

  if (dadosEditados.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-dark-900/60 rounded-3xl border border-dark-700/80 space-y-4 animate-fade-in text-center my-4 backdrop-blur-sm shadow-xl">
        <div className="w-14 h-14 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-center justify-center text-blue-400 shadow-[0_0_30px_rgba(59,130,246,0.15)]">
          <Upload size={28} />
        </div>
        <div>
          <h3 className="text-white font-bold text-base">Nenhum registro para importação</h3>
          <p className="text-dark-400 text-xs mt-1 max-w-md mx-auto leading-relaxed">
            A lista está limpa. Clique no botão abaixo para selecionar ou arrastar uma nova planilha Excel / CSV.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (typeof window !== 'undefined') {
              const el = document.querySelector('button:has(svg.lucide-upload)') as HTMLButtonElement | null
              if (el) el.click()
              else window.location.reload()
            }
          }}
          className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all shadow-lg shadow-blue-900/30 active:scale-[0.98] cursor-pointer"
        >
          <Upload size={16} /> Arraste ou Selecione Nova Planilha
        </button>
      </div>
    )
  }

  const totalConfirmados = dadosEditados.filter(d => d.valido && (!d.matchFornecedor || d.matchFornecedor.confianca === 'exato')).length
  const totalRevisao = dadosEditados.filter(d => d.valido && d.matchFornecedor && d.matchFornecedor.confianca !== 'exato').length
  const totalErro = dadosEditados.filter(d => !d.valido).length

  return (
    <div className="space-y-4">
      {/* Resumo / Filtros em Cards Fintech */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <button
          type="button"
          onClick={() => setFiltroPreview('todos')}
          className={cn(
            "glass-card-dark p-4 rounded-2xl border text-left transition-all duration-200 cursor-pointer relative overflow-hidden group",
            filtroPreview === 'todos' 
              ? "border-blue-500 ring-1 ring-blue-500/50 bg-blue-500/5" 
              : "border-dark-700/80 hover:border-dark-600"
          )}
        >
          <div className="flex items-center justify-between">
            <p className="text-dark-400 text-[11px] font-semibold uppercase tracking-wider">Total Geral</p>
            <Layers size={13} className="text-dark-500 group-hover:text-blue-400 transition-colors" />
          </div>
          <p className="text-white text-2xl font-black font-mono tabular-nums mt-1">{dadosEditados.length}</p>
        </button>

        <div className="glass-card-emerald p-4 rounded-2xl border border-emerald-500/20 text-left relative overflow-hidden">
          <div className="flex items-center justify-between">
            <p className="text-emerald-400/80 text-[11px] font-semibold uppercase tracking-wider">Confirmados</p>
            <CheckCircle2 size={13} className="text-emerald-400" />
          </div>
          <p className="text-emerald-400 text-2xl font-black font-mono tabular-nums mt-1">
            {totalConfirmados}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setFiltroPreview('revisao')}
          className={cn(
            "p-4 rounded-2xl border text-left transition-all duration-200 cursor-pointer relative overflow-hidden group",
            filtroPreview === 'revisao' 
              ? "bg-amber-500/10 border-amber-500 ring-1 ring-amber-500/50" 
              : "glass-card-dark border-amber-500/20 hover:border-amber-500/40"
          )}
        >
          <div className="flex items-center justify-between">
            <p className="text-amber-400/90 text-[11px] font-semibold uppercase tracking-wider">Revisar</p>
            <AlertTriangle size={13} className="text-amber-400" />
          </div>
          <p className="text-amber-400 text-2xl font-black font-mono tabular-nums mt-1">
            {totalRevisao}
          </p>
        </button>

        <button
          type="button"
          onClick={() => setFiltroPreview('erro')}
          className={cn(
            "p-4 rounded-2xl border text-left transition-all duration-200 cursor-pointer relative overflow-hidden group",
            filtroPreview === 'erro' 
              ? "bg-rose-500/10 border-rose-500 ring-1 ring-rose-500/50" 
              : "glass-card-dark border-rose-500/20 hover:border-rose-500/40"
          )}
        >
          <div className="flex items-center justify-between">
            <p className="text-rose-400/90 text-[11px] font-semibold uppercase tracking-wider">Erros</p>
            <AlertCircle size={13} className="text-rose-400" />
          </div>
          <p className="text-rose-400 text-2xl font-black font-mono tabular-nums mt-1">
            {totalErro}
          </p>
        </button>

        <div className="glass-card-blue p-4 rounded-2xl border border-blue-500/20 text-left relative overflow-hidden">
          <p className="text-blue-400/80 text-[11px] font-semibold uppercase tracking-wider">Valor Selecionado</p>
          <p className="text-blue-400 text-xl font-black font-mono tabular-nums mt-1 truncate">
            {formatCurrency(valorSelecionado)}
          </p>
        </div>
      </div>

      {/* Barra de Ação de Filtro Ativo */}
      {filtroPreview !== 'todos' && (
        <div className="bg-dark-900/80 border border-dark-700/80 px-4 py-2.5 rounded-2xl flex items-center justify-between backdrop-blur-sm animate-fade-in">
          <div className="flex items-center gap-2">
            <span className={cn(
              "w-2 h-2 rounded-full animate-ping",
              filtroPreview === 'erro' ? "bg-rose-500" : "bg-amber-500"
            )} />
            <p className="text-xs text-dark-300">
              Filtrando por: <span className={cn("font-bold uppercase tracking-wider", filtroPreview === 'erro' ? 'text-rose-400' : 'text-amber-400')}>{filtroPreview === 'erro' ? 'Registros com Erro' : 'Necessita Revisão'}</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={excluirTudoFiltrado}
              className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 font-semibold transition-colors cursor-pointer"
            >
              <Trash2 size={13} /> Excluir filtrados
            </button>
            <button 
              onClick={() => setFiltroPreview('todos')}
              className="text-xs text-dark-400 hover:text-white transition-colors cursor-pointer font-medium"
            >
              Limpar filtro
            </button>
          </div>
        </div>
      )}

      {/* Tabela de preview */}
      <TabelaPreview
        dados={dadosEditados.map((d, i) => ({ ...d, originalIdx: i }))}
        filtro={filtroPreview}
        selecionados={selecionados}
        onToggle={toggleItem}
        onToggleTodosLote={toggleTodosLote}
        onRemover={removerItem}
        onUpdateFornecedor={updateFornecedor}
        onUpdateCategoria={updateCategoria}
        onUpdateConta={updateConta}
        onRemoverLote={removerEmLote}
        onUpdateCategoriaLote={updateCategoriaEmLote}
        onUpdateContaLote={updateContaEmLote}
        onUpdateFornecedorLote={updateFornecedorEmLote}
        contasFinanceiras={contasFinanceirasCA}
        categoriasCA={categoriasCA}
        onUpdateValor={updateValor}
        onUpdateVencimento={updateVencimento}
        onUpdateEmissao={updateEmissao}
        onUpdateDescricao={updateDescricao}
      />

      {/* Ações e Rodapé */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-dark-900/60 border border-dark-700/80 rounded-2xl p-4 backdrop-blur-sm shadow-xl">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-dark-400">
            <strong className="text-white font-bold">{selecionados.size}</strong> registros selecionados •{' '}
            <strong className="text-emerald-400 font-bold">{formatCurrency(valorSelecionado)}</strong>
          </span>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap w-full sm:w-auto justify-end">
          {onBaixarXls && (
            <button
              type="button"
              onClick={handleClickBaixarXls}
              disabled={selecionados.size === 0}
              className="bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer"
              title="Gera o arquivo .xls no modelo do ContaAzul sem salvar no banco"
            >
              <FileDown size={15} /> Baixar XLS ContaAzul
            </button>
          )}

          <button
            type="button"
            onClick={handleClickSalvar}
            disabled={salvando || selecionados.size === 0 || !empresaAtiva}
            className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all shadow-lg shadow-blue-900/30 active:scale-[0.98] cursor-pointer"
          >
            {salvando ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Salvar e Continuar
          </button>
        </div>
      </div>
    </div>
  )
}
