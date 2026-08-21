'use client'

import { useState, useCallback, useEffect } from 'react'
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
  Upload, ArrowLeft, Loader2,
  CheckCircle, AlertCircle, FileDown, Send,
  X, ShieldCheck, ChevronDown, Database,
  Search, Calendar, FileText
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
  const [empresaSelecionada, setEmpresaSelecionada] = useState<Empresa | null>(empresaAtiva)
  const [abrirSeletor, setAbrirSeletor] = useState(false)
  const conectado = !!empresaSelecionada?.access_token_conta_azul

  // Verifica se o login ativo bate com o email cadastrado na empresa
  const emailEmpresa = empresaSelecionada?.email_login
  const loginDivergente = !!(
    emailEmpresa &&
    loginAtual &&
    emailEmpresa.toLowerCase().trim() !== loginAtual.toLowerCase().trim()
  )

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-dark-800 border border-dark-600 rounded-2xl w-full max-w-md shadow-2xl animate-fade-in">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-dark-700">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-500/10 rounded-xl flex items-center justify-center">
              <Send size={16} className="text-blue-400" />
            </div>
            <h3 className="text-white font-bold">Enviar ao Conta Azul</h3>
          </div>
          <button onClick={onCancelar} className="p-1.5 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700 transition-all">
            <X size={16} />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="p-5 space-y-4">
          <p className="text-dark-300 text-sm">Selecione a empresa de destino antes de enviar:</p>

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
              <div className="w-10 h-10 bg-brand-600/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <span className="text-brand-400 font-bold text-sm">
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

            {/* Dropdown de empresas */}
            {abrirSeletor && todasEmpresas.length > 1 && (
              <div className="absolute top-full mt-1 left-0 right-0 bg-dark-800 border border-dark-600 rounded-xl shadow-2xl z-10 overflow-hidden animate-fade-in">
                {todasEmpresas.map((emp) => {
                  const empConectada = !!emp.access_token_conta_azul
                  const isSelected = empresaSelecionada?.id === emp.id
                  return (
                    <button
                      key={emp.id}
                      onClick={() => { setEmpresaSelecionada(emp); setAbrirSeletor(false) }}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
                        isSelected ? 'bg-brand-600/10' : 'hover:bg-dark-700'
                      )}
                    >
                      <div className="w-8 h-8 bg-brand-600/20 rounded-lg flex items-center justify-center flex-shrink-0">
                        <span className="text-brand-400 font-bold text-xs">{emp.nome.charAt(0).toUpperCase()}</span>
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
                      {isSelected && <CheckCircle size={14} className="text-brand-400 flex-shrink-0" />}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* ⚠️ Aviso de login divergente — risco de enviar para empresa errada */}
          {conectado && loginDivergente && (
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle size={14} className="text-rose-400 flex-shrink-0 mt-0.5" />
                <p className="text-rose-300 text-xs font-semibold">Atenção: login divergente!</p>
              </div>
              <div className="pl-5 space-y-1">
                <p className="text-xs text-dark-300">
                  Você está logado como: <span className="text-white font-semibold">{loginAtual}</span>
                </p>
                <p className="text-xs text-dark-300">
                  Esta empresa usa: <span className="text-rose-300 font-semibold">{emailEmpresa}</span>
                </p>
              </div>
              <p className="text-xs text-rose-200/70 pl-5">
                O token do Conta Azul pode estar vinculado ao login errado. Recomendamos sair e entrar com <strong>{emailEmpresa}</strong> antes de enviar.
              </p>
            </div>
          )}

          {/* Aviso se não conectado */}
          {!conectado && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex items-start gap-2">
              <AlertCircle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-amber-300 text-xs">
                Esta empresa não está conectada ao Conta Azul. Clique no nome da empresa no topo da tela para conectar.
              </p>
            </div>
          )}

          {conectado && !loginDivergente && (
            <p className="text-dark-500 text-xs">
              Todas as contas <strong className="text-dark-300">pendentes</strong> desta empresa serão enviadas ao Conta Azul.
            </p>
          )}
        </div>

        {/* Ações */}
        <div className="p-5 border-t border-dark-700 flex gap-3">
          <button
            onClick={onCancelar}
            className="flex-1 bg-dark-700 hover:bg-dark-600 text-dark-300 hover:text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={() => empresaSelecionada && onConfirmar(empresaSelecionada.id)}
            disabled={!conectado || enviando || !empresaSelecionada}
            className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-900/20"
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
  const { empresaAtiva, empresas } = useEmpresa()
  const [etapa, setEtapa] = useState<Etapa>('upload')
  const [subAba, setSubAba] = useState<SubAba>('datacar')
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [gerandoXls, setGerandoXls] = useState(false)
  const [enviandoCA, setEnviandoCA] = useState(false)
  const [refreshContas, setRefreshContas] = useState(0)
  const [showModalEnvio, setShowModalEnvio] = useState(false)
  const [userEmail, setUserEmail] = useState('')

  // Estados Datacar
  const hoje = new Date().toISOString().split('T')[0]
  const primeiroDia = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
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
          const dataStr = dt.split('T')[0].split(' ')[0]
          if (dataStr.includes('/')) {
            const [dia, mes, ano] = dataStr.split('/')
            if (dia && mes && ano) return `${ano}-${mes}-${dia}`
          }
          return dataStr
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
          vencimento: d.vencimento || new Date().toISOString().split('T')[0],
          categoria: d.categoria || 'Materiais para Revenda',
          conta_financeira: d.conta_financeira || null,
          conta_financeira_id: d.conta_financeira_id || null,
          descricao: d.descricao || null,
          doc: d.doc || null,
          emissao: d.emissao || null,
          status: 'pendente',
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
        const fornecedorFinal = match && (match.confianca === 'exato' || match.confianca === 'alto' || match.confianca === 'medio')
          ? match.nomeCorrigido
          : c.fornecedor

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

  const executarEnvioContaAzul = async (empresaId: string) => {
    setEnviandoCA(true)
    try {
      const res = await fetch('/api/conta-azul/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresa_id: empresaId, limite: 50 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao enviar')
      if (data.enviados > 0) toast.success(`${data.enviados} contas enviadas com sucesso!`, { duration: 5000 })
      if (data.erros > 0) toast.error(`${data.erros} contas com erro. Verifique o status na tabela.`, { duration: 5000 })
      if (data.enviados === 0 && data.erros === 0) toast('Nenhuma conta pendente para enviar.', { icon: 'ℹ️' })
      if (data.pendentes_restantes > 0) toast(`Ainda restam ${data.pendentes_restantes} pendentes. Clique novamente para enviar mais.`, { icon: '📋', duration: 5000 })
    } catch (err: any) {
      toast.error(err.message || 'Erro ao enviar para o Conta Azul')
    } finally {
      setEnviandoCA(false)
      setShowModalEnvio(false)
      setRefreshContas(prev => prev + 1)
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
        onConfirmar={executarEnvioContaAzul}
        onCancelar={() => setShowModalEnvio(false)}
        enviando={enviandoCA}
      />
    )}

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
        </div>
        <div className="flex items-center gap-4">
          <SelectorEmpresa />
          {subAba === 'planilha' && etapa !== 'upload' && (
            <button
              onClick={() => { setEtapa('upload'); setResultado(null) }}
              className="flex items-center gap-2 text-dark-400 hover:text-white text-sm px-3 py-2 rounded-lg hover:bg-dark-800 transition-all"
            >
              <ArrowLeft size={16} /> Voltar
            </button>
          )}
          {subAba === 'datacar' && contasPreviewDados && (
            <button
              onClick={() => { setContasPreviewDados(null) }}
              className="flex items-center gap-2 text-dark-400 hover:text-white text-sm px-3 py-2 rounded-lg hover:bg-dark-800 transition-all"
            >
              <ArrowLeft size={16} /> Voltar à Busca
            </button>
          )}
        </div>
      </div>

      {/* Sub-abas: Datacar | Planilha */}
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
          Importadas do Datacar
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

              {/* Formulário de Busca do Datacar */}
              <div className="bg-dark-800 border border-dark-700 rounded-xl p-5 animate-fade-in">
                <div className="flex items-center gap-2 mb-4 text-white font-semibold">
                  <Database size={18} className="text-blue-400" />
                  <h3>Buscar Contas do Datacar</h3>
                </div>
                <div className="flex items-end gap-4 flex-wrap">
                  <div>
                    <label className="text-xs font-medium mb-1 flex items-center gap-2 text-dark-400">
                      Por:
                    </label>
                    <select
                      id="tipoPeriodoContas"
                      value={tipoPeriodoContas}
                      onChange={(e) => setTipoPeriodoContas(e.target.value as any)}
                      className="bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-blue-500/50 outline-none"
                    >
                      <option value="venc">Vencimento</option>
                      <option value="emis">Emissão</option>
                      <option value="pgto">Pagamento</option>
                      <option value="digit">Digitação no Sistema</option>
                    </select>
                  </div>

                  {/* Filtro: Pagamento */}
                  <div>
                    <label className="text-xs font-medium mb-1 block text-dark-400">Pagamento:</label>
                    <select
                      value={statusPagamento}
                      onChange={(e) => setStatusPagamento(e.target.value as any)}
                      className="bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-blue-500/50 outline-none"
                    >
                      <option value="todas">A pagar e pagas</option>
                      <option value="apagar">A pagar</option>
                      <option value="pagas">Pagas</option>
                    </select>
                  </div>

                  {/* Filtro: Local */}
                  <div>
                    <label className="text-xs font-medium mb-1 block text-dark-400">Local:</label>
                    <select
                      value={localPagamento}
                      onChange={(e) => setLocalPagamento(e.target.value as any)}
                      className="bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-blue-500/50 outline-none"
                    >
                      <option value="todos">(Todos)</option>
                      <option value="BANCO">BANCO</option>
                      <option value="CARTEIRA">CARTEIRA</option>
                      <option value="TRANSFERENCIA">TRANSFERENCIA</option>
                    </select>
                  </div>

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

                  <button
                    onClick={handleBuscarContasDatacar}
                    disabled={buscando || !empresaAtiva.datacar_token}
                    className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all ml-auto sm:ml-0"
                  >
                    {buscando ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                    {buscando ? 'Buscando...' : 'Buscar'}
                  </button>
                </div>
                {!empresaAtiva.datacar_token && (
                   <p className="text-amber-400 text-xs mt-3">
                     ⚠️ Credenciais do Datacar não configuradas para esta empresa. Configure em "Empresas".
                   </p>
                )}
              </div>

              {/* Lista de Contas Pendentes */}
              <div className="flex items-center justify-between flex-wrap gap-3 mt-4">
                <h2 className="text-lg font-semibold text-white">Contas Pendentes de Envio</h2>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={async () => {
                      if (!empresaAtiva) { toast.error('Selecione uma empresa'); return }
                      if (!empresaAtiva.access_token_conta_azul) {
                        toast.error('Empresa não está conectada ao Conta Azul. Vá em Empresas e conecte primeiro.')
                        return
                      }
                      if (!confirm('Enviar todas as contas PENDENTES para o Conta Azul?')) return
                      setEnviandoCA(true)
                      try {
                        const res = await fetch('/api/conta-azul/enviar', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ empresa_id: empresaAtiva.id, limite: 50 }),
                        })
                        const data = await res.json()
                        if (!res.ok) throw new Error(data.error || 'Erro ao enviar')
                        if (data.enviados > 0) {
                          toast.success(`${data.enviados} contas enviadas com sucesso!`, { duration: 5000 })
                        }
                        if (data.erros > 0) {
                          toast.error(`${data.erros} contas com erro. Verifique o status na tabela.`, { duration: 5000 })
                        }
                        if (data.enviados === 0 && data.erros === 0) {
                          toast('Nenhuma conta pendente para enviar.', { icon: 'ℹ️' })
                        }
                        if (data.pendentes_restantes > 0) {
                          toast(`Ainda restam ${data.pendentes_restantes} pendentes. Clique novamente para enviar mais.`, { icon: '📋', duration: 5000 })
                        }
                      } catch (err: any) {
                        toast.error(err.message || 'Erro ao enviar para o Conta Azul')
                      } finally {
                        setEnviandoCA(false)
                        setRefreshContas(prev => prev + 1)
                      }
                    }}
                    disabled={enviandoCA}
                    className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all shadow-lg shadow-blue-900/20"
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