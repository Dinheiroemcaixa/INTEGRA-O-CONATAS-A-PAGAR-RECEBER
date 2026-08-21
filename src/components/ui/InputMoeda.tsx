"use client"

import { useEffect, useState } from 'react'

interface InputMoedaProps {
  value: number
  onChange: (valor: number) => void
  className?: string
  placeholder?: string
  disabled?: boolean
  autoFocus?: boolean
  onBlur?: () => void
  id?: string
  title?: string
  permiteNegativo?: boolean
}

function formatarCentavos(digitosBrutos: string, negativo: boolean): string {
  const somenteDigitos = digitosBrutos.replace(/\D/g, '')
  const numero = somenteDigitos === '' ? 0 : parseInt(somenteDigitos, 10)
  const valor = (numero / 100) * (negativo ? -1 : 1)
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function paraCentavos(valor: number): string {
  return String(Math.round(Math.abs(valor || 0) * 100))
}

function textoParaNumero(texto: string): number {
  const n = parseFloat(texto.replace(/\./g, '').replace(',', '.'))
  return isNaN(n) ? 0 : n
}

export default function InputMoeda({ value, onChange, className, placeholder, disabled, autoFocus, onBlur, id, title, permiteNegativo }: InputMoedaProps) {
  const [texto, setTexto] = useState(() => formatarCentavos(paraCentavos(value), value < 0))

  useEffect(() => {
    const centavosExternos = paraCentavos(value)
    const negativoExterno = value < 0
    const atual = textoParaNumero(texto)
    const centavosAtuais = paraCentavos(atual)
    const negativoAtual = atual < 0
    if (centavosExternos !== centavosAtuais || negativoExterno !== negativoAtual) {
      setTexto(formatarCentavos(centavosExternos, negativoExterno))
    }
  }, [value])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const negativo = !!permiteNegativo && e.target.value.includes('-')
    const formatado = formatarCentavos(e.target.value, negativo)
    setTexto(formatado)
    onChange(textoParaNumero(formatado))
  }

  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      value={texto}
      onChange={handleChange}
      onFocus={e => e.target.select()}
      onBlur={onBlur}
      placeholder={placeholder || '0,00'}
      disabled={disabled}
      autoFocus={autoFocus}
      className={className}
      title={title}
    />
  )
}
