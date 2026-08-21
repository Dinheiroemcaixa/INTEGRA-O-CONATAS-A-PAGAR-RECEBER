"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Plus, Building2, Loader2, X, CheckCircle2, Edit2, Trash2 } from 'lucide-react'
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
    const { data: gruposData } = await supabase.from('grupos').select('*').order('created_at', { ascending: false })

    const gruposComContagem = await Promise.all(
      (gruposData || []).map(async (g) => {
        const { count } = await supabase.from('empresas').select('id', { count: 'exact', head: true }).eq('grupo_id', g.id)
        return { ...g, totalLojas: count || 0 }
      })
    )

    setGrupos(gruposComContagem)
    setCarregando(false)
  }

  async function handleCriarGrupo() {
    if (!nomeNovoGrupo.trim()) {
      toast.error('Dê um nome para o grupo.')
      return
    }
    setCriando(true)
    try {
      const { data, error } = await supabase.from('grupos').insert({ nome: nomeNovoGrupo.trim() }).select('id').single()
      if (error) throw error
      toast.success('Grupo criado com sucesso!')
      setModalNovoGrupoAberto(false)
      setNomeNovoGrupo('')
      if (data?.id) {
        router.push(`/gestao-pagamentos/${data.id}`)
      } else {
        carregarGrupos()
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar grupo')
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
      toast.error('Dê um nome para o grupo.')
      return
    }
    setSalvandoEdicao(true)
    try {
      const { error } = await supabase.from('grupos').update({ nome: nomeEditado.trim() }).eq('id', grupoEditando.id)
      if (error) throw error
      toast.success('Grupo atualizado!')
      setGrupoEditando(null)
      carregarGrupos()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar grupo')
    } finally {
      setSalvandoEdicao(false)
    }
  }

  async function handleExcluirGrupo(grupo: Grupo) {
    if (!confirm(`Excluir o grupo "${grupo.nome}"? As lojas dele continuam existindo no sistema, só ficam sem grupo.`)) return
    try {
      await supabase.from('empresas').update({ grupo_id: null, grupo_adicionado_em: null }).eq('grupo_id', grupo.id)
      const { error } = await supabase.from('grupos').delete().eq('id', grupo.id)
      if (error) throw error
      toast.success('Grupo excluído!')
      carregarGrupos()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao excluir grupo')
    }
  }

  return (
    <>
      <div className="bg-[#0b0e14] border-b border-dark-700 flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-6">
          <button onClick={() => router.push('/dashboard')} className="flex items-center gap-2 text-dark-300 hover:text-white transition-colors bg-dark-800 px-3 py-1.5 rounded-lg text-sm font-semibold">
            <ArrowLeft size={16} /> Voltar
          </button>
          <div>
            <h1 className="text-xl font-bold text-white leading-tight">Meus Grupos</h1>
            <p className="text-dark-400 text-xs uppercase tracking-wider">Gestão BPO Financeiro</p>
          </div>
        </div>

        <button
          onClick={() => setModalNovoGrupoAberto(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors shadow-lg shadow-blue-900/20"
        >
          <Plus size={16} /> Novo Grupo
        </button>
      </div>

      <div className="p-6 max-w-[1400px] mx-auto animate-fade-in">
        {carregando ? (
          <div className="flex items-center justify-center h-72">
            <Loader2 className="animate-spin text-dark-400" size={32} />
          </div>
        ) : grupos.length === 0 ? (
          <div className="bg-[#11141c] border border-dark-700 rounded-2xl p-16 flex flex-col items-center justify-center gap-4 text-center">
            <Building2 className="text-dark-600" size={40} />
            <p className="text-dark-400 font-semibold">Você ainda não criou nenhum grupo.</p>
            <p className="text-dark-500 text-sm max-w-sm">Um grupo reúne as lojas de um mesmo cliente (ex: "Grupo do Seu Zé"). Crie um grupo e depois adicione as lojas dele.</p>
            <button onClick={() => setModalNovoGrupoAberto(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors">
              <Plus size={16} /> Criar meu primeiro grupo
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className="bg-[#11141c] border border-dark-700 rounded-xl p-4">
                <p className="text-dark-400 text-xs font-semibold mb-1">Grupos</p>
                <p className="text-white text-2xl font-bold">{grupos.length}</p>
              </div>
              <div className="bg-[#11141c] border border-dark-700 rounded-xl p-4">
                <p className="text-dark-400 text-xs font-semibold mb-1">Lojas no total</p>
                <p className="text-white text-2xl font-bold">{grupos.reduce((acc, g) => acc + g.totalLojas, 0)}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {grupos.map(grupo => (
                <div
                  key={grupo.id}
                  onClick={() => router.push(`/gestao-pagamentos/${grupo.id}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter') router.push(`/gestao-pagamentos/${grupo.id}`) }}
                  className="bg-[#11141c] border border-dark-700 hover:border-brand-500 rounded-2xl p-5 text-left transition-all shadow-lg group cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 bg-brand-500/10 border border-brand-500/20 rounded-xl flex items-center justify-center group-hover:bg-brand-500/20 transition-colors">
                      <Building2 size={18} className="text-brand-400" />
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={e => { e.stopPropagation(); abrirEdicaoGrupo(grupo) }}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-dark-400 hover:text-white hover:bg-dark-700 transition-colors"
                        title="Editar grupo"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); handleExcluirGrupo(grupo) }}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-dark-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                        title="Excluir grupo"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <p className="text-white font-bold text-base truncate mb-1">{grupo.nome}</p>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-blue-500/10 text-blue-400">
                    {grupo.totalLojas} {grupo.totalLojas === 1 ? 'loja' : 'lojas'}
                  </span>
                </div>
              ))}

              <button
                onClick={() => setModalNovoGrupoAberto(true)}
                className="border-2 border-dashed border-dark-700 hover:border-brand-500 hover:bg-brand-500/5 rounded-2xl p-5 flex flex-col items-center justify-center gap-2 transition-all text-dark-400 hover:text-brand-400 min-h-[128px]"
              >
                <Plus size={20} />
                <span className="text-sm font-semibold">Novo Grupo</span>
              </button>
            </div>
          </>
        )}
      </div>

      {modalNovoGrupoAberto && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-dark-700">
              <h3 className="text-white font-bold text-lg">Novo Grupo</h3>
              <button onClick={() => setModalNovoGrupoAberto(false)} className="p-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800 transition-all">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-2">
              <label className="text-xs font-semibold text-dark-400 uppercase">Nome do grupo</label>
              <input
                type="text"
                autoFocus
                value={nomeNovoGrupo}
                onChange={e => setNomeNovoGrupo(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCriarGrupo() }}
                placeholder='Ex: "Grupo do Seu Zé"'
                className="w-full bg-dark-800 border border-dark-700 rounded-xl px-4 py-2.5 text-white text-sm focus:border-brand-500 outline-none transition-all"
              />
            </div>
            <div className="p-5 border-t border-dark-700 flex justify-end gap-3">
              <button onClick={() => setModalNovoGrupoAberto(false)} className="px-5 py-2.5 rounded-xl font-semibold bg-dark-800 text-dark-300 hover:text-white hover:bg-dark-700 transition-all">
                Cancelar
              </button>
              <button onClick={handleCriarGrupo} disabled={criando} className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold bg-brand-600 hover:bg-brand-500 text-white shadow-lg shadow-brand-900/30 transition-all disabled:opacity-50">
                {criando ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                {criando ? 'Criando...' : 'Criar Grupo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {grupoEditando && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-dark-700">
              <h3 className="text-white font-bold text-lg">Editar Grupo</h3>
              <button onClick={() => setGrupoEditando(null)} className="p-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800 transition-all">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-2">
              <label className="text-xs font-semibold text-dark-400 uppercase">Nome do grupo</label>
              <input
                type="text"
                autoFocus
                value={nomeEditado}
                onChange={e => setNomeEditado(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSalvarEdicaoGrupo() }}
                placeholder='Ex: "Grupo do Seu Zé"'
                className="w-full bg-dark-800 border border-dark-700 rounded-xl px-4 py-2.5 text-white text-sm focus:border-brand-500 outline-none transition-all"
              />
            </div>
            <div className="p-5 border-t border-dark-700 flex justify-end gap-3">
              <button onClick={() => setGrupoEditando(null)} className="px-5 py-2.5 rounded-xl font-semibold bg-dark-800 text-dark-300 hover:text-white hover:bg-dark-700 transition-all">
                Cancelar
              </button>
              <button onClick={handleSalvarEdicaoGrupo} disabled={salvandoEdicao} className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold bg-brand-600 hover:bg-brand-500 text-white shadow-lg shadow-brand-900/30 transition-all disabled:opacity-50">
                {salvandoEdicao ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                {salvandoEdicao ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
