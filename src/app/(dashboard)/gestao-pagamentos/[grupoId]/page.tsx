"use client"

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  ArrowLeft, FileText, Upload, ChevronDown, Plus,
  Loader2, Building2, X
} from 'lucide-react'
import toast from 'react-hot-toast'
import LojaCard from '@/components/gestao-pagamentos/LojaCard'
import { Empresa, Grupo } from '@/types'
import { exportarRelatorioGeralXlsx, LojaRelatorio, PagamentoRelatorio } from '@/lib/exporters/relatorio-grupo-xlsx'

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
    const disponiveisFinanceiro = (data || []).filter(emp => {
      const temCredencialFinanceiro = Boolean(emp.access_token_conta_azul || emp.email_login || (emp as any).tipo_empresa === 'financeiro' || (emp as any).tipo_empresa === 'ambos')
      const ehSomenteBanco = emp.datacar_cod_emp === 'SOMENTE_BANCO' || (emp as any).tipo_empresa === 'somente_banco' || (emp as any).somente_banco === true
      const ehGenerico = !emp.email_login && !emp.email_login_vendas && !emp.access_token_conta_azul && !emp.access_token_conta_azul_vendas
      return temCredencialFinanceiro || ehSomenteBanco || ehGenerico
    })
    setEmpresasDisponiveis(disponiveisFinanceiro)
    setCarregandoDisponiveis(false)
  }

  async function handleExportarGeral() {
    if (!grupo) return
    if (lojas.length === 0) {
      toast.error('Esse grupo ainda não tem nenhuma loja.')
      return
    }
    setExportando(true)
    setMenuExportarAberto(false)
    toast.loading('Gerando relatório...', { id: 'export-geral' })
    try {
      const hoje = new Date().toISOString().split('T')[0]
      const fmtBr = (iso: string) => iso.split('-').reverse().join('/')

      // Re-busca as empresas atualizadas do banco garantindo ordem identica e saldo de caixa atualizado
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
          const periodo = periodosPorLojaRef.current[loja.id] || { inicio: hoje, fim: hoje }

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

          const { data: ddas } = await supabase
            .from('pagamentos_dda')
            .select('*')
            .eq('empresa_id', loja.id)

          const { data: agendamentos } = await supabase
            .from('agendamentos')
            .select('*')
            .eq('empresa_id', loja.id)

          const ddasFiltrados = (ddas || []).filter((d: any) => {
            const dt = d.data_pagamento || d.data_vencimento
            if (!dt) return false
            return dt >= periodo.inicio && dt <= periodo.fim
          })

          const agendFiltrados = (agendamentos || []).filter((a: any) => {
            const dt = a.data_pagamento || a.data_vencimento
            if (!dt) return false
            return dt >= periodo.inicio && dt <= periodo.fim
          })

          const pagamentos: PagamentoRelatorio[] = [
            ...ddasFiltrados.map((d: any) => ({
              origem: 'DDA' as const,
              beneficiario: d.beneficiario,
              documento: d.documento,
              descricao: d.descricao,
              data_vencimento: d.data_vencimento || d.data_pagamento,
              data_pagamento: d.data_pagamento || d.data_vencimento,
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
                documento: a.documento,
                descricao: a.descricao,
                data_vencimento: a.data_vencimento || a.data_pagamento,
                data_pagamento: a.data_pagamento || a.data_vencimento,
                valor: Number(a.valor || 0),
                status: a.status,
              }
            }),
          ]

          const periodoLabel = periodo.inicio === periodo.fim
            ? fmtBr(periodo.inicio)
            : `${fmtBr(periodo.inicio)} até ${fmtBr(periodo.fim)}`

          return { nome: loja.nome, pagamentos, saldoInicial, periodoLabel }
        })
      )

      await exportarRelatorioGeralXlsx(grupo.nome, lojasRelatorio)
      toast.success('Relatório exportado!', { id: 'export-geral' })
    } catch (err: any) {
      toast.error(err.message || 'Erro ao gerar relatório', { id: 'export-geral' })
    } finally {
      setExportando(false)
    }
  }

  function handleExportarEmBreve(nome: string) {
    setMenuExportarAberto(false)
    toast(`"${nome}" ainda não está disponível. Em breve!`, { icon: '🚧' })
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
              <div className="absolute top-full right-0 mt-2 w-56 bg-dark-800 border border-dark-600 rounded-xl shadow-2xl z-50 overflow-hidden">
                <button onClick={handleExportarGeral} className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-dark-700 transition-colors border-b border-dark-700/50">
                  <FileText size={16} className="text-blue-400" />
                  <span className="text-sm font-semibold text-white">Excel Geral (.xlsx)</span>
                </button>
                <button onClick={() => handleExportarEmBreve('PDF Geral (.pdf)')} className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-dark-700 transition-colors border-b border-dark-700/50">
                  <FileText size={16} className="text-rose-400" />
                  <span className="text-sm font-semibold text-white">PDF Geral (.pdf)</span>
                </button>
                <button onClick={() => handleExportarEmBreve('Excel – Folha')} className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-dark-700 transition-colors border-b border-dark-700/50">
                  <FileText size={16} className="text-emerald-400" />
                  <span className="text-sm font-semibold text-white">Excel – Folha</span>
                </button>
                <button onClick={() => handleExportarEmBreve('Excel – DDA')} className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-dark-700 transition-colors border-b border-dark-700/50">
                  <FileText size={16} className="text-blue-400" />
                  <span className="text-sm font-semibold text-white">Excel – DDA</span>
                </button>
                <button onClick={() => handleExportarEmBreve('Excel – Agend.')} className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-dark-700 transition-colors border-b border-dark-700/50">
                  <FileText size={16} className="text-amber-400" />
                  <span className="text-sm font-semibold text-white">Excel – Agend.</span>
                </button>
                <button onClick={() => handleExportarEmBreve('Backup Global (.json)')} className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-dark-700 transition-colors">
                  <FileText size={16} className="text-dark-300" />
                  <span className="text-sm font-semibold text-white">Backup Global (.json)</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="p-6 max-w-[1400px] mx-auto space-y-4 animate-fade-in">
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
    </>
  )
}
