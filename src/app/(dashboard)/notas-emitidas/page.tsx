'use client'

import { useState } from 'react'
import { 
  Database, Search, Plus, Filter,
  Eye, RefreshCw, XCircle, FileCode, FileText,
  MoreVertical, Calendar
} from 'lucide-react'

// Dados fake para ilustrar o mockup baseado na screenshot
const MOCK_NOTAS = [
  { id: '1', data_geracao: '16/07/2026', cliente: '07.476.964/0001-50 - DIFERENCIAL PROJETOS INDUSTRIAIS', competencia: '07/2026', municipio: 'Belo Horizonte/MG', valor: 850.00, status: 'emitida' },
  { id: '2', data_geracao: '15/07/2026', cliente: '60.278.875/0001-81 - ALISSON DE SOUZA GOMES', competencia: '07/2026', municipio: 'Belo Horizonte/MG', valor: 300.00, status: 'emitida' },
  { id: '3', data_geracao: '14/07/2026', cliente: '15.372.421/0001-10 - ACRIL SINALIZACAO LTDA', competencia: '07/2026', municipio: 'Belo Horizonte/MG', valor: 309.57, status: 'emitida' },
  { id: '4', data_geracao: '09/07/2026', cliente: '60.597.752/0001-03 - AUTOCAR EXCELLENCE SERVICE LTDA', competencia: '07/2026', municipio: 'Belo Horizonte/MG', valor: 500.00, status: 'cancelada' },
]

export default function NotasEmitidasPage() {
  const [dropdownAberto, setDropdownAberto] = useState<string | null>(null)

  const formatCurrency = (val: number) => 
    val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  return (
    <div className="space-y-6 animate-fade-in p-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Database className="text-blue-500" />
            Notas Emitidas (NFS-e)
          </h1>
          <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-[10px] font-bold rounded border border-blue-500/30 uppercase tracking-wider">
            Portal Gov.br
          </span>
        </div>
      </div>

      {/* Alerta temporário / Informativo */}
      <div className="bg-blue-500/10 border border-blue-500/30 p-4 rounded-lg flex gap-3 text-blue-200 text-sm">
        <Database className="mt-0.5 flex-shrink-0" size={18} />
        <div>
          <p className="font-semibold text-blue-300">Integração em Desenvolvimento</p>
          <p>Esta tela é uma demonstração de como será o gerenciamento das notas emitidas pelo portal nacional NFS-e. As ações reais de assinatura digital com certificado A1 e envio via webservice estarão disponíveis na próxima atualização.</p>
        </div>
      </div>

      {/* Toolbar / Filtros */}
      <div className="bg-dark-800 border border-dark-700 rounded-xl p-4 flex flex-wrap gap-4 items-end">
        <button className="bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded-lg font-semibold flex items-center gap-2 transition-colors">
          <Plus size={18} /> Nova NFS-e
        </button>

        <button className="bg-dark-700 hover:bg-dark-600 border border-dark-600 text-white p-2 rounded-lg transition-colors">
          <RefreshCw size={18} />
        </button>

        <div className="flex-1 min-w-[250px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" size={18} />
          <input 
            type="text" 
            placeholder="Pesquisar pessoa física ou jurídica..." 
            className="w-full bg-dark-900 border border-dark-700 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:border-brand-500 outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" size={16} />
            <input type="date" className="bg-dark-900 border border-dark-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:border-brand-500 outline-none" defaultValue="2026-06-16" />
          </div>
          <span className="text-dark-400">até</span>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" size={16} />
            <input type="date" className="bg-dark-900 border border-dark-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:border-brand-500 outline-none" defaultValue="2026-07-16" />
          </div>
          <button className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-semibold flex items-center gap-2 ml-2 transition-colors">
            <Filter size={16} /> Filtrar
          </button>
        </div>
      </div>

      {/* Tabela de Notas */}
      <div className="bg-dark-800 border border-dark-700 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-dark-900/50 text-dark-400 border-b border-dark-700">
              <tr>
                <th className="px-4 py-3 font-medium">Geração</th>
                <th className="px-4 py-3 font-medium">Emitida para</th>
                <th className="px-4 py-3 font-medium text-center">Competência</th>
                <th className="px-4 py-3 font-medium">Município Emissor</th>
                <th className="px-4 py-3 font-medium text-right">Preço Serviço</th>
                <th className="px-4 py-3 font-medium text-center w-16">Status</th>
                <th className="px-4 py-3 w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-700/50">
              {MOCK_NOTAS.map(nota => (
                <tr key={nota.id} className="hover:bg-dark-700/30 transition-colors group">
                  <td className="px-4 py-4 text-dark-300">{nota.data_geracao}</td>
                  <td className="px-4 py-4 font-medium text-white max-w-[300px] truncate">
                    <span className="inline-block w-5 h-5 bg-blue-500/20 text-blue-400 text-center rounded mr-2 text-xs font-bold leading-5">T</span>
                    {nota.cliente}
                  </td>
                  <td className="px-4 py-4 text-dark-300 text-center">{nota.competencia}</td>
                  <td className="px-4 py-4 text-dark-300">{nota.municipio}</td>
                  <td className="px-4 py-4 text-white font-semibold text-right">{formatCurrency(nota.valor)}</td>
                  <td className="px-4 py-4 text-center">
                    {nota.status === 'emitida' ? (
                      <span className="w-6 h-6 inline-flex items-center justify-center bg-emerald-500/10 text-emerald-400 rounded-full">
                        <FileText size={14} />
                      </span>
                    ) : (
                      <span className="w-6 h-6 inline-flex items-center justify-center bg-rose-500/10 text-rose-400 rounded-full">
                        <XCircle size={14} />
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-4 relative text-right">
                    <button 
                      onClick={() => setDropdownAberto(dropdownAberto === nota.id ? null : nota.id)}
                      className="p-1 text-dark-400 hover:text-white hover:bg-dark-700 rounded transition-colors"
                    >
                      <MoreVertical size={18} />
                    </button>

                    {/* Dropdown Menu */}
                    {dropdownAberto === nota.id && (
                      <div className="absolute right-8 top-12 w-48 bg-dark-800 border border-dark-600 rounded-xl shadow-2xl z-50 py-1 flex flex-col animate-in fade-in zoom-in duration-150">
                        <button className="flex items-center gap-3 px-4 py-2 text-sm text-dark-300 hover:text-white hover:bg-dark-700 transition-colors text-left">
                          <Eye size={15} className="text-dark-400" /> Visualizar
                        </button>
                        <button className="flex items-center gap-3 px-4 py-2 text-sm text-dark-300 hover:text-white hover:bg-dark-700 transition-colors text-left">
                          <RefreshCw size={15} className="text-dark-400" /> Substituir
                        </button>
                        <button className="flex items-center gap-3 px-4 py-2 text-sm text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors text-left">
                          <XCircle size={15} /> Cancelar NFS-e
                        </button>
                        <div className="h-px bg-dark-700 my-1"></div>
                        <button className="flex items-center gap-3 px-4 py-2 text-sm text-dark-300 hover:text-white hover:bg-dark-700 transition-colors text-left">
                          <FileCode size={15} className="text-emerald-500" /> Download XML
                        </button>
                        <button className="flex items-center gap-3 px-4 py-2 text-sm text-dark-300 hover:text-white hover:bg-dark-700 transition-colors text-left">
                          <FileText size={15} className="text-blue-400" /> Download DANFS-e
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {dropdownAberto && (
        <div className="fixed inset-0 z-40" onClick={() => setDropdownAberto(null)}></div>
      )}
    </div>
  )
}
