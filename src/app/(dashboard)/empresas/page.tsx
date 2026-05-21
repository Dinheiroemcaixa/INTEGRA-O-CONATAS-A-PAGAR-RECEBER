'use client'

import { useEmpresa } from '@/contexts/EmpresaContext'
import { createClient } from '@/lib/supabase/client'
import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Building2, Plus, Check, Loader2, ExternalLink,
  RefreshCw, Unlink, Upload, Users, ChevronDown, ChevronUp, Trash2, ShieldCheck, Mail
} from 'lucide-react'
import toast from 'react-hot-toast'
import { formatCNPJ } from '@/lib/utils'
import { parseFornecedoresArquivo } from '@/lib/parsers/fornecedores-contaazul'
import type { Empresa } from '@/types'

// --- Painel de fornecedores por empresa ---
function PainelFornecedores({ empresa }: { empresa: Empresa }) {
  const [aberto, setAberto] = useState(false)
  const [total, setTotal] = useState<number | null>(null)
  const [importando, setImportando] = useState(false)
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

      // Apagar lista anterior desta empresa e inserir nova
      await supabase.from('fornecedores_contaazul').delete().eq('empresa_id', empresa.id)

      const registros = fornecedores.map((f) => ({
        empresa_id: empresa.id,
        nome: f.nome,
        cnpj: f.cnpj || null,
        categoria_padrao: f.categoria || null,
        nome_normalizado: f.nomeNormalizado,
      }))

      // Inserir em lotes de 500
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
            Importe o CSV de fornecedores exportado do ContaAzul para que o app corrija
            automaticamente os nomes ao importar planilhas do Datacar.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <label className={`flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-lg cursor-pointer transition-all
              ${importando
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
  const [form, setForm] = useState({ nome: '', cnpj: '', email_login: '' })
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

  const handleCriar = async (e: React.FormEvent) => {
    e.preventDefault()
    setSalvando(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Usuário não autenticado')

      const cnpjLimpo = form.cnpj.replace(/\D/g, '')
      const empresaId = crypto.randomUUID()

      const { error: errEmp } = await supabase
        .from('empresas')
        .insert({
          id: empresaId,
          nome: form.nome.trim(),
          cnpj: cnpjLimpo,
          email_login: form.email_login.trim() || null,
          created_by: user.id
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
      setForm({ nome: '', cnpj: '', email_login: '' })
      setShowForm(false)
      await recarregar()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao criar empresa'
      toast.error(msg)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Empresas</h1>
          <p className="text-dark-400 text-sm mt-1">Gerencie as empresas do seu BPO</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-brand-600 hover:bg-brand-500 text-white px-4 py-2.5 rounded-lg
                     font-semibold flex items-center gap-2 transition-all text-sm"
        >
          <Plus size={16} /> Nova Empresa
        </button>
      </div>

      {showForm && (
        <div className="bg-dark-800 border border-dark-600 rounded-xl p-6 animate-fade-in">
          <h3 className="text-white font-semibold mb-1">Cadastrar nova empresa</h3>
          <p className="text-dark-500 text-xs mb-4">O e-mail de login é opcional, mas recomendado para evitar envios para a empresa errada.</p>
          <form onSubmit={handleCriar} className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Nome da Empresa"
                required
                className="flex-1 bg-dark-900 border border-dark-600 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-brand-500 outline-none"
              />
              <input
                value={form.cnpj}
                onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
                placeholder="CNPJ"
                required
                className="w-full sm:w-48 bg-dark-900 border border-dark-600 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-brand-500 outline-none"
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
                <input
                  value={form.email_login}
                  onChange={(e) => setForm({ ...form, email_login: e.target.value })}
                  placeholder="E-mail de login desta empresa no Conta Azul (opcional)"
                  type="email"
                  className="w-full bg-dark-900 border border-dark-600 rounded-lg pl-9 pr-4 py-2.5 text-white focus:ring-2 focus:ring-brand-500 outline-none placeholder:text-dark-600"
                />
              </div>
              <button
                type="submit"
                disabled={salvando}
                className="bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all"
              >
                {salvando ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                Salvar
              </button>
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
                  <h3 className="text-white font-bold text-lg">{empresa.nome}</h3>
                  <p className="text-dark-400 text-sm">{formatCNPJ(empresa.cnpj)}</p>
                </div>
              </div>
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

            <div className="space-y-4">
              {/* E-mail de login vinculado */}
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
       