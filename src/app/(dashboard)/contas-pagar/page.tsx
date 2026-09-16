'use client'

import { useState, useCallback, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useEmpresa } from '@/contexts/EmpresaContext'
import { createClient } from '@/lib/supabase/client'
import DropZone from '@/components/upload/DropZone'
import ContasPreviewSection from '@/components/upload/ContasPreviewSection'
import TabelaContas from '@/components/upload/TabelaContas'
import SelectorEmpresa from '@/components/layout/SelectorEmpresa'
import PainelAgendamento from '@/components/agendamento/PainelAgendamento'
import type { ContaPagarPreview, ResultadoImportacao } from '@/types'
import type { Empresa } from '@/types'
import {
  Sparkles,
  Upload, ArrowLeft, Loader2,
  CheckCircle, AlertCircle, FileDown, Send,
  X, ShieldCheck, ChevronDown, Database,
  Search, Calendar, FileText, FileSpreadsheet, ExternalLink
} from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'
import { exportarParaContaAzulXls } from '@/lib/exporters/contaazul-xls'
import { matchFornecedoresEmLote, type RegraDepara } from '@/lib/utils/match-fornecedor'
import { type FornecedorContaAzul } from '@/lib/parsers/fornecedores-contaazul'

type Etapa = 'upload' | 'preview'
type SubAba = 'datacar' | 'planilha'

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
  // A empresa selecionada é SEMPRE a empresa ativa do painel por padrão (nunca troca silenciosamente)
  const [empresaSelecionada, setEmpresaSelecionada] = useState<Empresa | null>(empresaAtiva)
  const [abrirSeletor, setAbrirSeletor] = useState(false)
  const [busca, setBusca] = useState('')

  // Sincroniza se a empresaAtiva mudar
  useEffect(() => {
    if (empresaAtiva) {
      setEmpresaSelecionada(empresaAtiva)
    }
  }, [empresaAtiva])

  const conectado = !!empresaSelecionada?.access_token_conta_azul

  // Identifica se o usuário escolheu conscientemente uma loja de destino diferente da loja ativa
  const lojaDiferente = !!(
    empresaAtiva &&
    empresaSelecionada &&
    empresaAtiva.id !== empresaSelecionada.id
  )

  const empresasFiltradas = todasEmpresas.filter((emp) => {
    if (!busca) return true
    const termo = busca.toLowerCase()
    const matchNome = emp.nome.toLowerCase().includes(termo)
    const matchCnpj = emp.cnpj ? emp.cnpj.replace(/\D/g, '').includes(termo.replace(/\D/g, '')) : false
    return matchNome || matchCnpj
  })

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-dark-850 border border-dark-700/80 rounded-xl w-full max-w-md shadow-2xl animate-fade-in flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-dark-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-brand-500/15 border border-brand-500/30 rounded-lg flex items-center justify-center">
              <Send size={16} className="text-brand-400" />
            </div>
            <h3 className="text-white font-bold">Enviar ao Conta Azul</h3>
          </div>
          <button onClick={onCancelar} className="p-1.5 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700 transition-all">
            <X size={16} />
          </button>
        </div>

        {/* Conteúdo com scroll */}
        <div className="p-5 space-y-4 overflow-y-auto custom-scrollbar flex-1">
          <p className="text-dark-300 text-sm">Empresa de destino dos lançamentos:</p>

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
              <div className="w-10 h-10 bg-brand-500/15 border border-brand-500/30 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-brand-300 font-bold text-sm">
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

            {/* Dropdown de empresas com busca e rolagem */}
            {abrirSeletor && todasEmpresas.length > 1 && (
              <div className="absolute top-full mt-1 left-0 right-0 bg-dark-800 border border-dark-600 rounded-xl shadow-2xl z-20 overflow-hidden animate-fade-in">
                {/* Campo de Busca */}
                <div className="p-2 border-b border-dark-700 bg-dark-900/90">
                  <div className="relative">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dark-400" />
                    <input
                      type="text"
                      value={busca}
                      onChange={(e) => setBusca(e.target.value)}
                      placeholder="Pesquisar loja por nome ou CNPJ..."
                      className="w-full h-10 bg-dark-900 border border-dark-700 rounded-lg pl-9 pr-3 text-sm text-white placeholder-dark-500 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-colors"
                    />
                  </div>
                </div>

                {/* Lista rolável */}
                <div className="max-h-60 overflow-y-auto divide-y divide-dark-700/50 custom-scrollbar">
                  {empresasFiltradas.length === 0 ? (
                    <div className="p-4 text-center text-xs text-dark-400">
                      Nenhuma loja encontrada para "{busca}"
                    </div>
                  ) : (
                    empresasFiltradas.map((emp) => {
                      const empConectada = !!emp.access_token_conta_azul
                      const isSelected = empresaSelecionada?.id === emp.id
                      return (
                        <button
                          key={emp.id}
                          onClick={() => { setEmpresaSelecionada(emp); setAbrirSeletor(false); setBusca('') }}
                          className={cn(
                            'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
                            isSelected ? 'bg-brand-950/60 text-brand-300 border border-brand-500/40' : 'hover:bg-dark-800 text-dark-200'
                          )}
                        >
                          <div className="w-8 h-8 bg-brand-500/15 rounded-lg flex items-center justify-center flex-shrink-0">
                            <span className="text-brand-300 font-bold text-xs">{emp.nome.charAt(0).toUpperCase()}</span>
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
                          {isSelected && <CheckCircle size={14} className="text-emerald-400 flex-shrink-0" />}
                        </button>
                      )
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Aviso se a loja NÃO estiver conectada ao Conta Azul */}
          {!conectado && empresaSelecionada && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 space-y-2.5 animate-fade-in">
              <div className="flex items-start gap-2">
                <AlertCircle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-amber-300 text-xs font-semibold">Conta Azul Financeiro não conectado</p>
                  <p className="text-xs text-dark-300 mt-1 leading-relaxed">
                    A loja <strong className="text-white">{empresaSelecionada.nome}</strong> ainda não está conectada ao Conta Azul no módulo Financeiro.
                  </p>
                </div>
              </div>

              <div className="pt-1">
                <a
                  href={`/conectar?empresa_id=${empresaSelecionada.id}&modulo=financeiro`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition-all shadow-md shadow-emerald-900/20"
                >
                  <ExternalLink size={13} />
                  Conectar Conta Azul de {empresaSelecionada.nome}
                </a>
              </div>
            </div>
          )}

          {/* Aviso se o usuário escolheu propositalmente enviar para outra loja */}
          {conectado && lojaDiferente && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 space-y-1.5 animate-fade-in">
              <div className="flex items-start gap-2">
                <AlertCircle size={15} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-amber-300 text-xs font-semibold">Atenção: Loja de destino diferente!</p>
              </div>
              <p className="text-xs text-dark-300 pl-5 leading-relaxed">
                Você está visualizando os lançamentos de <strong className="text-white">{empresaAtiva?.nome}</strong>, mas selecionou enviar para a conexão do Conta Azul da loja <strong className="text-amber-300">{empresaSelecionada?.nome}</strong>.
              </p>
            </div>
          )}

          {conectado && !lojaDiferente && (
            <p className="text-dark-500 text-xs">
              Todas as contas <strong className="text-dark-300">pendentes</strong> desta empresa serão enviadas ao Conta Azul oficial de <strong className="text-white">{empresaSelecionada?.nome}</strong>.
            </p>
          )}
        </div>

        {/* Ações */}
        <div className="p-5 border-t border-dark-700 flex gap-3 flex-shrink-0">
          <button
            onClick={onCancelar}
            className="flex-1 bg-dark-700 hover:bg-dark-600 text-dark-300 hover:text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={() => empresaSelecionada && onConfirmar(empresaSelecionada.id)}
            disabled={!conectado || enviando || !empresaSelecionada}
            className="flex-1 h-10 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm"
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
  const { empresaAtiva, empresas, setEmpresaAtiva } = useEmpresa()
  const searchParams = useSearchParams()
  const urlEmpresaId = searchParams?.get('empresa_id')
  const [urlEmpresaProcessada, setUrlEmpresaProcessada] = useState(false)

  useEffect(() => {
    if (!urlEmpresaProcessada && urlEmpresaId && empresas.length > 0) {
      const emp = empresas.find(e => e.id === urlEmpresaId)
      if (emp) {
        setEmpresaAtiva(emp)
        if (typeof window !== 'undefined') {
          window.history.replaceState({}, '', window.location.pathname)
        }
      }
      setUrlEmpresaProcessada(true)
    }
  }, [urlEmpresaId, empresas, urlEmpresaProcessada, setEmpresaAtiva])

  const [etapa, setEtapa] = useState<Etapa>('upload')
  const [subAba, setSubAba] = useState<SubAba>('datacar')
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [gerandoXls, setGerandoXls] = useState(false)
  const [enviandoCA, setEnviandoCA] = useState(false)
  const [refreshContas, setRefreshContas] = useState(0)
  const [showModalEnvio, setShowModalEnvio] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const [statusProgresso, setStatusProgresso] = useState<{
    total: number
    enviados: number
    erros: number
    restantes: number
    emExecucao: boolean
  } | null>(null)

  // Estados Datacar (Datas determinísticas timezone-safe)
  const agora = new Date()
  const anoAtual = agora.getFullYear()
  const mesAtual = String(agora.getMonth() + 1).padStart(2, '0')
  const diaAtual = String(agora.getDate()).padStart(2, '0')
  const hoje = `${anoAtual}-${mesAtual}-${diaAtual}`
  const primeiroDia = `${anoAtual}-${mesAtual}-01`
  const [buscando, setBuscando] = useState(false)
  const [dtIni, setDtIni] = useState(primeiroDia)
  const [dtFim, setDtFim] = useState(hoje)
  const [tipoPeriodoContas, setTipoPeriodoContas] = useState<'venc' | 'emis' | 'pgto' | 'digit'>('venc')
  const [statusPagamento, setStatusPagamento] = useState<'apagar' | 'pagas' | 'todas'>('todas')
  const [localPagamento, setLocalPagamento] = useState<'todos' | 'BANCO' | 'CARTEIRA' | 'TRANSFERENCIA'>('todos')
  const [contasPreviewDados, setContasPreviewDados] = useState<ContaPagarPreview[] | null>(null)

  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setUserEmail(data.user.email)
    })
    
    if (typeof window !== 'undefined') {
      const raw = sessionStorage.getItem('itens_para_revisao')
      if (raw) {
        try {
          const itens = JSON.parse(raw)
          if (Array.isArray(itens) && itens.length > 0) {
            setResultado({
              total: itens.length,
              validos: itens.length,
              invalidos: 0,
              dados: itens,
            })
            setEtapa('preview')
          }
        } catch (err) {
          console.error('Erro ao ler itens para revisao:', err)
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleResultado = useCallback(async (res: ResultadoImportacao) => {
    setResultado(res)
    setEtapa('preview')
  }, [])

  const handleBuscarContasDatacar = async () => {
    if (!empresaAtiva) { toast.error('Selecione uma empresa primeiro'); return }
    if (!empresaAtiva.datacar_token) {
      toast.error('Configure as credenciais do Datacar para esta empresa na tela de Empresas.')
      return
    }

    setBuscando(true)
    setContasPreviewDados(null)
    try {
      const res = await fetch('/api/datacar/buscar-contas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresa_id: empresaAtiva.id, dtIni, dtFim, tipoPeriodo: tipoPeriodoContas, statusPagamento, localPagamento }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao buscar contas no Datacar')

      const dadosPreview: ContaPagarPreview[] = (data.dados || []).map((d: any) => {
        const converterData = (dt: string | null | undefined) => {
          if (!dt) return undefined
          const s = String(dt).trim()
          if (!s) return undefined
          if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10)
          if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(s)) {
            const [dia, mes, ano] = s.split('/')
            return `${ano.substring(0, 4)}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`
          }
          const dataStr = s.split('T')[0].split(' ')[0]
          return dataStr || undefined
        }

        return {
          fornecedor: d.fornecedor,
          valor: d.valor,
          vencimento: converterData(d.vencimento) || d.vencimento,
          emissao: converterData(d.emissao),
          doc: d.doc || undefined,
          categoria: d.categoria || undefined,
          descricao: d.descricao || undefined,
          valido: d.valido,
          erros: d.erros,
        }
      })

      setContasPreviewDados(dadosPreview)
      toast.success(`${data.total} contas encontradas no Datacar!`)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao buscar contas')
    } finally {
      setBuscando(false)
    }
  }

  const handleSalvar = async (itens: ContaPagarPreview[]) => {
    if (!empresaAtiva) { toast.error('Selecione uma empresa primeiro'); return }
    if (itens.length === 0) { toast.error('Selecione ao menos um registro'); return }

    setSalvando(true)
    try {
      const itensParaSalvar = itens.map((d) => ({
          empresa_id: empresaAtiva.id,
          fornecedor: d.fornecedor.trim(),
          valor: d.valor,
          vencimento: d.vencimento || hoje,
          categoria: d.categoria || 'Materiais para Revenda',
          conta_financeira: d.conta_financeira || null,
          conta_financeira_id: d.conta_financeira_id || null,
          descricao: d.descricao || null,
          doc: d.doc || null,
          emissao: d.emissao || null,
          status: 'pendente',
          metadata: { ...(d.metadata || {}), anexo_url: d.anexo_url || d.metadata?.anexo_url || null },
      }))

      const { error } = await supabase
        .from('contas_pagar_importadas')
        .upsert(itensParaSalvar, {
          onConflict: 'empresa_id,fornecedor,valor,vencimento,doc',
          ignoreDuplicates: true,
        })

      if (error) throw error

      toast.success(`${itens.length} contas salvas com sucesso!`)
      setEtapa('upload')
      setSubAba('datacar')
      setResultado(null)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar'
      toast.error(msg)
    } finally {
      setSalvando(false)
    }
  }

  const handleBaixarXls = async () => {
    setGerandoXls(true)
    try {
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
      let regrasDepara: RegraDepara[] = []
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

      const { data: deparaDB } = await supabase
        .from('fornecedor_depara')
        .select('nome_original_normalizado, nome_corrigido')
        .eq('empresa_id', empresaAtiva.id)
      if (deparaDB) {
        regrasDepara = deparaDB.map(r => ({
          nomeOriginalNormalizado: r.nome_original_normalizado,
          nomeCorrigido: r.nome_corrigido,
        }))
      }

      const nomesParaMatch = data.map(c => c.fornecedor)
      const matchMap = (fornecedores.length > 0 || regrasDepara.length > 0)
        ? matchFornecedoresEmLote(nomesParaMatch, fornecedores, regrasDepara)
        : new Map()

      const contas: ContaPagarPreview[] = data.map((c) => {
        const match = matchMap.get(c.fornecedor)
        const fornecedorFinal = match && match.confianca === 'exato' ? match.nomeCorrigido : c.fornecedor

        return {
          fornecedor: fornecedorFinal,
          valor: Number(c.valor),
          vencimento: c.vencimento,
          categoria: c.categoria || match?.categoria || 'Materiais para Revenda',
          descricao: c.descricao || undefined,
          doc: c.doc || undefined,
          emissao: c.emissao || undefined,
          matchFornecedor: match || undefined,
          valido: true,
        }
      })

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

  const handleBaixarXlsPreview = (itens: ContaPagarPreview[]) => {
    try {
      exportarParaContaAzulXls(itens, { categoria: '' })
      toast.success(`Planilha gerada com ${itens.length} lançamentos! Importe no ContaAzul.`, { duration: 5000 })
    } catch (err: any) {
      toast.error(err.message || 'Erro ao gerar planilha')
    }
  }

  const executarEnvioEmLote = async (targetEmpresaId?: string) => {
    const idParaEnvio = targetEmpresaId || empresaAtiva?.id
    if (!idParaEnvio) {
      toast.error('Selecione uma empresa primeiro')
      return
    }

    const empresaEnvio = empresas.find(e => e.id === idParaEnvio) || empresaAtiva
    const temConexaoCA = !!empresaEnvio?.access_token_conta_azul

    if (!temConexaoCA) {
      toast.error('Empresa não está conectada ao Conta Azul. Acesse Empresas e conecte primeiro.')
      return
    }

    setEnviandoCA(true)
    setShowModalEnvio(false)

    // Se o usuário selecionou uma empresa de destino diferente da atual no modal de envio,
    // transfere as contas pendentes da empresa atual para a empresa de destino com tratamento de duplicidade
    if (empresaAtiva && idParaEnvio !== empresaAtiva.id) {
      try {
        const resMover = await fetch('/api/contas-pagar/mover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            empresa_origem_id: empresaAtiva.id,
            empresa_destino_id: idParaEnvio,
          }),
        })
        if (!resMover.ok) {
          const errData = await resMover.json()
          throw new Error(errData.error || 'Erro ao transferir contas para a empresa destino')
        }
      } catch (e: any) {
        console.error('[contas-pagar] Erro ao transferir contas para a empresa destino:', e)
        toast.error(e.message || 'Erro ao transferir contas para a empresa destino')
        setEnviandoCA(false)
        return
      }
    }

    // 1. Buscar total inicial de pendentes
    let totalInicial = 0
    try {
      const { count } = await supabase
        .from('contas_pagar_importadas')
        .select('*', { count: 'exact', head: true })
        .eq('empresa_id', idParaEnvio)
        .eq('status', 'pendente')
      totalInicial = count || 0
    } catch (e) {
      console.error('[contas-pagar] Erro ao contar pendentes iniciais:', e)
    }

    let acumuladoEnviados = 0
    let acumuladoErros = 0
    let loopRestantes = totalInicial || 1
    let totalGeral = totalInicial
    let tentativasErroConsecutivas = 0

    setStatusProgresso({
      total: totalGeral > 0 ? totalGeral : 1,
      enviados: 0,
      erros: 0,
      restantes: totalGeral > 0 ? totalGeral : 1,
      emExecucao: true
    })

    while (loopRestantes > 0 && tentativasErroConsecutivas < 3) {
      try {
        const res = await fetch('/api/conta-azul/enviar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ empresa_id: idParaEnvio, limite: 50 }),
        })

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}))
          throw new Error(errBody.error || `Erro HTTP ${res.status} no lote`)
        }

        const data = await res.json()
        tentativasErroConsecutivas = 0 // reset erros consecutivos após sucesso

        const loteEnviados = data.enviados || 0
        const loteErros = data.erros || 0
        acumuladoEnviados += loteEnviados
        acumuladoErros += loteErros

        if (typeof data.pendentes_restantes === 'number') {
          loopRestantes = data.pendentes_restantes
        } else {
          loopRestantes = Math.max(0, loopRestantes - (loteEnviados + loteErros))
        }

        if (totalGeral === 0 || acumuladoEnviados + acumuladoErros + loopRestantes > totalGeral) {
          totalGeral = acumuladoEnviados + acumuladoErros + loopRestantes
        }

        setStatusProgresso({
          total: totalGeral,
          enviados: acumuladoEnviados,
          erros: acumuladoErros,
          restantes: loopRestantes,
          emExecucao: true
        })

        setRefreshContas(prev => prev + 1)

        // Se finalizou ou não processou nada neste ciclo
        if (loopRestantes === 0 || (loteEnviados === 0 && loteErros === 0)) {
          break
        }

        // Delay de segurança de 1.5 segundos entre lotes para evitar estouro da API Conta Azul
        await new Promise(r => setTimeout(r, 1500))

      } catch (err: any) {
        tentativasErroConsecutivas++
        console.error(`[contas-pagar] Erro no lote (tentativa ${tentativasErroConsecutivas}/3):`, err)
        if (tentativasErroConsecutivas < 3) {
          toast(`Aguardando para retentar lote (${tentativasErroConsecutivas}/3)...`, { icon: '⏳' })
          await new Promise(r => setTimeout(r, 3000))
        } else {
          toast.error(`Falha no envio do lote automático: ${err.message || err}`)
          break
        }
      }
    }

    setEnviandoCA(false)
    setStatusProgresso(prev => prev ? { ...prev, emExecucao: false, restantes: 0 } : null)
    setRefreshContas(prev => prev + 1)

    if (empresaEnvio && empresaAtiva?.id !== empresaEnvio.id) {
      setEmpresaAtiva(empresaEnvio)
    }

    if (acumuladoEnviados > 0 || acumuladoErros > 0) {
      toast.success(`Integração finalizada! Enviados: ${acumuladoEnviados}, Erros: ${acumuladoErros}`, { duration: 6000 })
    } else {
      toast('Nenhuma conta pendente para enviar.', { icon: 'ℹ️' })
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
        onConfirmar={executarEnvioEmLote}
        onCancelar={() => setShowModalEnvio(false)}
        enviando={enviandoCA}
      />
    )}

    <div className="max-w-6xl mx-auto px-3.5 sm:px-6 py-5 space-y-5 animate-fade-in">
      {/* CABEÇALHO COMPACTO DA PÁGINA (Padrão Empresas) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-dark-700/60">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-brand-500/15 border border-brand-500/30 flex items-center justify-center text-brand-400 flex-shrink-0">
            <FileText size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight leading-tight">
                Contas a Pagar
              </h1>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <Sparkles size={10} />
                <span>Produção</span>
              </span>
            </div>
            <p className="text-xs text-dark-400">
              Importação DataCar (CpRl010), conciliação e envio ao Conta Azul
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <SelectorEmpresa />
          {subAba === 'planilha' && etapa !== 'upload' && (
            <button
              onClick={() => { setEtapa('upload'); setResultado(null) }}
              className="px-3 py-1.5 bg-dark-800 hover:bg-dark-700 text-dark-300 hover:text-white border border-dark-700 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
            >
              <ArrowLeft size={13} />
              <span>Voltar</span>
            </button>
          )}
          {subAba === 'datacar' && contasPreviewDados && (
            <button
              onClick={() => { setContasPreviewDados(null) }}
              className="px-3 py-1.5 bg-dark-800 hover:bg-dark-700 text-dark-300 hover:text-white border border-dark-700 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
            >
              <ArrowLeft size={13} />
              <span>Voltar à Busca</span>
            </button>
          )}
        </div>
      </div>

      {/* Barra de Abas Horizontais (Design System Fase 4) */}
      <div className="flex items-center justify-between border-b border-dark-700/60 pb-3">
        <div className="inline-flex p-1 bg-dark-900 border border-dark-700/60 rounded-xl gap-1">
          <button
            onClick={() => setSubAba('datacar')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
              subAba === 'datacar'
                ? 'bg-brand-950/60 text-brand-300 border border-brand-500/40 font-semibold shadow-xs'
                : 'text-dark-400 hover:text-dark-200 hover:bg-dark-800/60 border border-transparent'
            }`}
          >
            <Database size={15} />
            <span>Datacar Contas</span>
          </button>
          <button
            onClick={() => setSubAba('planilha')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
              subAba === 'planilha'
                ? 'bg-brand-950/60 text-brand-300 border border-brand-500/40 font-semibold shadow-xs'
                : 'text-dark-400 hover:text-dark-200 hover:bg-dark-800/60 border border-transparent'
            }`}
          >
            <FileSpreadsheet size={15} />
            <span>Importar Planilha</span>
          </button>
        </div>
      </div>

      {/* SUB-ABA: DATACAR */}
      {subAba === 'datacar' && (
        <div className="space-y-4 pt-2">
          {!empresaAtiva ? (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 flex items-center gap-3">
              <AlertCircle size={18} className="text-yellow-400 flex-shrink-0" />
              <p className="text-yellow-300 text-sm">
                Selecione uma empresa no menu superior para ver as contas importadas.
              </p>
            </div>
          ) : contasPreviewDados ? (
            <ContasPreviewSection
              dadosIniciais={contasPreviewDados}
              empresaAtiva={empresaAtiva}
              onSalvar={async (itens) => {
                await handleSalvar(itens);
                setContasPreviewDados(null);
              }}
              onBaixarXls={handleBaixarXlsPreview}
              salvando={salvando}
            />
          ) : (
            <>
              {/* Painel de Agendamento Automático */}
              {empresaAtiva.datacar_token && (
                <PainelAgendamento 
                  tipo="contas_pagar" 
                />
              )}

              {/* Formulário de Busca do Datacar (Design System Fase 4) */}
              <div className="bg-dark-850/90 border border-dark-700/60 rounded-xl p-4 sm:p-5 shadow-xs space-y-4 animate-fade-in">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-dark-700/50">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-brand-500/15 border border-brand-500/30 flex items-center justify-center text-brand-400 flex-shrink-0">
                      <Database size={16} />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white leading-tight">Buscar Contas do Datacar</h3>
                      <p className="text-xs text-dark-400">Consulte lançamentos financeiros cadastrados no sistema Datacar</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {empresaAtiva.datacar_token ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-dark-900/60 border border-dark-700/50 text-dark-200">
                        <Database size={11} className="text-emerald-400" />
                        <span>Datacar Ativo</span>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-glow-sm" />
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-500/10 border border-amber-500/30 text-amber-300">
                        <AlertCircle size={11} className="text-amber-400" />
                        <span>Não Configurado</span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
                  <div>
                    <label className="text-xs font-medium mb-1.5 block text-dark-300">
                      Por:
                    </label>
                    <select
                      id="tipoPeriodoContas"
                      value={tipoPeriodoContas}
                      onChange={(e) => setTipoPeriodoContas(e.target.value as any)}
                      className="w-full h-10 bg-dark-900 border border-dark-700 rounded-lg px-3 text-white text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-colors"
                    >
                      <option value="venc">Vencimento</option>
                      <option value="emis">Emissão</option>
                      <option value="pgto">Pagamento</option>
                      <option value="digit">Digitação no Sistema</option>
                    </select>
                  </div>

                  {/* Filtro: Pagamento */}
                  <div>
                    <label className="text-xs font-medium mb-1.5 block text-dark-300">Pagamento:</label>
                    <select
                      value={statusPagamento}
                      onChange={(e) => setStatusPagamento(e.target.value as any)}
                      className="w-full h-10 bg-dark-900 border border-dark-700 rounded-lg px-3 text-white text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-colors"
                    >
                      <option value="todas">A pagar e pagas</option>
                      <option value="apagar">A pagar</option>
                      <option value="pagas">Pagas</option>
                    </select>
                  </div>

                  {/* Filtro: Local */}
                  <div>
                    <label className="text-xs font-medium mb-1.5 block text-dark-300">Local:</label>
                    <select
                      value={localPagamento}
                      onChange={(e) => setLocalPagamento(e.target.value as any)}
                      className="w-full h-10 bg-dark-900 border border-dark-700 rounded-lg px-3 text-white text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-colors"
                    >
                      <option value="todos">(Todos)</option>
                      <option value="BANCO">BANCO</option>
                      <option value="CARTEIRA">CARTEIRA</option>
                      <option value="TRANSFERENCIA">TRANSFERENCIA</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-medium mb-1.5 block text-dark-300">Data Inicial:</label>
                    <div className="relative">
                      <Calendar size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400 pointer-events-none" />
                      <input
                        type="date"
                        value={dtIni}
                        onChange={(e) => setDtIni(e.target.value)}
                        className="w-full h-10 bg-dark-900 border border-dark-700 rounded-lg pl-9 pr-2.5 text-white text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-colors"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-xs font-medium mb-1.5 block text-dark-300">Data Final:</label>
                    <div className="relative">
                      <Calendar size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400 pointer-events-none" />
                      <input
                        type="date"
                        value={dtFim}
                        onChange={(e) => setDtFim(e.target.value)}
                        className="w-full h-10 bg-dark-900 border border-dark-700 rounded-lg pl-9 pr-2.5 text-white text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-colors"
                      />
                    </div>
                  </div>

                  <div>
                    <button
                      onClick={handleBuscarContasDatacar}
                      disabled={buscando || !empresaAtiva.datacar_token}
                      className="w-full h-10 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white rounded-lg text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer"
                    >
                      {buscando ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
                      <span>{buscando ? 'Buscando...' : 'Buscar'}</span>
                    </button>
                  </div>
                </div>

                {!empresaAtiva.datacar_token && (
                   <p className="text-amber-400 text-xs pt-1 flex items-center gap-1.5">
                     <span>⚠️ Credenciais do Datacar não configuradas para esta empresa. Configure na aba "Empresas".</span>
                   </p>
                )}
              </div>

              {/* Lista de Contas Pendentes */}
              <div className="flex items-center justify-between flex-wrap gap-3 mt-4">
                <h2 className="text-lg font-semibold text-white">Contas Pendentes de Envio</h2>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => setShowModalEnvio(true)}
                    disabled={enviandoCA}
                    className="h-10 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors shadow-sm"
                  >
                    {enviandoCA ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    {enviandoCA ? 'Enviando...' : 'Enviar ao Conta Azul'}
                  </button>
                  <button
                    onClick={() => handleBaixarXls()}
                    disabled={gerandoXls}
                    className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-all"
                  >
                    {gerandoXls ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
                    Exportar XLS para ContaAzul
                  </button>
                </div>
              </div>
              
              {/* Painel de Progresso do Envio Lote */}
              {statusProgresso && (
                <div className="bg-dark-800 border border-dark-700 rounded-xl p-4 space-y-3 mt-4 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Loader2 size={16} className={cn("text-brand-400", statusProgresso.emExecucao && "animate-spin")} />
                      <span className="text-white font-bold text-sm">
                        {statusProgresso.emExecucao ? 'Enviando lotes automáticos...' : 'Integração Concluída'}
                      </span>
                    </div>
                    <span className="text-xs text-dark-400">
                      {statusProgresso.total - statusProgresso.restantes} de {statusProgresso.total} contas processadas
                    </span>
                  </div>
                  
                  {/* Barra de Progresso */}
                  <div className="w-full bg-dark-900 rounded-full h-2.5 overflow-hidden">
                    <div 
                      className="bg-brand-500 h-2 rounded-full transition-all duration-500" 
                      style={{ width: `${Math.min(100, Math.round(((statusProgresso.total - statusProgresso.restantes) / statusProgresso.total) * 100))}%` }}
                    />
                  </div>

                  <div className="flex items-center gap-4 text-xs font-semibold">
                    <span className="text-green-400 flex items-center gap-1">
                      ✓ {statusProgresso.enviados} enviadas com sucesso
                    </span>
                    <span className="text-red-400 flex items-center gap-1">
                      ✗ {statusProgresso.erros} com falha
                    </span>
                    {statusProgresso.restantes > 0 && (
                      <span className="text-yellow-400 flex items-center gap-1 animate-pulse">
                        ⏳ {statusProgresso.restantes} aguardando
                      </span>
                    )}
                  </div>
                </div>
              )}

              <TabelaContas key={refreshContas} empresaId={empresaAtiva?.id} />
            </>
          )}
        </div>
      )}

      {/* SUB-ABA: PLANILHA */}
      {subAba === 'planilha' && (
        <div className="space-y-4 pt-2">
          {/* Stepper */}
          <div className="flex items-center gap-2">
            {(['upload', 'preview'] as Etapa[]).map((e, i) => {
              const labels = ['1. Upload da Planilha', '2. Revisão e Envio']
              const isActive = etapa === e
              const isDone = ['upload', 'preview'].indexOf(etapa) > i
              return (
                <div key={e} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEtapa(e)
                      if (e === 'upload') setResultado(null)
                    }}
                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                      isActive ? 'bg-brand-600 text-white shadow-sm' :
                      isDone ? 'bg-green-600/20 text-green-400 hover:bg-green-600/30' :
                      'bg-dark-800 text-dark-400 hover:text-white hover:bg-dark-700'
                    }`}
                  >
                    {isDone && <CheckCircle size={12} />}
                    {labels[i]}
                  </button>
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
          <ContasPreviewSection
            dadosIniciais={resultado.dados}
            empresaAtiva={empresaAtiva}
            onSalvar={handleSalvar}
            onBaixarXls={handleBaixarXlsPreview}
            salvando={salvando}
          />
        </div>
      )}

        </div>
      )}
    </div>
    </>
  )
}