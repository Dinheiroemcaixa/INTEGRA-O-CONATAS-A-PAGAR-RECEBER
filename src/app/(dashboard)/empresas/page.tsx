'use client'

import { useEmpresa } from '@/contexts/EmpresaContext'
import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'
import { Building2, Plus, Check, Loader2, ExternalLink } from 'lucide-react'
import toast from 'react-hot-toast'
import { formatCNPJ } from '@/lib/utils'

export default function EmpresasPage() {
  const { empresas, recarregar, setEmpresaAtiva, empresaAtiva } = useEmpresa()
  const [showForm, setShowForm] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [form, setForm] = useState({ nome: '', cnpj: '' })
  const supabase = createClient()

  const handleCriar = async (e: React.FormEvent) => {
    e.preventDefault()
    setSalvando(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Usuário não autenticado')

      const cnpjLimpo = form.cnpj.replace(/\D/g, '')

      const { data: empresa, error: errEmp } = await supabase
        .from('empresas')
        .insert({ nome: form.nome.trim(), cnpj: cnpjLimpo })
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

      {/* Formulário */}
      {showForm && (
        <div className="bg-dark-800 border border-dark-600 rounded-xl p-6 animate-fade-in">
          <h3 className="text-white font-semibold mb-4">Cadastrar nova empresa</h3>
          <form onSubmit={handleCriar} className="flex flex-col sm:flex-row gap-3">
            <input
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              placeholder="Nome da empresa"
              required
              className="flex-1 bg-dark-900 border border-dark-600 rounded-lg px-4 py-2.5 text-white
                         placeholder-dark-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <input
              value={form.cnpj}
              onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
              placeholder="CNPJ (opcional)"
              className="w-48 bg-dark-900 border border-dark-600 rounded-lg px-4 py-2.5 text-white
                         placeholder-dark-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <button
              type="submit"
              disabled={salvando}
              className="bg-green-600 hover:bg-green-500 disabled:opacity-60 text-white px-6 py-2.5
                         rounded-lg font-semibold flex items-center gap-2 transition-all whitespace-nowrap"
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

      {/* Lista */}
      {empresas.length === 0 ? (
        <div className="bg-dark-800 border border-dark-700 rounded-xl p-12 text-center">
          <Building2 size={40} className="text-dark-600 mx-auto mb-3" />
          <p className="text-white font-medium">Nenhuma empresa cadastrada</p>
          <p className="text-dark-400 text-sm mt-1">Clique em &quot;Nova Empresa&quot; para começar</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {empresas.map((emp) => (
            <div key={emp.id}
              className={`bg-dark-800 border rounded-xl p-5 flex items-center gap-4 transition-all
                ${empresaAtiva?.id === emp.id ? 'border-brand-600 shadow-md shadow-brand-900/20' : 'border-dark-700 hover:border-dark-600'}`}>
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
                {emp.access_token_conta_azul ? (
                  <span className="flex items-center gap-1.5 text-xs text-green-400 bg-green-400/10 px-2.5 py-1 rounded-full">
                    <Check size={11} /> Conta Azul
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs text-yellow-500 bg-yellow-400/10 px-2.5 py-1 rounded-full">
                    <ExternalLink size={11} /> Configurar
                  </span>
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
