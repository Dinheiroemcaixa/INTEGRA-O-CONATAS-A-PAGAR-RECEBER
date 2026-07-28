'use client'

import { useState, useEffect } from 'react'
import { Clock, Play, Save, CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useEmpresa } from '@/contexts/EmpresaContext'
import { formatDate } from '@/lib/utils'

interface PainelAgendamentoProps {
  tipo: 'contas_pagar' | 'vendas'
  filtrosAtuais: any
  onTestarAgora?: () => void
}

export default function PainelAgendamento({ tipo, filtrosAtuais }: PainelAgendamentoProps) {
  const { empresaAtiva } = useEmpresa()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [ativo, setAtivo] = useState(false)
  const [acao, setAcao] = useState('importar_e_enviar')
  const [horario, setHorario] = useState('22:00')
  const [dias, setDias] = useState<string[]>(['1','2','3','4','5'])
  const [ultimaExecucao, setUltimaExecucao] = useState<string | null>(null)
  const [ultimoStatus, setUltimoStatus] = useState<string | null>(null)
  const [ultimoLog, setUltimoLog] = useState<any>(null)

  useEffect(() => {
    if (empresaAtiva) carregarAgendamento()
  }, [empresaAtiva])

  const carregarAgendamento = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/agendamentos?empresa_id=${empresaAtiva!.id}&tipo=${tipo}`)
      const { data } = await res.json()
      if (data) {
        setAtivo(data.ativo)
        setAcao(data.acao)
        setHorario(data.horario)
        setDias(data.dias_semana || [])
        setUltimaExecucao(data.ultima_execucao)
        setUltimoStatus(data.ultimo_status)
        setUltimoLog(data.ultimo_log)
      }
    } catch (e: any) {
      toast.error('Erro ao carregar agendamento: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSalvar = async () => {
    setSaving(true)
    try {
      const payload = {
        empresa_id: empresaAtiva!.id,
        tipo,
        ativo,
        acao,
        horario,
        dias_semana: dias,
        // Salva os filtros atuais (passados via props da tela pai)
        ...filtrosAtuais
      }

      const res = await fetch('/api/agendamentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!res.ok) throw new Error('Erro ao salvar agendamento')
      
      toast.success('Agendamento salvo! Filtros atuais foram aplicados.')
    } catch (e: any) {
      toast.error('Erro ao salvar: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleTestar = async () => {
    if (!confirm('Isto executará o agendamento IMEDIATAMENTE. Deseja continuar?')) return
    
    setTesting(true)
    try {
      const res = await fetch('/api/cron/testar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresa_id: empresaAtiva!.id, tipo })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro no teste')

      toast.success('Teste concluído com status: ' + data.status)
      carregarAgendamento() // Recarrega os logs
    } catch (e: any) {
      toast.error('Erro ao testar: ' + e.message)
    } finally {
      setTesting(false)
    }
  }

  const toggleDia = (dia: string) => {
    if (dias.includes(dia)) {
      setDias(dias.filter(d => d !== dia))
    } else {
      setDias([...dias, dia])
    }
  }

  const diasOptions = [
    { v: '1', l: 'Seg' }, { v: '2', l: 'Ter' }, { v: '3', l: 'Qua' },
    { v: '4', l: 'Qui' }, { v: '5', l: 'Sex' }, { v: '6', l: 'Sáb' }, { v: '7', l: 'Dom' }
  ]

  if (!empresaAtiva) return null

  return (
    <div className="bg-dark-900 border border-dark-700 rounded-2xl p-5 mb-6 animate-fade-in shadow-xl shadow-black/20 relative overflow-hidden group">
      {/* Background sutil verde quando ativo */}
      {ativo && (
        <div className="absolute inset-0 bg-brand-500/5 pointer-events-none transition-colors duration-500"></div>
      )}
      
      <div className="relative z-10 flex flex-col md:flex-row gap-6">
        
        {/* Coluna 1: Cabeçalho e Toggle */}
        <div className="md:w-1/3 flex flex-col gap-4 border-b md:border-b-0 md:border-r border-dark-700 pb-4 md:pb-0 md:pr-6">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-bold text-lg flex items-center gap-2">
              <Clock className="text-brand-400" size={20} />
              Automação Diária
            </h3>
            
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={ativo} 
                onChange={(e) => setAtivo(e.target.checked)} 
              />
              <div className="w-11 h-6 bg-dark-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500"></div>
            </label>
          </div>
          
          <p className="text-dark-400 text-sm">
            Execute a importação do DataCar e o envio ao Conta Azul automaticamente de madrugada, usando os mesmos filtros que você usa no manual.
          </p>

          <div className="mt-auto pt-2">
            <button 
              onClick={handleSalvar}
              disabled={saving}
              className={`w-full flex justify-center items-center gap-2 py-2.5 rounded-xl font-semibold transition-all ${ativo ? 'bg-brand-600 hover:bg-brand-500 text-white shadow-lg shadow-brand-900/30' : 'bg-dark-800 text-dark-300 hover:text-white hover:bg-dark-700'}`}
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {saving ? 'Salvando...' : 'Salvar Configuração'}
            </button>
          </div>
        </div>

        {/* Coluna 2: Configurações */}
        <div className="md:w-2/3 flex flex-col gap-5">
          {loading ? (
             <div className="flex justify-center items-center h-full">
               <Loader2 className="animate-spin text-dark-500" />
             </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-dark-400 uppercase tracking-wider">Ação</label>
                  <select 
                    value={acao}
                    onChange={(e) => setAcao(e.target.value)}
                    className="w-full bg-dark-800 border border-dark-700 text-white text-sm rounded-lg p-2.5 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-all"
                  >
                    <option value="importar_e_enviar">Importar do DataCar E Enviar p/ Conta Azul</option>
                    <option value="importar">APENAS Importar do DataCar (Revisar depois)</option>
                    <option value="enviar">APENAS Enviar os Pendentes p/ Conta Azul</option>
                  </select>
                </div>
                
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-dark-400 uppercase tracking-wider">Horário (Brasília)</label>
                  <input 
                    type="time" 
                    value={horario}
                    onChange={(e) => setHorario(e.target.value)}
                    className="w-full bg-dark-800 border border-dark-700 text-white text-sm rounded-lg p-2.5 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-dark-400 uppercase tracking-wider">Dias da Semana</label>
                <div className="flex flex-wrap gap-2">
                  {diasOptions.map(d => (
                    <button
                      key={d.v}
                      onClick={() => toggleDia(d.v)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${dias.includes(d.v) ? 'bg-brand-500/20 text-brand-400 border border-brand-500/50' : 'bg-dark-800 text-dark-400 border border-dark-700 hover:bg-dark-700'}`}
                    >
                      {d.l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Status Box */}
              <div className="flex flex-col sm:flex-row items-center justify-between bg-dark-800 border border-dark-700 rounded-xl p-4 mt-2">
                <div className="flex items-center gap-3">
                  {ultimoStatus === 'sucesso' ? (
                    <CheckCircle className="text-emerald-400" size={24} />
                  ) : ultimoStatus === 'parcial' ? (
                    <AlertCircle className="text-amber-400" size={24} />
                  ) : ultimoStatus === 'erro' ? (
                    <XCircle className="text-rose-400" size={24} />
                  ) : (
                    <Clock className="text-dark-500" size={24} />
                  )}
                  
                  <div>
                    <p className="text-sm text-white font-medium">
                      {ultimaExecucao ? `Última execução: ${formatDate(ultimaExecucao)}` : 'Nunca executado'}
                    </p>
                    {ultimoLog && (
                      <p className="text-xs text-dark-400 mt-0.5">
                        {ultimoLog.erro 
                          ? `Erro: ${ultimoLog.erro}`
                          : `Importados: ${ultimoLog.importados || 0} | Enviados: ${ultimoLog.enviados || 0} | Erros: ${ultimoLog.erros_envio || 0}`
                        }
                      </p>
                    )}
                  </div>
                </div>
                
                <button
                  onClick={handleTestar}
                  disabled={testing}
                  className="mt-3 sm:mt-0 flex items-center gap-1.5 px-3 py-1.5 bg-dark-700 hover:bg-dark-600 border border-dark-600 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-50"
                  title="Executar agora manualmente"
                >
                  {testing ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                  {testing ? 'Testando...' : 'Testar Agora'}
                </button>
              </div>
            </>
          )}
        </div>
        
      </div>
    </div>
  )
}
