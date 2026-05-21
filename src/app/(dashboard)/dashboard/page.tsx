'use client'

import { useEmpresa } from '@/contexts/EmpresaContext'
import { createClient } from '@/lib/supabase/client'
import { useEffect, useState, useCallback } from 'react'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  Clock, CheckCircle, AlertCircle, TrendingUp,
  Building2, Plus, Upload, Trash2, Loader2,
  RefreshCw, Zap, X, ArrowDownCircle, ChevronRight,
  Calendar, DollarSign, User,
} from 'lucide-react'
import Link from 'next/link'
import toast from 'react-hot-toast'

interface Stats {
  totalPendente: number
  totalEnviado: number
  totalErro: number
  valorPendente: number
  valorEnviado: number
}

interface Lancamento {
  id: string
  fornecedor: string
  valor: number
  vencimento: string
  status: string
  descricao?: string | null
  categoria?: string | null
}

type DrawerStatus = 'pendente' | 'enviado' | 'erro' | null

export default function DashboardPage() {
  const { empresaAtiva, empresas } = useEmpresa()
  const [stats, setStats] = useState<Stats>({
    totalPendente: 0, totalEnviado: 0, totalErro: 0,
    valorPendente: 0, valorEnviado: 0,
  })
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  // Drawer
  const [drawerStatus, setDrawerStatus] = useState<DrawerStatus>(null)
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [loadingDrawer, setLoadingDrawer] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const supabase = createClient()

  useEffect(() => {
    if (!empresaAtiva) { setLoading(false); return }
    carregarStats()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaAtiva])

  // Fechar drawer com ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawerStatus(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Travar scroll do body quando drawer aberto
  useEffect(() => {
    if (drawerStatus) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [drawerStatus])

  const carregarStats = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
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
      setRefreshing(false)
    }
  }

  const abrirDrawer = useCallback(async (status: DrawerStatus) => {
    if (!status || !empresaAtiva) return
    setDrawerStatus(status)
    setLoadingDrawer(true)
    try {
      const { data, error } = await supabase
        .from('contas_pagar_importadas')
        .select('id, fornecedor, valor, vencimento, status, descricao, categoria')
        .eq('empresa_id', empresaAtiva.id)
        .eq('status', status)
        .order('vencimento', { ascending: true })

      if (error) throw error
      setLancamentos(data || [])
    } catch {
      toast.error('Erro ao carregar lançamentos')
    } finally {
      setLoadingDrawer(false)
    }
  }, [empresaAtiva, supabase])

  const excluirLancamento = async (id: string) => {
    if (!confirm('Excluir este lançamento?')) return
    setDeletingId(id)
    try {
      const { error } = await supabase
        .from('contas_pagar_importadas')
        .delete()
        .eq('id', id)

      if (error) throw error
      setLancamentos(prev => prev.filter(l => l.id !== id))
      toast.success('Lançamento excluído')
      await carregarStats(true)
    } catch {
      toast.error('Erro ao excluir')
    } finally {
      setDeletingId(null)
    }
  }

  const handleLimparStatus = async (status: 'pendente' | 'erro') => {
    const label = status === 'pendente' ? 'pendentes' : 'com erro'
    if (!confirm(`Tem certeza que deseja apagar todos os registros ${label}?`)) return

    setDeleting(status)
    try {
      const { error } = await supabase
        .from('contas_pagar_importadas')
        .delete()
        .eq('empresa_id', empresaAtiva!.id)
        .eq('status', status)

      if (error) throw error

      toast.success(`Registros ${label} removidos com sucesso!`)
      await carregarStats()
      if (drawerStatus === status) {
        setLancamentos([])
        setDrawerStatus(null)
      }
    } catch (err: any) {
      toast.error('Erro ao remover registros: ' + err.message)
    } finally {
      setDeleting(null)
    }
  }

  if (!empresaAtiva && empresas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 animate-fade-in">
        <div className="w-16 h-16 bg-dark-800 rounded-2xl flex items-center justify-center border border-dark-700">
          <Building2 size={32} className="text-dark-500" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-semibold text-white">Nenhuma empresa cadastrada</h2>
          <p className="text-dark-400 text-sm mt-1">Crie sua primeira empresa para começar</p>
        </div>
        <Link href="/empresas?new=true"
          className="bg-brand-600 hover:bg-brand-500 text-white px-6 py-3 rounded-lg font-semibold flex items-center gap-2 transition-all shadow-lg shadow-brand-900/30">
          <Plus size={18} /> Criar empresa
        </Link>
      </div>
    )
  }

  const total = stats.totalPendente + stats.totalEnviado + stats.totalErro
  const taxaSucesso = total > 0 ? Math.round((stats.totalEnviado / total) * 100) : 0

  const cards = [
    {
      status: 'pendente' as DrawerStatus,
      title: 'Pendentes',
      label: 'A enviar',
      value: stats.totalPendente,
      sub: formatCurrency(stats.valorPendente),
      icon: Clock,
      color: 'text-amber-400',
      colorHex: '#f59e0b',
      bg: 'bg-amber-400/10',
      border: 'border-amber-400/20',
      hoverBorder: 'hover:border-amber-400/60',
      gradientFrom: 'from-amber-500/10',
      barWidth: total > 0 ? `${Math.round((stats.totalPendente / total) * 100)}%` : '0%',
      barColor: 'bg-amber-400',
      canDelete: stats.totalPendente > 0,
    },
    {
      status: 'enviado' as DrawerStatus,
      title: 'Enviados',
      label: 'Conta Azul',
      value: stats.totalEnviado,
      sub: formatCurrency(stats.valorEnviado),
      icon: CheckCircle,
      color: 'text-emerald-400',
      colorHex: '#34d399',
      bg: 'bg-emerald-400/10',
      border: 'border-emerald-400/20',
      hoverBorder: 'hover:border-emerald-400/60',
      gradientFrom: 'from-emerald-500/10',
      barWidth: total > 0 ? `${Math.round((stats.totalEnviado / total) * 100)}%` : '0%',
      barColor: 'bg-emerald-400',
      canDelete: false,
    },
    {
      status: 'erro' as DrawerStatus,
      title: 'Com Erro',
      label: 'Falhas',
      value: stats.totalErro,
      sub: 'Necessitam atenção',
      icon: AlertCircle,
      color: 'text-rose-400',
      colorHex: '#fb7185',
      bg: 'bg-rose-400/10',
      border: 'border-rose-400/20',
      hoverBorder: 'hover:border-rose-400/60',
      gradientFrom: 'from-rose-500/10',
      barWidth: total > 0 ? `${Math.round((stats.totalErro / total) * 100)}%` : '0%',
      barColor: 'bg-rose-400',
      canDelete: stats.totalErro > 0,
    },
    {
      status: null as DrawerStatus,
      title: 'Total',
      label: 'Processados',
      value: total,
      sub: formatCurrency(stats.valorPendente + stats.valorEnviado),
      icon: TrendingUp,
      color: 'text-brand-400',
      colorHex: '#818cf8',
      bg: 'bg-brand-400/10',
      border: 'border-brand-400/20',
      hoverBorder: 'hover:border-brand-400/60',
      gradientFrom: 'from-brand-500/10',
      barWidth: '100%',
      barColor: 'bg-brand-400',
      canDelete: false,
    },
  ]

  const drawerCard = cards.find(c => c.status === drawerStatus)

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Dashboard</h1>
          <p className="text-dark-400 text-sm mt-0.5 flex items-center gap-1.5">
            {empresaAtiva ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
                {empresaAtiva.nome}
              </>
            ) : 'Selecione uma empresa'}
          </p>
        </div>
        <button
          onClick={() => carregarStats(true)}
          disabled={refreshing}
          className="flex items-center gap-2 text-sm text-dark-400 hover:text-white bg-dark-800 hover:bg-dark-700 border border-dark-700 px-3 py-2 rounded-lg transition-all"
      