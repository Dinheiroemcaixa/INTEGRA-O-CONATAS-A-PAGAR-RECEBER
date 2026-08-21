'use client'

import { useEmpresa } from '@/contexts/EmpresaContext'
import { useAppConfig } from '@/contexts/AppConfigContext'
import { createClient } from '@/lib/supabase/client'
import {
  ChevronDown, Building2, Check,
  RefreshCw, Unlink, ExternalLink, Loader2, CheckCircle, AlertCircle, Search, Landmark
} from 'lucide-react'
import { useState, useRef, useEffect, useMemo } from 'react'
import { usePathname } from 'next/navigation'
import { formatCNPJ } from '@/lib/utils'
import toast from 'react-hot-toast'

export default function SelectorEmpresa() {
  const { empresas, empresaAtiva, setEmpresaAtiva, recarregar } = useEmpresa()
  const { accentClasses } = useAppConfig()
  const [openEmpresa, setOpenEmpresa] = useState(false)
  const [busca, setBusca] = useState('')
  const [conectando, setConectando] = useState(false)
  const [desconectando, setDesconectando] = useState(false)
  const supabase = createClient()
  const refEmpresa = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const pathname = usePathname() || ''

  // Filtra empresas de acordo com o módulo (Vendas vs Contas a Pagar/Receber/Gestão de Pagamentos)
  const empresasFiltradas = useMemo(() => {
    return empresas.filter(emp => {
      const temCredencialVendas = Boolean(emp.access_token_conta_azul_vendas || emp.email_login_vendas)
      const temCredencialFinanceiro = Boolean(emp.access_token_conta_azul || emp.email_login)

      // Módulos de Vendas (/vendas, /notas-emitidas): Exibe APENAS se tiver credencial de vendas cadastrada
      if (pathname.startsWith('/vendas') || pathname.startsWith('/notas-emitidas')) {
        return temCredencialVendas
      }

      // Módulos de Financeiro / Contas a Pagar / Gestão de Pagamentos (/contas-pagar, /gestao-pagamentos, /contas-receber, /boletos, /pagamentos, /receber): Exibe APENAS se tiver credencial de financeiro cadastrada
      if (pathname.startsWith('/contas-pagar') || pathname.startsWith('/gestao-pagamentos') || pathname.startsWith('/contas-receber') || pathname.startsWith('/boletos') || pathname.startsWith('/pagamentos') || pathname.startsWith('/receber')) {
        return temCredencialFinanceiro
      }

      return true
    })
  }, [empresas, pathname])

  // Aplica a busca por texto (Nome ou CNPJ)
  const empresasExibidas = useMemo(() => {
    if (!busca.trim()) return empresasFiltradas
    const q = busca.toLowerCase().trim()
    return empresasFiltradas.filter(emp => 
      emp.nome.toLowerCase().includes(q) || 
      (emp.cnpj && emp.cnpj.replace(/\D/g, '').includes(q.replace(/\D/g, ''))) ||
      (emp.razao_social && emp.razao_social.toLowerCase().includes(q))
    )
  }, [empresasFiltradas, busca])

  useEffect(() => {
    if (empresasFiltradas.length > 0 && empresaAtiva) {
      const isValid = empresasFiltradas.some(e => e.id === empresaAtiva.id)
      if (!isValid) {
        setEmpresaAtiva(empresasFiltradas[0])
      }
    }
  }, [pathname, empresasFiltradas, empresaAtiva, setEmpresaAtiva])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (refEmpresa.current && !refEmpresa.current.contains(e.target as Node)) {
        setOpenEmpresa(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (openEmpresa) {
      setTimeout(() => searchInputRef.current?.focus(), 100)
    } else {
      setBusca('')
    }
  }, [openEmpresa])

  const handleConectar = () => {
    if (!empresaAtiva) return
    setConectando(true)
    const moduloParam = isVendasModulo ? '&modulo=vendas' : '&modulo=financeiro'
    window.location.href = `/api/conta-azul/autorizar?empresa_id=${empresaAtiva.id}${moduloParam}`
  }

  const handleDesconectar = async () => {
    if (!empresaAtiva) return
    if (!confirm(`Desconectar Conta Azul de "${empresaAtiva.nome}"?`)) return
    setDesconectando(true)
    try {
      const updateData = isVendasModulo ? {
        access_token_conta_azul_vendas: null,
        refresh_token_conta_azul_vendas: null,
        data_expiracao_token_vendas: null,
      } : {
        access_token_conta_azul: null,
        refresh_token_conta_azul: null,
        data_expiracao_token: null,
        conta_azul_connected: false,
      }

      const { error } = await supabase
        .from('empresas')
        .update(updateData)
        .eq('id', empresaAtiva.id)
      if (error) throw error
      toast.success('Conta Azul desconectado.')
      await recarregar()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao desconectar')
    } finally {
      setDesconectando(false)
    }
  }

  const handleSelectEmpresa = (emp: any) => {
    setEmpresaAtiva(emp)
    setOpenEmpresa(false)
    
    // Auto-sincronização de fornecedores caso conectado ao Conta Azul
    if (emp.access_token_conta_azul && (pathname.startsWith('/contas-pagar') || pathname.startsWith('/empresas'))) {
      fetch('/api/conta-azul/fornecedores/sincronizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresa_id: emp.id })
      }).catch(err => {
        console.warn('Erro na auto-sincronização de fornecedores:', err)
      })
    }
  }

  const isVendasModulo = pathname.startsWith('/vendas') || pathname.startsWith('/notas-emitidas')
  const isFinanceiroModulo = pathname.startsWith('/contas-pagar') || pathname.startsWith('/gestao-pagamentos') || pathname.startsWith('/contas-receber') || pathname.startsWith('/boletos') || pathname.startsWith('/pagamentos') || pathname.startsWith('/receber')

  const caFinanceiroConectado = !!(empresaAtiva?.access_token_conta_azul || empresaAtiva?.email_login)
  const caVendasConectado = !!(empresaAtiva?.access_token_conta_azul_vendas || empresaAtiva?.email_login_vendas)
  const datacarConectado = !!empresaAtiva?.datacar_token

  const caModuloConectado = isVendasModulo ? caVendasConectado : caFinanceiroConectado

  return (
    <div ref={refEmpresa} className="relative w-full sm:w-auto">
      <button
        onClick={() => setOpenEmpresa(!openEmpresa)}
        className="w-full sm:w-auto flex items-center justify-between gap-2.5 bg-dark-800 hover:bg-dark-700 border border-dark-600 rounded-xl px-3 py-2 transition-all group shadow-sm"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-6 h-6 ${accentClasses.bg}/20 rounded-md flex items-center justify-center flex-shrink-0`}>
            <Building2 size={13} className={accentClasses.text} />
          </div>
          <span className="text-white text-sm font-semibold max-w-[210px] truncate text-left">
            {empresaAtiva?.nome || 'Selecionar empresa'}
          </span>
          
          {/* Indicador de Status Verde se Conectado ao CA, Vermelho se Desconectado */}
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${caModuloConectado ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50' : 'bg-red-500 shadow-sm shadow-red-500/50'}`} />

          {/* Aviso se a empresa não tiver Datacar conectado */}
          {empresaAtiva && !datacarConectado && empresaAtiva.datacar_cod_emp !== 'SOMENTE_BANCO' && (
            <span className="text-[10px] font-bold text-amber-400 bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 rounded flex items-center gap-1" title="Datacar não conectado nesta empresa">
              ⚠️ Datacar Off
            </span>
          )}
        </div>
        <ChevronDown size={14} className={`text-dark-400 transition-transform flex-shrink-0 ${openEmpresa ? 'rotate-180 text-white' : ''}`} />
      </button>

      {openEmpresa && (
        <div className="absolute top-full mt-2 right-0 sm:right-auto sm:left-0 w-80 sm:w-96 bg-dark-800 border border-dark-600 rounded-2xl shadow-2xl z-50 overflow-hidden animate-fade-in flex flex-col">
          {/* Cabeçalho do Dropdown */}
          <div className="px-3.5 py-2.5 border-b border-dark-700 bg-dark-900/60 flex items-center justify-between">
            <span className="text-[11px] font-bold text-dark-300 uppercase tracking-wider">Suas Empresas</span>
            <span className="text-[10px] font-bold bg-dark-700 text-dark-300 px-2 py-0.5 rounded-full border border-dark-600/50">
              {empresasExibidas.length} {empresasExibidas.length === 1 ? 'loja' : 'lojas'}
            </span>
          </div>

          {/* Campo de Pesquisa Interativa */}
          <div className="p-2.5 border-b border-dark-700 bg-dark-850 sticky top-0 z-10">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Pesquisar loja por nome ou CNPJ..."
                className="w-full bg-dark-900 border border-dark-700 rounded-xl pl-9 pr-7 py-2 text-xs text-white placeholder-dark-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-all"
              />
              {busca && (
                <button
                  onClick={() => setBusca('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-dark-400 hover:text-white text-xs p-1"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Lista de Empresas com Scroll Sem Cortes */}
          <div className="max-h-72 overflow-y-auto divide-y divide-dark-700/40 custom-scrollbar">
            {empresasExibidas.length === 0 ? (
              <div className="px-4 py-8 text-center text-dark-400 text-xs">
                {busca ? `Nenhuma empresa encontrada para "${busca}"` : 'Nenhuma empresa disponível para este módulo'}
              </div>
            ) : (
              empresasExibidas.map((emp) => {
                const isSelected = empresaAtiva?.id === emp.id
                const ehSomenteBanco = emp.datacar_cod_emp === 'SOMENTE_BANCO' || (emp as any).tipo_empresa === 'somente_banco' || (emp as any).somente_banco === true
                const temDatacar = Boolean(emp.datacar_token)
                const temCaFin = Boolean(emp.access_token_conta_azul || emp.email_login)
                const temCaVen = Boolean(emp.access_token_conta_azul_vendas || emp.email_login_vendas)

                const empCaModuloConectado = isVendasModulo ? temCaVen : (isFinanceiroModulo ? temCaFin : (temCaFin || temCaVen))

                return (
                  <button
                    key={emp.id}
                    onClick={() => handleSelectEmpresa(emp)}
                    className={`w-full flex items-start gap-3 px-3.5 py-3 transition-colors text-left group ${
                      isSelected ? 'bg-dark-700/70' : 'hover:bg-dark-700/40'
                    }`}
                  >
                    <div className={`w-8 h-8 mt-0.5 rounded-lg flex items-center justify-center flex-shrink-0 transition-all ${
                      isSelected 
                        ? `${accentClasses.bg} text-white shadow-md` 
                        : `${accentClasses.bg}/15 border ${accentClasses.border}/30 group-hover:${accentClasses.bg}/25`
                    }`}>
                      {ehSomenteBanco ? (
                        <Landmark size={14} className={isSelected ? 'text-white' : accentClasses.text} />
                      ) : (
                        <span className={`font-bold text-xs ${isSelected ? 'text-white' : accentClasses.text}`}>
                          {emp.nome.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className={`text-xs font-semibold truncate ${isSelected ? 'text-white' : 'text-dark-100 group-hover:text-white'}`}>
                          {emp.nome}
                        </p>
                        {ehSomenteBanco ? (
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400">
                            SOMENTE BANCO
                          </span>
                        ) : (
                          <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded-full bg-dark-700 text-dark-300">
                            {emp.tipo_empresa || 'ambos'}
                          </span>
                        )}
                      </div>
                      <p className="text-dark-400 text-[11px] font-mono mt-0.5">
                        {emp.cnpj ? formatCNPJ(emp.cnpj) : 'CNPJ não informado'}
                      </p>

                      {/* Indicadores de Conexão: Verde para Conectado, Vermelho para Desconectado, Amarelo para Datacar Off */}
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${
                          empCaModuloConectado 
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' 
                            : 'bg-red-500/20 text-red-400 border-red-500/30'
                        }`}>
                          {empCaModuloConectado ? '● CA CONECTADO' : '● CA DESCONECTADO'}
                        </span>

                        {!ehSomenteBanco && (
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${
                            temDatacar 
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' 
                              : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                          }`}>
                            {temDatacar ? '● DATACAR OK' : '⚠️ DATACAR OFF'}
                          </span>
                        )}
                      </div>
                    </div>

                    {isSelected && <Check size={15} className="text-emerald-400 flex-shrink-0 mt-1" />}
                  </button>
                )
              })
            )}
          </div>

          {/* Rodapé de Status do Conta Azul */}
          {empresaAtiva && (
            <div className="border-t border-dark-700 px-3.5 py-3 bg-dark-900/80">
              <p className="text-[10px] text-dark-400 font-bold uppercase tracking-wider mb-2">Conexão Conta Azul</p>
              <div className="flex items-center justify-between bg-dark-800 border border-dark-700 rounded-xl px-3 py-2">
                <div className="flex items-center gap-2">
                  {caModuloConectado ? (
                    <><CheckCircle size={13} className="text-emerald-400" /><span className="text-xs text-emerald-400 font-medium">API Conectada</span></>
                  ) : (
                    <><AlertCircle size={13} className="text-red-400" /><span className="text-xs text-red-400 font-medium">Não Conectado</span></>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {caModuloConectado ? (
                    <>
                      <button onClick={(e) => { e.stopPropagation(); handleConectar() }} disabled={conectando}
                        className="p-1.5 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700 transition-all" title="Renovar token">
                        {conectando ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleDesconectar() }} disabled={desconectando}
                        className="p-1.5 rounded-lg text-dark-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all" title="Desconectar">
                        {desconectando ? <Loader2 size={13} className="animate-spin" /> : <Unlink size={13} />}
                      </button>
                    </>
                  ) : (
                    <button onClick={(e) => { e.stopPropagation(); handleConectar() }} disabled={conectando}
                      className={`flex items-center gap-1.5 text-xs font-semibold ${accentClasses.text} ${accentClasses.bg}/10 hover:${accentClasses.bg}/20 px-2.5 py-1 rounded-lg transition-all`}>
                      {conectando ? <Loader2 size={12} className="animate-spin" /> : <ExternalLink size={12} />}
                      Conectar
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
