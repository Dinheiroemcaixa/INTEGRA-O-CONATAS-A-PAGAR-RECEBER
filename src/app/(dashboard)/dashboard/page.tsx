'use client'

import { useEmpresa } from '@/contexts/EmpresaContext'
import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import { formatCurrency } from '@/lib/utils'
import {
  ArrowDownCircle, Clock, CheckCircle, AlertCircle,
  TrendingUp, Building2, Plus, Upload
} from 'lucide-react'
import Link from 'next/link'

interface Stats {
  totalPendente: number
  totalEnviado: number
  totalErro: number
  valorPendente: number
  valorEnviado: number
}

export default function DashboardPage() {
  const { empresaAtiva, empresas } = useEmpresa()
  const [stats, setStats] = useState<Stats>({
    totalPendente: 0, totalEnviado: 0, totalErro: 0,
    valorPendente: 0, valorEnviado: 0,
  })
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    if (!empresaAtiva) { setLoading(false); return }
    carregarStats()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaAtiva])

  const carregarStats = async () => {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('contas_pagar_importadas')
        .select('status, valor')
        .eq('empresa_id', empresaAtiva!.id)

      if (data) {
        const pendente = data.filter((r) => r.status === 'pendente')
        const enviado = data.filter((r) => r.status === 'enviado')
        const erro = data.filter((r) => r.status === 'erro')
        setStats({
          totalPendente: pendente.length,
          totalEnviado: enviado.length,
          totalErro: erro.length,
          valorPendente: pendente.reduce((s, r) => s + Number(r.valor), 0),
          valorEnviado: enviado.reduce((s, r) => s + Number(r.valor), 0),
        })
      }
    } finally {
      setLoading(false)
    }
  }

  if (!empresaAtiva && empresas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 animate-fade-in">
        <Building2 size={48} className="text-dark-600" />
        <h2 className="text-xl font-semibold text-white">Nenhuma empresa cadastrada</h2>
        <p className="text-dark-400 text-sm">Crie sua primeira empresa para começar</p>
        <Link href="/empresas/nova"
          className="bg-brand-600 hover:bg-brand-500 text-white px-6 py-3 rounded-lg font-semibold flex items-center gap-2 transition-all">
          <Plus size={18} /> Criar empresa
        </Link>
      </div>
    )
  }

  const cards = [
    {
      title: 'A Pagar (Pendentes)',
      value: stats.totalPendente,
      sub: formatCurrency(stats.valorPendente),
      icon: Clock,
      color: 'text-yellow-400',
      bg: 'bg-yellow-400/10',
      border: 'border-yellow-400/20',
    },
    {
      title: 'Enviados ao Conta Azul',
      value: stats.totalEnviado,
      sub: formatCurrency(stats.valorEnviado),
      icon: CheckCircle,
      color: 'text-green-400',
      bg: 'bg-green-400/10',
      border: 'border-green-400/20',
    },
    {
      title: 'Com Erro',
      value: stats.totalErro,
      sub: 'Necessitam atenção',
      icon: AlertCircle,
      color: 'text-red-400',
      bg: 'bg-red-400/10',
      border: 'border-red-400/20',
    },
    {
      title: 'Total Processado',
      value: stats.totalPendente + stats.totalEnviado + stats.totalErro,
      sub: 'Todos os registros',
      icon: TrendingUp,
      color: 'text-brand-400',
      bg: 'bg-brand-400/10',
      border: 'border-brand-400/20',
    },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-dark-400 text-sm mt-1">
          {empresaAtiva ? `Empresa: ${empresaAtiva.nome}` : 'Selecione uma empresa'}
        </p>
      </div>

      {/* Cards de estatísticas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <div key={card.title}
              className={`bg-dark-800 border ${card.border} rounded-xl p-5 flex flex-col gap-3`}>
              <div className="flex items-center justify-between">
                <p className="text-dark-400 text-sm font-medium">{card.title}</p>
                <div className={`${card.bg} rounded-lg p-2`}>
                  <Icon size={18} className={card.color} />
                </div>
              </div>
              <div>
                {loading ? (
                  <div className="h-8 w-16 bg-dark-700 animate-pulse rounded" />
                ) : (
                  <p className="text-3xl font-bold text-white">{card.value}</p>
                )}
                <p className="text-dark-500 text-sm mt-1">{card.sub}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Ações rápidas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link href="/contas-pagar"
          className="bg-dark-800 border border-dark-700 hover:border-brand-600 rounded-xl p-6 flex items-center gap-4 transition-all group">
          <div className="w-12 h-12 bg-brand-600/20 rounded-xl flex items-center justify-center group-hover:bg-brand-600/30 transition-all">
            <Upload size={22} className="text-brand-400" />
          </div>
          <div>
            <p className="text-white font-semibold">Importar DataCar</p>
            <p className="text-dark-400 text-sm">Carregar arquivo de contas a pagar</p>
          </div>
        </Link>

        <Link href="/contas-pagar"
          className="bg-dark-800 border border-dark-700 hover:border-green-600 rounded-xl p-6 flex items-center gap-4 transition-all group">
          <div className="w-12 h-12 bg-green-600/20 rounded-xl flex items-center justify-center group-hover:bg-green-600/30 transition-all">
            <ArrowDownCircle size={22} className="text-green-400" />
          </div>
          <div>
            <p className="text-white font-semibold">Contas a Pagar</p>
            <p className="text-dark-400 text-sm">Ver e enviar para o Conta Azul</p>
          </div>
        </Link>
      </div>

      {/* Status da integração */}
      <div className="bg-dark-800 border border-dark-700 rounded-xl p-5">
        <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          Status da Integração
        </h3>
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 bg-dark-900 rounded-lg px-3 py-2">
            <CheckCircle size={14} className="text-green-400" />
            <span className="text-sm text-dark-300">Supabase conectado</span>
          </div>
          <div className={`flex items-center gap-2 bg-dark-900 rounded-lg px-3 py-2`}>
            {empresaAtiva?.access_token_conta_azul ? (
              <><CheckCircle size={14} className="text-green-400" />
              <span className="text-sm text-dark-300">Conta Azul conectado</span></>
            ) : (
              <><AlertCircle size={14} className="text-yellow-400" />
              <span className="text-sm text-dark-300">Conta Azul: configurar em Empresas</span></>
            )}
          </div>
        </div>
      </div>
    </div>
  )