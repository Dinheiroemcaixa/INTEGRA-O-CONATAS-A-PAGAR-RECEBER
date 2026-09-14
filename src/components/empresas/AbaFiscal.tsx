'use client'

import React, { useState, useEffect } from 'react'
import { Empresa } from '@/types'
import { 
  FileText, 
  ShieldCheck, 
  KeyRound, 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  Save, 
  Loader2, 
  Eye, 
  EyeOff, 
  Lock,
  Calendar,
  Building
} from 'lucide-react'
import toast from 'react-hot-toast'

interface AbaFiscalProps {
  empresa: Empresa
  onUpdated: (empresaAtualizada: Empresa) => void
}

export function AbaFiscal({ empresa, onUpdated }: AbaFiscalProps) {
  const [emiteNfse, setEmiteNfse] = useState((empresa as any).emite_nfse || (empresa as any).optante_simples || false)
  const [regimeTributario, setRegimeTributario] = useState('1')
  const [cidadeIbge, setCidadeIbge] = useState('3106200')
  const [codigoTributacao, setCodigoTributacao] = useState('14.01.01')
  const [inscricaoMunicipal, setInscricaoMunicipal] = useState('')
  const [aliquotaSimples, setAliquotaSimples] = useState('11.34')
  const [aliquotaIssqn, setAliquotaIssqn] = useState('')

  // Certificado Digital
  const [senhaCertificado, setSenhaCertificado] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [certificadoFile, setCertificadoFile] = useState<File | null>(null)
  const [temCertificadoSalvo, setTemCertificadoSalvo] = useState(false)
  const [nomeCertificadoSalvo, setNomeCertificadoSalvo] = useState<string | null>(null)

  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)

  // Carregar dados fiscais existentes
  useEffect(() => {
    let montado = true
    setCarregando(true)

    fetch(`/api/config-fiscal?empresa_id=${empresa.id}`)
      .then(r => r.json())
      .then(data => {
        if (!montado) return
        if (data?.config) {
          if (data.config.inscricao_municipal) setInscricaoMunicipal(data.config.inscricao_municipal)
          if (data.config.aliquota_issqn) setAliquotaIssqn(String(data.config.aliquota_issqn))
          if (data.config.aliquota_simples) setAliquotaSimples(String(data.config.aliquota_simples))
          if (data.config.codigo_tributacao_nacional) setCodigoTributacao(data.config.codigo_tributacao_nacional)
          if (data.config.codigo_municipio_ibge) setCidadeIbge(data.config.codigo_municipio_ibge)
          if (data.config.regime_tributario) setRegimeTributario(String(data.config.regime_tributario))
          if (data.config.certificado_digital_path) {
            setTemCertificadoSalvo(true)
            setNomeCertificadoSalvo('certificado_a1_salvo.pfx')
          }
        }
      })
      .catch(() => {
        // silencioso
      })
      .finally(() => {
        if (montado) setCarregando(false)
      })

    return () => {
      montado = false
    }
  }, [empresa.id])

  // Salvar configurações fiscais
  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault()
    setSalvando(true)

    try {
      const formData = new FormData()
      formData.append('empresa_id', empresa.id)
      formData.append('emite_nfse', String(emiteNfse))
      formData.append('regime_tributario', regimeTributario)
      formData.append('cidade_ibge', cidadeIbge)
      formData.append('codigo_tributacao', codigoTributacao)
      formData.append('inscricao_municipal', inscricaoMunicipal)
      formData.append('aliquota_simples', aliquotaSimples)
      formData.append('aliquota_issqn', aliquotaIssqn)

      if (certificadoFile) {
        formData.append('certificado', certificadoFile)
      }
      if (senhaCertificado) {
        formData.append('senha_certificado', senhaCertificado)
      }

      const res = await fetch('/api/config-fiscal', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar configuração fiscal')

      toast.success('Configurações fiscais e certificado salvos com sucesso!')
      if (certificadoFile) {
        setTemCertificadoSalvo(true)
        setNomeCertificadoSalvo(certificadoFile.name)
        setCertificadoFile(null)
        setSenhaCertificado('')
      }
      onUpdated({ ...empresa, emite_nfse: emiteNfse, optante_simples: emiteNfse })
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar configuração fiscal')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form onSubmit={handleSalvar} className="space-y-6">
      {/* 1. CARD ESPECIAL: CERTIFICADO DIGITAL A1 */}
      <div className="bg-dark-800/80 border border-dark-700/70 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-dark-700/60 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <ShieldCheck size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-white text-base">Certificado Digital A1 (e-CNPJ)</h4>
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                  temCertificadoSalvo || certificadoFile
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                }`}>
                  {temCertificadoSalvo || certificadoFile ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                  {temCertificadoSalvo || certificadoFile ? 'Certificado Ativo' : 'Pendente de Upload'}
                </span>
              </div>
              <p className="text-xs text-dark-400">Necessário para assinatura digital e emissão automática de NFS-e no Gov.br</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Upload de arquivo .pfx / .p12 */}
          <div>
            <label className="block text-xs font-medium text-dark-300 mb-1">
              Arquivo do Certificado (.pfx ou .p12)
            </label>
            <div className="relative">
              <label className="w-full flex items-center justify-between px-3.5 py-2.5 bg-dark-900 border border-dashed border-dark-600 hover:border-blue-500/70 rounded-xl text-xs text-dark-300 cursor-pointer transition-colors">
                <span className="truncate flex items-center gap-2">
                  <Upload size={14} className="text-blue-400 flex-shrink-0" />
                  <span className="truncate text-white font-medium">
                    {certificadoFile ? certificadoFile.name : (nomeCertificadoSalvo || 'Selecionar certificado A1...')}
                  </span>
                </span>
                <span className="bg-dark-800 text-dark-300 px-2 py-0.5 rounded text-[11px] border border-dark-700 flex-shrink-0">
                  {certificadoFile ? 'Substituir' : 'Escolher'}
                </span>
                <input
                  type="file"
                  accept=".pfx,.p12"
                  onChange={(e) => setCertificadoFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
              </label>
            </div>
            {temCertificadoSalvo && !certificadoFile && (
              <p className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
                <CheckCircle2 size={12} /> Certificado criptografado ativo no servidor.
              </p>
            )}
          </div>

          {/* Senha do Certificado Digital */}
          <div>
            <label className="block text-xs font-medium text-dark-300 mb-1">
              Senha do Certificado A1
            </label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400">
                <KeyRound size={14} />
              </div>
              <input
                type={mostrarSenha ? 'text' : 'password'}
                value={senhaCertificado}
                onChange={(e) => setSenhaCertificado(e.target.value)}
                placeholder={temCertificadoSalvo ? '•••••••••••• (Senha Salva)' : 'Senha do arquivo .pfx'}
                className="w-full bg-dark-900 border border-dark-600 rounded-xl pl-9 pr-10 py-2.5 text-white text-xs font-mono focus:ring-2 focus:ring-blue-500/50 outline-none placeholder:text-dark-500"
              />
              <button
                type="button"
                onClick={() => setMostrarSenha(!mostrarSenha)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 hover:text-white"
              >
                {mostrarSenha ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <p className="text-[11px] text-dark-500 mt-1">
              {temCertificadoSalvo ? 'Preencha apenas se desejar atualizar a senha.' : 'A senha é encriptada no backend.'}
            </p>
          </div>
        </div>
      </div>

      {/* 2. CARD: PARÂMETROS FISCAIS DA NFS-E GOV.BR */}
      <div className="bg-dark-800/80 border border-dark-700/70 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-dark-700/60">
          <div className="flex items-center gap-2.5">
            <FileText className="text-teal-400" size={18} />
            <h4 className="font-semibold text-white text-base">Parâmetros da NFS-e Nacional / Gov.br</h4>
          </div>

          {/* Toggle Emite NFS-e */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={emiteNfse}
              onChange={(e) => setEmiteNfse(e.target.checked)}
              className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 bg-dark-900 border-dark-600"
            />
            <span className="text-xs font-medium text-white">Habilitar Emissão nesta filial</span>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Regime Tributário */}
          <div>
            <label className="block text-xs font-medium text-dark-300 mb-1">Regime Tributário</label>
            <select
              value={regimeTributario}
              onChange={(e) => setRegimeTributario(e.target.value)}
              className="w-full bg-dark-900 border border-dark-600 rounded-xl px-3.5 py-2.5 text-white text-xs focus:ring-2 focus:ring-blue-500/50 outline-none"
            >
              <option value="1">1 - Simples Nacional</option>
              <option value="2">2 - Simples Nacional - Excesso de Sublimite</option>
              <option value="3">3 - Regime Normal (Lucro Presumido / Real)</option>
            </select>
          </div>

          {/* Código IBGE do Município */}
          <div>
            <label className="block text-xs font-medium text-dark-300 mb-1">
              Código IBGE do Município
            </label>
            <input
              type="text"
              value={cidadeIbge}
              onChange={(e) => setCidadeIbge(e.target.value)}
              placeholder="Ex: 3106200 (Belo Horizonte)"
              className="w-full bg-dark-900 border border-dark-600 rounded-xl px-3.5 py-2.5 text-white text-xs font-mono focus:ring-2 focus:ring-blue-500/50 outline-none"
            />
          </div>

          {/* Código de Tributação Nacional */}
          <div>
            <label className="block text-xs font-medium text-dark-300 mb-1">
              Código Tributação Nacional
            </label>
            <input
              type="text"
              value={codigoTributacao}
              onChange={(e) => setCodigoTributacao(e.target.value)}
              placeholder="Ex: 14.01.01 (Oficina mecânica)"
              className="w-full bg-dark-900 border border-dark-600 rounded-xl px-3.5 py-2.5 text-white text-xs font-mono focus:ring-2 focus:ring-blue-500/50 outline-none"
            />
          </div>

          {/* Inscrição Municipal */}
          <div>
            <label className="block text-xs font-medium text-dark-300 mb-1">
              Inscrição Municipal
            </label>
            <input
              type="text"
              value={inscricaoMunicipal}
              onChange={(e) => setInscricaoMunicipal(e.target.value)}
              placeholder="Ex: 12345678"
              className="w-full bg-dark-900 border border-dark-600 rounded-xl px-3.5 py-2.5 text-white text-xs font-mono focus:ring-2 focus:ring-blue-500/50 outline-none"
            />
          </div>

          {/* Alíquota Simples Nacional */}
          <div>
            <label className="block text-xs font-medium text-dark-300 mb-1">
              Alíquota Simples Nacional (%)
            </label>
            <input
              type="text"
              value={aliquotaSimples}
              onChange={(e) => setAliquotaSimples(e.target.value)}
              placeholder="Ex: 11.34"
              className="w-full bg-dark-900 border border-dark-600 rounded-xl px-3.5 py-2.5 text-white text-xs font-mono focus:ring-2 focus:ring-blue-500/50 outline-none"
            />
          </div>

          {/* Alíquota ISSQN */}
          <div>
            <label className="block text-xs font-medium text-dark-300 mb-1">
              Alíquota ISSQN (%) (Opcional)
            </label>
            <input
              type="text"
              value={aliquotaIssqn}
              onChange={(e) => setAliquotaIssqn(e.target.value)}
              placeholder="Ex: 5.00"
              className="w-full bg-dark-900 border border-dark-600 rounded-xl px-3.5 py-2.5 text-white text-xs font-mono focus:ring-2 focus:ring-blue-500/50 outline-none"
            />
          </div>
        </div>
      </div>

      {/* Botão de Salvar Configurações Fiscais */}
      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={salvando}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors shadow-lg shadow-blue-500/10"
        >
          {salvando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          <span>{salvando ? 'Gravando dados fiscais...' : 'Salvar Configurações Fiscais'}</span>
        </button>
      </div>
    </form>
  )
}
