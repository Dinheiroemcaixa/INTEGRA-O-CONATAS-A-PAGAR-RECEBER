'use client'

import { useState, useCallback, useEffect } from 'react'
import { useEmpresa } from '@/contexts/EmpresaContext'
import { createClient } from '@/lib/supabase/client'
import DropZoneVendas from '@/components/upload/DropZoneVendas'
import TabelaVendasPreview from '@/components/upload/TabelaVendasPreview'
import ModalEditarVenda from '@/components/upload/ModalEditarVenda'
import ModalEditarDatacar from '@/components/upload/ModalEditarDatacar'
import ModalDetalheVendaDatacar from '@/components/upload/ModalDetalheVendaDatacar'
import ModalPreviewEmissao from '@/components/upload/ModalPreviewEmissao'
import SelectorEmpresa from '@/components/layout/SelectorEmpresa'
import PainelAgendamento from '@/components/agendamento/PainelAgendamento'
import type { VendaPreview, ResultadoImportacaoVendas } from '@/types'
import {
  Upload, ArrowLeft, Loader2,
  CheckCircle, AlertCircle, Send, ShoppingCart,
  Database, RefreshCw, ChevronDown, ChevronUp,
  Trash2, FileSpreadsheet, BookOpen,
  Search, Calendar, ExternalLink, FileText, Eye, Printer, X,
  XCircle, AlertTriangle, Download, ShieldCheck
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
  _datacar?: Record<string, any> | null
  dados_datacar?: Record<string, any> | null
  created_at?: string
  metadata?: Record<string, any> | null
}

interface NotaServicoEmitida {
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

export default function VendasServicosPage() {
  const { empresaAtiva } = useEmpresa()
  const supabase = createClient()

  // Sub-aba ativa: Datacar | NFS-e Emitidas (Histórico Gov.br) | Planilha
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
  const [filtroTipoItens, setFiltroTipoItens] = useState<'tudo' | 'produtos' | 'servicos'>('servicos')

  const [vendasDatacar, setVendasDatacar] = useState<VendaImportada[]>([])
  const [selecionadosDatacar, setSelecionadosDatacar] = useState<Set<string>>(new Set())
  const [expandidoDatacar, setExpandidoDatacar] = useState<string | null>(null)
  const [enviandoDatacar, setEnviandoDatacar] = useState(false)
  const [editandoDatacarId, setEditandoDatacarId] = useState<string | null>(null)
  const [detalheVendaDatacar, setDetalheVendaDatacar] = useState<VendaImportada | null>(null)
  const [showPreviewEmissao, setShowPreviewEmissao] = useState(false)
  
  // ─── Estado das Alíquotas Padrão & Certificado ────────────────
  const [aliquotaSimples, setAliquotaSimples] = useState('11.34')
  const [aliquotaIssqn, setAliquotaIssqn] = useState('')
  const [temCertificado, setTemCertificado] = useState(false)

  // ─── Estado da sub-aba NFS-e Emitidas (Histórico Gov.br) ─────
  const [notasEmitidas, setNotasEmitidas] = useState<NotaServicoEmitida[]>([])
  const [carregandoNotas, setCarregandoNotas] = useState(false)
  const [buscaEmitidas, setBuscaEmitidas] = useState('')
  const [dtIniEmitidas, setDtIniEmitidas] = useState(primeiroDia)
  const [dtFimEmitidas, setDtFimEmitidas] = useState(hoje)
  const [notaVisualizar, setNotaVisualizar] = useState<NotaServicoEmitida | null>(null)
  const [confirmandoCancelar, setConfirmandoCancelar] = useState<NotaServicoEmitida | null>(null)
  const [cancelando, setCancelando] = useState(false)

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

  // Carrega configuração fiscal da empresa ativa
  const carregarConfigFiscal = useCallback(() => {
    if (empresaAtiva) {
      fetch(`/api/config-fiscal?empresa_id=${empresaAtiva.id}`)
        .then(r => r.json())
        .then(data => {
          if (data?.config) {
            if (data.config.aliquota_simples_nacional) setAliquotaSimples(String(data.config.aliquota_simples_nacional))
            if (data.config.aliquota_issqn) setAliquotaIssqn(String(data.config.aliquota_issqn))
          }
          setTemCertificado(Boolean(data?.temCertificado))
        })
        .catch(console.error)
    }
  }, [empresaAtiva])

  const [sincronizandoGovBr, setSincronizandoGovBr] = useState(false)

  const handleSincronizarGovBr = async () => {
    if (!empresaAtiva) return
    if (!temCertificado) {
      toast.error('Certificado Digital A1 não configurado para esta empresa. Faça o upload do certificado nas configurações fiscais.')
      return
    }

    setSincronizandoGovBr(true)
    const tId = toast.loading('Consultando e sincronizando notas no Gov.br com Certificado A1...')
    try {
      const res = await fetch('/api/gov-br/sincronizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empresa_id: empresaAtiva.id,
          data_inicio: dtIniEmitidas,
          data_fim: dtFimEmitidas,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao sincronizar com Gov.br')

      toast.success(data.mensagem || 'Sincronização concluída com sucesso!', { id: tId })
      await carregarNotasEmitidas()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao sincronizar com Gov.br', { id: tId })
    } finally {
      setSincronizandoGovBr(false)
    }
  }

  // Carrega histórico de notas emitidas
  const carregarNotasEmitidas = useCallback(async () => {
    if (!empresaAtiva) return
    setCarregandoNotas(true)
    try {
      const params = new URLSearchParams({
        empresa_id: empresaAtiva.id,
        tipo: 'servicos',
        data_inicio: dtIniEmitidas,
        data_fim: dtFimEmitidas,
        busca: buscaEmitidas
      })
      const res = await fetch(`/api/notas-emitidas?${params.toString()}`)
      if (!res.ok) throw new Error('Erro ao buscar histórico de NFS-e')
      const data = await res.json()
      setNotasEmitidas(data.notas || [])
    } catch (err) {
      console.error(err)
      toast.error('Erro ao carregar histórico de NFS-e')
    } finally {
      setCarregandoNotas(false)
    }
  }, [empresaAtiva, dtIniEmitidas, dtFimEmitidas, buscaEmitidas])

  useEffect(() => {
    carregarConfigFiscal()
    carregarNotasEmitidas()
  }, [empresaAtiva, carregarConfigFiscal, carregarNotasEmitidas])

  // Recarregar notas quando mudar para a subAba emitidas
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
          tipo_itens: 'servicos'
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
        toast('Nenhuma venda de serviços encontrada para o período informado.', { icon: '🔍' })
      } else {
        toast.success(`${lista.length} OS de serviços encontradas!`)
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

  // ─── Emissão Real via Gov.br ─────────────────────────────────
  const handleConfirmarEmissaoLote = async (vendasAjustadas: any[]) => {
    if (!empresaAtiva) { toast.error('Selecione uma empresa primeiro'); return }
    if (!vendasAjustadas || vendasAjustadas.length === 0) { toast.error('Nenhuma venda selecionada'); return }

    setEnviandoDatacar(true)
    setShowPreviewEmissao(false)
    try {
      const res = await fetch('/api/gov-br/enviar-servicos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empresa_id: empresaAtiva.id,
          vendas: vendasAjustadas
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao emitir NFS-e')

      if (data.sucessos > 0) {
        toast.success(`${data.sucessos} NFS-e emitidas com sucesso via Gov.br!`, { duration: 5000 })
        
        // Atualiza a tabela Datacar
        setVendasDatacar(prev => prev.map(v => {
          if (selecionadosDatacar.has(v.id)) {
             return { ...v, status: 'enviado' }
          }
          return v
        }))
        setSelecionadosDatacar(new Set())
        
        // Atualiza o histórico de emitidas
        carregarNotasEmitidas()
      }

      if (data.erros > 0) {
        toast.error(`${data.erros} notas com erro. Verifique os logs.`)
        if (data.detalhesErros?.length > 0) {
          data.detalhesErros.slice(0, 3).forEach((errMsg: string) => {
            toast.error(errMsg, { duration: 6000 })
          })
        }
      }

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao emitir NFS-e via Gov.br'
      toast.error(msg)
    } finally {
      setEnviandoDatacar(false)
    }
  }

  // ─── Cancelamento de NFS-e ───────────────────────────────────
  const handleCancelarNota = async (nota: NotaServicoEmitida) => {
    if (!empresaAtiva) return
    setCancelando(true)
    try {
      const res = await fetch('/api/notas-emitidas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empresa_id: empresaAtiva.id,
          nota_id: nota.id,
          acao: 'cancelar'
        })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao cancelar nota')

      toast.success(data.mensagem || 'NFS-e cancelada com sucesso.')
      setConfirmandoCancelar(null)
      carregarNotasEmitidas()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao cancelar')
    } finally {
      setCancelando(false)
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

  
  const toggleItem = (idx: number) => {
    setSelecionados(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const toggleTodos = () => {
    if (selecionados.size === dadosEditados.filter(d => d.valido).length) {
      setSelecionados(new Set())
    } else {
      const validos = new Set<number>(
        dadosEditados.reduce((acc: number[], d, i) => { if (d.valido) acc.push(i); return acc }, [])
      )
      setSelecionados(validos)
    }
  }

  const removerItem = (idx: number) => {
    setDadosEditados(prev => prev.filter((_, i) => i !== idx))
    setSelecionados(prev => {
      const next = new Set<number>()
      prev.forEach(i => {
        if (i < idx) next.add(i)
        else if (i > idx) next.add(i - 1)
      })
      return next
    })
  }

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

  // ─── Métricas e KPIs de NFS-e ────────────────────────────────
  const formatCurrency = (val: number) =>
    val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  const formatDate = (dt: string | null | undefined) => {
    if (!dt) return '-'
    try {
      const s = String(dt).trim()
      if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) return s.substring(0, 10)
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
        const [ano, mes, diaResto] = s.split('-')
        const dia = diaResto.substring(0, 2)
        return `${dia}/${mes}/${ano}`
      }
      const d = new Date(s)
      if (!isNaN(d.getTime())) {
        const dia = String(d.getDate()).padStart(2, '0')
        const mes = String(d.getMonth() + 1).padStart(2, '0')
        const ano = d.getFullYear()
        return `${dia}/${mes}/${ano}`
      }
      return s
    } catch { return String(dt) }
  }

  // Calcula faturamento de NFS-e emitidas (não canceladas)
  const notasAtivasEmitidas = notasEmitidas.filter(n => n.status === 'enviado')
  const totalFaturadoNfse = notasAtivasEmitidas.reduce((acc, n) => acc + (Number(n.valor_total) || 0), 0)
  const notasCanceladasCount = notasEmitidas.filter(n => n.status === 'cancelado').length
  const pendenteCount = vendasDatacar.filter(v => v.status === 'pendente').length

  // ─── Render ──────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <ShoppingCart className="text-brand-500" />
              Vendas Serviços (Emissor NFS-e)
            </h1>
            <span className="px-2 py-0.5 bg-brand-500/20 text-brand-400 text-[10px] font-bold rounded border border-brand-500/30 uppercase tracking-wider">
              Gov.br Nacional
            </span>
          </div>
          <p className="text-dark-400 text-xs mt-0.5">
            Emissão de Notas Fiscais de Serviços, assinatura A1 ICP-Brasil e gestão de DANFSE.
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

      {/* 3 SUB-ABAS INTEGRADAS                                          */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <div className="flex border-b border-dark-700 gap-0">
        <button
          onClick={() => setSubAba('datacar')}
          className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold transition-all border-b-2 ${
            subAba === 'datacar'
              ? 'border-blue-400 text-blue-400 bg-dark-800/40'
              : 'border-transparent text-dark-400 hover:text-white hover:bg-dark-800/20'
          }`}
        >
          <Database size={15} />
          Importadas do Datacar (A Emitir)
          {pendenteCount > 0 && (
            <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full font-bold">
              {pendenteCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setSubAba('emitidas')}
          className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold transition-all border-b-2 ${
            subAba === 'emitidas'
              ? 'border-emerald-400 text-emerald-400 bg-dark-800/40'
              : 'border-transparent text-dark-400 hover:text-white hover:bg-dark-800/20'
          }`}
        >
          <FileText size={15} />
          NFS-e Emitidas (Histórico Gov.br)
          {notasAtivasEmitidas.length > 0 && (
            <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-bold">
              {notasAtivasEmitidas.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setSubAba('planilha')}
          className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold transition-all border-b-2 ${
            subAba === 'planilha'
              ? 'border-brand-400 text-brand-400 bg-dark-800/40'
              : 'border-transparent text-dark-400 hover:text-white hover:bg-dark-800/20'
          }`}
        >
          <Upload size={15} />
          Upload de Planilha
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════
          SUB-ABA 1: IMPORTADAS DO DATACAR (A EMITIR)
      ══════════════════════════════════════════════════════ */}
      {subAba === 'datacar' && (
        <div className="space-y-4">
          {!empresaAtiva ? (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 flex items-center gap-3">
              <AlertCircle size={18} className="text-yellow-400 flex-shrink-0" />
              <p className="text-yellow-300 text-sm">
                Selecione uma empresa no menu superior para ver as ordens de serviços importadas.
              </p>
            </div>
          ) : (
            <>
              {/* Painel de Agendamento Automático */}
              {empresaAtiva.datacar_token && (
                <PainelAgendamento tipo="vendas" />
              )}

              {/* Formulário de Busca do Datacar */}
              <div className="bg-dark-800 border border-dark-700 rounded-xl p-5 animate-fade-in">
                <div className="flex items-center justify-between flex-wrap gap-3 mb-4 pb-3 border-b border-dark-700/50">
                  <div className="flex items-center gap-2 text-white font-semibold">
                    <Database size={18} className="text-blue-400" />
                    <h3>Buscar Serviços do Datacar {empresaAtiva ? `— ${empresaAtiva.nome}` : ''}</h3>
                  </div>

                  {/* Seletor rápido de tipo de itens */}
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
                      onClick={() => setFiltroTipoItens('servicos')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        filtroTipoItens === 'servicos'
                          ? 'bg-emerald-600 text-white shadow-md'
                          : 'text-dark-400 hover:text-white'
                      }`}
                    >
                      🔧 Apenas Serviços
                    </button>
                  </div>
                </div>
                
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
                    Faça uma busca para ver as ordens de serviços do Datacar.
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
                        className="w-4 h-4 rounded border-dark-600 bg-dark-900 text-emerald-500 focus:ring-emerald-500"
                      />
                      <span className="text-xs text-dark-300 font-semibold">
                        Selecionar todas as pendentes (<strong className="text-white">{selecionadosDatacar.size}</strong> de {vendasDatacar.length})
                      </span>
                    </div>

                    {selecionadosDatacar.size > 0 && (
                      <button
                        onClick={() => setShowPreviewEmissao(true)}
                        disabled={enviandoDatacar}
                        className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-600/25 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-lg"
                      >
                        {enviandoDatacar ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                        {enviandoDatacar ? 'Aguarde...' : `⚡ Pré-visualizar & Emitir NFS-e (${selecionadosDatacar.size})`}
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
                              ? 'border-emerald-500/40 bg-dark-850/95 shadow-[0_0_15px_rgba(16,185,129,0.1)]' 
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
                                    className="w-4 h-4 rounded border-dark-600 bg-dark-900 text-emerald-500 focus:ring-emerald-500"
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
                                    <span className="text-[11px] text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded-md border border-cyan-500/20 font-medium">
                                      💳 {venda.forma_pagamento}
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-2 text-xs">
                                  <span className="text-white font-bold truncate max-w-[280px]">
                                    {venda.cliente}
                                  </span>
                                  {venda.cliente_cpf_cnpj && (
                                    <span className="text-dark-400 font-mono text-[11px]">
                                      • {venda.cliente_cpf_cnpj}
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
                        onClick={() => setShowPreviewEmissao(true)}
                        disabled={enviandoDatacar}
                        className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-600/25 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-lg"
                      >
                        {enviandoDatacar ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                        {enviandoDatacar ? 'Aguarde...' : `⚡ Pré-visualizar & Emitir NFS-e (${selecionadosDatacar.size})`}
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
          SUB-ABA 2: NFS-E EMITIDAS (HISTÓRICO GOV.BR)
      ══════════════════════════════════════════════════════ */}
      {subAba === 'emitidas' && (
        <div className="space-y-4 animate-fade-in">
          {/* Barra de Filtros do Histórico */}
          <div className="bg-dark-800 border border-dark-700 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-[280px]">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
                <input
                  type="text"
                  placeholder="Pesquisar por cliente, OS, CPF/CNPJ ou número de nota..."
                  value={buscaEmitidas}
                  onChange={e => setBuscaEmitidas(e.target.value)}
                  className="w-full bg-dark-900 border border-dark-600 rounded-lg pl-9 pr-3 py-2 text-white text-xs outline-none focus:border-emerald-500"
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
                disabled={carregandoNotas || sincronizandoGovBr}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-700 hover:bg-dark-600 text-white rounded-lg text-xs font-semibold transition-colors"
                title="Recarregar listagem"
              >
                <RefreshCw size={13} className={carregandoNotas ? 'animate-spin' : ''} />
                Atualizar
              </button>

              <button
                onClick={handleSincronizarGovBr}
                disabled={carregandoNotas || sincronizandoGovBr}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-emerald-900/30"
                title="Consultar e sincronizar notas emitidas diretamente no portal da NFS-e Nacional / Gov.br usando o Certificado Digital A1"
              >
                {sincronizandoGovBr ? (
                  <Loader2 size={13} className="animate-spin text-white" />
                ) : (
                  <RefreshCw size={13} className="text-emerald-100" />
                )}
                {sincronizandoGovBr ? 'Sincronizando Gov.br...' : 'Sincronizar Gov.br'}
              </button>
            </div>
          </div>

          {/* Tabela de Histórico de NFS-e */}
          {carregandoNotas ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={32} className="animate-spin text-emerald-400" />
            </div>
          ) : notasEmitidas.length === 0 ? (
            <div className="bg-dark-800 border border-dark-700 rounded-xl p-12 text-center">
              <FileText size={40} className="text-dark-600 mx-auto mb-3" />
              <h3 className="text-white font-bold text-sm">Nenhuma NFS-e encontrada</h3>
              <p className="text-dark-400 text-xs mt-1">
                As notas fiscais de serviços emitidas via Gov.br aparecerão aqui automaticamente.
              </p>
            </div>
          ) : (
            <div className="bg-dark-850/80 border border-dark-700/80 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-md">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-dark-950/80 border-b border-dark-700 text-dark-400 font-bold uppercase tracking-wider text-[11px]">
                      <th className="py-3.5 px-5">NFS-e / OS</th>
                      <th className="py-3.5 px-5">Cliente / Tomador</th>
                      <th className="py-3.5 px-5">Data Emissão</th>
                      <th className="py-3.5 px-5 text-right">Valor Total</th>
                      <th className="py-3.5 px-5 text-center">Situação Fiscal</th>
                      <th className="py-3.5 px-5 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dark-700/50">
                    {notasEmitidas.map((nota) => {
                      const isCancelada = nota.status === 'cancelado'
                      return (
                        <tr key={nota.id} className="hover:bg-dark-750/30 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-white">
                            <span className="text-emerald-400">NFS-e #{nota.os_numero}</span>
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
                              {isCancelada ? '● CANCELADA' : '● AUTORIZADA'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => setNotaVisualizar(nota)}
                                className="px-2.5 py-1 bg-dark-700 hover:bg-dark-600 text-white rounded text-xs font-semibold flex items-center gap-1 transition-colors"
                                title="Visualizar Espelho Oficial DANFSE"
                              >
                                <Eye size={13} />
                                Espelho
                              </button>
                              
                              {!isCancelada && (
                                <button
                                  onClick={() => setConfirmandoCancelar(nota)}
                                  className="p-1 text-dark-500 hover:text-rose-400 transition-colors"
                                  title="Cancelar NFS-e"
                                >
                                  <XCircle size={15} />
                                </button>
                              )}
                            </div>
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
                      <h4 className="text-sm font-bold text-white">Importar Base Fiscal de Serviços (NBS / cTribNac)</h4>
                      <p className="text-xs text-dark-400">Vincule códigos tributários a partir de planilhas contábeis.</p>
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
                  onClick={() => {
                    toast.error('Para emitir NFS-e de serviços, utilize a aba de Importadas do Datacar.')
                  }}
                  className="px-6 py-2.5 bg-brand-600 hover:bg-brand-500 text-white font-medium rounded-xl transition-colors shadow-lg shadow-brand-600/20"
                >
                  Importar {selecionados.size} Vendas
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* MODAL: PRÉ-VISUALIZAÇÃO & EMISSÃO EM 4 ETAPAS                  */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {showPreviewEmissao && (
        <ModalPreviewEmissao
          vendas={vendasDatacar.filter(v => selecionadosDatacar.has(v.id))}
          empresaId={empresaAtiva?.id || ''}
          aliquotaSimplesDefault={aliquotaSimples}
          aliquotaIssqnDefault={aliquotaIssqn}
          onClose={() => setShowPreviewEmissao(false)}
          onConfirm={handleConfirmarEmissaoLote}
          enviando={enviandoDatacar}
        />
      )}

      {/* MODAL: EDITAR OS INDIVIDUAL DO DATACAR */}
      {editandoDatacarId && (
        <ModalEditarDatacar
          vendaId={editandoDatacarId}
          venda={vendasDatacar.find(v => v.id === editandoDatacarId)!}
          onClose={() => setEditandoDatacarId(null)}
          onSaveSuccess={(vendaAtualizada: any) => {
            setVendasDatacar(prev => prev.map(v => v.id === vendaAtualizada.id ? vendaAtualizada : v))
            setEditandoDatacarId(null)
            toast.success('Venda atualizada com sucesso!')
          }}
        />
      )}

      {/* MODAL: DETALHES DE ITENS DA OS */}
      {detalheVendaDatacar && (
        <ModalDetalheVendaDatacar
          venda={detalheVendaDatacar}
          onClose={() => setDetalheVendaDatacar(null)}
          onEdit={() => {
            setEditandoDatacarId(detalheVendaDatacar.id)
            setDetalheVendaDatacar(null)
          }}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* MODAL: ESPELHO OFICIAL DANFSE (GOV.BR NACIONAL)                */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {notaVisualizar && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
          <div className="bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden my-auto">
            {/* Header do Modal */}
            <div className="px-6 py-4 border-b border-dark-700 flex items-center justify-between bg-dark-850">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    DANFSE — Documento Auxiliar da NFS-e
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                      Gov.br Nacional
                    </span>
                  </h3>
                  <p className="text-xs text-dark-400 font-mono">
                    NFS-e #{notaVisualizar.os_numero} · {notaVisualizar.cliente}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-dark-700 hover:bg-dark-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
                >
                  <Printer size={14} /> Imprimir
                </button>
                <button
                  onClick={() => setNotaVisualizar(null)}
                  className="w-8 h-8 rounded-lg bg-dark-800 text-dark-400 hover:text-white flex items-center justify-center hover:bg-dark-700 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Espelho Estilizado da NFS-e */}
            <div className="p-6 overflow-y-auto bg-gray-100 text-gray-900 font-sans text-xs">
              <div className="border border-gray-300 bg-white p-6 rounded-lg shadow-sm space-y-4">
                {/* Cabeçalho da Nota */}
                <div className="flex items-center justify-between border-b pb-4 border-gray-300">
                  <div>
                    <h2 className="text-lg font-black tracking-tight text-gray-900">
                      NFS-e — NOTA FISCAL DE SERVIÇOS ELETRÔNICA
                    </h2>
                    <p className="text-[11px] text-gray-600 font-medium">
                      Padrão Nacional de Emissão de Serviços · Receita Federal do Brasil
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Número da Nota</p>
                    <p className="text-base font-black font-mono text-emerald-700">#{notaVisualizar.os_numero}</p>
                  </div>
                </div>

                {/* Prestador e Tomador */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-b pb-4 border-gray-300">
                  <div className="bg-gray-50 p-3 rounded border border-gray-200">
                    <p className="font-bold text-[11px] text-gray-700 uppercase mb-1">PRESTADOR DE SERVIÇOS (EMITENTE)</p>
                    <p className="font-bold text-sm text-gray-900">{empresaAtiva?.nome}</p>
                    <p className="text-gray-600 font-mono">CNPJ: {empresaAtiva?.cnpj || 'Não informado'}</p>
                    <p className="text-gray-600">Belo Horizonte / MG</p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded border border-gray-200">
                    <p className="font-bold text-[11px] text-gray-700 uppercase mb-1">TOMADOR DE SERVIÇOS (CLIENTE)</p>
                    <p className="font-bold text-sm text-gray-900">{notaVisualizar.cliente}</p>
                    <p className="text-gray-600 font-mono">
                      CPF/CNPJ: {notaVisualizar.metadata?.cliente_cpf_cnpj || '000.000.000-00'}
                    </p>
                    <p className="text-gray-600">Consumidor Final</p>
                  </div>
                </div>

                {/* Descrição dos Serviços */}
                <div className="border-b pb-4 border-gray-300">
                  <p className="font-bold text-[11px] text-gray-700 uppercase mb-2">DISCRIMINAÇÃO DOS SERVIÇOS PRESTADOS</p>
                  <div className="bg-gray-50 p-3 rounded border border-gray-200 font-mono text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">
                    {Array.isArray(notaVisualizar.metadata?.itens) && notaVisualizar.metadata.itens.length > 0 ? (
                      notaVisualizar.metadata.itens.map((it: any, i: number) => (
                        <div key={i} className="flex justify-between py-0.5">
                          <span>{it.quantidade || 1}x {it.descricao}</span>
                          <span className="font-bold">{formatCurrency(Number(it.valor_unitario || it.valor_total || 0))}</span>
                        </div>
                      ))
                    ) : (
                      <p>Serviços automotivos e manutenção preventiva (OS #{notaVisualizar.os_numero}).</p>
                    )}
                  </div>
                </div>

                {/* Dados Tributários & Totais */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-gray-50 p-3 rounded border border-gray-200">
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase font-bold">Cód. Tributação (cTribNac)</p>
                    <p className="font-mono font-bold text-gray-800">14.01.01</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase font-bold">Alíquota Simples / ISS</p>
                    <p className="font-mono font-bold text-gray-800">{aliquotaSimples}%</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase font-bold">Situação</p>
                    <p className="font-bold text-emerald-700">
                      {notaVisualizar.status === 'cancelado' ? 'Cancelada' : 'Autorizada'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-gray-500 uppercase font-bold">Valor Total</p>
                    <p className="text-base font-black text-emerald-700">
                      {formatCurrency(notaVisualizar.valor_total)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* MODAL: CONFIRMAÇÃO DE CANCELAMENTO                             */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {confirmandoCancelar && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-dark-800 border border-dark-700 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="w-14 h-14 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center justify-center text-rose-400 mx-auto">
              <AlertTriangle size={28} />
            </div>
            <div className="text-center">
              <h3 className="text-base font-bold text-white">Cancelar NFS-e #{confirmandoCancelar.os_numero}?</h3>
              <p className="text-xs text-dark-400 mt-1">
                A nota do cliente <strong className="text-white">{confirmandoCancelar.cliente}</strong> no valor de <strong className="text-white">{formatCurrency(confirmandoCancelar.valor_total)}</strong> será marcada como cancelada.
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setConfirmandoCancelar(null)}
                className="flex-1 bg-dark-700 hover:bg-dark-600 text-white font-bold py-2.5 rounded-xl text-xs transition-colors"
              >
                Voltar
              </button>
              <button
                onClick={() => handleCancelarNota(confirmandoCancelar)}
                disabled={cancelando}
                className="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors shadow-lg"
              >
                {cancelando ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
