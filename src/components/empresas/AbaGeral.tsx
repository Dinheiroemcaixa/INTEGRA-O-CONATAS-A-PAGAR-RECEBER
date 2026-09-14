'use client'

import React, { useState, useEffect } from 'react'
import { Empresa } from '@/types'
import { formatCNPJ } from '@/lib/utils'
import { buscarCnpj, type BrasilApiCnpjResponse } from '@/services/brasil-api/client'
import { createClient } from '@/lib/supabase/client'
import { 
  Building2, 
  Save, 
  ChevronDown, 
  ChevronUp, 
  MapPin, 
  Users, 
  Loader2,
  Calendar,
  DollarSign,
  Copy,
  Check,
  RefreshCw,
  ShieldCheck,
  Tag
} from 'lucide-react'
import toast from 'react-hot-toast'

interface AbaGeralProps {
  empresa: Empresa
  onUpdated: (empresaAtualizada: Empresa) => void
}

export function AbaGeral({ empresa, onUpdated }: AbaGeralProps) {
  // Apenas Apelido é editável
  const [apelido, setApelido] = useState(empresa.nome || '')
  const [salvando, setSalvando] = useState(false)
  const [copiadoCnpj, setCopiadoCnpj] = useState(false)

  // Estado dos dados da Receita Federal
  const [dadosReceita, setDadosReceita] = useState<BrasilApiCnpjResponse | null>(null)
  const [carregandoReceita, setCarregandoReceita] = useState(false)

  // Accordions
  const [accordionEnderecoAberto, setAccordionEnderecoAberto] = useState(false)
  const [accordionSociosAberto, setAccordionSociosAberto] = useState(false)

  const supabase = createClient()

  // Carregar dados públicos da Receita Federal automaticamente
  const carregarDadosReceita = async (forcar = false) => {
    if (!empresa.cnpj) return
    const cnpjLimpo = empresa.cnpj.replace(/\D/g, '')
    if (cnpjLimpo.length !== 14) return

    setCarregandoReceita(true)
    try {
      const data = await buscarCnpj(cnpjLimpo)
      if (data && !(data as any).erro) {
        setDadosReceita(data)
        if (forcar) {
          toast.success('Dados da Receita Federal atualizados!')
        }
      } else if (forcar) {
        toast.error('CNPJ não localizado na base pública da Receita.')
      }
    } catch {
      if (forcar) toast.error('Falha ao consultar a Receita Federal.')
    } finally {
      setCarregandoReceita(false)
    }
  }

  useEffect(() => {
    setApelido(empresa.nome || '')
    carregarDadosReceita()
  }, [empresa.id, empresa.cnpj])

  // Salvar apenas o Apelido da Empresa
  const handleSalvarApelido = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!apelido.trim()) {
      toast.error('O Apelido da empresa é obrigatório.')
      return
    }

    setSalvando(true)
    try {
      const { data, error } = await supabase
        .from('empresas')
        .update({
          nome: apelido.trim()
        })
        .eq('id', empresa.id)
        .select('*')
        .single()

      if (error) throw error

      toast.success('Apelido da empresa atualizado com sucesso!')
      onUpdated(data as Empresa)
    } catch (err: any) {
      console.error('Erro ao salvar apelido:', err)
      toast.error(err.message || 'Erro ao atualizar o apelido da empresa.')
    } finally {
      setSalvando(false)
    }
  }

  const handleCopiarCnpj = () => {
    if (!empresa.cnpj) return
    navigator.clipboard.writeText(empresa.cnpj.replace(/\D/g, ''))
    setCopiadoCnpj(true)
    toast.success('CNPJ copiado!')
    setTimeout(() => setCopiadoCnpj(false), 2000)
  }

  // Formatador de valor de moeda
  const formatarMoeda = (valor?: number | string | null) => {
    if (valor === null || valor === undefined || valor === '') return 'Não informado'
    const num = Number(valor)
    if (isNaN(num)) return String(valor)
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  // Formatador de data
  const formatarData = (dataStr?: string | null) => {
    if (!dataStr) return 'Não informada'
    try {
      const partes = dataStr.split('-')
      if (partes.length === 3) {
        return `${partes[2]}/${partes[1]}/${partes[0]}`
      }
      return new Date(dataStr).toLocaleDateString('pt-BR')
    } catch {
      return dataStr
    }
  }

  // Dados consolidados
  const razaoSocialExibicao = dadosReceita?.razao_social || empresa.razao_social || 'Não informada'
  const situacaoCadastral = dadosReceita?.descricao_situacao_cadastral || 'ATIVA'
  const dataAbertura = dadosReceita?.data_inicio_atividade ? formatarData(dadosReceita.data_inicio_atividade) : 'Não informada'
  const capitalSocial = dadosReceita?.capital_social ? formatarMoeda(dadosReceita.capital_social) : 'Não informado'
  const tipoExibicao = empresa.tipo_empresa ? empresa.tipo_empresa.toUpperCase() : 'AMBOS'
  const qsaList = (dadosReceita as any)?.qsa || []

  return (
    <div className="space-y-5">
      {/* FORMULÁRIO DE FICHA CADASTRAL ÚNICA */}
      <form onSubmit={handleSalvarApelido} className="bg-dark-800/80 border border-dark-700/70 rounded-2xl p-5 sm:p-6 space-y-5">
        {/* Cabeçalho da Ficha */}
        <div className="flex items-center justify-between pb-4 border-b border-dark-700/70 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-500/15 border border-primary-500/30 flex items-center justify-center text-primary-400">
              <Building2 size={20} />
            </div>
            <div>
              <h3 className="font-semibold text-white text-base">Ficha Cadastral Oficial</h3>
              <p className="text-xs text-dark-400">
                Informações consolidadas da empresa e consulta à Receita Federal
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => carregarDadosReceita(true)}
              disabled={carregandoReceita}
              title="Consultar e atualizar dados da Receita Federal"
              className="px-3 py-1.5 bg-dark-700/60 hover:bg-dark-700 text-dark-300 hover:text-white rounded-xl text-xs font-medium border border-dark-600/50 transition-colors flex items-center gap-1.5"
            >
              <RefreshCw size={13} className={carregandoReceita ? 'animate-spin text-primary-400' : ''} />
              <span>{carregandoReceita ? 'Consultando...' : 'Atualizar da Receita'}</span>
            </button>

            <button
              type="submit"
              disabled={salvando}
              className="px-4 py-1.5 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm shadow-primary-500/20"
            >
              {salvando ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              <span>{salvando ? 'Salvando...' : 'Salvar Apelido'}</span>
            </button>
          </div>
        </div>

        {/* CAMPO EDITÁVEL: APELIDO */}
        <div className="bg-primary-950/20 border border-primary-900/40 rounded-xl p-4 space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="input-apelido" className="text-xs font-semibold text-primary-300 flex items-center gap-1.5">
              <span>Apelido no Sistema</span>
              <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-primary-500/20 text-primary-400 font-bold border border-primary-500/30">
                Editável
              </span>
            </label>
            <span className="text-[11px] text-dark-400">Nome de exibição nos seletores e listagens</span>
          </div>
          <input
            id="input-apelido"
            type="text"
            value={apelido}
            onChange={(e) => setApelido(e.target.value)}
            placeholder="Ex: Matriz São Paulo"
            className="w-full bg-dark-900 border border-dark-700 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-dark-500 font-medium transition-colors"
          />
        </div>

        {/* CAMPOS VISÍVEIS SOMENTE LEITURA */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
          {/* Razão Social */}
          <div className="p-3.5 bg-dark-900/70 rounded-xl border border-dark-700/60 space-y-1 sm:col-span-2">
            <span className="text-[11px] text-dark-400 font-medium block">Razão Social (Receita Federal)</span>
            <p className="text-sm font-semibold text-white truncate" title={razaoSocialExibicao}>
              {razaoSocialExibicao}
            </p>
          </div>

          {/* CNPJ */}
          <div className="p-3.5 bg-dark-900/70 rounded-xl border border-dark-700/60 space-y-1">
            <span className="text-[11px] text-dark-400 font-medium block">CNPJ</span>
            <div className="flex items-center justify-between">
              <span className="text-sm font-mono font-bold text-white">
                {empresa.cnpj ? formatCNPJ(empresa.cnpj) : 'Não informado'}
              </span>
              {empresa.cnpj && (
                <button
                  type="button"
                  onClick={handleCopiarCnpj}
                  title="Copiar CNPJ"
                  className="p-1 hover:bg-dark-800 rounded-lg text-dark-400 hover:text-white transition-colors"
                >
                  {copiadoCnpj ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                </button>
              )}
            </div>
          </div>

          {/* Tipo de Empresa */}
          <div className="p-3.5 bg-dark-900/70 rounded-xl border border-dark-700/60 space-y-1">
            <span className="text-[11px] text-dark-400 font-medium flex items-center gap-1">
              <Tag size={12} />
              <span>Tipo Operacional</span>
            </span>
            <p className="text-sm font-semibold text-primary-300">
              {tipoExibicao}
            </p>
          </div>

          {/* Situação Cadastral */}
          <div className="p-3.5 bg-dark-900/70 rounded-xl border border-dark-700/60 space-y-1">
            <span className="text-[11px] text-dark-400 font-medium flex items-center gap-1">
              <ShieldCheck size={12} />
              <span>Situação Cadastral</span>
            </span>
            <p className="text-sm font-semibold text-emerald-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-glow-sm" />
              <span>{situacaoCadastral}</span>
            </p>
          </div>

          {/* Data de Abertura */}
          <div className="p-3.5 bg-dark-900/70 rounded-xl border border-dark-700/60 space-y-1">
            <span className="text-[11px] text-dark-400 font-medium flex items-center gap-1">
              <Calendar size={12} />
              <span>Data de Abertura</span>
            </span>
            <p className="text-sm font-semibold text-dark-200">
              {dataAbertura}
            </p>
          </div>

          {/* Capital Social */}
          <div className="p-3.5 bg-dark-900/70 rounded-xl border border-dark-700/60 space-y-1 sm:col-span-2 lg:col-span-3">
            <span className="text-[11px] text-dark-400 font-medium flex items-center gap-1">
              <DollarSign size={12} />
              <span>Capital Social Registrado</span>
            </span>
            <p className="text-sm font-bold text-emerald-300 font-mono">
              {capitalSocial}
            </p>
          </div>
        </div>

        {/* ACCORDIONS (EXPANSÍVEIS): ENDEREÇO E QUADRO DE SÓCIOS */}
        <div className="space-y-3 pt-2">
          {/* Accordion 1: Endereço na Receita Federal */}
          <div className="border border-dark-700/60 rounded-xl overflow-hidden bg-dark-900/40">
            <button
              type="button"
              onClick={() => setAccordionEnderecoAberto(!accordionEnderecoAberto)}
              className="w-full p-3.5 flex items-center justify-between text-left hover:bg-dark-800/50 transition-colors"
            >
              <span className="flex items-center gap-2 text-xs font-semibold text-dark-200">
                <MapPin size={15} className="text-amber-400" />
                <span>Endereço na Receita Federal</span>
              </span>
              {accordionEnderecoAberto ? <ChevronUp size={16} className="text-dark-400" /> : <ChevronDown size={16} className="text-dark-400" />}
            </button>

            {accordionEnderecoAberto && (
              <div className="p-4 border-t border-dark-700/60 bg-dark-900/80 text-xs space-y-2">
                {dadosReceita ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-dark-300">
                    <div>
                      <span className="text-dark-500 block text-[11px]">Logradouro / Número</span>
                      <span className="text-white font-medium">
                        {dadosReceita.descricao_tipo_de_logradouro || ''} {dadosReceita.logradouro || 'N/D'}, {dadosReceita.numero || 'S/N'}
                        {dadosReceita.complemento ? ` (${dadosReceita.complemento})` : ''}
                      </span>
                    </div>
                    <div>
                      <span className="text-dark-500 block text-[11px]">Bairro</span>
                      <span className="text-white font-medium">{dadosReceita.bairro || 'N/D'}</span>
                    </div>
                    <div>
                      <span className="text-dark-500 block text-[11px]">Município / UF</span>
                      <span className="text-white font-medium">
                        {dadosReceita.municipio || 'N/D'} - {dadosReceita.uf || 'N/D'}
                      </span>
                    </div>
                    <div>
                      <span className="text-dark-500 block text-[11px]">CEP</span>
                      <span className="text-white font-mono font-medium">{dadosReceita.cep || 'N/D'}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-dark-400 py-1">
                    {carregandoReceita ? 'Consultando endereço na Receita Federal...' : 'Endereço não disponível. Clique em "Atualizar da Receita" acima.'}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Accordion 2: Quadro de Sócios e Administradores (QSA) */}
          <div className="border border-dark-700/60 rounded-xl overflow-hidden bg-dark-900/40">
            <button
              type="button"
              onClick={() => setAccordionSociosAberto(!accordionSociosAberto)}
              className="w-full p-3.5 flex items-center justify-between text-left hover:bg-dark-800/50 transition-colors"
            >
              <span className="flex items-center gap-2 text-xs font-semibold text-dark-200">
                <Users size={15} className="text-purple-400" />
                <span>Quadro de Sócios e Administradores (QSA)</span>
                {qsaList.length > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-purple-500/20 text-purple-300">
                    {qsaList.length}
                  </span>
                )}
              </span>
              {accordionSociosAberto ? <ChevronUp size={16} className="text-dark-400" /> : <ChevronDown size={16} className="text-dark-400" />}
            </button>

            {accordionSociosAberto && (
              <div className="p-4 border-t border-dark-700/60 bg-dark-900/80 text-xs space-y-2">
                {qsaList.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {qsaList.map((socio: any, idx: number) => (
                      <div key={idx} className="bg-dark-850 p-2.5 rounded-lg border border-dark-700/60">
                        <p className="text-white font-medium truncate">{socio.nome_socio || socio.nome || 'Sócio'}</p>
                        <p className="text-[11px] text-dark-400 mt-0.5">{socio.qualificacao_socio || 'Sócio / Administrador'}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-dark-400 py-1">
                    {carregandoReceita ? 'Consultando sócios na Receita Federal...' : 'Quadro societário não encontrado ou empresa individual.'}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </form>
    </div>
  )
}
