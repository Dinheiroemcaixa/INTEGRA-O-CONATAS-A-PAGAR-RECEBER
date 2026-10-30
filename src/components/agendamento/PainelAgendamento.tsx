'use client'

import { useState, useEffect } from 'react'
import { Clock, Play, Save, CheckCircle, XCircle, AlertCircle, Loader2, X, Settings2, Calendar } from 'lucide-react'
import toast from 'react-hot-toast'
import { useEmpresa } from '@/contexts/EmpresaContext'
import { formatDate } from '@/lib/utils'

interface PainelAgendamentoProps {
  tipo: 'contas_pagar' | 'vendas'
  onTestarAgora?: () => void
}

// Calcula data padrão (7 dias atrás)
function getDefaultDtIni() {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  return d.toISOString().split('T')[0]
}
function getDefaultDtFim() {
  return new Date().toISOString().split('T')[0]
}

export default function PainelAgendamento({ tipo }: PainelAgendamentoProps) {
  const { empresaAtiva } = useEmpresa()
  const [modalOpen, setModalOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [ativo, setAtivo] = useState(false)
  const [acao, setAcao] = useState('importar_e_enviar')
  const [horario, setHorario] = useState('22:00')
  const [dias, setDias] = useState<string[]>(['1','2','3','4','5'])
  
  // === FILTROS CONTAS A PAGAR ===
  const [tipoPeriodoContas, setTipoPeriodoContas] = useState<string>('venc')
  const [statusPagamento, setStatusPagamento] = useState<string>('apagar')
  const [localPagamento, setLocalPagamento] = useState<string>('todos')

  // === FILTROS VENDAS (Produtos e Serviços) ===
  const [tipoPeriodoVendas, setTipoPeriodoVendas] = useState<string>('abertura')
  const [situacaoVendas, setSituacaoVendas] = useState<string>('todas')
  const [filtroTipoItens, setFiltroTipoItens] = useState<string>('tudo')

  // === FILTROS COMUNS ===
  const [dtIni, setDtIni] = useState<string>(getDefaultDtIni())
  const [dtFim, setDtFim] = useState<string>(getDefaultDtFim())

  const [ultimaExecucao, setUltimaExecucao] = useState<string | null>(null)
  const [ultimoStatus, setUltimoStatus] = useState<string | null>(null)
  const [ultimoLog, setUltimoLog] = useState<any>(null)

  useEffect(() => {
    if (empresaAtiva && modalOpen) {
      carregarAgendamento()
    }
  }, [empresaAtiva, modalOpen])

  const carregarAgendamento = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/agendamentos?empresa_id=${empresaAtiva!.id}&tipo=${tipo}`)
      const { data } = await res.json()
      if (data) {
        setAtivo(data.ativo)
        setAcao(data.acao)
        setHorario(data.horario || '22:00')
        setDias(data.dias_semana || ['1','2','3','4','5'])
        setUltimaExecucao(data.ultima_execucao)
        setUltimoStatus(data.ultimo_status)
        setUltimoLog(data.ultimo_log)
        
        // Filtros Contas a Pagar
        if (data.tipo_periodo_contas) setTipoPeriodoContas(data.tipo_periodo_contas)
        if (data.status_pagamento) setStatusPagamento(data.status_pagamento)
        if (data.local_pagamento) setLocalPagamento(data.local_pagamento)

        // Filtros Vendas
        if (data.tipo_periodo_vendas) setTipoPeriodoVendas(data.tipo_periodo_vendas)
        if (data.situacao_vendas) setSituacaoVendas(data.situacao_vendas)
        if (data.filtro_tipo_itens) setFiltroTipoItens(data.filtro_tipo_itens)

        // Datas comuns
        if (data.dt_ini) setDtIni(data.dt_ini)
        if (data.dt_fim) setDtFim(data.dt_fim)
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
      const payload: any = {
        empresa_id: empresaAtiva!.id,
        tipo,
        ativo,
        acao,
        horario,
        dias_semana: dias,
        dt_ini: dtIni,
        dt_fim: dtFim,
      }

      // Adiciona filtros específicos do tipo
      if (tipo === 'contas_pagar') {
        payload.tipo_periodo_contas = tipoPeriodoContas
        payload.status_pagamento = statusPagamento
        payload.local_pagamento = localPagamento
      } else {
        payload.tipo_periodo_vendas = tipoPeriodoVendas
        payload.situacao_vendas = situacaoVendas
        payload.filtro_tipo_itens = filtroTipoItens
      }

      const res = await fetch('/api/agendamentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!res.ok) throw new Error('Erro ao salvar agendamento')
      
      toast.success('Agendamento salvo com sucesso!')
      setModalOpen(false)
    } catch (e: any) {
      toast.error('Erro ao salvar: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleTestar = async () => {
    if (!confirm('Isto executará o agendamento IMEDIATAMENTE usando os filtros salvos. Deseja continuar?')) return
    
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
      carregarAgendamento()
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
    <>
      {/* Botão de Abertura */}
      <button 
        onClick={() => setModalOpen(true)}
        className="dx-btn mb-4"
      >
        <Settings2 size={16} />
        Configurar Automação Diária
      </button>

      {/* Modal */}
      {modalOpen && (
        <div className="dx-modal-back z-[100]">
          <div className="dx-modal is-xl dx-modal-form animate-fade-in">
            
            {/* Header */}
            <div className="dx-modal-head shrink-0">
              <div className="flex items-center gap-3">
                <div className={`dx-ico-box ${ativo ? 'is-ok' : ''}`}>
                  <Clock size={18} />
                </div>
                <div>
                  <h3 className="dx-modal-title">
                    Automação Diária — {tipo === 'contas_pagar' ? 'Contas a Pagar' : 'Vendas'}
                  </h3>
                  <p className="dx-modal-sub">Configure os filtros e horário do robô automático</p>
                </div>
              </div>
              <button onClick={() => setModalOpen(false)} className="dx-btn-icon">
                <X size={20} />
              </button>
            </div>

            {/* Conteúdo scrollable */}
            <div className="dx-modal-body custom-scrollbar flex flex-col gap-6">
              {loading ? (
                <div className="flex justify-center items-center py-10">
                  <Loader2 className="animate-spin text-[var(--dx-muted)]" size={30} />
                </div>
              ) : (
                <>
                  {/* Toggle Ativar */}
                  <div className="dx-box flex items-center justify-between">
                    <div>
                      <p className="text-[var(--dx-ink)] font-semibold">Ativar Automação</p>
                      <p className="text-[var(--dx-muted)] text-xs mt-0.5">O robô executará essa rotina automaticamente.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={ativo} 
                        onChange={(e) => setAtivo(e.target.checked)} 
                      />
                      <div className="w-11 h-6 bg-[var(--dx-line)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[var(--dx-line)] after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--dx-primary)]"></div>
                    </label>
                  </div>

                  {/* ==========================================
                      SEÇÃO 1: QUANDO EXECUTAR
                  ========================================== */}
                  <div className="space-y-4">
                    <h4 className="text-sm font-bold text-[var(--dx-title)] border-b border-[var(--dx-line)] pb-2">Quando Executar</h4>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="dx-label">Ação</label>
                        <select 
                          value={acao}
                          onChange={(e) => setAcao(e.target.value)}
                          className="dx-control"
                        >
                          <option value="importar_e_enviar">Importar do DataCar E Enviar p/ Conta Azul</option>
                          <option value="importar">APENAS Importar do DataCar</option>
                          <option value="enviar">APENAS Enviar os Pendentes p/ Conta Azul</option>
                        </select>
                      </div>
                      
                      <div>
                        <label className="dx-label">Horário (Brasília)</label>
                        <input 
                          type="time" 
                          value={horario}
                          onChange={(e) => setHorario(e.target.value)}
                          className="dx-control"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="dx-label">Dias da Semana</label>
                      <div className="flex flex-wrap gap-2">
                        {diasOptions.map(d => (
                          <button
                            key={d.v}
                            onClick={() => toggleDia(d.v)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border cursor-pointer ${dias.includes(d.v) ? 'bg-[var(--dx-selected)] text-[var(--dx-link)] border-[var(--dx-link)]' : 'bg-[var(--dx-card)] text-[var(--dx-muted)] border-[var(--dx-line)] hover:bg-[var(--dx-soft)] hover:text-[var(--dx-ink)]'}`}
                          >
                            {d.l}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* ==========================================
                      SEÇÃO 2: FILTROS DE BUSCA (específicos por card)
                  ========================================== */}
                  <div className="space-y-4">
                    <h4 className="text-sm font-bold text-[var(--dx-title)] border-b border-[var(--dx-line)] pb-2">
                      Filtros de Busca — {tipo === 'contas_pagar' ? 'Contas a Pagar' : 'Vendas'}
                    </h4>

                    {/* ===== FILTROS CONTAS A PAGAR ===== */}
                    {tipo === 'contas_pagar' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="dx-label">Por data de:</label>
                          <select 
                            value={tipoPeriodoContas}
                            onChange={(e) => setTipoPeriodoContas(e.target.value)}
                            className="dx-control"
                          >
                            <option value="venc">Vencimento</option>
                            <option value="emis">Emissão</option>
                            <option value="pgto">Pagamento</option>
                            <option value="digit">Digitação no Sistema</option>
                          </select>
                        </div>
                        
                        <div>
                          <label className="dx-label">Pagamento:</label>
                          <select 
                            value={statusPagamento}
                            onChange={(e) => setStatusPagamento(e.target.value)}
                            className="dx-control"
                          >
                            <option value="apagar">A pagar</option>
                            <option value="pagas">Pagas</option>
                            <option value="todas">A pagar e pagas</option>
                          </select>
                        </div>

                        <div>
                          <label className="dx-label">Local:</label>
                          <select 
                            value={localPagamento}
                            onChange={(e) => setLocalPagamento(e.target.value)}
                            className="dx-control"
                          >
                            <option value="todos">(Todos)</option>
                            <option value="BANCO">BANCO</option>
                            <option value="CARTEIRA">CARTEIRA</option>
                            <option value="TRANSFERENCIA">TRANSFERENCIA</option>
                          </select>
                        </div>
                      </div>
                    )}

                    {/* ===== FILTROS VENDAS (Produtos e Serviços) ===== */}
                    {tipo === 'vendas' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="dx-label">Tipo período:</label>
                          <select 
                            value={tipoPeriodoVendas}
                            onChange={(e) => setTipoPeriodoVendas(e.target.value)}
                            className="dx-control"
                          >
                            <option value="abertura">Abertura</option>
                            <option value="previsao">Previsão</option>
                            <option value="conclusao">Conclusão</option>
                            <option value="encerramento">Encerramento</option>
                            <option value="cancelamento">Cancelamento</option>
                          </select>
                        </div>

                        <div>
                          <label className="dx-label">Situação:</label>
                          <select 
                            value={situacaoVendas}
                            onChange={(e) => setSituacaoVendas(e.target.value)}
                            className="dx-control"
                          >
                            <option value="todas">Todas</option>
                            <option value="em_andamento">Em Andamento</option>
                            <option value="concluida">Concluída</option>
                            <option value="encerrada">Encerrada</option>
                            <option value="cancelada">Cancelada</option>
                          </select>
                        </div>

                        <div>
                          <label className="dx-label">Itens a Enviar:</label>
                          <select 
                            value={filtroTipoItens}
                            onChange={(e) => setFiltroTipoItens(e.target.value)}
                            className="dx-control"
                          >
                            <option value="tudo">Produtos e Serviços</option>
                            <option value="produtos">Apenas Produtos</option>
                            <option value="servicos">Apenas Serviços</option>
                          </select>
                        </div>
                      </div>
                    )}

                    {/* Datas (comuns a todos os cards) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="dx-label">Data Início</label>
                        <div className="relative">
                          <Calendar size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--dx-muted)] pointer-events-none" />
                          <input
                            type="date"
                            value={dtIni}
                            onChange={(e) => setDtIni(e.target.value)}
                            className="dx-control has-icon"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="dx-label">Data Fim</label>
                        <div className="relative">
                          <Calendar size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--dx-muted)] pointer-events-none" />
                          <input
                            type="date"
                            value={dtFim}
                            onChange={(e) => setDtFim(e.target.value)}
                            className="dx-control has-icon"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Status Box */}
                  <div className="dx-box flex flex-col sm:flex-row items-center justify-between mt-2">
                    <div className="flex items-center gap-3">
                      {ultimoStatus === 'sucesso' ? (
                        <CheckCircle className="text-[var(--dx-ok)]" size={24} />
                      ) : ultimoStatus === 'parcial' ? (
                        <AlertCircle className="text-[var(--dx-warn)]" size={24} />
                      ) : ultimoStatus === 'erro' ? (
                        <XCircle className="text-[var(--dx-bad)]" size={24} />
                      ) : (
                        <Clock className="text-[var(--dx-muted)]" size={24} />
                      )}
                      
                      <div>
                        <p className="text-sm text-[var(--dx-ink)] font-semibold">
                          {ultimaExecucao ? `Última execução: ${formatDate(ultimaExecucao)}` : 'Nunca executado'}
                        </p>
                        {ultimoLog && (
                          <p className="text-xs text-[var(--dx-muted)] mt-0.5">
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
                      className="dx-btn is-sm mt-3 sm:mt-0"
                      title="Executar agora manualmente usando esses filtros"
                    >
                      {testing ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                      {testing ? 'Testando...' : 'Testar Agora'}
                    </button>
                  </div>
                </>
              )}
            </div>
            
            {/* Footer */}
            <div className="dx-modal-foot shrink-0">
              <button 
                onClick={() => setModalOpen(false)}
                className="dx-btn"
              >
                Cancelar
              </button>
              <button 
                onClick={handleSalvar}
                disabled={saving || loading}
                className="dx-btn is-primary"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {saving ? 'Salvando...' : 'Salvar Configuração'}
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  )
}
