'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useEmpresa } from '@/contexts/EmpresaContext';
import SelectorEmpresa from '@/components/layout/SelectorEmpresa';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  ShieldCheck, AlertTriangle, CheckCircle2, TrendingUp,
  FileSpreadsheet, UploadCloud, Search, Filter, RefreshCw,
  Download, Printer, ChevronLeft, ChevronRight, Check, X,
  Building2, Calendar, FileText, ArrowUpDown, HelpCircle,
  Clock, AlertCircle, Eye, ChevronDown, CheckCheck, Landmark
} from 'lucide-react';
import toast from 'react-hot-toast';

// ─── TIPOS DA INTERFACE ──────────────────────────────────────────

interface ContaFinanceira {
  id: string;
  descricao?: string;
  nome?: string;
  name?: string;
  tipo?: string;
  type?: string;
  bankName?: string;
}

interface SessaoAuditoria {
  id: string;
  empresa_id: string;
  conta_financeira_id: string;
  banco_nome: string;
  arquivo_nome: string;
  arquivo_tipo: 'EXCEL' | 'CSV';
  arquivo_hash: string;
  periodo_inicio: string;
  periodo_fim: string;
  total_transacoes: number;
  total_debitos: number;
  total_creditos: number;
  valor_total_debitos: number;
  valor_total_creditos: number;
  status_auditoria: 'ABERTA' | 'EM_ANALISE' | 'FINALIZADA' | 'REABERTA';
  saude_conciliacao: number;
  gap_desconciliado: number;
  total_riscos_contabeis: number;
  valor_divergencias: number;
  created_at: string;
}

interface ItemAuditoria {
  id: string;
  sessao_id: string;
  data_transacao: string;
  descricao_extrato: string;
  descricao_sanitizada: string;
  documento_extrato?: string | null;
  tipo_transacao: 'DEBITO' | 'CREDITO';
  valor_extrato: number;
  conta_azul_parcela_id?: string | null;
  conta_azul_evento_id?: string | null;
  conciliado_no_ca: boolean;
  fornecedor_cliente_ca?: string | null;
  categoria_ca?: string | null;
  valor_ca?: number | null;
  data_pagamento_ca?: string | null;
  status_auditoria: string;
  score_confianca: number;
  diferenca_valor: number;
  detalhes_diagnostico?: {
    motivo: string;
    categoriaAtual?: string;
    categoriaEsperada?: string;
    fornecedorAtual?: string;
    diferencaValor?: number;
  };
  status_governanca: 'PENDENTE' | 'JUSTIFICADA' | 'CORRIGIDA' | 'VALIDADA';
  motivo_justificativa?: string | null;
  justificado_por?: string | null;
  justificado_em?: string | null;
}

export default function AuditoriaConciliacaoPage() {
  const { empresaAtiva } = useEmpresa();

  // Estados de Sessões
  const [sessoes, setSessoes] = useState<SessaoAuditoria[]>([]);
  const [sessaoSelecionada, setSessaoSelecionada] = useState<SessaoAuditoria | null>(null);
  const [carregandoSessoes, setCarregandoSessoes] = useState(false);

  // Estados de Itens e Paginação
  const [itens, setItens] = useState<ItemAuditoria[]>([]);
  const [carregandoItens, setCarregandoItens] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [limite, setLimite] = useState(25);
  const [totalItens, setTotalItens] = useState(0);
  const [totalPaginas, setTotalPaginas] = useState(1);

  // Filtros Avançados
  const [filtroStatus, setFiltroStatus] = useState<string>('TODOS');
  const [filtroGovernanca, setFiltroGovernanca] = useState<string>('TODOS');
  const [filtroScoreFaixa, setFiltroScoreFaixa] = useState<string>('TODOS');
  const [filtroBusca, setFiltroBusca] = useState('');
  const [ordenarPor, setOrdenarPor] = useState('score_asc');

  // Estados do Modal de Upload
  const [modalUploadAberto, setModalUploadAberto] = useState(false);
  const [arquivoUpload, setArquivoUpload] = useState<File | null>(null);
  const [contasFinanceiras, setContasFinanceiras] = useState<ContaFinanceira[]>([]);
  const [contaSelecionadaId, setContaSelecionadaId] = useState('');
  const [processandoArquivo, setProcessandoArquivo] = useState(false);
  const [previewImportacao, setPreviewImportacao] = useState<any | null>(null);

  // Estados do Modal de Justificativa
  const [itemParaJustificar, setItemParaJustificar] = useState<ItemAuditoria | null>(null);
  const [textoJustificativa, setTextoJustificativa] = useState('');
  const [salvandoJustificativa, setSalvandoJustificativa] = useState(false);

  // 1. Carregar Contas Financeiras da Empresa
  const carregarContasFinanceiras = useCallback(async () => {
    if (!empresaAtiva?.id) return;
    try {
      const res = await fetch(`/api/conta-azul/contas-financeiras?empresa_id=${empresaAtiva.id}`);
      if (res.ok) {
        const data = await res.json();
        const lista = data.contas || [];
        setContasFinanceiras(lista);
        if (lista.length > 0) {
          setContaSelecionadaId(prev => (prev && lista.some((c: any) => c.id === prev) ? prev : lista[0].id));
        }
      }
    } catch (err) {
      console.warn('Não foi possível listar contas financeiras:', err);
    }
  }, [empresaAtiva?.id]);

  // 2. Carregar Sessões da Empresa
  const carregarSessoes = useCallback(async () => {
    if (!empresaAtiva?.id) return;
    setCarregandoSessoes(true);
    try {
      const res = await fetch(`/api/auditoria-conciliacao/sessoes?empresaId=${empresaAtiva.id}&limit=20`);
      if (res.ok) {
        const data = await res.json();
        const listaSessoes = data.sessoes || [];
        setSessoes(listaSessoes);
        if (listaSessoes.length > 0 && !sessaoSelecionada) {
          setSessaoSelecionada(listaSessoes[0]);
        }
      }
    } catch (err: any) {
      toast.error('Erro ao carregar histórico de auditorias');
    } finally {
      setCarregandoSessoes(false);
    }
  }, [empresaAtiva?.id, sessaoSelecionada]);

  // 3. Carregar Itens da Sessão Selecionada com Filtros
  const carregarItensSessao = useCallback(async () => {
    if (!sessaoSelecionada?.id) return;
    setCarregandoItens(true);
    try {
      const params = new URLSearchParams({
        page: String(pagina),
        limit: String(limite),
        ordenar_por: ordenarPor
      });

      if (filtroStatus !== 'TODOS') params.set('status_auditoria', filtroStatus);
      if (filtroGovernanca !== 'TODOS') params.set('status_governanca', filtroGovernanca);
      if (filtroBusca.trim()) params.set('busca', filtroBusca.trim());

      if (filtroScoreFaixa === 'ALTA') {
        params.set('score_min', '85');
      } else if (filtroScoreFaixa === 'MEDIA') {
        params.set('score_min', '70');
        params.set('score_max', '84.99');
      } else if (filtroScoreFaixa === 'BAIXA') {
        params.set('score_max', '69.99');
      }

      const res = await fetch(`/api/auditoria-conciliacao/sessoes/${sessaoSelecionada.id}?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setItens(data.itens || []);
        setTotalItens(data.paginacao?.total || 0);
        setTotalPaginas(data.paginacao?.totalPages || 1);
        if (data.sessao) {
          setSessaoSelecionada(data.sessao);
        }
      }
    } catch (err: any) {
      toast.error('Erro ao carregar lançamentos auditados');
    } finally {
      setCarregandoItens(false);
    }
  }, [sessaoSelecionada?.id, pagina, limite, filtroStatus, filtroGovernanca, filtroScoreFaixa, filtroBusca, ordenarPor]);

  useEffect(() => {
    if (empresaAtiva?.id) {
      carregarSessoes();
      carregarContasFinanceiras();
    }
  }, [empresaAtiva?.id, carregarSessoes, carregarContasFinanceiras]);

  useEffect(() => {
    if (modalUploadAberto && empresaAtiva?.id) {
      carregarContasFinanceiras();
    }
  }, [modalUploadAberto, empresaAtiva?.id, carregarContasFinanceiras]);

  useEffect(() => {
    if (sessaoSelecionada?.id) {
      carregarItensSessao();
    } else {
      setItens([]);
      setTotalItens(0);
    }
  }, [sessaoSelecionada?.id, carregarItensSessao]);

  // Upload e Parse Inicial do Extrato
  const handleSelecionarArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !empresaAtiva?.id) return;
    setArquivoUpload(file);
    setProcessandoArquivo(true);

    const formData = new FormData();
    formData.append('arquivo', file);
    formData.append('empresaId', empresaAtiva.id);

    try {
      const res = await fetch('/api/auditoria-conciliacao/importar', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.erro || 'Falha ao ler extrato');
      }

      setPreviewImportacao(data);
      toast.success(`${data.resumo.totalTransacoes} transações lidas com sucesso!`);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao importar arquivo');
      setArquivoUpload(null);
      setPreviewImportacao(null);
    } finally {
      setProcessandoArquivo(false);
    }
  };

  // Disparo do Processamento Completo de Auditoria
  const handleExecutarAuditoria = async () => {
    if (!previewImportacao || !empresaAtiva?.id || !contaSelecionadaId) {
      toast.error('Selecione uma conta financeira e importe um extrato bancário');
      return;
    }

    const contaObj = contasFinanceiras.find(c => c.id === contaSelecionadaId);
    setProcessandoArquivo(true);

    try {
      const res = await fetch('/api/auditoria-conciliacao/processar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empresaId: empresaAtiva.id,
          contaFinanceiraId: contaSelecionadaId,
          bancoNome: contaObj?.descricao || contaObj?.nome || contaObj?.name || 'Conta Financeira',
          arquivoNome: previewImportacao.arquivo.nome,
          arquivoTipo: previewImportacao.arquivo.formato,
          arquivoHash: previewImportacao.arquivo.hashSha256,
          arquivoTamanho: previewImportacao.arquivo.tamanhoBytes,
          periodoInicio: previewImportacao.resumo.periodoInicio,
          periodoFim: previewImportacao.resumo.periodoFim,
          transacoes: previewImportacao.transacoes,
          toleranciaDias: 3,
          toleranciaValorCentavos: 0.05
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.erro || 'Falha ao processar conciliação');
      }

      toast.success('Auditoria concluída com sucesso!');
      setModalUploadAberto(false);
      setPreviewImportacao(null);
      setArquivoUpload(null);

      // Recarrega sessões e seleciona a recém-criada
      await carregarSessoes();
    } catch (err: any) {
      toast.error(err.message || 'Erro durante a conciliação');
    } finally {
      setProcessandoArquivo(false);
    }
  };

  // Salvar Justificativa de Item
  const handleSalvarJustificativa = async () => {
    if (!itemParaJustificar || !sessaoSelecionada?.id) return;
    setSalvandoJustificativa(true);

    try {
      const res = await fetch(`/api/auditoria-conciliacao/sessoes/${sessaoSelecionada.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipoAcao: 'ATUALIZAR_ITEM',
          itemId: itemParaJustificar.id,
          statusGovernanca: 'JUSTIFICADA',
          motivoJustificativa: textoJustificativa,
          usuario: 'Auditor Contábil'
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.erro || 'Falha ao justificar item');
      }

      toast.success('Lançamento justificado com sucesso!');
      setItemParaJustificar(null);
      setTextoJustificativa('');
      carregarItensSessao();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar justificativa');
    } finally {
      setSalvandoJustificativa(false);
    }
  };

  // Validar Item sem Justificativa
  const handleValidarItem = async (item: ItemAuditoria) => {
    if (!sessaoSelecionada?.id) return;
    try {
      const res = await fetch(`/api/auditoria-conciliacao/sessoes/${sessaoSelecionada.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipoAcao: 'ATUALIZAR_ITEM',
          itemId: item.id,
          statusGovernanca: 'VALIDADA',
          usuario: 'Auditor Contábil'
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.erro || 'Falha ao validar');
      }

      toast.success('Item validado com sucesso!');
      carregarItensSessao();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao validar item');
    }
  };

  // Exportar Excel
  const handleExportarExcel = () => {
    if (!sessaoSelecionada?.id) return;
    window.open(`/api/auditoria-conciliacao/exportar?sessaoId=${sessaoSelecionada.id}&formato=EXCEL`, '_blank');
  };

  // Impressão / Exportação PDF
  const handleImprimirRelatorio = () => {
    window.print();
  };

  // Cores de Status e Badges
  const renderBadgeStatus = (status: string) => {
    switch (status) {
      case 'CONFORME':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Conforme</span>;
      case 'NAO_CONCILIADO':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">Não Conciliado</span>;
      case 'DIVERGENCIA_VALOR':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">Divergência R$</span>;
      case 'FORNECEDOR_INCORRETO':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">Fornecedor Incorreto</span>;
      case 'CATEGORIA_INCORRETA':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-orange-500/10 text-orange-400 border border-orange-500/20">Categoria Incorreta</span>;
      case 'LANCAMENTO_AUSENTE':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-red-500/10 text-red-400 border border-red-500/20">Ausente no ERP</span>;
      case 'DUPLICIDADE':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-pink-500/10 text-pink-400 border border-pink-500/20">Duplicidade</span>;
      case 'CONCILIADO_BAIXA_CONFIANCA':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">Baixa Confiança</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-500/10 text-slate-400 border border-slate-500/20">{status}</span>;
    }
  };

  const renderBadgeGovernanca = (status: string) => {
    switch (status) {
      case 'VALIDADA':
        return <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400"><CheckCircle2 className="w-3.5 h-3.5" /> Validada</span>;
      case 'JUSTIFICADA':
        return <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-400"><Clock className="w-3.5 h-3.5" /> Justificada</span>;
      case 'CORRIGIDA':
        return <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-400"><CheckCheck className="w-3.5 h-3.5" /> Corrigida</span>;
      default:
        return <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400"><AlertCircle className="w-3.5 h-3.5" /> Pendente</span>;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* ─── CABEÇALHO & SELETOR DE EMPRESA ───────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-dark-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-100 flex items-center gap-2">
                Auditoria Inteligente de Conciliação
                <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Fase 4 • Satélite
                </span>
              </h1>
              <p className="text-xs sm:text-sm text-slate-400">
                Auditoria forense automatizada, semáforo de consistência DRE e detecção de riscos contábeis.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <SelectorEmpresa />
          <button
            onClick={() => setModalUploadAberto(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs sm:text-sm transition-all shadow-lg shadow-emerald-950/40"
          >
            <UploadCloud className="w-4 h-4" />
            Nova Auditoria
          </button>
        </div>
      </div>

      {/* ─── SELETOR DE SESSÕES ANTERIORES ────────────────────────── */}
      {sessoes.length > 0 && (
        <div className="bg-dark-900 border border-dark-800 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">Sessão Ativa:</span>
            <select
              value={sessaoSelecionada?.id || ''}
              onChange={(e) => {
                const s = sessoes.find(item => item.id === e.target.value);
                if (s) {
                  setSessaoSelecionada(s);
                  setPagina(1);
                }
              }}
              className="bg-dark-950 border border-dark-800 rounded-lg px-3 py-1.5 text-slate-200 font-medium focus:outline-none focus:border-emerald-500"
            >
              {sessoes.map(s => (
                <option key={s.id} value={s.id}>
                  {s.arquivo_nome} • {s.banco_nome} ({formatDate(s.created_at)})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportarExcel}
              disabled={!sessaoSelecionada}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-dark-800 hover:bg-dark-700 text-slate-200 font-medium transition-all border border-dark-700 disabled:opacity-50"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              Exportar Excel
            </button>
            <button
              onClick={handleImprimirRelatorio}
              disabled={!sessaoSelecionada}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-dark-800 hover:bg-dark-700 text-slate-200 font-medium transition-all border border-dark-700 disabled:opacity-50"
            >
              <Printer className="w-3.5 h-3.5 text-blue-400" />
              Imprimir Relatório
            </button>
          </div>
        </div>
      )}

      {/* ─── OS 4 KPIS OFICIAIS DE SAÚDE DA CONCILIAÇÃO ────────────── */}
      {sessaoSelecionada ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* KPI 1: Saúde da Conciliação */}
          <div className="bg-dark-900 border border-dark-800 rounded-xl p-4 relative overflow-hidden">
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
              <span>Saúde da Conciliação</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                Number(sessaoSelecionada.saude_conciliacao) >= 90
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : Number(sessaoSelecionada.saude_conciliacao) >= 70
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
              }`}>
                {Number(sessaoSelecionada.saude_conciliacao) >= 90 ? 'Excelente' : Number(sessaoSelecionada.saude_conciliacao) >= 70 ? 'Atenção' : 'Crítico'}
              </span>
            </div>
            <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-slate-100 font-mono">
              {Number(sessaoSelecionada.saude_conciliacao).toFixed(1)}%
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Taxa de conformidade estrita entre extrato e ERP
            </p>
            <div className="w-full bg-dark-950 h-1.5 rounded-full mt-3 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  Number(sessaoSelecionada.saude_conciliacao) >= 90 ? 'bg-emerald-500' : Number(sessaoSelecionada.saude_conciliacao) >= 70 ? 'bg-amber-500' : 'bg-rose-500'
                }`}
                style={{ width: `${Math.min(100, Math.max(0, Number(sessaoSelecionada.saude_conciliacao)))}%` }}
              />
            </div>
          </div>

          {/* KPI 2: Gap Desconciliado */}
          <div className="bg-dark-900 border border-dark-800 rounded-xl p-4 relative overflow-hidden">
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
              <span>Gap Desconciliado</span>
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>
            <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-amber-400 font-mono">
              {formatCurrency(Number(sessaoSelecionada.gap_desconciliado))}
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Soma de itens ausentes e pendentes de baixa
            </p>
          </div>

          {/* KPI 3: Riscos Contábeis */}
          <div className="bg-dark-900 border border-dark-800 rounded-xl p-4 relative overflow-hidden">
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
              <span>Total de Riscos Contábeis</span>
              <AlertCircle className="w-4 h-4 text-purple-400" />
            </div>
            <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-purple-400 font-mono">
              {sessaoSelecionada.total_riscos_contabeis}
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Categorias/fornecedores divergentes e duplicidades
            </p>
          </div>

          {/* KPI 4: Divergências Financeiras */}
          <div className="bg-dark-900 border border-dark-800 rounded-xl p-4 relative overflow-hidden">
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
              <span>Divergências Financeiras</span>
              <TrendingUp className="w-4 h-4 text-rose-400" />
            </div>
            <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-rose-400 font-mono">
              {formatCurrency(Number(sessaoSelecionada.valor_divergencias))}
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Diferenças de tarifas, retenções ou juros
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-dark-900 border border-dark-800 rounded-xl p-12 text-center">
          <UploadCloud className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-200">Nenhuma sessão de auditoria selecionada</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
            Faça o upload de um extrato bancário em formato Excel ou CSV para iniciar a auditoria automatizada.
          </p>
          <button
            onClick={() => setModalUploadAberto(true)}
            className="mt-4 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs transition-all"
          >
            Importar Extrato Bancário
          </button>
        </div>
      )}

      {/* ─── BARRA DE FILTROS AVANÇADOS ───────────────────────────── */}
      {sessaoSelecionada && (
        <div className="bg-dark-900 border border-dark-800 rounded-xl p-4 space-y-3">
          <div className="flex flex-col md:flex-row items-center justify-between gap-3">
            {/* Campo de Busca Textual */}
            <div className="relative w-full md:w-96">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Buscar por descrição, documento ou fornecedor..."
                value={filtroBusca}
                onChange={(e) => {
                  setFiltroBusca(e.target.value);
                  setPagina(1);
                }}
                className="w-full bg-dark-950 border border-dark-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Ordenação */}
            <div className="flex items-center gap-2 text-xs w-full md:w-auto justify-end">
              <span className="text-slate-400">Ordenar por:</span>
              <select
                value={ordenarPor}
                onChange={(e) => setOrdenarPor(e.target.value)}
                className="bg-dark-950 border border-dark-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                <option value="score_asc">Score (Menor primeiro - Risco)</option>
                <option value="score_desc">Score (Maior primeiro)</option>
                <option value="data_asc">Data (Mais antiga)</option>
                <option value="data_desc">Data (Mais recente)</option>
                <option value="valor_desc">Maior Valor (R$)</option>
              </select>

              <button
                onClick={() => carregarItensSessao()}
                className="p-1.5 rounded-lg bg-dark-800 hover:bg-dark-700 text-slate-300 border border-dark-700 transition-all"
                title="Recarregar"
              >
                <RefreshCw className={`w-4 h-4 ${carregandoItens ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Filtros em Chips */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-dark-800/60 text-xs">
            {/* Status da Auditoria */}
            <select
              value={filtroStatus}
              onChange={(e) => {
                setFiltroStatus(e.target.value);
                setPagina(1);
              }}
              className="bg-dark-950 border border-dark-800 rounded-lg px-2.5 py-1 text-slate-300 focus:outline-none focus:border-emerald-500"
            >
              <option value="TODOS">Todos os Status</option>
              <option value="CONFORME">Conforme</option>
              <option value="NAO_CONCILIADO">Não Conciliado</option>
              <option value="DIVERGENCIA_VALOR">Divergência de Valor</option>
              <option value="FORNECEDOR_INCORRETO">Fornecedor Incorreto</option>
              <option value="CATEGORIA_INCORRETA">Categoria Incorreta</option>
              <option value="LANCAMENTO_AUSENTE">Ausente no ERP</option>
              <option value="DUPLICIDADE">Duplicidade</option>
              <option value="CONCILIADO_BAIXA_CONFIANCA">Baixa Confiança</option>
            </select>

            {/* Governança */}
            <select
              value={filtroGovernanca}
              onChange={(e) => {
                setFiltroGovernanca(e.target.value);
                setPagina(1);
              }}
              className="bg-dark-950 border border-dark-800 rounded-lg px-2.5 py-1 text-slate-300 focus:outline-none focus:border-emerald-500"
            >
              <option value="TODOS">Todas as Situações</option>
              <option value="PENDENTE">Pendentes</option>
              <option value="JUSTIFICADA">Justificadas</option>
              <option value="VALIDADA">Validadas</option>
              <option value="CORRIGIDA">Corrigidas</option>
            </select>

            {/* Faixa de Score */}
            <select
              value={filtroScoreFaixa}
              onChange={(e) => {
                setFiltroScoreFaixa(e.target.value);
                setPagina(1);
              }}
              className="bg-dark-950 border border-dark-800 rounded-lg px-2.5 py-1 text-slate-300 focus:outline-none focus:border-emerald-500"
            >
              <option value="TODOS">Todos os Scores</option>
              <option value="ALTA">Alta Confiança (≥ 85%)</option>
              <option value="MEDIA">Média Confiança (70% - 84%)</option>
              <option value="BAIXA">Baixa Confiança (&lt; 70%)</option>
            </select>

            <span className="text-[11px] text-slate-400 ml-auto font-mono">
              Total: <strong>{totalItens}</strong> registros encontrados
            </span>
          </div>
        </div>
      )}

      {/* ─── TABELA DE LANÇAMENTOS AUDITADOS ───────────────────────── */}
      {sessaoSelecionada && (
        <div className="bg-dark-900 border border-dark-800 rounded-xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-dark-950/80 text-slate-400 uppercase tracking-wider text-[10px] border-b border-dark-800 font-semibold">
                <tr>
                  <th className="py-3 px-3">Data</th>
                  <th className="py-3 px-3">Extrato Bancário</th>
                  <th className="py-3 px-3">Contrapartida ERP (Conta Azul)</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-center">Score</th>
                  <th className="py-3 px-3">Governança</th>
                  <th className="py-3 px-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-800/60 font-sans">
                {carregandoItens ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-slate-400">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-500" />
                      Carregando lançamentos com alta performance...
                    </td>
                  </tr>
                ) : itens.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-slate-400">
                      Nenhum lançamento corresponde aos filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  itens.map((item) => {
                    const ehDebito = item.tipo_transacao === 'DEBITO';
                    return (
                      <tr key={item.id} className="hover:bg-dark-800/40 transition-colors">
                        {/* Data */}
                        <td className="py-3 px-3 text-slate-300 font-mono whitespace-nowrap">
                          {formatDate(item.data_transacao)}
                        </td>

                        {/* Extrato Bancário */}
                        <td className="py-3 px-3 max-w-xs">
                          <div className="font-medium text-slate-200 truncate" title={item.descricao_extrato}>
                            {item.descricao_extrato}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                            <span className={`font-mono font-bold ${ehDebito ? 'text-rose-400' : 'text-emerald-400'}`}>
                              {ehDebito ? '-' : '+'}{formatCurrency(item.valor_extrato)}
                            </span>
                            {item.documento_extrato && (
                              <span className="font-mono bg-dark-950 px-1 py-0.2 rounded border border-dark-800">
                                {item.documento_extrato}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Contrapartida ERP */}
                        <td className="py-3 px-3 max-w-xs">
                          {item.fornecedor_cliente_ca || item.categoria_ca ? (
                            <div>
                              <div className="font-medium text-slate-200 truncate" title={item.fornecedor_cliente_ca || 'Fornecedor não associado'}>
                                {item.fornecedor_cliente_ca || '—'}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                                <span className="text-slate-400 truncate max-w-[140px]" title={item.categoria_ca || ''}>
                                  {item.categoria_ca || 'Sem Categoria'}
                                </span>
                                {item.valor_ca !== null && item.valor_ca !== undefined && (
                                  <span className="font-mono text-slate-300">
                                    {formatCurrency(item.valor_ca)}
                                  </span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-500 italic text-[11px]">Nenhum vínculo no ERP</span>
                          )}
                        </td>

                        {/* Status da Auditoria */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          {renderBadgeStatus(item.status_auditoria)}
                          {item.diferenca_valor > 0 && (
                            <div className="text-[10px] text-rose-400 font-mono mt-0.5">
                              Dif: {formatCurrency(item.diferenca_valor)}
                            </div>
                          )}
                        </td>

                        {/* Score de Confiança */}
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <span className={`font-mono font-bold text-xs ${
                            item.score_confianca >= 85 ? 'text-emerald-400' : item.score_confianca >= 70 ? 'text-amber-400' : 'text-rose-400'
                          }`}>
                            {item.score_confianca.toFixed(0)}%
                          </span>
                        </td>

                        {/* Status de Governança */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          {renderBadgeGovernanca(item.status_governanca)}
                          {item.motivo_justificativa && (
                            <p className="text-[10px] text-slate-400 italic truncate max-w-[120px]" title={item.motivo_justificativa}>
                              "{item.motivo_justificativa}"
                            </p>
                          )}
                        </td>

                        {/* Ações */}
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {item.status_governanca !== 'VALIDADA' && (
                              <button
                                onClick={() => handleValidarItem(item)}
                                className="p-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 transition-colors"
                                title="Validar Lançamento"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            )}

                            <button
                              onClick={() => {
                                setItemParaJustificar(item);
                                setTextoJustificativa(item.motivo_justificativa || '');
                              }}
                              className="px-2 py-1 rounded bg-dark-800 hover:bg-dark-700 text-slate-200 text-[11px] font-medium border border-dark-700 transition-colors"
                            >
                              Justificar
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          <div className="bg-dark-950 p-3 flex items-center justify-between border-t border-dark-800 text-xs text-slate-400">
            <div>
              Mostrando página <strong>{pagina}</strong> de <strong>{totalPaginas}</strong>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPagina(p => Math.max(1, p - 1))}
                disabled={pagina <= 1}
                className="p-1 rounded bg-dark-900 border border-dark-800 disabled:opacity-40 hover:bg-dark-800 text-slate-200 transition-all"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-mono text-slate-200 px-2">{pagina}</span>
              <button
                onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
                disabled={pagina >= totalPaginas}
                className="p-1 rounded bg-dark-900 border border-dark-800 disabled:opacity-40 hover:bg-dark-800 text-slate-200 transition-all"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL DE UPLOAD / NOVA AUDITORIA ─────────────────────── */}
      {modalUploadAberto && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-dark-900 border border-dark-800 rounded-2xl max-w-xl w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-dark-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">Iniciar Nova Conciliação Bancária</h3>
                  <p className="text-xs text-slate-400">Importe seu extrato bancário para cruzamento automatizado com o Conta Azul.</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setModalUploadAberto(false);
                  setPreviewImportacao(null);
                  setArquivoUpload(null);
                }}
                className="p-1 text-slate-400 hover:text-slate-200 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Seleção de Conta Financeira */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                <Landmark className="w-3.5 h-3.5 text-emerald-400" />
                Conta Financeira / Banco (Conta Azul):
              </label>
              <select
                value={contaSelecionadaId}
                onChange={(e) => setContaSelecionadaId(e.target.value)}
                className="w-full bg-dark-950 border border-dark-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                {contasFinanceiras.length === 0 ? (
                  <option value="CONTA_PRINCIPAL">Conta Bancária Principal / Padrão</option>
                ) : (
                  contasFinanceiras.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.descricao || c.nome || c.name || (c.tipo ? `${c.id} (${c.tipo})` : c.id)}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* DropZone do Arquivo */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-300">
                Arquivo de Extrato Bancário (.xlsx, .xls ou .csv):
              </label>
              <div className="border-2 border-dashed border-dark-700 hover:border-emerald-500/60 rounded-xl p-6 text-center transition-all bg-dark-950/60 relative">
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleSelecionarArquivo}
                  disabled={processandoArquivo}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                <FileSpreadsheet className="w-10 h-10 text-slate-500 mx-auto mb-2" />
                <p className="text-xs font-medium text-slate-200">
                  {arquivoUpload ? arquivoUpload.name : 'Arraste o arquivo ou clique para selecionar'}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Formatos suportados: Excel (.xlsx, .xls) ou CSV delimitado por vírgula/ponto-e-vírgula
                </p>
              </div>
            </div>

            {/* Preview do Arquivo Importado */}
            {previewImportacao && (
              <div className="bg-dark-950 border border-dark-800 rounded-lg p-3 space-y-2 text-xs">
                <div className="flex items-center justify-between text-slate-300 font-semibold border-b border-dark-800 pb-1.5">
                  <span>Pré-visualização do Extrato</span>
                  <span className="text-emerald-400 font-mono">{previewImportacao.resumo.totalTransacoes} transações</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                  <div>Período: <strong className="text-slate-200">{formatDate(previewImportacao.resumo.periodoInicio)} a {formatDate(previewImportacao.resumo.periodoFim)}</strong></div>
                  <div>Débitos: <strong className="text-rose-400">{formatCurrency(previewImportacao.resumo.valorTotalDebitos)}</strong></div>
                  <div>Créditos: <strong className="text-emerald-400">{formatCurrency(previewImportacao.resumo.valorTotalCreditos)}</strong></div>
                  <div>Hash SHA-256: <span className="font-mono text-[9px] text-slate-500 truncate block">{previewImportacao.arquivo.hashSha256}</span></div>
                </div>
              </div>
            )}

            {/* Botões do Modal */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-dark-800">
              <button
                onClick={() => setModalUploadAberto(false)}
                className="px-4 py-2 rounded-lg bg-dark-800 hover:bg-dark-700 text-slate-300 text-xs font-medium transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleExecutarAuditoria}
                disabled={!previewImportacao || processandoArquivo || !contaSelecionadaId}
                className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-medium text-xs transition-all flex items-center gap-2 shadow-lg shadow-emerald-950/40"
              >
                {processandoArquivo ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Processando com Motor O(N)...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    Executar Conciliação Inteligente
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL DE JUSTIFICATIVA CONTÁBIL ──────────────────────── */}
      {itemParaJustificar && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-dark-900 border border-dark-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-dark-800 pb-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-bold text-slate-100">Justificativa de Governança Contábil</h3>
              </div>
              <button
                onClick={() => setItemParaJustificar(null)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-dark-950 border border-dark-800 rounded-lg p-3 text-xs space-y-1">
              <div className="text-slate-300 font-semibold">{itemParaJustificar.descricao_extrato}</div>
              <div className="text-slate-400 flex items-center gap-3 text-[11px]">
                <span>Data: {formatDate(itemParaJustificar.data_transacao)}</span>
                <span>Valor: {formatCurrency(itemParaJustificar.valor_extrato)}</span>
                <span>Status: {itemParaJustificar.status_auditoria}</span>
              </div>
              {itemParaJustificar.detalhes_diagnostico?.motivo && (
                <div className="text-[11px] text-amber-400/90 pt-1 border-t border-dark-800">
                  Diagnóstico Forense: {itemParaJustificar.detalhes_diagnostico.motivo}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">
                Motivo / Justificativa da Discrepância:
              </label>
              <textarea
                rows={4}
                value={textoJustificativa}
                onChange={(e) => setTextoJustificativa(e.target.value)}
                placeholder="Exemplo: Retenção de tarifa autorizada em contrato, compensação bancária em D+1, despesa aprovada pela diretoria..."
                className="w-full bg-dark-950 border border-dark-800 rounded-lg p-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-dark-800">
              <button
                onClick={() => setItemParaJustificar(null)}
                className="px-3.5 py-1.5 rounded-lg bg-dark-800 hover:bg-dark-700 text-slate-300 text-xs font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleSalvarJustificativa}
                disabled={salvandoJustificativa || !textoJustificativa.trim()}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-medium transition-all"
              >
                {salvandoJustificativa ? 'Gravando...' : 'Salvar Justificativa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
