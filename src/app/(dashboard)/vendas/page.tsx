'use client'

import { useState, useCallback, useEffect } from 'react'
import { useEmpresa } from '@/contexts/EmpresaContext'
import { createClient } from '@/lib/supabase/client'
import DropZoneVendas from '@/components/upload/DropZoneVendas'
import TabelaVendasPreview from '@/components/upload/TabelaVendasPreview'
import ModalEditarVenda from '@/components/upload/ModalEditarVenda'
import ModalEditarDatacar from '@/components/upload/ModalEditarDatacar'
import ModalDetalheVendaDatacar from '@/components/upload/ModalDetalheVendaDatacar'
import ModalVendasCliente from '@/components/upload/ModalVendasCliente'
import SelectorEmpresa from '@/components/layout/SelectorEmpresa'
import PainelAgendamento from '@/components/agendamento/PainelAgendamento'
import type { VendaPreview, ResultadoImportacaoVendas } from '@/types'
import {
  FileCheck, UploadCloud, UserCheck,
  Upload, ArrowLeft, Loader2,
  CheckCircle, AlertCircle, Send, ShoppingCart,
  Database, RefreshCw, ChevronDown, ChevronUp,
  Trash2, FileSpreadsheet, BookOpen,
  Search, Calendar, ExternalLink, FileText, Download,
  Layers, PackageCheck
} from 'lucide-react'
import toast from 'react-hot-toast'

type Etapa = 'upload' | 'preview'
type SubAba = 'datacar' | 'emitidas' | 'planilha'

interface VendaImportada {
  id: string
  cliente: string
  cliente_cpf_cnpj?: string | null
  cliente_endereco?: any
  os_numero: string
  data_venda: string | null
  valor_total: number
  desconto_total?: number
  forma_pagamento: string | null
  itens: Array<{
    codigo: string
    descricao: string
    quantidade: number
    valor_unitario: number
    valor_unitario_original?: number
    desconto?: number
    valor_total?: number
    tipo?: 'produto' | 'servico'
    ncm?: string
    cest?: string
    origem?: string
    tipo_produto?: string
    unidade_medida?: string
  }>
  status: string
  cliente_ja_cadastrado?: boolean
  ca_status?: string
  _datacar?: Record<string, any> | null
  dados_datacar?: Record<string, any> | null
  created_at?: string
  metadata?: Record<string, any> | null
}

interface NotaProdutoEmitida {
  id: string
  cliente: string
  os_numero: string
  data_venda: string | null
  valor_total: number
  status: 'enviado' | 'cancelado'
  erro_mensagem: string | null
  metadata: any
  dados_datacar: any
  updated_at: string
  created_at: string
  conta_azul_id: string | null
}

export default function VendasPage() {
  const { empresaAtiva } = useEmpresa()
  const supabase = createClient()

  // Sub-aba ativa: Datacar | NF-e Emitidas (Histórico Conta Azul) | Planilha
  const [subAba, setSubAba] = useState<SubAba>('datacar')

  // ─── Estado da sub-aba Datacar ───────────────────────────────
  const hoje = new Date().toISOString().split('T')[0]
  const primeiroDia = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  
  const [dtIni, setDtIni] = useState(primeiroDia)
  const [dtFim, setDtFim] = useState(hoje)
  const [buscando, setBuscando] = useState(false)
  const [tipoPeriodoVendas, setTipoPeriodoVendas] = useState<'criacao' | 'previsao' | 'conclusao' | 'encerramento' | 'cancelamento'>('encerramento')
  const [situacaoVendas, setSituacaoVendas] = useState<'todas' | 'em_andamento' | 'concluida' | 'encerrada' | 'cancelada'>('todas')
  const [numeroOS, setNumeroOS] = useState('')
  const [filtroTipoItens, setFiltroTipoItens] = useState<'tudo' | 'produtos' | 'servicos'>('produtos')

  const [vendasDatacar, setVendasDatacar] = useState<VendaImportada[]>([])
  const [selecionadosDatacar, setSelecionadosDatacar] = useState<Set<string>>(new Set())
  const [expandidoDatacar, setExpandidoDatacar] = useState<string | null>(null)
  const [enviandoDatacar, setEnviandoDatacar] = useState(false)
  const [editandoDatacarId, setEditandoDatacarId] = useState<string | null>(null)
  const [detalheVendaDatacar, setDetalheVendaDatacar] = useState<VendaImportada | null>(null)
  const [modalVendasCliente, setModalVendasCliente] = useState<{ open: boolean, cpfCnpj: string }>({ open: false, cpfCnpj: '' })

  // ─── Estado da sub-aba NF-e Emitidas (Conta Azul) ───────────
  const [notasEmitidas, setNotasEmitidas] = useState<NotaProdutoEmitida[]>([])
  const [carregandoNotas, setCarregandoNotas] = useState(false)
  const [buscaEmitidas, setBuscaEmitidas] = useState('')
  const [dtIniEmitidas, setDtIniEmitidas] = useState(primeiroDia)
  const [dtFimEmitidas, setDtFimEmitidas] = useState(hoje)

  // ─── Estado do Upload de Planilha Fiscal ───────────────────
  const [showPlanilhaFiscal, setShowPlanilhaFiscal] = useState(false)
  const [uploadingPlanilha, setUploadingPlanilha] = useState(false)
  const [resultadoPlanilha, setResultadoPlanilha] = useState<{
    salvos: number; erros: number; ignorados: number;
    totalLinhas: number; familiasEncontradas: number;
    exemplos: string[];
  } | null>(null)

  // ─── Estado da sub-aba Planilha (Upload normal) ──────────────
  const [etapa, setEtapa] = useState<Etapa>('upload')
  const [resultado, setResultado] = useState<ResultadoImportacaoVendas | null>(null)
  const [dadosEditados, setDadosEditados] = useState<VendaPreview[]>([])
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set())
  const [editandoIdx, setEditandoIdx] = useState<number | null>(null)
  const [enviandoCA, setEnviandoCA] = useState(false)

  // Carrega histórico de notas emitidas no Conta Azul
  const carregarNotasEmitidas = useCallback(async () => {
    if (!empresaAtiva) return
    setCarregandoNotas(true)
    try {
      const params = new URLSearchParams({
        empresa_id: empresaAtiva.id,
        tipo: 'produtos',
        data_inicio: dtIniEmitidas,
        data_fim: dtFimEmitidas,
        busca: buscaEmitidas
      })
      const res = await fetch(`/api/notas-emitidas?${params.toString()}`)
      if (!res.ok) throw new Error('Erro ao buscar histórico de NF-e')
      const data = await res.json()
      setNotasEmitidas(data.notas || [])
    } catch (err) {
      console.error(err)
    } finally {
      setCarregandoNotas(false)
    }
  }, [empresaAtiva, dtIniEmitidas, dtFimEmitidas, buscaEmitidas])

  useEffect(() => {
    carregarNotasEmitidas()
  }, [empresaAtiva, carregarNotasEmitidas])

  useEffect(() => {
    if (subAba === 'emitidas') {
      carregarNotasEmitidas()
    }
  }, [subAba, carregarNotasEmitidas])

  // ─── Handlers Datacar ────────────────────────────────────────
  const buscarDatacar = async () => {
    if (!empresaAtiva) {
      toast.error('Selecione uma empresa primeiro')
      return
    }

    if (!empresaAtiva.datacar_token) {
      toast.error(`A empresa "${empresaAtiva.nome}" não possui o Token do Datacar configurado.`)
      return
    }

    setBuscando(true)
    try {
      const res = await fetch('/api/datacar/buscar-vendas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empresa_id: empresaAtiva.id,
          dtIni: dtIni,
          dtFim: dtFim,
          data_inicio: dtIni,
          data_fim: dtFim,
          tipoPeriodo: tipoPeriodoVendas,
          tipo_periodo: tipoPeriodoVendas,
          situacao: situacaoVendas,
          numeroOS: numeroOS.trim() || undefined,
          numero_os: numeroOS.trim() || undefined,
          tipo_itens: 'produtos'
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao buscar dados no Datacar')

      const lista = (data.dados || data.vendas || []).map((item: any, idx: number) => ({
        ...item,
        id: String(item.id || item._datacar?.venda_Id || item.os_numero || `venda_${idx}_${Date.now()}`),
        status: item.status || 'pendente'
      }))

      setVendasDatacar(lista)
      const pendentes = lista.filter((item: any) => item.status === 'pendente')
      setSelecionadosDatacar(new Set(pendentes.map((item: any) => item.id)))

      if (lista.length === 0) {
        toast('Nenhuma venda de produtos encontrada para o período informado.', { icon: '🔍' })
      } else {
        toast.success(`${lista.length} OS de produtos encontradas!`)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao buscar dados no Datacar'
      toast.error(msg)
    } finally {
      setBuscando(false)
    }
  }

  const toggleSelecionadoDatacar = (id: string) => {
    setSelecionadosDatacar(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const toggleTodosDatacar = () => {
    const pendentes = vendasDatacar.filter(v => v.status === 'pendente')
    if (selecionadosDatacar.size === pendentes.length) {
      setSelecionadosDatacar(new Set())
    } else {
      setSelecionadosDatacar(new Set(pendentes.map(v => v.id)))
    }
  }

  const removerVendaDatacar = async (id: string) => {
    const { error } = await supabase.from('vendas_importadas').delete().eq('id', id)
    if (error) {
      toast.error('Erro ao remover venda: ' + error.message)
      return
    }
    setVendasDatacar(prev => prev.filter(v => v.id !== id))
    setSelecionadosDatacar(prev => { const next = new Set(prev); next.delete(id); return next })
    toast.success('Venda removida')
  }

  // Envio ao Conta Azul
  const handleEnviarDatacarParaCA = async () => {
    if (!empresaAtiva) { toast.error('Selecione uma empresa primeiro'); return }
    if (!empresaAtiva.access_token_conta_azul_vendas) {
      toast.error(`O Conta Azul Vendas não está conectado para ${empresaAtiva.nome}. Conecte antes de enviar.`)
      return
    }
    if (selecionadosDatacar.size === 0) { toast.error('Selecione ao menos uma venda'); return }

    setEnviandoDatacar(true)
    try {
      const vendasParaEnviar = vendasDatacar
        .filter(v => selecionadosDatacar.has(v.id))
        .map(v => {
          let itensFiltrados = v.itens || []
          if (filtroTipoItens === 'produtos') {
            itensFiltrados = itensFiltrados.filter(i => i.tipo === 'produto' || !i.tipo)
          } else if (filtroTipoItens === 'servicos') {
            itensFiltrados = itensFiltrados.filter(i => i.tipo === 'servico')
          }
          const valorTotalRecalculado = itensFiltrados.reduce((acc, i) => acc + (i.valor_unitario * i.quantidade), 0)
          return {
            ...v,
            itens: itensFiltrados,
            valor_total: valorTotalRecalculado
          }
        })
        .filter(v => v.itens.length > 0)

      if (vendasParaEnviar.length === 0) {
        setEnviandoDatacar(false)
        toast.error('Não há itens válidos para enviar com o filtro atual.')
        return
      }

      let sucessosTotais = 0
      let errosTotais = 0
      const detalhesErros: string[] = []
      const idsSucesso = new Set<string>()
      const idsClientesExistentes = new Set<string>()

      for (const venda of vendasParaEnviar) {
        try {
          const res = await fetch('/api/conta-azul/enviar-vendas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              empresa_id: empresaAtiva.id,
              vendas: [venda]
            }),
          })
          const data = await res.json()
          if (res.ok && data.sucessos > 0) {
            sucessosTotais++
            idsSucesso.add(venda.id)
            if (data.detalhesClientesExistentes && Array.isArray(data.detalhesClientesExistentes) && data.detalhesClientesExistentes.length > 0) {
              idsClientesExistentes.add(venda.id)
            }
          } else {
            errosTotais++
            detalhesErros.push(`OS ${venda.os_numero}: ${data.error || 'Erro na API do Conta Azul'}`)
          }
        } catch (err: any) {
          errosTotais++
          detalhesErros.push(`OS ${venda.os_numero}: ${err.message || 'Erro de comunicação'}`)
        }
      }

      if (sucessosTotais > 0) {
        toast.success(`${sucessosTotais} vendas sincronizadas com sucesso no Conta Azul!`)
        setVendasDatacar(prev => prev.map(v => {
          if (idsSucesso.has(v.id)) {
            return { 
              ...v, 
              status: 'enviado',
              cliente_ja_cadastrado: idsClientesExistentes.has(v.id) || v.cliente_ja_cadastrado
            }
          }
          return v
        }))
        setSelecionadosDatacar(prev => {
          const next = new Set(prev)
          idsSucesso.forEach(id => next.delete(id))
          return next
        })
        carregarNotasEmitidas()
      }

      if (errosTotais > 0) {
        toast.error(`${errosTotais} vendas com erro.`)
        detalhesErros.slice(0, 3).forEach(m => toast.error(m, { duration: 6000 }))
      }

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao enviar para o Conta Azul'
      toast.error(msg)
    } finally {
      setEnviandoDatacar(false)
    }
  }

  // ─── Handlers Planilha ───────────────────────────────────────
  const handleUploadPlanilhaFiscal = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !empresaAtiva) return

    setUploadingPlanilha(true)
    setResultadoPlanilha(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('empresa_id', empresaAtiva.id)

      const res = await fetch('/api/memoria-fiscal/importar-planilha', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao importar planilha fiscal')

      setResultadoPlanilha(data)
      toast.success(`Planilha processada! ${data.salvos} famílias cadastradas.`)
    } catch (err: any) {
      toast.error(err.message || 'Erro ao importar planilha')
    } finally {
      setUploadingPlanilha(false)
      e.target.value = ''
    }
  }

  const handleResultado = useCallback(async (res: ResultadoImportacaoVendas) => {
    setResultado(res)
    setDadosEditados(res.dados)
    const validos = new Set<number>(
      res.dados.reduce((acc: number[], d, i) => { if (d.valido) acc.push(i); return acc }, [])
    )
    setSelecionados(validos)
    setEtapa('preview')
  }, [])

  const handleSaveEdicao = (vendaAtualizada: VendaPreview) => {
    if (editandoIdx !== null) {
      setDadosEditados(prev => {
        const novos = [...prev]
        novos[editandoIdx] = vendaAtualizada
        return novos
      })
      setEditandoIdx(null)
      toast.success('Venda atualizada com sucesso!')
    }
  }

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

      if (data.sucessos > 0) {
        toast.success(`${data.sucessos} vendas enviadas ao Conta Azul com sucesso!`)
        if (data.detalhesClientesExistentes && Array.isArray(data.detalhesClientesExistentes) && data.detalhesClientesExistentes.length > 0) {
          data.detalhesClientesExistentes.forEach((aviso: string) => {
            toast(aviso, {
              icon: '👤',
              duration: 8000,
              style: {
                background: '#0f172a',
                color: '#38bdf8',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                fontSize: '13px',
                fontWeight: 500
              }
            })
          })
        }
        setEtapa('upload')
        setResultado(null)
        setDadosEditados([])
        setSelecionados(new Set())
        carregarNotasEmitidas()
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao enviar para o Conta Azul'
      toast.error(msg)
    } finally {
      setEnviandoCA(false)
    }
  }

  // ─── Métricas e KPIs de NF-e ─────────────────────────────────
  const formatCurrency = (val: number) =>
    val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  const formatDate = (dt: string | null) => {
    if (!dt) return '-'
    try {
      const d = new Date(dt + 'T12:00:00')
      if (isNaN(d.getTime())) return dt
      return d.toLocaleDateString('pt-BR')
    } catch { return dt }
  }

  const totalFaturadoNfe = notasEmitidas.reduce((acc, n) => acc + (Number(n.valor_total) || 0), 0)
  const pendenteCount = vendasDatacar.filter(v => v.status === 'pendente').length
  const caVendasConectado = Boolean(empresaAtiva?.access_token_conta_azul_vendas)

  // ─── Render ──────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <ShoppingCart className="text-blue-500" />
              Vendas Produtos (NF-e Conta Azul)
            </h1>
            <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-[10px] font-bold rounded border border-blue-500/30 uppercase tracking-wider">
              Módulo de Peças & Produtos
            </span>
          </div>
          <p className="text-dark-400 text-xs mt-0.5">
            Sincronização de vendas de produtos e emissão de NF-e via Conta Azul.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <SelectorEmpresa />
          {subAba === 'planilha' && etapa !== 'upload' && (
            <button
              onClick={() => { setEtapa('upload'); setResultado(null); setDadosEditados([]) }}
              className="flex items-center gap-2 text-dark-400 hover:text-white text-sm px-3 py-2 rounded-lg hover:bg-dark-800 transition-all"
            >
              <ArrowLeft size={16} /> Voltar
            </button>
          )}
        </div>
      </div>


      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* 3 SUB-ABAS INTEGRADAS (PADRÃO PILL SWITCHER FINTECH)           */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <div className="bg-dark-900/60 p-1.5 rounded-2xl border border-dark-700/80 flex items-center gap-1 shadow-inner max-w-2xl">
        <button
          onClick={() => setSubAba('datacar')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold transition-all duration-200 ${
            subAba === 'datacar'
              ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.2)]'
              : 'text-dark-400 hover:text-white hover:bg-dark-800/50'
          }`}
        >
          <Database size={15} className={subAba === 'datacar' ? 'text-blue-400' : ''} />
          <span>Datacar (A Enviar)</span>
          {pendenteCount > 0 && (
            <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full font-black">
              {pendenteCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setSubAba('emitidas')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold transition-all duration-200 ${
            subAba === 'emitidas'
              ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.2)]'
              : 'text-dark-400 hover:text-white hover:bg-dark-800/50'
          }`}
        >
          <FileCheck size={15} className={subAba === 'emitidas' ? 'text-emerald-400' : ''} />
          <span>NF-e Emitidas (Conta Azul)</span>
          {notasEmitidas.length > 0 && (
            <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-black">
              {notasEmitidas.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setSubAba('planilha')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold transition-all duration-200 ${
            subAba === 'planilha'
              ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.2)]'
              : 'text-dark-400 hover:text-white hover:bg-dark-800/50'
          }`}
        >
          <UploadCloud size={15} className={subAba === 'planilha' ? 'text-blue-400' : ''} />
          <span>Upload Planilha</span>
        </button>
      </div>

      
      {/* ══════════════════════════════════════════════════════
          SUB-ABA 1: IMPORTADAS DO DATACAR (A ENVIAR)
      ══════════════════════════════════════════════════════ */}
      {subAba === 'datacar' && (
        <div className="space-y-4">
          {!empresaAtiva ? (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 flex items-center gap-3">
              <AlertCircle size={18} className="text-yellow-400 flex-shrink-0" />
              <p className="text-yellow-300 text-sm">
                Selecione uma empresa no menu superior para ver as vendas importadas.
              </p>
            </div>
          ) : (
            <>
              {/* Painel de Agendamento Automático */}
              {empresaAtiva.datacar_token && (
                <PainelAgendamento tipo="vendas" />
              )}

              {/* Aviso caso CA Vendas não esteja conectado */}
              {!caVendasConectado && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fade-in">
                  <div className="flex items-center gap-2.5">
                    <AlertCircle size={18} className="text-amber-400 flex-shrink-0" />
                    <p className="text-amber-200 text-xs">
                      A loja <strong className="text-white">{empresaAtiva.nome}</strong> não possui integração com o <strong>Conta Azul Vendas</strong> conectada. Conecte para poder sincronizar vendas e emitir NF-e.
                    </p>
                  </div>
                  <a
                    href={`/conectar?empresa_id=${empresaAtiva.id}&modulo=vendas`}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 flex-shrink-0 transition-all shadow-sm"
                  >
                    <ExternalLink size={12} />
                    Conectar CA Vendas
                  </a>
                </div>
              )}

              {/* Formulário de Busca do Datacar */}
              <div className="bg-dark-800 border border-dark-700 rounded-xl p-5 animate-fade-in">
                <div className="flex items-center justify-between flex-wrap gap-3 mb-4 pb-3 border-b border-dark-700/50">
                  <div className="flex items-center gap-2 text-white font-semibold">
                    <Database size={18} className="text-blue-400" />
                    <h3>Buscar Vendas do Datacar {empresaAtiva ? `— ${empresaAtiva.nome}` : ''}</h3>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowPlanilhaFiscal(!showPlanilhaFiscal)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-dark-900 hover:bg-dark-700 border border-blue-500/30 text-blue-400 hover:text-white transition-all flex items-center gap-1.5 shadow-sm"
                      title="Importar ou atualizar planilha de NCM e CEST para vinculação automática"
                    >
                      <FileSpreadsheet size={14} />
                      Base Fiscal (NCM/CEST)
                    </button>

                    <div className="flex items-center gap-1 bg-dark-900/80 p-1 rounded-xl border border-dark-700/60">
                      <button
                        type="button"
                        onClick={() => setFiltroTipoItens('tudo')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          filtroTipoItens === 'tudo'
                            ? 'bg-brand-600 text-white shadow-md'
                            : 'text-dark-400 hover:text-white'
                        }`}
                      >
                        🛍️ Todos os Itens
                      </button>
                      <button
                        type="button"
                        onClick={() => setFiltroTipoItens('produtos')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          filtroTipoItens === 'produtos'
                            ? 'bg-blue-600 text-white shadow-md'
                            : 'text-dark-400 hover:text-white'
                        }`}
                      >
                        📦 Apenas Produtos
                      </button>
                    </div>
                  </div>
                </div>
                
                {showPlanilhaFiscal && (
                  <div className="mb-4 p-4 bg-dark-900/90 border border-blue-500/30 rounded-xl space-y-3 animate-fade-in">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet size={16} className="text-blue-400" />
                        <span className="text-xs font-bold text-white">Importar Planilha Fiscal (NCM / CEST)</span>
                      </div>
                      <span className="text-[11px] text-dark-400">Suporta .xlsx, .xls, .csv com colunas de Descrição e NCM</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={handleUploadPlanilhaFiscal}
                        disabled={uploadingPlanilha}
                        className="block w-full text-xs text-dark-400 file:mr-3 file:py-1.5 file:px-3.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-500 cursor-pointer bg-dark-950 rounded-lg p-1 border border-dark-700"
                      />
                      {uploadingPlanilha && (
                        <div className="flex items-center gap-2 text-xs text-blue-400 font-semibold whitespace-nowrap">
                          <Loader2 size={14} className="animate-spin" />
                          Processando base...
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex items-end gap-4 flex-wrap">
                  {/* Tipo Período */}
                  <div>
                    <label className="text-xs font-medium mb-1 block text-dark-400">Tipo período:</label>
                    <select
                      value={tipoPeriodoVendas}
                      onChange={(e) => setTipoPeriodoVendas(e.target.value as any)}
                      disabled={!!numeroOS}
                      className={`bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-blue-500/50 outline-none ${numeroOS ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <option value="criacao">Criação/Abertura</option>
                      <option value="previsao">Previsão</option>
                      <option value="conclusao">Conclusão</option>
                      <option value="encerramento">Encerramento</option>
                      <option value="cancelamento">Cancelamento</option>
                    </select>
                  </div>

                  {/* Datas */}
                  <div>
                    <label className="text-xs font-medium mb-1 block text-dark-400">Data Início</label>
                    <div className="relative">
                      <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
                      <input
                        type="date"
                        value={dtIni}
                        onChange={(e) => setDtIni(e.target.value)}
                        className="bg-dark-900 border border-dark-600 rounded-lg pl-10 pr-3 py-2 text-white text-sm focus:ring-2 focus:ring-blue-500/50 outline-none w-40"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1 block text-dark-400">Data Fim</label>
                    <div className="relative">
                      <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
                      <input
                        type="date"
                        value={dtFim}
                        onChange={(e) => setDtFim(e.target.value)}
                        className="bg-dark-900 border border-dark-600 rounded-lg pl-10 pr-3 py-2 text-white text-sm focus:ring-2 focus:ring-blue-500/50 outline-none w-40"
                      />
                    </div>
                  </div>

                  {/* Situação e OS */}
                  <div>
                    <label className="text-xs font-medium mb-1 block text-dark-400">Situação:</label>
                    <select
                      value={situacaoVendas}
                      onChange={(e) => setSituacaoVendas(e.target.value as any)}
                      className="bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-blue-500/50 outline-none"
                    >
                      <option value="todas">Todas</option>
                      <option value="em_andamento">Em Andamento</option>
                      <option value="concluida">Concluída</option>
                      <option value="encerrada">Encerrada</option>
                      <option value="cancelada">Cancelada</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="text-xs font-medium mb-1 block text-dark-400">Buscar por OS/Pedido:</label>
                    <input
                      type="text"
                      placeholder="Ex: 12345"
                      value={numeroOS}
                      onChange={(e) => setNumeroOS(e.target.value)}
                      className="bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-blue-500/50 outline-none w-32"
                    />
                  </div>

                  {/* Botão Buscar */}
                  <button
                    onClick={buscarDatacar}
                    disabled={buscando}
                    className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors shadow-lg"
                  >
                    {buscando ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                    {buscando ? 'Buscando...' : 'Buscar'}
                  </button>
                </div>
              </div>

              {/* Loading */}
              {buscando && (
                <div className="flex items-center justify-center py-16">
                  <Loader2 size={28} className="animate-spin text-blue-400" />
                </div>
              )}

              {/* Sem vendas */}
              {!buscando && vendasDatacar.length === 0 && (
                <div className="bg-dark-800 border border-dark-700 rounded-xl p-12 text-center">
                  <Database size={40} className="text-dark-600 mx-auto mb-3" />
                  <p className="text-dark-400 text-sm font-medium">
                    Faça uma busca para ver as vendas de produtos do Datacar.
                  </p>
                </div>
              )}

              {/* Título de Resultados da Busca */}
              {!buscando && vendasDatacar.length > 0 && (
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-white font-bold text-sm tracking-wide">Resultados da Busca ({vendasDatacar.length})</h3>
                </div>
              )}

              
              {/* Lista de vendas com Layout Rico de Alta Densidade */}
              {!buscando && vendasDatacar.length > 0 && (
                <div className="space-y-3">
                  {/* Barra de Controle de Seleção */}
                  <div className="flex items-center justify-between px-4 py-3 bg-dark-850 border border-dark-700/80 rounded-2xl shadow-sm">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={
                          selecionadosDatacar.size > 0 &&
                          selecionadosDatacar.size === vendasDatacar.filter(v => v.status === 'pendente').length
                        }
                        onChange={toggleTodosDatacar}
                        className="w-4 h-4 rounded border-dark-600 bg-dark-900 text-blue-500 focus:ring-blue-500"
                      />
                      <span className="text-xs text-dark-300 font-semibold">
                        Selecionar todas as pendentes (<strong className="text-white">{selecionadosDatacar.size}</strong> de {vendasDatacar.length})
                      </span>
                    </div>

                    {selecionadosDatacar.size > 0 && (
                      <button
                        onClick={handleEnviarDatacarParaCA}
                        disabled={enviandoDatacar}
                        className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-blue-600/25 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-lg"
                      >
                        {enviandoDatacar ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                        {enviandoDatacar ? 'Aguarde...' : `⚡ Enviar para Conta Azul (${selecionadosDatacar.size})`}
                      </button>
                    )}
                  </div>

                  {/* Cards de cada Ordem de Serviço */}
                  <div className="space-y-3">
                    {vendasDatacar.map(venda => {
                      const isExpanded = expandidoDatacar === venda.id
                      const isSelected = selecionadosDatacar.has(venda.id)
                      const dDatacar = venda._datacar || venda.dados_datacar || {}
                      const veiculo = dDatacar.veiculo || ''
                      const vendedor = dDatacar.vendedor || ''
                      const totalProdutos = (venda.itens || []).filter((i: any) => i.tipo === 'produto').reduce((acc: number, i: any) => acc + (Number(i.valor_total) || 0), 0)
                      const totalServicos = (venda.itens || []).filter((i: any) => i.tipo === 'servico').reduce((acc: number, i: any) => acc + (Number(i.valor_total) || 0), 0)
                      const totalDesconto = (venda.itens || []).reduce((acc: number, i: any) => acc + ((Number(i.desconto) || 0) * (Number(i.quantidade) || 1)), 0)

                      return (
                        <div 
                          key={venda.id}
                          className={`border rounded-2xl transition-all duration-200 overflow-hidden ${
                            isSelected 
                              ? 'border-blue-500/40 bg-dark-850/95 shadow-[0_0_15px_rgba(59,130,246,0.1)]' 
                              : 'border-dark-700/80 bg-dark-850/80 hover:border-dark-600'
                          }`}
                        >
                          {/* Cabeçalho Principal do Card da OS */}
                          <div 
                            className="p-4 cursor-pointer flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                            onClick={() => setExpandidoDatacar(isExpanded ? null : venda.id)}
                          >
                            <div className="flex items-start gap-3.5 flex-1 min-w-0">
                              <div className="pt-1" onClick={(e) => e.stopPropagation()}>
                                {venda.status === 'pendente' ? (
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleSelecionadoDatacar(venda.id)}
                                    className="w-4 h-4 rounded border-dark-600 bg-dark-900 text-blue-500 focus:ring-blue-500"
                                  />
                                ) : (
                                  <CheckCircle size={18} className="text-emerald-400 flex-shrink-0" />
                                )}
                              </div>

                              <div className="space-y-1.5 flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono font-bold text-white text-sm">
                                    OS #{venda.os_numero}
                                  </span>
                                  {veiculo && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                                      🚗 {veiculo}
                                    </span>
                                  )}
                                  
                                  {venda.forma_pagamento && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                                      💳 {venda.forma_pagamento}
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-2 text-xs flex-wrap">
                                  <span className="text-white font-bold truncate max-w-[280px]">
                                    {venda.cliente}
                                  </span>
                                  {venda.cliente_cpf_cnpj && (
                                    <span className="text-dark-400 font-mono text-[11px]">
                                      • {venda.cliente_cpf_cnpj}
                                    </span>
                                  )}
                                  {(venda.cliente_ja_cadastrado || venda.ca_status === 'cliente_existente') && (
                                    <span 
                                      title="Este cliente já possui cadastro ativo no Conta Azul (identificado por CPF/CNPJ)"
                                      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-400/60 shadow-[0_0_12px_rgba(245,158,11,0.25)] tracking-wide"
                                    >
                                      <UserCheck size={12} className="text-amber-400" />
                                      Já cadastrado no CA
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Resumo Financeiro da OS */}
                            <div className="flex items-center justify-between lg:justify-end gap-6 border-t lg:border-t-0 border-dark-700/50 pt-3 lg:pt-0">
                              <div className="text-left lg:text-right space-y-0.5">
                                <div className="flex items-center gap-2 text-[11px] text-dark-400">
                                  <span>Peças: <strong className="text-white">{formatCurrency(totalProdutos)}</strong></span>
                                  <span>•</span>
                                  <span>Serviços: <strong className="text-white">{formatCurrency(totalServicos)}</strong></span>
                                </div>
                                {totalDesconto > 0 && (
                                  <p className="text-[11px] text-rose-400 font-semibold">
                                    Desconto: -{formatCurrency(totalDesconto)}
                                  </p>
                                )}
                                <p className="text-base font-black text-white tabular-nums drop-shadow-sm">
                                  {formatCurrency(venda.valor_total)}
                                </p>
                              </div>

                              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => setEditandoDatacarId(venda.id)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-300 bg-blue-600/15 hover:bg-blue-600/25 border border-blue-500/30 rounded-xl transition-all"
                                  title="Editar Dados e Descontos da Venda"
                                >
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removerVendaDatacar(venda.id)}
                                  className="p-2 text-dark-500 hover:text-rose-400 bg-dark-900 hover:bg-rose-500/10 border border-dark-700 hover:border-rose-500/30 rounded-xl transition-all"
                                  title="Remover OS da lista"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Seção Expandida com Tabela de Itens e Descontos */}
                          {isExpanded && (
                            <div className="bg-dark-950/60 border-t border-dark-700/80 p-5 space-y-4 animate-fade-in">
                              <div className="flex items-center justify-between">
                                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                                  📦 Detalhamento de Peças e Serviços ({venda.itens?.length || 0})
                                </h4>
                                <span className="text-xs text-dark-400 font-mono">
                                  Data da OS: {formatDate(venda.data_venda)}
                                </span>
                              </div>

                              <div className="overflow-x-auto rounded-xl border border-dark-700/60">
                                <table className="w-full text-left text-xs border-collapse">
                                  <thead>
                                    <tr className="bg-dark-900 text-dark-400 font-bold uppercase tracking-wider text-[10px] border-b border-dark-700/80">
                                      <th className="py-2.5 px-3">Tipo</th>
                                      <th className="py-2.5 px-3">Código</th>
                                      <th className="py-2.5 px-3">Descrição</th>
                                      <th className="py-2.5 px-3 text-center">Qtd</th>
                                      <th className="py-2.5 px-3 text-right">Vl Bruto</th>
                                      <th className="py-2.5 px-3 text-right text-rose-400">Desconto</th>
                                      <th className="py-2.5 px-3 text-right text-emerald-400">Vl Líquido</th>
                                      <th className="py-2.5 px-3 text-right font-bold text-white">Total</th>
                                      <th className="py-2.5 px-3">NCM / CEST</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-dark-700/50">
                                    {(venda.itens || []).map((item: any, idxItem: number) => {
                                      const vBruto = Number(item.valor_unitario_original !== undefined ? item.valor_unitario_original : item.valor_unitario) || 0
                                      const desc = Number(item.desconto) || 0
                                      const vLiq = Number(item.valor_unitario) || 0
                                      const totalItem = Number(item.valor_total) || (item.quantidade * vLiq)

                                      return (
                                        <tr key={idxItem} className="hover:bg-dark-900/40 transition-colors">
                                          <td className="p-2.5">
                                            <span className={`px-2 py-0.5 rounded text-[9px] font-black ${
                                              item.tipo === 'servico'
                                                ? 'bg-slate-800 text-slate-300 border border-slate-700'
                                                : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                            }`}>
                                              {item.tipo === 'servico' ? 'SERVIÇO' : 'PEÇA'}
                                            </span>
                                          </td>
                                          <td className="p-2.5 font-mono text-dark-300 text-[11px]">{item.codigo || '-'}</td>
                                          <td className="p-2.5 font-medium text-white">{item.descricao}</td>
                                          <td className="p-2.5 text-center font-bold text-white">{item.quantidade} {item.unidade_medida || 'UN'}</td>
                                          <td className="p-2.5 text-right font-mono text-dark-300">{formatCurrency(vBruto)}</td>
                                          <td className="p-2.5 text-right font-mono text-rose-400">
                                            {desc > 0 ? `-${formatCurrency(desc * item.quantidade)}` : '-'}
                                          </td>
                                          <td className="p-2.5 text-right font-mono text-emerald-400 font-semibold">{formatCurrency(vLiq)}</td>
                                          <td className="p-2.5 text-right font-mono font-bold text-white tabular-nums">{formatCurrency(totalItem)}</td>
                                          <td className="p-2.5 text-dark-400 font-mono text-[10px]">
                                            {item.ncm ? `NCM: ${item.ncm}` : '-'} {item.cest ? `| CEST: ${item.cest}` : ''}
                                          </td>
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Rodapé da Lista com Ações em Lote */}
                  <div className="flex items-center justify-between px-5 py-4 bg-dark-850 border border-dark-700/80 rounded-2xl shadow-sm text-sm">
                    <p className="text-dark-400">
                      <strong className="text-white">{selecionadosDatacar.size}</strong> de <strong className="text-white">{vendasDatacar.length}</strong> OS selecionadas
                    </p>
                    {selecionadosDatacar.size > 0 && (
                      <button
                        onClick={handleEnviarDatacarParaCA}
                        disabled={enviandoDatacar}
                        className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-blue-600/25 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-lg"
                      >
                        {enviandoDatacar ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                        {enviandoDatacar ? 'Aguarde...' : `⚡ Enviar para Conta Azul (${selecionadosDatacar.size})`}
                      </button>
                    )}
                  </div>
                </div>
              )}

            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          SUB-ABA 2: NF-E EMITIDAS (HISTÓRICO CONTA AZUL)
      ══════════════════════════════════════════════════════ */}
      {subAba === 'emitidas' && (
        <div className="space-y-4 animate-fade-in">
          {/* Barra de Filtros */}
          <div className="bg-dark-800 border border-dark-700 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-[280px]">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
                <input
                  type="text"
                  placeholder="Pesquisar por cliente, número ou chave de acesso da NF-e..."
                  value={buscaEmitidas}
                  onChange={e => setBuscaEmitidas(e.target.value)}
                  className="w-full bg-dark-900 border border-dark-600 rounded-lg pl-9 pr-3 py-2 text-white text-xs outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 text-xs text-dark-400">
                <span>Período:</span>
                <input
                  type="date"
                  value={dtIniEmitidas}
                  onChange={e => setDtIniEmitidas(e.target.value)}
                  className="bg-dark-900 border border-dark-600 rounded-lg px-2.5 py-1.5 text-white text-xs outline-none"
                />
                <span>até</span>
                <input
                  type="date"
                  value={dtFimEmitidas}
                  onChange={e => setDtFimEmitidas(e.target.value)}
                  className="bg-dark-900 border border-dark-600 rounded-lg px-2.5 py-1.5 text-white text-xs outline-none"
                />
              </div>

              <button
                onClick={carregarNotasEmitidas}
                disabled={carregandoNotas}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-700 hover:bg-dark-600 text-white rounded-lg text-xs font-semibold transition-colors"
              >
                <RefreshCw size={13} className={carregandoNotas ? 'animate-spin' : ''} />
                Atualizar
              </button>
            </div>
          </div>

          {/* Tabela de NF-e Emitidas */}
          {carregandoNotas ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={32} className="animate-spin text-blue-400" />
            </div>
          ) : notasEmitidas.length === 0 ? (
            <div className="bg-dark-800 border border-dark-700 rounded-xl p-12 text-center">
              <FileText size={40} className="text-dark-600 mx-auto mb-3" />
              <h3 className="text-white font-bold text-sm">Nenhuma NF-e encontrada</h3>
              <p className="text-dark-400 text-xs mt-1">
                As vendas de produtos sincronizadas e emitidas no Conta Azul aparecerão aqui.
              </p>
            </div>
          ) : (
            <div className="bg-dark-800 border border-dark-700 rounded-xl overflow-hidden shadow-lg">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-dark-900/60 border-b border-dark-700 text-dark-400 font-bold uppercase tracking-wider">
                      <th className="py-3 px-4">NF-e / Venda CA</th>
                      <th className="py-3 px-4">Cliente / Destinatário</th>
                      <th className="py-3 px-4">Data Emissão</th>
                      <th className="py-3 px-4 text-right">Valor Total</th>
                      <th className="py-3 px-4 text-center">Situação</th>
                      <th className="py-3 px-4 text-right">Chave / Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dark-700/50">
                    {notasEmitidas.map((nota) => {
                      const isCancelada = nota.status === 'cancelado'
                      const chave = nota.metadata?.chave_acesso || nota.dados_datacar?.chave_acesso
                      return (
                        <tr key={nota.id} className="hover:bg-dark-750/30 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-white">
                            <span className="text-blue-400">NF-e #{nota.os_numero}</span>
                          </td>
                          <td className="py-3 px-4 font-medium text-white">
                            {nota.cliente}
                            {nota.metadata?.cliente_cpf_cnpj && (
                              <span className="block text-[10px] text-dark-400 font-mono">
                                {nota.metadata.cliente_cpf_cnpj}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-dark-300 font-mono">
                            {formatDate(nota.data_venda)}
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-white tabular-nums">
                            {formatCurrency(nota.valor_total)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                              isCancelada 
                                ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' 
                                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            }`}>
                              {isCancelada ? '● CANCELADA' : '● FATURADA'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            {chave ? (
                              <a
                                href={`/api/notas-emitidas/xml?empresa_id=${empresaAtiva?.id}&chave=${chave}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-dark-700 hover:bg-dark-600 text-blue-400 hover:text-white rounded text-xs font-semibold transition-colors"
                                title="Baixar XML oficial da NF-e"
                              >
                                <Download size={13} />
                                XML
                              </a>
                            ) : (
                              <span className="text-[10px] text-dark-500 font-mono">
                                ID CA: {nota.conta_azul_id ? String(nota.conta_azul_id).slice(0, 8) : '—'}
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          SUB-ABA 3: UPLOAD DE PLANILHA
      ══════════════════════════════════════════════════════ */}
      {subAba === 'planilha' && (
        <div className="space-y-6 animate-fade-in">
          {etapa === 'upload' ? (
            <div className="space-y-6">
              <DropZoneVendas onResultado={handleResultado} />
              
              <div className="bg-dark-800/40 border border-dark-700/50 rounded-2xl p-5">
                <div className="flex items-center justify-between cursor-pointer" onClick={() => setShowPlanilhaFiscal(!showPlanilhaFiscal)}>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                      <FileSpreadsheet size={18} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">Importar Base Fiscal (NCM / CEST)</h4>
                      <p className="text-xs text-dark-400">Vincule regras fiscais de produtos a partir de planilhas.</p>
                    </div>
                  </div>
                  {showPlanilhaFiscal ? <ChevronUp size={16} className="text-dark-400" /> : <ChevronDown size={16} className="text-dark-400" />}
                </div>

                {showPlanilhaFiscal && (
                  <div className="mt-4 pt-4 border-t border-dark-700 space-y-3">
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleUploadPlanilhaFiscal}
                      disabled={uploadingPlanilha}
                      className="block w-full text-xs text-dark-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-500 cursor-pointer"
                    />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <TabelaVendasPreview
                dados={dadosEditados}
                selecionados={selecionados}
                onToggleSelec={toggleItem}
                onToggleTodos={toggleTodos}
                onRemover={removerItem}
                onEditar={(idx) => setEditandoIdx(idx)}
              />
              <div className="flex items-center justify-between bg-dark-850 p-4 rounded-xl border border-dark-700">
                <button
                  type="button"
                  onClick={() => { setEtapa('upload'); setDadosEditados([]); setSelecionados(new Set()) }}
                  className="px-4 py-2 text-sm text-dark-300 hover:text-white bg-dark-800 rounded-lg border border-dark-700 hover:border-dark-600 transition-colors"
                >
                  Cancelar / Nova Planilha
                </button>
                <button
                  type="button"
                  onClick={handleEnviarContaAzul}
                  disabled={enviandoCA || selecionados.size === 0}
                  className="px-6 py-2.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white font-medium rounded-xl transition-colors shadow-lg shadow-brand-600/20 flex items-center gap-2"
                >
                  {enviandoCA ? <Loader2 size={16} className="animate-spin" /> : null}
                  Enviar {selecionados.size} Vendas para Conta Azul
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL: EDITAR VENDA DATACAR */}
      {editandoDatacarId && (
        <ModalEditarDatacar
          vendaId={editandoDatacarId}
          venda={vendasDatacar.find(v => v.id === editandoDatacarId)!}
          empresaId={empresaAtiva?.id}
          onClose={() => setEditandoDatacarId(null)}
          onSaveSuccess={(vendaAtualizada: any) => {
            setVendasDatacar(prev => prev.map(v => v.id === vendaAtualizada.id ? vendaAtualizada : v))
            setEditandoDatacarId(null)
            toast.success('Venda atualizada com sucesso!')
          }}
        />
      )}

      {/* MODAL: DETALHES DE ITENS */}
      {detalheVendaDatacar && (
        <ModalDetalheVendaDatacar
          venda={detalheVendaDatacar}
          onClose={() => setDetalheVendaDatacar(null)}
          onEdit={() => {
            setEditandoDatacarId(detalheVendaDatacar.id)
            setDetalheVendaDatacar(null)
          }}
          onVerVendasAnteriores={(cpfCnpj: string) => {
            setModalVendasCliente({ open: true, cpfCnpj })
          }}
        />
      )}

      {/* MODAL: VENDAS CLIENTE */}
      {modalVendasCliente.open && (
        <ModalVendasCliente
          cpfCnpj={modalVendasCliente.cpfCnpj}
          empresaId={empresaAtiva?.id || ''}
          onClose={() => setModalVendasCliente({ open: false, cpfCnpj: '' })}
        />
      )}
    </div>
  )
}
