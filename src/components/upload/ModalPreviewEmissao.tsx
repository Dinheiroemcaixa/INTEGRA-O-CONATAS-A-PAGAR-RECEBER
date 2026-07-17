'use client'

import React, { useState, useEffect } from 'react'
import { X, Send, AlertCircle, Eye, FileText, CheckCircle, ChevronRight, ChevronLeft, Save } from 'lucide-react'

interface ModalPreviewEmissaoProps {
  vendas: any[]
  empresaId: string
  aliquotaSimplesDefault: string
  aliquotaIssqnDefault: string
  onClose: () => void
  onConfirm: (vendasEditadas: any[]) => void
  enviando: boolean
}

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)

export default function ModalPreviewEmissao({
  vendas,
  empresaId,
  aliquotaSimplesDefault,
  aliquotaIssqnDefault,
  onClose,
  onConfirm,
  enviando,
}: ModalPreviewEmissaoProps) {
  const [currentIndex, setCurrentIndex] = useState(0)

  // Estado editável para cada venda
  const [editaveis, setEditaveis] = useState<any[]>([])

  useEffect(() => {
    if (vendas && vendas.length > 0) {
      setEditaveis(
        vendas.map((v) => ({
          ...v,
          _fiscal: {
            codigoTributarioNacional: '14.01.01',
            codigoComplementar: '14.01.01.001',
            nbs: '120013110',
            aliquotaSimples: aliquotaSimplesDefault || '11.34',
            aliquotaIssqn: aliquotaIssqnDefault || '',
            retencaoIssqn: 'nao', // 'sim' | 'nao'
            regime: 'simples',
            intermediario: 'nao_informado',
            paisPrestacao: 'Brasil',
            municipioPrestacao: v.dados_datacar?.cliente_cidade || '',
            // Cliente editável
            clienteNome: v.cliente || '',
            clienteCpfCnpj: v.dados_datacar?.cliente_cpf_cnpj || v.cliente_cpf_cnpj || '',
            clienteCep: v.dados_datacar?.cliente_cep || '',
            clienteLogradouro: v.dados_datacar?.cliente_logradouro || '',
            clienteNumero: v.dados_datacar?.cliente_numero || '',
            clienteBairro: v.dados_datacar?.cliente_bairro || '',
            clienteCidade: v.dados_datacar?.cliente_cidade || '',
            clienteUf: v.dados_datacar?.cliente_uf || '',
          },
        }))
      )
    }
  }, [vendas, aliquotaSimplesDefault, aliquotaIssqnDefault])

  if (!editaveis || editaveis.length === 0) return null

  const venda = editaveis[currentIndex]
  const fiscal = venda._fiscal

  const updateFiscal = (field: string, value: string) => {
    setEditaveis((prev) => {
      const next = [...prev]
      next[currentIndex] = {
        ...next[currentIndex],
        _fiscal: { ...next[currentIndex]._fiscal, [field]: value },
      }
      return next
    })
  }

  // Aplica config do item atual para todas as vendas seguintes
  const aplicarParaTodas = () => {
    const fiscalAtual = editaveis[currentIndex]._fiscal
    setEditaveis((prev) =>
      prev.map((v, i) =>
        i === currentIndex
          ? v
          : {
              ...v,
              _fiscal: {
                ...v._fiscal,
                codigoTributarioNacional: fiscalAtual.codigoTributarioNacional,
                codigoComplementar: fiscalAtual.codigoComplementar,
                nbs: fiscalAtual.nbs,
                aliquotaSimples: fiscalAtual.aliquotaSimples,
                aliquotaIssqn: fiscalAtual.aliquotaIssqn,
                retencaoIssqn: fiscalAtual.retencaoIssqn,
                regime: fiscalAtual.regime,
                intermediario: fiscalAtual.intermediario,
              },
            }
      )
    )
  }

  const inputClass =
    'w-full bg-dark-900 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-all'
  const selectClass =
    'w-full bg-dark-900 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white focus:border-brand-500 outline-none transition-all'
  const labelClass = 'text-[11px] font-semibold text-dark-400 uppercase tracking-wider block mb-1'

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-5xl flex flex-col max-h-[92vh] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-dark-700/50 bg-gradient-to-r from-brand-900/20 to-dark-900">
          <div className="flex items-center gap-3">
            <div className="bg-brand-500/20 p-2.5 rounded-xl text-brand-400">
              <Eye size={22} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Analisar e Editar NFS-e</h3>
              <p className="text-xs text-dark-400">
                Preencha ou corrija todos os campos antes de confirmar a emissão
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-dark-400 hover:text-white rounded-lg hover:bg-dark-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1 custom-scrollbar">
          {/* Nav entre notas */}
          {editaveis.length > 1 && (
            <div className="flex items-center justify-between bg-dark-800/50 rounded-xl p-3 border border-dark-700">
              <button
                onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                disabled={currentIndex === 0}
                className="p-1.5 text-dark-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={20} />
              </button>
              <div className="text-center">
                <span className="text-sm font-semibold text-brand-400">
                  Nota {currentIndex + 1} de {editaveis.length}
                </span>
                <span className="text-xs text-dark-400 block">{venda.cliente}</span>
              </div>
              <button
                onClick={() => setCurrentIndex((i) => Math.min(editaveis.length - 1, i + 1))}
                disabled={currentIndex === editaveis.length - 1}
                className="p-1.5 text-dark-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          )}

          {/* ═══ SEÇÃO 1: DADOS DA EMISSÃO ═══ */}
          <div className="bg-dark-800 rounded-xl p-4 border border-dark-700 space-y-4">
            <h4 className="text-xs font-bold text-dark-300 uppercase tracking-wider flex items-center gap-2">
              <FileText size={14} className="text-brand-400" /> Dados da Emissão
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>Data de Emissão (Competência)</label>
                <input type="text" readOnly value={new Date().toLocaleDateString('pt-BR')} className={`${inputClass} opacity-60 cursor-not-allowed`} />
              </div>
              <div>
                <label className={labelClass}>Regime de Apuração</label>
                <select value={fiscal.regime} onChange={(e) => updateFiscal('regime', e.target.value)} className={selectClass}>
                  <option value="simples">Simples Nacional</option>
                  <option value="lucro_presumido">Lucro Presumido</option>
                  <option value="lucro_real">Lucro Real</option>
                  <option value="mei">MEI</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Intermediário do Serviço</label>
                <select value={fiscal.intermediario} onChange={(e) => updateFiscal('intermediario', e.target.value)} className={selectClass}>
                  <option value="nao_informado">Não Informado</option>
                  <option value="informado">Informado</option>
                </select>
              </div>
            </div>
          </div>

          {/* ═══ SEÇÃO 2: ENQUADRAMENTO FISCAL ═══ */}
          <div className="bg-dark-800 rounded-xl p-4 border border-dark-700 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-dark-300 uppercase tracking-wider flex items-center gap-2">
                <CheckCircle size={14} className="text-emerald-400" /> Enquadramento Fiscal (Serviço)
              </h4>
              {editaveis.length > 1 && (
                <button
                  onClick={aplicarParaTodas}
                  className="text-[10px] font-bold text-brand-400 bg-brand-500/10 hover:bg-brand-500/20 px-3 py-1 rounded-lg transition-colors"
                >
                  Aplicar para todas as {editaveis.length} notas
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>Código Tributação Nacional</label>
                <input
                  type="text"
                  value={fiscal.codigoTributarioNacional}
                  onChange={(e) => updateFiscal('codigoTributarioNacional', e.target.value)}
                  className={inputClass}
                  placeholder="Ex: 14.01.01"
                />
              </div>
              <div>
                <label className={labelClass}>Código Complementar Municipal</label>
                <input
                  type="text"
                  value={fiscal.codigoComplementar}
                  onChange={(e) => updateFiscal('codigoComplementar', e.target.value)}
                  className={inputClass}
                  placeholder="Ex: 14.01.01.001"
                />
              </div>
              <div>
                <label className={labelClass}>NBS (Nomenclatura Brasileira de Serviços)</label>
                <input
                  type="text"
                  value={fiscal.nbs}
                  onChange={(e) => updateFiscal('nbs', e.target.value)}
                  className={inputClass}
                  placeholder="Ex: 120013110"
                />
              </div>
            </div>
          </div>

          {/* ═══ SEÇÃO 3: TOMADOR (CLIENTE) ═══ */}
          <div className="bg-dark-800 rounded-xl p-4 border border-dark-700 space-y-4">
            <h4 className="text-xs font-bold text-dark-300 uppercase tracking-wider">
              Dados do Tomador (Cliente)
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Nome / Razão Social</label>
                <input type="text" value={fiscal.clienteNome} onChange={(e) => updateFiscal('clienteNome', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>CPF / CNPJ</label>
                <input type="text" value={fiscal.clienteCpfCnpj} onChange={(e) => updateFiscal('clienteCpfCnpj', e.target.value)} className={inputClass} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className={labelClass}>CEP</label>
                <input type="text" value={fiscal.clienteCep} onChange={(e) => updateFiscal('clienteCep', e.target.value)} className={inputClass} />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Logradouro</label>
                <input type="text" value={fiscal.clienteLogradouro} onChange={(e) => updateFiscal('clienteLogradouro', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Número</label>
                <input type="text" value={fiscal.clienteNumero} onChange={(e) => updateFiscal('clienteNumero', e.target.value)} className={inputClass} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>Bairro</label>
                <input type="text" value={fiscal.clienteBairro} onChange={(e) => updateFiscal('clienteBairro', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Cidade / Município</label>
                <input type="text" value={fiscal.clienteCidade} onChange={(e) => updateFiscal('clienteCidade', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>UF</label>
                <input type="text" maxLength={2} value={fiscal.clienteUf} onChange={(e) => updateFiscal('clienteUf', e.target.value.toUpperCase())} className={inputClass} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>País de Prestação</label>
                <input type="text" value={fiscal.paisPrestacao} onChange={(e) => updateFiscal('paisPrestacao', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Município de Prestação do Serviço</label>
                <input type="text" value={fiscal.municipioPrestacao} onChange={(e) => updateFiscal('municipioPrestacao', e.target.value)} className={inputClass} />
              </div>
            </div>
          </div>

          {/* ═══ SEÇÃO 4: VALORES E TRIBUTOS ═══ */}
          <div className="bg-dark-800 rounded-xl p-4 border border-dark-700 border-l-4 border-l-brand-500 space-y-4">
            <h4 className="text-xs font-bold text-dark-300 uppercase tracking-wider">
              Valores e Tributos Municipais / Federais
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className={labelClass}>Valor Total da Nota</label>
                <div className="text-xl font-bold text-white mt-1">{formatCurrency(venda.valor_total)}</div>
              </div>
              <div>
                <label className={labelClass}>Alíquota Simples Nacional (%)</label>
                <input
                  type="text"
                  value={fiscal.aliquotaSimples}
                  onChange={(e) => updateFiscal('aliquotaSimples', e.target.value)}
                  className={inputClass}
                  placeholder="Ex: 11.34"
                />
              </div>
              <div>
                <label className={labelClass}>Alíquota ISSQN (%)</label>
                <input
                  type="text"
                  value={fiscal.aliquotaIssqn}
                  onChange={(e) => updateFiscal('aliquotaIssqn', e.target.value)}
                  className={inputClass}
                  placeholder="Vazio = sem ISSQN"
                />
              </div>
              <div>
                <label className={labelClass}>Retenção do ISSQN</label>
                <select value={fiscal.retencaoIssqn} onChange={(e) => updateFiscal('retencaoIssqn', e.target.value)} className={selectClass}>
                  <option value="nao">Não Retido</option>
                  <option value="sim">Retido pelo Tomador</option>
                </select>
              </div>
            </div>
          </div>

          {/* ═══ SEÇÃO 5: CORPO DA NOTA ═══ */}
          <div className="bg-dark-800 rounded-xl p-4 border border-dark-700 space-y-3">
            <h4 className="text-xs font-bold text-dark-300 uppercase tracking-wider">
              Corpo da Nota (Serviços)
            </h4>
            <div className="bg-dark-900 rounded-lg p-3 text-xs text-dark-300 font-mono space-y-1 max-h-36 overflow-y-auto">
              {venda.itens?.map((item: any, idx: number) => (
                <div key={idx} className="flex justify-between">
                  <span>
                    {item.quantidade}x {item.descricao}
                  </span>
                  <span className="text-dark-400">{formatCurrency(item.valor_unitario * item.quantidade)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Aviso */}
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-start gap-3">
            <AlertCircle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-amber-300 text-xs">
              Revise todos os campos antes de confirmar. As informações serão enviadas para o ambiente Nacional (Gov.br).
              {editaveis.length > 1 && (
                <> Use o botão <strong>&quot;Aplicar para todas&quot;</strong> se os códigos fiscais forem os mesmos para todas as notas.</>
              )}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-dark-700/50 flex justify-between items-center bg-dark-900/80">
          <button
            onClick={onClose}
            disabled={enviando}
            className="px-5 py-2 text-sm font-medium text-dark-300 hover:text-white rounded-xl hover:bg-dark-800 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(editaveis)}
            disabled={enviando}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg disabled:opacity-50"
          >
            <Send size={18} />
            {enviando
              ? 'Emitindo NFS-e...'
              : `Confirmar e Emitir ${editaveis.length > 1 ? `(${editaveis.length} notas)` : 'NFS-e'}`}
          </button>
        </div>
      </div>
    </div>
  )
}
