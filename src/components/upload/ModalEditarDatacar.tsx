import React, { useState, useEffect } from 'react'
import { X, Save } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

interface ModalEditarDatacarProps {
  vendaId: string
  venda: any // VendaImportada
  onClose: () => void
  onSaveSuccess: () => void
}

export default function ModalEditarDatacar({ vendaId, venda, onClose, onSaveSuccess }: ModalEditarDatacarProps) {
  const [formData, setFormData] = useState<any>(null)
  const [salvando, setSalvando] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    if (venda) {
      setFormData({
        cliente: venda.cliente || '',
        cpf_cnpj: venda.dados_datacar?.cliente_cpf_cnpj || '',
        cep: venda.dados_datacar?.cliente_cep || '',
        logradouro: venda.dados_datacar?.cliente_logradouro || '',
        numero: venda.dados_datacar?.cliente_numero || '',
        complemento: venda.dados_datacar?.cliente_complemento || '',
        bairro: venda.dados_datacar?.cliente_bairro || '',
        cidade: venda.dados_datacar?.cliente_cidade || '',
        uf: venda.dados_datacar?.cliente_uf || '',
        os_numero: venda.os_numero || '',
      })
    }
  }, [venda])

  if (!formData) return null

  const handleSave = async () => {
    setSalvando(true)
    try {
      const novosDadosDatacar = {
        ...venda.dados_datacar,
        cliente_cpf_cnpj: formData.cpf_cnpj,
        cliente_cep: formData.cep,
        cliente_logradouro: formData.logradouro,
        cliente_numero: formData.numero,
        cliente_complemento: formData.complemento,
        cliente_bairro: formData.bairro,
        cliente_cidade: formData.cidade,
        cliente_uf: formData.uf,
      }

      const { error } = await supabase
        .from('vendas_importadas')
        .update({
          cliente: formData.cliente,
          os_numero: formData.os_numero,
          dados_datacar: novosDadosDatacar
        })
        .eq('id', vendaId)

      if (error) throw error

      toast.success('Venda atualizada com sucesso!')
      onSaveSuccess()
      onClose()
    } catch (error) {
      console.error(error)
      toast.error('Erro ao salvar as alterações')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-2xl flex flex-col max-h-[90vh] shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-dark-700/50">
          <h3 className="text-lg font-bold text-white">Editar Informações da Venda</h3>
          <button onClick={onClose} className="p-2 text-dark-400 hover:text-white rounded-lg hover:bg-dark-800 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-semibold text-dark-300">Cliente (Nome/Razão Social)</label>
              <input
                type="text"
                value={formData.cliente}
                onChange={(e) => setFormData({ ...formData, cliente: e.target.value })}
                className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-all"
              />
            </div>
            
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-dark-300">CPF / CNPJ</label>
              <input
                type="text"
                value={formData.cpf_cnpj}
                onChange={(e) => setFormData({ ...formData, cpf_cnpj: e.target.value })}
                className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-dark-300">OS / Pedido</label>
              <input
                type="text"
                value={formData.os_numero}
                onChange={(e) => setFormData({ ...formData, os_numero: e.target.value })}
                className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-all"
              />
            </div>
          </div>

          <hr className="border-dark-700/50" />
          <h4 className="text-sm font-semibold text-white">Endereço do Cliente</h4>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-dark-300">CEP</label>
              <input
                type="text"
                value={formData.cep}
                onChange={(e) => setFormData({ ...formData, cep: e.target.value })}
                className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-all"
              />
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-semibold text-dark-300">Logradouro (Rua, Av.)</label>
              <input
                type="text"
                value={formData.logradouro}
                onChange={(e) => setFormData({ ...formData, logradouro: e.target.value })}
                className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-dark-300">Número</label>
              <input
                type="text"
                value={formData.numero}
                onChange={(e) => setFormData({ ...formData, numero: e.target.value })}
                className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-all"
              />
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-semibold text-dark-300">Complemento</label>
              <input
                type="text"
                value={formData.complemento}
                onChange={(e) => setFormData({ ...formData, complemento: e.target.value })}
                className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-dark-300">Bairro</label>
              <input
                type="text"
                value={formData.bairro}
                onChange={(e) => setFormData({ ...formData, bairro: e.target.value })}
                className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-dark-300">Cidade</label>
              <input
                type="text"
                value={formData.cidade}
                onChange={(e) => setFormData({ ...formData, cidade: e.target.value })}
                className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-dark-300">Estado (UF)</label>
              <input
                type="text"
                value={formData.uf}
                maxLength={2}
                onChange={(e) => setFormData({ ...formData, uf: e.target.value.toUpperCase() })}
                className="w-full bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-all"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-dark-700/50 flex justify-end gap-3 bg-dark-900/80">
          <button
            onClick={onClose}
            className="px-5 py-2 text-sm font-medium text-dark-300 hover:text-white rounded-xl hover:bg-dark-800 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={salvando}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white px-6 py-2 rounded-xl text-sm font-semibold transition-all shadow-lg disabled:opacity-50"
          >
            <Save size={16} />
            {salvando ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>

      </div>
    </div>
  )
}
