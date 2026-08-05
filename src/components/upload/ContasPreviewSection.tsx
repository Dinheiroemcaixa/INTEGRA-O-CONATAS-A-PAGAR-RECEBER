'use client'

import { useState, useCallback, useEffect } from 'react'
import type { ContaFinanceiraOpcao } from '@/components/upload/SelectorContaFinanceira'
import { createClient } from '@/lib/supabase/client'
import TabelaPreview from '@/components/upload/TabelaPreview'
import type { ContaPagarPreview, Empresa } from '@/types'
import { Loader2, FileDown, Trash2, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import { formatCurrency, cn } from '@/lib/utils'
import { matchFornecedoresEmLote, type RegraDepara } from '@/lib/utils/match-fornecedor'
import { sugerirCategoria } from '@/lib/utils/auto-categoria'
import { normalizarNome, type FornecedorContaAzul } from '@/lib/parsers/fornecedores-contaazul'

interface Props {
  dadosIniciais: ContaPagarPreview[]
  empresaAtiva: Empresa | null
  onSalvar: (itens: ContaPagarPreview[]) => Promise<void>
  onBaixarXls?: (itens: ContaPagarPreview[]) => void
  salvando?: boolean
}

export default function ContasPreviewSection({
  dadosIniciais,
  empresaAtiva,
  onSalvar,
  onBaixarXls,
  salvando = false
}: Props) {
  const [dadosEditados, setDadosEditados] = useState<ContaPagarPreview[]>([])
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set())
  const [filtroPreview, setFiltroPreview] = useState<'todos' | 'erro' | 'revisao'>('todos')
  const [contasFinanceirasCA, setContasFinanceirasCA] = useState<ContaFinanceiraOpcao[]>([])
  const [loadingMatch, setLoadingMatch] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    if (!empresaAtiva?.id) { setContasFinanceirasCA([]); return }
    fetch(`/api/conta-azul/contas-financeiras?empresa_id=${empresaAtiva.id}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.contas && Array.isArray(data.contas)) {
          setContasFinanceirasCA(data.contas.map((c: any) => ({ id: c.id, descricao: c.descricao })))
        }
      })
      .catch(() => {})
  }, [empresaAtiva?.id])

  useEffect(() => {
    let mounted = true
    const processarMatch = async () => {
      if (!dadosIniciais || dadosIniciais.length === 0) {
        if (mounted) {
          setDadosEditados([])
          setSelecionados(new Set())
        }
        return
      }

      setLoadingMatch(true)
      let dadosComMatch = [...dadosIniciais]

      if (empresaAtiva) {
        try {
          const { data: fornecedoresDB } = await supabase
            .from('fornecedores_contaazul')
            .select('nome, cnpj, nome_normalizado, categoria_padrao')
            .eq('empresa_id', empresaAtiva.id)

          const resDepara = await fetch(`/api/fornecedor-depara?empresa_id=${empresaAtiva.id}&t=${Date.now()}`)
          const jsonDepara = await resDepara.json()
          const deparaDB = jsonDepara.data || []

          const regrasDepara: RegraDepara[] = (deparaDB || []).map((r: any) => ({
            nomeOriginalNormalizado: r.nome_original_normalizado,
            nomeCorrigido: r.nome_corrigido,
          }))

          if ((fornecedoresDB && fornecedoresDB.length > 0) || regrasDepara.length > 0) {
            const fornecedores: FornecedorContaAzul[] = (fornecedoresDB || []).map((f) => ({
              nome: f.nome,
              cnpj: f.cnpj || '',
              categoria: f.categoria_padrao || undefined,
              nomeNormalizado: f.nome_normalizado,
            }))

            const itensDatacar = dadosIniciais.map((d) => ({
              nome: d.fornecedor,
              cnpj: d._datacar?.cnpjEmit ? d._datacar.cnpjEmit.replace(/\D/g, '') : undefined
            }))
            const matchMap = matchFornecedoresEmLote(itensDatacar, fornecedores, regrasDepara)

            let defaultConta: { descricao: string, id: string } | null = null
            if (empresaAtiva) {
              const saved = localStorage.getItem(`contaPadrao_${empresaAtiva.id}`)
              if (saved) {
                try { defaultConta = JSON.parse(saved) } catch (e) {}
              }
            }

            dadosComMatch = dadosIniciais.map((d) => {
              const match = matchMap.get(d.fornecedor)
              const deveCorrigirAuto = match && ['exato', 'alto', 'medio'].includes(match.confianca)
              const nomeFinal = deveCorrigirAuto ? match.nomeCorrigido : d.fornecedor
              const sugestao = sugerirCategoria(nomeFinal) || sugerirCategoria(d.descricao || '')

              return {
                ...d,
                fornecedor: nomeFinal,
                categoria: match?.categoria || sugestao || 'Materiais para Revenda',
                matchFornecedor: match,
                conta_financeira: d.conta_financeira || defaultConta?.descricao,
                conta_financeira_id: d.conta_financeira_id || defaultConta?.id,
              }
            })

            const corrigidos = dadosComMatch.filter(
              (d) => d.matchFornecedor && d.matchFornecedor.nomeOriginal !== d.fornecedor
            ).length
            
            if (mounted && corrigidos > 0) {
              toast.success(`${corrigidos} nomes de fornecedores corrigidos automaticamente!`, { duration: 4000 })
            }
          }
          
          // Verificação de Duplicidades no Conta Azul
          if (dadosComMatch.length > 0 && empresaAtiva.conta_azul_connected) {
            const parseData = (str: string) => {
              const [d, m, y] = str.split('/')
              return new Date(`${y}-${m}-${d}T12:00:00Z`).getTime()
            }
            const datas = dadosComMatch.map(d => parseData(d.vencimento)).filter(t => !isNaN(t))
            if (datas.length > 0) {
              const dtIniStr = new Date(Math.min(...datas)).toISOString().split('T')[0]
              const dtFimStr = new Date(Math.max(...datas)).toISOString().split('T')[0]
              
              try {
                const dupRes = await fetch('/api/conta-azul/contas-pagar/verificar-duplicidades', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ empresa_id: empresaAtiva.id, dtIni: dtIniStr, dtFim: dtFimStr })
                })
                
                if (dupRes.ok) {
                  const dupData = await dupRes.json()
                  const contasCa = dupData.contasCa || []
                  
                  if (contasCa.length > 0) {
                    dadosComMatch = dadosComMatch.map(d => {
                      const dData = parseData(d.vencimento)
                      if (isNaN(dData)) return d
                      
                      const duplicada = contasCa.find((c: any) => {
                        const cData = new Date(`${c.data_vencimento}T12:00:00Z`).getTime()
                        const diffDias = Math.abs(cData - dData) / (1000 * 60 * 60 * 24)
                        
                        if (diffDias > 3) return false
                        
                        const diffValor = Math.abs(c.valor - d.valor)
                        // Tolerância de até 2 reais para considerar como suspeita
                        if (diffValor > 2.00) return false
                        
                        const caFornecedor = normalizarNome(c.descricao || '')
                        const datacarFornecedor = normalizarNome(d.fornecedor)
                        
                        // Se bateu data exata e valor exato, já é grande chance.
                        // Adicionamos match de nome se a descricao do CA contiver o nome
                        if (diffValor < 0.1 && diffDias === 0) return true
                        
                        if (caFornecedor && datacarFornecedor) {
                          if (caFornecedor.includes(datacarFornecedor) || datacarFornecedor.includes(caFornecedor)) {
                            return true
                          }
                        }
                        return false
                      })
                      
                      if (duplicada) {
                        return {
                          ...d,
                          ca_duplicidade: {
                            encontrado: true,
                            id_conta: duplicada.id,
                            vencimento: duplicada.data_vencimento,
                            valor: duplicada.valor,
                            fornecedor: duplicada.descricao || 'Fornecedor Desconhecido',
                            status: duplicada.status
                          }
                        }
                      }
                      return d
                    })
                  }
                }
              } catch (e) {
                console.warn('Erro ao verificar duplicidades no Conta Azul', e)
              }
            }
          }
        } catch {
          // falha silenciosa
        }
      }

      if (mounted) {
        setDadosEditados(dadosComMatch)
        const validos = new Set<number>(
          dadosComMatch.reduce((acc: number[], d, i) => { if (d.valido) acc.push(i); return acc }, [])
        )
        setSelecionados(validos)
        setLoadingMatch(false)
      }
    }

    processarMatch()
    return () => { mounted = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dadosIniciais, empresaAtiva?.id])


  const toggleItem = (idx: number) => {
    setSelecionados((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx); else next.add(idx)
      return next
    })
  }

  const toggleTodos = () => {
    const validosIdx = dadosEditados.reduce((acc: number[], d, i) => {
      if (d.valido) acc.push(i); return acc
    }, [])
    if (selecionados.size === dadosEditados.length) {
      setSelecionados(new Set())
    } else {
      setSelecionados(new Set(validosIdx))
    }
  }

  const removerItem = (idx: number) => {
    setDadosEditados((prev) => prev.filter((_, i) => i !== idx))
    setSelecionados((prev) => {
      const next = new Set<number>()
      prev.forEach((i) => { if (i < idx) next.add(i); else if (i > idx) next.add(i - 1) })
      return next
    })
  }

  const excluirTudoFiltrado = () => {
    const indicesParaRemover = dadosEditados
      .map((d, i) => ({ d, i }))
      .filter(({ d }) => {
        if (filtroPreview === 'erro') return !d.valido
        if (filtroPreview === 'revisao') return d.valido && d.matchFornecedor && d.matchFornecedor.confianca !== 'exato'
        return true
      })
      .map(({ i }) => i)

    if (indicesParaRemover.length === 0) return
    if (!confirm(`Deseja remover todos os ${indicesParaRemover.length} registros selecionados pelo filtro?`)) return

    const novosDados = dadosEditados.filter((_, i) => !indicesParaRemover.includes(i))
    setDadosEditados(novosDados)
    setSelecionados(new Set())
    setFiltroPreview('todos')
    toast.success('Registros removidos')
  }

  const updateFornecedor = useCallback(async (idx: number, novoNome: string) => {
    // Para garantir que a regra seja salva corretamente, sempre usamos o nome bruto vindo do Datacar
    const nomeOriginal = dadosIniciais[idx]?.fornecedor || dadosEditados[idx]?.fornecedor

    setDadosEditados((prev) => {
      const next = [...prev]
      next[idx] = {
        ...next[idx],
        fornecedor: novoNome,
        matchFornecedor: {
          nomeOriginal: nomeOriginal,
          nomeCorrigido: novoNome,
          cnpj: next[idx].matchFornecedor?.cnpj || '',
          confianca: 'exato',
          score: 100
        },
        valido: true,
        erros: undefined
      }
      return next
    })

    if (empresaAtiva && nomeOriginal && nomeOriginal !== novoNome) {
      try {
        const nomeNormalizado = normalizarNome(nomeOriginal)
        const res = await fetch('/api/fornecedor-depara', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            empresa_id: empresaAtiva.id,
            nome_original: nomeOriginal,
            nome_original_normalizado: nomeNormalizado,
            nome_corrigido: novoNome,
          }),
        })

        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          console.error('Erro ao salvar regra De-Para:', data)
          toast.error('Erro ao salvar fornecedor.')
          return
        }
          
        toast.success(`Aprendido: "${nomeOriginal}" → "${novoNome}"`, { id: 'learn-depara', duration: 3000 })
      } catch (err) {
        console.error('Erro ao salvar regra De-Para:', err)
        toast.error('Erro inesperado ao salvar fornecedor.')
      }
    }
  }, [empresaAtiva, dadosIniciais, dadosEditados])

  const updateCategoria = useCallback(async (idx: number, novaCategoria: string) => {
    setDadosEditados((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], categoria: novaCategoria }
      return next
    })

    if (empresaAtiva) {
      const conta = dadosEditados[idx]
      const nomeFornecedor = conta.matchFornecedor?.nomeCorrigido || conta.fornecedor
      const nomeNorm = normalizarNome(nomeFornecedor)
      try {
        // Usa upsert para garantir que a categoria seja salva mesmo que o
        // fornecedor ainda não exista na tabela (ex: renomeado via De-Para)
        const { error } = await supabase
          .from('fornecedores_contaazul')
          .upsert({
            empresa_id: empresaAtiva.id,
            nome: nomeFornecedor,
            nome_normalizado: nomeNorm,
            categoria_padrao: novaCategoria,
          }, {
            onConflict: 'empresa_id,nome_normalizado',
          })

        if (error) {
          console.error('Erro ao salvar categoria padrão:', error)
          toast.error('Erro ao salvar categoria.')
        } else {
          toast.success(`Categoria '${novaCategoria}' salva para ${nomeFornecedor}`, { id: 'learn-cat' })
        }
      } catch (err) {
        console.error('Erro ao salvar categoria padrão:', err)
      }
    }
  }, [empresaAtiva, dadosEditados, supabase])
 
  const updateConta = useCallback(async (idx: number, novaConta: string, contaId: string) => {
    setDadosEditados((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], conta_financeira: novaConta, conta_financeira_id: contaId }
      return next
    })
    if (empresaAtiva) {
      localStorage.setItem(`contaPadrao_${empresaAtiva.id}`, JSON.stringify({ descricao: novaConta, id: contaId }))
    }
  }, [empresaAtiva])

  const updateValor = useCallback((idx: number, novoValor: number) => {
    setDadosEditados((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], valor: novoValor }
      return next
    })
  }, [])

  const updateVencimento = useCallback((idx: number, novaData: string) => {
    setDadosEditados((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], vencimento: novaData }
      return next
    })
  }, [])

  const updateEmissao = useCallback((idx: number, novaData: string) => {
    setDadosEditados((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], emissao: novaData }
      return next
    })
  }, [])

  const updateDescricao = useCallback((idx: number, novaDesc: string) => {
    setDadosEditados((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], descricao: novaDesc }
      return next
    })
  }, [])

  const removerEmLote = (indices: number[]) => {
    const novosDados = dadosEditados.filter((_, i) => !indices.includes(i))
    setDadosEditados(novosDados)
    setSelecionados(new Set())
    toast.success(`${indices.length} registros removidos`)
  }

  const updateCategoriaEmLote = async (indices: number[], novaCategoria: string) => {
    if (!novaCategoria.trim()) return
    setDadosEditados((prev) => {
      const next = [...prev]
      indices.forEach(idx => {
        next[idx] = { ...next[idx], categoria: novaCategoria }
      })
      return next
    })

    if (empresaAtiva) {
      // Garante fornecedores únicos com seus nomes normalizados
      const fornecedoresUnicos = Array.from(new Map(
        indices.map(idx => {
          const d = dadosEditados[idx]
          const nome = d.matchFornecedor?.nomeCorrigido || d.fornecedor
          return [normalizarNome(nome), nome]
        })
      ).entries()).map(([nomeNorm, nome]) => ({ nome, nomeNorm }))

      try {
        // Upsert para garantir que a categoria seja salva mesmo que o
        // fornecedor ainda não exista na tabela
        const registros = fornecedoresUnicos.map(({ nome, nomeNorm }) => ({
          empresa_id: empresaAtiva.id,
          nome,
          nome_normalizado: nomeNorm,
          categoria_padrao: novaCategoria,
        }))

        const { error } = await supabase
          .from('fornecedores_contaazul')
          .upsert(registros, { onConflict: 'empresa_id,nome_normalizado' })

        if (error) {
          console.error('Erro ao salvar categoria padrão em lote:', error)
          toast.error('Erro ao salvar categorias.')
        } else {
          toast.success(`Categoria salva para ${fornecedoresUnicos.length} fornecedores`, { id: 'learn-cat-lote' })
        }
      } catch (err) {
        console.error('Erro ao salvar categoria padrão em lote:', err)
      }
    }
    setSelecionados(new Set())
  }

  const updateContaEmLote = async (indices: number[], novaConta: string) => {
    if (!novaConta.trim()) return
    const contaId = contasFinanceirasCA.find(c => c.descricao === novaConta)?.id || ''
    
    setDadosEditados((prev) => {
      const next = [...prev]
      indices.forEach(idx => {
        next[idx] = { ...next[idx], conta_financeira: novaConta, conta_financeira_id: contaId }
      })
      return next
    })
    if (empresaAtiva) {
      localStorage.setItem(`contaPadrao_${empresaAtiva.id}`, JSON.stringify({ descricao: novaConta, id: contaId }))
    }
    setSelecionados(new Set())
  }

  const handleClickSalvar = () => {
    const itensSelecionados = dadosEditados.filter((_, i) => selecionados.has(i))
    onSalvar(itensSelecionados)
  }

  const handleClickBaixarXls = () => {
    if (!onBaixarXls) return
    const itens = dadosEditados.filter((d, i) => {
      if (!selecionados.has(i)) return false
      if (filtroPreview === 'erro') return !d.valido
      if (filtroPreview === 'revisao') return d.valido && d.matchFornecedor && d.matchFornecedor.confianca !== 'exato'
      return true
    }).map(d => ({
      ...d,
      fornecedor: (d.matchFornecedor?.nomeCorrigido || d.fornecedor).trim()
    }))
    onBaixarXls(itens)
  }

  const valorSelecionado = dadosEditados
    .filter((_, i) => selecionados.has(i))
    .reduce((sum, c) => sum + (c.valor || 0), 0)

  if (loadingMatch) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-dark-800 rounded-xl border border-dark-700">
        <Loader2 className="w-10 h-10 animate-spin text-brand-500 mb-4" />
        <p className="text-white font-medium">Analisando fornecedores...</p>
        <p className="text-dark-400 text-sm mt-1">Comparando nomes e sugerindo categorias</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Resumo / Filtros */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <button
          onClick={() => setFiltroPreview('todos')}
          className={cn(
            "bg-dark-800 border rounded-xl p-4 text-left transition-all",
            filtroPreview === 'todos' ? "border-brand-500 ring-1 ring-brand-500" : "border-dark-700 hover:border-dark-500"
          )}
        >
          <p className="text-dark-400 text-xs mb-1">Total</p>
          <p className="text-white text-2xl font-bold">{dadosEditados.length}</p>
        </button>

        <div className="bg-dark-800 border border-green-500/20 rounded-xl p-4">
          <p className="text-dark-400 text-xs mb-1">Confirmados</p>
          <p className="text-green-400 text-2xl font-bold">
            {dadosEditados.filter(d => d.valido && (!d.matchFornecedor || d.matchFornecedor.confianca === 'exato')).length}
          </p>
        </div>

        <button
          onClick={() => setFiltroPreview('revisao')}
          className={cn(
            "bg-dark-800 border rounded-xl p-4 text-left transition-all",
            filtroPreview === 'revisao' ? "border-yellow-500 ring-1 ring-yellow-500" : "border-yellow-500/20 hover:border-yellow-500/40"
          )}
        >
          <p className="text-yellow-500/70 text-xs mb-1">Amarelas (Revisar)</p>
          <p className="text-yellow-400 text-2xl font-bold">
            {dadosEditados.filter(d => d.valido && d.matchFornecedor && d.matchFornecedor.confianca !== 'exato').length}
          </p>
        </button>

        <button
          onClick={() => setFiltroPreview('erro')}
          className={cn(
            "bg-dark-800 border rounded-xl p-4 text-left transition-all",
            filtroPreview === 'erro' ? "border-red-500 ring-1 ring-red-500" : "border-red-500/20 hover:border-red-500/40"
          )}
        >
          <p className="text-red-500/70 text-xs mb-1">Vermelhas (Erro)</p>
          <p className="text-red-400 text-2xl font-bold">
            {dadosEditados.filter(d => !d.valido).length}
          </p>
        </button>

        <div className="bg-dark-800 border border-brand-500/20 rounded-xl p-4">
          <p className="text-dark-400 text-xs mb-1">Valor selecionado</p>
          <p className="text-brand-400 text-xl font-bold">{formatCurrency(valorSelecionado)}</p>
        </div>
      </div>

      {/* Barra de Ação de Filtro */}
      {filtroPreview !== 'todos' && (
        <div className="bg-dark-800 border border-dark-700 px-4 py-2 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={cn(
              "w-2 h-2 rounded-full animate-pulse",
              filtroPreview === 'erro' ? "bg-red-500" : "bg-yellow-500"
            )} />
            <p className="text-sm text-dark-300">
              Filtrando por: <span className="font-bold uppercase">{filtroPreview === 'erro' ? 'Vermelhas' : 'Amarelas'}</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={excluirTudoFiltrado}
              className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 font-medium"
            >
              <Trash2 size={14} /> Excluir tudo do filtro
            </button>
            <button 
              onClick={() => setFiltroPreview('todos')}
              className="text-xs text-dark-400 hover:text-white"
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
        onToggleTodos={toggleTodos}
        onRemover={removerItem}
        onUpdateFornecedor={updateFornecedor}
        onUpdateCategoria={updateCategoria}
        onUpdateConta={updateConta}
        onRemoverLote={removerEmLote}
        onUpdateCategoriaLote={updateCategoriaEmLote}
        onUpdateContaLote={updateContaEmLote}
        contasFinanceiras={contasFinanceirasCA}
        onUpdateValor={updateValor}
        onUpdateVencimento={updateVencimento}
        onUpdateEmissao={updateEmissao}
        onUpdateDescricao={updateDescricao}
      />

      {/* Ações */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-dark-800 border border-dark-700 rounded-xl p-4">
        <p className="text-sm text-dark-400">
          <span className="text-white font-semibold">{selecionados.size}</span> registros selecionados •{' '}
          <span className="text-green-400 font-semibold">{formatCurrency(valorSelecionado)}</span>
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {onBaixarXls && (
            <button
              onClick={handleClickBaixarXls}
              disabled={selecionados.size === 0}
              className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed
                         text-white px-5 py-2.5 rounded-lg font-semibold flex items-center gap-2 transition-all"
              title="Gera o arquivo .xls no modelo do ContaAzul sem salvar no banco"
            >
              <FileDown size={16} /> Baixar XLS ContaAzul
            </button>
          )}

          <button
            onClick={handleClickSalvar}
            disabled={salvando || selecionados.size === 0 || !empresaAtiva}
            className="bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed
                       text-white px-6 py-3 rounded-lg font-semibold flex items-center gap-2 transition-all
                       shadow-lg shadow-brand-900/20"
          >
            {salvando ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            Salvar e Continuar
          </button>
        </div>
      </div>
    </div>
  )
}
