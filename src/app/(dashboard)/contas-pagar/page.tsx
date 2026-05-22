'use client'

import { useState, useCallback, useEffect } from 'react'
import { useEmpresa } from '@/contexts/EmpresaContext'
import { createClient } from '@/lib/supabase/client'
import DropZone from '@/components/upload/DropZone'
import TabelaPreview from '@/components/upload/TabelaPreview'
import TabelaContas from '@/components/upload/TabelaContas'
import type { ContaPagarPreview, ResultadoImportacao } from '@/types'
import type { Empresa } from '@/types'
import {
  Upload, Save, ArrowLeft, Loader2,
  CheckCircle, AlertCircle, FileDown, Trash2, Send,
  Building2, X, ShieldCheck, ChevronDown, Mail,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { formatCurrency, cn } from '@/lib/utils'
import { exportarParaContaAzulXls } from '@/lib/exporters/contaazul-xls'
import { matchFornecedoresEmLote } from '@/lib/utils/match-fornecedor'
import { sugerirCategoria } from '@/lib/utils/auto-categoria'
import type { FornecedorContaAzul } from '@/lib/parsers/fornecedores-contaazul'

type Etapa = 'upload' | 'preview' | 'contas'

// Modal de confirmação de envio ao Conta Azul
function ModalEnvioContaAzul({
  empresaAtiva,
  todasEmpresas,
  loginAtual,
  onConfirmar,
  onCancelar,
  enviando,
}: {
  empresaAtiva: Empresa | null
  todasEmpresas: Empresa[]
  loginAtual: string
  onConfirmar: (empresaId: string) => void
  onCancelar: () => void
  enviando: boolean
}) {
  const [empresaSelecionada, setEmpresaSelecionada] = useState<Empresa | null>(empresaAtiva)
  const [abrirSeletor, setAbrirSeletor] = useState(false)
  const conectado = !!empresaSelecionada?.access_token_conta_azul

  // Verifica se o login ativo bate com o email cadastrado na empresa
  const emailEmpresa = empresaSelecionada?.email_login
  const loginDivergente = !!(
    emailEmpresa &&
    loginAtual &&
    emailEmpresa.toLowerCase().trim() !== loginAtual.toLowerCase().trim()
  )

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-dark-800 border border-dark-600 rounded-2xl w-full max-w-md shadow-2xl animate-fade-in">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-dark-700">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-500/10 rounded-xl flex items-center justify-center">
              <Send size={16} className="text-blue-400" />
            </div>
            <h3 className="text-white font-bold">Enviar ao Conta Azul</h3>
          </div>
          <button onClick={onCancelar} className="p-1.5 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700 transition-all">
            <X size={16} />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="p-5 space-y-4">
          <p className="text-dark-300 text-sm">Selecione a empresa de destino antes de enviar:</p>

          {/* Seletor de empresa */}
          <div className="relative">
            <button
              onClick={() => setAbrirSeletor(!abrirSeletor)}
              disabled={enviando}
              className={cn(
                'w-full rounded-xl border p-4 flex items-center gap-3 text-left transition-all',
                conectado
                  ? 'bg-dark-900 border-emerald-500/30 hover:border-emerald-500/60'
                  : 'bg-dark-900 border-amber-500/30 hover:border-amber-500/60'
              )}
            >
              <div className="w-10 h-10 bg-brand-600/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <span className="text-brand-400 font-bold text-sm">
                  {empresaSelecionada?.nome?.charAt(0).toUpperCase() || '?'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold truncate">{empresaSelecionada?.nome || '—'}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {conectado ? (
                    <>
                      <ShieldCheck size={11} className="text-emerald-400" />
                      <span className="text-emerald-400 text-xs font-medium">Conta Azul conectado</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle size={11} className="text-amber-400" />
                      <span className="text-amber-400 text-xs font-medium">Conta Azul não conectado</span>
                    </>
                  )}
                </div>
              </div>
              {todasEmpresas.length > 1 && (
                <ChevronDown size={16} className={cn('text-dark-400 flex-shrink-0 transition-transform', abrirSeletor && 'rotate-180')} />
              )}
            </button>

            {/* Dropdown de empresas */}
            {abrirSeletor && todasEmpresas.length > 1 && (
              <div className="absolute top-full mt-1 left-0 right-0 bg-dark-800 border border-dark-600 rounded-xl shadow-2xl z-10 overflow-hidden animate-fade-in">
                {todasEmpresas.map((emp) => {
                  const empConectada = !!emp.access_token_conta_azul
                  const isSelected = empresaSelecionada?.id === emp.id
                  return (
                    <button
                      key={emp.id}
                      onClick={() => { setEmpresaSelecionada(emp); setAbrirSeletor(false) }}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
                        isSelected ? 'bg-brand-600/10' : 'hover:bg-dark-700'
                      )}
                    >
                      <div className="w-8 h-8 bg-brand-600/20 rounded-lg flex items-center justify-center flex-shrink-0">
                        <span className="text-brand-400 font-bold text-xs">{emp.nome.charAt(0).toUpperCase()}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">{emp.nome}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${empConectada ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                          <span className={`text-xs ${empConectada ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {empConectada ? 'Conta Azul conectado' : 'Não conectado'}
                          </span>
                        </div>
                      </div>
                      {isSelected && <CheckCircle size={14} className="text-brand-400 flex-shrink-0" />}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* ⚠️ Aviso de login divergente — risco de enviar para empresa errada */}
          {conectado && loginDivergente && (
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle size={14} className="text-rose-400 flex-shrink-0 mt-0.5" />
                <p className="text-rose-300 text-xs font-semibold">Atenção: login divergente!</p>
              </div>
              <div className="pl-5 space-y-1">
                <p className="text-xs text-dark-300">
                  Você está logado como: <span className="text-white font-semibold">{loginAtual}</span>
                </p>
                <p className="text-xs text-dark-300">
                  Esta empresa usa: <span className="text-rose-300 font-semibold">{emailEmpresa}</span>
                </p>
              </div>
              <p className="text-xs text-rose-200/70 pl-5">
                O token do Conta Azul pode estar vinculado ao login errado. Recomendamos sair e entrar com <strong>{emailEmpresa}</strong> antes de enviar.
              </p>
            </div>
          )}

          {/* Aviso se não conectado */}
          {!conectado && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex items-start gap-2">
              <AlertCircle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-amber-300 text-xs">
                Esta empresa não está conectada ao Conta Azul. Clique no nome da empresa no topo da tela para conectar.
              </p>
            </div>
          )}

          {conectado && !loginDivergente && (
            <p className="text-dark-500 text-xs">
              Todas as contas <strong className="text-dark-300">pendentes</strong> desta empresa serão enviadas ao Conta Azul.
            </p>
          )}
        </div>

        {/* Ações */}
        <div className="p-5 border-t border-dark-700 flex gap-3">
          <button
            onClick={onCancelar}
            className="flex-1 bg-dark-700 hover:bg-dark-600 text-dark-300 hover:text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={() => empresaSelecionada && onConfirmar(empresaSelecionada.id)}
            disabled={!conectado || enviando || !empresaSelecionada}
            className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-900/20"
          >
            {enviando ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            {enviando ? 'Enviando...' : 'Confirmar envio'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ContasPagarPage() {
  const { empresaAtiva, empresas } = useEmpresa()
  const [etapa, setEtapa] = useState<Etapa>('upload')
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null)
  const [dadosEditados, setDadosEditados] = useState<ContaPagarPreview[]>([])
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set())
  const [salvando, setSalvando] = useState(false)
  const [gerandoXls, setGerandoXls] = useState(false)
  const [enviandoCA, setEnviandoCA] = useState(false)
  const [refreshContas, setRefreshContas] = useState(0)
  const [filtroPreview, setFiltroPreview] = useState<'todos' | 'erro' | 'revisao'>('todos')
  const [showModalEnvio, setShowModalEnvio] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setUserEmail(data.user.email)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleResultado = useCallback(async (res: ResultadoImportacao) => {
    // Tentar buscar fornecedores do ContaAzul para fazer match automático de nomes
    let dadosComMatch = res.dados
    if (empresaAtiva) {
      try {
        const { data: fornecedoresDB } = await supabase
          .from('fornecedores_contaazul')
          .select('nome, cnpj, nome_normalizado, categoria_padrao')
          .eq('empresa_id', empresaAtiva.id)

        if (fornecedoresDB && fornecedoresDB.length > 0) {
          const fornecedores: FornecedorContaAzul[] = fornecedoresDB.map((f) => ({
            nome: f.nome,
            cnpj: f.cnpj || '',
            categoria: f.categoria_padrao || undefined,
            nomeNormalizado: f.nome_normalizado,
          }))

          const nomesDatacar = res.dados.map((d) => d.fornecedor)
          const matchMap = matchFornecedoresEmLote(nomesDatacar, fornecedores)

          dadosComMatch = res.dados.map((d) => {
            const match = matchMap.get(d.fornecedor)
            const deveCorrigirAuto = match && ['exato', 'alto', 'medio'].includes(match.confianca)
            const nomeFinal = deveCorrigirAuto ? match.nomeCorrigido : d.fornecedor
            const sugestao = sugerirCategoria(nomeFinal) || sugerirCategoria(d.descricao || '')

            return {
              ...d,
              fornecedor: nomeFinal,
              categoria: match?.categoria || sugestao || 'Materiais para Revenda',
              matchFornecedor: match,
            }
          })

          // Contar quantos foram corrigidos
          const corrigidos = dadosComMatch.filter(
            (d) => d.matchFornecedor && d.matchFornecedor.nomeOriginal !== d.fornecedor
          ).length
          if (corrigidos > 0) {
            toast.success(`${corrigidos} nomes de fornecedores corrigidos automaticamente!`, { duration: 4000 })
          }
        }
      } catch {
        // Falha silenciosa — match é opcional, não bloqueia o fluxo
      }
    }

    setResultado(res)
    setDadosEditados(dadosComMatch)
    // Pré-selecionar apenas os válidos
    const validos = new Set<number>(
      dadosComMatch.reduce((acc: number[], d, i) => { if (d.valido) acc.push(i); return acc }, [])
    )
    setSelecionados(validos)
    setEtapa('preview')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaAtiva])

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

  const handleSalvar = async () => {
    if (!empresaAtiva) { toast.error('Selecione uma empresa primeiro'); return }
    if (selecionados.size === 0) { toast.error('Selecione ao menos um registro'); return }

    setSalvando(true)
    try {
      const itens = dadosEditados
        .filter((_, i) => selecionados.has(i))
        .map((d) => ({
          empresa_id: empresaAtiva.id,
          // Prioriza SEMPRE o nome corrigido (seja manual ou automático) ao salvar
          fornecedor: (d.matchFornecedor?.nomeCorrigido || d.fornecedor).trim(),
          valor: d.valor,
          vencimento: d.vencimento || new Date().toISOString().split('T')[0],
          categoria: d.categoria || 'Materiais para Revenda',
          conta_financeira: d.conta_financeira || 'Santander Barão',
          descricao: d.descricao || null,
          doc: d.doc || null,
          emissao: d.emissao || null,
          status: 'pendente',
        }))

      const { error } = await supabase
        .from('contas_pagar_importadas')
        .upsert(itens, {
          onConflict: 'empresa_id,fornecedor,valor,vencimento,doc',
          ignoreDuplicates: true,
        })

      if (error) throw error

      toast.success(`${itens.length} contas salvas com sucesso!`)
      setEtapa('contas')
      setResultado(null)
      setDadosEditados([])
      setSelecionados(new Set())
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar'
      toast.error(msg)
    } finally {
      setSalvando(false)
    }
  }

  const handleBaixarXls = async (fonte: 'preview' | 'salvas' = 'salvas') => {
    setGerandoXls(true)
    try {
      let contas: ContaPagarPreview[] = []

      if (fonte === 'preview') {
        // Exportar o que está na tela (dadosEditados) que estiver selecionado
        // Se houver filtro ativo, exportamos apenas o que o filtro mostra (opcional, mas geralmente é o esperado se o erro é 'constante')
        contas = dadosEditados
          .filter((d, i) => {
            const estaSelecionado = selecionados.has(i)
            if (!estaSelecionado) return false
            
            // Se houver filtro ativo, só exportamos o que o filtro permite
            if (filtroPreview === 'erro') return !d.valido
            if (filtroPreview === 'revisao') return d.valido && d.matchFornecedor && d.matchFornecedor.confianca !== 'exato'
            
            return true
          })
          .map(d => ({
            ...d,
            // Garantir que o fornecedor final seja o corrigido
            fornecedor: (d.matchFornecedor?.nomeCorrigido || d.fornecedor).trim()
          }))
      } else {
        // Exportar as contas pendentes já salvas no banco
        if (!empresaAtiva) { toast.error('Selecione uma empresa primeiro'); return }
        const { data, error } = await supabase
          .from('contas_pagar_importadas')
          .select('*')
          .eq('empresa_id', empresaAtiva.id)
          .in('status', ['pendente', 'erro'])
          .order('vencimento', { ascending: true })


        if (error) throw error
        if (!data || data.length === 0) {
          toast('Nenhuma conta pendente para exportar', { icon: 'ℹ️' })
          return
        }

        // Tentar buscar fornecedores para corrigir nomes mesmo em registros já salvos
        let fornecedores: FornecedorContaAzul[] = []
        if (empresaAtiva) {
          const { data: fdb } = await supabase
            .from('fornecedores_contaazul')
            .select('nome, cnpj, nome_normalizado, categoria_padrao')
            .eq('empresa_id', empresaAtiva.id)
          if (fdb) {
            fornecedores = fdb.map(f => ({ 
              nome: f.nome, 
              cnpj: f.cnpj || '', 
              categoria: f.categoria_padrao || undefined,
              nomeNormalizado: f.nome_normalizado 
            }))
          }
        }

        const nomesParaMatch = data.map(c => c.fornecedor)
        const matchMap = fornecedores.length > 0 
          ? matchFornecedoresEmLote(nomesParaMatch, fornecedores)
          : new Map()

        contas = data.map((c) => {
          const match = matchMap.get(c.fornecedor)
          // Prioriza o match se for de alta confiança ou se o nome for diferente
          const fornecedorFinal = match && (match.confianca === 'exato' || match.confianca === 'alto' || match.confianca === 'medio')
            ? match.nomeCorrigido
            : c.fornecedor

          return {
            fornecedor: fornecedorFinal,
            valor: Number(c.valor),
            vencimento: c.vencimento,
            // Prioriza a categoria salva no banco, senão tenta o match, senão fallback global
            categoria: c.categoria || match?.categoria || 'Materiais para Revenda',
            descricao: c.descricao || undefined,
            doc: c.doc || undefined,
            emissao: c.emissao || undefined,
            matchFornecedor: match || undefined,
            valido: true,
          }
        })
      }

      if (contas.length === 0) {
        toast.error('Nenhum registro para exportar')
        return
      }

      exportarParaContaAzulXls(contas, {
        categoria: '',
      })

      toast.success(`Planilha gerada com ${contas.length} lançamentos! Importe no ContaAzul.`, {
        duration: 5000,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao gerar planilha'
      toast.error(msg)
    } finally {
      setGerandoXls(false)
    }
  }

  const updateFornecedor = useCallback((idx: number, novoNome: string) => {
    // ... (mesmo código anterior, mas incluí aqui para contexto de onde inserir a nova função)
    setDadosEditados((prev) => {
      const next = [...prev]
      const original = next[idx].matchFornecedor?.nomeOriginal || next[idx].fornecedor
      next[idx] = {
        ...next[idx],
        fornecedor: novoNome,
        matchFornecedor: {
          nomeOriginal: original,
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
  }, [])

  const updateCategoria = useCallback(async (idx: number, novaCategoria: string) => {
    setDadosEditados((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], categoria: novaCategoria }
      return next
    })

    // Lógica de "Aprendizado": Salvar no banco para este fornecedor
    if (empresaAtiva) {
      const conta = dadosEditados[idx]
      const nomeFornecedor = conta.matchFornecedor?.nomeCorrigido || conta.fornecedor
      
      try {
        await supabase
          .from('fornecedores_contaazul')
          .update({ categoria_padrao: novaCategoria })
          .eq('empresa_id', empresaAtiva.id)
          .eq('nome', nomeFornecedor)
        
        toast.success(`Categoria '${novaCategoria}' salva para ${nomeFornecedor}`, { id: 'learn-cat' })
      } catch (err) {
        console.error('Erro ao salvar categoria padrão:', err)
      }
    }
  }, [empresaAtiva, dadosEditados, supabase])
 
  const updateConta = useCallback(async (idx: number, novaConta: string) => {
    setDadosEditados((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], conta_financeira: novaConta }
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

    // Lógica de "Aprendizado" em Lote
    if (empresaAtiva) {
      const fornecedoresAfetados = Array.from(new Set(
        indices.map(idx => {
          const d = dadosEditados[idx]
          return d.matchFornecedor?.nomeCorrigido || d.fornecedor
        })
      ))

      try {
        await supabase
          .from('fornecedores_contaazul')
          .update({ categoria_padrao: novaCategoria })
          .eq('empresa_id', empresaAtiva.id)
          .in('nome', fornecedoresAfetados)
        
        toast.success(`Categoria salva para ${fornecedoresAfetados.length} fornecedores`, { id: 'learn-cat-lote' })
      } catch (err) {
        console.error('Erro ao salvar categoria padrão em lote:', err)
      }
    }
    setSelecionados(new Set())
  }

  const updateContaEmLote = async (indices: number[], novaConta: string) => {
    if (!novaConta.trim()) return

    setDadosEditados((prev) => {
      const next = [...prev]
      indices.forEach(idx => {
        next[idx] = { ...next[idx], conta_financeira: novaConta }
      })
      return next
    })
    setSelecionados(new Set())
  }

  const executarEnvioContaAzul = async (empresaId: string) => {
    setEnviandoCA(true)
    try {
      const res = await fetch('/api/conta-azul/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresa_id: empresaId, limite: 50 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao enviar')
      if (data.enviados > 0) toast.success(`${data.enviados} contas enviadas com sucesso!`, { duration: 5000 })
      if (data.erros > 0) toast.error(`${data.erros} contas com erro. Verifique o status na tabela.`, { duration: 5000 })
      if (data.enviados === 0 && data.erros === 0) toast('Nenhuma conta pendente para enviar.', { icon: 'ℹ️' })
      if (data.pendentes_restantes > 0) toast(`Ainda restam ${data.pendentes_restantes} pendentes. Clique novamente para enviar mais.`, { icon: '📋', duration: 5000 })
    } catch (err: any) {
      toast.error(err.message || 'Erro ao enviar para o Conta Azul')
    } finally {
      setEnviandoCA(false)
      setShowModalEnvio(false)
      setRefreshContas(prev => prev + 1)
    }
  }

  const valorSelecionado = dadosEditados
    .filter((_, i) => selecionados.has(i))
    .reduce((sum, c) => sum + (c.valor || 0), 0)

  return (
    <>
    {/* Modal de confirmação de envio */}
    {showModalEnvio && (
      <ModalEnvioContaAzul
        empresaAtiva={empresaAtiva}
        todasEmpresas={empresas}
        loginAtual={userEmail}
        onConfirmar={executarEnvioContaAzul}
        onCancelar={() => setShowModalEnvio(false)}
        enviando={enviandoCA}
      />
    )}

    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">Contas a Pagar</h1>
            <span className="px-2 py-0.5 bg-dark-700 text-dark-400 text-[10px] font-mono rounded border border-dark-600">
              v1.2
            </span>
          </div>
          <p className="text-dark-400 text-sm mt-1">
            {empresaAtiva ? `Empresa: ${empresaAtiva.nome}` : 'Selecione uma empresa no menu superior'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {etapa !== 'upload' && (
            <button
              onClick={() => { setEtapa('upload'); setResultado(null); setDadosEditados([]) }}
              className="flex items-center gap-2 text-dark-400 hover:text-white text-sm px-3 py-2 rounded-lg hover:bg-dark-800 transition-all"
            >
              <ArrowLeft size={16} /> Voltar
            </button>
          )}
          {etapa === 'contas' && (
            <button
              onClick={() => setEtapa('upload')}
              className="flex items-center gap-2 bg-dark-800 hover:bg-dark-700 border border-dark-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
            >
              <Upload size={16} /> Novo Upload
            </button>
          )}
        </div>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2">
        {(['upload', 'preview', 'contas'] as Etapa[]).map((e, i) => {
          const labels = ['1. Upload', '2. Revisão', '3. Contas']
          const isActive = etapa === e
          const isDone = ['upload', 'preview', 'contas'].indexOf(etapa) > i
          return (
            <div key={e} className="flex items-center gap-2">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                isActive ? 'bg-brand-600 text-white' :
                isDone ? 'bg-green-600/20 text-green-400' :
                'bg-dark-800 text-dark-500'
              }`}>
                {isDone && <CheckCircle size={12} />}
                {labels[i]}
              </div>
              {i < 2 && <div className="w-8 h-px bg-dark-700" />}
            </div>
          )
        })}
      </div>

      {/* ETAPA 1: Upload */}
      {etapa === 'upload' && (
        <div className="space-y-4">
          {!empresaAtiva ? (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 flex items-center gap-3">
              <AlertCircle size={18} className="text-yellow-400 flex-shrink-0" />
              <p className="text-yellow-300 text-sm">
                Selecione uma empresa no menu superior antes de importar.
              </p>
            </div>
          ) : null}
          <DropZone onResultado={handleResultado} />
          <div className="bg-dark-800/50 border border-dark-700 rounded-xl p-4">
            <p className="text-sm text-dark-400 font-medium mb-2">💡 Formatos suportados:</p>
            <ul className="text-xs text-dark-500 space-y-1">
              <li>• <strong className="text-dark-300">Excel (.xlsx)</strong> — Relatório DataCar CpRl010 (Previsão de Pagamentos)</li>
              <li>• <strong className="text-dark-300">CSV (.csv)</strong> — Arquivo com colunas: FORNECEDOR, VALOR, VENCIMENTO</li>
              <li>• <strong className="text-dark-300">PDF (.pdf)</strong> — Extração automática de texto</li>
              <li>• <strong className="text-dark-300">Imagem (.png, .jpg)</strong> — Recomendamos converter para Excel para maior precisão</li>
            </ul>
          </div>
        </div>
      )}

      {/* ETAPA 2: Preview */}
      {etapa === 'preview' && resultado && (
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
          />


          {/* Ações */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-dark-800 border border-dark-700 rounded-xl p-4">
            <p className="text-sm text-dark-400">
              <span className="text-white font-semibold">{selecionados.size}</span> registros selecionados •{' '}
              <span className="text-green-400 font-semibold">{formatCurrency(valorSelecionado)}</span>
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => handleBaixarXls('preview')}
                disabled={gerandoXls || selecionados.size === 0}
                className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed
                           text-white px-5 py-2.5 rounded-lg font-semibold flex items-center gap-2 transition-all"
                title="Gera o arquivo .xls no modelo do ContaAzul sem salvar no banco"
              >
                {gerandoXls ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
                Baixar XLS ContaAzul
              </button>

              <button
                onClick={handleSalvar}
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
      )}

      {/* ETAPA 3: Contas Salvas */}
      {etapa === 'contas' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-lg font-semibold text-white">Contas Importadas</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={async () => {
                  if (!empresaAtiva) { toast.error('Selecione uma empresa'); return }
                  if (!empresaAtiva.access_token_conta_azul) {
                    toast.error('Empresa não está conectada ao Conta Azul. Vá em Empresas e conecte primeiro.')
                    return
                  }
                  if (!confirm('Enviar todas as contas PENDENTES para o Conta Azul?')) return
                  setEnviandoCA(true)
                  try {
                    const res = await fetch('/api/conta-azul/enviar', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ empresa_id: empresaAtiva.id, limite: 50 }),
                    })
                    const data = await res.json()
                    if (!res.ok) throw new Error(data.error || 'Erro ao enviar')
                    if (data.enviados > 0) {
                      toast.success(`${data.enviados} contas enviadas com sucesso!`, { duration: 5000 })
                    }
                    if (data.erros > 0) {
                      toast.error(`${data.erros} contas com erro. Verifique o status na tabela.`, { duration: 5000 })
                    }
                    if (data.enviados === 0 && data.erros === 0) {
                      toast('Nenhuma conta pendente para enviar.', { icon: 'ℹ️' })
                    }
                    if (data.pendentes_restantes > 0) {
                      toast(`Ainda restam ${data.pendentes_restantes} pendentes. Clique novamente para enviar mais.`, { icon: '📋', duration: 5000 })
                    }
                  } catch (err: any) {
                    toast.error(err.message || 'Erro ao enviar para o Conta Azul')
                  } finally {
                    setEnviandoCA(false)
                    setRefreshContas(prev => prev + 1)
                  }
                }}
                disabled={enviandoCA}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all shadow-lg shadow-blue-900/20"
              >
                {enviandoCA ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                {enviandoCA ? 'Enviando...' : 'Enviar ao Conta Azul'}
              </button>
              <button
                onClick={() => handleBaixarXls('salvas')}
                disabled={gerandoXls}
                className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-all"
              >
                {gerandoXls ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
                Exportar XLS para ContaAzul
              </button>
            </div>
          </div>
          <TabelaContas key={refreshContas} empresaId={empresaAtiva?.id} />
        </div>
      )}
    </div>
    </>
  )
}