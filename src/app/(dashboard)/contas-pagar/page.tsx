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

  const valorSelecionado = dadosEditados
    .filter((_, i) => selecionados.has(i))
    .reduce((s, d) => s + d.valor, 0)

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
            <h1 className="text-2xl font-bold text-white tracking-tight">Contas a Pagar</h1>
            <span className="px-2 py-0.5 bg-dark-800 text-dark-400 text-[10px] font-mono rounded-lg border border-dark-700">
              v1.2
            </span>
          </div>
          <p className="text-dark-400 text-sm mt-0.5 flex items-center gap-1.5">
            {empresaAtiva ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                {empresaAtiva.nome}
              </>
            ) : 'Selecione uma empresa no menu superior'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {etapa !== 'upload' && (
            <button
              onClick={() => { setEtapa('upload'); setResultado(null); setDadosEditados([]) }}
              className="flex items-center gap-2 text-dark-400 hover:text-white text-sm px-3 py-2 rounded-xl hover:bg-dark-800 border border-transparent hover:border-dark-700 transition-all"
            >
              <ArrowLeft size={15} /> Voltar
            </button>
          )}
          {etapa === 'contas' && (
            <button
              onClick={() => setEtapa('upload')}
              className="flex items-center gap-2 bg-dark-800 hover:bg-dark-700 border border-dark-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
            >
              <Upload size={15} /> Novo Upload
            </button>
          )}
        </div>
      </div>

      {/* Stepper moderno */}
      <div className="flex items-center gap-1">
        {(['upload', 'preview', 'contas'] as Etapa[]).map((e, i) => {
          const labels = ['Upload', 'Revisão', 'Contas']
          const icons = [Upload, CheckCircle, Send]
          const isActive = etapa === e
          const isDone = ['upload', 'preview', 'contas'].indexOf(etapa) > i
          const Icon = icons[i]
          return (
            <div key={e} className="flex items-center gap-1">
              <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                isActive
                  ? 'bg-brand-600 text-white shadow-lg shadow-brand-900/30'
                  : isDone
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                  : 'bg-dark-800 text-dark-500 border border-dark-700'
              }`}>
                <Icon size={12} />
                {i + 1}. {labels[i]}
              </div>
              {i < 2 && (
                <div className={`w-6 h-px mx-1 ${isDone ? 'bg-emerald-500/40' : 'bg-dark-700'}`} />
              )}
            </div>
          )
        })}
      </div>

      {/* ETAPA 1: Upload */}
      {etapa === 'upload' && (
        <div className="space-y-4">
   