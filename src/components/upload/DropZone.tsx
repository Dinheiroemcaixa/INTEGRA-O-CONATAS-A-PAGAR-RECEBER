'use client'

import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, FileSpreadsheet, FileText, Image, X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { parseArquivo } from '@/lib/parsers/datacar'
import type { ResultadoImportacao } from '@/types'
import toast from 'react-hot-toast'

const TIPOS_ACEITOS = {
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-excel': ['.xls'],
  'text/csv': ['.csv'],
  'application/pdf': ['.pdf'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp'],
}

const TAMANHO_MAXIMO = 20 * 1024 * 1024 // 20 MB

interface Props {
  onResultado: (resultado: ResultadoImportacao, arquivo: File) => void
  processando?: boolean
}

function IconeArquivo({ tipo }: { tipo: string }) {
  if (tipo.includes('sheet') || tipo.includes('excel') || tipo.includes('csv')) {
    return <FileSpreadsheet size={32} className="text-green-400" />
  }
  if (tipo.includes('pdf')) {
    return <FileText size={32} className="text-red-400" />
  }
  return <Image size={32} className="text-blue-400" />
}

export default function DropZone({ onResultado, processando }: Props) {
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [carregando, setCarregando] = useState(false)

  const processarArquivo = useCallback(async (file: File) => {
    setArquivo(file)
    setCarregando(true)
    console.log('[DROPZONE] Arquivo selecionado:', file.name, 'Tipo:', file.type, 'Tamanho:', file.size)
    try {
      const resultado = await parseArquivo(file)
      console.log('[DROPZONE] Resultado da análise:', resultado)
      if (resultado.total === 0) {
        const msgErro = resultado.motivo || 'Nenhum dado encontrado no arquivo. Verifique se a planilha contém colunas de Valor e Vencimento.'
        console.warn('[DROPZONE] Nenhum dado retornado:', msgErro)
        toast.error(msgErro, { duration: 6000 })
        setArquivo(null)
        return
      }
      onResultado(resultado, file)
      if (resultado.aviso) {
        toast(resultado.aviso, { icon: '⚠️', duration: 6000 })
      } else {
        toast.success(`${resultado.validos} registros identificados!`)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao processar arquivo'
      console.error('[DROPZONE] Erro durante parseArquivo:', err)
      toast.error(`Erro ao ler planilha: ${msg}`, { duration: 6000 })
      setArquivo(null)
    } finally {
      setCarregando(false)
    }
  }, [onResultado])

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles[0]) processarArquivo(acceptedFiles[0])
  }, [processarArquivo])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: TIPOS_ACEITOS,
    maxSize: TAMANHO_MAXIMO,
    maxFiles: 1,
    disabled: carregando || processando,
    onDropRejected: (rejections) => {
      const err = rejections[0]?.errors[0]
      if (err?.code === 'file-too-large') {
        toast.error('Arquivo muito grande. Máximo 20 MB.')
      } else if (err?.code === 'file-invalid-type') {
        toast.error('Formato não aceito. Use: Excel, CSV, PDF ou imagem.')
      } else {
        toast.error('Arquivo inválido.')
      }
    },
  })

  const limpar = () => setArquivo(null)

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={cn(
          'border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all duration-200',
          isDragActive
            ? 'border-primary-500 bg-primary-500/10 scale-[1.01]'
            : arquivo
            ? 'border-emerald-500/50 bg-emerald-500/5'
            : 'border-dark-700 bg-dark-850/80 hover:border-primary-500/60 hover:bg-primary-500/5',
          (carregando || processando) && 'opacity-60 cursor-not-allowed'
        )}
      >
        <input {...getInputProps()} />

        {carregando ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={40} className="text-primary-400 animate-spin" />
            <p className="text-white font-medium">Processando arquivo...</p>
            <p className="text-dark-400 text-sm">Extraindo dados do DataCar</p>
          </div>
        ) : arquivo ? (
          <div className="flex flex-col items-center gap-3">
            <IconeArquivo tipo={arquivo.type} />
            <div>
              <p className="text-white font-medium">{arquivo.name}</p>
              <p className="text-dark-400 text-sm mt-0.5">
                {(arquivo.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
            <p className="text-green-400 text-sm">✓ Arquivo processado</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className={cn(
              'w-14 h-14 rounded-xl flex items-center justify-center transition-all',
              isDragActive ? 'bg-primary-500/20 text-primary-400' : 'bg-dark-800 border border-dark-700 text-dark-400'
            )}>
              <Upload size={26} />
            </div>
            <div>
              <p className="text-white font-semibold text-lg">
                {isDragActive ? 'Solte o arquivo aqui' : 'Arraste o arquivo DataCar'}
              </p>
              <p className="text-dark-400 text-sm mt-1">
                ou <span className="text-primary-400 font-medium hover:text-primary-300">clique para selecionar</span>
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
              {['Excel .xlsx', 'CSV .csv', 'PDF .pdf', 'Imagem .png/.jpg'].map((fmt) => (
                <span key={fmt} className="text-xs bg-dark-800 border border-dark-700 text-dark-300 px-2.5 py-1 rounded-md font-medium">
                  {fmt}
                </span>
              ))}
            </div>
            <p className="text-dark-500 text-xs">Tamanho máximo: 20 MB</p>
          </div>
        )}
      </div>

      {arquivo && !carregando && (
        <button
          onClick={limpar}
          className="flex items-center gap-2 text-dark-400 hover:text-white text-sm transition-colors"
        >
          <X size={14} /> Remover e carregar outro arquivo
        </button>
      )}
    </div>
  )
}
