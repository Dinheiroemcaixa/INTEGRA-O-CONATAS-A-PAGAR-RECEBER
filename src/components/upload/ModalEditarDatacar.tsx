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

// Utilitário para formatar número para moeda brasileira 99.999,00
const formatBRL = (val: number | string | undefined | null): string => {
  if (val === undefined || val === null || val === '') return '0,00'
  const num = typeof val === 'string' ? parseFloat(val.replace(/\./g, '').replace(',', '.')) : Number(val)
  if (isNaN(num)) return '0,00'
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Utilitário para converter string digitada para float
const parseBRL = (val: string | number): number => {
  if (typeof val === 'number') return isNaN(val) ? 0 : val
  if (!val) return 0
  const clean = val.toString().replace(/[^0-9,-]/g, '').replace(',', '.')
  const num = parseFloat(clean)
  return isNaN(num) ? 0 : num
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
        logradouro: end.logradouro || dDatacar.cliente_logradouro || '',
        numero: end.numero || dDatacar.cliente_numero || '',
        complemento: end.complemento || dDatacar.cliente_complemento || '',
        bairro: end.bairro || dDatacar.cliente_bairro || '',
        cidade: end.cidade || dDatacar.cliente_cidade || '',
        estado: end.estado || dDatacar.cliente_uf || '',
        cep: end.cep || dDatacar.cliente_cep || '',
        os_numero: venda.os_numero || dDatacar.os_numero || '',
        veiculo: dDatacar.veiculo || '',
        forma_pagamento: venda.forma_pagamento || dDatacar.forma_pagamento || 'Cartão de Crédito',
        itens: (venda.itens || []).map((item: any) => ({
          tipo: item.tipo || 'produto',
          codigo: item.codigo || '',
          descricao: item.descricao || '',
          quantidade: item.quantidade || 1,
          unidade_medida: item.unidade_medida || 'UN',
          valor_unitario_original: item.valor_unitario_original !== undefined ? Number(item.valor_unitario_original) : Number(item.valor_unitario || 0),
          desconto: Number(item.desconto || 0),
          valor_unitario: Number(item.valor_unitario || 0),
          valor_total: Number(item.valor_total || 0),
          ncm: item.ncm || '',
          cest: item.cest || '',
          origem: item.origem || '0',
          tipo_produto: item.tipo_produto || '00'
        }))
      })
    }
  }, [venda, vendaId])

  if (!formData) return null

  const handleConsultarCep = async () => {
    const cepClean = formData.cep.replace(/\D/g, '')
    if (cepClean.length !== 8) {
      toast.error('Informe um CEP válido com 8 dígitos.')
      return
    }

    setBuscandoCep(true)
    try {
      const dados = await buscarCep(cepClean)
      if (dados && (dados.street || dados.city)) {
        setFormData((prev: any) => ({
          ...prev,
          logradouro: dados.street || prev.logradouro,
          bairro: dados.neighborhood || prev.bairro,
          cidade: dados.city || prev.cidade,
          estado: dados.state || prev.estado
        }))
        toast.success('Endereço preenchido com sucesso via BrasilAPI!')
      } else {
        toast.error('CEP não encontrado na base pública.')
      }
    } catch (err: any) {
      toast.error('Falha ao consultar CEP: ' + (err.message || 'Erro desconhecido'))
    } finally {
      setBuscandoCep(false)
    }
  }

  const handleConsultarCnpj = async () => {
    const docClean = formData.cpf_cnpj.replace(/\D/g, '')
    if (docClean.length !== 14) {
      toast.error('Informe um CNPJ válido com 14 dígitos.')
      return
    }

    setBuscandoCnpj(true)
    try {
      const dados = await buscarCnpj(docClean)
      if (dados && dados.razao_social) {
        setFormData((prev: any) => ({
          ...prev,
          cliente: dados.razao_social || dados.nome_fantasia || prev.cliente,
          logradouro: dados.logradouro || prev.logradouro,
          numero: dados.numero || prev.numero,
          complemento: dados.complemento || prev.complemento,
          bairro: dados.bairro || prev.bairro,
          cidade: dados.municipio || prev.cidade,
          estado: dados.uf || prev.estado,
          cep: dados.cep ? dados.cep.replace(/\D/g, '') : prev.cep
        }))
        toast.success('Dados cadastrais e endereço obtidos da Receita Federal!')
      } else {
        toast.error('CNPJ não localizado na base pública.')
      }
    } catch (err: any) {
      toast.error('Falha ao consultar CNPJ: ' + (err.message || 'Erro'))
    } finally {
      setBuscandoCnpj(false)
    }
  }

  const recalcularTotal = (itens: any[]) => {
    return itens.reduce((acc, it) => acc + (Number(it.valor_total) || 0), 0)
  }

  const handleItemChange = (index: number, field: string, value: any) => {
    const novosItens = [...formData.itens]
    const item = { ...novosItens[index], [field]: value }

    // Se alterou quantidade, valor bruto ou desconto, recalcular valores unitário líquido e total
    if (field === 'quantidade' || field === 'valor_unitario_original' || field === 'desconto') {
      const qtd = Number(field === 'quantidade' ? value : item.quantidade) || 1
      const vBruto = Number(field === 'valor_unitario_original' ? value : (item.valor_unitario_original !== undefined ? item.valor_unitario_original : item.valor_unitario)) || 0
      const desc = Number(field === 'desconto' ? value : item.desconto) || 0
      
      const vLiq = Math.max(0, vBruto - desc)
      item.valor_unitario_original = vBruto
      item.desconto = desc
      item.valor_unitario = vLiq
      item.valor_total = parseFloat((qtd * vLiq).toFixed(2))
    }

    novosItens[index] = item
    setFormData({ ...formData, itens: novosItens })
  }

  const handleAdicionarItem = () => {
    const novoItem = {
      tipo: 'produto',
      codigo: '',
      descricao: 'Novo Item',
      quantidade: 1,
      unidade_medida: 'UN',
      valor_unitario_original: 0,
      desconto: 0,
      valor_unitario: 0,
      valor_total: 0,
      ncm: '',
      cest: '',
      origem: '0',
      tipo_produto: '00'
    }
    setFormData({
      ...formData,
      itens: [...formData.itens, novoItem]
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

  const totalBrutoGeral = formData.itens.reduce((acc: number, it: any) => {
    const vBruto = Number(it.valor_unitario_original !== undefined ? it.valor_unitario_original : it.valor_unitario) || 0
    return acc + (vBruto * (Number(it.quantidade) || 1))
  }, 0)

  const totalDescontoGeral = formData.itens.reduce((acc: number, it: any) => {
    const desc = Number(it.desconto) || 0
    return acc + (desc * (Number(it.quantidade) || 1))
  }, 0)

  const totalLiquidoGeral = recalcularTotal(formData.itens)

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
      <div className="bg-dark-900 border border-dark-700/80 rounded-2xl w-full max-w-5xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden my-auto">
        
        {/* Header Neutro & Elegante */}
        <div className="px-6 py-4 border-b border-dark-700/80 flex items-center justify-between bg-dark-950/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-200 font-bold">
              <FileText size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-wide">
                  Editar Informações da Venda
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700">
                  OS #{formData.os_numero || 'S/N'}
                </span>
              </div>
              <p className="text-xs text-dark-400 mt-0.5">
                Ajuste os dados cadastrais, endereço, veículo e parâmetros tributários antes da emissão.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-dark-400 hover:text-white rounded-xl hover:bg-dark-800 transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {/* Corpo do Modal com Scroll */}
        <div className="p-6 overflow-y-auto space-y-6 custom-scrollbar flex-1 bg-dark-900/50">
          
          {/* Card 1: Dados do Cliente e Enriquecimento Automático */}
          <div className="bg-dark-850/80 border border-dark-700/80 rounded-2xl p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-dark-700/50 pb-2.5">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <User size={15} className="text-slate-300" />
                Dados do Cliente (Tomador / Destinatário)
              </h4>
              <span className="text-[11px] text-dark-400">
                Consulta CNPJ / CPF na Receita Federal
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-1">
                <label className="text-xs font-medium text-dark-300 mb-1 block">CPF / CNPJ</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.cpf_cnpj}
                    onChange={(e) => setFormData({ ...formData, cpf_cnpj: e.target.value })}
                    placeholder="00.000.000/0000-00"
                    className="w-full bg-dark-900 border border-dark-700 rounded-xl px-3.5 py-2.5 text-white font-mono text-xs outline-none focus:border-slate-400 transition-all"
                  />
                  {formData.cpf_cnpj.replace(/\D/g, '').length === 14 && (
                    <button
                      type="button"
                      onClick={handleConsultarCnpj}
                      disabled={buscandoCnpj}
                      className="px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all disabled:opacity-50"
                      title="Enriquecer dados cadastrais via BrasilAPI"
                    >
                      {buscandoCnpj ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
                      Receita
                    </button>
                  )}
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-dark-300 mb-1 block">Razão Social / Nome Completo</label>
                <input
                  type="text"
                  value={formData.cliente}
                  onChange={(e) => setFormData({ ...formData, cliente: e.target.value })}
                  placeholder="Nome do cliente"
                  className="w-full bg-dark-900 border border-dark-700 rounded-xl px-3.5 py-2.5 text-white text-xs outline-none focus:border-slate-400 transition-all font-semibold"
                />
              </div>
            </div>
          </div>

          {/* Card 2: Endereço do Destinatário & Autocomplete CEP */}
          <div className="bg-dark-850/80 border border-dark-700/80 rounded-2xl p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-dark-700/50 pb-2.5">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <MapPin size={15} className="text-slate-300" />
                Endereço de Faturamento
              </h4>
              <span className="text-[11px] text-dark-400">
                Obrigatório para emissão de NF-e e NFS-e
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-6 gap-3.5">
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-dark-300 mb-1 block">CEP</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.cep}
                    onChange={(e) => setFormData({ ...formData, cep: e.target.value })}
                    placeholder="00000-000"
                    maxLength={9}
                    className="w-full bg-dark-900 border border-dark-700 rounded-xl px-3.5 py-2.5 text-white font-mono text-xs outline-none focus:border-slate-400 transition-all"
                  />
                  <button
                    type="button"
                    onClick={handleConsultarCep}
                    disabled={buscandoCep}
                    className="px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all disabled:opacity-50"
                    title="Buscar Endereço via CEP"
                  >
                    {buscandoCep ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
                    CEP
                  </button>
                </div>
              </div>

              <div className="sm:col-span-3">
                <label className="text-xs font-medium text-dark-300 mb-1 block">Logradouro (Rua, Av)</label>
                <input
                  type="text"
                  value={formData.logradouro}
                  onChange={(e) => setFormData({ ...formData, logradouro: e.target.value })}
                  placeholder="Rua / Avenida..."
                  className="w-full bg-dark-900 border border-dark-700 rounded-xl px-3.5 py-2.5 text-white text-xs outline-none focus:border-slate-400 transition-all"
                />
              </div>

              <div className="sm:col-span-1">
                <label className="text-xs font-medium text-dark-300 mb-1 block">Número</label>
                <input
                  type="text"
                  value={formData.numero}
                  onChange={(e) => setFormData({ ...formData, numero: e.target.value })}
                  placeholder="S/N ou Nº"
                  className="w-full bg-dark-900 border border-dark-700 rounded-xl px-3.5 py-2.5 text-white text-xs outline-none focus:border-slate-400 transition-all"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="text-xs font-medium text-dark-300 mb-1 block">Complemento</label>
                <input
                  type="text"
                  value={formData.complemento}
                  onChange={(e) => setFormData({ ...formData, complemento: e.target.value })}
                  placeholder="Apto, Sala..."
                  className="w-full bg-dark-900 border border-dark-700 rounded-xl px-3.5 py-2.5 text-white text-xs outline-none focus:border-slate-400 transition-all"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="text-xs font-medium text-dark-300 mb-1 block">Bairro</label>
                <input
                  type="text"
                  value={formData.bairro}
                  onChange={(e) => setFormData({ ...formData, bairro: e.target.value })}
                  placeholder="Bairro..."
                  className="w-full bg-dark-900 border border-dark-700 rounded-xl px-3.5 py-2.5 text-white text-xs outline-none focus:border-slate-400 transition-all"
                />
              </div>

              <div className="sm:col-span-4">
                <label className="text-xs font-medium text-dark-300 mb-1 block">Cidade</label>
                <input
                  type="text"
                  value={formData.cidade}
                  onChange={(e) => setFormData({ ...formData, cidade: e.target.value })}
                  placeholder="Cidade..."
                  className="w-full bg-dark-900 border border-dark-700 rounded-xl px-3.5 py-2.5 text-white text-xs outline-none focus:border-slate-400 transition-all"
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
                  className="w-full bg-dark-900 border border-dark-700 rounded-xl px-3.5 py-2.5 text-white text-xs outline-none focus:border-slate-400 uppercase font-mono font-bold text-center transition-all"
                />
              </div>
            </div>
          </div>

          {/* Card 3: Informações de Veículo & Condição de Pagamento (Neutro e sem vendedor) */}
          <div className="bg-dark-850/80 border border-dark-700/80 rounded-2xl p-5 space-y-4 shadow-sm">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2 border-b border-dark-700/50 pb-2.5">
              <Car size={15} className="text-slate-300" />
              Operação, Veículo & Pagamento
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-dark-300 mb-1 block">Veículo / Placa</label>
                <input
                  type="text"
                  value={formData.veiculo}
                  onChange={(e) => setFormData({ ...formData, veiculo: e.target.value })}
                  placeholder="Marca Modelo - ABC1234"
                  className="w-full bg-dark-900 border border-dark-700 rounded-xl px-3.5 py-2.5 text-white text-xs outline-none focus:border-slate-400 transition-all font-semibold"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-dark-300 mb-1 block">Forma de Pagamento</label>
                <input
                  type="text"
                  value={formData.forma_pagamento}
                  onChange={(e) => setFormData({ ...formData, forma_pagamento: e.target.value })}
                  placeholder="Ex: Cartão de Crédito (3x)"
                  className="w-full bg-dark-900 border border-dark-700 rounded-xl px-3.5 py-2.5 text-white text-xs outline-none focus:border-slate-400 transition-all font-semibold"
                />
              </div>
            </div>
          </div>

          {/* Card 4: Tabela de Itens e Classificação Fiscal com Formato 99.999,00 */}
          <div className="bg-dark-850/80 border border-dark-700/80 rounded-2xl p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-dark-700/50 pb-2.5">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <DollarSign size={15} className="text-slate-300" />
                Itens da Venda e Classificação Fiscal ({formData.itens.length})
              </h4>
              <button
                type="button"
                onClick={handleAdicionarItem}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-xl text-xs font-bold transition-all"
              >
                <Plus size={13} />
                Adicionar Item
              </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-dark-700/60">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-dark-950/80 text-dark-400 font-bold uppercase tracking-wider text-[10px] border-b border-dark-700/80">
                    <th className="py-2.5 px-3 w-20">Tipo</th>
                    <th className="py-2.5 px-3 w-20">Código</th>
                    <th className="py-2.5 px-3 min-w-[160px]">Descrição</th>
                    <th className="py-2.5 px-3 w-14 text-center">Qtd</th>
                    <th className="py-2.5 px-3 w-28 text-right">Vl Bruto (R$)</th>
                    <th className="py-2.5 px-3 w-28 text-right text-rose-400">Desc Item (R$)</th>
                    <th className="py-2.5 px-3 w-28 text-right text-emerald-400">Vl Líq (R$)</th>
                    <th className="py-2.5 px-3 w-14 text-center">Un</th>
                    <th className="py-2.5 px-3 w-28">NCM</th>
                    <th className="py-2.5 px-3 w-24">CEST</th>
                    <th className="py-2.5 px-3 w-8 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-700/50">
                  {formData.itens.map((item: any, i: number) => {
                    const vBruto = Number(item.valor_unitario_original !== undefined ? item.valor_unitario_original : item.valor_unitario) || 0
                    const desc = Number(item.desconto) || 0
                    const vLiq = Math.max(0, vBruto - desc)

                    return (
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
                            className="w-full bg-dark-900 border border-dark-700 rounded-lg px-2 py-1 text-white font-mono text-[11px] outline-none focus:border-slate-400"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={item.descricao || ''}
                            onChange={(e) => handleItemChange(i, 'descricao', e.target.value)}
                            className="w-full bg-dark-900 border border-dark-700 rounded-lg px-2.5 py-1 text-white text-xs outline-none focus:border-slate-400 font-medium"
                          />
                        </td>
                        <td className="p-2 text-center">
                          <input
                            type="number"
                            step="1"
                            value={item.quantidade || 1}
                            onChange={(e) => {
                              const q = parseFloat(e.target.value) || 1
                              const novosItens = [...formData.itens]
                              novosItens[i] = {
                                ...novosItens[i],
                                quantidade: q,
                                valor_total: parseFloat((q * vLiq).toFixed(2))
                              }
                              setFormData({ ...formData, itens: novosItens })
                            }}
                            className="w-14 bg-dark-900 border border-dark-700 rounded-lg px-1 py-1 text-white text-center text-xs outline-none focus:border-slate-400 font-bold"
                          />
                        </td>
                        
                        {/* Vl Bruto Formatado 99.999,00 */}
                        <td className="p-2 text-right">
                          <input
                            type="text"
                            defaultValue={formatBRL(vBruto)}
                            key={`bruto_${i}_${vBruto}`}
                            onBlur={(e) => {
                              const novoBruto = parseBRL(e.target.value)
                              const novoLiq = Math.max(0, novoBruto - desc)
                              const novosItens = [...formData.itens]
                              novosItens[i] = {
                                ...novosItens[i],
                                valor_unitario_original: novoBruto,
                                valor_unitario: novoLiq,
                                valor_total: parseFloat((novosItens[i].quantidade * novoLiq).toFixed(2))
                              }
                              setFormData({ ...formData, itens: novosItens })
                            }}
                            className="w-28 bg-dark-900 border border-dark-700 rounded-lg px-2 py-1 text-white text-right text-xs outline-none focus:border-slate-400 font-mono font-medium tabular-nums"
                          />
                        </td>

                        {/* Desconto Formatado 99.999,00 */}
                        <td className="p-2 text-right">
                          <input
                            type="text"
                            defaultValue={formatBRL(desc)}
                            key={`desc_${i}_${desc}`}
                            onBlur={(e) => {
                              const novoDesc = parseBRL(e.target.value)
                              const novoLiq = Math.max(0, vBruto - novoDesc)
                              const novosItens = [...formData.itens]
                              novosItens[i] = {
                                ...novosItens[i],
                                desconto: novoDesc,
                                valor_unitario: novoLiq,
                                valor_total: parseFloat((novosItens[i].quantidade * novoLiq).toFixed(2))
                              }
                              setFormData({ ...formData, itens: novosItens })
                            }}
                            className="w-28 bg-dark-900 border border-rose-500/30 rounded-lg px-2 py-1 text-rose-300 text-right text-xs outline-none focus:border-rose-400 font-mono font-bold tabular-nums"
                          />
                        </td>

                        {/* Vl Líquido Formatado 99.999,00 */}
                        <td className="p-2 text-right font-mono font-bold text-emerald-400 tabular-nums text-xs">
                          R$ {formatBRL(vLiq)}
                        </td>

                        <td className="p-2 text-center">
                          <input
                            type="text"
                            value={item.unidade_medida || 'UN'}
                            onChange={(e) => handleItemChange(i, 'unidade_medida', e.target.value.toUpperCase())}
                            className="w-12 bg-dark-900 border border-dark-700 rounded-lg px-1 py-1 text-white text-center text-[10px] outline-none uppercase font-bold"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={item.ncm || ''}
                            onChange={(e) => handleItemChange(i, 'ncm', e.target.value)}
                            placeholder="NCM"
                            className="w-full bg-dark-900 border border-dark-700 rounded-lg px-2 py-1 text-white font-mono text-[11px] outline-none"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={item.cest || ''}
                            onChange={(e) => handleItemChange(i, 'cest', e.target.value)}
                            placeholder="CEST"
                            className="w-full bg-dark-900 border border-dark-700 rounded-lg px-2 py-1 text-white font-mono text-[11px] outline-none"
                          />
                        </td>
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoverItem(i)}
                            disabled={formData.itens.length <= 1}
                            className="text-dark-500 hover:text-rose-400 p-1 rounded-lg transition-colors disabled:opacity-20"
                            title="Remover Item"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Resumo Financeiro no Rodapé do Card com Formato 99.999,00 */}
            <div className="flex flex-wrap items-center justify-between pt-3 border-t border-dark-700/60 text-xs">
              <div className="flex items-center gap-4 text-dark-300">
                <span>{formData.itens.length} {formData.itens.length === 1 ? 'item' : 'itens'}</span>
                <span>Bruto: <strong className="text-white font-mono">R$ {formatBRL(totalBrutoGeral)}</strong></span>
                {totalDescontoGeral > 0 && (
                  <span className="text-rose-400">
                    Descontos: <strong className="font-mono font-bold">-R$ {formatBRL(totalDescontoGeral)}</strong>
                  </span>
                )}
              </div>
              <div className="text-right">
                <span className="text-dark-400 mr-2 text-[11px] font-bold uppercase tracking-wider">Líquido Final da OS:</span>
                <span className="text-lg font-black text-emerald-400 font-mono">
                  R$ {formatBRL(totalLiquidoGeral)}
                </span>
              </div>
            </div>

          </div>

        </div>

        {/* Footer com Botões */}
        <div className="px-6 py-4 border-t border-dark-700/80 bg-dark-950 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-xs font-bold text-dark-300 hover:text-white bg-dark-800 hover:bg-dark-700 transition-all"
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
