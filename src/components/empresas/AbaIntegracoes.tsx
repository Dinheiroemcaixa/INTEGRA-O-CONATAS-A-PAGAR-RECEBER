'use client'

import React, { useState } from 'react'
import { Empresa } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { 
  Database, 
  CreditCard, 
  ShoppingBag, 
  FileText, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  MessageSquare, 
  ExternalLink, 
  Save, 
  Loader2, 
  Sparkles, 
  RefreshCw,
  Power,
  ChevronRight
} from 'lucide-react'
import toast from 'react-hot-toast'

interface AbaIntegracoesProps {
  empresa: Empresa
  onUpdated: (empresaAtualizada: Empresa) => void
  onConectarContaAzul: (empresaId: string, modulo: 'financeiro' | 'vendas') => void
  onDesconectarContaAzul: (empresaId: string, modulo: 'financeiro' | 'vendas') => void
  onCopiarWhatsApp: (modulo: 'financeiro' | 'vendas') => void
  onIrParaAbaFiscal: () => void
}

export function AbaIntegracoes({
  empresa,
  onUpdated,
  onConectarContaAzul,
  onDesconectarContaAzul,
  onCopiarWhatsApp,
  onIrParaAbaFiscal
}: AbaIntegracoesProps) {
  const supabase = createClient()

  // Estados Datacar
  const [datacarToken, setDatacarToken] = useState(empresa.datacar_token || '')
  const [datacarCodEmp, setDatacarCodEmp] = useState(empresa.datacar_cod_emp || '')
  const [datacarIdOperador, setDatacarIdOperador] = useState(empresa.datacar_id_operador || '')
  const [salvandoDatacar, setSalvandoDatacar] = useState(false)
  const [testandoDatacar, setTestandoDatacar] = useState(false)
  const [statusDatacar, setStatusDatacar] = useState<string | null>(null)

  // Estados Conta Azul
  const [emailLogin, setEmailLogin] = useState(empresa.email_login || '')
  const [emailLoginVendas, setEmailLoginVendas] = useState(empresa.email_login_vendas || '')
  const [salvandoEmails, setSalvandoEmails] = useState(false)

  const isSomenteBanco = (empresa.datacar_cod_emp || '').endsWith('_sb')
  const hasDatacar = !!(empresa.datacar_token && empresa.datacar_cod_emp && empresa.datacar_id_operador)
  const hasCaFin = !!(empresa.conta_azul_connected || empresa.access_token_conta_azul)
  const hasCaVendas = !!(empresa.conta_azul_vendas_connected || empresa.access_token_conta_azul_vendas)
  const hasNfse = !!(empresa.emite_nfse || empresa.optante_simples)

  // Salvar credenciais Datacar
  const handleSalvarDatacar = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setSalvandoDatacar(true)
    try {
      const { data, error } = await supabase
        .from('empresas')
        .update({
          datacar_token: datacarToken.trim() || null,
          datacar_cod_emp: datacarCodEmp.trim() || null,
          datacar_id_operador: datacarIdOperador.trim() || null,
        })
        .eq('id', empresa.id)
        .select()
        .single()

      if (error) throw error

      toast.success('Credenciais do Datacar salvas com sucesso!')
      if (data) onUpdated(data)
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar credenciais do Datacar')
    } finally {
      setSalvandoDatacar(false)
    }
  }

  // Toggle Somente Banco Direto
  const handleToggleSomenteBanco = async () => {
    const atual = (empresa.datacar_cod_emp || '')
    let novo = ''
    if (atual.endsWith('_sb')) {
      novo = atual.replace(/_sb$/, '')
    } else {
      novo = atual ? `${atual}_sb` : '_sb'
    }

    try {
      const { data, error } = await supabase
        .from('empresas')
        .update({ datacar_cod_emp: novo })
        .eq('id', empresa.id)
        .select()
        .single()

      if (error) throw error

      setDatacarCodEmp(novo)
      toast.success(novo.endsWith('_sb') ? 'Modo Somente Banco ativado!' : 'Modo Somente Banco desativado!')
      if (data) onUpdated(data)
    } catch (err: any) {
      toast.error(err.message || 'Erro ao alternar modo Somente Banco')
    }
  }

  // Testar Conexão Datacar
  const handleTestarDatacar = async () => {
    setTestandoDatacar(true)
    setStatusDatacar(null)
    try {
      const res = await fetch('/api/datacar/testar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresa_id: empresa.id }),
      })
      const json = await res.json()
      if (res.ok && json.ok) {
        setStatusDatacar('Conexão realizada com sucesso!')
        toast.success('Conexão com a API Datacar homologada com sucesso!')
      } else {
        setStatusDatacar(json.mensagem || json.error || 'Erro na conexão com Datacar')
        toast.error(json.mensagem || json.error || 'Falha ao testar Datacar')
      }
    } catch (err: any) {
      setStatusDatacar('Erro ao conectar ao servidor Datacar')
      toast.error(err.message || 'Erro ao testar Datacar')
    } finally {
      setTestandoDatacar(false)
    }
  }

  // Salvar E-mails do Conta Azul
  const handleSalvarEmails = async () => {
    setSalvandoEmails(true)
    try {
      const { data, error } = await supabase
        .from('empresas')
        .update({
          email_login: emailLogin.trim() || null,
          email_login_vendas: emailLoginVendas.trim() || null,
        })
        .eq('id', empresa.id)
        .select()
        .single()

      if (error) throw error

      toast.success('E-mails do Conta Azul salvos com sucesso!')
      if (data) onUpdated(data)
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar e-mails')
    } finally {
      setSalvandoEmails(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* 1. CARD INDEPENDENTE: DATACAR ERP */}
      <div className="bg-dark-850/80 border border-dark-700/60 rounded-xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-dark-700/50 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Database size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-white text-base">Datacar ERP</h4>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${
                  hasDatacar 
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' 
                    : 'bg-red-500/15 text-red-400 border-red-500/30'
                }`}>
                  {hasDatacar ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
                  {hasDatacar ? 'Configurado' : 'Pendente'}
                </span>
              </div>
              <p className="text-[13px] text-dark-400 mt-0.5">Sincronização de Ordens de Serviço, Vendas e Títulos a Pagar</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleSomenteBanco}
              className={`px-3 py-1.5 rounded-xl border text-xs font-medium transition-all flex items-center gap-1.5 ${
                isSomenteBanco
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                  : 'bg-dark-900 border-dark-700 text-dark-400 hover:text-white'
              }`}
              title="Ativar quando as vendas não devem passar por movimentação de caixa físico"
            >
              <span>Somente Banco:</span>
              <span className="font-bold">{isSomenteBanco ? 'ATIVADO' : 'DESATIVADO'}</span>
            </button>
          </div>
        </div>

        {/* Inputs de Credenciais Datacar */}
        <form onSubmit={handleSalvarDatacar} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-3">
              <label className="block text-sm font-medium text-dark-200 mb-1.5">
                Token da Empresa (Datalog)
              </label>
              <input
                type="text"
                value={datacarToken}
                onChange={(e) => setDatacarToken(e.target.value)}
                placeholder="Ex: R4ip8lHo0X4R7wr1R3XC0f9kykW..."
                className="w-full h-10 bg-dark-900 border border-dark-700 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 rounded-lg px-3.5 text-white text-sm font-mono outline-none transition-all placeholder:text-dark-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-200 mb-1.5">
                Código Empresa (codEmp)
              </label>
              <input
                type="text"
                value={datacarCodEmp}
                onChange={(e) => setDatacarCodEmp(e.target.value)}
                placeholder="Ex: 1162"
                className="w-full h-10 bg-dark-900 border border-dark-700 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 rounded-lg px-3.5 text-white text-sm font-mono outline-none transition-all placeholder:text-dark-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-200 mb-1.5">
                ID do Operador (idOperador)
              </label>
              <input
                type="text"
                value={datacarIdOperador}
                onChange={(e) => setDatacarIdOperador(e.target.value)}
                placeholder="Ex: 21331"
                className="w-full h-10 bg-dark-900 border border-dark-700 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 rounded-lg px-3.5 text-white text-sm font-mono outline-none transition-all placeholder:text-dark-500"
              />
            </div>

            <div className="flex items-end gap-2">
              <button
                type="submit"
                disabled={salvandoDatacar}
                className="w-full h-10 px-4 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 shadow-sm"
              >
                {salvandoDatacar ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                <span>Salvar</span>
              </button>
            </div>
          </div>
        </form>

        {/* Rodapé Datacar: Botão Testar Conexão */}
        <div className="pt-2 flex items-center justify-between flex-wrap gap-2 text-xs">
          <button
            type="button"
            onClick={handleTestarDatacar}
            disabled={testandoDatacar || !hasDatacar}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-900 hover:bg-dark-700 disabled:opacity-40 text-emerald-400 rounded-xl border border-emerald-500/30 text-xs font-medium transition-colors"
          >
            {testandoDatacar ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            <span>{testandoDatacar ? 'Testando conexão...' : 'Testar Conexão Datacar'}</span>
          </button>

          {statusDatacar && (
            <span className={`text-xs ${statusDatacar.includes('sucesso') ? 'text-emerald-400' : 'text-red-400'}`}>
              {statusDatacar}
            </span>
          )}
        </div>
      </div>

      {/* 2. CARD INDEPENDENTE: CONTA AZUL FINANCEIRO */}
      <div className="bg-dark-850/80 border border-dark-700/60 rounded-xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-dark-700/50 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <CreditCard size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-white text-base">Conta Azul — Financeiro</h4>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${
                  hasCaFin 
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' 
                    : 'bg-red-500/15 text-red-400 border-red-500/30'
                }`}>
                  {hasCaFin ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
                  {hasCaFin ? 'Conectado' : 'Desconectado'}
                </span>
              </div>
              <p className="text-[13px] text-dark-400 mt-0.5">Sincronização de Contas a Pagar, Fornecedores e Conciliação Bancária</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onCopiarWhatsApp('financeiro')}
              title="Copiar mensagem com link de autorização para o cliente"
              className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5"
            >
              <MessageSquare size={13} />
              <span>Link WhatsApp</span>
            </button>
          </div>
        </div>

        {/* Input de E-mail de Login do CA Financeiro */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-dark-200 mb-1.5">
              E-mail da Conta no Conta Azul Financeiro
            </label>
            <input
              type="email"
              value={emailLogin}
              onChange={(e) => setEmailLogin(e.target.value)}
              placeholder="financeiro@empresa.com.br"
              className="w-full h-10 bg-dark-900 border border-dark-700 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 rounded-lg px-3.5 text-white text-sm outline-none transition-all placeholder:text-dark-500"
            />
          </div>

          <button
            type="button"
            onClick={handleSalvarEmails}
            disabled={salvandoEmails}
            className="py-2 px-3 bg-dark-700 hover:bg-dark-600 text-white rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-1.5 border border-dark-600"
          >
            {salvandoEmails ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            <span>Salvar E-mail</span>
          </button>
        </div>

        {/* Ações de Conexão OAuth */}
        <div className="pt-2 flex items-center justify-between flex-wrap gap-2 text-xs border-t border-dark-700/50">
          <div className="text-dark-400 text-xs">
            {hasCaFin ? (
              <span className="text-emerald-400 font-medium flex items-center gap-1">
                <CheckCircle2 size={13} /> Token OAuth sincronizado e ativo
              </span>
            ) : (
              <span className="text-dark-400">Clique em conectar para autorizar o acesso à API.</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {hasCaFin && (
              <button
                type="button"
                onClick={() => onDesconectarContaAzul(empresa.id, 'financeiro')}
                className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5"
              >
                <Power size={13} />
                <span>Desconectar</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onConectarContaAzul(empresa.id, 'financeiro')}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <ExternalLink size={13} />
              <span>{hasCaFin ? 'Reconectar Financeiro' : 'Conectar Conta Azul Financeiro'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. CARD INDEPENDENTE: CONTA AZUL VENDAS */}
      <div className="bg-dark-850/80 border border-dark-700/60 rounded-xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-dark-700/50 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <ShoppingBag size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-white text-base">Conta Azul — Vendas & NF-e</h4>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${
                  hasCaVendas 
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' 
                    : 'bg-dark-700 text-dark-400 border-dark-600'
                }`}>
                  {hasCaVendas ? <CheckCircle2 size={11} /> : <AlertCircle size={11} />}
                  {hasCaVendas ? 'Conectado' : 'Desconectado'}
                </span>
              </div>
              <p className="text-[13px] text-dark-400 mt-0.5">Exportação de Pedidos de Venda de Produtos e Clientes para o Conta Azul</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onCopiarWhatsApp('vendas')}
              title="Copiar mensagem com link de autorização de vendas"
              className="px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5"
            >
              <MessageSquare size={13} />
              <span>Link WhatsApp</span>
            </button>
          </div>
        </div>

        {/* Input de E-mail de Login do CA Vendas */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-dark-200 mb-1.5">
              E-mail da Conta no Conta Azul Vendas
            </label>
            <input
              type="email"
              value={emailLoginVendas}
              onChange={(e) => setEmailLoginVendas(e.target.value)}
              placeholder="vendas@empresa.com.br"
              className="w-full bg-dark-900 border border-dark-600 rounded-xl px-3.5 py-2 text-white text-xs focus:ring-2 focus:ring-purple-500/50 outline-none transition-all placeholder:text-dark-600"
            />
          </div>

          <button
            type="button"
            onClick={handleSalvarEmails}
            disabled={salvandoEmails}
            className="py-2 px-3 bg-dark-700 hover:bg-dark-600 text-white rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-1.5 border border-dark-600"
          >
            {salvandoEmails ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            <span>Salvar E-mail</span>
          </button>
        </div>

        {/* Ações OAuth Vendas */}
        <div className="pt-2 flex items-center justify-between flex-wrap gap-2 text-xs border-t border-dark-700/50">
          <div className="text-dark-400 text-xs">
            {hasCaVendas ? (
              <span className="text-emerald-400 font-medium flex items-center gap-1">
                <CheckCircle2 size={13} /> Conexão de Vendas homologada
              </span>
            ) : (
              <span className="text-dark-400">Conecte para habilitar a emissão de vendas para esta filial.</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {hasCaVendas && (
              <button
                type="button"
                onClick={() => onDesconectarContaAzul(empresa.id, 'vendas')}
                className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5"
              >
                <Power size={13} />
                <span>Desconectar</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onConectarContaAzul(empresa.id, 'vendas')}
              className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <ExternalLink size={13} />
              <span>{hasCaVendas ? 'Reconectar Vendas' : 'Conectar Conta Azul Vendas'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4. CARD INDEPENDENTE: NFS-e GOV.BR (RESUMO) */}
      <div className="bg-dark-800/80 border border-dark-700/70 rounded-2xl p-5 sm:p-6 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-400">
            <FileText size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-semibold text-white text-base">NFS-e Gov.br (Emissão Municipal)</h4>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${
                hasNfse 
                  ? 'bg-teal-500/15 text-teal-400 border-teal-500/30' 
                  : 'bg-dark-700 text-dark-400 border-dark-600'
              }`}>
                {hasNfse ? <CheckCircle2 size={11} /> : <AlertCircle size={11} />}
                {hasNfse ? 'Emissão Habilitada' : 'Inativa'}
              </span>
            </div>
            <p className="text-[13px] text-dark-400 mt-0.5">Assinatura digital e transmissão de notas de serviço para o portal nacional Gov.br</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onIrParaAbaFiscal}
          className="px-4 py-2 bg-dark-900 hover:bg-dark-700 text-teal-300 border border-teal-500/30 rounded-xl text-xs font-semibold transition-colors flex items-center gap-2"
        >
          <span>Configurar Certificado e Alíquotas</span>
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}
