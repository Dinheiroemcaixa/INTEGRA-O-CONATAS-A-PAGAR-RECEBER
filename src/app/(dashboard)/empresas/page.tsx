'use client'

import { useEmpresa } from '@/contexts/EmpresaContext'
import { createClient } from '@/lib/supabase/client'
import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Building2, Plus, Check, Loader2, ExternalLink, Edit,
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
  const [form, setForm] = useState<{
    nome: string, 
    cnpj: string, 
    email_login: string, 
    tipo_empresa: 'vendas' | 'financeiro' | 'ambos',
    datacar_token: string,
    datacar_cod_emp: string,
    datacar_id_operador: string
  }>({ 
    nome: '', 
    cnpj: '', 
    email_login: '', 
    tipo_empresa: 'ambos',
    datacar_token: '',
    datacar_cod_emp: '',
    datacar_id_operador: ''
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

      setForm({ nome: '', cnpj: '', email_login: '', tipo_empresa: 'ambos', datacar_token: '', datacar_cod_emp: '', datacar_id_operador: '' })
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
    })
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
            setForm({ nome: '', cnpj: '', email_login: '', tipo_empresa: 'ambos', datacar_token: '', datacar_cod_emp: '', datacar_id_operador: '' })
            setShowForm(!showForm)
          }}
          className="bg-brand-600 hover:bg-brand-500 text-white px-4 py-2.5 rounded-lg font-semibold flex items-center gap-2 transition-all text-sm"
        >
          <Plus size={16} /> Nova Empresa
        </button>
      </div>

      {showForm && (
        <div className="bg-dark-800 border border-brand-500/30 shadow-[0_0_15px_rgba(var(--brand-500),0.1)] rounded-xl p-6 animate-fade-in relative">
          {editingId && (
            <button
              onClick={() => {
                setEditingId(null)
                setForm({ nome: '', cnpj: '', email_login: '', tipo_empresa: 'ambos', datacar_token: '', datacar_cod_emp: '', datacar_id_operador: '' })
                setShowForm(false)
              }}
              className="absolute top-4 right-4 text-dark-400 hover:text-white transition-colors"
            >
              ✕
            </button>
          )}
          <h3 className="text-white font-semibold mb-4">
            {editingId ? 'Editar Empresa' : 'Cadastrar nova empresa'}
          </h3>
          <form onSubmit={handleSalvar} className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Nome ou Apelido (Ex: Loja Barão - Financeiro)"
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
              <select
                value={form.tipo_empresa}
                onChange={(e) => setForm({ ...form, tipo_empresa: e.target.value as any })}
                className="w-full sm:w-48 bg-dark-900 border border-dark-600 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-brand-500 outline-none"
              >
                <option value="ambos">Ambos (Vendas e Financeiro)</option>
                <option value="financeiro">Apenas Financeiro</option>
                <option value="vendas">Apenas Vendas</option>
              </select>
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
            </div>
            
            <div className="pt-2 border-t border-dark-700/50 mt-1">
              <p className="text-xs text-dark-400 font-medium mb-3">Integração Datacar (Opcional)</p>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  value={form.datacar_token}
                  onChange={(e) => setForm({ ...form, datacar_token: e.target.value })}
                  placeholder="Token"
                  className="flex-1 bg-dark-900 border border-dark-600 rounded-lg px-4 py-2 text-sm text-white focus:ring-2 focus:ring-brand-500 outline-none"
                />
                <input
                  value={form.datacar_cod_emp}
                  onChange={(e) => setForm({ ...form, datacar_cod_emp: e.target.value })}
                  placeholder="Código da Empresa"
                  className="w-full sm:w-40 bg-dark-900 border border-dark-600 rounded-lg px-4 py-2 text-sm text-white focus:ring-2 focus:ring-brand-500 outline-none"
                />
                <input
                  value={form.datacar_id_operador}
                  onChange={(e) => setForm({ ...form, datacar_id_operador: e.target.value })}
                  placeholder="ID Operador"
                  className="w-full sm:w-32 bg-dark-900 border border-dark-600 rounded-lg px-4 py-2 text-sm text-white focus:ring-2 focus:ring-brand-500 outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
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
