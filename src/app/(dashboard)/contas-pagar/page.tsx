'use client'

import { useState, useCallback } from 'react'
import { useEmpresa } from '@/contexts/EmpresaContext'
import { createClient } from '@/lib/supabase/client'
import DropZone from '@/components/upload/DropZone'
import TabelaPreview from '@/components/upload/TabelaPreview'
import TabelaContas from '@/components/upload/TabelaContas'
import type { ContaPagarPreview, ResultadoImportacao } from '@/types'
import {
  Upload, Send, Save, ArrowLeft, Loader2,
  CheckCircle, AlertCircle, FileDown
} from 'lucide-react'
import toast from 'react-hot-toast'
import { formatCurrency } from '@/lib/utils'

type Etapa = 'upload' | 'preview' | 'contas'

export default function ContasPagarPage() {
  const { empresaAtiva } = useEmpresa()
  const [etapa, setEtapa] = useState<Etapa>('upload')
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null)
  const [dadosEditados, setDadosEditados] = useState<ContaPagarPreview[]>([])
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set())
  const [salvando, setSalvando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [progressoEnvio, setProgressoEnvio] = useState({ atual: 0, total: 0, erros: 0 })
  const supabase = createClient()

  const handleResultado = useCallback((res: ResultadoImportacao) => {
    setResultado(res)
    setDadosEditados(res.dados)
    // Pré-selecionar apenas os válidos
    const validos = new Set<number>(
      res.dados.reduce((acc: number[], d, i) => { if (d.valido) acc.push(i); return acc }, [])
    )
    setSelecionados(validos)
    setEtapa('preview')
  }, [])

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
          status: 'pendente',
        }))

      const { error } = await supabase
        .from('contas_pagar_importadas')
        .insert(itens)

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

  const handleEnviarContaAzul = async () => {
    if (!empresaAtiva) { toast.error('Selecione uma empresa primeiro'); return }

    setEnviando(true)
    setProgressoEnvio({ atual: 0, total: 0, erros: 0 })

    try {
      // Buscar contas pendentes da empresa
      const { data: contas, error } = await supabase
        .from('contas_pagar_importadas')
        .select('*')
        .eq('empresa_id', empresaAtiva.id)
        .eq('status', 'pendente')

      if (error) throw error
      if (!contas || contas.length === 0) {
        toast('Nenhuma conta pendente para enviar', { icon: 'ℹ️' })
        return
      }

      setProgressoEnvio({ atual: 0, total: contas.length, erros: 0 })

      const res = await fetch('/api/conta-azul/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empresa_id: empresaAtiva.id,
          contas_ids: contas.map((c) => c.id),
        }),
      })

      const data = await res.json()

      if (!res.ok) throw new Error(data.error || 'Erro ao enviar')

      setProgressoEnvio({ atual: data.enviados, total: contas.length, erros: data.erros })

      if (data.erros > 0) {
        toast(`${data.enviados} enviados, ${data.erros} com erro`, { icon: '⚠️', duration: 6000 })
      } else {
        toast.success(`${data.enviados} contas enviadas ao Conta Azul!`)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao enviar'
      toast.error(msg)
    } finally {
      setEnviando(false)
    }
  }

  const valorSelecionado = dadosEditados
    .filter((_, i) => selecionados.has(i))
    .reduce((s, d) => s + d.valor, 0)

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Contas a Pagar</h1>
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
          />

          {/* Ações */}
          <div className="flex items-center justify-between bg-dark-800 border border-dark-700 rounded-xl p-4">
            <p className="text-sm text-dark-400">
              <span className="text-white font-semibold">{selecionados.size}</span> registros selecionados •{' '}
              <span className="text-green-400 font-semibold">{formatCurrency(valorSelecionado)}</span>
            </p>
            <button
              onClick={handleSalvar}
              disabled={salvando || selecionados.size === 0 || !empresaAtiva}
              className="bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed
                         text-white px-6 py-3 rounded-lg font-semibold flex items-center gap-2 transition-all
                         shadow-lg shadow-brand-900/30"
            >
              {salvando ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              Confirmar e Salvar
            </button>
          </div>
        </div>
      )}

      {/* ETAPA 3: Contas salvas */}
      {etapa === 'contas' && (
        <div className="space-y-4">
          {/* Botão enviar Conta Azul */}
          {empresaAtiva && (
            <div className="bg-gradient-to-r from-green-900/30 to-brand-900/20 border border-green-600/30 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <p className="text-white font-semibold">Enviar ao Conta Azul</p>
                <p className="text-dark-400 text-sm">Todas as contas pendentes serão enviadas via API</p>
                {enviando && (
                  <p className="text-brand-300 text-xs mt-1">
                    Processando {progressoEnvio.atual}/{progressoEnvio.total}...
                  </p>
                )}
              </div>
              <button
                onClick={handleEnviarContaAzul}
                disabled={enviando || !empresaAtiva}
                className="bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed
                           text-white px-8 py-3.5 rounded-xl font-bold flex items-center gap-3
                           transition-all shadow-lg shadow-green-900/40 text-base whitespace-nowrap"
              >
                {enviando ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <Send size={20} />
                )}
                Enviar para Conta Azul
              </button>
            </div>
          )}

          <TabelaContas empresaId={empresaAtiva?.id} />
        </div>
      )}
    </div>
  )
}
