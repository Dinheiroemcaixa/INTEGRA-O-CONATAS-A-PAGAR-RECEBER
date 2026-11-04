'use client'

import React, { useState } from 'react'
import {
  ArrowUpCircle,
  Sparkles,
  CreditCard,
  QrCode,
  Layers,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react'
import { useEmpresa } from '@/contexts/EmpresaContext'
import SelectorEmpresa from '@/components/layout/SelectorEmpresa'
import PainelFrentesReceber, {
  type AbaReceber,
} from '@/components/contas-receber/PainelFrentesReceber'

export default function ContasReceberPage() {
  const { empresaAtiva } = useEmpresa()
  const [abaAtiva, setAbaAtiva] = useState<AbaReceber>('cartoes')

  return (
    <div className="dx-page space-y-5 animate-fade-in">
      {/* CABEÇALHO EXECUTIVO (Padrão DCX LINK) */}
      <div className="dx-head bg-[var(--dx-card)] border border-[var(--dx-line)] rounded-[18px] px-4 py-3 shadow-[var(--dx-shadow-card)]">
        <div className="dx-head-id">
          <div className="dx-head-ico w-11 h-11 rounded-[13px] bg-gradient-to-br from-[#0ca668] to-[#0b1e5b] text-white shadow-md">
            <ArrowUpCircle size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="dx-title">Contas a Receber</h1>
              <span className="dx-tag">
                <Sparkles size={11} />
                <span>Etapa 1B · Fundação Visual</span>
              </span>
            </div>
            <p className="dx-subtitle">
              Recebimentos de cartões (Stone, Rede, Getnet, InfinitePay), PIX,
              outras modalidades e conferência segura para o Conta Azul
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <SelectorEmpresa />
        </div>
      </div>

      {/* BARRA DE ABAS HORIZONTAIS (4 Frentes do Módulo) */}
      <div className="dx-tabs">
        <div className="dx-tablist">
          <button
            type="button"
            onClick={() => setAbaAtiva('cartoes')}
            className={`dx-tab ${abaAtiva === 'cartoes' ? 'is-on' : ''}`}
          >
            <CreditCard size={15} />
            <span>Cartões (Adquirentes)</span>
          </button>

          <button
            type="button"
            onClick={() => setAbaAtiva('pix')}
            className={`dx-tab ${abaAtiva === 'pix' ? 'is-on' : ''}`}
          >
            <QrCode size={15} />
            <span>PIX Recebido</span>
          </button>

          <button
            type="button"
            onClick={() => setAbaAtiva('outras')}
            className={`dx-tab ${abaAtiva === 'outras' ? 'is-on' : ''}`}
          >
            <Layers size={15} />
            <span>Outras Modalidades</span>
          </button>

          <button
            type="button"
            onClick={() => setAbaAtiva('conferencia')}
            className={`dx-tab ${abaAtiva === 'conferencia' ? 'is-on' : ''}`}
          >
            <ShieldCheck size={15} />
            <span>Conferência & Simulador</span>
          </button>
        </div>
      </div>

      {/* AVISO QUANDO NENHUMA EMPRESA ESTÁ SELECIONADA */}
      {!empresaAtiva && (
        <div className="dx-alert">
          <AlertCircle size={18} className="flex-shrink-0" />
          <span>
            Selecione uma loja/empresa no seletor superior para vincular o
            contexto visual do módulo Contas a Receber.
          </span>
        </div>
      )}

      {/* PAINEL PRINCIPAL DAS FRENTES E SIMULADOR EM MEMÓRIA */}
      <PainelFrentesReceber
        abaAtiva={abaAtiva}
        onChangeAba={setAbaAtiva}
        empresaId={empresaAtiva?.id || 'emp-demo'}
        empresaNome={empresaAtiva?.nome || 'Loja Demonstração (Em Memória)'}
      />
    </div>
  )
}
