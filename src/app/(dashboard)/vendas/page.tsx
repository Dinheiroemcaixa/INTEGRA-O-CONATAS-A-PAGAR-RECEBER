'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
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
  CheckCircle, CheckCircle2, AlertCircle, AlertTriangle, X, Send, ShoppingCart,
  Database, RefreshCw, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, HelpCircle,
  Trash2, FileSpreadsheet, BookOpen,
  Search, Calendar, ExternalLink, FileText, Download,
  Layers, PackageCheck, Clock, TrendingUp
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
  const [filtroSituacao, setFiltroSituacao] = useState<'todas' | 'emitida' | 'cancelado' | 'pendente'>('todas')
  const [mesRef, setMesRef] = useState<Date>(() => {
    const agora = new Date()
    return new Date(agora.getFullYear(), agora.getMonth(), 1)
  })
  const [mostrarFiltroCustomizado, setMostrarFiltroCustomizado] = useState(false)

  // Navegação mensal inteligente (Estilo Conta Azul)
  const navegarMes = (delta: number) => {
    const novo = new Date(mesRef.getFullYear(), mesRef.getMonth() + delta, 1)
    setMesRef(novo)
    const ultimoDia = new Date(novo.getFullYear(), novo.getMonth() + 1, 0)
    
    const y = novo.getFullYear()
    const m = String(novo.getMonth() + 1).padStart(2, '0')
    const dIni = `${y}-${m}-01`
    const dFim = `${y}-${m}-${String(ultimoDia.getDate()).padStart(2, '0')}`
    
    setDtIniEmitidas(dIni)
    setDtFimEmitidas(dFim)
  }

  const formatNomeMes = (d: Date) => {
    const nome = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    return nome.charAt(0).toUpperCase() + nome.slice(1)
  }

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

  // ─── Estados de Progresso em Tempo Real (UX Fintech) ──────────
  const [progressoEnvio, setProgressoEnvio] = useState<{
    ativo: boolean
    origem: 'datacar' | 'planilha'
    total: number
    processados: number
    sucessos: number
    erros: number
    osAtual?: string
    clienteAtual?: string
    segundosDecorridos: number
    detalhesErros: string[]
    concluido: boolean
    cancelado?: boolean
  } | null>(null)
  const [mostrarErrosProgresso, setMostrarErrosProgresso] = useState(false)
  const abortEnvioRef = useRef(false)

  // Cronômetro para o tempo decorrido do envio em lote
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null
    if (progressoEnvio?.ativo && !progressoEnvio.concluido) {
      interval = setInterval(() => {
        setProgressoEnvio(prev => prev ? { ...prev, segundosDecorridos: prev.segundosDecorridos + 1 } : null)
      }, 1000)
    }
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [progressoEnvio?.ativo, progressoEnvio?.concluido])

  const formatTempoDecorrido = (segundos: number) => {
    const mins = Math.floor(segundos / 60).toString().padStart(2, '0')
    const secs = (segundos % 60).toString().padStart(2, '0')
    return `${mins}:${secs}`
  }

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

  // Envio ao Conta Azul (Datacar) com Streaming de Progresso e Proteção contra Timeout
  const handleEnviarDatacarParaCA = async () => {
    if (!empresaAtiva) { toast.error('Selecione uma empresa primeiro'); return }
    if (!empresaAtiva.access_token_conta_azul_vendas) {
      toast.error(`O Conta Azul Vendas não está conectado para ${empresaAtiva.nome}. Conecte antes de enviar.`)
      return
    }
    if (selecionadosDatacar.size === 0) { toast.error('Selecione ao menos uma venda'); return }

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
      toast.error('Não há itens válidos para enviar com o filtro atual.')
      return
    }

    abortEnvioRef.current = false
    setEnviandoDatacar(true)
    setMostrarErrosProgresso(false)

    // Garante que o usuário visualize imediatamente o card de progresso
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    setProgressoEnvio({
      ativo: true,
      origem: 'datacar',
      total: vendasParaEnviar.length,
      processados: 0,
      sucessos: 0,
      erros: 0,
      osAtual: vendasParaEnviar[0]?.os_numero,
      clienteAtual: vendasParaEnviar[0]?.cliente,
      segundosDecorridos: 0,
      detalhesErros: [],
      concluido: false,
      cancelado: false
    })

    let sucessosTotais = 0
    let errosTotais = 0
    let processadosTotais = 0
    let proximoIndice = 0
    const detalhesErros: string[] = []
    const idsSucesso = new Set<string>()
    const idsClientesExistentes = new Set<string>()

    const CONCORRENCIA_MAXIMA = 3

    const workerEnvio = async (workerId: number) => {
      while (proximoIndice < vendasParaEnviar.length) {
        if (abortEnvioRef.current) {
          break
        }

        const i = proximoIndice++
        const venda = vendasParaEnviar[i]
        if (!venda) break

        setProgressoEnvio(prev => prev ? {
          ...prev,
          osAtual: venda.os_numero,
          clienteAtual: venda.cliente
        } : null)

        // Timeout defensivo de 45 segundos por venda com AbortController
        const controller = new AbortController()
        const timeoutTimer = setTimeout(() => controller.abort(), 45000)

        try {
          const res = await fetch('/api/conta-azul/enviar-vendas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              empresa_id: empresaAtiva.id,
              vendas: [venda]
            }),
            signal: controller.signal
          })
          clearTimeout(timeoutTimer)

          let data: any = {}
          try {
            const rawText = await res.text()
            data = JSON.parse(rawText)
          } catch {
            if (res.status === 504 || res.status === 408) {
              data = { error: 'Tempo limite esgotado no servidor (TIMEOUT 504). O Conta Azul demorou para responder.' }
            } else {
              data = { error: `Erro no servidor Conta Azul (HTTP ${res.status}).` }
            }
          }

          if (res.ok && data.sucessos > 0) {
            sucessosTotais++
            idsSucesso.add(venda.id)
            if (data.detalhesClientesExistentes && Array.isArray(data.detalhesClientesExistentes) && data.detalhesClientesExistentes.length > 0) {
              idsClientesExistentes.add(venda.id)
            }
            setVendasDatacar(prev => prev.map(v => {
              if (v.id === venda.id) {
                return { 
                  ...v, 
                  status: 'enviado',
                  cliente_ja_cadastrado: (data.detalhesClientesExistentes && data.detalhesClientesExistentes.length > 0) || v.cliente_ja_cadastrado
                }
              }
              return v
            }))
            setSelecionadosDatacar(prev => {
              const next = new Set(prev)
              next.delete(venda.id)
              return next
            })
          } else {
            errosTotais++
            const msgErro = data.error || (data.detalhesErros && data.detalhesErros[0]) || 'Erro ao sincronizar com Conta Azul'
            detalhesErros.push(`OS ${venda.os_numero || 'S/N'}: ${msgErro}`)
          }
        } catch (fetchErr: any) {
          clearTimeout(timeoutTimer)
          errosTotais++
          const isTimeout = fetchErr.name === 'AbortError'
          const msg = isTimeout 
            ? 'Tempo limite de 45s excedido aguardando resposta da API'
            : (fetchErr.message || 'Erro de conexão com o servidor')
          detalhesErros.push(`OS ${venda.os_numero || 'S/N'}: ${msg}`)
        }

        processadosTotais++

        // Atualização em tempo real do estado de progresso de forma atômica e consistente
        setProgressoEnvio(prev => prev ? {
          ...prev,
          processados: processadosTotais,
          sucessos: sucessosTotais,
          erros: errosTotais,
          detalhesErros: [...detalhesErros]
        } : null)

        if (abortEnvioRef.current) break
      }
    }

    try {
      const qtdWorkers = Math.min(CONCORRENCIA_MAXIMA, vendasParaEnviar.length)
      const workers = Array.from({ length: qtdWorkers }, (_, id) => workerEnvio(id + 1))
      await Promise.all(workers)

      if (abortEnvioRef.current) {
        toast('Envio interrompido pelo usuário.', { icon: '🛑' })
        setProgressoEnvio(prev => prev ? { ...prev, cancelado: true } : null)
      } else {
        if (sucessosTotais > 0) {
          toast.success(`${sucessosTotais} de ${vendasParaEnviar.length} vendas sincronizadas com sucesso!`)
          carregarNotasEmitidas()
        }

        if (errosTotais > 0) {
          toast.error(`${errosTotais} vendas com erro ou timeout. Confira o detalhamento no card.`)
        }
      }

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao enviar para o Conta Azul'
      toast.error(msg)
    } finally {
      // Liberação automática do botão em qualquer erro, cancelamento ou timeout garantida!
      setEnviandoDatacar(false)
      setProgressoEnvio(prev => prev ? { ...prev, concluido: true } : null)
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

  // Envio ao Conta Azul (Planilha) com Streaming de Progresso e Proteção contra Timeout
  const handleEnviarContaAzul = async () => {
    if (!empresaAtiva) { toast.error('Selecione uma empresa primeiro'); return }
    if (selecionados.size === 0) { toast.error('Selecione ao menos uma venda'); return }

    const itensParaEnviar = dadosEditados.filter((_, i) => selecionados.has(i))
    if (itensParaEnviar.length === 0) {
      toast.error('Nenhum item selecionado para envio.')
      return
    }

    abortEnvioRef.current = false
    setEnviandoCA(true)
    setMostrarErrosProgresso(false)

    setProgressoEnvio({
      ativo: true,
      origem: 'planilha',
      total: itensParaEnviar.length,
      processados: 0,
      sucessos: 0,
      erros: 0,
      osAtual: itensParaEnviar[0]?.os_numero,
      clienteAtual: itensParaEnviar[0]?.cliente,
      segundosDecorridos: 0,
      detalhesErros: [],
      concluido: false,
      cancelado: false
    })

    let sucessosTotais = 0
    let errosTotais = 0
    let processadosTotais = 0
    let proximoIndice = 0
    const detalhesErros: string[] = []
    const indicesSucesso = new Set<number>()

    const CONCORRENCIA_MAXIMA = 3

    const workerEnvioPlanilha = async (workerId: number) => {
      while (proximoIndice < itensParaEnviar.length) {
        if (abortEnvioRef.current) break

        const i = proximoIndice++
        const venda = itensParaEnviar[i]
        if (!venda) break

        setProgressoEnvio(prev => prev ? {
          ...prev,
          osAtual: venda.os_numero,
          clienteAtual: venda.cliente
        } : null)

        const controller = new AbortController()
        const timeoutTimer = setTimeout(() => controller.abort(), 45000)

        try {
          const res = await fetch('/api/conta-azul/enviar-vendas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              empresa_id: empresaAtiva.id,
              vendas: [venda]
            }),
            signal: controller.signal
          })
          clearTimeout(timeoutTimer)

          let data: any = {}
          try {
            const rawText = await res.text()
            data = JSON.parse(rawText)
          } catch {
            if (res.status === 504 || res.status === 408) {
              data = { error: 'Tempo limite esgotado no servidor (TIMEOUT 504). O Conta Azul demorou para responder.' }
            } else {
              data = { error: `Erro no servidor Conta Azul (HTTP ${res.status}).` }
            }
          }

          if (res.ok && data.sucessos > 0) {
            sucessosTotais++
            const idxOriginal = dadosEditados.findIndex(d => d === venda || (d.os_numero === venda.os_numero && d.cliente === venda.cliente))
            if (idxOriginal !== -1) {
              indicesSucesso.add(idxOriginal)
            }
          } else {
            errosTotais++
            const msgErro = data.error || (data.detalhesErros && data.detalhesErros[0]) || 'Erro ao sincronizar venda'
            detalhesErros.push(`OS ${venda.os_numero || 'S/N'}: ${msgErro}`)
          }
        } catch (fetchErr: any) {
          clearTimeout(timeoutTimer)
          errosTotais++
          const isTimeout = fetchErr.name === 'AbortError'
          const msg = isTimeout 
            ? 'Tempo limite de 45s excedido aguardando resposta da API' 
            : (fetchErr.message || 'Erro de comunicação')
          detalhesErros.push(`OS ${venda.os_numero || 'S/N'}: ${msg}`)
        }

        processadosTotais++

        setProgressoEnvio(prev => prev ? {
          ...prev,
          processados: processadosTotais,
          sucessos: sucessosTotais,
          erros: errosTotais,
          detalhesErros: [...detalhesErros]
        } : null)

        if (abortEnvioRef.current) break
      }
    }

    try {
      const qtdWorkers = Math.min(CONCORRENCIA_MAXIMA, itensParaEnviar.length)
      const workers = Array.from({ length: qtdWorkers }, (_, id) => workerEnvioPlanilha(id + 1))
      await Promise.all(workers)

      if (abortEnvioRef.current) {
        toast('Envio da planilha interrompido pelo usuário.', { icon: '🛑' })
        setProgressoEnvio(prev => prev ? { ...prev, cancelado: true } : null)
      } else {
        if (sucessosTotais > 0) {
          toast.success(`${sucessosTotais} de ${itensParaEnviar.length} vendas da planilha enviadas com sucesso!`)
          carregarNotasEmitidas()

          if (indicesSucesso.size >= dadosEditados.length) {
            setEtapa('upload')
            setResultado(null)
            setDadosEditados([])
            setSelecionados(new Set())
          } else {
            // Remove apenas os itens que tiveram sucesso para o usuário reprocessar com facilidade
            setDadosEditados(prev => prev.filter((_, idx) => !indicesSucesso.has(idx)))
            setSelecionados(new Set())
          }
        }

        if (errosTotais > 0) {
          toast.error(`${errosTotais} vendas com falha ou timeout. Confira o detalhamento no card.`)
        }
      }

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao enviar para o Conta Azul'
      toast.error(msg)
    } finally {
      // Liberação automática do botão em qualquer erro ou timeout garantida!
      setEnviandoCA(false)
      setProgressoEnvio(prev => prev ? { ...prev, concluido: true } : null)
    }
  }

  // ─── Métricas e KPIs de NF-e ─────────────────────────────────
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

  const totalFaturadoNfe = notasEmitidas.reduce((acc, n) => acc + (Number(n.valor_total) || 0), 0)
  const pendenteCount = vendasDatacar.filter(v => v.status === 'pendente').length
  const caVendasConectado = Boolean(empresaAtiva?.access_token_conta_azul_vendas)

  // ─── Card de Progresso em Tempo Real (UX Fintech) ────────────
  const renderCardProgresso = (origemEsperada: 'datacar' | 'planilha') => {
    if (!progressoEnvio || progressoEnvio.origem !== origemEsperada) return null

    const total = progressoEnvio.total || 1
    const percentual = Math.min(100, Math.round((progressoEnvio.processados / total) * 100))

    return (
      <div className="bg-slate-900 border border-blue-500/40 rounded-2xl p-5 shadow-2xl space-y-4 animate-fade-in relative overflow-hidden">
        {/* Barra luminosa no topo */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400" />

        {/* Cabeçalho */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
              progressoEnvio.concluido
                ? progressoEnvio.erros > 0
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : progressoEnvio.cancelado
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
            }`}>
              {progressoEnvio.concluido ? (
                progressoEnvio.erros > 0 ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />
              ) : progressoEnvio.cancelado ? (
                <AlertCircle size={20} />
              ) : (
                <Loader2 size={20} className="animate-spin text-blue-400" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-white font-bold text-sm tracking-wide">
                  {progressoEnvio.concluido 
                    ? (progressoEnvio.erros > 0 ? 'Sincronização Finalizada com Avisos' : 'Sincronização Concluída!')
                    : progressoEnvio.cancelado
                    ? 'Sincronização Interrompida'
                    : 'Sincronizando com Conta Azul...'}
                </h4>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold">
                  {percentual}%
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {progressoEnvio.concluido
                  ? `${progressoEnvio.sucessos} vendas sincronizadas com sucesso e ${progressoEnvio.erros} com falha.`
                  : `Processando OS #${progressoEnvio.osAtual || 'S/N'} • ${progressoEnvio.clienteAtual || 'Cliente'}`}
              </p>
            </div>
          </div>

          {/* Timer e Botões de Controle */}
          <div className="flex items-center gap-2.5 self-end sm:self-center">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700 text-xs font-mono text-slate-300">
              <Clock size={13} className="text-blue-400" />
              <span>{formatTempoDecorrido(progressoEnvio.segundosDecorridos)}</span>
            </div>

            {!progressoEnvio.concluido && !progressoEnvio.cancelado ? (
              <button
                type="button"
                onClick={() => { abortEnvioRef.current = true }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold transition-all cursor-pointer"
                title="Interromper envio das próximas vendas"
              >
                <X size={13} />
                <span>Interromper</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setProgressoEnvio(null)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-all cursor-pointer border border-slate-700"
              >
                <span>Fechar</span>
              </button>
            )}
          </div>
        </div>

        {/* Barra de Progresso Visual */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Progresso: <strong className="text-white">{progressoEnvio.processados}</strong> de <strong className="text-white">{progressoEnvio.total}</strong> vendas</span>
            <span className="font-mono text-blue-400 font-bold">{percentual}%</span>
          </div>
          <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-700/80 shadow-inner">
            <div
              className="h-full rounded-full transition-all duration-300 ease-out bg-gradient-to-r from-blue-600 via-indigo-500 to-emerald-400 shadow-[0_0_12px_rgba(59,130,246,0.5)]"
              style={{ width: `${percentual}%` }}
            />
          </div>
        </div>

        {/* Badges de Resumo em Tempo Real */}
        <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-slate-800/80 text-xs">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
              <CheckCircle2 size={13} />
              {progressoEnvio.sucessos} com sucesso
            </span>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold border ${
              progressoEnvio.erros > 0
                ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}>
              <AlertCircle size={13} />
              {progressoEnvio.erros} com erro
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/60 text-slate-400 border border-slate-700 text-[11px]">
              ⏳ {Math.max(0, progressoEnvio.total - progressoEnvio.processados)} restantes
            </span>
          </div>

          {progressoEnvio.detalhesErros.length > 0 && (
            <button
              type="button"
              onClick={() => setMostrarErrosProgresso(!mostrarErrosProgresso)}
              className="text-xs text-rose-400 hover:text-rose-300 underline font-semibold flex items-center gap-1 cursor-pointer"
            >
              {mostrarErrosProgresso ? 'Ocultar detalhes' : `Ver ${progressoEnvio.detalhesErros.length} detalhe(s) de erro`}
            </button>
          )}
        </div>

        {/* Detalhes de Erros (Accordion) */}
        {mostrarErrosProgresso && progressoEnvio.detalhesErros.length > 0 && (
          <div className="p-3 bg-rose-950/40 border border-rose-500/30 rounded-xl space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar text-xs">
            <p className="text-rose-300 font-bold">Falhas registradas no envio:</p>
            <ul className="space-y-1 text-slate-300 font-mono text-[11px]">
              {progressoEnvio.detalhesErros.map((err, idx) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <span className="text-rose-400 font-bold">•</span>
                  <span>{err}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    )
  }

  // ─── Render ──────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header Executivo (Padrão Linear / Vercel) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200/70 dark:border-white/[0.08]">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-full bg-blue-500/10 dark:bg-blue-500/20 border border-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400 flex-shrink-0 shadow-xs">
            <ShoppingCart size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight leading-tight">
                Vendas Produtos (NF-e Conta Azul)
              </h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                Peças & Produtos
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-dark-400 mt-0.5 font-normal">
              Sincronização de vendas de produtos e emissão de NF-e via Conta Azul.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <SelectorEmpresa />
          {subAba === 'planilha' && etapa !== 'upload' && (
            <button
              onClick={() => { setEtapa('upload'); setResultado(null); setDadosEditados([]) }}
              className="flex items-center gap-2 text-slate-700 dark:text-dark-200 hover:text-slate-900 dark:hover:text-white text-xs font-semibold px-3.5 py-2 rounded-xl bg-white dark:bg-dark-800 border border-slate-200 dark:border-dark-700 shadow-xs hover:bg-slate-50 dark:hover:bg-dark-700 transition-all cursor-pointer"
            >
              <ArrowLeft size={14} /> Voltar
            </button>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* 3 SUB-ABAS INTEGRADAS (PADRÃO PILL SWITCHER FINTECH)           */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <div className="bg-slate-200/60 dark:bg-dark-900/80 p-1.5 rounded-2xl border border-slate-300/60 dark:border-dark-700/80 flex items-center gap-1 shadow-inner max-w-2xl">
        <button
          onClick={() => setSubAba('datacar')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 sm:px-4 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer ${
            subAba === 'datacar'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-dark-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-dark-800/50'
          }`}
        >
          <Database size={15} />
          <span>Datacar (A Enviar)</span>
          {pendenteCount > 0 && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${subAba === 'datacar' ? 'bg-white/20 text-white' : 'bg-blue-500/20 text-blue-600 dark:text-blue-300'}`}>
              {pendenteCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setSubAba('emitidas')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 sm:px-4 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer ${
            subAba === 'emitidas'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-dark-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-dark-800/50'
          }`}
        >
          <FileCheck size={15} />
          <span>NF-e Emitidas (Conta Azul)</span>
          {notasEmitidas.length > 0 && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${subAba === 'emitidas' ? 'bg-white/20 text-white' : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300'}`}>
              {notasEmitidas.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setSubAba('planilha')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 sm:px-4 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer ${
            subAba === 'planilha'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-dark-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-dark-800/50'
          }`}
        >
          <UploadCloud size={15} />
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
                    <AlertCircle size={18} className="text-amber-500 dark:text-amber-400 flex-shrink-0" />
                    <p className="text-amber-800 dark:text-amber-200 text-xs">
                      A loja <strong className="text-slate-900 dark:text-white">{empresaAtiva.nome}</strong> não possui integração com o <strong>Conta Azul Vendas</strong> conectada. Conecte para poder sincronizar vendas e emitir NF-e.
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
              <div className="bg-white dark:bg-dark-800 border border-slate-200 dark:border-dark-700 rounded-xl p-5 animate-fade-in shadow-xs dark:shadow-none">
                <div className="flex items-center justify-between flex-wrap gap-3 mb-4 pb-3 border-b border-slate-200 dark:border-dark-700/50">
                  <div className="flex items-center gap-2 text-slate-900 dark:text-white font-semibold">
                    <Database size={18} className="text-blue-500 dark:text-blue-400" />
                    <h3>Buscar Vendas do Datacar {empresaAtiva ? `— ${empresaAtiva.nome}` : ''}</h3>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowPlanilhaFiscal(!showPlanilhaFiscal)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-50 hover:bg-slate-100 dark:bg-dark-900 dark:hover:bg-dark-700 border border-blue-500/30 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-white transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                      title="Importar ou atualizar planilha de NCM e CEST para vinculação automática"
                    >
                      <FileSpreadsheet size={14} />
                      Base Fiscal (NCM/CEST)
                    </button>

                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-dark-900/80 p-1 rounded-xl border border-slate-200 dark:border-dark-700/60">
                      <button
                        type="button"
                        onClick={() => setFiltroTipoItens('tudo')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          filtroTipoItens === 'tudo'
                            ? 'bg-brand-600 text-white shadow-md'
                            : 'text-slate-600 hover:text-slate-900 dark:text-dark-400 dark:hover:text-white'
                        }`}
                      >
                        🛍️ Todos os Itens
                      </button>
                      <button
                        type="button"
                        onClick={() => setFiltroTipoItens('produtos')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          filtroTipoItens === 'produtos'
                            ? 'bg-blue-600 text-white shadow-md'
                            : 'text-slate-600 hover:text-slate-900 dark:text-dark-400 dark:hover:text-white'
                        }`}
                      >
                        📦 Apenas Produtos
                      </button>
                    </div>
                  </div>
                </div>
                
                {showPlanilhaFiscal && (
                  <div className="mb-4 p-4 bg-slate-50 dark:bg-dark-900/90 border border-blue-500/30 rounded-xl space-y-3 animate-fade-in">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet size={16} className="text-blue-500 dark:text-blue-400" />
                        <span className="text-xs font-bold text-slate-900 dark:text-white">Importar Planilha Fiscal (NCM / CEST)</span>
                      </div>
                      <span className="text-[11px] text-slate-500 dark:text-dark-400">Suporta .xlsx, .xls, .csv com colunas de Descrição e NCM</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={handleUploadPlanilhaFiscal}
                        disabled={uploadingPlanilha}
                        className="block w-full text-xs text-slate-600 dark:text-dark-400 file:mr-3 file:py-1.5 file:px-3.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-500 cursor-pointer bg-white dark:bg-dark-950 rounded-lg p-1 border border-slate-200 dark:border-dark-700"
                      />
                      {uploadingPlanilha && (
                        <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 font-semibold whitespace-nowrap">
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
                    <label className="text-xs font-medium mb-1 block text-slate-600 dark:text-dark-400">Tipo período:</label>
                    <select
                      value={tipoPeriodoVendas}
                      onChange={(e) => setTipoPeriodoVendas(e.target.value as any)}
                      disabled={!!numeroOS}
                      className={`bg-slate-50 dark:bg-dark-900 border border-slate-200 dark:border-dark-600 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500/50 outline-none cursor-pointer ${numeroOS ? 'opacity-50 cursor-not-allowed' : ''}`}
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
                    <label className="text-xs font-medium mb-1 block text-slate-600 dark:text-dark-400">Data Início</label>
                    <div className="relative">
                      <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-dark-400" />
                      <input
                        type="date"
                        value={dtIni}
                        onChange={(e) => setDtIni(e.target.value)}
                        className="bg-slate-50 dark:bg-dark-900 border border-slate-200 dark:border-dark-600 rounded-lg pl-10 pr-3 py-2 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500/50 outline-none w-40"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1 block text-slate-600 dark:text-dark-400">Data Fim</label>
                    <div className="relative">
                      <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-dark-400" />
                      <input
                        type="date"
                        value={dtFim}
                        onChange={(e) => setDtFim(e.target.value)}
                        className="bg-slate-50 dark:bg-dark-900 border border-slate-200 dark:border-dark-600 rounded-lg pl-10 pr-3 py-2 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500/50 outline-none w-40"
                      />
                    </div>
                  </div>

                  {/* Situação e OS */}
                  <div>
                    <label className="text-xs font-medium mb-1 block text-slate-600 dark:text-dark-400">Situação:</label>
                    <select
                      value={situacaoVendas}
                      onChange={(e) => setSituacaoVendas(e.target.value as any)}
                      className="bg-slate-50 dark:bg-dark-900 border border-slate-200 dark:border-dark-600 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500/50 outline-none cursor-pointer"
                    >
                      <option value="todas">Todas</option>
                      <option value="em_andamento">Em Andamento</option>
                      <option value="concluida">Concluída</option>
                      <option value="encerrada">Encerrada</option>
                      <option value="cancelada">Cancelada</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="text-xs font-medium mb-1 block text-slate-600 dark:text-dark-400">Buscar por OS/Pedido:</label>
                    <input
                      type="text"
                      placeholder="Ex: 12345"
                      value={numeroOS}
                      onChange={(e) => setNumeroOS(e.target.value)}
                      className="bg-slate-50 dark:bg-dark-900 border border-slate-200 dark:border-dark-600 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500/50 outline-none w-32"
                    />
                  </div>

                  {/* Botão Buscar */}
                  <button
                    onClick={buscarDatacar}
                    disabled={buscando}
                    className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors shadow-lg cursor-pointer"
                  >
                    {buscando ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                    {buscando ? 'Buscando...' : 'Buscar'}
                  </button>
                </div>
              </div>

              {/* Loading */}
              {buscando && (
                <div className="flex items-center justify-center py-16">
                  <Loader2 size={28} className="animate-spin text-blue-500 dark:text-blue-400" />
                </div>
              )}

              {/* Sem vendas */}
              {!buscando && vendasDatacar.length === 0 && (
                <div className="bg-white dark:bg-dark-800 border border-slate-200 dark:border-dark-700 rounded-xl p-12 text-center shadow-xs dark:shadow-none">
                  <Database size={40} className="text-slate-300 dark:text-dark-600 mx-auto mb-3" />
                  <p className="text-slate-600 dark:text-dark-400 text-sm font-medium">
                    Faça uma busca para ver as vendas de produtos do Datacar.
                  </p>
                </div>
              )}

              {/* Título de Resultados da Busca */}
              {!buscando && vendasDatacar.length > 0 && (
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-slate-900 dark:text-white font-bold text-sm tracking-wide">Resultados da Busca ({vendasDatacar.length})</h3>
                </div>
              )}

              {/* Lista de vendas com Layout Rico de Alta Densidade */}
              {!buscando && vendasDatacar.length > 0 && (
                <div className="space-y-3">
                  {/* Card de Progresso em Tempo Real (Datacar) */}
                  {renderCardProgresso('datacar')}

                  {/* Barra de Controle de Seleção */}
                  <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-dark-850 border border-slate-200 dark:border-dark-700/80 rounded-2xl shadow-xs">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={
                          selecionadosDatacar.size > 0 &&
                          selecionadosDatacar.size === vendasDatacar.filter(v => v.status === 'pendente').length
                        }
                        onChange={toggleTodosDatacar}
                        className="w-4 h-4 rounded border-slate-300 dark:border-dark-600 bg-white dark:bg-dark-900 text-blue-500 focus:ring-blue-500 cursor-pointer"
                      />
                      <span className="text-xs text-slate-600 dark:text-dark-300 font-semibold">
                        Selecionar todas as pendentes (<strong className="text-slate-900 dark:text-white">{selecionadosDatacar.size}</strong> de {vendasDatacar.length})
                      </span>
                    </div>

                    {selecionadosDatacar.size > 0 && (
                      <button
                        onClick={handleEnviarDatacarParaCA}
                        disabled={enviandoDatacar}
                        className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-blue-600/25 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-lg cursor-pointer"
                      >
                        {enviandoDatacar ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                        {enviandoDatacar 
                          ? `Enviando (${progressoEnvio?.processados || 0}/${progressoEnvio?.total || selecionadosDatacar.size})...` 
                          : `⚡ Enviar para Conta Azul (${selecionadosDatacar.size})`}
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
                              ? 'border-blue-500/40 bg-blue-50/50 dark:bg-dark-850/95 shadow-[0_0_15px_rgba(59,130,246,0.1)]' 
                              : 'border-slate-200 dark:border-dark-700/80 bg-white dark:bg-dark-850/80 hover:border-slate-300 dark:hover:border-dark-600 shadow-xs dark:shadow-none'
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
                                    className="w-4 h-4 rounded border-slate-300 dark:border-dark-600 bg-white dark:bg-dark-900 text-blue-500 focus:ring-blue-500 cursor-pointer"
                                  />
                                ) : (
                                  <CheckCircle size={18} className="text-emerald-500 dark:text-emerald-400 flex-shrink-0" />
                                )}
                              </div>

                              <div className="space-y-1.5 flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono font-bold text-slate-900 dark:text-white text-sm">
                                    OS #{venda.os_numero}
                                  </span>
                                  {veiculo && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                      🚗 {veiculo}
                                    </span>
                                  )}
                                  
                                  {venda.forma_pagamento && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                      💳 {venda.forma_pagamento}
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-2 text-xs flex-wrap">
                                  <span className="text-slate-900 dark:text-white font-bold truncate max-w-[280px]">
                                    {venda.cliente}
                                  </span>
                                  {venda.cliente_cpf_cnpj && (
                                    <span className="text-slate-500 dark:text-dark-400 font-mono text-[11px]">
                                      • {venda.cliente_cpf_cnpj}
                                    </span>
                                  )}
                                  {(venda.cliente_ja_cadastrado || venda.ca_status === 'cliente_existente') && (
                                    <span 
                                      title="Este cliente já possui cadastro ativo no Conta Azul (identificado por CPF/CNPJ)"
                                      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-400/60 shadow-[0_0_12px_rgba(245,158,11,0.15)] tracking-wide"
                                    >
                                      <UserCheck size={12} className="text-amber-500 dark:text-amber-400" />
                                      Já cadastrado no CA
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Resumo Financeiro da OS */}
                            <div className="flex items-center justify-between lg:justify-end gap-6 border-t lg:border-t-0 border-slate-200 dark:border-dark-700/50 pt-3 lg:pt-0">
                              <div className="text-left lg:text-right space-y-0.5">
                                <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-dark-400">
                                  <span>Peças: <strong className="text-slate-900 dark:text-white">{formatCurrency(totalProdutos)}</strong></span>
                                  <span>•</span>
                                  <span>Serviços: <strong className="text-slate-900 dark:text-white">{formatCurrency(totalServicos)}</strong></span>
                                </div>
                                {totalDesconto > 0 && (
                                  <p className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold">
                                    Desconto: -{formatCurrency(totalDesconto)}
                                  </p>
                                )}
                                <p className="text-base font-black text-slate-900 dark:text-white tabular-nums drop-shadow-sm">
                                  {formatCurrency(venda.valor_total)}
                                </p>
                              </div>

                              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => setEditandoDatacarId(venda.id)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-600 dark:text-blue-300 bg-blue-600/10 hover:bg-blue-600/20 dark:bg-blue-600/15 dark:hover:bg-blue-600/25 border border-blue-500/30 rounded-xl transition-all cursor-pointer"
                                  title="Editar Dados e Descontos da Venda"
                                >
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removerVendaDatacar(venda.id)}
                                  className="p-2 text-slate-400 hover:text-rose-600 dark:text-dark-500 dark:hover:text-rose-400 bg-slate-100 hover:bg-rose-50 dark:bg-dark-900 dark:hover:bg-rose-500/10 border border-slate-200 hover:border-rose-300 dark:border-dark-700 dark:hover:border-rose-500/30 rounded-xl transition-all cursor-pointer"
                                  title="Remover OS da lista"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Seção Expandida com Tabela de Itens e Descontos */}
                          {isExpanded && (
                            <div className="bg-slate-50 dark:bg-dark-950/60 border-t border-slate-200 dark:border-dark-700/80 p-5 space-y-4 animate-fade-in">
                              <div className="flex items-center justify-between">
                                <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                                  📦 Detalhamento de Peças e Serviços ({venda.itens?.length || 0})
                                </h4>
                                <span className="text-xs text-slate-500 dark:text-dark-400 font-mono">
                                  Data da OS: {formatDate(venda.data_venda)}
                                </span>
                              </div>

                              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-dark-700/60">
                                <table className="w-full text-left text-xs border-collapse">
                                  <thead>
                                    <tr className="bg-slate-100 dark:bg-dark-900 text-slate-600 dark:text-dark-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200 dark:border-dark-700/80">
                                      <th className="py-2.5 px-3">Tipo</th>
                                      <th className="py-2.5 px-3">Código</th>
                                      <th className="py-2.5 px-3">Descrição</th>
                                      <th className="py-2.5 px-3 text-center">Qtd</th>
                                      <th className="py-2.5 px-3 text-right">Vl Bruto</th>
                                      <th className="py-2.5 px-3 text-right text-rose-600 dark:text-rose-400">Desconto</th>
                                      <th className="py-2.5 px-3 text-right text-emerald-600 dark:text-emerald-400">Vl Líquido</th>
                                      <th className="py-2.5 px-3 text-right font-bold text-slate-900 dark:text-white">Total</th>
                                      <th className="py-2.5 px-3">NCM / CEST</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-200 dark:divide-dark-700/50">
                                    {(venda.itens || []).map((item: any, idxItem: number) => {
                                      const vBruto = Number(item.valor_unitario_original !== undefined ? item.valor_unitario_original : item.valor_unitario) || 0
                                      const desc = Number(item.desconto) || 0
                                      const vLiq = Number(item.valor_unitario) || 0
                                      const totalItem = Number(item.valor_total) || (item.quantidade * vLiq)

                                      return (
                                        <tr key={idxItem} className="hover:bg-slate-100/50 dark:hover:bg-dark-900/40 transition-colors">
                                          <td className="p-2.5">
                                            <span className={`px-2 py-0.5 rounded text-[9px] font-black ${
                                              item.tipo === 'servico'
                                                ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                                                : 'bg-blue-500/15 text-blue-600 dark:text-blue-300 border border-blue-500/30'
                                            }`}>
                                              {item.tipo === 'servico' ? 'SERVIÇO' : 'PEÇA'}
                                            </span>
                                          </td>
                                          <td className="p-2.5 font-mono text-slate-600 dark:text-dark-300 text-[11px]">{item.codigo || '-'}</td>
                                          <td className="p-2.5 font-medium text-slate-900 dark:text-white">{item.descricao}</td>
                                          <td className="p-2.5 text-center font-bold text-slate-900 dark:text-white">{item.quantidade} {item.unidade_medida || 'UN'}</td>
                                          <td className="p-2.5 text-right font-mono text-slate-600 dark:text-dark-300">{formatCurrency(vBruto)}</td>
                                          <td className="p-2.5 text-right font-mono text-rose-600 dark:text-rose-400">
                                            {desc > 0 ? `-${formatCurrency(desc * item.quantidade)}` : '-'}
                                          </td>
                                          <td className="p-2.5 text-right font-mono text-emerald-600 dark:text-emerald-400 font-semibold">{formatCurrency(vLiq)}</td>
                                          <td className="p-2.5 text-right font-mono font-bold text-slate-900 dark:text-white tabular-nums">{formatCurrency(totalItem)}</td>
                                          <td className="p-2.5 text-slate-500 dark:text-dark-400 font-mono text-[10px]">
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
                  <div className="flex items-center justify-between px-5 py-4 bg-slate-50 dark:bg-dark-850 border border-slate-200 dark:border-dark-700/80 rounded-2xl shadow-xs text-sm">
                    <p className="text-slate-600 dark:text-dark-400">
                      <strong className="text-slate-900 dark:text-white">{selecionadosDatacar.size}</strong> de <strong className="text-slate-900 dark:text-white">{vendasDatacar.length}</strong> OS selecionadas
                    </p>
                    {selecionadosDatacar.size > 0 && (
                      <button
                        onClick={handleEnviarDatacarParaCA}
                        disabled={enviandoDatacar}
                        className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-blue-600/25 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-lg cursor-pointer"
                      >
                        {enviandoDatacar ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                        {enviandoDatacar 
                          ? `Enviando (${progressoEnvio?.processados || 0}/${progressoEnvio?.total || selecionadosDatacar.size})...` 
                          : `⚡ Enviar para Conta Azul (${selecionadosDatacar.size})`}
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
      {/* ══════════════════════════════════════════════════════
          SUB-ABA 2: NF-E EMITIDAS (HISTÓRICO CONTA AZUL)
      ══════════════════════════════════════════════════════ */}
      {subAba === 'emitidas' && (() => {
        // Cálculos dos 4 Indicadores (Idêntico ao Conta Azul)
        const canceladas = notasEmitidas.filter(n => n.status === 'cancelado')
        const emitidasValidas = notasEmitidas.filter(n => n.status !== 'cancelado')
        
        const countCanceladas = canceladas.length
        const valorCanceladas = canceladas.reduce((acc, n) => acc + (Number(n.valor_total) || 0), 0)
        
        const countPendentes = vendasDatacar.filter(v => v.status === 'pendente').length
        const valorPendentes = vendasDatacar.filter(v => v.status === 'pendente').reduce((acc, v) => acc + (Number(v.valor_total) || 0), 0)
        
        const countEmitidas = emitidasValidas.length
        const valorEmitidas = emitidasValidas.reduce((acc, n) => acc + (Number(n.valor_total) || 0), 0)
        
        const totalPeriodoCount = countEmitidas + countCanceladas
        const totalPeriodoValor = valorEmitidas

        // Filtragem por situação conforme clique nos cards
        const notasExibidas = notasEmitidas.filter(n => {
          if (filtroSituacao === 'cancelado') return n.status === 'cancelado'
          if (filtroSituacao === 'emitida') return n.status !== 'cancelado'
          return true
        })

        return (
          <div className="space-y-4 animate-fade-in">
            {/* ─── BARRA DE PERÍODO & PESQUISA (ESTILO CONTA AZUL / LINEAR) ─── */}
            <div className="bg-white dark:bg-dark-800/90 border border-slate-200/80 dark:border-dark-700/80 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
              
              {/* Seletor de Mês < Mês de Ano > */}
              <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-dark-900 border border-slate-200 dark:border-dark-700 rounded-xl p-1 shadow-inner">
                <button
                  onClick={() => navegarMes(-1)}
                  disabled={carregandoNotas}
                  title="Mês anterior"
                  className="p-1.5 hover:bg-white dark:hover:bg-dark-750 text-slate-600 dark:text-dark-300 hover:text-slate-900 dark:hover:text-white rounded-lg transition-colors disabled:opacity-40 cursor-pointer"
                >
                  <ChevronLeft size={16} />
                </button>
                
                <div className="px-3 py-1 text-xs font-bold text-slate-800 dark:text-white min-w-[140px] text-center select-none">
                  {formatNomeMes(mesRef)}
                </div>

                <button
                  onClick={() => navegarMes(1)}
                  disabled={carregandoNotas}
                  title="Próximo mês"
                  className="p-1.5 hover:bg-white dark:hover:bg-dark-750 text-slate-600 dark:text-dark-300 hover:text-slate-900 dark:hover:text-white rounded-lg transition-colors disabled:opacity-40 cursor-pointer"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              {/* Campo de Pesquisa */}
              <div className="flex-1 min-w-[260px] relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-dark-400" />
                <input
                  type="text"
                  placeholder="Pesquisar por cliente, número ou chave da NF-e..."
                  value={buscaEmitidas}
                  onChange={e => setBuscaEmitidas(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-dark-900 border border-slate-200 dark:border-dark-700 rounded-xl pl-9 pr-3 py-2 text-slate-900 dark:text-white text-xs outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              {/* Ações & Período Customizado */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setMostrarFiltroCustomizado(!mostrarFiltroCustomizado)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                    mostrarFiltroCustomizado 
                      ? 'bg-blue-50 dark:bg-blue-600/20 text-blue-600 dark:text-blue-300 border-blue-300 dark:border-blue-500/40' 
                      : 'bg-white dark:bg-dark-900 text-slate-700 dark:text-dark-300 border-slate-200 dark:border-dark-700 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50'
                  }`}
                  title="Definir intervalo de datas personalizado"
                >
                  <Calendar size={13} />
                  <span>Datas</span>
                </button>

                <button
                  onClick={carregarNotasEmitidas}
                  disabled={carregandoNotas}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                >
                  <RefreshCw size={13} className={carregandoNotas ? 'animate-spin' : ''} />
                  <span>Atualizar</span>
                </button>
              </div>
            </div>

            {/* Painel Expansível de Datas Personalizadas */}
            {mostrarFiltroCustomizado && (
              <div className="bg-white dark:bg-dark-850 border border-slate-200/80 dark:border-dark-700 rounded-2xl p-3.5 flex flex-wrap items-center gap-3 animate-fade-in text-xs shadow-xs">
                <span className="text-slate-500 dark:text-dark-400 font-medium">Intervalo de Emissão:</span>
                <input
                  type="date"
                  value={dtIniEmitidas}
                  onChange={e => setDtIniEmitidas(e.target.value)}
                  className="bg-slate-50 dark:bg-dark-900 border border-slate-200 dark:border-dark-700 rounded-xl px-2.5 py-1.5 text-slate-900 dark:text-white outline-none focus:border-blue-500"
                />
                <span className="text-slate-400 dark:text-dark-500">até</span>
                <input
                  type="date"
                  value={dtFimEmitidas}
                  onChange={e => setDtFimEmitidas(e.target.value)}
                  className="bg-slate-50 dark:bg-dark-900 border border-slate-200 dark:border-dark-700 rounded-xl px-2.5 py-1.5 text-slate-900 dark:text-white outline-none focus:border-blue-500"
                />
                <button
                  onClick={carregarNotasEmitidas}
                  className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 dark:bg-dark-700 dark:hover:bg-dark-600 text-white font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  Filtrar Datas
                </button>
              </div>
            )}

            {/* ─── PAINEL SUPERIOR DE RESUMO (4 CARDS COM ÍCONES CIRCULARES RESPONSIVOS) ─── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-3.5">
              
              {/* Card 1: Notas Canceladas */}
              <div 
                onClick={() => setFiltroSituacao(filtroSituacao === 'cancelado' ? 'todas' : 'cancelado')}
                className={`p-4 rounded-2xl border transition-all duration-200 select-none flex items-center gap-3.5 cursor-pointer shadow-xs ${
                  filtroSituacao === 'cancelado' 
                    ? 'bg-rose-50/80 dark:bg-rose-500/10 border-rose-400/60 dark:border-rose-500/40 ring-2 ring-rose-500/20' 
                    : 'bg-white dark:bg-dark-800/90 border-slate-200/80 dark:border-dark-700/80 hover:bg-slate-50 dark:hover:bg-dark-750/50 hover:border-slate-300 dark:hover:border-dark-600'
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-rose-500/10 dark:bg-rose-500/20 flex items-center justify-center text-rose-600 dark:text-rose-400 flex-shrink-0 shadow-xs">
                  <AlertCircle size={18} />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-slate-500 dark:text-dark-300 flex items-center gap-1 uppercase tracking-wider">
                    <span>Canceladas</span>
                    <span className="text-rose-600 dark:text-rose-400 font-extrabold">({countCanceladas})</span>
                  </div>
                  <div className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white mt-0.5 tabular-nums font-mono">
                    {formatCurrency(valorCanceladas)}
                  </div>
                </div>
              </div>

              {/* Card 2: Pendentes */}
              <div 
                onClick={() => {
                  setFiltroSituacao(filtroSituacao === 'pendente' ? 'todas' : 'pendente')
                  if (countPendentes > 0) setSubAba('datacar')
                }}
                className={`p-4 rounded-2xl border transition-all duration-200 select-none flex items-center gap-3.5 cursor-pointer shadow-xs ${
                  filtroSituacao === 'pendente' 
                    ? 'bg-amber-50/80 dark:bg-amber-500/10 border-amber-400/60 dark:border-amber-500/40 ring-2 ring-amber-500/20' 
                    : 'bg-white dark:bg-dark-800/90 border-slate-200/80 dark:border-dark-700/80 hover:bg-slate-50 dark:hover:bg-dark-750/50 hover:border-slate-300 dark:hover:border-dark-600'
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-amber-500/10 dark:bg-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400 flex-shrink-0 shadow-xs">
                  <Clock size={18} />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-amber-600 dark:text-amber-400/90 flex items-center gap-1 uppercase tracking-wider">
                    <span>Pendentes</span>
                    <span className="text-amber-600 dark:text-amber-400 font-extrabold">({countPendentes})</span>
                  </div>
                  <div className="text-base sm:text-lg font-extrabold text-amber-600 dark:text-amber-400 mt-0.5 tabular-nums font-mono">
                    {formatCurrency(valorPendentes)}
                  </div>
                </div>
              </div>

              {/* Card 3: Emitidas */}
              <div 
                onClick={() => setFiltroSituacao(filtroSituacao === 'emitida' ? 'todas' : 'emitida')}
                className={`p-4 rounded-2xl border transition-all duration-200 select-none flex items-center gap-3.5 cursor-pointer shadow-xs ${
                  filtroSituacao === 'emitida' 
                    ? 'bg-emerald-50/80 dark:bg-emerald-500/10 border-emerald-400/60 dark:border-emerald-500/40 ring-2 ring-emerald-500/20' 
                    : 'bg-white dark:bg-dark-800/90 border-slate-200/80 dark:border-dark-700/80 hover:bg-slate-50 dark:hover:bg-dark-750/50 hover:border-slate-300 dark:hover:border-dark-600'
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 flex-shrink-0 shadow-xs">
                  <CheckCircle size={18} />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400/90 flex items-center gap-1 uppercase tracking-wider">
                    <span>Emitidas</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-extrabold">({countEmitidas})</span>
                  </div>
                  <div className="text-base sm:text-lg font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5 tabular-nums font-mono">
                    {formatCurrency(valorEmitidas)}
                  </div>
                </div>
              </div>

              {/* Card 4: Total do Período */}
              <div 
                onClick={() => setFiltroSituacao('todas')}
                className={`p-4 rounded-2xl border transition-all duration-200 select-none flex items-center gap-3.5 cursor-pointer shadow-xs ${
                  filtroSituacao === 'todas' 
                    ? 'bg-blue-50/80 dark:bg-blue-500/10 border-blue-400/60 dark:border-blue-500/40 ring-2 ring-blue-500/20' 
                    : 'bg-white dark:bg-dark-800/90 border-slate-200/80 dark:border-dark-700/80 hover:bg-slate-50 dark:hover:bg-dark-750/50 hover:border-slate-300 dark:hover:border-dark-600'
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-blue-500/10 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400 flex-shrink-0 shadow-xs">
                  <TrendingUp size={18} />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-blue-600 dark:text-blue-400/90 flex items-center gap-1 uppercase tracking-wider">
                    <span>Total do período</span>
                    <span className="text-blue-600 dark:text-blue-400 font-extrabold">({totalPeriodoCount})</span>
                  </div>
                  <div className="text-base sm:text-lg font-extrabold text-blue-600 dark:text-blue-400 mt-0.5 tabular-nums font-mono">
                    {formatCurrency(totalPeriodoValor)}
                  </div>
                </div>
              </div>

            </div>

            {/* Aviso de Filtro Ativo */}
            {filtroSituacao !== 'todas' && (
              <div className="flex items-center justify-between px-3.5 py-2 bg-slate-50 dark:bg-dark-900 border border-slate-200/80 dark:border-dark-700/80 rounded-xl text-xs">
                <span className="text-slate-600 dark:text-dark-300">
                  Filtrando por situação: <strong className="text-slate-900 dark:text-white capitalize">{filtroSituacao}</strong> ({notasExibidas.length} notas)
                </span>
                <button
                  onClick={() => setFiltroSituacao('todas')}
                  className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-semibold text-[11px] underline cursor-pointer"
                >
                  Limpar filtro
                </button>
              </div>
            )}

            {/* ─── TABELA DE NF-E EMITIDAS ─── */}
            {carregandoNotas ? (
              <div className="flex items-center justify-center py-20 bg-white dark:bg-dark-800 border border-slate-200 dark:border-dark-700 rounded-2xl shadow-xs">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 size={32} className="animate-spin text-blue-500" />
                  <span className="text-slate-500 dark:text-dark-400 text-xs font-medium">Carregando notas do Conta Azul...</span>
                </div>
              </div>
            ) : notasExibidas.length === 0 ? (
              <div className="bg-white dark:bg-dark-800 border border-slate-200 dark:border-dark-700 rounded-2xl p-12 text-center shadow-xs">
                <FileText size={40} className="text-slate-300 dark:text-dark-600 mx-auto mb-3" />
                <h3 className="text-slate-900 dark:text-white font-bold text-sm">Nenhuma NF-e encontrada no período</h3>
                <p className="text-slate-500 dark:text-dark-400 text-xs mt-1">
                  Não encontramos notas fiscais emitidas com os filtros selecionados para este mês.
                </p>
              </div>
            ) : (
              <div className="bg-white dark:bg-dark-800 border border-slate-200/80 dark:border-dark-700 rounded-2xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-dark-900/60 border-b border-slate-200 dark:border-dark-700 text-slate-500 dark:text-dark-400 font-bold uppercase tracking-wider text-[11px]">
                        <th className="py-3 px-4">Série - NF</th>
                        <th className="py-3 px-4">Emissão</th>
                        <th className="py-3 px-4">Cliente / Fornecedor</th>
                        <th className="py-3 px-4 text-center">Tipo</th>
                        <th className="py-3 px-4 text-center">Situação</th>
                        <th className="py-3 px-4 text-right">Valor (R$)</th>
                        <th className="py-3 px-4 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-dark-700/50">
                      {notasExibidas.map((nota) => {
                        const isCancelada = nota.status === 'cancelado'
                        const chave = nota.metadata?.chave_acesso || nota.dados_datacar?.chave_acesso
                        const serie = nota.metadata?.serie || nota.dados_datacar?.serie || '1'
                        return (
                          <tr key={nota.id} className="hover:bg-slate-50/80 dark:hover:bg-dark-750/40 transition-colors">
                            <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-white">
                              <span className="text-blue-600 dark:text-blue-400">{serie} - {nota.os_numero}</span>
                            </td>
                            <td className="py-3.5 px-4 text-slate-600 dark:text-dark-300 font-mono">
                              {formatDate(nota.data_venda)}
                            </td>
                            <td className="py-3.5 px-4 font-medium text-slate-900 dark:text-white">
                              {nota.cliente}
                              {nota.metadata?.cliente_cpf_cnpj && (
                                <span className="block text-[10px] text-slate-400 dark:text-dark-400 font-mono">
                                  {nota.metadata.cliente_cpf_cnpj}
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-center text-slate-500 dark:text-dark-300">
                              Saída
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              <span className={`inline-flex items-center gap-1 px-3 py-0.5 rounded-full text-[11px] font-bold border ${
                                isCancelada 
                                  ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20' 
                                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                              }`}>
                                {isCancelada ? 'Cancelada' : 'Emitida'}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-right font-bold text-slate-900 dark:text-white tabular-nums text-[13px] font-mono">
                              {formatCurrency(nota.valor_total)}
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              {chave ? (
                                <div className="flex items-center justify-end gap-1.5">
                                  <a
                                    href={`/api/notas-emitidas/danfe?empresa_id=${empresaAtiva?.id}&chave=${chave}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 border border-rose-500/20 rounded-lg text-xs font-semibold transition-colors shadow-xs"
                                    title="Visualizar e Imprimir DANFE em PDF"
                                  >
                                    <FileText size={13} />
                                    PDF
                                  </a>
                                  <a
                                    href={`/api/notas-emitidas/xml?empresa_id=${empresaAtiva?.id}&chave=${chave}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-dark-700 dark:hover:bg-dark-600 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-white rounded-lg text-xs font-semibold transition-colors"
                                    title="Baixar XML oficial da NF-e"
                                  >
                                    <Download size={13} />
                                    XML
                                  </a>
                                </div>
                              ) : (
                                <span className="text-[10px] text-slate-400 dark:text-dark-500 font-mono">
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
        )
      })()}


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
              {/* Card de Progresso em Tempo Real (Planilha) */}
              {renderCardProgresso('planilha')}

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
                  className="px-4 py-2 text-sm text-dark-300 hover:text-white bg-dark-800 rounded-lg border border-dark-700 hover:border-dark-600 transition-colors cursor-pointer"
                >
                  Cancelar / Nova Planilha
                </button>
                <button
                  type="button"
                  onClick={handleEnviarContaAzul}
                  disabled={enviandoCA || selecionados.size === 0}
                  className="px-6 py-2.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white font-medium rounded-xl transition-colors shadow-lg shadow-brand-600/20 flex items-center gap-2 cursor-pointer"
                >
                  {enviandoCA ? <Loader2 size={16} className="animate-spin" /> : null}
                  {enviandoCA 
                    ? `Enviando (${progressoEnvio?.processados || 0}/${progressoEnvio?.total || selecionados.size})...` 
                    : `Enviar ${selecionados.size} Vendas para Conta Azul`}
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

      {/* Banner Flutuante de Progresso (Sticky na tela caso o operador role a página) */}
      {progressoEnvio?.ativo && !progressoEnvio.concluido && (
        <div className="fixed bottom-5 right-5 left-5 md:left-72 md:right-8 z-50 bg-slate-900/95 backdrop-blur-md border border-blue-500/50 rounded-2xl p-4 shadow-2xl animate-fade-in text-white flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
              <Loader2 size={18} className="animate-spin text-blue-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs truncate">Sincronizando com Conta Azul...</span>
                <span className="font-mono text-xs text-blue-400 font-bold px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20">
                  {Math.min(100, Math.round(((progressoEnvio.processados || 0) / (progressoEnvio.total || 1)) * 100))}%
                </span>
              </div>
              <p className="text-[11px] text-slate-300 truncate mt-0.5">
                Venda <strong>{progressoEnvio.processados}</strong> de <strong>{progressoEnvio.total}</strong> • OS #{progressoEnvio.osAtual || 'S/N'} ({progressoEnvio.clienteAtual || 'Cliente'})
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="font-mono text-xs text-slate-300 bg-slate-800 px-2.5 py-1.5 rounded-xl border border-slate-700 flex items-center gap-1.5">
              <Clock size={12} className="text-blue-400" />
              {formatTempoDecorrido(progressoEnvio.segundosDecorridos)}
            </span>
            <button
              type="button"
              onClick={() => { abortEnvioRef.current = true }}
              className="px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-bold transition-all cursor-pointer"
            >
              Parar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
