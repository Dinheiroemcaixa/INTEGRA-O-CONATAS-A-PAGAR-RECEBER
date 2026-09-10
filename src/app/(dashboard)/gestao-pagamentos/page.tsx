"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Plus, Building2, Loader2, X, CheckCircle2, Edit2, Trash2, Users2, Layers } from 'lucide-react'
import toast from 'react-hot-toast'
import { Grupo } from '@/types'

export default function MeusGrupos() {
  const router = useRouter()
  const supabase = createClient()

  const [grupos, setGrupos] = useState<(Grupo & { totalLojas: number })[]>([])
  const [carregando, setCarregando] = useState(true)

  const [modalNovoGrupoAberto, setModalNovoGrupoAberto] = useState(false)
  const [nomeNovoGrupo, setNomeNovoGrupo] = useState('')
  const [criando, setCriando] = useState(false)

  const [grupoEditando, setGrupoEditando] = useState<Grupo | null>(null)
  const [nomeEditado, setNomeEditado] = useState('')
  const [salvandoEdicao, setSalvandoEdicao] = useState(false)

  useEffect(() => {
    carregarGrupos()
  }, [])

  async function carregarGrupos() {
    setCarregando(true)
    try {
      const { data: gruposData, error: gruposError } = await supabase
        .from('grupos')
        .select('*')
        .order('nome', { ascending: true })

      if (gruposError) throw gruposError

      const { data: lojasData, error: lojasError } = await supabase
        .from('empresas')
        .select('grupo_id')

      if (lojasError) throw lojasError

      const contagem: Record<string, number> = {}
      lojasData?.forEach(l => {
        if (l.grupo_id) {
          contagem[l.grupo_id] = (contagem[l.grupo_id] || 0) + 1
        }
      })

      const formatados = (gruposData || []).map(g => ({
        ...g,
        totalLojas: contagem[g.id] || 0
      }))

      setGrupos(formatados)
    } catch (err: any) {
      toast.error('Erro ao carregar grupos: ' + err.message)
    } finally {
      setCarregando(false)
    }
  }

  async function handleCriarGrupo() {
    if (!nomeNovoGrupo.trim()) {
      toast.error('Digite um nome para o grupo')
      return
    }

    setCriando(true)
    try {
      const { error } = await supabase
        .from('grupos')
        .insert({ nome: nomeNovoGrupo.trim() })

      if (error) throw error

      toast.success('Grupo criado com sucesso!')
      setNomeNovoGrupo('')
      setModalNovoGrupoAberto(false)
      carregarGrupos()
    } catch (err: any) {
      toast.error('Erro ao criar grupo: ' + err.message)
    } finally {
      setCriando(false)
    }
  }

  function abrirEdicaoGrupo(grupo: Grupo) {
    setGrupoEditando(grupo)
    setNomeEditado(grupo.nome)
  }

  async function handleSalvarEdicaoGrupo() {
    if (!grupoEditando) return
    if (!nomeEditado.trim()) {
      toast.error('O nome do grupo não pode ficar vazio')
      return
    }

    setSalvandoEdicao(true)
    try {
      const { error } = await supabase
        .from('grupos')
        .update({ nome: nomeEditado.trim() })
        .eq('id', grupoEditando.id)

      if (error) throw error

      toast.success('Grupo atualizado!')
      setGrupoEditando(null)
      carregarGrupos()
    } catch (err: any) {
      toast.error('Erro ao atualizar grupo: ' + err.message)
    } finally {
      setSalvandoEdicao(false)
    }
  }

  async function handleExcluirGrupo(grupo: Grupo & { totalLojas: number }) {
    if (grupo.totalLojas > 0) {
      toast.error(`Este grupo possui ${grupo.totalLojas} loja(s) vinculada(s). Desvincule-as antes de excluir.`)
      return
    }

    if (!confirm(`Tem certeza que deseja excluir o grupo "${grupo.nome}"?`)) return

    try {
      const { error } = await supabase
        .from('grupos')
        .delete()
        .eq('id', grupo.id)

      if (error) throw error

      toast.success('Grupo excluído!')
      carregarGrupos()
    } catch (err: any) {
      toast.error('Erro ao excluir grupo: ' + err.message)
    }
  }

  const totalLojasGeral = grupos.reduce((acc, g) => acc + g.totalLojas, 0)

  return (
    <>
      <div className="space-y-6 max-w-7xl mx-auto animate-fade-in">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-dark-700/60">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-600/20 via-indigo-600/20 to-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 shadow-[0_0_20px_rgba(37,99,235,0.15)]">
              <Users2 size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-black text-white tracking-tight">Gestão de Pagamentos</h1>
                <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono">
                  <Layers size={10} /> Multi-Lojas
                </span>
              </div>
              <p className="text-dark-400 text-xs mt-0.5">
                Organize suas lojas em grupos operacionais para gerenciar e pagar contas centralizadas.
              </p>
            </div>
          </div>

          <button
            onClick={() => setModalNovoGrupoAberto(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg shadow-blue-900/30 hover:shadow-blue-600/30 transition-all active:scale-[0.98] cursor-pointer"
          >
            <Plus size={16} />
            Novo Grupo
          </button>
        </div>

        {/* Conteúdo Principal */}
        {carregando ? (
          <div className="flex flex-col items-center justify-center py-20 bg-dark-900/40 rounded-2xl border border-dark-700/60">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-3" />
            <p className="text-dark-300 text-sm font-medium">Carregando grupos e unidades...</p>
          </div>
        ) : grupos.length === 0 ? (
          <div className="bg-dark-900/40 border border-dark-700/60 rounded-3xl p-12 text-center max-w-lg mx-auto backdrop-blur-sm shadow-xl">
            <div className="w-16 h-16 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4 text-blue-400 shadow-[0_0_30px_rgba(59,130,246,0.15)]">
              <Building2 size={28} />
            </div>
            <h3 className="text-white font-bold text-lg mb-1">Nenhum grupo cadastrado</h3>
            <p className="text-dark-400 text-xs mb-6 max-w-sm mx-auto leading-relaxed">
              Crie grupos (ex: "Rede Centro", "Franquias SP") para organizar suas filiais e lojas em uma visão consolidada.
            </p>
            <button
              onClick={() => setModalNovoGrupoAberto(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg shadow-blue-900/30 transition-all active:scale-[0.98] cursor-pointer"
            >
              <Plus size={16} /> Criar meu primeiro grupo
            </button>
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="glass-card-dark p-4 rounded-2xl border border-dark-700/80 relative overflow-hidden group hover:border-dark-600 transition-all">
                <div className="flex items-center justify-between">
                  <span className="text-dark-400 text-[11px] font-semibold uppercase tracking-wider">Grupos Criados</span>
                  <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                    <Layers size={13} />
                  </div>
                </div>
                <div className="text-2xl font-black text-white font-mono tabular-nums mt-1.5">
                  {grupos.length}
                </div>
                <p className="text-[10px] text-dark-500 mt-0.5">Grupos operacionais ativos</p>
              </div>

              <div className="glass-card-dark p-4 rounded-2xl border border-dark-700/80 relative overflow-hidden group hover:border-dark-600 transition-all">
                <div className="flex items-center justify-between">
                  <span className="text-dark-400 text-[11px] font-semibold uppercase tracking-wider">Total de Lojas</span>
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <Building2 size={13} />
                  </div>
                </div>
                <div className="text-2xl font-black text-emerald-400 font-mono tabular-nums mt-1.5">
                  {totalLojasGeral}
                </div>
                <p className="text-[10px] text-dark-500 mt-0.5">Empresas vinculadas</p>
              </div>
            </div>

            {/* Grid de Grupos */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {grupos.map(grupo => (
                <div
                  key={grupo.id}
                  onClick={() => router.push(`/gestao-pagamentos/${grupo.id}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter') router.push(`/gestao-pagamentos/${grupo.id}`) }}
                  className="bg-dark-900/60 border border-dark-700/80 hover:border-blue-500/50 hover:bg-dark-850/80 rounded-2xl p-5 text-left transition-all duration-200 shadow-lg hover:shadow-blue-500/5 group cursor-pointer backdrop-blur-sm relative overflow-hidden"
                >
                  <div className="flex items-center justify-between mb-3.5">
                    <div className="w-10 h-10 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center justify-center group-hover:bg-blue-500/20 group-hover:border-blue-500/40 text-blue-400 transition-all duration-200">
                      <Building2 size={18} />
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={e => { e.stopPropagation(); abrirEdicaoGrupo(grupo) }}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-dark-400 hover:text-white hover:bg-dark-700 transition-colors"
                        title="Editar grupo"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); handleExcluirGrupo(grupo) }}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-dark-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                        title="Excluir grupo"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  <p className="text-white font-bold text-base truncate mb-2 group-hover:text-blue-300 transition-colors">
                    {grupo.nome}
                  </p>

                  <div className="flex items-center justify-between pt-2 border-t border-dark-800/80">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono">
                      {grupo.totalLojas} {grupo.totalLojas === 1 ? 'loja vinculada' : 'lojas vinculadas'}
                    </span>
                    <span className="text-[11px] text-dark-500 group-hover:text-blue-400 transition-colors font-medium">
                      Acessar →
                    </span>
                  </div>
                </div>
              ))}

              <button
                onClick={() => setModalNovoGrupoAberto(true)}
                className="border-2 border-dashed border-dark-700/80 hover:border-blue-500/60 hover:bg-blue-500/5 rounded-2xl p-5 flex flex-col items-center justify-center gap-2.5 transition-all text-dark-400 hover:text-blue-400 min-h-[140px] group cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-dark-800 border border-dark-700 flex items-center justify-center group-hover:border-blue-500/40 group-hover:bg-blue-500/10 transition-all">
                  <Plus size={18} />
                </div>
                <span className="text-xs font-bold">Novo Grupo</span>
              </button>
            </div>
          </>
        )}
      </div>

      {/* Modal Novo Grupo */}
      {modalNovoGrupoAberto && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-dark-900 border border-dark-700 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-dark-700/80 bg-dark-850/50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                  <Building2 size={16} />
                </div>
                <h3 className="text-white font-bold text-base">Novo Grupo Operacional</h3>
              </div>
              <button 
                onClick={() => setModalNovoGrupoAberto(false)} 
                className="p-1.5 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800 transition-all"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-3">
              <label className="text-[11px] font-bold text-dark-300 uppercase tracking-wider block">
                Nome do grupo
              </label>
              <input
                type="text"
                autoFocus
                value={nomeNovoGrupo}
                onChange={e => setNomeNovoGrupo(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCriarGrupo() }}
                placeholder='Ex: "Rede Sul - Varejo" ou "Grupo Holding"'
                className="w-full bg-dark-950 border border-dark-700 rounded-xl px-4 py-2.5 text-white text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all placeholder:text-dark-500"
              />
            </div>
            <div className="p-5 border-t border-dark-700/80 bg-dark-850/30 flex justify-end gap-2.5">
              <button 
                onClick={() => setModalNovoGrupoAberto(false)} 
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-dark-800 text-dark-300 hover:text-white hover:bg-dark-700 transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={handleCriarGrupo} 
                disabled={criando} 
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg shadow-blue-900/30 transition-all disabled:opacity-50 cursor-pointer"
              >
                {criando ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                {criando ? 'Criando...' : 'Criar Grupo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {grupoEditando && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-dark-900 border border-dark-700 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-dark-700/80 bg-dark-850/50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                  <Edit2 size={16} />
                </div>
                <h3 className="text-white font-bold text-base">Editar Grupo</h3>
              </div>
              <button 
                onClick={() => setGrupoEditando(null)} 
                className="p-1.5 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800 transition-all"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-3">
              <label className="text-[11px] font-bold text-dark-300 uppercase tracking-wider block">
                Nome do grupo
              </label>
              <input
                type="text"
                autoFocus
                value={nomeEditado}
                onChange={e => setNomeEditado(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSalvarEdicaoGrupo() }}
                placeholder='Ex: "Rede Sul - Varejo"'
                className="w-full bg-dark-950 border border-dark-700 rounded-xl px-4 py-2.5 text-white text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all placeholder:text-dark-500"
              />
            </div>
            <div className="p-5 border-t border-dark-700/80 bg-dark-850/30 flex justify-end gap-2.5">
              <button 
                onClick={() => setGrupoEditando(null)} 
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-dark-800 text-dark-300 hover:text-white hover:bg-dark-700 transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={handleSalvarEdicaoGrupo} 
                disabled={salvandoEdicao} 
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg shadow-blue-900/30 transition-all disabled:opacity-50 cursor-pointer"
              >
                {salvandoEdicao ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                {salvandoEdicao ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
