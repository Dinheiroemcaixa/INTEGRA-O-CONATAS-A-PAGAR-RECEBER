'use client'

import React, { useState } from 'react'
import { Empresa } from '@/types'
import { formatCNPJ } from '@/lib/utils'
import { buscarCnpj } from '@/services/brasil-api/client'
import { createClient } from '@/lib/supabase/client'
import { 
  Building2, 
  X, 
  Search, 
  Plus, 
  Loader2, 
  Save, 
  Sparkles,
  Database,
  CreditCard,
  ShoppingBag
} from 'lucide-react'
import toast from 'react-hot-toast'

interface ModalNovaEmpresaProps {
  aberto: boolean
  onFechar: () => void
  onCriada: (novaEmpresa: Empresa) => void
}

export function ModalNovaEmpresa({ aberto, onFechar, onCriada }: ModalNovaEmpresaProps) {
  const [nome, setNome] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [razaoSocial, setRazaoSocial] = useState('')
  const [nomeFantasia, setNomeFantasia] = useState('')
  const [tipoEmpresa, setTipoEmpresa] = useState<'vendas' | 'financeiro' | 'ambos'>('ambos')
  const [emailLogin, setEmailLogin] = useState('')
  const [emailLoginVendas, setEmailLoginVendas] = useState('')
  const [datacarToken, setDatacarToken] = useState('')
  const [datacarCodEmp, setDatacarCodEmp] = useState('')
  const [datacarIdOperador, setDatacarIdOperador] = useState('')
  const [somenteBanco, setSomenteBanco] = useState(false)

  const [salvando, setSalvando] = useState(false)
  const [buscandoCnpj, setBuscandoCnpj] = useState(false)

  const supabase = createClient()

  if (!aberto) return null

  // Consultar CNPJ na Receita Federal
  const handleBuscarCnpj = async () => {
    const cnpjLimpo = cnpj.replace(/\D/g, '')
    if (cnpjLimpo.length !== 14) {
      toast.error('CNPJ inválido. Digite os 14 dígitos.')
      return
    }

    setBuscandoCnpj(true)
    try {
      const data = await buscarCnpj(cnpjLimpo)
      if (!data || (data as any).erro) {
        toast.error('CNPJ não localizado na base pública da Receita Federal.')
        return
      }

      setRazaoSocial(data.razao_social || '')
      setNomeFantasia(data.nome_fantasia || '')
      if (!nome) {
        setNome(data.nome_fantasia || data.razao_social || '')
      }
      toast.success('Dados da empresa localizados com sucesso!')
    } catch {
      toast.error('Erro ao consultar a base de CNPJ.')
    } finally {
      setBuscandoCnpj(false)
    }
  }

  // Criar empresa
  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nome.trim()) {
      toast.error('O Nome da empresa é obrigatório.')
      return
    }

    setSalvando(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        toast.error('Você precisa estar logado para cadastrar uma empresa.')
        return
      }

      const cnpjLimpo = cnpj.replace(/\D/g, '')
      let datacarCodEmpFinal = datacarCodEmp.trim()
      if (somenteBanco && datacarCodEmpFinal && !datacarCodEmpFinal.endsWith('_sb')) {
        datacarCodEmpFinal += '_sb'
      }

      // Inserir empresa
      const { data: novaEmpresa, error: errEmpresa } = await supabase
        .from('empresas')
        .insert({
          nome: nome.trim(),
          cnpj: cnpjLimpo,
          razao_social: razaoSocial.trim() || null,
          nome_fantasia: nomeFantasia.trim() || null,
          tipo_empresa: tipoEmpresa,
          email_login: emailLogin.trim() || null,
          email_login_vendas: emailLoginVendas.trim() || null,
          datacar_token: datacarToken.trim() || null,
          datacar_cod_emp: datacarCodEmpFinal || null,
          datacar_id_operador: datacarIdOperador.trim() || null,
        })
        .select()
        .single()

      if (errEmpresa || !novaEmpresa) throw errEmpresa || new Error('Falha ao criar empresa')

      // Vincular na tabela usuarios_empresas para RLS
      const { error: errVinculo } = await supabase
        .from('usuarios_empresas')
        .insert({
          usuario_id: user.id,
          empresa_id: novaEmpresa.id,
        })

      if (errVinculo) {
        console.warn('Aviso no vínculo usuarios_empresas:', errVinculo)
      }

      toast.success(`Empresa "${nome}" cadastrada com sucesso!`)
      onCriada(novaEmpresa)
      onFechar()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao cadastrar empresa')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div 
        className="bg-dark-800 border border-dark-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl space-y-5 p-6 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho do Modal */}
        <div className="flex items-center justify-between pb-3 border-b border-dark-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Building2 size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Cadastrar Nova Empresa / Filial</h3>
              <p className="text-xs text-dark-400">Preencha os dados cadastrais e as credenciais iniciais da filial</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onFechar}
            className="p-1.5 text-dark-400 hover:text-white rounded-lg hover:bg-dark-700 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSalvar} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Nome */}
            <div>
              <label className="block text-xs font-medium text-dark-300 mb-1">
                Nome de Exibição <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Alpha Pneus Barreiro"
                className="w-full bg-dark-900 border border-dark-600 rounded-xl px-3.5 py-2 text-white text-xs focus:ring-2 focus:ring-blue-500/50 outline-none"
                required
              />
            </div>

            {/* CNPJ + Busca */}
            <div>
              <label className="block text-xs font-medium text-dark-300 mb-1">
                CNPJ <span className="text-red-400">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={cnpj}
                  onChange={(e) => setCnpj(formatCNPJ(e.target.value))}
                  placeholder="00.000.000/0000-00"
                  maxLength={18}
                  className="w-full bg-dark-900 border border-dark-600 rounded-xl px-3.5 py-2 text-white text-xs font-mono focus:ring-2 focus:ring-blue-500/50 outline-none"
                  required
                />
                <button
                  type="button"
                  onClick={handleBuscarCnpj}
                  disabled={buscandoCnpj || cnpj.replace(/\D/g, '').length !== 14}
                  className="px-3 py-2 bg-blue-600/90 hover:bg-blue-600 disabled:opacity-50 text-white rounded-xl text-xs font-medium transition-colors flex items-center gap-1 flex-shrink-0"
                >
                  {buscandoCnpj ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
                  <span>Receita</span>
                </button>
              </div>
            </div>

            {/* Razão Social */}
            <div>
              <label className="block text-xs font-medium text-dark-300 mb-1">Razão Social</label>
              <input
                type="text"
                value={razaoSocial}
                onChange={(e) => setRazaoSocial(e.target.value)}
                placeholder="Razão Social Oficial"
                className="w-full bg-dark-900 border border-dark-600 rounded-xl px-3.5 py-2 text-white text-xs focus:ring-2 focus:ring-blue-500/50 outline-none"
              />
            </div>

            {/* Nome Fantasia */}
            <div>
              <label className="block text-xs font-medium text-dark-300 mb-1">Nome Fantasia</label>
              <input
                type="text"
                value={nomeFantasia}
                onChange={(e) => setNomeFantasia(e.target.value)}
                placeholder="Nome Fantasia Comercial"
                className="w-full bg-dark-900 border border-dark-600 rounded-xl px-3.5 py-2 text-white text-xs focus:ring-2 focus:ring-blue-500/50 outline-none"
              />
            </div>

            {/* Tipo de Empresa */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-dark-300 mb-1">Tipo de Operação</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { val: 'ambos', label: 'Ambos (Produtos & Serviços)' },
                  { val: 'vendas', label: 'Vendas / Peças' },
                  { val: 'financeiro', label: 'Contas a Pagar' },
                ].map((item) => (
                  <button
                    type="button"
                    key={item.val}
                    onClick={() => setTipoEmpresa(item.val as any)}
                    className={`py-2 px-2 rounded-xl border text-xs font-medium transition-all text-center ${
                      tipoEmpresa === item.val
                        ? 'bg-blue-600/20 border-blue-500/60 text-blue-300'
                        : 'bg-dark-900/60 border-dark-700 text-dark-400 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Seção Opcional: Integrações Iniciais */}
          <div className="pt-3 border-t border-dark-700 space-y-3">
            <h4 className="text-xs font-semibold text-white uppercase tracking-wider">Configurações de Acesso (Opcional)</h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-dark-300 mb-1">E-mail Conta Azul Financeiro</label>
                <input
                  type="email"
                  value={emailLogin}
                  onChange={(e) => setEmailLogin(e.target.value)}
                  placeholder="financeiro@empresa.com.br"
                  className="w-full bg-dark-900 border border-dark-600 rounded-xl px-3 py-2 text-white text-xs focus:ring-2 focus:ring-blue-500/50 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-dark-300 mb-1">E-mail Conta Azul Vendas</label>
                <input
                  type="email"
                  value={emailLoginVendas}
                  onChange={(e) => setEmailLoginVendas(e.target.value)}
                  placeholder="vendas@empresa.com.br"
                  className="w-full bg-dark-900 border border-dark-600 rounded-xl px-3 py-2 text-white text-xs focus:ring-2 focus:ring-blue-500/50 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-dark-300 mb-1">Código Filial Datacar (codEmp)</label>
                <input
                  type="text"
                  value={datacarCodEmp}
                  onChange={(e) => setDatacarCodEmp(e.target.value)}
                  placeholder="Ex: 1162"
                  className="w-full bg-dark-900 border border-dark-600 rounded-xl px-3 py-2 text-white text-xs font-mono focus:ring-2 focus:ring-blue-500/50 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-dark-300 mb-1">ID Operador Datacar</label>
                <input
                  type="text"
                  value={datacarIdOperador}
                  onChange={(e) => setDatacarIdOperador(e.target.value)}
                  placeholder="Ex: 21331"
                  className="w-full bg-dark-900 border border-dark-600 rounded-xl px-3 py-2 text-white text-xs font-mono focus:ring-2 focus:ring-blue-500/50 outline-none"
                />
              </div>
            </div>
          </div>

          {/* Botões do Rodapé */}
          <div className="pt-4 border-t border-dark-700 flex justify-end gap-3">
            <button
              type="button"
              onClick={onFechar}
              className="px-4 py-2 bg-dark-700 hover:bg-dark-600 text-dark-300 rounded-xl text-xs font-medium transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-2 shadow-lg shadow-blue-500/10"
            >
              {salvando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              <span>{salvando ? 'Cadastrando...' : 'Cadastrar Empresa'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
