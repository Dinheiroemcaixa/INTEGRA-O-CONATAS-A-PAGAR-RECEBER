"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, ArrowRight, Plus, Building2, Loader2, X, CheckCircle2, Edit2, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { Grupo } from '@/types'
import './grupos.css'

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
    <div className="dcx-grp">
      <div className="dcx-grp-in">
        <header className="dcx-grp-top">
          <div className="dcx-grp-id">
            <button type="button" onClick={() => router.push('/dashboard')} className="dcx-grp-back">
              <ArrowLeft size={15} /> Voltar
            </button>
            <h1 className="dcx-grp-h1">Meus Grupos</h1>
            <p className="dcx-grp-sub">Gestão BPO Financeiro</p>
          </div>
          <button type="button" onClick={() => setModalNovoGrupoAberto(true)} className="dcx-grp-btn is-primary">
            <Plus size={16} /> Novo Grupo
          </button>
        </header>

        {carregando ? (
          <div className="dcx-grp-loading">
            <Loader2 className="animate-spin" size={32} />
          </div>
        ) : grupos.length === 0 ? (
          <div className="dcx-grp-empty">
            <div className="dcx-grp-empty-ic"><Building2 size={28} /></div>
            <p className="dcx-grp-empty-t">Você ainda não criou nenhum grupo.</p>
            <p className="dcx-grp-empty-d">Um grupo reúne as lojas de um mesmo cliente (ex: "Grupo do Seu Zé"). Crie um grupo e depois adicione as lojas dele.</p>
            <button type="button" onClick={() => setModalNovoGrupoAberto(true)} className="dcx-grp-btn is-primary">
              <Plus size={16} /> Criar meu primeiro grupo
            </button>
          </div>
        ) : (
          <>
            <div className="dcx-grp-sum">
              <div>
                <small>Grupos</small>
                <b>{grupos.length}</b>
              </div>
              <div>
                <small>Lojas no total</small>
                <b>{grupos.reduce((acc, g) => acc + g.totalLojas, 0)}</b>
              </div>
            </div>

            <div className="dcx-grp-grid">
              {grupos.map(grupo => (
                <div
                  key={grupo.id}
                  onClick={() => router.push(`/gestao-pagamentos/${grupo.id}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter') router.push(`/gestao-pagamentos/${grupo.id}`) }}
                  className="dcx-grp-card"
                >
                  <div className="dcx-grp-ct">
                    <div className="dcx-grp-ic" aria-hidden="true">
                      <Building2 size={20} />
                    </div>
                    <div className="dcx-grp-ac">
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); abrirEdicaoGrupo(grupo) }}
                        title="Editar grupo"
                        aria-label={`Editar grupo ${grupo.nome}`}
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        type="button"
                        className="d"
                        onClick={e => { e.stopPropagation(); handleExcluirGrupo(grupo) }}
                        title="Excluir grupo"
                        aria-label={`Excluir grupo ${grupo.nome}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <div>
                    <p className="dcx-grp-name" title={grupo.nome}>{grupo.nome}</p>
                    <div className="dcx-grp-meta">
                      <span className="dcx-grp-chip">
                        {grupo.totalLojas} {grupo.totalLojas === 1 ? 'loja' : 'lojas'}
                      </span>
                      <ArrowRight size={16} className="dcx-grp-go" aria-hidden="true" />
                    </div>
                  </div>
                </div>
              ))}

              <button type="button" onClick={() => setModalNovoGrupoAberto(true)} className="dcx-grp-add">
                <span className="dcx-grp-add-ic"><Plus size={20} /></span>
                <span>Novo Grupo</span>
              </button>
            </div>
          </>
        )}
      </div>

      {modalNovoGrupoAberto && (
        <div className="dcx-grp-ov">
          <div className="dcx-grp-modal" role="dialog" aria-modal="true" aria-label="Novo Grupo">
            <div className="dcx-grp-mh">
              <h3>Novo Grupo</h3>
              <button type="button" onClick={() => setModalNovoGrupoAberto(false)} className="dcx-grp-x" aria-label="Fechar">
                <X size={20} />
              </button>
            </div>
            <div className="dcx-grp-mb">
              <label htmlFor="grp-novo-nome">Nome do grupo</label>
              <input
                id="grp-novo-nome"
                type="text"
                autoFocus
                value={nomeNovoGrupo}
                onChange={e => setNomeNovoGrupo(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCriarGrupo() }}
                placeholder='Ex: "Grupo do Seu Zé"'
                className="dcx-grp-input"
              />
            </div>
            <div className="dcx-grp-mf">
              <button type="button" onClick={() => setModalNovoGrupoAberto(false)} className="dcx-grp-btn">
                Cancelar
              </button>
              <button type="button" onClick={handleCriarGrupo} disabled={criando} className="dcx-grp-btn is-primary">
                {criando ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                {criando ? 'Criando...' : 'Criar Grupo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {grupoEditando && (
        <div className="dcx-grp-ov">
          <div className="dcx-grp-modal" role="dialog" aria-modal="true" aria-label="Editar Grupo">
            <div className="dcx-grp-mh">
              <h3>Editar Grupo</h3>
              <button type="button" onClick={() => setGrupoEditando(null)} className="dcx-grp-x" aria-label="Fechar">
                <X size={20} />
              </button>
            </div>
            <div className="dcx-grp-mb">
              <label htmlFor="grp-edit-nome">Nome do grupo</label>
              <input
                id="grp-edit-nome"
                type="text"
                autoFocus
                value={nomeEditado}
                onChange={e => setNomeEditado(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSalvarEdicaoGrupo() }}
                placeholder='Ex: "Grupo do Seu Zé"'
                className="dcx-grp-input"
              />
            </div>
            <div className="dcx-grp-mf">
              <button type="button" onClick={() => setGrupoEditando(null)} className="dcx-grp-btn">
                Cancelar
              </button>
              <button type="button" onClick={handleSalvarEdicaoGrupo} disabled={salvandoEdicao} className="dcx-grp-btn is-primary">
                {salvandoEdicao ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                {salvandoEdicao ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
