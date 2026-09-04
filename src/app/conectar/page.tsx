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
  Info
} from 'lucide-react'

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
  const searchParams = useSearchParams()
  const empresaId = searchParams.get('empresa_id')
  const modulo = searchParams.get('modulo') || 'financeiro'

  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [info, setInfo] = useState<EmpresaInfo | null>(null)

  useEffect(() => {
    if (!empresaId) {
      setErro('Link invalido: Parametro da empresa nao encontrado.')
      setLoading(false)
      return
    }

    async function carregarDados() {
      try {
        setLoading(true)
        const res = await fetch('/api/conta-azul/info-autorizacao?empresa_id=' + empresaId + '&modulo=' + modulo)
        const data = await res.json()

        if (!res.ok || data.error) {
          setErro(data.error || 'Nao foi possivel carregar as informacoes desta empresa.')
        } else {
          setInfo(data)
        }
      } catch (err: any) {
        setErro('Erro de conexao ao carregar informacoes da empresa.')
      } finally {
        setLoading(false)
      }
    }

    carregarDados()
  }, [empresaId, modulo])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] text-white flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
          <p className="text-sm text-zinc-400 font-medium">Carregando informacoes da loja...</p>
        </div>
      </div>
    )
  }

  if (erro || !info) {
    return (
      <div className="min-h-screen bg-[#09090b] text-white flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-zinc-900/90 border border-red-500/30 rounded-2xl p-6 sm:p-8 text-center shadow-2xl backdrop-blur-md">
          <div className="w-14 h-14 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4 text-red-400">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Link Incompleto ou Invalido</h1>
          <p className="text-sm text-zinc-400 leading-relaxed mb-6">{erro || 'Empresa nao encontrada.'}</p>
          <p className="text-xs text-zinc-500">
            Por favor, solicite um novo link de autorizacao a equipe de suporte / BPO.
          </p>
        </div>
      </div>
    )
  }

  const isFinanceiro = info.modulo === 'financeiro'
  const urlAutorizar = '/api/conta-azul/autorizar?empresa_id=' + info.empresa_id + '&modulo=' + info.modulo + '&direto=true'

  return (
    <div className="min-h-screen bg-[#09090b] text-white flex flex-col justify-between items-center p-4 sm:p-6 lg:p-8 selection:bg-blue-500/30">
      <header className="w-full max-w-xl flex items-center justify-between py-2 mb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md font-bold text-xs">
            BPO
          </div>
          <span className="font-semibold text-sm tracking-tight text-zinc-200">
            Portal de Integracao <span className="text-zinc-500 font-normal">| Conta Azul</span>
          </span>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-400 font-medium">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>OAuth 2.0 Seguro</span>
        </div>
      </header>

      <main className="w-full max-w-xl my-auto">
        <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden">
          <div
            className={'absolute top-0 right-0 w-64 h-64 rounded-full filter blur-3xl opacity-15 pointer-events-none ' +
              (isFinanceiro ? 'bg-blue-500' : 'bg-emerald-500')}
          />

          <div className="flex items-center justify-between gap-2 mb-5">
            <span
              className={'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border uppercase tracking-wider ' +
                (isFinanceiro ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30')}
            >
              {isFinanceiro ? <DollarSign className="w-3.5 h-3.5" /> : <Receipt className="w-3.5 h-3.5" />}
              {info.modulo_tipo}
            </span>

            {info.ja_conectado && (
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" /> Conectado (Renovar)
              </span>
            )}
          </div>

          <div className="space-y-1 mb-6">
            <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
              Unidade / Empresa
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">
              <Building2 className="w-6 h-6 text-zinc-400 flex-shrink-0" />
              <span>{info.nome}</span>
            </h1>
            {info.razao_social && info.razao_social !== info.nome && (
              <p className="text-xs sm:text-sm text-zinc-400 font-medium truncate">{info.razao_social}</p>
            )}
            <p className="text-xs font-mono text-zinc-500 pt-0.5">CNPJ: {formatCnpj(info.cnpj)}</p>
          </div>

          <div className="bg-zinc-950/70 border border-zinc-800/90 rounded-2xl p-4 sm:p-5 mb-6 space-y-3">
            <div className="flex items-start gap-2.5">
              <div className="p-1 rounded-lg bg-amber-500/10 text-amber-400 mt-0.5">
                <Info className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wider">
                  Instrucoes para Autenticacao
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
                  Ao clicar no botao abaixo, faca login no Conta Azul com as credenciais desta unidade.
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-zinc-800/80">
              <p className="text-[11px] text-amber-400 font-medium mb-1.5 flex items-center gap-1">
                ⚠️ Se o Conta Azul solicitar a escolha da empresa, selecione:
              </p>
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-3.5 py-2.5 text-center">
                <span className="text-xs sm:text-sm font-mono font-bold text-amber-300 select-all">
                  👉 {info.nome_esperado_ca}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <a
              href={urlAutorizar}
              className={'w-full py-3.5 px-6 rounded-2xl font-bold text-sm sm:text-base flex items-center justify-center gap-2 transition-all shadow-lg active:scale-[0.99] text-white ' +
                (isFinanceiro
                  ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/25 hover:shadow-blue-600/40'
                  : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/25 hover:shadow-emerald-600/40')}
            >
              <span>Ir para o Conta Azul e Autorizar</span>
              <ArrowRight className="w-4 h-4" />
            </a>

            <div className="flex items-center justify-center gap-1.5 text-[11px] text-zinc-500 text-center">
              <Lock className="w-3 h-3 text-zinc-400" />
              <span>Voce sera redirecionado para a pagina oficial do Conta Azul</span>
            </div>
          </div>
        </div>
      </main>

      <footer className="w-full max-w-xl text-center py-4 text-xs text-zinc-600">
        <p>Integracao oficial via API Conta Azul • Seus dados estao 100% protegidos</p>
      </footer>
    </div>
  )
}

export default function ConectarPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#09090b] text-white flex flex-col items-center justify-center p-4">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        </div>
      }
    >
      <ConectarContent />
    </Suspense>
  )
}
