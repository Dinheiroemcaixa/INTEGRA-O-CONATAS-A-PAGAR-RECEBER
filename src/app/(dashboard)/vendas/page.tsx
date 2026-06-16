'use client'

import { useState, useCallback, useEffect } from 'react'
import { useEmpresa } from '@/contexts/EmpresaContext'
import { createClient } from '@/lib/supabase/client'
import DropZoneVendas from '@/components/upload/DropZoneVendas'
import TabelaVendasPreview from '@/components/upload/TabelaVendasPreview'
import SelectorEmpresa from '@/components/layout/SelectorEmpresa'
import type { VendaPreview, ResultadoImportacaoVendas } from '@/types'
import {
  Upload, ArrowLeft, Loader2,
  CheckCircle, AlertCircle, Send, ShoppingCart
} from 'lucide-react'
import toast from 'react-hot-toast'

type Etapa = 'upload' | 'preview'

export default function VendasPage() {
  const { empresaAtiva } = useEmpresa()
  const [etapa, setEtapa] = useState<Etapa>('upload')
  const [resultado, setResultado] = useState<ResultadoImportacaoVendas | null>(null)
  const [dadosEditados, setDadosEditados] = useState<VendaPreview[]>([])
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set())
  const [enviandoCA, setEnviandoCA] = useState(false)
  const supabase = createClient()

  const handleResultado = useCallback(async (res: ResultadoImportacaoVendas) => {
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
    if (selecionados.size === validosIdx.length) {
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

  const handleEnviarContaAzul = async () => {
    if (!empresaAtiva) { toast.error('Selecione uma empresa primeiro'); return }
    if (selecionados.size === 0) { toast.error('Selecione ao menos uma venda'); return }

    setEnviandoCA(true)
    try {
      const itensParaEnviar = dadosEditados.filter((_, i) => selecionados.has(i))
      
      const res = await fetch('/api/conta-azul/enviar-vendas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empresa_id: empresaAtiva.id,
          vendas: itensParaEnviar
        }),
      })
      
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao enviar vendas')
      
      if (data.sucessos > 0) toast.success(`${data.sucessos} vendas enviadas com sucesso!`)
      if (data.erros > 0) toast.error(`${data.erros} vendas com erro. Verifique os logs.`)
      
      setEtapa('upload')
      setResultado(null)
      setDadosEditados([])
      setSelecionados(new Set())
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao enviar para o Conta Azul'
      toast.error(msg)
    } finally {
      setEnviandoCA(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <ShoppingCart className="text-brand-500" />
              Vendas
            </h1>
            <span className="px-2 py-0.5 bg-brand-500/20 text-brand-400 text-[10px] font-bold rounded border border-brand-500/30 uppercase tracking-wider">
              Novo Módulo
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <SelectorEmpresa />
          {etapa !== 'upload' && (
            <button
              onClick={() => { setEtapa('upload'); setResultado(null); setDadosEditados([]) }}
              className="flex items-center gap-2 text-dark-400 hover:text-white text-sm px-3 py-2 rounded-lg hover:bg-dark-800 transition-all"
            >
              <ArrowLeft size={16} /> Voltar
            </button>
          )}
        </div>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2">
        {(['upload', 'preview'] as Etapa[]).map((e, i) => {
          const labels = ['1. Upload da Planilha', '2. Revisão e Envio']
          const isActive = etapa === e
          const isDone = ['upload', 'preview'].indexOf(etapa) > i
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
              {i < 1 && <div className="w-8 h-px bg-dark-700" />}
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
                Selecione uma empresa no menu superior antes de importar vendas.
              </p>
            </div>
          ) : null}
          <DropZoneVendas onResultado={handleResultado} />
          <div className="bg-dark-800/50 border border-dark-700 rounded-xl p-4">
            <p className="text-sm text-dark-400 font-medium mb-2">💡 Formatos suportados e regras de extração:</p>
            <ul className="text-xs text-dark-500 space-y-1">
              <li>• <strong className="text-dark-300">Excel (.xlsx)</strong> — Planilha com layout de Vendas (OS/PED, CLIENTE, ENCERR, Pagamentos, Itens)</li>
              <li>• Serão importados os itens classificados como produto <strong className="text-brand-400">("P")</strong> na coluna TIPO.</li>
              <li>• O <strong className="text-dark-300">Cliente</strong> será vinculado via Conta Azul ou criado se não existir.</li>
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
              <p className="text-dark-400 text-xs mb-1">Total de Vendas</p>
              <p className="text-white text-2xl font-bold">{dadosEditados.length}</p>
            </div>
            <div className="bg-dark-800 border border-green-500/20 rounded-xl p-4">
              <p className="text-dark-400 text-xs mb-1">Válidas</p>
              <p className="text-green-400 text-2xl font-bold">
                {dadosEditados.filter(d => d.valido).length}
              </p>
            </div>
          </div>

          <TabelaVendasPreview
            dados={dadosEditados}
            selecionados={selecionados}
            onToggleSelec={toggleItem}
            onToggleTodos={toggleTodos}
            onRemover={removerItem}
          />

          <div className="flex items-center justify-between p-4 bg-dark-800 border border-dark-700 rounded-xl mt-4">
            <p className="text-dark-300 text-sm">
              <strong className="text-white">{selecionados.size}</strong> vendas selecionadas para envio.
            </p>
            <button
              onClick={handleEnviarContaAzul}
              disabled={enviandoCA || selecionados.size === 0 || !empresaAtiva}
              className="bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all shadow-lg"
            >
              {enviandoCA ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              {enviandoCA ? 'Enviando...' : 'Criar Vendas no Conta Azul'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
