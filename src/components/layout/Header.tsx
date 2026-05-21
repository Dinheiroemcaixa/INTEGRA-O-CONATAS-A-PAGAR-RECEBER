'use client'

import { useEmpresa } from '@/contexts/EmpresaContext'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  User, LogOut, ChevronDown, Building2, Check,
  RefreshCw, Unlink, ExternalLink, Loader2, CheckCircle, AlertCircle,
} from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { formatCNPJ } from '@/lib/utils'
import toast from 'react-hot-toast'

export default function Header() {
  const { empresas, empresaAtiva, setEmpresaAtiva, recarregar } = useEmpresa()
  const [openEmpresa, setOpenEmpresa] = useState(false)
  const [openUser, setOpenUser] = useState(false)
  const [userEmail, setUserEmail] = useState<string>('')
  const [conectando, setConectando] = useState(false)
  const [desconectando, setDesconectando] = useState(false)
  const router = useRouter()
  const supabase = createClient()
  const refEmpresa = useRef<HTMLDivElement>(null)
  const refUser = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setUserEmail(data.user.email)
    })
    const handler = (e: MouseEvent) => {
      if (refEmpresa.current && !refEmpresa.current.contains(e.target as Node)) setOpenEmpresa(false)
      if (refUser.current && !refUser.current.contains(e.target as Node)) setOpenUser(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    toast.success('Saindo...')
    router.push('/login')
    router.refresh()
  }

  const handleConectar = () => {
    if (!empresaAtiva) return
    setConectando(true)
    window.location.href = `/api/conta-azul/autorizar?empresa_id=${empresaAtiva.id}`
  }

  const handleDesconectar = async () => {
    if (!empresaAtiva) return
    if (!confirm(`Desconectar Conta Azul de "${empresaAtiva.nome}"?`)) return
    setDesconectando(true)
    try {
      const { error } = await supabase
        .from('empresas')
        .update({
          access_token_conta_azul: null,
          refresh_token_conta_azul: null,
          data_expiracao_token: null,
          conta_azul_connected: false,
        })
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

  const contaAzulConectado = !!empresaAtiva?.access_token_conta_azul

  return (
    <header className="h-16 bg-dark-900 border-b border-dark-700 flex items-center justify-between px-6 flex-shrink-0">

      {/* Seletor de empresa */}
      <div ref={refEmpresa} className="relative">
        <button
          onClick={() => setOpenEmpresa(!openEmpresa)}
          className="flex items-center gap-2.5 bg-dark-800 hover:bg-dark-700 border border-dark-600 rounded-xl px-3 py-2 transition-all group"
        >
          <div className="w-6 h-6 bg-brand-600/20 rounded-md flex items-center justify-center flex-shrink-0">
            <Building2 size={13} className="text-brand-400" />
          </div>
          <span className="text-white text-sm font-medium max-w-[180px] truncate">
            {empresaAtiva?.nome || 'Selecionar empresa'}
          </span>
          {/* Indicador Conta Azul */}
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${contaAzulConectado ? 'bg-emerald-400' : 'bg-amber-400'}`} />
          <ChevronDown size={13} className={`text-dark-400 transition-transform flex-shrink-0 ${openEmpresa ? 'rotate-180' : ''}`} />
        </button>

        {openEmpresa && (
          <div className="absolute top-full mt-2 left-0 w-80 bg-dark-800 border border-dark-600 rounded-2xl shadow-2xl z-50 overflow-hidden animate-fade-in">

            {/* Lista de empresas */}
            <div className="px-3 py-2 border-b border-dark-700">
              <p className="text-xs text-dark-500 font-semibold uppercase tracking-wider">Suas empresas</p>
            </div>

            {empresas.length === 0 ? (
              <div className="px-4 py-6 text-center text-dark-500 text-sm">Nenhuma empresa cadastrada</div>
            ) : (
              empresas.map((emp) => (
                <button
                  key={emp.id}
                  onClick={() => { setEmpresaAtiva(emp); setOpenEmpresa(false) }}
                  className="w-full flex items-center gap-3 px-3 py-3 hover:bg-dark-700 transition-colors text-left"
                >
                  <div className="w-8 h-8 bg-brand-600/20 border border-brand-600/30 rounded-lg flex items-center justify-center flex-shrink-0">
                    <span className="text-brand-400 font-bold text-xs">{emp.nome.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{emp.nome}</p>
                    <p className="text-dark-500 text-xs">{emp.cnpj ? formatCNPJ(emp.cnpj) : 'CNPJ não informado'}</p>
                  </div>
                  {empresaAtiva?.id === emp.id && <Check size={14} className="text-emerald-400 flex-shrink-0" />}
                </button>
              ))
            )}
