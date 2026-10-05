'use client'

import { useState } from 'react'
import type { ContaPagarImportada } from '@/types'
import { X, Save, Loader2, Calendar, FileText, DollarSign, Building2, Landmark, Tag } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import SelectorFornecedor from '@/components/upload/SelectorFornecedor'
import SelectorCategoria from '@/components/upload/SelectorCategoria'
import SelectorContaFinanceira, { type ContaFinanceiraOpcao } from '@/components/upload/SelectorContaFinanceira'
import toast from 'react-hot-toast'

interface ModalEditarContaPagarProps {
  conta: ContaPagarImportada
  empresaId: string
  contasFinanceiras: ContaFinanceiraOpcao[]
  categoriasCA?: string[]
  onClose: () => void
  onSalvar: (contaAtualizada: Partial<ContaPagarImportada>) => Promise<void>
}

export default function ModalEditarContaPagar({
  conta,
  empresaId,
  contasFinanceiras,
  categoriasCA = [],
  onClose,
  onSalvar,
}: ModalEditarContaPagarProps) {
  const [fornecedor, setFornecedor] = useState(conta.fornecedor || '')
  const [categoria, setCategoria] = useState(conta.categoria || 'Materiais para Revenda')
  const [valor, setValor] = useState(String(conta.valor ?? ''))
  const [vencimento, setVencimento] = useState(conta.vencimento ? conta.vencimento.substring(0, 10) : '')
  const [emissao, setEmissao] = useState(conta.emissao ? conta.emissao.substring(0, 10) : '')
  const [doc, setDoc] = useState(conta.doc || '')
  const [contaFinanceira, setContaFinanceira] = useState(conta.conta_financeira || '')
  const [contaFinanceiraId, setContaFinanceiraId] = useState((conta as any).conta_financeira_id || '')
  const [descricao, setDescricao] = useState(conta.descricao || '')

  // Modos de edição inline para os seletores especializados
  const [editandoFornecedor, setEditandoFornecedor] = useState(false)
  const [editandoCategoria, setEditandoCategoria] = useState(false)
  const [editandoBanco, setEditandoBanco] = useState(false)

  const [salvando, setSalvando] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!fornecedor.trim()) {
      toast.error('Informe o nome do fornecedor.')
      return
    }

    const valorNum = parseFloat(valor.replace(',', '.'))
    if (isNaN(valorNum) || valorNum <= 0) {
      toast.error('Informe um valor válido maior que zero.')
      return
    }

    if (!vencimento) {
      toast.error('Informe a data de vencimento.')
      return
    }

    setSalvando(true)
    try {
      await onSalvar({
        fornecedor: fornecedor.trim(),
        categoria: categoria.trim() || 'Materiais para Revenda',
        valor: valorNum,
        vencimento,
        emissao: emissao || null,
        doc: doc.trim() || null,
        conta_financeira: contaFinanceira || null,
        conta_financeira_id: contaFinanceiraId || null,
        descricao: descricao.trim() || null,
      })
      onClose()
    } catch (err: any) {
      console.error('Erro ao salvar conta a pagar:', err)
      toast.error(err?.message || 'Erro ao salvar alterações.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 animate-fade-in">
      <div className="bg-white dark:bg-dark-850 border border-slate-200 dark:border-dark-700 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 dark:border-dark-700 bg-slate-50/80 dark:bg-dark-900/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-500/15 border border-brand-500/30 flex items-center justify-center text-brand-600 dark:text-brand-400">
              <FileText size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                Editar Lançamento
              </h3>
              <p className="text-xs text-slate-500 dark:text-dark-400 mt-0.5">
                Atualize fornecedor, categoria, datas, valor e detalhes
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:text-dark-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-dark-700 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Formulário com Scroll */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4 overflow-y-auto custom-scrollbar flex-1">
          {/* Fornecedor */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-dark-300 uppercase tracking-wider flex items-center gap-1.5">
              <Building2 size={13} className="text-brand-500" />
              <span>Fornecedor *</span>
            </label>
            {editandoFornecedor ? (
              <SelectorFornecedor
                valorInicial={fornecedor}
                empresaId={empresaId}
                onSelect={(nome) => {
                  setFornecedor(nome)
                  setEditandoFornecedor(false)
                }}
                onCancel={() => setEditandoFornecedor(false)}
              />
            ) : (
              <div className="flex items-center justify-between gap-2 p-2.5 bg-slate-50 dark:bg-dark-900 border border-slate-200 dark:border-dark-700 rounded-xl hover:border-brand-500/50 transition-colors">
                <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                  {fornecedor || <span className="text-slate-400 italic">Sem fornecedor</span>}
                </span>
                <button
                  type="button"
                  onClick={() => setEditandoFornecedor(true)}
                  className="px-2.5 py-1 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:bg-brand-500/10 rounded-lg transition-colors cursor-pointer shrink-0"
                >
                  Alterar
                </button>
              </div>
            )}
          </div>

          {/* Categoria */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-dark-300 uppercase tracking-wider flex items-center gap-1.5">
              <Tag size={13} className="text-emerald-500" />
              <span>Categoria *</span>
            </label>
            {editandoCategoria ? (
              <SelectorCategoria
                valorInicial={categoria}
                categorias={categoriasCA}
                onSelect={(cat) => {
                  setCategoria(cat)
                  setEditandoCategoria(false)
                }}
                onCancel={() => setEditandoCategoria(false)}
              />
            ) : (
              <div className="flex items-center justify-between gap-2 p-2.5 bg-slate-50 dark:bg-dark-900 border border-slate-200 dark:border-dark-700 rounded-xl hover:border-emerald-500/50 transition-colors">
                <span className="text-sm font-medium text-slate-800 dark:text-dark-200 truncate">
                  {categoria || 'Materiais para Revenda'}
                </span>
                <button
                  type="button"
                  onClick={() => setEditandoCategoria(true)}
                  className="px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors cursor-pointer shrink-0"
                >
                  Alterar
                </button>
              </div>
            )}
          </div>

          {/* Grid: Valor e Documento */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Valor */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-dark-300 uppercase tracking-wider flex items-center gap-1.5">
                <DollarSign size={13} className="text-emerald-500" />
                <span>Valor (R$) *</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="0.00"
                required
                className="w-full h-10 bg-slate-50 dark:bg-dark-900 border border-slate-200 dark:border-dark-700 rounded-xl px-3 text-sm font-mono font-bold text-slate-900 dark:text-white outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all"
              />
            </div>

            {/* Número do Documento */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-dark-300 uppercase tracking-wider">
                Nº Documento / Doc
              </label>
              <input
                type="text"
                value={doc}
                onChange={(e) => setDoc(e.target.value)}
                placeholder="Ex: NF 12345"
                className="w-full h-10 bg-slate-50 dark:bg-dark-900 border border-slate-200 dark:border-dark-700 rounded-xl px-3 text-sm text-slate-900 dark:text-white outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all"
              />
            </div>
          </div>

          {/* Grid: Vencimento e Emissão/Competência */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Vencimento */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-dark-300 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar size={13} className="text-amber-500" />
                <span>Vencimento *</span>
              </label>
              <input
                type="date"
                value={vencimento}
                onChange={(e) => setVencimento(e.target.value)}
                required
                className="w-full h-10 bg-slate-50 dark:bg-dark-900 border border-slate-200 dark:border-dark-700 rounded-xl px-3 text-sm font-mono text-slate-900 dark:text-white outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all"
              />
            </div>

            {/* Emissão / Competência */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-dark-300 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar size={13} className="text-slate-400" />
                <span>Competência / Emissão</span>
              </label>
              <input
                type="date"
                value={emissao}
                onChange={(e) => setEmissao(e.target.value)}
                className="w-full h-10 bg-slate-50 dark:bg-dark-900 border border-slate-200 dark:border-dark-700 rounded-xl px-3 text-sm font-mono text-slate-900 dark:text-white outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all"
              />
            </div>
          </div>

          {/* Conta Financeira (Banco) */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-dark-300 uppercase tracking-wider flex items-center gap-1.5">
              <Landmark size={13} className="text-blue-500" />
              <span>Conta Financeira (Banco)</span>
            </label>
            {editandoBanco ? (
              <SelectorContaFinanceira
                valorInicial={contaFinanceira}
                contas={contasFinanceiras}
                onSelect={(nome, id) => {
                  setContaFinanceira(nome)
                  setContaFinanceiraId(id)
                  setEditandoBanco(false)
                }}
                onCancel={() => setEditandoBanco(false)}
              />
            ) : (
              <div className="flex items-center justify-between gap-2 p-2.5 bg-slate-50 dark:bg-dark-900 border border-slate-200 dark:border-dark-700 rounded-xl hover:border-blue-500/50 transition-colors">
                <span className="text-sm font-medium text-slate-800 dark:text-dark-200 truncate">
                  {contaFinanceira || <span className="text-slate-400 italic">Nenhum banco selecionado</span>}
                </span>
                <button
                  type="button"
                  onClick={() => setEditandoBanco(true)}
                  className="px-2.5 py-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors cursor-pointer shrink-0"
                >
                  Alterar
                </button>
              </div>
            )}
          </div>

          {/* Observações / Descrição */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-dark-300 uppercase tracking-wider">
              Descrição / Observações
            </label>
            <textarea
              rows={3}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Notas adicionais sobre o pagamento..."
              className="w-full bg-slate-50 dark:bg-dark-900 border border-slate-200 dark:border-dark-700 rounded-xl p-3 text-sm text-slate-900 dark:text-white outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all resize-none"
            />
          </div>

          {/* Ações do Rodapé */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-200 dark:border-dark-700">
            <button
              type="button"
              onClick={onClose}
              disabled={salvando}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-dark-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-dark-800 hover:bg-slate-200 dark:hover:bg-dark-700 rounded-xl transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="px-4 py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-500 rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {salvando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              <span>{salvando ? 'Salvando...' : 'Salvar Alterações'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
