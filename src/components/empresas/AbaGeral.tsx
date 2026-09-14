'use client'

import React, { useState } from 'react'
import { Empresa } from '@/types'
import { formatCNPJ } from '@/lib/utils'
import { buscarCnpj, type BrasilApiCnpjResponse } from '@/services/brasil-api/client'
import { createClient } from '@/lib/supabase/client'
import { 
  Building2, 
  Search, 
  Save, 
  FileText, 
  ChevronDown, 
  ChevronUp, 
  CheckCircle2, 
  MapPin, 
  Users, 
  Loader2,
  Briefcase
} from 'lucide-react'
import toast from 'react-hot-toast'

interface AbaGeralProps {
  empresa: Empresa
  onUpdated: (empresaAtualizada: Empresa) => void
}

export function AbaGeral({ empresa, onUpdated }: AbaGeralProps) {
  const [nome, setNome] = useState(empresa.nome || '')
  const [cnpj, setCnpj] = useState(empresa.cnpj ? formatCNPJ(empresa.cnpj) : '')
  const [razaoSocial, setRazaoSocial] = useState(empresa.razao_social || '')
  const [nomeFantasia, setNomeFantasia] = useState(empresa.nome_fantasia || '')
  const [tipoEmpresa, setTipoEmpresa] = useState<'vendas' | 'financeiro' | 'ambos'>(empresa.tipo_empresa || 'ambos')

  const [salvando, setSalvando] = useState(false)
  const [buscandoCnpj, setBuscandoCnpj] = useState(false)

  // Estado da Ficha Cadastral da Receita
  const [mostrarFicha, setMostrarFicha] = useState(false)
  const [carregandoFicha, setCarregandoFicha] = useState(false)
  const [dadosFicha, setDadosFicha] = useState<BrasilApiCnpjResponse | null>(null)

  const supabase = createClient()

  // Buscar dados na Brasil API
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
      if (!nome || nome === 'Nova Empresa' || nome.includes('00000000')) {
        setNome(data.nome_fantasia || data.razao_social || nome)
      }
      setDadosFicha(data)
      toast.success('Dados localizados com sucesso na Receita Federal!')
    } catch {
      toast.error('Erro ao consultar a base do CNPJ.')
    } finally {
      setBuscandoCnpj(false)
    }
  }

  // Carregar ficha completa da Receita
  const handleAbrirFicha = async () => {
    const novoStatus = !mostrarFicha
    setMostrarFicha(novoStatus)
    if (novoStatus && !dadosFicha) {
      const cnpjLimpo = (empresa.cnpj || cnpj).replace(/\D/g, '')
      if (cnpjLimpo.length === 14) {
        setCarregandoFicha(true)
        try {
          const res = await buscarCnpj(cnpjLimpo)
          if (res && !(res as any).erro) {
            setDadosFicha(res)
          }
        } catch {
          // silencioso
        } finally {
          setCarregandoFicha(false)
        }
      }
    }
  }

  // Salvar alterações
  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nome.trim()) {
      toast.error('O Nome da empresa é obrigatório.')
      return
    }

    setSalvando(true)
    try {
      const cnpjLimpo = cnpj.replace(/\D/g, '')
      const { data, error } = await supabase
        .from('empresas')
        .update({
          nome: nome.trim(),
          cnpj: cnpjLimpo,
          razao_social: razaoSocial.trim() || null,
          nome_fantasia: nomeFantasia.trim() || null,
          tipo_empresa: tipoEmpresa,
        })
        .eq('id', empresa.id)
        .select()
        .single()

      if (error) throw error

      toast.success(`Empresa "${nome}" atualizada com sucesso!`)
      if (data) {
        onUpdated(data)
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar empresa')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Formulário Cadastral Principal */}
      <form onSubmit={handleSalvar} className="bg-dark-800/80 border border-dark-700/70 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-dark-700/60">
          <div className="flex items-center gap-2">
            <Building2 className="text-blue-400" size={18} />
            <h3 className="font-semibold text-white text-base">Identificação & Dados Gerais</h3>
          </div>
          <span className="text-xs text-dark-400">ID: <code className="font-mono text-[11px] text-dark-300">{empresa.id.slice(0, 8)}...</code></span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Nome da Empresa */}
          <div>
            <label className="block text-xs font-medium text-dark-300 mb-1">
              Nome de Exibição (Filial) <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Alpha Pneus Barreiro"
              className="w-full bg-dark-900 border border-dark-600 rounded-xl px-3.5 py-2.5 text-white text-sm focus:ring-2 focus:ring-blue-500/50 outline-none transition-all placeholder:text-dark-500"
              required
            />
          </div>

          {/* CNPJ + Busca Receita Federal */}
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
                className="w-full bg-dark-900 border border-dark-600 rounded-xl px-3.5 py-2.5 text-white text-sm font-mono focus:ring-2 focus:ring-blue-500/50 outline-none transition-all placeholder:text-dark-500"
                required
              />
              <button
                type="button"
                onClick={handleBuscarCnpj}
                disabled={buscandoCnpj || cnpj.replace(/\D/g, '').length !== 14}
                title="Consultar dados na Receita Federal"
                className="px-3 py-2.5 bg-blue-600/90 hover:bg-blue-600 disabled:opacity-50 text-white rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5 flex-shrink-0 shadow-sm"
              >
                {buscandoCnpj ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                <span className="hidden sm:inline">Receita</span>
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
              placeholder="Razão Social Oficial da Empresa"
              className="w-full bg-dark-900 border border-dark-600 rounded-xl px-3.5 py-2.5 text-white text-sm focus:ring-2 focus:ring-blue-500/50 outline-none transition-all placeholder:text-dark-500"
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
              className="w-full bg-dark-900 border border-dark-600 rounded-xl px-3.5 py-2.5 text-white text-sm focus:ring-2 focus:ring-blue-500/50 outline-none transition-all placeholder:text-dark-500"
            />
          </div>

          {/* Tipo de Empresa */}
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-dark-300 mb-1">
              Tipo de Operação no Sistema
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { val: 'ambos', label: 'Ambos (Produtos & Serviços)' },
                { val: 'vendas', label: 'Apenas Vendas / Peças' },
                { val: 'financeiro', label: 'Apenas Contas a Pagar / Fin.' },
              ].map((item) => (
                <button
                  type="button"
                  key={item.val}
                  onClick={() => setTipoEmpresa(item.val as any)}
                  className={`py-2 px-3 rounded-xl border text-xs font-medium transition-all text-center ${
                    tipoEmpresa === item.val
                      ? 'bg-blue-600/20 border-blue-500/60 text-blue-300 ring-1 ring-blue-500/40'
                      : 'bg-dark-900/60 border-dark-700 text-dark-400 hover:bg-dark-900 hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Botão de Salvamento no Rodapé */}
        <div className="pt-3 border-t border-dark-700/60 flex justify-end">
          <button
            type="submit"
            disabled={salvando}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors shadow-lg shadow-blue-500/10"
          >
            {salvando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {salvando ? 'Salvando...' : 'Salvar Dados Gerais'}
          </button>
        </div>
      </form>

      {/* Card Expansível da Ficha Cadastral da Receita Federal */}
      <div className="bg-dark-800/80 border border-dark-700/70 rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={handleAbrirFicha}
          className="w-full p-4 sm:p-5 flex items-center justify-between hover:bg-dark-750 transition-colors text-left"
        >
          <div className="flex items-center gap-2.5">
            <FileText className="text-emerald-400" size={18} />
            <div>
              <h4 className="font-semibold text-white text-sm">Ficha Cadastral Oficial da Receita Federal</h4>
              <p className="text-xs text-dark-400">CNAE, situação cadastral, capital social, endereço e sócios (QSA)</p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-dark-400">
            {carregandoFicha && <Loader2 size={16} className="animate-spin text-blue-400" />}
            {mostrarFicha ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </div>
        </button>

        {mostrarFicha && (
          <div className="p-5 border-t border-dark-700/60 bg-dark-900/60 space-y-4 animate-fade-in">
            {carregandoFicha ? (
              <div className="py-8 text-center text-dark-400 text-sm flex items-center justify-center gap-2">
                <Loader2 size={16} className="animate-spin text-blue-400" />
                <span>Buscando dados na base pública da Receita Federal...</span>
              </div>
            ) : dadosFicha ? (
              <div className="space-y-4 text-xs">
                {/* Status Geral */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-dark-800/90 rounded-xl border border-dark-700/50">
                  <div>
                    <span className="text-dark-400 block mb-0.5">Situação Cadastral</span>
                    <span className="font-semibold text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 size={13} /> {dadosFicha.descricao_situacao_cadastral || 'ATIVA'}
                    </span>
                  </div>
                  <div>
                    <span className="text-dark-400 block mb-0.5">Data de Abertura</span>
                    <span className="text-white font-medium">{dadosFicha.data_inicio_atividade || 'N/D'}</span>
                  </div>
                  <div>
                    <span className="text-dark-400 block mb-0.5">Capital Social</span>
                    <span className="text-white font-medium">
                      {dadosFicha.capital_social ? `R$ ${Number(dadosFicha.capital_social).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'N/D'}
                    </span>
                  </div>
                  <div>
                    <span className="text-dark-400 block mb-0.5">Porte</span>
                    <span className="text-white font-medium">{dadosFicha.porte || 'N/D'}</span>
                  </div>
                </div>

                {/* Endereço */}
                <div className="p-3 bg-dark-800/90 rounded-xl border border-dark-700/50 space-y-1">
                  <div className="flex items-center gap-1.5 font-medium text-dark-300">
                    <MapPin size={13} className="text-blue-400" />
                    <span>Endereço Registrado</span>
                  </div>
                  <p className="text-white">
                    {`${dadosFicha.logradouro || ''}, ${dadosFicha.numero || 'S/N'}${dadosFicha.complemento ? ` - ${dadosFicha.complemento}` : ''} - ${dadosFicha.bairro || ''}`}
                  </p>
                  <p className="text-dark-400">
                    {`${dadosFicha.municipio || ''} / ${dadosFicha.uf || ''} - CEP: ${dadosFicha.cep || 'N/D'}`}
                  </p>
                </div>

                {/* Atividade Econômica / CNAE */}
                <div className="p-3 bg-dark-800/90 rounded-xl border border-dark-700/50 space-y-1">
                  <div className="flex items-center gap-1.5 font-medium text-dark-300">
                    <Briefcase size={13} className="text-amber-400" />
                    <span>Atividade Principal (CNAE)</span>
                  </div>
                  <p className="text-white font-medium">
                    {dadosFicha.cnae_fiscal ? `${dadosFicha.cnae_fiscal} - ${dadosFicha.cnae_fiscal_descricao || ''}` : 'N/D'}
                  </p>
                </div>

                {/* Sócios (QSA) */}
                {(dadosFicha as any).qsa && (dadosFicha as any).qsa.length > 0 && (
                  <div className="p-3 bg-dark-800/90 rounded-xl border border-dark-700/50 space-y-2">
                    <div className="flex items-center gap-1.5 font-medium text-dark-300">
                      <Users size={13} className="text-purple-400" />
                      <span>Quadro de Sócios e Administradores (QSA)</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {(dadosFicha as any).qsa.map((socio: any, idx: number) => (
                        <div key={idx} className="bg-dark-900/80 p-2 rounded-lg border border-dark-700/40">
                          <p className="text-white font-medium truncate">{socio.nome_socio || socio.nome || 'Sócio'}</p>
                          <p className="text-[11px] text-dark-400">{socio.qualificacao_socio || 'Sócio/Administrador'}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-6 text-dark-400">
                <p>Nenhuma informação carregada. Clique em consultar ou verifique o CNPJ.</p>
                <button
                  type="button"
                  onClick={handleAbrirFicha}
                  className="mt-2 text-xs text-blue-400 hover:underline"
                >
                  Tentar carregar novamente
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
