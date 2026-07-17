'use client'

import { useState, useEffect, useCallback } from 'react'
import { useEmpresa } from '@/contexts/EmpresaContext'
import SelectorEmpresa from '@/components/layout/SelectorEmpresa'
import {
  Database, Search, Filter, Loader2,
  Eye, RefreshCw, XCircle, FileCode, FileText,
  MoreVertical, Calendar, X, CheckCircle,
  Printer, ArrowLeftRight, ShoppingCart,
  Download, AlertTriangle, FileWarning,
  ChevronLeft, ChevronRight
} from 'lucide-react'
import toast from 'react-hot-toast'

// ─── Tipos ──────────────────────────────────────────────────────────
interface NotaEmitida {
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

type AbaAtiva = 'servicos' | 'produtos'

// ─── Helpers ────────────────────────────────────────────────────────
const formatCurrency = (val: number) =>
  val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const formatDate = (d: string | null) => {
  if (!d) return '—'
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')
  } catch { return d }
}

const formatDateTime = (d: string | null) => {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  } catch { return d }
}

// ─── Gerador de XML de demonstração ─────────────────────────────────
function gerarXmlDemonstrativo(nota: NotaEmitida): string {
  const cpfCnpj = nota.dados_datacar?.cliente_cpf_cnpj || nota.metadata?.cliente_cpf_cnpj || '00.000.000/0000-00'
  return `<?xml version="1.0" encoding="UTF-8"?>
<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse">
  <infNFSe Id="NFSe_${nota.os_numero}">
    <Emissao>
      <xLocEmi>Belo Horizonte/MG</xLocEmi>
      <dCompet>${nota.data_venda || new Date().toISOString().slice(0, 10)}</dCompet>
    </Emissao>
    <Prestador>
      <xNome>Empresa Emitente</xNome>
    </Prestador>
    <Tomador>
      <CNPJ>${cpfCnpj}</CNPJ>
      <xNome>${nota.cliente}</xNome>
    </Tomador>
    <Servico>
      <cTribNac>14.01.01</cTribNac>
      <xDescServ>Serviço de manutenção veicular — OS #${nota.os_numero}</xDescServ>
    </Servico>
    <Valores>
      <vServPrest>${nota.valor_total.toFixed(2)}</vServPrest>
      <vReceb>${nota.valor_total.toFixed(2)}</vReceb>
    </Valores>
    <Situacao>${nota.status === 'cancelado' ? 'CANCELADA' : 'EMITIDA'}</Situacao>
  </infNFSe>
</NFSe>`
}

// ─── Gerador de DANFS-e HTML (demonstração) ─────────────────────────
function gerarDanfseHtml(nota: NotaEmitida): string {
  const cpfCnpj = nota.dados_datacar?.cliente_cpf_cnpj || nota.metadata?.cliente_cpf_cnpj || '—'
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>DANFS-e — OS #${nota.os_numero}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Segoe UI', Arial, sans-serif; }
    body { padding: 40px; background: #fff; color: #333; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border: 2px solid #0d6efd; padding: 20px; margin-bottom: 16px; }
    .header h1 { color: #0d6efd; font-size: 20px; }
    .header .badge { background: ${nota.status === 'cancelado' ? '#dc3545' : '#198754'}; color: #fff; padding: 4px 12px; border-radius: 4px; font-weight: bold; font-size: 12px; }
    .section { border: 1px solid #ddd; padding: 16px; margin-bottom: 12px; }
    .section h2 { font-size: 13px; text-transform: uppercase; color: #666; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 6px; }
    .row { display: flex; gap: 24px; margin-bottom: 6px; }
    .field { flex: 1; }
    .field label { font-size: 10px; color: #999; text-transform: uppercase; display: block; }
    .field span { font-size: 13px; font-weight: 500; }
    .total { text-align: right; font-size: 22px; font-weight: bold; color: #0d6efd; }
    .footer { text-align: center; margin-top: 30px; font-size: 10px; color: #aaa; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>📄 DANFS-e — Documento Auxiliar da NFS-e</h1>
      <p style="color:#666; font-size:12px; margin-top:4px;">Nota Fiscal de Serviço Eletrônica — Padrão Nacional</p>
    </div>
    <span class="badge">${nota.status === 'cancelado' ? '❌ CANCELADA' : '✅ EMITIDA'}</span>
  </div>

  <div class="section">
    <h2>Prestador de Serviço (Emitente)</h2>
    <div class="row">
      <div class="field"><label>Razão Social</label><span>Empresa Emitente</span></div>
      <div class="field"><label>Município</label><span>Belo Horizonte/MG</span></div>
    </div>
  </div>

  <div class="section">
    <h2>Tomador de Serviço</h2>
    <div class="row">
      <div class="field"><label>CPF/CNPJ</label><span>${cpfCnpj}</span></div>
      <div class="field"><label>Nome / Razão Social</label><span>${nota.cliente}</span></div>
    </div>
  </div>

  <div class="section">
    <h2>Serviço Prestado</h2>
    <div class="row">
      <div class="field"><label>OS</label><span>#${nota.os_numero}</span></div>
      <div class="field"><label>Competência</label><span>${formatDate(nota.data_venda)}</span></div>
      <div class="field"><label>Código de Tributação</label><span>14.01.01</span></div>
    </div>
    <div class="row" style="margin-top:8px">
      <div class="field"><label>Descrição</label><span>Serviço de manutenção veicular conforme ordem de serviço.</span></div>
    </div>
  </div>

  <div class="section">
    <h2>Valores</h2>
    <div class="row">
      <div class="field"><label>Valor do Serviço</label><span>${formatCurrency(nota.valor_total)}</span></div>
      <div class="field"><label>Deduções</label><span>R$ 0,00</span></div>
      <div class="field total"><label>Valor Líquido</label><span>${formatCurrency(nota.valor_total)}</span></div>
    </div>
  </div>

  <div class="footer">
    <p>Documento gerado pelo sistema ConnectA-I — Emissão: ${formatDateTime(nota.updated_at)}</p>
    <p style="margin-top:4px;">[Demonstração — Homologação]</p>
  </div>
</body>
</html>`
}

// ─── Ações de Download ──────────────────────────────────────────────
function downloadAsFile(conteudo: string, nomeArquivo: string, mimeType: string) {
  const blob = new Blob([conteudo], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function imprimirDanfse(nota: NotaEmitida) {
  const html = gerarDanfseHtml(nota)
  const win = window.open('', '_blank')
  if (win) {
    win.document.write(html)
    win.document.close()
    setTimeout(() => win.print(), 500)
  }
}

// ═══════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════
export default function NotasEmitidasPage() {
  const { empresaAtiva } = useEmpresa()

  // Estado da aba ativa
  const [abaAtiva, setAbaAtiva] = useState<AbaAtiva>('servicos')

  // Notas carregadas
  const [notasServicos, setNotasServicos] = useState<NotaEmitida[]>([])
  const [notasProdutos, setNotasProdutos] = useState<NotaEmitida[]>([])
  const [carregando, setCarregando] = useState(false)

  // Filtros
  const [busca, setBusca] = useState('')
  const [dataInicio, setDataInicio] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().slice(0, 10)
  })
  const [dataFim, setDataFim] = useState(() => new Date().toISOString().slice(0, 10))

  // UI
  const [dropdownAberto, setDropdownAberto] = useState<string | null>(null)
  const [notaVisualizar, setNotaVisualizar] = useState<NotaEmitida | null>(null)
  const [confirmandoCancelar, setConfirmandoCancelar] = useState<NotaEmitida | null>(null)
  const [cancelando, setCancelando] = useState(false)

  // ─── Buscar Notas ─────────────────────────────────────────────────
  const buscarNotas = useCallback(async (tipo: AbaAtiva) => {
    if (!empresaAtiva) return
    setCarregando(true)
    try {
      const params = new URLSearchParams({
        empresa_id: empresaAtiva.id,
        tipo,
        data_inicio: dataInicio,
        data_fim: dataFim,
        ...(busca ? { busca } : {})
      })
      const res = await fetch(`/api/notas-emitidas?${params}`)
      const data = await res.json()
      if (data.notas) {
        if (tipo === 'servicos') setNotasServicos(data.notas)
        else setNotasProdutos(data.notas)
      }
    } catch (err) {
      toast.error('Erro ao buscar notas emitidas')
    } finally {
      setCarregando(false)
    }
  }, [empresaAtiva, dataInicio, dataFim, busca])

  useEffect(() => {
    buscarNotas(abaAtiva)
  }, [empresaAtiva, abaAtiva]) // eslint-disable-line

  // ─── Cancelar Nota ────────────────────────────────────────────────
  const handleCancelar = async (nota: NotaEmitida) => {
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
      if (data.success) {
        toast.success(data.mensagem || 'Nota cancelada com sucesso!')
        setConfirmandoCancelar(null)
        buscarNotas(abaAtiva)
      } else {
        toast.error(data.error || 'Erro ao cancelar')
      }
    } catch {
      toast.error('Erro de rede ao cancelar nota')
    } finally {
      setCancelando(false)
    }
  }

  // ─── Dados da aba ativa ───────────────────────────────────────────
  const notasAtivas = abaAtiva === 'servicos' ? notasServicos : notasProdutos
  const totalValor = notasAtivas.reduce((s, n) => s + (n.valor_total || 0), 0)
  const totalEmitidas = notasAtivas.filter(n => n.status === 'enviado').length
  const totalCanceladas = notasAtivas.filter(n => n.status === 'cancelado').length

  // ═══════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-6 animate-fade-in p-2">
      {/* ─── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Database className="text-blue-500" />
            Notas Emitidas
          </h1>
        </div>
        <SelectorEmpresa />
      </div>

      {/* ─── Sub-abas: Produtos / Serviços ──────────────────────────── */}
      <div className="bg-dark-800 border border-dark-700 rounded-xl overflow-hidden">
        <div className="flex border-b border-dark-700">
          <button
            onClick={() => setAbaAtiva('servicos')}
            className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-semibold transition-all ${
              abaAtiva === 'servicos'
                ? 'bg-blue-600/15 text-blue-400 border-b-2 border-blue-500'
                : 'text-dark-400 hover:text-white hover:bg-dark-700/50'
            }`}
          >
            <FileText size={18} />
            Serviços (Gov.br / NFS-e)
            {notasServicos.length > 0 && (
              <span className="bg-blue-500/20 text-blue-400 text-[10px] px-2 py-0.5 rounded-full font-bold">
                {notasServicos.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setAbaAtiva('produtos')}
            className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-semibold transition-all ${
              abaAtiva === 'produtos'
                ? 'bg-emerald-600/15 text-emerald-400 border-b-2 border-emerald-500'
                : 'text-dark-400 hover:text-white hover:bg-dark-700/50'
            }`}
          >
            <ShoppingCart size={18} />
            Produtos (Conta Azul / NF-e)
            {notasProdutos.length > 0 && (
              <span className="bg-emerald-500/20 text-emerald-400 text-[10px] px-2 py-0.5 rounded-full font-bold">
                {notasProdutos.length}
              </span>
            )}
          </button>
        </div>

        {/* ─── Toolbar / Filtros ─────────────────────────────────────── */}
        <div className="p-4 flex flex-wrap gap-3 items-end border-b border-dark-700/50">
          {/* Busca */}
          <div className="flex-1 min-w-[220px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" size={16} />
            <input
              type="text"
              placeholder="Pesquisar pessoa física ou jurídica..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              className="w-full bg-dark-900 border border-dark-700 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-dark-500 focus:border-brand-500 outline-none transition-colors"
            />
          </div>

          {/* Data Inicial */}
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400 pointer-events-none" size={14} />
            <input
              type="date"
              value={dataInicio}
              onChange={e => setDataInicio(e.target.value)}
              className="bg-dark-900 border border-dark-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:border-brand-500 outline-none"
            />
          </div>
          <span className="text-dark-500 text-sm">até</span>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400 pointer-events-none" size={14} />
            <input
              type="date"
              value={dataFim}
              onChange={e => setDataFim(e.target.value)}
              className="bg-dark-900 border border-dark-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:border-brand-500 outline-none"
            />
          </div>

          {/* Botão Filtrar */}
          <button
            onClick={() => buscarNotas(abaAtiva)}
            disabled={carregando}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg font-semibold flex items-center gap-2 transition-colors"
          >
            {carregando ? <Loader2 size={16} className="animate-spin" /> : <Filter size={16} />}
            Filtrar
          </button>

          {/* Refresh */}
          <button
            onClick={() => buscarNotas(abaAtiva)}
            disabled={carregando}
            className="bg-dark-700 hover:bg-dark-600 border border-dark-600 text-white p-2 rounded-lg transition-colors"
            title="Recarregar"
          >
            <RefreshCw size={16} className={carregando ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* ─── Resumo ─────────────────────────────────────────────────── */}
        <div className="px-4 py-3 flex gap-6 items-center text-xs text-dark-400 border-b border-dark-700/30 bg-dark-800/50">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <strong className="text-emerald-400">{totalEmitidas}</strong> emitida{totalEmitidas !== 1 ? 's' : ''}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            <strong className="text-rose-400">{totalCanceladas}</strong> cancelada{totalCanceladas !== 1 ? 's' : ''}
          </span>
          <span className="ml-auto text-dark-300 font-mono">
            Total: <strong className="text-white">{formatCurrency(totalValor)}</strong>
          </span>
        </div>

        {/* ─── Tabela ─────────────────────────────────────────────────── */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-dark-900/50 text-dark-400 border-b border-dark-700">
              <tr>
                <th className="px-4 py-3 font-medium w-28">Geração</th>
                <th className="px-4 py-3 font-medium">Emitida para</th>
                <th className="px-4 py-3 font-medium text-center w-28">Competência</th>
                <th className="px-4 py-3 font-medium w-44">Município Emissor</th>
                <th className="px-4 py-3 font-medium text-right w-32">Preço Serviço</th>
                <th className="px-4 py-3 font-medium text-center w-28">Situação</th>
                <th className="px-4 py-3 w-14" />
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-700/50">
              {carregando && notasAtivas.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-dark-400">
                    <Loader2 className="animate-spin inline-block mb-2" size={24} />
                    <p>Carregando notas emitidas...</p>
                  </td>
                </tr>
              ) : notasAtivas.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-dark-400">
                    <FileWarning className="inline-block mb-2 text-dark-500" size={32} />
                    <p className="text-dark-300 font-medium">Nenhuma nota encontrada</p>
                    <p className="text-xs mt-1">
                      {abaAtiva === 'servicos'
                        ? 'Emita notas pelo painel de Vendas de Serviços para vê-las aqui.'
                        : 'Notas enviadas para o Conta Azul aparecerão aqui.'}
                    </p>
                  </td>
                </tr>
              ) : (
                notasAtivas.map(nota => {
                  const cpfCnpj = nota.dados_datacar?.cliente_cpf_cnpj || nota.metadata?.cliente_cpf_cnpj || ''
                  const competencia = nota.data_venda
                    ? `${nota.data_venda.slice(5, 7)}/${nota.data_venda.slice(0, 4)}`
                    : '—'
                  return (
                    <tr key={nota.id} className="hover:bg-dark-700/30 transition-colors group">
                      {/* Data Geração */}
                      <td className="px-4 py-3.5 text-dark-300 text-xs tabular-nums">
                        {formatDate(nota.data_venda)}
                      </td>

                      {/* Cliente */}
                      <td className="px-4 py-3.5 font-medium text-white max-w-[340px]">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="inline-flex items-center justify-center w-5 h-5 bg-blue-500/20 text-blue-400 text-center rounded text-[10px] font-bold leading-5 flex-shrink-0">
                            T
                          </span>
                          <span className="truncate">
                            {cpfCnpj ? `${cpfCnpj} — ` : ''}{nota.cliente}
                          </span>
                        </div>
                      </td>

                      {/* Competência */}
                      <td className="px-4 py-3.5 text-dark-300 text-center text-xs tabular-nums">
                        {competencia}
                      </td>

                      {/* Município */}
                      <td className="px-4 py-3.5 text-dark-300 text-xs">
                        Belo Horizonte/MG
                      </td>

                      {/* Valor */}
                      <td className="px-4 py-3.5 text-white font-semibold text-right tabular-nums">
                        {formatCurrency(nota.valor_total)}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5 text-center">
                        {nota.status === 'enviado' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400">
                            <CheckCircle size={12} />
                            Emitida
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-rose-500/15 text-rose-400">
                            <XCircle size={12} />
                            Cancelada
                          </span>
                        )}
                      </td>

                      {/* Ações (menu) */}
                      <td className="px-4 py-3.5 relative">
                        <button
                          onClick={() => setDropdownAberto(dropdownAberto === nota.id ? null : nota.id)}
                          className="p-1.5 text-dark-400 hover:text-white hover:bg-dark-700 rounded transition-colors"
                        >
                          <MoreVertical size={16} />
                        </button>

                        {/* Dropdown de ações */}
                        {dropdownAberto === nota.id && (
                          <div className="absolute right-10 top-2 w-52 bg-dark-800 border border-dark-600 rounded-xl shadow-2xl z-50 py-1.5 flex flex-col animate-in fade-in zoom-in duration-150">
                            {/* Visualizar */}
                            <button
                              onClick={() => { setNotaVisualizar(nota); setDropdownAberto(null) }}
                              className="flex items-center gap-3 px-4 py-2.5 text-sm text-dark-300 hover:text-white hover:bg-dark-700 transition-colors text-left"
                            >
                              <Eye size={15} className="text-blue-400" /> Visualizar
                            </button>

                            {/* Substituir (futuro) */}
                            <button
                              className="flex items-center gap-3 px-4 py-2.5 text-sm text-dark-500 cursor-not-allowed text-left"
                              disabled
                              title="Funcionalidade disponível na integração completa com a Receita"
                            >
                              <ArrowLeftRight size={15} /> Substituir
                            </button>

                            {/* Cancelar */}
                            {nota.status === 'enviado' && (
                              <button
                                onClick={() => { setConfirmandoCancelar(nota); setDropdownAberto(null) }}
                                className="flex items-center gap-3 px-4 py-2.5 text-sm text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors text-left"
                              >
                                <XCircle size={15} /> Cancelar NFS-e
                              </button>
                            )}

                            <div className="h-px bg-dark-700 my-1" />

                            {/* Download XML */}
                            <button
                              onClick={() => {
                                const xml = gerarXmlDemonstrativo(nota)
                                downloadAsFile(xml, `NFSe_OS_${nota.os_numero}.xml`, 'application/xml')
                                setDropdownAberto(null)
                                toast.success('XML baixado com sucesso!')
                              }}
                              className="flex items-center gap-3 px-4 py-2.5 text-sm text-dark-300 hover:text-white hover:bg-dark-700 transition-colors text-left"
                            >
                              <FileCode size={15} className="text-emerald-500" /> Download XML
                            </button>

                            {/* Download DANFS-e */}
                            <button
                              onClick={() => {
                                const html = gerarDanfseHtml(nota)
                                downloadAsFile(html, `DANFSe_OS_${nota.os_numero}.html`, 'text/html')
                                setDropdownAberto(null)
                                toast.success('DANFS-e baixado!')
                              }}
                              className="flex items-center gap-3 px-4 py-2.5 text-sm text-dark-300 hover:text-white hover:bg-dark-700 transition-colors text-left"
                            >
                              <Download size={15} className="text-blue-400" /> Download DANFS-e
                            </button>

                            {/* Imprimir */}
                            <button
                              onClick={() => {
                                imprimirDanfse(nota)
                                setDropdownAberto(null)
                              }}
                              className="flex items-center gap-3 px-4 py-2.5 text-sm text-dark-300 hover:text-white hover:bg-dark-700 transition-colors text-left"
                            >
                              <Printer size={15} className="text-amber-400" /> Imprimir DANFS-e
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Rodapé da tabela */}
        {notasAtivas.length > 0 && (
          <div className="px-4 py-3 border-t border-dark-700 flex items-center justify-between text-xs text-dark-400">
            <span>{notasAtivas.length} nota{notasAtivas.length !== 1 ? 's' : ''} encontrada{notasAtivas.length !== 1 ? 's' : ''}</span>
            <span className="text-dark-500">Últimos 30 dias • {abaAtiva === 'servicos' ? 'Gov.br NFS-e' : 'Conta Azul NF-e'}</span>
          </div>
        )}
      </div>

      {/* ─── Overlay para fechar dropdown ──────────────────────────── */}
      {dropdownAberto && (
        <div className="fixed inset-0 z-40" onClick={() => setDropdownAberto(null)} />
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* MODAL: VISUALIZAR NOTA                                        */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {notaVisualizar && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-dark-800 border border-dark-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            {/* Header do Modal */}
            <div className="sticky top-0 bg-dark-800 border-b border-dark-700 px-6 py-4 flex items-center justify-between z-10 rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
                  <FileText size={20} className="text-blue-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">
                    NFS-e — OS #{notaVisualizar.os_numero}
                  </h2>
                  <p className="text-xs text-dark-400">
                    Emissão: {formatDateTime(notaVisualizar.updated_at)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {notaVisualizar.status === 'enviado' ? (
                  <span className="bg-emerald-500/15 text-emerald-400 text-[11px] font-bold px-3 py-1 rounded-full flex items-center gap-1">
                    <CheckCircle size={13} /> Emitida
                  </span>
                ) : (
                  <span className="bg-rose-500/15 text-rose-400 text-[11px] font-bold px-3 py-1 rounded-full flex items-center gap-1">
                    <XCircle size={13} /> Cancelada
                  </span>
                )}
                <button
                  onClick={() => setNotaVisualizar(null)}
                  className="p-2 text-dark-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Corpo */}
            <div className="p-6 space-y-5">
              {/* Prestador */}
              <div className="bg-dark-900/50 rounded-xl p-4 border border-dark-700/50">
                <h3 className="text-[11px] font-bold text-dark-400 uppercase tracking-wider mb-3">Prestador de Serviço</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-dark-500 text-xs">Razão Social</p>
                    <p className="text-white font-medium">Empresa Emitente</p>
                  </div>
                  <div>
                    <p className="text-dark-500 text-xs">Município</p>
                    <p className="text-white font-medium">Belo Horizonte/MG</p>
                  </div>
                </div>
              </div>

              {/* Tomador */}
              <div className="bg-dark-900/50 rounded-xl p-4 border border-dark-700/50">
                <h3 className="text-[11px] font-bold text-dark-400 uppercase tracking-wider mb-3">Tomador de Serviço</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-dark-500 text-xs">CPF / CNPJ</p>
                    <p className="text-white font-medium font-mono">
                      {notaVisualizar.dados_datacar?.cliente_cpf_cnpj || notaVisualizar.metadata?.cliente_cpf_cnpj || '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-dark-500 text-xs">Nome / Razão Social</p>
                    <p className="text-white font-medium">{notaVisualizar.cliente}</p>
                  </div>
                  {notaVisualizar.dados_datacar?.cliente_logradouro && (
                    <div className="col-span-2">
                      <p className="text-dark-500 text-xs">Endereço</p>
                      <p className="text-white font-medium text-xs">
                        {[
                          notaVisualizar.dados_datacar.cliente_logradouro,
                          notaVisualizar.dados_datacar.cliente_numero,
                          notaVisualizar.dados_datacar.cliente_bairro,
                          notaVisualizar.dados_datacar.cliente_cidade
                        ].filter(Boolean).join(', ')}
                        {notaVisualizar.dados_datacar.cliente_cep && ` — CEP: ${notaVisualizar.dados_datacar.cliente_cep}`}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Serviço */}
              <div className="bg-dark-900/50 rounded-xl p-4 border border-dark-700/50">
                <h3 className="text-[11px] font-bold text-dark-400 uppercase tracking-wider mb-3">Serviço Prestado</h3>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-dark-500 text-xs">OS</p>
                    <p className="text-white font-mono font-bold">#{notaVisualizar.os_numero}</p>
                  </div>
                  <div>
                    <p className="text-dark-500 text-xs">Data / Competência</p>
                    <p className="text-white">{formatDate(notaVisualizar.data_venda)}</p>
                  </div>
                  <div>
                    <p className="text-dark-500 text-xs">Cód. Tributação</p>
                    <p className="text-white font-mono">14.01.01</p>
                  </div>
                </div>
              </div>

              {/* Valores */}
              <div className="bg-blue-500/5 rounded-xl p-4 border border-blue-500/20">
                <h3 className="text-[11px] font-bold text-blue-400 uppercase tracking-wider mb-3">Valores</h3>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-dark-500 text-xs">Valor do Serviço</p>
                    <p className="text-white text-lg font-bold">{formatCurrency(notaVisualizar.valor_total)}</p>
                  </div>
                  <div>
                    <p className="text-dark-500 text-xs">Deduções</p>
                    <p className="text-white">R$ 0,00</p>
                  </div>
                  <div>
                    <p className="text-dark-500 text-xs">Valor Líquido</p>
                    <p className="text-blue-400 text-lg font-bold">{formatCurrency(notaVisualizar.valor_total)}</p>
                  </div>
                </div>
              </div>

              {/* Mensagem do sistema */}
              {notaVisualizar.erro_mensagem && (
                <div className="bg-dark-900/30 rounded-lg p-3 text-xs text-dark-400 border border-dark-700/30">
                  <strong className="text-dark-300">Mensagem:</strong> {notaVisualizar.erro_mensagem}
                </div>
              )}
            </div>

            {/* Rodapé com ações */}
            <div className="border-t border-dark-700 px-6 py-4 flex items-center gap-3 justify-end">
              <button
                onClick={() => imprimirDanfse(notaVisualizar)}
                className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 rounded-lg text-sm font-medium transition-colors"
              >
                <Printer size={15} /> Imprimir
              </button>
              <button
                onClick={() => {
                  const xml = gerarXmlDemonstrativo(notaVisualizar)
                  downloadAsFile(xml, `NFSe_OS_${notaVisualizar.os_numero}.xml`, 'application/xml')
                }}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 rounded-lg text-sm font-medium transition-colors"
              >
                <FileCode size={15} /> XML
              </button>
              <button
                onClick={() => {
                  const html = gerarDanfseHtml(notaVisualizar)
                  downloadAsFile(html, `DANFSe_OS_${notaVisualizar.os_numero}.html`, 'text/html')
                }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 rounded-lg text-sm font-medium transition-colors"
              >
                <Download size={15} /> DANFS-e
              </button>
              <button
                onClick={() => setNotaVisualizar(null)}
                className="px-4 py-2 bg-dark-700 text-dark-300 hover:text-white rounded-lg text-sm font-medium transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* MODAL: CONFIRMAR CANCELAMENTO                                 */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {confirmandoCancelar && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-dark-800 border border-dark-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-6 text-center space-y-4">
              <div className="w-16 h-16 bg-rose-500/15 rounded-full flex items-center justify-center mx-auto">
                <AlertTriangle size={32} className="text-rose-400" />
              </div>
              <h2 className="text-lg font-bold text-white">Cancelar NFS-e?</h2>
              <p className="text-dark-400 text-sm">
                Tem certeza que deseja cancelar a nota da{' '}
                <strong className="text-white">OS #{confirmandoCancelar.os_numero}</strong> do cliente{' '}
                <strong className="text-white">{confirmandoCancelar.cliente}</strong>?
              </p>
              <p className="text-rose-400/80 text-xs bg-rose-500/5 border border-rose-500/20 rounded-lg p-3">
                ⚠️ Esta ação não pode ser desfeita. A nota ficará marcada como cancelada no sistema.
              </p>
            </div>
            <div className="border-t border-dark-700 px-6 py-4 flex gap-3 justify-end">
              <button
                onClick={() => setConfirmandoCancelar(null)}
                disabled={cancelando}
                className="px-4 py-2 bg-dark-700 text-dark-300 hover:text-white rounded-lg text-sm font-medium transition-colors"
              >
                Voltar
              </button>
              <button
                onClick={() => handleCancelar(confirmandoCancelar)}
                disabled={cancelando}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-lg text-sm font-bold flex items-center gap-2 transition-colors"
              >
                {cancelando ? <Loader2 size={15} className="animate-spin" /> : <XCircle size={15} />}
                {cancelando ? 'Cancelando...' : 'Confirmar Cancelamento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
