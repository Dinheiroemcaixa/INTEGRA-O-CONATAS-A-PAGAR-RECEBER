'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Empresa } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { parseFornecedoresArquivo } from '@/lib/parsers/fornecedores-contaazul'
import { 
  Users, 
  RefreshCw, 
  Upload, 
  Trash2, 
  Search, 
  CheckCircle2, 
  AlertCircle, 
  FileSpreadsheet, 
  ArrowRight, 
  Loader2,
  Database
} from 'lucide-react'
import toast from 'react-hot-toast'

interface AbaFornecedoresProps {
  empresa: Empresa
}

export function AbaFornecedores({ empresa }: AbaFornecedoresProps) {
  const supabase = createClient()

  const [totalFornecedores, setTotalFornecedores] = useState<number | null>(null)
  const [regrasDepara, setRegrasDepara] = useState<any[]>([])
  const [carregandoDepara, setCarregandoDepara] = useState(false)
  const [sincronizando, setSincronizando] = useState(false)
  const [importando, setImportando] = useState(false)
  const [limpando, setLimpando] = useState(false)
  const [filtroRegra, setFiltroRegra] = useState('')

  // Carregar contagem de fornecedores
  const carregarTotalFornecedores = useCallback(async () => {
    try {
      const { count, error } = await supabase
        .from('fornecedores_contaazul')
        .select('*', { count: 'exact', head: true })
        .eq('empresa_id', empresa.id)

      if (!error && count !== null) {
        setTotalFornecedores(count)
      }
    } catch {
      // silencioso
    }
  }, [empresa.id, supabase])

  // Carregar regras De-Para
  const carregarRegrasDepara = useCallback(async () => {
    setCarregandoDepara(true)
    try {
      const res = await fetch(`/api/fornecedor-depara?empresa_id=${empresa.id}`)
      const json = await res.json()
      if (json.data) {
        setRegrasDepara(json.data)
      }
    } catch {
      toast.error('Erro ao carregar regras De-Para.')
    } finally {
      setCarregandoDepara(false)
    }
  }, [empresa.id])

  useEffect(() => {
    carregarTotalFornecedores()
    carregarRegrasDepara()
  }, [carregarTotalFornecedores, carregarRegrasDepara])

  // Excluir regra De-Para individual
  const handleExcluirRegraDepara = async (id: string, nomeOriginal: string) => {
    if (!confirm(`Remover a regra De-Para para "${nomeOriginal}"?`)) return

    try {
      const res = await fetch(`/api/fornecedor-depara?id=${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Regra De-Para removida com sucesso!')
        carregarRegrasDepara()
      } else {
        toast.error('Erro ao excluir regra.')
      }
    } catch {
      toast.error('Erro ao excluir regra.')
    }
  }

  // Sincronizar contatos via API do Conta Azul
  const handleSincronizarContaAzul = async () => {
    if (!empresa.conta_azul_connected && !empresa.access_token_conta_azul) {
      toast.error('Esta empresa não está conectada ao Conta Azul.')
      return
    }

    setSincronizando(true)
    try {
      const res = await fetch('/api/conta-azul/fornecedores/sincronizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresa_id: empresa.id })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        toast.success(data.message || `${data.count} fornecedores sincronizados com sucesso!`)
        carregarTotalFornecedores()
      } else {
        toast.error(data.error || 'Erro ao sincronizar fornecedores')
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao conectar à API do Conta Azul')
    } finally {
      setSincronizando(false)
    }
  }

  // Importar Planilha de Fornecedores XLSX/CSV
  const handleImportarPlanilha = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImportando(true)
    try {
      const fornecedores = await parseFornecedoresArquivo(file)
      if (fornecedores.length === 0) {
        toast.error('Nenhum fornecedor válido encontrado no arquivo.')
        return
      }

      // Limpa anteriores e insere novos
      await supabase.from('fornecedores_contaazul').delete().eq('empresa_id', empresa.id)

      const tamanhoLote = 500
      for (let i = 0; i < fornecedores.length; i += tamanhoLote) {
        const lote = fornecedores.slice(i, i + tamanhoLote).map(f => ({
          empresa_id: empresa.id,
          nome: f.nome,
          cnpj_cpf: f.cnpj || null,
        }))
        const { error } = await supabase.from('fornecedores_contaazul').insert(lote)
        if (error) throw error
      }

      toast.success(`${fornecedores.length} fornecedores importados com sucesso!`)
      carregarTotalFornecedores()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao importar arquivo de fornecedores')
    } finally {
      setImportando(false)
      e.target.value = ''
    }
  }

  // Limpar Fornecedores
  const handleLimparFornecedores = async () => {
    if (!confirm(`Tem certeza que deseja remover todos os fornecedores da empresa "${empresa.nome}"?`)) return

    setLimpando(true)
    try {
      await supabase.from('fornecedores_contaazul').delete().eq('empresa_id', empresa.id)
      toast.success('Lista de fornecedores esvaziada.')
      carregarTotalFornecedores()
    } catch {
      toast.error('Erro ao remover fornecedores')
    } finally {
      setLimpando(false)
    }
  }

  // Filtrar regras De-Para
  const regrasFiltradas = regrasDepara.filter(r => {
    if (!filtroRegra.trim()) return true
    const q = filtroRegra.toLowerCase()
    return (
      (r.nome_original || '').toLowerCase().includes(q) ||
      (r.nome_conta_azul || '').toLowerCase().includes(q) ||
      (r.conta_azul_contato_id || '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-6">
      {/* 1. CARDS DE MÉTRICAS & INDICADORES */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-dark-850/80 border border-dark-700/60 p-4 rounded-xl flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <Users size={20} />
          </div>
          <div>
            <span className="text-xs text-dark-400 block font-medium">Contatos no Banco</span>
            <span className="text-base font-semibold text-white">
              {totalFornecedores !== null ? totalFornecedores.toLocaleString('pt-BR') : '...'}
            </span>
          </div>
        </div>

        <div className="bg-dark-850/80 border border-dark-700/60 p-4 rounded-xl flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Database size={20} />
          </div>
          <div>
            <span className="text-xs text-dark-400 block font-medium">Regras De/Para Ativas</span>
            <span className="text-xl font-bold text-emerald-400">
              {regrasDepara.length.toLocaleString('pt-BR')}
            </span>
          </div>
        </div>

        <div className="bg-dark-850/80 border border-dark-700/60 p-4 rounded-xl flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
            <RefreshCw size={20} />
          </div>
          <div>
            <span className="text-xs text-dark-400 block font-medium">Sincronização Conta Azul</span>
            <span className="text-sm font-semibold text-white flex items-center gap-1 mt-0.5">
              {empresa.conta_azul_connected ? (
                <span className="text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 size={14} /> Ativa via API V2
                </span>
              ) : (
                <span className="text-dark-400 flex items-center gap-1">
                  <AlertCircle size={14} /> Desconectado
                </span>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* 2. BARRA DE AÇÕES: SINCRONIZAR, IMPORTAR, LIMPAR */}
      <div className="bg-dark-850/80 border border-dark-700/60 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h4 className="font-semibold text-white text-base">Ações de Fornecedores & Catálogo</h4>
            <p className="text-[13px] text-dark-400 mt-0.5">Mantenha a lista de contatos do Conta Azul sincronizada com as duplicatas do Datacar</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Sincronizar com Conta Azul */}
            <button
              type="button"
              onClick={handleSincronizarContaAzul}
              disabled={sincronizando}
              className="h-10 px-4 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 shadow-sm"
            >
              <RefreshCw size={14} className={sincronizando ? 'animate-spin' : ''} />
              <span>{sincronizando ? 'Sincronizando...' : 'Sincronizar com Conta Azul'}</span>
            </button>

            {/* Importar Planilha */}
            <label className={`h-10 px-4 bg-dark-900 hover:bg-dark-800 text-white border border-dark-700 hover:border-dark-600 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 cursor-pointer ${
              importando ? 'opacity-50 pointer-events-none' : ''
            }`}>
              <Upload size={14} className="text-emerald-400" />
              <span>{importando ? 'Importando...' : 'Importar Planilha XLSX'}</span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleImportarPlanilha}
                className="hidden"
                disabled={importando}
              />
            </label>

            {/* Limpar Fornecedores */}
            {totalFornecedores !== null && totalFornecedores > 0 && (
              <button
                type="button"
                onClick={handleLimparFornecedores}
                disabled={limpando}
                className="px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5"
              >
                <Trash2 size={14} />
                <span>{limpando ? 'Limpando...' : 'Limpar'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 3. TABELA DE REGRAS DE-PARA */}
      <div className="bg-dark-800/80 border border-dark-700/70 rounded-2xl overflow-hidden space-y-3 p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h4 className="font-semibold text-white text-sm">Regras de Inteligência De/Para</h4>
            <p className="text-[13px] text-dark-400 mt-0.5">Mapeamento automático de nomes do Datacar para contatos oficiais do Conta Azul</p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
            <input
              type="text"
              value={filtroRegra}
              onChange={(e) => setFiltroRegra(e.target.value)}
              placeholder="Filtrar regras por nome..."
              className="w-full bg-dark-900 border border-dark-600 rounded-xl pl-8 pr-3 py-1.5 text-white text-xs focus:ring-2 focus:ring-blue-500/50 outline-none placeholder:text-dark-500"
            />
          </div>
        </div>

        {carregandoDepara ? (
          <div className="py-12 text-center text-dark-400 text-xs flex items-center justify-center gap-2">
            <Loader2 size={16} className="animate-spin text-blue-400" />
            <span>Carregando regras De-Para...</span>
          </div>
        ) : regrasFiltradas.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-dark-700/60 max-h-96 overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-dark-900/90 text-dark-300 font-semibold uppercase tracking-wider text-xs sticky top-0 border-b border-dark-700/60 z-10">
                <tr>
                  <th className="py-2.5 px-3">Nome Original (Datacar)</th>
                  <th className="py-2.5 px-3">Fornecedor Mapeado (Conta Azul)</th>
                  <th className="py-2.5 px-3 text-center">ID Contato CA</th>
                  <th className="py-2.5 px-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-700/40 text-dark-200">
                {regrasFiltradas.map((regra) => (
                  <tr key={regra.id} className="hover:bg-dark-750/60 transition-colors">
                    <td className="py-2 px-3 font-medium text-white max-w-[220px] truncate">
                      {regra.nome_original}
                    </td>
                    <td className="py-2 px-3 text-emerald-300 flex items-center gap-1.5 max-w-[240px] truncate">
                      <ArrowRight size={12} className="text-dark-400 flex-shrink-0" />
                      <span className="truncate">{regra.nome_conta_azul}</span>
                    </td>
                    <td className="py-2 px-3 text-center font-mono text-xs text-dark-400">
                      {regra.conta_azul_contato_id ? (
                        <span className="bg-dark-900/80 px-2 py-0.5 rounded border border-dark-700 text-emerald-400">
                          {regra.conta_azul_contato_id.slice(0, 10)}...
                        </span>
                      ) : (
                        <span className="text-dark-500">—</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleExcluirRegraDepara(regra.id, regra.nome_original)}
                        title="Remover regra De-Para"
                        className="p-1.5 text-dark-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-10 text-center text-dark-400 text-xs bg-dark-900/40 rounded-xl border border-dark-700/40">
            <FileSpreadsheet size={28} className="mx-auto mb-2 text-dark-500" />
            <p className="font-medium text-dark-300">
              {filtroRegra ? 'Nenhuma regra encontrada para este filtro.' : 'Nenhuma regra De-Para cadastrada para esta empresa.'}
            </p>
            <p className="text-xs text-dark-500 mt-1">
              As regras são aprendidas automaticamente ao associar fornecedores na tela de Contas a Pagar.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
