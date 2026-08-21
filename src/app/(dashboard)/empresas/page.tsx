'use client'

import { useEmpresa } from '@/contexts/EmpresaContext'
import { createClient } from '@/lib/supabase/client'
import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Building2, Plus, Check, Loader2, ExternalLink, Edit,
  RefreshCw, Unlink, Upload, Users, ChevronDown, ChevronUp, Trash2, ShieldCheck, Mail, Search, Copy, X, Store
} from 'lucide-react'
import toast from 'react-hot-toast'
import { formatCNPJ } from '@/lib/utils'
import { parseFornecedoresArquivo } from '@/lib/parsers/fornecedores-contaazul'
import { buscarCnpj, type BrasilApiCnpjResponse } from '@/services/brasil-api/client'
import type { Empresa } from '@/types'

const AVATAR_GRADIENTS = [
  'from-blue-600 to-indigo-600 border-blue-400/30 text-white shadow-[0_0_15px_rgba(37,99,235,0.3)]',
  'from-emerald-600 to-teal-600 border-emerald-400/30 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)]',
  'from-purple-600 to-pink-600 border-purple-400/30 text-white shadow-[0_0_15px_rgba(147,51,234,0.3)]',
  'from-amber-600 to-orange-600 border-amber-400/30 text-white shadow-[0_0_15px_rgba(217,119,6,0.3)]',
  'from-cyan-600 to-blue-600 border-cyan-400/30 text-white shadow-[0_0_15px_rgba(6,182,212,0.3)]',
]

function getAvatarGradient(id: string) {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash += id.charCodeAt(i)
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length]
}

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

// --- Painel de Ficha Cadastral (Brasil API / Receita Federal) ---
function PainelFichaCadastral({ empresa }: { empresa: Empresa }) {
  const [aberto, setAberto] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [dados, setDados] = useState<BrasilApiCnpjResponse | null>(null)

  const carregarFicha = async () => {
    if (dados) return
    const cnpjLimpo = (empresa.cnpj || '').replace(/\D/g, '')
    if (cnpjLimpo.length !== 14) return
    setCarregando(true)
    try {
      const res = await buscarCnpj(cnpjLimpo)
      if (res) setDados(res)
    } catch {
      // Silencioso
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className="border-t border-dark-700/30 mt-2 pt-2 cursor-default" onClick={e => e.stopPropagation()}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          const novoState = !aberto
          setAberto(novoState)
          if (novoState) carregarFicha()
        }}
        className="flex items-center gap-2 text-xs text-dark-400 hover:text-white transition-colors w-full"
      >
        <Building2 size={13} className="text-emerald-400" />
        <span className="font-medium">Ficha Cadastral (Brasil API)</span>
        {aberto ? <ChevronUp size={13} className="ml-auto" /> : <ChevronDown size={13} className="ml-auto" />}
      </button>

      {aberto && (
        <div className="mt-2.5 bg-dark-900/60 border border-dark-700/50 rounded-xl p-3.5 space-y-2 text-xs animate-fade-in">
          {carregando ? (
            <div className="flex items-center gap-2 text-dark-400 py-1">
              <Loader2 size={13} className="animate-spin text-emerald-400" />
              <span>Consultando Receita Federal...</span>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-dark-400 uppercase font-semibold">CNPJ Oficial</span>
                <span className="font-mono text-emerald-400 font-bold">{formatCNPJ(empresa.cnpj)}</span>
              </div>
              {empresa.razao_social && (
                <div>
                  <span className="text-[10px] text-dark-400 uppercase block font-semibold">Razão Social</span>
                  <span className="text-white font-medium block truncate">{empresa.razao_social}</span>
                </div>
              )}
              {(empresa.nome_fantasia || dados?.nome_fantasia) && (
                <div>
                  <span className="text-[10px] text-dark-400 uppercase block font-semibold">Nome Fantasia</span>
                  <span className="text-white font-medium block truncate">{empresa.nome_fantasia || dados?.nome_fantasia}</span>
                </div>
              )}
              {dados && (
                <>
                  <div className="flex items-center justify-between pt-1 border-t border-dark-700/30">
                    <span className="text-[10px] text-dark-400 uppercase font-semibold">Situação</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      dados.descricao_situacao_cadastral === 'ATIVA' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                    }`}>
                      {dados.descricao_situacao_cadastral}
                    </span>
                  </div>
                  {dados.cnae_fiscal_descricao && (
                    <div>
                      <span className="text-[10px] text-dark-400 uppercase block font-semibold">CNAE Principal</span>
                      <span className="text-dark-300 block truncate">{dados.cnae_fiscal} — {dados.cnae_fiscal_descricao}</span>
                    </div>
                  )}
                  {dados.logradouro && (
                    <div>
                      <span className="text-[10px] text-dark-400 uppercase block font-semibold">Endereço Registrado</span>
                      <span className="text-dark-300 block">
                        {dados.logradouro}, {dados.numero} {dados.complemento ? `- ${dados.complemento}` : ''} — {dados.bairro}, {dados.municipio}/{dados.uf}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function InlineEmpresaEditForm({
  empresa,
  onCancel,
  onSaved,
}: {
  empresa: Empresa
  onCancel: () => void
  onSaved: () => void
}) {
  const supabase = createClient()
  const ehSomenteBancoInicial = empresa.datacar_cod_emp === 'SOMENTE_BANCO' || (empresa as any).tipo_empresa === 'somente_banco' || (empresa as any).somente_banco === true

  const [nome, setNome] = useState(empresa.nome || '')
  const [cnpj, setCnpj] = useState(empresa.cnpj ? formatCNPJ(empresa.cnpj) : '')
  const [razaoSocial, setRazaoSocial] = useState(empresa.razao_social || '')
  const [nomeFantasia, setNomeFantasia] = useState(empresa.nome_fantasia || '')
  const [emailLogin, setEmailLogin] = useState(empresa.email_login || '')
  const [emailLoginVendas, setEmailLoginVendas] = useState(empresa.email_login_vendas || '')
  const [datacarToken, setDatacarToken] = useState(empresa.datacar_token || '')
  const [datacarCodEmp, setDatacarCodEmp] = useState(empresa.datacar_cod_emp === 'SOMENTE_BANCO' ? '' : (empresa.datacar_cod_emp || ''))
  const [datacarIdOperador, setDatacarIdOperador] = useState(empresa.datacar_id_operador || '')
  const [somenteBanco, setSomenteBanco] = useState(ehSomenteBancoInicial)
  const [salvando, setSalvando] = useState(false)
  const [buscandoCnpj, setBuscandoCnpj] = useState(false)
  const [dadosCnpj, setDadosCnpj] = useState<BrasilApiCnpjResponse | null>(null)

  const handleBuscarCnpjInline = async () => {
    const cnpjLimpo = (cnpj || '').replace(/\D/g, '')
    if (cnpjLimpo.length !== 14) {
      toast.error('CNPJ inválido. Digite os 14 dígitos.')
      return
    }
    setBuscandoCnpj(true)
    try {
      const dados = await buscarCnpj(cnpjLimpo)
      if (!dados) {
        toast.error('CNPJ não encontrado na base pública da Receita. Verifique o número digitado.')
        setDadosCnpj(null)
        return
      }
      setDadosCnpj(dados)
      setCnpj(formatCNPJ(cnpjLimpo))
      if (!nome.trim()) {
        setNome(dados.nome_fantasia || dados.razao_social || '')
      }
      setRazaoSocial(dados.razao_social || '')
      setNomeFantasia(dados.nome_fantasia || '')
      toast.success('Dados oficiais da Receita Federal localizados com sucesso!')
    } catch (e) {
      console.error('[handleBuscarCnpjInline] Erro:', e)
      toast.error('Erro ao consultar a base de CNPJ.')
    } finally {
      setBuscandoCnpj(false)
    }
  }

  const handleSalvarInline = async (e: React.FormEvent) => {
    e.preventDefault()
    setSalvando(true)
    try {
      const cnpjLimpo = cnpj.replace(/\D/g, '')
      const datacarCodEmpFinal = somenteBanco
        ? 'SOMENTE_BANCO'
        : (datacarCodEmp.trim() || null)

      const { error } = await supabase
        .from('empresas')
        .update({
          nome: nome.trim(),
          cnpj: cnpjLimpo,
          email_login: emailLogin.trim() || null,
          email_login_vendas: emailLoginVendas.trim() || null,
          datacar_token: datacarToken.trim() || null,
          datacar_cod_emp: datacarCodEmpFinal,
          datacar_id_operador: datacarIdOperador.trim() || null,
          razao_social: razaoSocial.trim() || null,
          nome_fantasia: nomeFantasia.trim() || null,
        })
        .eq('id', empresa.id)

      if (error) throw error

      toast.success(`Empresa "${nome}" atualizada com sucesso!`)
      onSaved()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar empresa')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="bg-dark-800/80 border border-dark-700 p-6 rounded-2xl shadow-xl space-y-6 animate-fade-in backdrop-blur-sm w-full my-2" onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between border-b border-dark-700/50 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 font-bold">
            <Building2 size={20} />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">
              Editar Empresa — <span className="text-brand-300 font-extrabold">{empresa.nome}</span>
            </h3>
            <p className="text-xs text-dark-400">
              Atualize as credenciais e conexões da loja diretamente aqui
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="p-2 rounded-xl text-dark-400 hover:text-white hover:bg-dark-700 transition-colors"
          title="Fechar edição"
        >
          <X size={18} />
        </button>
      </div>

      <form onSubmit={handleSalvarInline} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* COLUNA ESQUERDA: Identidade */}
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-dark-900/40 p-1.5 rounded-xl border border-dark-700/50 shadow-inner focus-within:border-brand-500/50 focus-within:bg-dark-900/60 transition-all group">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center">
                <div className="hidden sm:block pl-4 pr-2 text-brand-500">
                  <Search size={20} className={buscandoCnpj ? 'animate-pulse' : ''} />
                </div>
                <input
                  value={cnpj}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\D/g, '').slice(0, 14)
                    const masked = raw
                      .replace(/^(\d{2})(\d)/, '$1.$2')
                      .replace(/^(\d{2}\.\d{3})(\d)/, '$1.$2')
                      .replace(/^(\d{2}\.\d{3}\.\d{3})(\d)/, '$1/$2')
                      .replace(/^(\d{2}\.\d{3}\.\d{3}\/\d{4})(\d)/, '$1-$2')
                    setCnpj(masked)
                  }}
                  placeholder="CNPJ (00.000.000/0000-00)"
                  required
                  className="flex-1 bg-transparent border-none px-4 py-3 sm:px-2 sm:text-lg text-white focus:ring-0 outline-none font-mono placeholder:text-dark-600"
                />
                <button
                  type="button"
                  onClick={handleBuscarCnpjInline}
                  disabled={buscandoCnpj || (cnpj || '').replace(/\D/g, '').length < 14}
                  className={`mt-2 sm:mt-0 sm:mr-1.5 px-6 py-3 sm:py-2.5 rounded-lg font-bold text-sm transition-all whitespace-nowrap flex items-center justify-center gap-2 ${
                    buscandoCnpj || (cnpj || '').replace(/\D/g, '').length < 14
                      ? 'bg-dark-800 text-dark-500 cursor-not-allowed'
                      : 'bg-brand-600 hover:bg-brand-500 text-white shadow-lg shadow-brand-600/20'
                  }`}
                >
                  {buscandoCnpj ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                  {buscandoCnpj ? 'Buscando...' : 'Buscar Dados'}
                </button>
              </div>
            </div>

            {dadosCnpj && (
              <div className="bg-dark-900/60 p-4 rounded-xl border border-brand-500/30 space-y-3 animate-fade-in">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-brand-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Check size={14} /> Dados Oficiais — Receita Federal
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    dadosCnpj.descricao_situacao_cadastral === 'ATIVA'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-red-500/20 text-red-400 border border-red-500/30'
                  }`}>
                    {dadosCnpj.descricao_situacao_cadastral || 'SITUAÇÃO N/D'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-[10px] text-dark-500 block">Razão Social</span>
                    <span className="text-white font-semibold block truncate" title={dadosCnpj.razao_social}>
                      {dadosCnpj.razao_social}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-dark-500 block">Nome Fantasia</span>
                    <span className="text-white font-semibold block truncate" title={dadosCnpj.nome_fantasia || 'Não informado'}>
                      {dadosCnpj.nome_fantasia || 'Não informado'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-dark-200">Nome Popular da Loja (Apelido interno)</label>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: SOFAST MATRIZ, NUFAST BARÃO, DETROIT"
                required
                className="w-full bg-dark-900/80 border border-dark-700/50 rounded-xl px-4 py-3 text-xs text-white focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 outline-none transition-all placeholder:text-dark-600 shadow-inner"
              />
            </div>

            {/* CAMPO DE FINALIDADE / SOMENTE BANCO */}
            <div className="bg-dark-900/50 p-3.5 rounded-xl border border-dark-700/60 space-y-2">
              <label className="text-xs font-bold text-white flex items-center gap-2">
                <Store size={14} className="text-amber-400" />
                Finalidade e Visibilidade no App
              </label>
              <label className="flex items-start gap-3 cursor-pointer bg-dark-900 p-3 rounded-xl border border-dark-700 hover:border-amber-500/40 transition-all group">
                <input
                  type="checkbox"
                  checked={somenteBanco}
                  onChange={(e) => setSomenteBanco(e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded text-amber-500 bg-dark-800 border-dark-600 focus:ring-amber-500/50"
                />
                <div>
                  <span className="text-xs font-semibold text-amber-400 block group-hover:text-amber-300">
                    Somente Banco (Apenas Gestão de Pagamentos)
                  </span>
                  <span className="text-[11px] text-dark-400 block leading-relaxed">
                    Marque se esta loja/banco é usada apenas para pagamentos e não necessita de integração própria de Vendas ou Contas a Pagar. Ela será ocultada dos filtros de Vendas/Financeiro para não poluir o seletor.
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* COLUNA DIREITA: Integrações */}
          <div className="lg:col-span-5 bg-dark-900/40 p-4 rounded-xl border border-dark-700/50 space-y-4 flex flex-col justify-between">
            
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <ShieldCheck size={16} className="text-brand-400" />
              Configurações de Acesso
            </h4>

            <div className="space-y-2 pt-1">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-blue-500/10 flex items-center justify-center">
                  <Mail size={12} className="text-blue-400" />
                </div>
                <label className="text-xs font-semibold text-dark-200">Conta Azul — Financeiro (Contas a Pagar)</label>
              </div>
              <input
                value={emailLogin}
                onChange={(e) => setEmailLogin(e.target.value)}
                placeholder="Deixe em branco (capturado no login do cliente)"
                type="email"
                className="w-full bg-dark-900/80 border border-dark-700/50 rounded-xl px-4 py-2.5 text-xs text-white focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all placeholder:text-dark-600 shadow-inner"
              />
            </div>

            <div className="h-px w-full bg-dark-700/30" />

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-emerald-500/10 flex items-center justify-center">
                  <Mail size={12} className="text-emerald-400" />
                </div>
                <label className="text-xs font-semibold text-dark-200">Conta Azul — Vendas (Emissão de NFe)</label>
              </div>
              <input
                value={emailLoginVendas || ''}
                onChange={(e) => setEmailLoginVendas(e.target.value)}
                placeholder="Deixe em branco (capturado no login do cliente)"
                type="email"
                className="w-full bg-dark-900/80 border border-dark-700/50 rounded-xl px-4 py-2.5 text-xs text-white focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all placeholder:text-dark-600 shadow-inner"
              />
            </div>
            
            <div className="h-px w-full bg-dark-700/30" />

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-orange-500/10 flex items-center justify-center">
                  <Unlink size={12} className="text-orange-400" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-dark-200 block">API Datacar (Opcional)</label>
                </div>
              </div>
              <div className="space-y-2 pt-1">
                <input
                  value={datacarToken}
                  onChange={(e) => setDatacarToken(e.target.value)}
                  placeholder="Token de Acesso"
                  className="w-full bg-dark-900/80 border border-dark-700/50 rounded-xl px-4 py-2.5 text-xs text-white focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 outline-none transition-all placeholder:text-dark-600 shadow-inner"
                />
              </div>
            </div>

            <div className="pt-4 mt-auto border-t border-dark-700/30 flex flex-col sm:flex-row justify-end gap-3">
              <button
                type="button"
                onClick={onCancel}
                className="bg-dark-800 hover:bg-dark-700 text-white border border-dark-600 px-4 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all text-xs"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvando}
                className="bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 disabled:opacity-50 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(var(--brand-500),0.2)] text-xs"
              >
                {salvando ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                {salvando ? 'Salvando...' : 'Salvar Empresa'}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}

function EmpresaCard({
  empresa,
  todasEmpresas,
  isAtiva,
  isEditandoInline,
  onSelect,
  onEdit,
  onDelete,
  conectando,
  onConectarContaAzul,
  onDesconectar,
  onEspelharConexao,
  onRecarregar,
}: {
  empresa: Empresa;
  todasEmpresas: Empresa[];
  isAtiva: boolean;
  isEditandoInline?: boolean;
  onSelect: () => void;
  onEdit: () => void;
  conectando: string | null;
  onConectarContaAzul: (id: string, modulo: 'financeiro' | 'vendas') => void;
  onDesconectar: (id: string, modulo: 'financeiro' | 'vendas') => void;
  onEspelharConexao: (empresaOrigemId: string, empresaDestinoId: string, modulo: 'financeiro' | 'vendas') => void;
  onDelete: () => void;
  onRecarregar: () => void;
}) {
  const caFinanceiroConectado = Boolean(empresa.access_token_conta_azul);
  const caVendasConectado = Boolean(empresa.access_token_conta_azul_vendas);
  const ehSomenteBanco = empresa.datacar_cod_emp === 'SOMENTE_BANCO' || (empresa as any).tipo_empresa === 'somente_banco' || (empresa as any).somente_banco === true

  const empresasComCaFinanceiro = todasEmpresas.filter(e => e.id !== empresa.id && Boolean(e.access_token_conta_azul || e.email_login));
  const empresasComCaVendas = todasEmpresas.filter(e => e.id !== empresa.id && Boolean(e.access_token_conta_azul_vendas || e.email_login_vendas));

  const handleToggleSomenteBancoDireto = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const novoValor = !ehSomenteBanco
    const datacarCodEmpFinal = novoValor ? 'SOMENTE_BANCO' : (empresa.datacar_cod_emp === 'SOMENTE_BANCO' ? null : empresa.datacar_cod_emp)
    try {
      const supabase = createClient()
      const { error } = await supabase.from('empresas').update({ datacar_cod_emp: datacarCodEmpFinal }).eq('id', empresa.id)
      if (error) throw error
      toast.success(novoValor ? `"${empresa.nome}" configurada como Somente Banco!` : `"${empresa.nome}" desmarcada de Somente Banco!`)
      onRecarregar()
    } catch (err: any) {
      toast.error('Erro ao atualizar Somente Banco')
    }
  }

  if (isEditandoInline) {
    return (
      <InlineEmpresaEditForm
        empresa={empresa}
        onCancel={onEdit}
        onSaved={() => {
          onEdit()
          onRecarregar()
        }}
      />
    )
  }

  return (
    <div
      onClick={onSelect}
      className={`relative group rounded-2xl p-5 sm:p-6 transition-all duration-300 cursor-pointer w-full ${
        isAtiva 
          ? 'bg-dark-800/90 border-brand-500/50 shadow-[0_0_25px_rgba(var(--brand-500),0.12)] ring-1 ring-brand-500/20' 
          : 'bg-dark-800/40 border-dark-700/50 hover:bg-dark-800/70 hover:border-dark-600/60 hover:shadow-lg'
      } border backdrop-blur-sm flex flex-col space-y-5`}
    >
      {/* 1. CABEÇALHO DA EMPRESA (Identidade + Ações Principais) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-dark-700/40">
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center flex-shrink-0 font-bold border bg-gradient-to-br ${getAvatarGradient(empresa.id)} relative group-hover:scale-105 transition-transform duration-300 shadow-md`}>
            <Store size={24} className="opacity-90 drop-shadow" />
            <span className="absolute -bottom-1 -right-1 text-[9px] font-extrabold px-1.5 py-0.2 rounded-md bg-dark-900/90 text-white border border-dark-700 font-mono shadow-sm">
              {empresa.nome.substring(0, 2).toUpperCase()}
            </span>
          </div>
          
          <div className="min-w-0">
            <h3 className="text-white font-bold text-lg leading-tight group-hover:text-brand-100 transition-colors">
              {empresa.nome}
            </h3>
            {empresa.razao_social && (
              <p className="text-dark-400 text-xs font-medium truncate max-w-[320px] mt-0.5">{empresa.razao_social}</p>
            )}
            <p className="text-dark-500 text-xs font-mono mt-0.5">{formatCNPJ(empresa.cnpj)}</p>
          </div>
        </div>

        {/* AÇÕES DE EDIÇÃO, SOMENTE BANCO E EXCLUSÃO (Canto Superior Direito) */}
        <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-center" onClick={e => e.stopPropagation()}>
          <button
            type="button"
            onClick={handleToggleSomenteBancoDireto}
            className={`px-2.5 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
              ehSomenteBanco
                ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 hover:bg-amber-500/30'
                : 'bg-dark-900/40 text-dark-400 border-dark-700/60 hover:text-white hover:border-dark-600'
            }`}
            title={ehSomenteBanco ? 'Clique para desmarcar Somente Banco' : 'Marcar como Somente Banco (Apenas Gestão de Pagamentos)'}
          >
            <Store size={13} className={ehSomenteBanco ? 'text-amber-400' : 'text-dark-400'} />
            <span>{ehSomenteBanco ? 'Somente Banco' : 'Somente Banco'}</span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onEdit();
            }}
            className="px-3 py-2 rounded-xl text-dark-300 hover:text-white hover:bg-dark-700 transition-all border border-dark-700/60 bg-dark-900/40 flex items-center gap-2 text-xs font-semibold"
            title="Editar dados da empresa inline"
          >
            <Edit size={14} />
            <span>Editar</span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onDelete();
            }}
            className="px-3 py-2 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all border border-red-500/20 bg-dark-900/40 flex items-center gap-2 text-xs font-semibold"
            title="Excluir empresa"
          >
            <Trash2 size={14} />
            <span>Excluir</span>
          </button>
        </div>
      </div>

      {/* 2. PAINEL DE INTEGRAÇÕES (Grade de 3 Colunas Espaçosas) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5" onClick={e => e.stopPropagation()}>
        
        {/* CARD 1: DATACAR */}
        <div className="bg-dark-900/50 p-3.5 rounded-xl border border-dark-700/40 flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-dark-300 flex items-center gap-1.5">
              🚗 API Datacar
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
              empresa.datacar_token 
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' 
                : 'bg-red-500/15 text-red-400 border-red-500/30'
            }`}>
              {empresa.datacar_token ? '● CONECTADO' : '● SEM CONEXÃO'}
            </span>
          </div>
          <p className="text-[11px] text-dark-500">
            {empresa.datacar_token ? 'Extrator de lançamentos ativo' : 'Aguardando credenciais'}
          </p>
        </div>

        {/* CARD 2: CONTA AZUL FINANCEIRO */}
        <div className="bg-dark-900/50 p-3.5 rounded-xl border border-dark-700/40 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-dark-300 flex items-center gap-1.5">
              💼 CA Financeiro
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
              caFinanceiroConectado 
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' 
                : 'bg-red-500/15 text-red-400 border-red-500/30'
            }`}>
              {caFinanceiroConectado ? '● CONECTADO' : '● SEM CONEXÃO'}
            </span>
          </div>

          <div className="min-h-[22px]">
            {empresa.email_login ? (
              <span className="text-[11px] text-emerald-400/90 font-mono truncate block" title={empresa.email_login}>
                {empresa.email_login}
              </span>
            ) : (
              <span className="text-[11px] text-dark-500 block">Sem e-mail capturado</span>
            )}
          </div>

          {/* Botões de Ação do CA Financeiro */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-dark-800">
            {caFinanceiroConectado ? (
              <>
                <a
                  href={`/api/conta-azul/diagnostico?empresa_id=${empresa.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2 py-1 bg-dark-800 hover:bg-dark-700 text-yellow-500 rounded text-[10px] font-bold border border-dark-700 flex items-center gap-1"
                  title="Diagnosticar Financeiro"
                >
                  <ShieldCheck size={12} />
                  Diagnóstico
                </a>
                <button
                  onClick={() => onDesconectar(empresa.id, 'financeiro')}
                  className="px-2 py-1 bg-dark-800 hover:bg-red-500/10 text-red-400 rounded text-[10px] font-bold border border-dark-700 flex items-center gap-1"
                  title="Desconectar CA Financeiro"
                >
                  <Unlink size={12} />
                  Sair
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const link = `${window.location.origin}/api/conta-azul/autorizar?empresa_id=${empresa.id}&modulo=financeiro`;
                    navigator.clipboard.writeText(link);
                    import('react-hot-toast').then((m) => m.default.success('Link do Financeiro copiado!'));
                  }}
                  className="px-2 py-1 bg-dark-800 text-dark-300 hover:text-white rounded text-[10px] font-bold border border-dark-700 flex items-center gap-1"
                  title="Copiar Link para o cliente"
                >
                  <Copy size={11} />
                  Copiar Link
                </button>
                <button
                  onClick={() => onConectarContaAzul(empresa.id, 'financeiro')}
                  disabled={conectando === `${empresa.id}:financeiro`}
                  className="px-2.5 py-1 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 rounded text-[10px] font-bold border border-blue-500/20 flex items-center gap-1"
                >
                  {conectando === `${empresa.id}:financeiro` ? <Loader2 size={11} className="animate-spin" /> : <ExternalLink size={11} />}
                  Conectar
                </button>
                {empresasComCaFinanceiro.length > 0 && (
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        onEspelharConexao(e.target.value, empresa.id, 'financeiro');
                        e.target.value = '';
                      }
                    }}
                    className="w-full mt-1 bg-dark-900 text-brand-400 hover:text-brand-300 rounded text-[10px] font-bold px-2 py-1 border border-brand-500/30 outline-none cursor-pointer"
                    defaultValue=""
                    title="Usar o mesmo login do Conta Azul de outra empresa"
                  >
                    <option value="" disabled>🔗 Usar Login de...</option>
                    {empresasComCaFinanceiro.map(other => (
                      <option key={other.id} value={other.id}>
                        {other.nome} ({other.email_login || 'Conta Azul'})
                      </option>
                    ))}
                  </select>
                )}
              </>
            )}
          </div>
        </div>

        {/* CARD 3: CONTA AZUL VENDAS */}
        <div className="bg-dark-900/50 p-3.5 rounded-xl border border-dark-700/40 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-dark-300 flex items-center gap-1.5">
              🛒 CA Vendas
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
              caVendasConectado 
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' 
                : 'bg-red-500/15 text-red-400 border-red-500/30'
            }`}>
              {caVendasConectado ? '● CONECTADO' : '● SEM CONEXÃO'}
            </span>
          </div>

          <div className="min-h-[22px]">
            {empresa.email_login_vendas ? (
              <span className="text-[11px] text-emerald-400/90 font-mono truncate block" title={empresa.email_login_vendas}>
                {empresa.email_login_vendas}
              </span>
            ) : (
              <span className="text-[11px] text-dark-500 block">Sem e-mail capturado</span>
            )}
          </div>

          {/* Botões de Ação do CA Vendas */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-dark-800">
            {caVendasConectado ? (
              <button
                onClick={() => onDesconectar(empresa.id, 'vendas')}
                className="px-2 py-1 bg-dark-800 hover:bg-red-500/10 text-red-400 rounded text-[10px] font-bold border border-dark-700 flex items-center gap-1"
                title="Desconectar CA Vendas"
              >
                <Unlink size={12} />
                Sair
              </button>
            ) : (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const link = `${window.location.origin}/api/conta-azul/autorizar?empresa_id=${empresa.id}&modulo=vendas`;
                    navigator.clipboard.writeText(link);
                    import('react-hot-toast').then((m) => m.default.success('Link de Vendas copiado!'));
                  }}
                  className="px-2 py-1 bg-dark-800 text-dark-300 hover:text-white rounded text-[10px] font-bold border border-dark-700 flex items-center gap-1"
                  title="Copiar Link para o cliente"
                >
                  <Copy size={11} />
                  Copiar Link
                </button>
                <button
                  onClick={() => onConectarContaAzul(empresa.id, 'vendas')}
                  disabled={conectando === `${empresa.id}:vendas`}
                  className="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 rounded text-[10px] font-bold border border-emerald-500/20 flex items-center gap-1"
                >
                  {conectando === `${empresa.id}:vendas` ? <Loader2 size={11} className="animate-spin" /> : <ExternalLink size={11} />}
                  Conectar
                </button>
              </>
            )}
          </div>
        </div>

      </div>

      {/* 3. SUB-SEÇÕES EXPANSÍVEIS (Gavetas de Informações Detalhadas) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-dark-700/40" onClick={e => e.stopPropagation()}>
        <PainelFichaCadastral empresa={empresa} />
        <PainelFornecedores empresa={empresa} />
      </div>
    </div>
  )
}
// --- Componente de Item em Lista Compacta (Conforme Print do Usuário) ---
function EmpresaRowItem({
  empresa,
  todasEmpresas,
  isAtiva,
  isEditandoInline,
  onSelect,
  onEdit,
  onDelete,
  conectando,
  onConectarContaAzul,
  onDesconectar,
  onEspelharConexao,
  onRecarregar,
}: {
  empresa: Empresa;
  todasEmpresas: Empresa[];
  isAtiva: boolean;
  isEditandoInline?: boolean;
  onSelect: () => void;
  onEdit: () => void;
  conectando: string | null;
  onConectarContaAzul: (id: string, modulo: 'financeiro' | 'vendas') => void;
  onDesconectar: (id: string, modulo: 'financeiro' | 'vendas') => void;
  onEspelharConexao: (empresaOrigemId: string, empresaDestinoId: string, modulo: 'financeiro' | 'vendas') => void;
  onDelete: () => void;
  onRecarregar: () => void;
}) {
  const [expandido, setExpandido] = useState(false)
  const [mostrarFicha, setMostrarFicha] = useState(false)
  const [mostrarFornecedores, setMostrarFornecedores] = useState(false)

  const caFinanceiroConectado = Boolean(empresa.access_token_conta_azul)
  const caVendasConectado = Boolean(empresa.access_token_conta_azul_vendas)
  const ehSomenteBanco = empresa.datacar_cod_emp === 'SOMENTE_BANCO' || (empresa as any).tipo_empresa === 'somente_banco' || (empresa as any).somente_banco === true

  const empresasComCaFinanceiro = todasEmpresas.filter(e => e.id !== empresa.id && Boolean(e.access_token_conta_azul || e.email_login))
  const empresasComCaVendas = todasEmpresas.filter(e => e.id !== empresa.id && Boolean(e.access_token_conta_azul_vendas || e.email_login_vendas))

  const handleToggleSomenteBancoDireto = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const novoValor = !ehSomenteBanco
    const datacarCodEmpFinal = novoValor ? 'SOMENTE_BANCO' : (empresa.datacar_cod_emp === 'SOMENTE_BANCO' ? null : empresa.datacar_cod_emp)
    try {
      const supabase = createClient()
      const { error } = await supabase.from('empresas').update({ datacar_cod_emp: datacarCodEmpFinal }).eq('id', empresa.id)
      if (error) throw error
      toast.success(novoValor ? `"${empresa.nome}" configurada como Somente Banco!` : `"${empresa.nome}" desmarcada de Somente Banco!`)
      onRecarregar()
    } catch (err: any) {
      toast.error('Erro ao atualizar Somente Banco')
    }
  }

  if (isEditandoInline) {
    return (
      <InlineEmpresaEditForm
        empresa={empresa}
        onCancel={onEdit}
        onSaved={() => {
          onEdit()
          onRecarregar()
        }}
      />
    )
  }

  return (
    <div
      className={`rounded-2xl transition-all duration-200 border overflow-hidden ${
        isAtiva
          ? 'bg-dark-800/90 border-brand-500/50 shadow-[0_0_20px_rgba(var(--brand-500),0.12)]'
          : 'bg-dark-800/40 border-dark-700/50 hover:bg-dark-800/70 hover:border-dark-600/60'
      }`}
    >
      {/* LINHA COMPACTA (Estilo idêntico ao Print do Usuário) */}
      <div
        onClick={onSelect}
        className="p-3.5 sm:p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 cursor-pointer group"
      >
        {/* ESQUERDA: Avatar + Nome + Status no App + Razão + CNPJ */}
        <div className="flex items-center gap-3 min-w-[280px]">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-extrabold text-sm border bg-gradient-to-br ${getAvatarGradient(empresa.id)} flex-shrink-0 shadow-sm`}>
            {empresa.nome.substring(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h3 className="text-white font-bold text-sm sm:text-base group-hover:text-brand-300 transition-colors">
              {empresa.nome}
            </h3>
            {empresa.razao_social && (
              <p className="text-dark-400 text-xs truncate max-w-[280px]">{empresa.razao_social}</p>
            )}
            <p className="text-dark-500 text-[11px] font-mono">{formatCNPJ(empresa.cnpj)}</p>
          </div>
        </div>

        {/* CENTRO: Pill Badges de Integração Inline (Datacar, CA Financeiro, CA Vendas + Somente Banco) */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3" onClick={e => e.stopPropagation()}>
          <button
            type="button"
            onClick={handleToggleSomenteBancoDireto}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold border transition-all cursor-pointer ${
              ehSomenteBanco
                ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 hover:bg-amber-500/30 shadow-[0_0_8px_rgba(245,158,11,0.2)]'
                : 'bg-dark-900/60 text-dark-400 border-dark-700/50 hover:text-white hover:border-dark-600'
            }`}
            title={ehSomenteBanco ? 'Clique para desmarcar Somente Banco' : 'Marcar como Somente Banco (Apenas Gestão de Pagamentos)'}
          >
            <Store size={12} className={ehSomenteBanco ? 'text-amber-400' : 'text-dark-400'} />
            <span>{ehSomenteBanco ? 'Somente Banco' : 'Somente Banco'}</span>
          </button>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-dark-900/60 border border-dark-700/40 text-[11px] font-medium text-dark-300">
            <span className={`w-2 h-2 rounded-full ${empresa.datacar_token ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]' : 'bg-red-500'}`} />
            Datacar
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-dark-900/60 border border-dark-700/40 text-[11px] font-medium text-dark-300">
            <span className={`w-2 h-2 rounded-full ${caFinanceiroConectado ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]' : 'bg-red-500'}`} />
            CA Financeiro
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-dark-900/60 border border-dark-700/40 text-[11px] font-medium text-dark-300">
            <span className={`w-2 h-2 rounded-full ${caVendasConectado ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]' : 'bg-red-500'}`} />
            CA Vendas
          </div>
        </div>

        {/* DIREITA: Pílulas de Ação + Ícones de Editar, Excluir e Chevron Expansor */}
        <div className="flex items-center gap-2 flex-shrink-0 self-end lg:self-center" onClick={e => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => {
              setMostrarFicha(!mostrarFicha)
              setExpandido(true)
            }}
            className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all ${
              mostrarFicha
                ? 'bg-brand-600/30 text-brand-300 border-brand-500/40'
                : 'bg-dark-900/50 text-dark-300 border-dark-700/50 hover:bg-dark-800 hover:text-white'
            }`}
          >
            Ficha Cadastral
          </button>

          <button
            type="button"
            onClick={() => {
              setMostrarFornecedores(!mostrarFornecedores)
              setExpandido(true)
            }}
            className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all ${
              mostrarFornecedores
                ? 'bg-brand-600/30 text-brand-300 border-brand-500/40'
                : 'bg-dark-900/50 text-dark-300 border-dark-700/50 hover:bg-dark-800 hover:text-white'
            }`}
          >
            Fornecedores
          </button>

          <button
            type="button"
            onClick={onEdit}
            className="p-1.5 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700 transition-colors border border-transparent hover:border-dark-600/50"
            title="Editar empresa"
          >
            <Edit size={14} />
          </button>

          <button
            type="button"
            onClick={onDelete}
            className="p-1.5 rounded-lg text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-colors border border-transparent hover:border-red-500/20"
            title="Excluir empresa"
          >
            <Trash2 size={14} />
          </button>

          <button
            type="button"
            onClick={() => setExpandido(!expandido)}
            className="p-1.5 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700 transition-colors border border-dark-700/40"
            title={expandido ? 'Recolher detalhes' : 'Expandir detalhes'}
          >
            {expandido ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* GAVETA EXPANSÍVEL SOB CLIQUE (Todas as funcionalidades mantidas 100%) */}
      {expandido && (
        <div className="p-4 bg-dark-900/80 border-t border-dark-700/40 space-y-4 animate-fade-in" onClick={e => e.stopPropagation()}>
          
          {/* PAINEL DE 3 INTEGRAÇÕES COM TODOS OS BOTÕES E SELETORES */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            
            {/* DATACAR */}
            <div className="bg-dark-800/60 p-3 rounded-xl border border-dark-700/50 flex flex-col justify-between space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">🚗 API Datacar</span>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                  empresa.datacar_token ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'
                }`}>
                  {empresa.datacar_token ? '● CONECTADO' : '● SEM CONEXÃO'}
                </span>
              </div>
              <p className="text-[10px] text-dark-400">
                {empresa.datacar_token ? 'Sincronização de extratos ativada' : 'Aguardando credenciais'}
              </p>
            </div>

            {/* CA FINANCEIRO */}
            <div className="bg-dark-800/60 p-3 rounded-xl border border-dark-700/50 flex flex-col justify-between space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">💼 CA Financeiro</span>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                  caFinanceiroConectado ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'
                }`}>
                  {caFinanceiroConectado ? '● CONECTADO' : '● SEM CONEXÃO'}
                </span>
              </div>

              <div className="min-h-[18px]">
                {empresa.email_login ? (
                  <span className="text-[10px] text-emerald-400 font-mono truncate block" title={empresa.email_login}>
                    {empresa.email_login}
                  </span>
                ) : (
                  <span className="text-[10px] text-dark-500 block">Sem e-mail capturado</span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-dark-700/30">
                {caFinanceiroConectado ? (
                  <>
                    <a
                      href={`/api/conta-azul/diagnostico?empresa_id=${empresa.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2 py-1 bg-dark-900 hover:bg-dark-700 text-yellow-500 rounded text-[10px] font-bold border border-dark-700 flex items-center gap-1"
                    >
                      <ShieldCheck size={11} /> Diagnóstico
                    </a>
                    <button
                      onClick={() => onDesconectar(empresa.id, 'financeiro')}
                      className="px-2 py-1 bg-dark-900 hover:bg-red-500/10 text-red-400 rounded text-[10px] font-bold border border-dark-700 flex items-center gap-1"
                    >
                      <Unlink size={11} /> Sair
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        const link = `${window.location.origin}/api/conta-azul/autorizar?empresa_id=${empresa.id}&modulo=financeiro`;
                        navigator.clipboard.writeText(link);
                        import('react-hot-toast').then((m) => m.default.success('Link do Financeiro copiado!'));
                      }}
                      className="px-2 py-1 bg-dark-900 text-dark-300 hover:text-white rounded text-[10px] font-bold border border-dark-700 flex items-center gap-1"
                    >
                      <Copy size={11} /> Link Fin
                    </button>
                    <button
                      onClick={() => onConectarContaAzul(empresa.id, 'financeiro')}
                      disabled={conectando === `${empresa.id}:financeiro`}
                      className="px-2 py-1 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 rounded text-[10px] font-bold border border-blue-500/20 flex items-center gap-1"
                    >
                      {conectando === `${empresa.id}:financeiro` ? <Loader2 size={11} className="animate-spin" /> : <ExternalLink size={11} />}
                      Conectar
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* CA VENDAS */}
            <div className="bg-dark-800/60 p-3 rounded-xl border border-dark-700/50 flex flex-col justify-between space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">🛒 CA Vendas</span>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                  caVendasConectado ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'
                }`}>
                  {caVendasConectado ? '● CONECTADO' : '● SEM CONEXÃO'}
                </span>
              </div>

              <div className="min-h-[18px]">
                {empresa.email_login_vendas ? (
                  <span className="text-[10px] text-emerald-400 font-mono truncate block" title={empresa.email_login_vendas}>
                    {empresa.email_login_vendas}
                  </span>
                ) : (
                  <span className="text-[10px] text-dark-500 block">Sem e-mail capturado</span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-dark-700/30">
                {caVendasConectado ? (
                  <button
                    onClick={() => onDesconectar(empresa.id, 'vendas')}
                    className="px-2 py-1 bg-dark-900 hover:bg-red-500/10 text-red-400 rounded text-[10px] font-bold border border-dark-700 flex items-center gap-1"
                  >
                    <Unlink size={11} /> Sair
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        const link = `${window.location.origin}/api/conta-azul/autorizar?empresa_id=${empresa.id}&modulo=vendas`;
                        navigator.clipboard.writeText(link);
                        import('react-hot-toast').then((m) => m.default.success('Link de Vendas copiado!'));
                      }}
                      className="px-2 py-1 bg-dark-900 text-dark-300 hover:text-white rounded text-[10px] font-bold border border-dark-700 flex items-center gap-1"
                    >
                      <Copy size={11} /> Link Vendas
                    </button>
                    <button
                      onClick={() => onConectarContaAzul(empresa.id, 'vendas')}
                      disabled={conectando === `${empresa.id}:vendas`}
                      className="px-2 py-1 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 rounded text-[10px] font-bold border border-emerald-500/20 flex items-center gap-1"
                    >
                      {conectando === `${empresa.id}:vendas` ? <Loader2 size={11} className="animate-spin" /> : <ExternalLink size={11} />}
                      Conectar
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* FICHA CADASTRAL EXPANDIDA */}
          {mostrarFicha && (
            <div className="pt-2 border-t border-dark-700/40">
              <PainelFichaCadastral empresa={empresa} />
            </div>
          )}

          {/* FORNECEDORES EXPANDIDOS */}
          {mostrarFornecedores && (
            <div className="pt-2 border-t border-dark-700/40">
              <PainelFornecedores empresa={empresa} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function EmpresasPageContent() {
  const { empresas, recarregar, setEmpresaAtiva, empresaAtiva } = useEmpresa()
  const [modoVisualizacao, setModoVisualizacao] = useState<'lista' | 'cards'>('lista')
  const [searchTerm, setSearchTerm] = useState('')
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
    email_login_vendas: string,
    tipo_empresa: 'vendas' | 'financeiro' | 'ambos',
    datacar_token: string,
    datacar_cod_emp: string,
    datacar_id_operador: string,
    razao_social: string,
    nome_fantasia: string,
    somente_banco: boolean,
  }>({ 
    nome: '', 
    cnpj: '', 
    email_login: '', 
    email_login_vendas: '',
    tipo_empresa: 'ambos',
    datacar_token: '',
    datacar_cod_emp: '',
    datacar_id_operador: '',
    razao_social: '',
    nome_fantasia: '',
    somente_banco: false,
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

  const handleConectarContaAzul = (empresaId: string, modulo: 'financeiro' | 'vendas' = 'financeiro') => {
    setConectando(`${empresaId}:${modulo}`)
    window.location.href = `/api/conta-azul/autorizar?empresa_id=${empresaId}&modulo=${modulo}`
  }

  const handleEspelharConexao = async (
    empresaOrigemId: string,
    empresaDestinoId: string,
    modulo: 'financeiro' | 'vendas'
  ) => {
    try {
      const res = await fetch('/api/conta-azul/espelhar-conexao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empresa_origem_id: empresaOrigemId,
          empresa_destino_id: empresaDestinoId,
          modulo
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao espelhar conexão')

      toast.success(data.message || 'Conexão espelhada com sucesso!')
      await recarregar()
    } catch (err: any) {
      console.error('[handleEspelharConexao] Erro:', err)
      toast.error(err.message || 'Erro ao espelhar conexão')
    }
  }

  const handleDesconectar = async (empresaId: string, modulo: 'financeiro' | 'vendas' = 'financeiro') => {
    const isVendas = modulo === 'vendas'
    if (!confirm(`Tem certeza que deseja desconectar a Conta Azul (${isVendas ? 'Vendas' : 'Financeiro'}) desta empresa?`)) return
    try {
      const updateData = isVendas ? {
        access_token_conta_azul_vendas: null,
        refresh_token_conta_azul_vendas: null,
        data_expiracao_token_vendas: null,
        conta_azul_vendas_connected: false,
      } : {
        access_token_conta_azul: null,
        refresh_token_conta_azul: null,
        data_expiracao_token: null,
        conta_azul_connected: false,
      }

      const { error } = await supabase
        .from('empresas')
        .update(updateData)
        .eq('id', empresaId)

      if (error) throw error
      toast.success(`Conta Azul (${isVendas ? 'Vendas' : 'Financeiro'}) desconectado.`)
      await recarregar()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao desconectar')
    }
  }

  const handleExcluirEmpresa = async (empresaId: string) => {
    if (!confirm('ATENÇÃO: Tem certeza que deseja excluir esta empresa? Todos os dados vinculados a ela serão permanentemente excluídos.')) return
    try {
      const res = await fetch('/api/empresas/excluir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresa_id: empresaId })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao excluir empresa')

      toast.success('Empresa excluída com sucesso!')
      await recarregar()
    } catch (err: unknown) {
      console.error('[handleExcluirEmpresa] Erro:', err)
      toast.error(err instanceof Error ? err.message : 'Erro ao excluir a empresa')
    }
  }

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault()
    setSalvando(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Usuário não autenticado')

      const cnpjLimpo = (form.cnpj || '').replace(/\D/g, '')
      const razaoSocialFinal = form.razao_social.trim() || null
      const nomeFantasiaFinal = form.nome_fantasia.trim() || null

      const datacarCodEmpFinal = form.somente_banco 
        ? 'SOMENTE_BANCO' 
        : (form.datacar_cod_emp.trim() === 'SOMENTE_BANCO' ? null : form.datacar_cod_emp.trim() || null)

      const payload = {
        nome: form.nome.trim(),
        cnpj: cnpjLimpo,
        email_login: form.email_login.trim() || null,
        email_login_vendas: form.email_login_vendas.trim() || null,
        tipo_empresa: form.tipo_empresa,
        datacar_token: form.datacar_token.trim() || null,
        datacar_cod_emp: datacarCodEmpFinal,
        datacar_id_operador: form.datacar_id_operador.trim() || null,
        razao_social: razaoSocialFinal,
        nome_fantasia: nomeFantasiaFinal,
      }

      if (editingId) {
        // Atualiza a empresa existente
        const { error: errEmp } = await supabase
          .from('empresas')
          .update(payload)
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
            created_by: user.id,
            ...payload
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

      setForm({ nome: '', cnpj: '', email_login: '', email_login_vendas: '', tipo_empresa: 'ambos', datacar_token: '', datacar_cod_emp: '', datacar_id_operador: '', razao_social: '', nome_fantasia: '', somente_banco: false })
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

  const handleCriarVazio = async () => {
    setSalvando(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Usuário não autenticado')

      const empresaId = crypto.randomUUID()

      const { error: errEmp } = await supabase
        .from('empresas')
        .insert({
          id: empresaId,
          nome: 'Aguardando Conexão...',
          cnpj: '00000000000000',
          created_by: user.id,
          tipo_empresa: 'ambos',
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

      toast.success('Card em branco criado! Copie o link e envie ao cliente.')
      setForm({ nome: '', cnpj: '', email_login: '', email_login_vendas: '', tipo_empresa: 'ambos', datacar_token: '', datacar_cod_emp: '', datacar_id_operador: '', razao_social: '', nome_fantasia: '', somente_banco: false })
      setDadosCnpj(null)
      setEditingId(null)
      setShowForm(false)
      await recarregar()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao criar card em branco'
      toast.error(msg)
    } finally {
      setSalvando(false)
    }
  }

  const handleBuscarCnpj = async () => {
    const cnpjLimpo = (form.cnpj || '').replace(/\D/g, '')
    if (cnpjLimpo.length !== 14) {
      toast.error('CNPJ inválido. Digite os 14 dígitos.')
      return
    }
    setBuscandoCnpj(true)
    try {
      const dados = await buscarCnpj(cnpjLimpo)
      if (!dados) {
        toast.error('CNPJ não encontrado na base de dados pública da Receita. Verifique o número digitado.')
        setDadosCnpj(null)
        return
      }
      setDadosCnpj(dados)
      setForm(prev => ({
        ...prev,
        cnpj: formatCNPJ(cnpjLimpo),
        nome: prev.nome.trim() ? prev.nome : (dados.nome_fantasia || dados.razao_social || ''),
        razao_social: dados.razao_social || '',
        nome_fantasia: dados.nome_fantasia || '',
      }))
      toast.success('Dados da empresa localizados com sucesso!')
    } catch (e) {
      console.error('[handleBuscarCnpj] Erro:', e)
      toast.error('Erro ao consultar a base de CNPJ. Tente novamente.')
    } finally {
      setBuscandoCnpj(false)
    }
  }

  const handleEditClick = (empresa: Empresa) => {
    if (editingId === empresa.id) {
      setEditingId(null)
    } else {
      setEditingId(empresa.id)
      setShowForm(false)
    }
  }

  const empresasFiltradas = empresas.filter(emp => {
    if (!searchTerm.trim()) return true
    const term = searchTerm.toLowerCase().trim()
    const nomeMatch = (emp.nome || '').toLowerCase().includes(term)
    const cnpjMatch = (emp.cnpj || '').replace(/\D/g, '').includes(term.replace(/\D/g, ''))
    const razaoMatch = (emp.razao_social || '').toLowerCase().includes(term)
    return nomeMatch || cnpjMatch || razaoMatch
  })

  const integracoesConectadasCount = empresas.filter(e => e.datacar_token || e.access_token_conta_azul || e.access_token_conta_azul_vendas).length
  const semConexaoCount = empresas.filter(e => !e.datacar_token && !e.access_token_conta_azul && !e.access_token_conta_azul_vendas).length

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      
      {/* CABEÇALHO DA PÁGINA */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Empresas & Integrações</h1>
        <p className="text-xs text-dark-400 mt-1">
          Gerencie conexões (Datacar, ContaAzul) e dados cadastrais de cada empresa do portfólio.
        </p>
      </div>

      {/* BALÕES COMPACTOS DE KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-dark-800/50 border border-dark-700/40 rounded-xl px-4 py-2.5 flex items-center justify-between">
          <span className="text-xs text-dark-400 font-medium">Empresas cadastradas</span>
          <span className="text-lg sm:text-xl font-bold text-white font-mono">{empresas.length}</span>
        </div>
        <div className="bg-dark-800/50 border border-dark-700/40 rounded-xl px-4 py-2.5 flex items-center justify-between">
          <span className="text-xs text-dark-400 font-medium">Integrações conectadas</span>
          <span className="text-lg sm:text-xl font-bold text-emerald-400 font-mono">{integracoesConectadasCount}</span>
        </div>
        <div className="bg-dark-800/50 border border-dark-700/40 rounded-xl px-4 py-2.5 flex items-center justify-between">
          <span className="text-xs text-dark-400 font-medium">Sem conexão</span>
          <span className="text-lg sm:text-xl font-bold text-red-400 font-mono">{semConexaoCount}</span>
        </div>
      </div>

      {/* BARRA DE PESQUISA, ALTERNADOR DE MODO E BOTÃO NOVA EMPRESA */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Campo de Busca */}
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-dark-400" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por empresa, CNPJ ou razão social..."
            className="w-full bg-dark-900/60 border border-dark-700/50 rounded-xl pl-11 pr-4 py-2.5 text-xs text-white placeholder:text-dark-500 focus:outline-none focus:border-brand-500/50 transition-all"
          />
        </div>

        <div className="flex items-center gap-3">
          {/* Alternador Lista Compacta vs Cards */}
          <div className="bg-dark-900/80 p-1 rounded-xl border border-dark-700/50 flex items-center gap-1">
            <button
              onClick={() => setModoVisualizacao('lista')}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                modoVisualizacao === 'lista'
                  ? 'bg-brand-600 text-white shadow-md'
                  : 'text-dark-400 hover:text-white'
              }`}
            >
              <span>☰ Lista compacta</span>
            </button>
            <button
              onClick={() => setModoVisualizacao('cards')}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                modoVisualizacao === 'cards'
                  ? 'bg-brand-600 text-white shadow-md'
                  : 'text-dark-400 hover:text-white'
              }`}
            >
              <span>▦ Cards</span>
            </button>
          </div>

          {/* Botão Nova Empresa */}
          <button
            onClick={() => {
              setShowForm(!showForm)
              if (!showForm) {
                setEditingId(null)
                setDadosCnpj(null)
                setForm({
                  nome: '', cnpj: '', email_login: '', email_login_vendas: '', tipo_empresa: 'ambos',
                  datacar_token: '', datacar_cod_emp: '', datacar_id_operador: '',
                  razao_social: '', nome_fantasia: '', somente_banco: false
                })
              }
            }}
            className="bg-brand-600 hover:bg-brand-500 text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow-lg shadow-brand-600/20 transition-all whitespace-nowrap flex items-center gap-2"
          >
            <Plus size={16} />
            <span>+ Nova empresa</span>
          </button>
        </div>
      </div>

      {/* FORMULÁRIO EXPANSÍVEL DE CADASTRO E EDIÇÃO */}
      {showForm && (
        <div className="bg-dark-800/80 border border-dark-700 p-6 rounded-2xl shadow-xl space-y-6 animate-fade-in backdrop-blur-sm">
          <div className="flex items-center justify-between border-b border-dark-700/50 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 font-bold">
                <Building2 size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  {editingId ? 'Editar Empresa' : 'Cadastrar Nova Empresa'}
                </h3>
                <p className="text-xs text-dark-400">
                  {editingId ? 'Atualize as credenciais e conexões da loja' : 'Digite o CNPJ para buscar os dados oficiais da Receita Federal'}
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setShowForm(false)
                setEditingId(null)
              }}
              className="p-2 rounded-xl text-dark-400 hover:text-white hover:bg-dark-700 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSalvar} className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* COLUNA ESQUERDA: Identidade */}
              <div className="lg:col-span-7 space-y-6">
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
                      disabled={buscandoCnpj || (form.cnpj || '').replace(/\D/g, '').length < 14}
                      className={`mt-2 sm:mt-0 sm:mr-1.5 px-6 py-3 sm:py-2.5 rounded-lg font-bold text-sm transition-all whitespace-nowrap flex items-center justify-center gap-2 ${
                        buscandoCnpj || (form.cnpj || '').replace(/\D/g, '').length < 14
                          ? 'bg-dark-800 text-dark-500 cursor-not-allowed'
                          : 'bg-brand-600 hover:bg-brand-500 text-white shadow-lg shadow-brand-600/20'
                      }`}
                    >
                      {buscandoCnpj ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                      {buscandoCnpj ? 'Buscando...' : 'Buscar Dados'}
                    </button>
                  </div>
                </div>

                {dadosCnpj && (
                  <div className="bg-dark-900/60 p-4 rounded-xl border border-brand-500/30 space-y-3 animate-fade-in">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-brand-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Check size={14} /> Dados Oficiais — Receita Federal
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        dadosCnpj.descricao_situacao_cadastral === 'ATIVA'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-red-500/20 text-red-400 border border-red-500/30'
                      }`}>
                        {dadosCnpj.descricao_situacao_cadastral || 'SITUAÇÃO N/D'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[10px] text-dark-500 block">Razão Social</span>
                        <span className="text-white font-semibold block truncate" title={dadosCnpj.razao_social}>
                          {dadosCnpj.razao_social}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-dark-500 block">Nome Fantasia</span>
                        <span className="text-white font-semibold block truncate" title={dadosCnpj.nome_fantasia || 'Não informado'}>
                          {dadosCnpj.nome_fantasia || 'Não informado'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                  <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-dark-200">Nome Popular da Loja (Apelido interno)</label>
                  <input
                    value={form.nome}
                    onChange={(e) => setForm({ ...form, nome: e.target.value })}
                    placeholder="Ex: SOFAST MATRIZ, NUFAST BARÃO, DETROIT"
                    required
                    className="w-full bg-dark-900/80 border border-dark-700/50 rounded-xl px-4 py-3 text-xs text-white focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 outline-none transition-all placeholder:text-dark-600 shadow-inner"
                  />
                </div>

                {/* CAMPO DE FINALIDADE / SOMENTE BANCO */}
                <div className="bg-dark-900/50 p-3.5 rounded-xl border border-dark-700/60 space-y-2">
                  <label className="text-xs font-bold text-white flex items-center gap-2">
                    <Store size={14} className="text-amber-400" />
                    Finalidade e Visibilidade no App
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer bg-dark-900 p-3 rounded-xl border border-dark-700 hover:border-amber-500/40 transition-all group">
                    <input
                      type="checkbox"
                      checked={form.somente_banco}
                      onChange={(e) => setForm({ ...form, somente_banco: e.target.checked })}
                      className="w-4 h-4 mt-0.5 rounded text-amber-500 bg-dark-800 border-dark-600 focus:ring-amber-500/50"
                    />
                    <div>
                      <span className="text-xs font-semibold text-amber-400 block group-hover:text-amber-300">
                        Somente Banco (Apenas Gestão de Pagamentos)
                      </span>
                      <span className="text-[11px] text-dark-400 block leading-relaxed">
                        Marque se esta loja/banco é usada apenas para pagamentos e não necessita de integração própria de Vendas ou Contas a Pagar. Ela será ocultada dos filtros de Vendas/Financeiro para não poluir o seletor.
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              {/* COLUNA DIREITA: Integrações */}
              <div className="lg:col-span-5 bg-dark-900/40 p-4 rounded-xl border border-dark-700/50 space-y-4 flex flex-col justify-between">
                
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <ShieldCheck size={16} className="text-brand-400" />
                  Configurações de Acesso
                </h4>

                <div className="space-y-2 pt-1">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded bg-blue-500/10 flex items-center justify-center">
                      <Mail size={12} className="text-blue-400" />
                    </div>
                    <label className="text-xs font-semibold text-dark-200">Conta Azul — Financeiro (Contas a Pagar)</label>
                  </div>
                  <input
                    value={form.email_login}
                    onChange={(e) => setForm({ ...form, email_login: e.target.value })}
                    placeholder="Deixe em branco (capturado no login do cliente)"
                    type="email"
                    className="w-full bg-dark-900/80 border border-dark-700/50 rounded-xl px-4 py-2.5 text-xs text-white focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all placeholder:text-dark-600 shadow-inner"
                  />
                </div>

                <div className="h-px w-full bg-dark-700/30" />

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded bg-emerald-500/10 flex items-center justify-center">
                      <Mail size={12} className="text-emerald-400" />
                    </div>
                    <label className="text-xs font-semibold text-dark-200">Conta Azul — Vendas (Emissão de NFe)</label>
                  </div>
                  <input
                    value={form.email_login_vendas || ''}
                    onChange={(e) => setForm({ ...form, email_login_vendas: e.target.value })}
                    placeholder="Deixe em branco (capturado no login do cliente)"
                    type="email"
                    className="w-full bg-dark-900/80 border border-dark-700/50 rounded-xl px-4 py-2.5 text-xs text-white focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all placeholder:text-dark-600 shadow-inner"
                  />
                </div>
                
                <div className="h-px w-full bg-dark-700/30" />

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded bg-orange-500/10 flex items-center justify-center">
                      <Unlink size={12} className="text-orange-400" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-dark-200 block">API Datacar (Opcional)</label>
                    </div>
                  </div>
                  <div className="space-y-2 pt-1">
                    <input
                      value={form.datacar_token}
                      onChange={(e) => setForm({ ...form, datacar_token: e.target.value })}
                      placeholder="Token de Acesso"
                      className="w-full bg-dark-900/80 border border-dark-700/50 rounded-xl px-4 py-2.5 text-xs text-white focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 outline-none transition-all placeholder:text-dark-600 shadow-inner"
                    />
                  </div>
                </div>

                <div className="pt-4 mt-auto border-t border-dark-700/30 flex flex-col sm:flex-row gap-3">
                  {!editingId && (
                    <button
                      type="button"
                      onClick={handleCriarVazio}
                      disabled={salvando}
                      className="flex-1 bg-dark-800 hover:bg-dark-700 disabled:opacity-50 text-white border border-dark-600 px-4 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all text-xs"
                    >
                      {salvando ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                      Criar Vazio (Link)
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={salvando}
                    className="flex-1 bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 disabled:opacity-50 text-white px-4 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(var(--brand-500),0.2)] text-xs"
                  >
                    {salvando ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                    {salvando ? 'Salvando...' : 'Salvar Empresa'}
                  </button>
                </div>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* CABEÇALHO PADRONIZADO DAS COLUNAS */}
      {modoVisualizacao === 'lista' && empresasFiltradas.length > 0 && (
        <div className="hidden lg:flex items-center justify-between px-5 py-2.5 bg-dark-900/60 rounded-xl border border-dark-700/40 text-[11px] font-bold text-dark-400 uppercase tracking-wider select-none mb-1">
          <div className="min-w-[280px]">Empresa / CNPJ</div>
          <div className="text-center flex-1">Status das Integrações</div>
          <div className="text-right flex-shrink-0 min-w-[240px]">Ações & Ficha Cadastral</div>
        </div>
      )}

      {/* RENDERIZAÇÃO DA LISTA DE EMPRESAS (Lista Compacta ou Cards) */}
      {modoVisualizacao === 'lista' ? (
        <div className="space-y-3 w-full">
          {empresasFiltradas.map((empresa) => {
            const isAtiva = empresaAtiva?.id === empresa.id;
            return (
              <EmpresaRowItem
                key={empresa.id}
                empresa={empresa}
                todasEmpresas={empresas}
                isAtiva={isAtiva}
                isEditandoInline={editingId === empresa.id}
                onSelect={() => setEmpresaAtiva(empresa)}
                onEdit={() => handleEditClick(empresa)}
                onDelete={() => handleExcluirEmpresa(empresa.id)}
                conectando={conectando}
                onConectarContaAzul={handleConectarContaAzul}
                onDesconectar={handleDesconectar}
                onEspelharConexao={handleEspelharConexao}
                onRecarregar={recarregar}
              />
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
          {empresasFiltradas.map((empresa) => {
            const isAtiva = empresaAtiva?.id === empresa.id;
            return (
              <EmpresaCard
                key={empresa.id}
                empresa={empresa}
                todasEmpresas={empresas}
                isAtiva={isAtiva}
                isEditandoInline={editingId === empresa.id}
                onSelect={() => setEmpresaAtiva(empresa)}
                onEdit={() => handleEditClick(empresa)}
                onDelete={() => handleExcluirEmpresa(empresa.id)}
                conectando={conectando}
                onConectarContaAzul={handleConectarContaAzul}
                onDesconectar={handleDesconectar}
                onEspelharConexao={handleEspelharConexao}
                onRecarregar={recarregar}
              />
            );
          })}
        </div>
      )}

      {empresasFiltradas.length === 0 && !showForm && (
        <div className="py-20 flex flex-col items-center justify-center border-2 border-dashed border-dark-700 rounded-2xl">
          <Building2 size={48} className="text-dark-700 mb-4" />
          <p className="text-dark-400">Nenhuma empresa encontrada.</p>
          <button
            onClick={() => setShowForm(true)}
            className="text-brand-400 font-semibold mt-2 hover:text-brand-300 transition-colors"
          >
            Cadastrar agora
          </button>
        </div>
      )}
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
