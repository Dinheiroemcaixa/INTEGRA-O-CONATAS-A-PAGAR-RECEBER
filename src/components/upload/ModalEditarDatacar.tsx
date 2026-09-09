import React, { useState, useEffect } from 'react'
import { 
  X, Save, Plus, Trash2, Search, MapPin, User, FileText, 
  Car, DollarSign, CheckCircle, AlertCircle, Loader2 
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { buscarCep, buscarCnpj } from '@/services/brasil-api/client'
import toast from 'react-hot-toast'

interface ModalEditarDatacarProps {
  vendaId: string
  venda: any
  onClose: () => void
  onSaveSuccess: (vendaAtualizada: any) => void
}

export default function ModalEditarDatacar({ vendaId, venda, onClose, onSaveSuccess }: ModalEditarDatacarProps) {
  const [formData, setFormData] = useState<any>(null)
  const [salvando, setSalvando] = useState(false)
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [buscandoCnpj, setBuscandoCnpj] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    if (venda) {
      const end = venda.cliente_endereco || {}
      const dDatacar = venda._datacar || venda.dados_datacar || {}

      setFormData({
        id: venda.id || vendaId,
        cliente: venda.cliente || dDatacar.cliente_nome || '',
        cpf_cnpj: venda.cliente_cpf_cnpj || dDatacar.cliente_cpf_cnpj || '',
        cep: end.cep || dDatacar.cliente_cep || '',
        logradouro: end.logradouro || dDatacar.cliente_logradouro || '',
        numero: end.numero || dDatacar.cliente_numero || '',
        complemento: end.complemento || dDatacar.cliente_complemento || '',
        bairro: end.bairro || dDatacar.cliente_bairro || '',
        cidade: end.cidade || dDatacar.cliente_cidade || '',
        estado: end.estado || dDatacar.cliente_uf || '',
        os_numero: venda.os_numero || '',
        data_venda: venda.data_venda || '',
        forma_pagamento: venda.forma_pagamento || '',
        vendedor: dDatacar.vendedor || '',
        veiculo: dDatacar.veiculo || '',
        itens: (venda.itens || []).map((item: any) => ({
          codigo: item.codigo || '',
          descricao: item.descricao || '',
          quantidade: Number(item.quantidade) || 1,
          valor_unitario: Number(item.valor_unitario) || 0,
          valor_unitario_original: item.valor_unitario_original !== undefined ? Number(item.valor_unitario_original) : Number(item.valor_unitario) || 0,
          desconto: Number(item.desconto) || 0,
          valor_total: Number(item.valor_total) || ((Number(item.quantidade) || 1) * (Number(item.valor_unitario) || 0)),
          tipo: item.tipo || 'produto',
          unidade_medida: item.unidade_medida || 'UN',
          ncm: item.ncm || '',
          cest: item.cest || '',
          origem: item.origem || '0 - Nacional',
          tipo_produto: item.tipo_produto || (item.tipo === 'servico' ? '09 - Serviços' : '00 - Mercadoria para Revenda')
        }))
      })
    }
  }, [venda, vendaId])

  if (!formData) return null

  const recalcularTotal = (itens: any[]) => {
    return itens.reduce((acc, item) => acc + (Number(item.valor_total) || (Number(item.quantidade) * Number(item.valor_unitario))), 0)
  }

  const handleBuscarCep = async () => {
    const cepLimpo = formData.cep?.replace(/\D/g, '')
    if (!cepLimpo || cepLimpo.length !== 8) {
      toast.error('Informe um CEP válido com 8 dígitos.')
      return
    }
    setBuscandoCep(true)
    try {
      const res = await buscarCep(cepLimpo)
      if (res) {
        setFormData((prev: any) => ({
          ...prev,
          logradouro: res.street || prev.logradouro,
          bairro: res.neighborhood || prev.bairro,
          cidade: res.city || prev.cidade,
          estado: res.state || prev.estado
        }))
        toast.success('Endereço preenchido via CEP!')
      } else {
        toast.error('CEP não localizado.')
      }
    } catch {
      toast.error('Erro ao consultar CEP.')
    } finally {
      setBuscandoCep(false)
    }
  }

  const handleBuscarCnpj = async () => {
    const docLimpo = formData.cpf_cnpj?.replace(/\D/g, '')
    if (!docLimpo || docLimpo.length !== 14) {
      toast.error('Informe um CNPJ válido com 14 dígitos.')
      return
    }
    setBuscandoCnpj(true)
    try {
      const res = await buscarCnpj(docLimpo)
      if (res) {
        setFormData((prev: any) => ({
          ...prev,
          cliente: res.razao_social || res.nome_fantasia || prev.cliente,
          logradouro: res.logradouro || prev.logradouro,
          numero: res.numero || prev.numero,
          complemento: res.complemento || prev.complemento,
          bairro: res.bairro || prev.bairro,
          cidade: res.municipio || prev.cidade,
          estado: res.uf || prev.estado,
          cep: res.cep || prev.cep
        }))
        toast.success('Dados da empresa preenchidos via Receita Federal!')
      } else {
        toast.error('CNPJ não localizado na Receita.')
      }
    } catch {
      toast.error('Erro ao consultar CNPJ.')
    } finally {
      setBuscandoCnpj(false)
    }
  }

  const handleItemChange = (index: number, field: string, value: any) => {
    const novosItens = [...formData.itens]
    novosItens[index] = { ...novosItens[index], [field]: value }
    
    // Atualiza valor_total caso quantidade ou valor unitario mudem
    if (field === 'quantidade' || field === 'valor_unitario') {
      const qtd = field === 'quantidade' ? Number(value) : Number(novosItens[index].quantidade)
      const vUnit = field === 'valor_unitario' ? Number(value) : Number(novosItens[index].valor_unitario)
      novosItens[index].valor_total = parseFloat((qtd * vUnit).toFixed(2))
    }

    setFormData({ ...formData, itens: novosItens })
  }

  const handleAdicionarItem = () => {
    setFormData({
      ...formData,
      itens: [
        ...formData.itens,
        {
          codigo: '',
          descricao: 'Novo Item / Peça',
          quantidade: 1,
          valor_unitario: 0,
          valor_total: 0,
          tipo: 'produto',
          unidade_medida: 'UN',
          ncm: '',
          cest: '',
          origem: '0 - Nacional',
          tipo_produto: '00 - Mercadoria para Revenda'
        }
      ]
    })
  }

  const handleRemoverItem = (index: number) => {
    const novosItens = formData.itens.filter((_: any, i: number) => i !== index)
    setFormData({ ...formData, itens: novosItens })
  }

  const handleSave = async () => {
    setSalvando(true)
    try {
      const valorTotal = recalcularTotal(formData.itens)
      const vendaAtualizada = {
        ...venda,
        cliente: formData.cliente,
        cliente_cpf_cnpj: formData.cpf_cnpj,
        cliente_endereco: {
          logradouro: formData.logradouro,
          numero: formData.numero,
          complemento: formData.complemento,
          bairro: formData.bairro,
          cidade: formData.cidade,
          estado: formData.estado,
          cep: formData.cep
        },
        os_numero: formData.os_numero,
        valor_total: valorTotal,
        forma_pagamento: formData.forma_pagamento,
        itens: formData.itens,
        _datacar: {
          ...(venda._datacar || {}),
          vendedor: formData.vendedor,
          veiculo: formData.veiculo,
          cliente_cpf_cnpj: formData.cpf_cnpj,
          cliente_logradouro: formData.logradouro,
          cliente_numero: formData.numero,
          cliente_complemento: formData.complemento,
          cliente_bairro: formData.bairro,
          cliente_cidade: formData.cidade,
          cliente_uf: formData.estado,
          cliente_cep: formData.cep
        }
      }

      onSaveSuccess(vendaAtualizada)
      onClose()
    } catch (err: any) {
      toast.error('Erro ao salvar edições da venda.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
      <div className="bg-dark-900 border border-dark-700/80 rounded-2xl w-full max-w-5xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden my-auto">
        
        {/* Header Ultra-Moderno */}
        <div className="px-6 py-4 border-b border-dark-700/80 flex items-center justify-between bg-dark-950/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 font-bold">
              <FileText size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Editar Informações da Venda</h3>
                <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  OS #{formData.os_numero}
                </span>
              </div>
              <p className="text-xs text-dark-400">
                Ajuste os dados cadastrais, endereço, veículo e parâmetros tributários antes da emissão.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-dark-400 hover:text-white p-2 rounded-lg hover:bg-dark-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Corpo do Modal */}
        <div className="p-6 overflow-y-auto space-y-6 custom-scrollbar">
          
          {/* Card 1: Dados do Cliente & Identificação */}
          <div className="bg-dark-850/80 border border-dark-700/80 rounded-2xl p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-dark-700/50 pb-2.5">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <User size={15} className="text-blue-400" />
                Dados do Cliente & Identificação
              </h4>
              {formData.cpf_cnpj?.replace(/\D/g, '').length === 14 && (
                <button
                  type="button"
                  onClick={handleBuscarCnpj}
                  disabled={buscandoCnpj}
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-semibold transition-colors"
                >
                  {buscandoCnpj ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                  Buscar CNPJ na Receita
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
              <div className="sm:col-span-6">
                <label className="text-xs font-medium text-dark-300 mb-1 block">Cliente (Nome / Razão Social)</label>
                <input
                  type="text"
                  value={formData.cliente}
                  onChange={(e) => setFormData({ ...formData, cliente: e.target.value })}
                  className="w-full bg-dark-900 border border-dark-700 rounded-xl px-3.5 py-2.5 text-white text-xs outline-none focus:border-blue-500 transition-all font-medium"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="text-xs font-medium text-dark-300 mb-1 block">CPF / CNPJ</label>
                <input
                  type="text"
                  value={formData.cpf_cnpj}
                  onChange={(e) => setFormData({ ...formData, cpf_cnpj: e.target.value })}
                  placeholder="000.000.000-00"
                  className="w-full bg-dark-900 border border-dark-700 rounded-xl px-3.5 py-2.5 text-white text-xs outline-none focus:border-blue-500 font-mono transition-all"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="text-xs font-medium text-dark-300 mb-1 block">Número da OS / Pedido</label>
                <input
                  type="text"
                  value={formData.os_numero}
                  onChange={(e) => setFormData({ ...formData, os_numero: e.target.value })}
                  className="w-full bg-dark-900 border border-dark-700 rounded-xl px-3.5 py-2.5 text-white text-xs outline-none focus:border-blue-500 font-mono font-bold transition-all"
                />
              </div>
            </div>
          </div>

          {/* Card 2: Endereço do Cliente com Busca de CEP */}
          <div className="bg-dark-850/80 border border-dark-700/80 rounded-2xl p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-dark-700/50 pb-2.5">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <MapPin size={15} className="text-emerald-400" />
                Endereço de Faturamento & Entrega
              </h4>
              <button
                type="button"
                onClick={handleBuscarCep}
                disabled={buscandoCep}
                className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-semibold transition-colors"
              >
                {buscandoCep ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                Consultar CEP
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
              <div className="sm:col-span-3">
                <label className="text-xs font-medium text-dark-300 mb-1 block">CEP</label>
                <div className="relative">
                  <input
                    type="text"
                    value={formData.cep}
                    onChange={(e) => setFormData({ ...formData, cep: e.target.value })}
                    onBlur={handleBuscarCep}
                    placeholder="00000-000"
                    className="w-full bg-dark-900 border border-dark-700 rounded-xl px-3.5 py-2.5 text-white text-xs outline-none focus:border-emerald-500 font-mono transition-all"
                  />
                </div>
              </div>

              <div className="sm:col-span-6">
                <label className="text-xs font-medium text-dark-300 mb-1 block">Logradouro (Rua, Av.)</label>
                <input
                  type="text"
                  value={formData.logradouro}
                  onChange={(e) => setFormData({ ...formData, logradouro: e.target.value })}
                  placeholder="Nome da rua..."
                  className="w-full bg-dark-900 border border-dark-700 rounded-xl px-3.5 py-2.5 text-white text-xs outline-none focus:border-emerald-500 transition-all"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="text-xs font-medium text-dark-300 mb-1 block">Número</label>
                <input
                  type="text"
                  value={formData.numero}
                  onChange={(e) => setFormData({ ...formData, numero: e.target.value })}
                  placeholder="123"
                  className="w-full bg-dark-900 border border-dark-700 rounded-xl px-3.5 py-2.5 text-white text-xs outline-none focus:border-emerald-500 transition-all"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="text-xs font-medium text-dark-300 mb-1 block">Complemento</label>
                <input
                  type="text"
                  value={formData.complemento}
                  onChange={(e) => setFormData({ ...formData, complemento: e.target.value })}
                  placeholder="Apto, Sala..."
                  className="w-full bg-dark-900 border border-dark-700 rounded-xl px-3.5 py-2.5 text-white text-xs outline-none focus:border-emerald-500 transition-all"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="text-xs font-medium text-dark-300 mb-1 block">Bairro</label>
                <input
                  type="text"
                  value={formData.bairro}
                  onChange={(e) => setFormData({ ...formData, bairro: e.target.value })}
                  placeholder="Bairro..."
                  className="w-full bg-dark-900 border border-dark-700 rounded-xl px-3.5 py-2.5 text-white text-xs outline-none focus:border-emerald-500 transition-all"
                />
              </div>

              <div className="sm:col-span-4">
                <label className="text-xs font-medium text-dark-300 mb-1 block">Cidade</label>
                <input
                  type="text"
                  value={formData.cidade}
                  onChange={(e) => setFormData({ ...formData, cidade: e.target.value })}
                  placeholder="Cidade..."
                  className="w-full bg-dark-900 border border-dark-700 rounded-xl px-3.5 py-2.5 text-white text-xs outline-none focus:border-emerald-500 transition-all"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-dark-300 mb-1 block">Estado (UF)</label>
                <input
                  type="text"
                  maxLength={2}
                  value={formData.estado}
                  onChange={(e) => setFormData({ ...formData, estado: e.target.value.toUpperCase() })}
                  placeholder="UF"
                  className="w-full bg-dark-900 border border-dark-700 rounded-xl px-3.5 py-2.5 text-white text-xs outline-none focus:border-emerald-500 uppercase font-mono font-bold text-center transition-all"
                />
              </div>
            </div>
          </div>

          {/* Card 3: Informações Operacionais & Veículo */}
          <div className="bg-dark-850/80 border border-dark-700/80 rounded-2xl p-5 space-y-4 shadow-sm">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2 border-b border-dark-700/50 pb-2.5">
              <Car size={15} className="text-purple-400" />
              Operação, Veículo & Pagamento
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-medium text-dark-300 mb-1 block">Veículo / Placa</label>
                <input
                  type="text"
                  value={formData.veiculo}
                  onChange={(e) => setFormData({ ...formData, veiculo: e.target.value })}
                  placeholder="Marca Modelo - ABC1234"
                  className="w-full bg-dark-900 border border-dark-700 rounded-xl px-3.5 py-2.5 text-white text-xs outline-none focus:border-purple-500 transition-all"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-dark-300 mb-1 block">Vendedor Responsável</label>
                <input
                  type="text"
                  value={formData.vendedor}
                  onChange={(e) => setFormData({ ...formData, vendedor: e.target.value })}
                  placeholder="Nome do consultor..."
                  className="w-full bg-dark-900 border border-dark-700 rounded-xl px-3.5 py-2.5 text-white text-xs outline-none focus:border-purple-500 transition-all"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-dark-300 mb-1 block">Forma de Pagamento</label>
                <input
                  type="text"
                  value={formData.forma_pagamento}
                  onChange={(e) => setFormData({ ...formData, forma_pagamento: e.target.value })}
                  placeholder="Ex: Cartão de Crédito (3x)"
                  className="w-full bg-dark-900 border border-dark-700 rounded-xl px-3.5 py-2.5 text-white text-xs outline-none focus:border-purple-500 transition-all font-semibold"
                />
              </div>
            </div>
          </div>

          {/* Card 4: Tabela de Itens e Dados Fiscais */}
          <div className="bg-dark-850/80 border border-dark-700/80 rounded-2xl p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-dark-700/50 pb-2.5">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <DollarSign size={15} className="text-cyan-400" />
                Itens da Venda e Classificação Fiscal ({formData.itens.length})
              </h4>
              <button
                type="button"
                onClick={handleAdicionarItem}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 rounded-xl text-xs font-bold transition-all"
              >
                <Plus size={13} />
                Adicionar Item
              </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-dark-700/60">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-dark-950/80 text-dark-400 font-bold uppercase tracking-wider text-[10px] border-b border-dark-700/80">
                    <th className="py-2.5 px-3 w-16">Tipo</th>
                    <th className="py-2.5 px-3 w-24">Código</th>
                    <th className="py-2.5 px-3 min-w-[180px]">Descrição</th>
                    <th className="py-2.5 px-3 w-14 text-center">Qtd</th>
                    <th className="py-2.5 px-3 w-24 text-right">Vl Unit (R$)</th>
                    <th className="py-2.5 px-3 w-14 text-center">Un</th>
                    <th className="py-2.5 px-3 w-24">NCM</th>
                    <th className="py-2.5 px-3 w-24">CEST</th>
                    <th className="py-2.5 px-3 w-32">Origem</th>
                    <th className="py-2.5 px-3 w-36">Tipo Produto</th>
                    <th className="py-2.5 px-3 w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-700/50">
                  {formData.itens.map((item: any, i: number) => (
                    <tr key={i} className="hover:bg-dark-800/40 transition-colors group">
                      <td className="p-2">
                        <select
                          value={item.tipo || 'produto'}
                          onChange={(e) => handleItemChange(i, 'tipo', e.target.value)}
                          className="bg-dark-900 border border-dark-700 rounded-lg px-2 py-1 text-white text-[11px] outline-none"
                        >
                          <option value="produto">PROD</option>
                          <option value="servico">SERV</option>
                        </select>
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          value={item.codigo || ''}
                          onChange={(e) => handleItemChange(i, 'codigo', e.target.value)}
                          placeholder="Código"
                          className="w-full bg-dark-900 border border-dark-700 rounded-lg px-2 py-1 text-white font-mono text-[11px] outline-none focus:border-blue-500"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          value={item.descricao || ''}
                          onChange={(e) => handleItemChange(i, 'descricao', e.target.value)}
                          className="w-full bg-dark-900 border border-dark-700 rounded-lg px-2.5 py-1 text-white text-xs outline-none focus:border-blue-500 font-medium"
                        />
                      </td>
                      <td className="p-2 text-center">
                        <input
                          type="number"
                          step="0.01"
                          value={item.quantidade || 1}
                          onChange={(e) => handleItemChange(i, 'quantidade', parseFloat(e.target.value) || 0)}
                          className="w-14 bg-dark-900 border border-dark-700 rounded-lg px-1.5 py-1 text-white text-center text-xs outline-none focus:border-blue-500 font-bold"
                        />
                      </td>
                      <td className="p-2 text-right">
                        <input
                          type="number"
                          step="0.01"
                          value={item.valor_unitario || 0}
                          onChange={(e) => handleItemChange(i, 'valor_unitario', parseFloat(e.target.value) || 0)}
                          className="w-20 bg-dark-900 border border-dark-700 rounded-lg px-2 py-1 text-white text-right text-xs outline-none focus:border-blue-500 font-bold tabular-nums"
                        />
                      </td>
                      <td className="p-2 text-center">
                        <input
                          type="text"
                          value={item.unidade_medida || 'UN'}
                          onChange={(e) => handleItemChange(i, 'unidade_medida', e.target.value.toUpperCase())}
                          className="w-12 bg-dark-900 border border-dark-700 rounded-lg px-1 py-1 text-white text-center text-[10px] uppercase font-mono outline-none"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          value={item.ncm || ''}
                          placeholder="84099990"
                          onChange={(e) => handleItemChange(i, 'ncm', e.target.value.replace(/\D/g, ''))}
                          className="w-full bg-dark-900 border border-dark-700 rounded-lg px-2 py-1 text-white font-mono text-[11px] outline-none focus:border-emerald-500"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          value={item.cest || ''}
                          placeholder="0100100"
                          onChange={(e) => handleItemChange(i, 'cest', e.target.value.replace(/\D/g, ''))}
                          className="w-full bg-dark-900 border border-dark-700 rounded-lg px-2 py-1 text-white font-mono text-[11px] outline-none focus:border-cyan-500"
                        />
                      </td>
                      <td className="p-2">
                        <select
                          value={item.origem || '0 - Nacional'}
                          onChange={(e) => handleItemChange(i, 'origem', e.target.value)}
                          className="w-full bg-dark-900 border border-dark-700 rounded-lg px-2 py-1 text-white text-[11px] outline-none"
                        >
                          <option value="0 - Nacional">0 - Nacional</option>
                          <option value="1 - Estrangeira - Importação direta">1 - Estrang. Direta</option>
                          <option value="2 - Estrangeira - Adquirida no mercado interno">2 - Estrang. Interno</option>
                          <option value="3 - Nacional - Conteúdo de Importação > 40%">3 - Nac. &gt; 40%</option>
                        </select>
                      </td>
                      <td className="p-2">
                        <select
                          value={item.tipo_produto || '00 - Mercadoria para Revenda'}
                          onChange={(e) => handleItemChange(i, 'tipo_produto', e.target.value)}
                          className="w-full bg-dark-900 border border-dark-700 rounded-lg px-2 py-1 text-white text-[11px] outline-none"
                        >
                          <option value="00 - Mercadoria para Revenda">00 - Merc. Revenda</option>
                          <option value="01 - Matéria-Prima">01 - Matéria-Prima</option>
                          <option value="04 - Produto Acabado">04 - Prod. Acabado</option>
                          <option value="07 - Material de Uso e Consumo">07 - Uso/Consumo</option>
                          <option value="09 - Serviços">09 - Serviços</option>
                        </select>
                      </td>
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoverItem(i)}
                          className="text-dark-500 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-500/10 transition-colors"
                          title="Remover item"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totalizador */}
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-dark-400 font-semibold">
                {formData.itens.length} itens cadastrados
              </span>
              <div className="flex items-center gap-3">
                <span className="text-xs text-dark-300 font-bold uppercase tracking-wider">Valor Total da OS:</span>
                <span className="text-2xl font-black text-white tabular-nums drop-shadow-sm">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(recalcularTotal(formData.itens))}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-dark-700/80 flex items-center justify-between bg-dark-950/80">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-xs font-bold text-dark-300 hover:text-white rounded-xl hover:bg-dark-800 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={salvando}
            className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-7 py-2.5 rounded-xl text-xs font-bold transition-all shadow-lg shadow-blue-600/25 disabled:opacity-50"
          >
            {salvando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {salvando ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>

      </div>
    </div>
  )
}
