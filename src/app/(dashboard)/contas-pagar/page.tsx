'use client'

import { useState, useCallback } from 'react'
import { useEmpresa } from '@/contexts/EmpresaContext'
import { createClient } from '@/lib/supabase/client'
import DropZone from '@/components/upload/DropZone'
import TabelaPreview from '@/components/upload/TabelaPreview'
import TabelaContas from '@/components/upload/TabelaContas'
import type { ContaPagarPreview, ResultadoImportacao } from '@/types'
import {
  Upload, Save, ArrowLeft, Loader2,
  CheckCircle, AlertCircle, FileDown
} from 'lucide-react'
import toast from 'react-hot-toast'
import { formatCurrency } from '@/lib/utils'
import { exportarParaContaAzulXls } from '@/lib/exporters/contaazul-xls'
import { matchFornecedoresEmLote } from '@/lib/utils/match-fornecedor'
import type { FornecedorContaAzul } from '@/lib/parsers/fornecedores-contaazul'

type Etapa = 'upload' | 'preview' | 'contas'

export default function ContasPagarPage() {
  const { empresaAtiva } = useEmpresa()
  const [etapa, setEtapa] = useState<Etapa>('upload')
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null)
  const [dadosEditados, setDadosEditados] = useState<ContaPagarPreview[]>([])
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set())
  const [salvando, setSalvando] = useState(false)
  const [gerandoXls, setGerandoXls] = useState(false)
  const supabase = createClient()

  const handleResultado = useCallback(async (res: ResultadoImportacao) => {
    // Tentar buscar fornecedores do ContaAzul para fazer match automático de nomes
    let dadosComMatch = res.dados
    if (empresaAtiva) {
      try {
        const { data: fornecedoresDB } = await supabase
          .from('fornecedores_contaazul')
          .select('nome, cnpj, nome_normalizado')
          .eq('empresa_id', empresaAtiva.id)

        if (fornecedoresDB && fornecedoresDB.length > 0) {
          const fornecedores: FornecedorContaAzul[] = fornecedoresDB.map((f) => ({
            nome: f.nome,
            cnpj: f.cnpj || '',
            nomeNormalizado: f.nome_normalizado,
          }))

          const nomesDatacar = res.dados.map((d) => d.fornecedor)
          const matchMap = matchFornecedoresEmLote(nomesDatacar, fornecedores)

          dadosComMatch = res.dados.map((d) => {
            const match = matchMap.get(d.fornecedor)
            if (!match) return d
            return {
              ...d,
              // Aplica o nome corrigido automaticamente se confiança >= alto
              fornecedor: match.confianca === 'exato' || match.confianca === 'alto'
                ? match.nomeCorrigido
                : d.fornecedor,
              matchFornecedor: match,
            }
          })

          // Contar quantos foram corrigidos
          const corrigidos = dadosComMatch.filter(
            (d) => d.matchFornecedor && d.matchFornecedor.nomeOriginal !== d.matchFornecedor.nomeCorrigido
              && (d.matchFornecedor.confianca === 'exato' || d.matchFornecedor.confianca === 'alto')
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

  const handleSalvar = async () => {
    if (!empresaAtiva) { toast.error('Selecione uma empresa primeiro'); return }
    if (selecionados.size === 0) { toast.error('Selecione ao menos um registro'); return }

    setSalvando(true)
    try {
      const itens = dadosEditados
        .filter((_, i) => selecionados.has(i))
        .map((d) => ({
          empresa_id: empresaAtiva.id,
          fornecedor: d.fornecedor,
          valor: d.valor,
          vencimento: d.vencimento || new Date().toISOString().split('T')[0],
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
        // Exportar os itens selecionados da tela de preview
        contas = dadosEditados.filter((_, i) => selecionados.has(i))
      } else {
        // Exportar as contas pendentes já salvas no banco
        if (!empresaAtiva) { toast.error('Selecione uma empresa primeiro'); return }
        const { data, error } = await supabase
          .from('contas_pagar_importadas')
          .select('*')
          .eq('empresa_id', empresaAtiva.id)
          .eq('status', 'pendente')
          .order('vencimento', { ascending: true })

        if (error) throw error
        if (!data || data.length === 0) {
          toast('Nenhuma conta pendente para exportar', { icon: 'ℹ️' })
          return
        }

        contas = data.map((c) => ({
          fornecedor: c.fornecedor,
          valor: Number(c.valor),
          vencimento: c.vencimento,
          descricao: c.descricao || undefined,
          doc: c.doc || undefined,
          emissao: c.emissao || undefined,
          valido: true,
        }))
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

  const valorSelecionado = dadosEditados
    .filter((_, i) => selecionados.has(i))
    .reduce((s, d) => s + d.valor, 0)

  return (


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
          {/* Resumo */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-dark-800 border border-dark-700 rounded-xl p-4">
              <p className="text-dark-400 text-xs mb-1">Total encontrado</p>
              <p className="text-white text-2xl font-bold">{resultado.total}</p>
            </div>
            <div className="bg-dark-800 border border-green-500/20 rounded-xl p-4">
              <p className="text-dark-400 text-xs mb-1">Válidos</p>
              <p className="text-green-400 text-2xl font-bold">{resultado.validos}</p>
            </div>
            <div className="bg-dark-800 border border-red-500/20 rounded-xl p-4">
              <p className="text-dark-400 text-xs mb-1">Com erro</p>
              <p className="text-red-400 text-2xl font-bold">{resultado.invalidos}</p>
            </div>
            <div className="bg-dark-800 border border-brand-500/20 rounded-xl p-4">
              <p className="text-dark-400 text-xs mb-1">Valor selecionado</p>
              <p className="text-brand-400 text-xl font-bold">{formatCurrency(valorSelecionado)}</p>
            </div>
          </div>

          {/* Tabela de preview */}
          <TabelaPreview
            dados={dadosEditados}
            selecionados={selecionados}
            onToggle={toggleItem}
            onToggleTodos={toggleTodos}
            onRemover={removerItem}
            onUpdateFornecedor={updateFornecedor}
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
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Contas Importadas</h2>
            <button
              onClick={() => handleBaixarXls('salvas')}
              disabled={gerandoXls}
              className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all"
            >
              {gerandoXls ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
              Exportar XLS para ContaAzul
            </button>
          </div>
          <TabelaContas empresaId={empresaAtiva?.id} />

        </div>
      )}
    </div>
  )
}