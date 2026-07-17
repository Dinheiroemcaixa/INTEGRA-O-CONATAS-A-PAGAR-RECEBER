import React, { useState } from 'react'
import { X, Send, AlertCircle, Eye, FileText, CheckCircle, ChevronRight, ChevronLeft } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface ModalPreviewEmissaoProps {
  vendas: any[]
  empresaId: string
  onClose: () => void
  onConfirm: () => void
  enviando: boolean
}

export default function ModalPreviewEmissao({ vendas, empresaId, onClose, onConfirm, enviando }: ModalPreviewEmissaoProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [configFiscal, setConfigFiscal] = useState<any>(null)
  
  React.useEffect(() => {
    if (empresaId) {
      fetch(`/api/config-fiscal?empresa_id=${empresaId}`)
        .then(r => r.json())
        .then(data => setConfigFiscal(data.config || {}))
        .catch(e => console.error(e))
    }
  }, [empresaId])
  
  if (!vendas || vendas.length === 0) return null

  const venda = vendas[currentIndex]
  
  const handleNext = () => {
    if (currentIndex < vendas.length - 1) setCurrentIndex(prev => prev + 1)
  }

  const handlePrev = () => {
    if (currentIndex > 0) setCurrentIndex(prev => prev - 1)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-4xl flex flex-col max-h-[90vh] shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-dark-700/50 bg-brand-900/10">
          <div className="flex items-center gap-3">
            <div className="bg-brand-500/20 p-2 rounded-lg text-brand-400">
              <Eye size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Revisão do Emissor de NFS-e</h3>
              <p className="text-xs text-dark-400">Padrão Nacional (Portal Gov.br)</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-dark-400 hover:text-white rounded-lg hover:bg-dark-800 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-6 flex-1 custom-scrollbar bg-dark-900">
          
          {/* Navegação entre Notas se houver mais de 1 */}
          {vendas.length > 1 && (
            <div className="flex items-center justify-between bg-dark-800/50 rounded-xl p-3 border border-dark-700">
              <button 
                onClick={handlePrev} 
                disabled={currentIndex === 0}
                className="p-1.5 text-dark-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={20} />
              </button>
              <div className="text-sm font-semibold text-brand-400">
                Visualizando nota {currentIndex + 1} de {vendas.length}
              </div>
              <button 
                onClick={handleNext}
                disabled={currentIndex === vendas.length - 1}
                className="p-1.5 text-dark-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Bloco 1: Data e Competência */}
            <div className="bg-dark-800 rounded-xl p-4 border border-dark-700 space-y-3">
              <h4 className="text-xs font-bold text-dark-400 uppercase tracking-wider flex items-center gap-2">
                <FileText size={14} /> Dados da Emissão
              </h4>
              <div className="space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-dark-400">Data de Emissão (Competência):</span>
                  <span className="text-white font-mono">{new Date().toLocaleDateString('pt-BR')}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-dark-400">Regime de Apuração:</span>
                  <span className="text-white font-semibold">Simples Nacional</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-dark-400">Intermediário do Serviço:</span>
                  <span className="text-white">Não Informado</span>
                </div>
              </div>
            </div>

            {/* Bloco 2: Códigos Fiscais */}
            <div className="bg-dark-800 rounded-xl p-4 border border-dark-700 space-y-3">
              <h4 className="text-xs font-bold text-dark-400 uppercase tracking-wider flex items-center gap-2">
                <CheckCircle size={14} /> Enquadramento
              </h4>
              <div className="space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-dark-400">Cód. Tributação Nacional:</span>
                  <span className="text-white font-mono bg-dark-900 px-2 py-0.5 rounded border border-dark-700">14.01.01</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-dark-400">Cód. Complementar:</span>
                  <span className="text-white font-mono bg-dark-900 px-2 py-0.5 rounded border border-dark-700">14.01.01.001</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-dark-400">NBS:</span>
                  <span className="text-white font-mono bg-dark-900 px-2 py-0.5 rounded border border-dark-700">120013110</span>
                </div>
              </div>
            </div>

            {/* Bloco 3: Tomador */}
            <div className="bg-dark-800 rounded-xl p-4 border border-dark-700 space-y-3 md:col-span-2">
              <h4 className="text-xs font-bold text-dark-400 uppercase tracking-wider flex items-center gap-2">
                Dados do Tomador (Cliente)
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="col-span-2">
                  <span className="text-xs text-dark-500 block mb-1">Nome / Razão Social</span>
                  <span className="text-sm font-semibold text-white block truncate">{venda.cliente}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-xs text-dark-500 block mb-1">CPF / CNPJ</span>
                  <span className="text-sm text-white font-mono">{venda.dados_datacar?.cliente_cpf_cnpj || venda.cliente_cpf_cnpj || <span className="text-rose-400 text-xs">Não informado! Vá em Analisar.</span>}</span>
                </div>
                <div className="col-span-4">
                  <span className="text-xs text-dark-500 block mb-1">Local da Prestação / Endereço</span>
                  <span className="text-sm text-white block">
                    Brasil — {[
                      venda.dados_datacar?.cliente_logradouro,
                      venda.dados_datacar?.cliente_numero,
                      venda.dados_datacar?.cliente_bairro,
                      venda.dados_datacar?.cliente_cidade,
                      venda.dados_datacar?.cliente_uf
                    ].filter(Boolean).join(', ') || <span className="text-rose-400 text-xs">Sem endereço completo.</span>}
                  </span>
                </div>
              </div>
            </div>

            {/* Bloco 4: Valores e Impostos */}
            <div className="bg-dark-800 rounded-xl p-4 border border-dark-700 space-y-3 md:col-span-2 border-l-4 border-l-brand-500">
              <h4 className="text-xs font-bold text-dark-400 uppercase tracking-wider">
                Valores e Tributos Municipais / Federais
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-2">
                <div>
                  <span className="text-xs text-dark-400 block mb-1">Valor Total da Nota</span>
                  <span className="text-xl font-bold text-white">{formatCurrency(venda.valor_total)}</span>
                </div>
                <div>
                  <span className="text-xs text-dark-400 block mb-1">Alíquota Simples Nac. (%)</span>
                  <span className="text-lg font-semibold text-amber-400">{configFiscal?.aliquota_simples_nacional || '11.34'}%</span>
                </div>
                <div>
                  <span className="text-xs text-dark-400 block mb-1">Alíquota ISSQN (%)</span>
                  {configFiscal?.aliquota_issqn ? (
                    <span className="text-lg font-semibold text-rose-400">{configFiscal.aliquota_issqn}% <span className="text-[10px] text-dark-400 ml-1 font-normal">(Não Retido)</span></span>
                  ) : (
                    <span className="text-sm font-semibold text-dark-500">Não Aplicável / Sem ISSQN</span>
                  )}
                </div>
              </div>
            </div>

            {/* Itens / Descrição */}
            <div className="bg-dark-800 rounded-xl p-4 border border-dark-700 space-y-3 md:col-span-2">
              <h4 className="text-xs font-bold text-dark-400 uppercase tracking-wider">
                Corpo da Nota (Serviços)
              </h4>
              <div className="bg-dark-900 rounded-lg p-3 text-xs text-dark-300 font-mono space-y-1">
                {venda.itens?.map((item: any, idx: number) => (
                  <div key={idx}>
                    {item.quantidade}x {item.descricao} - {formatCurrency(item.valor_unitario * item.quantidade)}
                  </div>
                ))}
              </div>
            </div>

          </div>

          <div className="bg-brand-500/10 border border-brand-500/30 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle size={18} className="text-brand-400 flex-shrink-0 mt-0.5" />
            <p className="text-brand-300 text-sm">
              Esta é uma simulação de como a NFS-e será montada e enviada para o ambiente Nacional. 
              Verifique se a <strong>Alíquota do Simples</strong> e o <strong>ISSQN</strong> estão corretos para as exigências deste município. 
              {vendas.length > 1 && <strong> Atenção: As mesmas alíquotas serão aplicadas em todas as {vendas.length} notas selecionadas.</strong>}
            </p>
          </div>

        </div>

        {/* Footer */}
        <div className="p-5 border-t border-dark-700/50 flex justify-end gap-3 bg-dark-900/80">
          <button
            onClick={onClose}
            disabled={enviando}
            className="px-5 py-2 text-sm font-medium text-dark-300 hover:text-white rounded-xl hover:bg-dark-800 transition-colors disabled:opacity-50"
          >
            Voltar para Edição
          </button>
          <button
            onClick={onConfirm}
            disabled={enviando}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white px-8 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg disabled:opacity-50"
          >
            <Send size={18} />
            {enviando ? 'Emitindo NFS-e...' : `Confirmar Emissão ${vendas.length > 1 ? `(${vendas.length})` : ''}`}
          </button>
        </div>

      </div>
    </div>
  )
}
