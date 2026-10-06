"use client"

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  ArrowLeft, FileText, Upload, ChevronDown, Plus,
  Loader2, Building2, X, Calendar, FileSpreadsheet
} from 'lucide-react'
import toast from 'react-hot-toast'
import LojaCard from '@/components/gestao-pagamentos/LojaCard'
import { Empresa, Grupo } from '@/types'
import type { LojaRelatorio, PagamentoRelatorio } from '@/lib/exporters/relatorio-grupo-xlsx'

export default function GrupoDetalhe() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()
  const grupoId = params?.grupoId as string

  const [grupo, setGrupo] = useState<Grupo | null>(null)
  const [lojas, setLojas] = useState<Empresa[]>([])
  const [carregando, setCarregando] = useState(true)

  const [modalNovaLojaAberto, setModalNovaLojaAberto] = useState(false)
  const [empresasDisponiveis, setEmpresasDisponiveis] = useState<Empresa[]>([])
  const [carregandoDisponiveis, setCarregandoDisponiveis] = useState(false)
  const [adicionandoId, setAdicionandoId] = useState<string | null>(null)

  const [menuExportarAberto, setMenuExportarAberto] = useState(false)
  const [modalExportarAberto, setModalExportarAberto] = useState(false)
  const [exportInicio, setExportInicio] = useState(() => new Date().toISOString().split('T')[0])
  const [exportFim, setExportFim] = useState(() => new Date().toISOString().split('T')[0])
  const [filtroExportAtivo, setFiltroExportAtivo] = useState<'hoje' | 'ontem' | '7dias' | 'esteMes' | 'mesAnterior' | 'personalizado'>('hoje')
  const [exportando, setExportando] = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)

  const periodosPorLojaRef = useRef<Record<string, { inicio: string; fim: string }>>({})
  const handlePeriodoChange = (lojaId: string, inicio: string, fim: string) => {
    periodosPorLojaRef.current[lojaId] = { inicio, fim }
  }

  useEffect(() => {
    if (grupoId) carregarGrupo()
  }, [grupoId])

  async function carregarGrupo() {
    setCarregando(true)
    const { data: grupoData } = await supabase.from('grupos').select('*').eq('id', grupoId).single()
    setGrupo(grupoData || null)

    const { data: lojasData } = await supabase
      .from('empresas')
      .select('*')
      .eq('grupo_id', grupoId)
      .order('grupo_adicionado_em', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
      .order('nome', { ascending: true })
    setLojas(lojasData || [])
    setCarregando(false)
  }

  async function abrirModalNovaLoja() {
    setModalNovaLojaAberto(true)
    setCarregandoDisponiveis(true)
    const { data } = await supabase.from('empresas').select('*').is('grupo_id', null).order('nome')
    setEmpresasDisponiveis(data || [])
    setCarregandoDisponiveis(false)
  }

  function aplicarAtalhoExport(tipo: 'hoje' | 'ontem' | '7dias' | 'esteMes' | 'mesAnterior') {
    const agora = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const fmtYmd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

    setFiltroExportAtivo(tipo)

    if (tipo === 'hoje') {
      const d = fmtYmd(agora)
      setExportInicio(d)
      setExportFim(d)
    } else if (tipo === 'ontem') {
      const ontem = new Date(agora)
      ontem.setDate(ontem.getDate() - 1)
      const d = fmtYmd(ontem)
      setExportInicio(d)
      setExportFim(d)
    } else if (tipo === '7dias') {
      const sete = new Date(agora)
      sete.setDate(sete.getDate() - 6)
      setExportInicio(fmtYmd(sete))
      setExportFim(fmtYmd(agora))
    } else if (tipo === 'esteMes') {
      const primeiro = new Date(agora.getFullYear(), agora.getMonth(), 1)
      const ultimo = new Date(agora.getFullYear(), agora.getMonth() + 1, 0)
      setExportInicio(fmtYmd(primeiro))
      setExportFim(fmtYmd(ultimo))
    } else if (tipo === 'mesAnterior') {
      const primeiro = new Date(agora.getFullYear(), agora.getMonth() - 1, 1)
      const ultimo = new Date(agora.getFullYear(), agora.getMonth(), 0)
      setExportInicio(fmtYmd(primeiro))
      setExportFim(fmtYmd(ultimo))
    }
  }

  function abrirModalExportar() {
    setMenuExportarAberto(false)
    aplicarAtalhoExport('hoje')
    setModalExportarAberto(true)
  }

  async function handleExecutarExportacaoGeral() {
    if (!grupo) return
    if (lojas.length === 0) {
      toast.error('Esse grupo ainda não tem nenhuma loja.')
      return
    }
    if (!exportInicio || !exportFim) {
      toast.error('Informe a data inicial e final do período.')
      return
    }
    if (exportInicio > exportFim) {
      toast.error('A data inicial não pode ser posterior à data final.')
      return
    }

    setExportando(true)
    toast.loading('Gerando relatório pelo período de pagamento...', { id: 'export-geral' })
    try {
      const fmtBr = (iso: string) => iso.split('-').reverse().join('/')

      // Re-busca as empresas atualizadas do banco garantindo ordem idêntica e saldo de caixa atualizado
      const { data: lojasAtualizadas } = await supabase
        .from('empresas')
        .select('*')
        .eq('grupo_id', grupoId)
        .order('grupo_adicionado_em', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })
        .order('nome', { ascending: true })

      const listaLojasParaExportar = (lojasAtualizadas && lojasAtualizadas.length > 0) ? lojasAtualizadas : lojas

      const lojasRelatorio: LojaRelatorio[] = await Promise.all(
        listaLojasParaExportar.map(async (loja) => {
          let saldoInicial = Number(loja.saldo_caixa || 0)

          // Fallback: se saldo_caixa for 0, tenta consultar o saldo das contas financeiras do Conta Azul
          if (saldoInicial === 0 && loja.access_token_conta_azul) {
            try {
              const res = await fetch(`/api/conta-azul/contas-financeiras?empresa_id=${loja.id}`)
              if (res.ok) {
                const json = await res.json()
                if (json?.contas && Array.isArray(json.contas)) {
                  const soma = json.contas.reduce((acc: number, c: any) => acc + (Number(c.saldo) || Number(c.valor) || 0), 0)
                  if (soma !== 0) saldoInicial = soma
                }
              }
            } catch (e) {
              // Silencioso se der erro na chamada do Conta Azul
            }
          }

          const [{ data: ddas }, { data: agendamentos }] = await Promise.all([
            supabase
              .from('pagamentos_dda')
              .select('*')
              .eq('empresa_id', loja.id),
            supabase
              .from('agendamentos')
              .select('id, empresa_id, fornecedor, valor, data_vencimento, data_pagamento, competencia, descricao, cpf_cnpj, categoria, conta_pagamento, tipo, chave_pix, codigo_barras, status, transferencia_id, created_at, updated_at')
              .eq('empresa_id', loja.id),
          ])

          // Filtra exclusivamente pela Data de Pagamento (Inclusão)
          const ddasFiltrados = (ddas || []).filter((d: any) => {
            const dt = d.data_pagamento || d.data_vencimento
            if (!dt) return false
            return dt >= exportInicio && dt <= exportFim
          })

          const agendFiltrados = (agendamentos || []).filter((a: any) => {
            const dt = a.data_pagamento || a.data_vencimento
            if (!dt) return false
            return dt >= exportInicio && dt <= exportFim
          })

          const pagamentos: PagamentoRelatorio[] = [
            ...ddasFiltrados.map((d: any) => ({
              origem: 'DDA' as const,
              categoria: d.categoria || 'Material para Revenda',
              beneficiario: d.beneficiario,
              documento: d.documento || d.numero_documento,
              numero_documento: d.numero_documento,
              nosso_numero: d.nosso_numero,
              identificador_titulo: d.identificador_titulo,
              descricao: d.descricao,
              data_pagamento: d.data_pagamento || d.data_vencimento,
              data_vencimento: d.data_vencimento || d.data_pagamento,
              valor: Number(d.valor || 0),
              status: d.status,
            })),
            ...agendFiltrados.map((a: any) => {
              const origem =
                a.tipo === 'Transferência'
                  ? ('Transferência' as const)
                  : a.tipo === 'Transferência Recebida'
                  ? ('Transferência Recebida' as const)
                  : a.tipo?.includes('Folha') || a.tipo === 'Adiantamento'
                  ? ('Folha' as const)
                  : ('Agendamento' as const)
              return {
                origem,
                fornecedor: a.fornecedor,
                categoria: a.categoria || '—',
                documento: a.cpf_cnpj || a.documento || a.numero_documento,
                numero_documento: a.numero_documento,
                nosso_numero: a.nosso_numero,
                identificador_titulo: a.identificador_titulo,
                descricao: a.descricao,
                data_pagamento: a.data_pagamento || a.data_vencimento,
                data_vencimento: a.data_vencimento || a.data_pagamento,
                valor: Number(a.valor || 0),
                status: a.status,
              }
            }),
          ]

          const periodoLabel = exportInicio === exportFim
            ? fmtBr(exportInicio)
            : `${fmtBr(exportInicio)} até ${fmtBr(exportFim)}`

          return { nome: loja.nome, pagamentos, saldoInicial, periodoLabel }
        })
      )

      const { exportarRelatorioGeralXlsx } = await import('@/lib/exporters/relatorio-grupo-xlsx')
      await exportarRelatorioGeralXlsx(grupo.nome, lojasRelatorio)
      toast.success('Relatório exportado com sucesso!', { id: 'export-geral' })
      setModalExportarAberto(false)
    } catch (err: any) {
      toast.error(err.message || 'Erro ao gerar relatório', { id: 'export-geral' })
    } finally {
      setExportando(false)
    }
  }


  async function handleAdicionarLoja(empresa: Empresa) {
    setAdicionandoId(empresa.id)
    try {
      const { error } = await supabase
        .from('empresas')
        .update({ grupo_id: grupoId, grupo_adicionado_em: new Date().toISOString() })
        .eq('id', empresa.id)
      if (error) throw error
      toast.success(`${empresa.nome} adicionada ao grupo!`)
      setModalNovaLojaAberto(false)
      carregarGrupo()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao adicionar loja')
    } finally {
      setAdicionandoId(null)
    }
  }

  if (carregando) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="animate-spin text-dark-400" size={32} />
      </div>
    )
  }

  if (!grupo) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <p className="text-dark-400">Grupo não encontrado.</p>
        <button onClick={() => router.push('/gestao-pagamentos')} className="flex items-center gap-2 bg-dark-800 hover:bg-dark-700 text-white px-4 py-2 rounded-lg text-sm font-semibold">
          <ArrowLeft size={16} /> Voltar pra Meus Grupos
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="bg-[#0b0e14] border-b border-dark-700 flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-6">
          <button onClick={() => router.push('/gestao-pagamentos')} className="flex items-center gap-2 text-dark-300 hover:text-white transition-colors bg-dark-800 px-3 py-1.5 rounded-lg text-sm font-semibold">
            <ArrowLeft size={16} /> Voltar
          </button>
          <div>
            <h1 className="text-xl font-bold text-white leading-tight">Pagamentos BPO Financeiro</h1>
            <p className="text-dark-400 text-xs">Grupo: <span className="text-dark-300 font-semibold">{grupo.nome}</span></p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={abrirModalNovaLoja}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-sm font-bold transition-colors shadow-lg shadow-blue-900/20"
          >
            <Plus size={16} /> Nova Loja
          </button>

          <div className="relative">
            <button
              onClick={() => setMenuExportarAberto(!menuExportarAberto)}
              disabled={exportando}
              className="flex items-center gap-2 bg-dark-800 border border-dark-600 hover:bg-dark-700 text-white px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {exportando ? <Loader2 size={16} className="animate-spin text-dark-300" /> : <Upload size={16} className="text-dark-300" />}
              Exportar <ChevronDown size={14} className={menuExportarAberto ? 'rotate-180 transition-transform' : 'transition-transform'} />
            </button>

            {menuExportarAberto && (
              <div className="absolute top-full right-0 mt-2 w-64 bg-dark-800 border border-dark-600 rounded-xl shadow-2xl z-50 overflow-hidden">
                <button onClick={abrirModalExportar} className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-dark-700 transition-colors cursor-pointer">
                  <FileSpreadsheet size={18} className="text-emerald-400" />
                  <div>
                    <span className="text-sm font-semibold text-white block">Excel Geral (.xlsx)</span>
                    <span className="text-[11px] text-dark-400 block">Filtrar por período de pagamento</span>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6 w-full max-w-[1920px] mx-auto space-y-5 animate-fade-in">
        {lojas.length === 0 ? (
          <div className="bg-[#11141c] border border-dark-700 rounded-2xl p-16 flex flex-col items-center justify-center gap-4 text-center">
            <Building2 className="text-dark-600" size={40} />
            <p className="text-dark-400 font-semibold">Esse grupo ainda não tem nenhuma loja.</p>
            <button onClick={abrirModalNovaLoja} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors">
              <Plus size={16} /> Adicionar loja
            </button>
          </div>
        ) : (
          lojas.map(loja => (
            <LojaCard
              key={loja.id}
              empresa={loja}
              lojasDoGrupo={lojas}
              refreshTick={refreshTick}
              onTransferenciaGlobal={() => setRefreshTick(t => t + 1)}
              onPeriodoChange={handlePeriodoChange}
              onLojaRemovida={carregarGrupo}
            />
          ))
        )}
      </div>

      {modalNovaLojaAberto && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between p-5 border-b border-dark-700 shrink-0">
              <div>
                <h3 className="text-white font-bold text-lg">Adicionar loja ao grupo</h3>
                <p className="text-dark-400 text-xs">Escolha uma empresa já cadastrada (com CA/Datacar conectados)</p>
              </div>
              <button onClick={() => setModalNovaLojaAberto(false)} className="p-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800 transition-all">
                <X size={20} />
              </button>
            </div>
            <div className="overflow-y-auto p-4 space-y-2">
              {carregandoDisponiveis ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="animate-spin text-dark-400" size={24} />
                </div>
              ) : empresasDisponiveis.length === 0 ? (
                <div className="text-center py-10 px-4">
                  <p className="text-dark-400 text-sm">Nenhuma empresa disponível pra adicionar.</p>
                  <p className="text-dark-500 text-xs mt-1">Todas as empresas cadastradas já pertencem a algum grupo, ou você ainda não cadastrou nenhuma. Cadastre uma nova empresa na aba Empresas primeiro.</p>
                </div>
              ) : (
                empresasDisponiveis.map(emp => (
                  <button
                    key={emp.id}
                    onClick={() => handleAdicionarLoja(emp)}
                    disabled={!!adicionandoId}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-dark-800 hover:bg-dark-700 border border-dark-700 rounded-xl transition-colors text-left disabled:opacity-50"
                  >
                    <div className="w-9 h-9 bg-brand-500/10 border border-brand-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                      <span className="text-brand-400 font-bold text-xs">{emp.nome.charAt(0).toUpperCase()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-semibold truncate">{emp.nome}</p>
                      <p className="text-dark-500 text-xs flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${emp.conta_azul_connected ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                        {emp.conta_azul_connected ? 'CA conectado' : 'CA não conectado'}
                      </p>
                    </div>
                    {adicionandoId === emp.id && <Loader2 className="animate-spin text-dark-400" size={16} />}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {modalExportarAberto && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-dark-700 bg-dark-850">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <FileSpreadsheet size={20} />
                </div>
                <div>
                  <h3 className="text-white font-bold text-base sm:text-lg">Exportar Relatório Geral</h3>
                  <p className="text-dark-400 text-xs">Planilha Excel consolidada de todas as lojas do grupo</p>
                </div>
              </div>
              <button
                onClick={() => setModalExportarAberto(false)}
                disabled={exportando}
                className="p-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800 transition-all disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-5">
              {/* Filtros rápidos de período */}
              <div>
                <label className="text-xs font-semibold text-dark-300 uppercase tracking-wider block mb-2">
                  Atalhos de Período (Data de Pagamento)
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                  {(
                    [
                      { key: 'hoje', label: 'Hoje' },
                      { key: 'ontem', label: 'Ontem' },
                      { key: '7dias', label: '7 Dias' },
                      { key: 'esteMes', label: 'Este Mês' },
                      { key: 'mesAnterior', label: 'Mês Ant.' },
                    ] as const
                  ).map(item => {
                    const ativo = filtroExportAtivo === item.key
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => aplicarAtalhoExport(item.key)}
                        disabled={exportando}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all border text-center ${
                          ativo
                            ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300 shadow-sm shadow-emerald-900/30'
                            : 'bg-dark-800/80 border-dark-700 text-dark-300 hover:text-white hover:bg-dark-700'
                        }`}
                      >
                        {item.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Seleção de Datas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-dark-300 block mb-1.5 flex items-center gap-1.5">
                    <Calendar size={13} className="text-emerald-400" /> Data Inicial
                  </label>
                  <input
                    type="date"
                    value={exportInicio}
                    onChange={e => {
                      setExportInicio(e.target.value)
                      setFiltroExportAtivo('personalizado')
                    }}
                    disabled={exportando}
                    className="w-full bg-dark-800 border border-dark-600 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-white text-sm rounded-lg px-3 py-2 outline-none transition-all disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-dark-300 block mb-1.5 flex items-center gap-1.5">
                    <Calendar size={13} className="text-emerald-400" /> Data Final
                  </label>
                  <input
                    type="date"
                    value={exportFim}
                    onChange={e => {
                      setExportFim(e.target.value)
                      setFiltroExportAtivo('personalizado')
                    }}
                    disabled={exportando}
                    className="w-full bg-dark-800 border border-dark-600 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-white text-sm rounded-lg px-3 py-2 outline-none transition-all disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Informação Operacional */}
              <div className="bg-emerald-950/20 border border-emerald-800/30 rounded-xl p-3.5 flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold">
                  ✓
                </div>
                <div className="text-xs text-dark-300 leading-relaxed">
                  <span className="font-semibold text-emerald-300 block mb-0.5">Critério de Filtragem Operacional</span>
                  Os lançamentos serão filtrados estritamente pela <strong className="text-white">Data de Pagamento</strong> (data de inclusão no negócio). O arquivo Excel gerado incluirá as colunas <strong className="text-white">Data Pagamento</strong> e <strong className="text-white">Vencimento</strong> lado a lado.
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 p-4 border-t border-dark-700 bg-dark-850">
              <button
                type="button"
                onClick={() => setModalExportarAberto(false)}
                disabled={exportando}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-dark-400 hover:text-white hover:bg-dark-800 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExecutarExportacaoGeral}
                disabled={exportando}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded-lg text-sm font-bold transition-all shadow-lg shadow-emerald-900/20 disabled:opacity-50"
              >
                {exportando ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Gerando Planilha...
                  </>
                ) : (
                  <>
                    <FileSpreadsheet size={16} />
                    Exportar Excel (.xlsx)
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
