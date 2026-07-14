'use client'

import { useEmpresa } from '@/contexts/EmpresaContext'
import { createClient } from '@/lib/supabase/client'
import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Building2, Plus, Check, Loader2, ExternalLink, Edit,
  RefreshCw, Unlink, Upload, Users, ChevronDown, ChevronUp, Trash2, ShieldCheck, Mail, Search
} from 'lucide-react'
import toast from 'react-hot-toast'
import { formatCNPJ } from '@/lib/utils'
import { parseFornecedoresArquivo } from '@/lib/parsers/fornecedores-contaazul'
import { buscarCnpj, type BrasilApiCnpjResponse } from '@/services/brasil-api/client'
import type { Empresa } from '@/types'

// --- Painel de fornecedores por empresa ---
function PainelFornecedores({ empresa }: { empresa: Empresa }) {
  const [aberto, setAberto] = useState(false)
  const [total, setTotal] = useState<number | null>(null)
  const [importando, setImportando] = useState(false)
  const [sincronizando, setSincronizando] = useState(false)
  const [limpando, setLimpando] = useState(false)
  const supabase = createClient()

  const carregarTotal = useCallback(async () => {
    const { count } = await supabase
      .from('fornecedores_contaazul')
      .select('*', { count: 'exact', head: true })
      .eq('empresa_id', empresa.id)
    setTotal(count ?? 0)
  }, [empresa.id, supabase])

  useEffect(() => { carregarTotal() }, [carregarTotal])

  const handleImportar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportando(true)
    try {
      const fornecedores = await parseFornecedoresArquivo(file)
      if (fornecedores.length === 0) {
        toast.error('Nenhum fornecedor encontrado no arquivo')
        return
      }

      await supabase.from('fornecedores_contaazul').delete().eq('empresa_id', empresa.id)

      const registros = fornecedores.map((f) => ({
        empresa_id: empresa.id,
        nome: f.nome,
        cnpj: f.cnpj || null,
        categoria_padrao: f.categoria || null,
        nome_normalizado: f.nomeNormalizado,
      }))

      for (let i = 0; i < registros.length; i += 500) {
        const lote = registros.slice(i, i + 500)
        const { error } = await supabase.from('fornecedores_contaazul').insert(lote)
        if (error) throw error
      }

      toast.success(`${fornecedores.length} fornecedores importados com sucesso!`)
      await carregarTotal()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao importar fornecedores')
    } finally {
      setImportando(false)
      e.target.value = ''
    }
  }

  const handleLimpar = async () => {
    if (!confirm('Remover todos os fornecedores desta empresa?')) return
    setLimpando(true)
    try {
      await supabase.from('fornecedores_contaazul').delete().eq('empresa_id', empresa.id)
      setTotal(0)
      toast.success('Lista de fornecedores removida.')
    } catch {
      toast.error('Erro ao remover fornecedores')
    } finally {
      setLimpando(false)
    }
  }

  return (
    <div className="border-t border-dark-700 mt-3 pt-3">
      <button
        onClick={() => setAberto(!aberto)}
        className="flex items-center gap-2 text-sm text-dark-400 hover:text-white transition-colors w-full"
      >
        <Users size={14} />
        <span>Fornecedores ContaAzul</span>
        {total !== null && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            total > 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-dark-700 text-dark-500'
          }`}>
            {total} cadastrados
          </span>
        )}
        {aberto ? <ChevronUp size={14} className="ml-auto" /> : <ChevronDown size={14} className="ml-auto" />}
      </button>

      {aberto && (
        <div className="mt-3 space-y-2 animate-fade-in">
          <p className="text-xs text-dark-500">
            Sincronize os fornecedores diretamente do Conta Azul para que o app corrija
            automaticamente os nomes ao importar planilhas do Datacar.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={async () => {
                if (!empresa.access_token_conta_azul) {
                  toast.error('Empresa não conectada ao Conta Azul.')
                  return
                }
                setSincronizando(true)
                try {
                  const res = await fetch('/api/conta-azul/fornecedores/sincronizar', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ empresa_id: empresa.id })
                  })
                  const data = await res.json()
                  if (!res.ok) throw new Error(data.error || 'Erro ao sincronizar fornecedores')
                  toast.success(data.message || `${data.count} fornecedores sincronizados com sucesso!`)
                  await carregarTotal()
                } catch (err: any) {
                  toast.error(err.message)
                } finally {
                  setSincronizando(false)
                }
              }}
              disabled={sincronizando || importando || !empresa.access_token_conta_azul}
              className={`flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-lg cursor-pointer transition-all
                ${sincronizando || importando || !empresa.access_token_conta_azul
                  ? 'bg-dark-700 text-dark-500 cursor-not-allowed'
                  : 'bg-brand-600 hover:bg-brand-500 text-white'
                }`}
            >
              {sincronizando ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              {sincronizando ? 'Sincronizando...' : 'Sincronizar Conta Azul'}
            </button>

            <label className={`flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-lg cursor-pointer transition-all
              ${importando || sincronizando
                ? 'bg-dark-700 text-dark-500 cursor-not-allowed'
                : 'bg-emerald-700 hover:bg-emerald-600 text-white'
              }`}>
              {importando
                ? <Loader2 size={13} className="animate-spin" />
                : <Upload size={13} />
              }
              {importando ? 'Importando...' : 'Importar CSV ContaAzul'}
              <input
                type="file"
                accept=".csv"
                className="hidden"
                disabled={importando}
                onChange={handleImportar}
              />
            </label>

            {total !== null && total > 0 && (
              <button
                onClick={handleLimpar}
                disabled={limpando}
                className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 px-3 py-2 rounded-lg hover:bg-red-500/10 transition-all"
              >
                {limpando ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                Limpar lista
              </button>
            )}
          </div>
          {total !== null && total > 0 && (
            <p className="text-xs text-emerald-400">
              Lista atualizada — {total} fornecedores prontos para match automático.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// --- Página principal ---
function EmpresasPageContent() {
  const { empresas, recarregar, setEmpresaAtiva, empresaAtiva } = useEmpresa()
  const [showForm, setShowForm] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [conectando, setConectando] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [buscandoCnpj, setBuscandoCnpj] = useState(false)
  const [dadosCnpj, setDadosCnpj] = useState<BrasilApiCnpjResponse | null>(null)
  const [form, setForm] = useState<{
    nome: string, 
    cnpj: string, 
    email_login: string, 
    tipo_empresa: 'vendas' | 'financeiro' | 'ambos',
    datacar_token: string,
    datacar_cod_emp: string,
    datacar_id_operador: string,
    razao_social: string,
    nome_fantasia: string
  }>({ 
    nome: '', 
    cnpj: '', 
    email_login: '', 
    tipo_empresa: 'ambos',
    datacar_token: '',
    datacar_cod_emp: '',
    datacar_id_operador: '',
    razao_social: '',
    nome_fantasia: ''
  })
  const supabase = createClient()
  const searchParams = useSearchParams()

  useEffect(() => {
    const sucesso = searchParams.get('sucesso')
    const erro = searchParams.get('erro')
    const isNew = searchParams.get('new')

    if (isNew === 'true') {
      setShowForm(true)
    }

    if (sucesso === 'conta_azul_conectado') {
      toast.success('Conta Azul conectado com sucesso!')
      recarregar()
      window.history.replaceState({}, '', '/empresas')
    } else if (erro) {
      const msgs: Record<string, string> = {
        autorizacao_negada: 'Autorização negada no Conta Azul.',
        parametros_invalidos: 'Parâmetros inválidos no retorno.',
      }
      toast.error(msgs[erro] || `Erro: ${decodeURIComponent(erro)}`)
      window.history.replaceState({}, '', '/empresas')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleConectarContaAzul = (empresaId: string) => {
    setConectando(empresaId)
    window.location.href = `/api/conta-azul/autorizar?empresa_id=${empresaId}`
  }

  const handleDesconectar = async (empresaId: string) => {
    if (!confirm('Tem certeza que deseja desconectar o Conta Azul desta empresa?')) return
    try {
      const { error } = await supabase
        .from('empresas')
        .update({
          access_token_conta_azul: null,
          refresh_token_conta_azul: null,
          data_expiracao_token: null,
          conta_azul_connected: false,
        })
        .eq('id', empresaId)
      if (error) throw error
      toast.success('Conta Azul desconectado.')
      await recarregar()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao desconectar')
    }
  }

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault()
    setSalvando(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Usuário não autenticado')

      const cnpjLimpo = form.cnpj.replace(/\D/g, '')
      const razaoSocialFinal = form.razao_social.trim() || null
      const nomeFantasiaFinal = form.nome_fantasia.trim() || null

      if (editingId) {
        // Atualiza a empresa existente
        const { error: errEmp } = await supabase
          .from('empresas')
          .update({
            nome: form.nome.trim(),
            cnpj: cnpjLimpo,
            email_login: form.email_login.trim() || null,
            tipo_empresa: form.tipo_empresa,
            datacar_token: form.datacar_token.trim() || null,
            datacar_cod_emp: form.datacar_cod_emp.trim() || null,
            datacar_id_operador: form.datacar_id_operador.trim() || null,
            razao_social: razaoSocialFinal,
            nome_fantasia: nomeFantasiaFinal,
          })
          .eq('id', editingId)

        if (errEmp) throw errEmp
        toast.success('Empresa atualizada com sucesso!')
      } else {
        // Cria uma nova empresa
        const empresaId = crypto.randomUUID()

        const { error: errEmp } = await supabase
          .from('empresas')
          .insert({
            id: empresaId,
            nome: form.nome.trim(),
            cnpj: cnpjLimpo,
            created_by: user.id,
            email_login: form.email_login.trim() || null,
            tipo_empresa: form.tipo_empresa,
            datacar_token: form.datacar_token.trim() || null,
            datacar_cod_emp: form.datacar_cod_emp.trim() || null,
            datacar_id_operador: form.datacar_id_operador.trim() || null,
            razao_social: razaoSocialFinal,
            nome_fantasia: nomeFantasiaFinal,
          })

        if (errEmp) throw errEmp

        const { error: errVinc } = await supabase
          .from('usuarios_empresas')
          .insert({
            user_id: user.id,
            empresa_id: empresaId,
            papel: 'admin'
          })

        if (errVinc) throw errVinc
        toast.success('Empresa criada com sucesso!')
      }

      setForm({ nome: '', cnpj: '', email_login: '', tipo_empresa: 'ambos', datacar_token: '', datacar_cod_emp: '', datacar_id_operador: '', razao_social: '', nome_fantasia: '' })
      setDadosCnpj(null)
      setEditingId(null)
      setShowForm(false)
      await recarregar()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar empresa'
      toast.error(msg)
    } finally {
      setSalvando(false)
    }
  }

  const handleBuscarCnpj = async () => {
    const cnpjLimpo = form.cnpj.replace(/\D/g, '')
    if (cnpjLimpo.length !== 14) {
      toast.error('CNPJ inválido. Digite os 14 dígitos.')
      return
    }
    setBuscandoCnpj(true)
    try {
      const dados = await buscarCnpj(cnpjLimpo)
      if (!dados) {
        toast.error('CNPJ não encontrado na base da Receita Federal.')
        setDadosCnpj(null)
        return
      }
      setDadosCnpj(dados)
      setForm(prev => ({
        ...prev,
        razao_social: dados.razao_social || '',
        nome_fantasia: dados.nome_fantasia || '',
      }))
      toast.success('Dados da empresa encontrados!')
    } catch {
      toast.error('Erro ao consultar Brasil API. Tente novamente.')
    } finally {
      setBuscandoCnpj(false)
    }
  }

  const handleEditClick = (empresa: Empresa) => {
    setEditingId(empresa.id)
    setForm({
      nome: empresa.nome,
      cnpj: empresa.cnpj,
      email_login: empresa.email_login || '',
      tipo_empresa: empresa.tipo_empresa || 'ambos',
      datacar_token: empresa.datacar_token || '',
      datacar_cod_emp: empresa.datacar_cod_emp || '',
      datacar_id_operador: empresa.datacar_id_operador || '',
      razao_social: empresa.razao_social || '',
      nome_fantasia: empresa.nome_fantasia || '',
    })
    setDadosCnpj(null)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Empresas</h1>
          <p className="text-dark-400 text-sm mt-1">Gerencie as empresas do seu BPO</p>
        </div>
        <button
          onClick={() => {
            setEditingId(null)
            setForm({ nome: '', cnpj: '', email_login: '', tipo_empresa: 'ambos', datacar_token: '', datacar_cod_emp: '', datacar_id_operador: '', razao_social: '', nome_fantasia: '' })
            setDadosCnpj(null)
            setShowForm(!showForm)
          }}
          className="bg-brand-600 hover:bg-brand-500 text-white px-4 py-2.5 rounded-lg font-semibold flex items-center gap-2 transition-all text-sm"
        >
          <Plus size={16} /> Nova Empresa
        </button>
      </div>

      {showForm && (
        <div className="bg-dark-800/60 backdrop-blur-md border border-brand-500/20 shadow-[0_8px_32px_rgba(var(--brand-500),0.15)] rounded-2xl p-6 sm:p-8 animate-fade-in relative overflow-hidden">
          {/* Decorative background elements */}
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

          {editingId && (
            <button
              onClick={() => {
                setEditingId(null)
                setForm({ nome: '', cnpj: '', email_login: '', tipo_empresa: 'ambos', datacar_token: '', datacar_cod_emp: '', datacar_id_operador: '', razao_social: '', nome_fantasia: '' })
                setDadosCnpj(null)
                setShowForm(false)
              }}
              className="absolute top-4 right-4 sm:top-6 sm:right-6 text-dark-400 hover:text-white transition-colors bg-dark-900/50 p-2 rounded-full hover:bg-dark-900 z-10"
            >
              ✕
            </button>
          )}

          <div className="mb-8 relative z-10">
            <h3 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-white to-dark-300 bg-clip-text text-transparent">
              {editingId ? 'Editar Empresa' : 'Nova Empresa'}
            </h3>
            <p className="text-dark-400 text-xs sm:text-sm mt-1">Preencha os dados abaixo para configurar uma nova integração.</p>
          </div>

          <form onSubmit={handleSalvar} className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8">
            
            {/* COLUNA ESQUERDA: Identidade (7 colunas em lg) */}
            <div className="lg:col-span-7 space-y-6">
              {/* O PROTAGONISTA: CNPJ */}
              <div className="bg-dark-900/40 p-1.5 rounded-xl border border-dark-700/50 shadow-inner focus-within:border-brand-500/50 focus-within:bg-dark-900/60 transition-all group">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center">
                  <div className="hidden sm:block pl-4 pr-2 text-brand-500">
                    <Search size={20} className={buscandoCnpj ? 'animate-pulse' : ''} />
                  </div>
                  <input
                    value={form.cnpj}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, '').slice(0, 14)
                      const masked = raw
                        .replace(/^(\d{2})(\d)/, '$1.$2')
                        .replace(/^(\d{2}\.\d{3})(\d)/, '$1.$2')
                        .replace(/^(\d{2}\.\d{3}\.\d{3})(\d)/, '$1/$2')
                        .replace(/^(\d{2}\.\d{3}\.\d{3}\/\d{4})(\d)/, '$1-$2')
                      setForm({ ...form, cnpj: masked })
                    }}
                    placeholder="CNPJ (00.000.000/0000-00)"
                    required
                    className="flex-1 bg-transparent border-none px-4 py-3 sm:px-2 sm:text-lg text-white focus:ring-0 outline-none font-mono placeholder:text-dark-600"
                  />
                  <button
                    type="button"
                    onClick={handleBuscarCnpj}
                    disabled={buscandoCnpj || form.cnpj.replace(/\D/g, '').length < 14}
                    className={`mt-2 sm:mt-0 sm:mr-1.5 px-6 py-3 sm:py-2.5 rounded-lg font-bold text-sm transition-all whitespace-nowrap flex items-center justify-center gap-2 ${
                      buscandoCnpj || form.cnpj.replace(/\D/g, '').length < 14
                        ? 'bg-dark-800 text-dark-500 cursor-not-allowed'
                        : 'bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white shadow-[0_0_15px_rgba(245,158,11,0.3)]'
                    }`}
                  >
                    {buscandoCnpj ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} className="sm:hidden" />}
                    {buscandoCnpj ? 'Buscando...' : 'Buscar Dados'}
                  </button>
                </div>
              </div>

              {/* PAINEL DE RESULTADO GLASSMORPHISM */}
              {(dadosCnpj || form.razao_social) && (
                <div className="bg-gradient-to-br from-emerald-500/10 to-transparent border border-emerald-500/20 backdrop-blur-xl rounded-xl p-5 animate-fade-in shadow-[0_8px_32px_rgba(16,185,129,0.05)]">
                  <div className="flex items-center gap-3 mb-4 border-b border-emerald-500/10 pb-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                      <Building2 size={16} className="text-emerald-400" />
                    </div>
                    <div>
                      <span className="text-sm font-bold text-emerald-400 block">Identidade Oficial</span>
                      <span className="text-[10px] text-emerald-500/70 uppercase tracking-wider">Brasil API</span>
                    </div>
                    {dadosCnpj && (
                      <span className={`text-[10px] uppercase font-bold px-3 py-1 rounded-full ml-auto border hidden sm:block ${
                        dadosCnpj.descricao_situacao_cadastral === 'ATIVA'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-red-500/10 text-red-400 border-red-500/20'
                      }`}>
                        {dadosCnpj.descricao_situacao_cadastral}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6">
                    <div>
                      <label className="text-[10px] text-emerald-400/60 uppercase tracking-widest font-semibold block mb-1">Razão Social</label>
                      <p className="text-white text-sm font-medium">{form.razao_social || '—'}</p>
                    </div>
                    <div>
                      <label className="text-[10px] text-emerald-400/60 uppercase tracking-widest font-semibold block mb-1">Nome Fantasia</label>
                      <p className="text-white text-sm font-medium">{form.nome_fantasia || '—'}</p>
                    </div>
                    {dadosCnpj && (
                      <>
                        <div className="sm:col-span-2">
                          <label className="text-[10px] text-emerald-400/60 uppercase tracking-widest font-semibold block mb-1">CNAE Principal</label>
                          <p className="text-dark-200 text-xs">{dadosCnpj.cnae_fiscal} — {dadosCnpj.cnae_fiscal_descricao}</p>
                        </div>
                        <div className="sm:col-span-2">
                          <label className="text-[10px] text-emerald-400/60 uppercase tracking-widest font-semibold block mb-1">Endereço</label>
                          <p className="text-dark-200 text-xs">
                            {[dadosCnpj.descricao_tipo_de_logradouro, dadosCnpj.logradouro, dadosCnpj.numero].filter(Boolean).join(' ')}
                            {dadosCnpj.complemento ? `, ${dadosCnpj.complemento}` : ''}
                            {' — '}{dadosCnpj.bairro} — {dadosCnpj.municipio}/{dadosCnpj.uf} — CEP {dadosCnpj.cep}
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* NOME POPULAR & TIPO */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="text-xs text-dark-300 font-medium ml-1">Nome Popular (Como você chama)</label>
                  <input
                    value={form.nome}
                    onChange={(e) => setForm({ ...form, nome: e.target.value })}
                    placeholder="Ex: Auto Peças Silva"
                    required
                    className="w-full bg-dark-900/50 border border-dark-700/50 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 outline-none transition-all placeholder:text-dark-600 shadow-inner"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-dark-300 font-medium ml-1">Tipo de Integração</label>
                  <select
                    value={form.tipo_empresa}
                    onChange={(e) => setForm({ ...form, tipo_empresa: e.target.value as any })}
                    className="w-full bg-dark-900/50 border border-dark-700/50 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 outline-none transition-all appearance-none shadow-inner"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 1rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em', paddingRight: '2.5rem' }}
                  >
                    <option value="ambos">Ambos (Vendas e Financeiro)</option>
                    <option value="financeiro">Apenas Financeiro</option>
                    <option value="vendas">Apenas Vendas</option>
                  </select>
                </div>
              </div>
            </div>

            {/* COLUNA DIREITA: Integrações (5 colunas em lg) */}
            <div className="lg:col-span-5 space-y-6 bg-dark-900/30 p-5 sm:p-6 rounded-2xl border border-dark-700/30 flex flex-col">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <ShieldCheck size={16} className="text-brand-400" />
                Configurações de Acesso
              </h4>

              {/* CONTA AZUL */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-blue-500/10 flex items-center justify-center">
                    <Mail size={12} className="text-blue-400" />
                  </div>
                  <label className="text-xs font-semibold text-dark-200">Conta Azul</label>
                </div>
                <input
                  value={form.email_login}
                  onChange={(e) => setForm({ ...form, email_login: e.target.value })}
                  placeholder="E-mail de login (opcional)"
                  type="email"
                  className="w-full bg-dark-900/80 border border-dark-700/50 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all placeholder:text-dark-600 shadow-inner"
                />
              </div>
              
              <div className="h-px w-full bg-gradient-to-r from-transparent via-dark-700/50 to-transparent my-1" />

              {/* DATACAR */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-orange-500/10 flex items-center justify-center">
                    <Unlink size={12} className="text-orange-400" />
                  </div>
                  <label className="text-xs font-semibold text-dark-200">API Datacar (Opcional)</label>
                </div>
                <div className="space-y-3">
                  <input
                    value={form.datacar_token}
                    onChange={(e) => setForm({ ...form, datacar_token: e.target.value })}
                    placeholder="Token de Acesso"
                    className="w-full bg-dark-900/80 border border-dark-700/50 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 outline-none transition-all placeholder:text-dark-600 shadow-inner"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      value={form.datacar_cod_emp}
                      onChange={(e) => setForm({ ...form, datacar_cod_emp: e.target.value })}
                      placeholder="Cód. Empresa"
                      className="w-full bg-dark-900/80 border border-dark-700/50 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 outline-none transition-all placeholder:text-dark-600 shadow-inner"
                    />
                    <input
                      value={form.datacar_id_operador}
                      onChange={(e) => setForm({ ...form, datacar_id_operador: e.target.value })}
                      placeholder="ID Operador"
                      className="w-full bg-dark-900/80 border border-dark-700/50 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 outline-none transition-all placeholder:text-dark-600 shadow-inner"
                    />
                  </div>
                </div>
              </div>

              {/* BOTÃO SALVAR (empurrado para o fundo com mt-auto se necessário, mas aqui deixamos margin normal) */}
              <div className="pt-6 mt-auto border-t border-dark-700/30">
                <button
                  type="submit"
                  disabled={salvando}
                  className="w-full bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 disabled:opacity-50 text-white px-6 py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(var(--brand-500),0.2)] hover:shadow-[0_0_25px_rgba(var(--brand-500),0.4)]"
                >
                  {salvando ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                  {salvando ? 'Salvando configuração...' : 'Salvar Empresa'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {empresas.map((empresa) => (
          <div
            key={empresa.id}
            className={`bg-dark-800 border rounded-xl p-6 transition-all ${
              empresaAtiva?.id === empresa.id ? 'border-brand-600 shadow-lg shadow-brand-900/20' : 'border-dark-700'
            }`}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-dark-700 rounded-xl flex items-center justify-center">
                  <Building2 size={24} className="text-dark-400" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-lg flex items-center gap-2">
                    {empresa.nome}
                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                      empresa.tipo_empresa === 'vendas' ? 'bg-blue-500/20 text-blue-400' :
                      empresa.tipo_empresa === 'financeiro' ? 'bg-emerald-500/20 text-emerald-400' :
                      'bg-purple-500/20 text-purple-400'
                    }`}>
                      {empresa.tipo_empresa === 'ambos' ? 'VENDAS & FINANÇAS' : empresa.tipo_empresa}
                    </span>
                  </h3>
                  {empresa.razao_social && (
                    <p className="text-dark-300 text-xs mt-0.5">{empresa.razao_social}</p>
                  )}
                  <p className="text-dark-400 text-sm">{formatCNPJ(empresa.cnpj)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleEditClick(empresa)}
                  className="p-1.5 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700 transition-all"
                  title="Editar empresa"
                >
                  <Edit size={16} />
                </button>
                <button
                  onClick={() => setEmpresaAtiva(empresa)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    empresaAtiva?.id === empresa.id
                      ? 'bg-brand-600 text-white'
                      : 'bg-dark-700 text-dark-400 hover:bg-dark-600'
                  }`}
                >
                  {empresaAtiva?.id === empresa.id ? 'Ativa' : 'Selecionar'}
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {empresa.email_login ? (
                <div className="flex items-center gap-2 px-3 py-2 bg-dark-900/60 rounded-lg border border-dark-700">
                  <Mail size={13} className="text-brand-400 flex-shrink-0" />
                  <span className="text-xs text-dark-400">Login Conta Azul:</span>
                  <span className="text-xs text-white font-medium truncate">{empresa.email_login}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-2 bg-dark-900/40 rounded-lg border border-dashed border-dark-700">
                  <Mail size={13} className="text-dark-600 flex-shrink-0" />
                  <span className="text-xs text-dark-600">E-mail de login não informado</span>
                </div>
              )}

              <div className="flex items-center justify-between p-3 bg-dark-900 rounded-lg border border-dark-700">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${empresa.access_token_conta_azul ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span className="text-sm text-dark-300">Conta Azul</span>
                </div>
                <div className="flex items-center gap-2">
                  {empresa.access_token_conta_azul ? (
                    <>
                      <a
                        href={`/api/conta-azul/diagnostico?empresa_id=${empresa.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-yellow-500 hover:text-yellow-400 transition-colors"
                        title="Diagnosticar Conexão"
                      >
                        <ShieldCheck size={16} />
                      </a>
                      <button
                        onClick={() => handleConectarContaAzul(empresa.id)}
                        className="text-dark-400 hover:text-white transition-colors"
                        title="Renovar conexão"
                      >
                        <RefreshCw size={16} />
                      </button>
                      <button
                        onClick={() => handleDesconectar(empresa.id)}
                        className="text-red-400 hover:text-red-300 transition-colors"
                        title="Desconectar"
                      >
                        <Unlink size={16} />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleConectarContaAzul(empresa.id)}
                      disabled={conectando === empresa.id}
                      className="text-brand-400 hover:text-brand-300 text-sm font-semibold flex items-center gap-1 transition-all"
                    >
                      {conectando === empresa.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <ExternalLink size={14} />
                      )}
                      Conectar
                    </button>
                  )}
                </div>
              </div>

              <PainelFornecedores empresa={empresa} />
            </div>
          </div>
        ))}

        {empresas.length === 0 && !showForm && (
          <div className="lg:col-span-2 py-20 flex flex-col items-center justify-center border-2 border-dashed border-dark-700 rounded-2xl">
            <Building2 size={48} className="text-dark-700 mb-4" />
            <p className="text-dark-400">Nenhuma empresa cadastrada.</p>
            <button
              onClick={() => setShowForm(true)}
              className="text-brand-400 font-semibold mt-2 hover:text-brand-300 transition-colors"
            >
              Cadastrar agora
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function EmpresasPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-brand-600" size={32} />
      </div>
    }>
      <EmpresasPageContent />
    </Suspense>
  )
}
