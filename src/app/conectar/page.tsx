'use client'

import React, { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Building2,
  ShieldCheck,
  Loader2,
  AlertTriangle,
  DollarSign,
  Receipt,
  CheckCircle2,
  Lock,
  ArrowRight,
  Info,
  Sun,
  Moon
} from 'lucide-react'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useAppConfig } from '@/contexts/AppConfigContext'

interface EmpresaInfo {
  empresa_id: string
  nome: string
  razao_social: string
  nome_fantasia?: string
  cnpj: string
  modulo: 'financeiro' | 'vendas'
  modulo_label: string
  modulo_tipo: string
  nome_esperado_ca: string
  ja_conectado: boolean
  email_login_existente?: string
}

function formatCnpj(val: string) {
  const digits = (val || '').replace(/\D/g, '')
  if (digits.length !== 14) return val
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
}

function ConectarContent() {
  const { config, update } = useAppConfig()
  const searchParams = useSearchParams()
  const empresaId = searchParams.get('empresa_id')
  const modulo = searchParams.get('modulo') || 'financeiro'

  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [info, setInfo] = useState<EmpresaInfo | null>(null)

  useEffect(() => {
    if (!empresaId) {
      setErro('Link inválido: Parâmetro da empresa não encontrado.')
      setLoading(false)
      return
    }

    async function carregarDados() {
      try {
        setLoading(true)
        const res = await fetch('/api/conta-azul/info-autorizacao?empresa_id=' + empresaId + '&modulo=' + modulo)
        const data = await res.json()

        if (!res.ok || data.error) {
          setErro(data.error || 'Não foi possível carregar as informações desta empresa.')
        } else {
          setInfo(data)
        }
      } catch {
        setErro('Erro de conexão ao carregar informações da empresa.')
      } finally {
        setLoading(false)
      }
    }

    carregarDados()
  }, [empresaId, modulo])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-white flex flex-col items-center justify-center p-4 transition-colors">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="w-10 h-10 text-brand-500 animate-spin" />
          <p className="text-sm text-slate-500 dark:text-zinc-400 font-medium">Carregando informações da empresa...</p>
        </div>
      </div>
    )
  }

  if (erro || !info) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-white flex flex-col items-center justify-center p-4 transition-colors">
        <div className="max-w-md w-full bg-white dark:bg-zinc-900/90 border border-rose-500/30 rounded-3xl p-6 sm:p-8 text-center shadow-2xl backdrop-blur-md">
          <div className="w-14 h-14 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4 text-rose-500 dark:text-rose-400 shadow-xs">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Link Incompleto ou Inválido</h1>
          <p className="text-sm text-slate-600 dark:text-zinc-400 leading-relaxed mb-6">{erro || 'Empresa não encontrada.'}</p>
          <p className="text-xs text-slate-400 dark:text-zinc-500">
            Por favor, solicite um novo link de autorização à equipe de suporte / BPO.
          </p>
        </div>
      </div>
    )
  }

  const isFinanceiro = info.modulo === 'financeiro'
  const urlAutorizar = '/api/conta-azul/autorizar?empresa_id=' + info.empresa_id + '&modulo=' + info.modulo + '&direto=true'

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-white flex flex-col justify-between items-center p-4 sm:p-6 lg:p-8 selection:bg-brand-500/30 transition-colors">
      <header className="w-full max-w-xl flex items-center justify-between py-2 mb-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md font-extrabold text-xs">
            BPO
          </div>
          <span className="font-semibold text-sm tracking-tight text-slate-800 dark:text-zinc-200">
            Portal de Integração <span className="text-slate-400 dark:text-zinc-500 font-normal">| Conta Azul</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-[11px] text-slate-600 dark:text-zinc-400 font-semibold shadow-xs">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>OAuth 2.0 Seguro</span>
          </div>
          <button
            onClick={() => update({ darkMode: !config.darkMode })}
            title={config.darkMode ? 'Mudar para Modo Claro' : 'Mudar para Modo Escuro'}
            className="p-1.5 rounded-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white transition-colors cursor-pointer shadow-xs"
          >
            {config.darkMode ? <Sun size={15} className="text-amber-400" /> : <Moon size={15} className="text-indigo-500" />}
          </button>
        </div>
      </header>

      <main className="w-full max-w-xl my-auto">
        <div className="bg-white/95 dark:bg-zinc-900/90 border border-slate-200/90 dark:border-zinc-800/80 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden">
          <div
            className={'absolute top-0 right-0 w-64 h-64 rounded-full filter blur-3xl opacity-15 pointer-events-none ' +
              (isFinanceiro ? 'bg-blue-500' : 'bg-emerald-500')}
          />

          <div className="flex items-center justify-between gap-2 mb-5">
            <span
              className={'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border uppercase tracking-wider shadow-xs ' +
                (isFinanceiro ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30')}
            >
              {isFinanceiro ? <DollarSign className="w-3.5 h-3.5" /> : <Receipt className="w-3.5 h-3.5" />}
              {info.modulo_tipo}
            </span>

            {info.ja_conectado ? (
              <StatusBadge
                label="Conectado (Renovar)"
                variant="success"
                icon={CheckCircle2}
              />
            ) : (
              <StatusBadge
                label="Desconectado"
                variant="warning"
                pulse
              />
            )}
          </div>

          <div className="space-y-1 mb-6">
            <span className="text-[11px] font-bold text-slate-400 dark:text-zinc-400 uppercase tracking-wider block">
              Unidade / Empresa
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <Building2 className="w-6 h-6 text-brand-500 flex-shrink-0" />
              <span className="truncate">{info.nome}</span>
            </h1>
            {info.razao_social && info.razao_social !== info.nome && (
              <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 font-medium truncate">{info.razao_social}</p>
            )}
            <p className="text-xs font-mono text-slate-500 dark:text-zinc-500 pt-0.5 font-semibold">CNPJ: {formatCnpj(info.cnpj)}</p>
          </div>

          <div className="bg-slate-50 dark:bg-zinc-950/70 border border-slate-200 dark:border-zinc-800/90 rounded-2xl p-4 sm:p-5 mb-6 space-y-3">
            <div className="flex items-start gap-2.5">
              <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 mt-0.5 shadow-2xs">
                <Info className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-900 dark:text-zinc-200 uppercase tracking-wider">
                  Instruções para Autenticação
                </h3>
                <p className="text-xs text-slate-600 dark:text-zinc-400 mt-0.5 leading-relaxed">
                  Ao clicar no botão abaixo, faça login no Conta Azul com as credenciais desta unidade.
                </p>
              </div>
            </div>

            <div className="pt-2.5 border-t border-slate-200 dark:border-zinc-800/80">
              <p className="text-[11px] text-amber-600 dark:text-amber-400 font-bold mb-1.5 flex items-center gap-1">
                ⚠️ Se o Conta Azul solicitar a escolha da empresa, selecione:
              </p>
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-3.5 py-2.5 text-center shadow-xs">
                <span className="text-xs sm:text-sm font-mono font-bold text-amber-700 dark:text-amber-300 select-all">
                  👉 {info.nome_esperado_ca}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <a
              href={urlAutorizar}
              className={'w-full py-3.5 px-6 rounded-2xl font-bold text-sm sm:text-base flex items-center justify-center gap-2 transition-all shadow-lg active:scale-[0.99] text-white cursor-pointer ' +
                (isFinanceiro
                  ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/25 hover:shadow-blue-600/40'
                  : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/25 hover:shadow-emerald-600/40')}
            >
              <span>Ir para o Conta Azul e Autorizar</span>
              <ArrowRight className="w-4 h-4" />
            </a>

            <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500 dark:text-zinc-500 text-center">
              <Lock className="w-3 h-3 text-slate-400 dark:text-zinc-400" />
              <span>Você será redirecionado para a página oficial do Conta Azul</span>
            </div>
          </div>
        </div>
      </main>

      <footer className="w-full max-w-xl text-center py-4 text-xs text-slate-400 dark:text-zinc-600">
        <p>Integração oficial via API Conta Azul • Seus dados estão 100% protegidos</p>
      </footer>
    </div>
  )
}

export default function ConectarPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-white flex flex-col items-center justify-center p-4">
          <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
        </div>
      }
    >
      <ConectarContent />
    </Suspense>
  )
}
