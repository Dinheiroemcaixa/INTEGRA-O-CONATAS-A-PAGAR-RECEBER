'use client'

import { useEmpresa } from '@/contexts/EmpresaContext'
import { createClient } from '@/lib/supabase/client'
import { useState, useEffect, useCallback } from 'react'
import { Database, Building2, Loader2 } from 'lucide-react'
import ConfiguracoesDatacar from '@/components/datacar/ConfiguracoesDatacar'
import PainelSincronizacao from '@/components/datacar/PainelSincronizacao'

export default function DatacarPage() {
  const { empresas, empresaAtiva, recarregar } = useEmpresa()
  const [empresaSelecionada, setEmpresaSelecionada] = useState<string | null>(null)
  const [dadosEmpresa, setDadosEmpresa] = useState<Record<string, unknown> | null>(null)
  const [carregando, setCarregando] = useState(false)
  const supabase = createClient()

  const empresaId = empresaSelecionada || empresaAtiva?.id || null

  const carregarDadosEmpresa = useCallback(async () => {
    if (!empresaId) return
    setCarregando(true)
    try {
      const { data } = await supabase
        .from('empresas')
        .select('id, nome, datacar_token, datacar_cod_emp, datacar_id_operador')
        .eq('id', empresaId)
        .single()
      setDadosEmpresa(data)
    } catch {
      // silencioso
    } finally {
      setCarregando(false)
    }
  }, [empresaId, supabase])

  useEffect(() => {
    carregarDadosEmpresa()
  }, [carregarDadosEmpresa])

  const handleSalvo = async () => {
    await carregarDadosEmpresa()
    await recarregar()
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-500/20 rounded-xl flex items-center justify-center">
            <Database size={22} className="text-orange-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Datacar</h1>
            <p className="text-dark-400 text-sm mt-0.5">
              Integração automática com o sistema Datacar
            </p>
          </div>
        </div>
      </div>

      {/* Seletor de Empresa */}
      {empresas.length > 1 && (
        <div className="bg-dark-800 border border-dark-700 rounded-xl p-4">
          <label className="text-xs text-dark-400 font-medium mb-2 flex items-center gap-1.5">
            <Building2 size={12} /> Selecione a empresa
          </label>
          <select
            value={empresaId || ''}
            onChange={(e) => setEmpresaSelecionada(e.target.value)}
            className="w-full bg-dark-900 border border-dark-600 rounded-lg px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-orange-500/50 outline-none"
          >
            {empresas.map((emp) => (
              <option key={emp.id} value={emp.id}>{emp.nome}</option>
            ))}
          </select>
        </div>
      )}

      {/* Loading */}
      {carregando && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-orange-400" size={32} />
        </div>
      )}

      {/* Conteúdo */}
      {!carregando && dadosEmpresa && (
        <div className="space-y-6">
          {/* Configurações de Credenciais */}
          <ConfiguracoesDatacar
            empresa={dadosEmpresa as {
              id: string
              nome: string
              datacar_token?: string | null
              datacar_cod_emp?: string | null
              datacar_id_operador?: string | null
            }}
            onSalvo={handleSalvo}
          />

          {/* Painel de Sincronização */}
          <PainelSincronizacao
            empresa={dadosEmpresa as {
              id: string
              nome: string
              datacar_token?: string | null
              datacar_cod_emp?: string | null
              datacar_id_operador?: string | null
            }}
          />
        </div>
      )}

      {/* Sem empresa */}
      {!carregando && !dadosEmpresa && empresas.length === 0 && (
        <div className="py-20 flex flex-col items-center justify-center border-2 border-dashed border-dark-700 rounded-2xl">
          <Building2 size={48} className="text-dark-700 mb-4" />
          <p className="text-dark-400">Nenhuma empresa cadastrada.</p>
          <a href="/empresas?new=true" className="text-orange-400 font-semibold mt-2 hover:text-orange-300 transition-colors">
            Cadastrar empresa
          </a>
        </div>
      )}
    </div>
  )
}
