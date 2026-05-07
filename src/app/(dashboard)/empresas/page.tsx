'use client'

import { useEmpresa } from '@/contexts/EmpresaContext'
import { createClient } from '@/lib/supabase/client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Building2, Plus, Check, Loader2, ExternalLink, RefreshCw, Unlink } from 'lucide-react'
import toast from 'react-hot-toast'
import { formatCNPJ } from '@/lib/utils'

function EmpresasPage() {
  const { empresas, recarregar, setEmpresaAtiva, empresaAtiva } = useEmpresa()
  const [showForm, setShowForm] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [conectando, setConectando] = useState<string | null>(null)
  const [form, setForm] = useState({ nome: '', cnpj: '' })
  const supabase = createClient()
  const searchParams = useSearchParams()

  useEffect(() => {
    const sucesso = searchParams.get('sucesso')
    const erro = searchParams.get('erro')
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

  function handleConectarContaAzul(empresaId: string) {
    setConectando(empresaId)
    window.location.href = `/api/conta-azul/autorizar?empresa_id=${empresaId}`
  }

  async function handleDesconectar(empresaId: string) {
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

  async function handleCriar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Usuário não autenticado')
      const cnpjLimpo = form.cnpj.replace(/\D/g, '')
      const { data: empresa, error: errEmp } = await supabase
        .from('empresas')
        .insert({ nome: form.nome.trim(), cnpj: cnpjLimpo, created_by: user.id })
        .select()
        .single()
      if (errEmp) throw errEmp
      const { error: errVinc } = await supabase
        .from('usuarios_empresas')
        .insert({ user_id: user.id, empresa_id: empresa.id, papel: 'admin' })
      if (errVinc) throw errVinc
      toast.success('Empresa criada com sucesso!')
      setForm({ nome: '', cnpj: '' })
      setShowForm(false)
      await recarregar()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao criar empresa')
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
          className="bg-brand-600 hover:bg-brand-500 text-white px-4 py-2.5 rounded-lg font-semibold flex items-center gap-2 transition-all text-sm"
        >
          <Plus size={16} /> Nova Empresa
        </button>
      </div>

      {showForm && (
        <div className="bg-dark-800 border border-dark-600 rounded-xl p-6 animate-fade-in">
          <h3 className="text-white font-semibold mb-4">Cadastrar nova empresa</h3>
          <form onSubmit={handleCriar} className="flex flex-col sm:flex-row gap-3">
            <input
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              placeholder="Nome da empresa"
              required
              className="flex-1 bg-dark-900 border border-dark-600 rounded-lg px-4 py-2.5 text-white placeholder-dark-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <input
              value={form.cnpj}
              onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
              placeholder="CNPJ (opcional)"
              className="w-48 bg-dark-900 border border-dark-600 rounded-lg px-4 py-2.5 text-white placeholder-dark-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <button
              type="submit"
              disabled={salvando}
              className="bg-green-600 hover:bg-green-500 disabled:opacity-60 text-white px-6 py-2.5 rounded-lg font-semibold flex items-center gap-2 transition-all whitespace-nowrap"
            >
              {salvando ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              Salvar
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-dark-400 hover:text-white px-4 py-2.5 transition-colors"
            >
              Cancelar
            </button>
          </form>
        </div>
      )}

      {empresas.length === 0 ? (
        <div className="bg-dark-800 border border-dark-700 rounded-xl p-12 text-center">
          <Building2 size={40} className="text-dark-600 mx-auto mb-3" />
          <p className="text-white font-medium">Nenhuma empresa cadastrada</p>
          <p className="text-dark-400 text-sm mt-1">Clique em &quot;Nova Empresa&quot; para começar</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {empresas.map((emp) => (
            <div
              key={emp.id}
              className={`bg-dark-800 border rounded-xl p-5 flex items-center gap-4 transition-all ${
                empresaAtiva?.id === emp.id
                  ? 'border-brand-600 shadow-md shadow-brand-900/20'
                  : 'border-dark-700 hover:border-dark-600'
              }`}
            >
              <div className="w-11 h-11 bg-brand-600/20 border border-brand-600/30 rounded-xl flex items-center justify-center flex-shrink-0">
                <span className="text-brand-400 font-bold text-lg">
                  {emp.nome.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold truncate">{emp.nome}</p>
                <p className="text-dark-500 text-sm">
                  {emp.cnpj ? formatCNPJ(emp.cnpj) : 'CNPJ não informado'}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {emp.conta_azul_connected ? (
                  <div className="flex items-center gap-1.5">
                    <span className="flex items-center gap-1.5 text-xs text-green-400 bg-green-400/10 px-2.5 py-1 rounded-full">
                      <Check size={11} /> Conta Azul
                    </span>
                    <button
                      onClick={() => handleConectarContaAzul(emp.id)}
                      title="Reconectar Conta Azul"
                      className="text-dark-500 hover:text-brand-400 p-1 rounded transition-colors"
                    >
                      <RefreshCw size={13} />
                    </button>
                    <button
                      onClick={() => handleDesconectar(emp.id)}
                      title="Desconectar Conta Azul"
                      className="text-dark-500 hover:text-red-400 p-1 rounded transition-colors"
                    >
                      <Unlink size={13} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => handleConectarContaAzul(emp.id)}
                    disabled={conectando === emp.id}
                    className="flex items-center gap-1.5 text-xs text-yellow-500 bg-yellow-400/10 hover:bg-yellow-400/20 border border-yellow-500/30 px-2.5 py-1 rounded-full transition-all disabled:opacity-60"
                  >
                    {conectando === emp.id
                      ? <Loader2 size={11} className="animate-spin" />
                      : <ExternalLink size={11} />
                    }
                    Conectar Conta Azul
                  </button>
                )}
                {empresaAtiva?.id === emp.id ? (
                  <span className="text-xs text-brand-400 bg-brand-400/10 px-2.5 py-1 rounded-full font-medium">
                    Ativa
                  </span>
                ) : (
                  <button
                    onClick={() => setEmpresaAtiva(emp)}
                    className="text-xs text-dark-400 hover:text-white bg-dark-700 hover:bg-dark-600 px-3 py-1 rounded-full transition-all"
                  >
                    Selecionar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function EmpresasPageWrapper() {
  return (
    <Suspense>
      <EmpresasPage />
 