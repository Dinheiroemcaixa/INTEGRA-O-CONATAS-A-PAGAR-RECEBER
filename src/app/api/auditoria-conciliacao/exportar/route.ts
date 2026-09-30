import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createClient(supabaseUrl, supabaseKey);
}

/**
 * GET /api/auditoria-conciliacao/exportar?sessaoId=...&formato=EXCEL
 * 
 * Gera exportação em planilha Excel (XLSX) profissional ou dados formatados para PDF.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessaoId = searchParams.get('sessaoId');
    const formato = (searchParams.get('formato') || 'EXCEL').toUpperCase();

    if (!sessaoId) {
      return NextResponse.json({ erro: 'ID da sessão é obrigatório.' }, { status: 400 });
    }

    const supabase = getSupabase();

    // 1. Busca da Sessão
    const { data: sessao, error: erroSessao } = await supabase
      .from('auditoria_conciliacao_sessoes')
      .select('*, empresas(razao_social, cnpj)')
      .eq('id', sessaoId)
      .single();

    if (erroSessao || !sessao) {
      return NextResponse.json({ erro: 'Sessão não encontrada.' }, { status: 404 });
    }

    // 2. Busca de Todos os Itens da Sessão
    const { data: itens, error: erroItens } = await supabase
      .from('auditoria_conciliacao_itens')
      .select('*')
      .eq('sessao_id', sessaoId)
      .order('data_transacao', { ascending: true });

    if (erroItens) {
      return NextResponse.json({ erro: 'Erro ao carregar itens da auditoria.' }, { status: 500 });
    }

    // 3. Geração em Formato Excel (XLSX)
    if (formato === 'EXCEL') {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Connecta AI — Auditoria Inteligente';
      workbook.created = new Date();

      // ─── ABA 1: RESUMO EXECUTIVO & KPIS ───────────────────────────
      const wsResumo = workbook.addWorksheet('Resumo Executivo');
      wsResumo.views = [{ showGridLines: true }];

      wsResumo.columns = [
        { header: 'Indicador / Métrica', key: 'metrica', width: 35 },
        { header: 'Valor / Resultado', key: 'valor', width: 45 }
      ];

      wsResumo.addRow(['CONNECTA AI — AUDITORIA DE CONCILIAÇÃO BANCÁRIA', '']);
      wsResumo.addRow(['Empresa:', (sessao as any).empresas?.razao_social || 'Empresa']);
      wsResumo.addRow(['CNPJ:', (sessao as any).empresas?.cnpj || '—']);
      wsResumo.addRow(['Conta Financeira / Banco:', sessao.banco_nome]);
      wsResumo.addRow(['Arquivo Importado:', sessao.arquivo_nome]);
      wsResumo.addRow(['Hash SHA-256:', sessao.arquivo_hash]);
      wsResumo.addRow(['Período Auditado:', `${sessao.periodo_inicio} a ${sessao.periodo_fim}`]);
      wsResumo.addRow(['Status da Auditoria:', sessao.status_auditoria]);
      wsResumo.addRow(['', '']);

      wsResumo.addRow(['4 KPIS OFICIAIS DE SAÚDE DA CONCILIAÇÃO', '']);
      wsResumo.addRow(['1. Saúde da Conciliação (%):', `${Number(sessao.saude_conciliacao).toFixed(2)}%`]);
      wsResumo.addRow(['2. Gap Desconciliado (R$):', `R$ ${Number(sessao.gap_desconciliado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`]);
      wsResumo.addRow(['3. Total de Riscos Contábeis (Qtd):', `${sessao.total_riscos_contabeis} transações`]);
      wsResumo.addRow(['4. Divergências Financeiras (R$):', `R$ ${Number(sessao.valor_divergencias).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`]);
      wsResumo.addRow(['', '']);

      wsResumo.addRow(['TOTAIS DE TRANSAÇÕES', '']);
      wsResumo.addRow(['Total de Linhas no Extrato:', sessao.total_transacoes]);
      wsResumo.addRow(['Total Débitos:', `${sessao.total_debitos} (R$ ${Number(sessao.valor_total_debitos).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`]);
      wsResumo.addRow(['Total Créditos:', `${sessao.total_creditos} (R$ ${Number(sessao.valor_total_creditos).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`]);

      // Estilização do Resumo
      wsResumo.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
      wsResumo.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
      wsResumo.getRow(10).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      wsResumo.getRow(10).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };

      // ─── ABA 2: LANÇAMENTOS AUDITADOS DETALHADOS ─────────────────
      const wsItens = workbook.addWorksheet('Lançamentos Auditados');
      wsItens.views = [{ showGridLines: true }];

      wsItens.columns = [
        { header: 'Data', key: 'data', width: 14 },
        { header: 'Tipo', key: 'tipo', width: 10 },
        { header: 'Valor Extrato (R$)', key: 'valor_extrato', width: 18 },
        { header: 'Descrição Extrato', key: 'descricao_extrato', width: 40 },
        { header: 'Documento', key: 'documento', width: 16 },
        { header: 'Status Auditoria', key: 'status_auditoria', width: 26 },
        { header: 'Score (%)', key: 'score_confianca', width: 12 },
        { header: 'Fornecedor / Cliente CA', key: 'fornecedor_ca', width: 32 },
        { header: 'Categoria CA', key: 'categoria_ca', width: 28 },
        { header: 'Valor CA (R$)', key: 'valor_ca', width: 18 },
        { header: 'Diferença (R$)', key: 'diferenca_valor', width: 16 },
        { header: 'Conciliado no CA', key: 'conciliado_ca', width: 16 },
        { header: 'Governança', key: 'status_governanca', width: 16 },
        { header: 'Diagnóstico Forense', key: 'motivo_diagnostico', width: 50 },
        { header: 'Justificativa Contábil', key: 'justificativa', width: 40 }
      ];

      // Cabeçalho da tabela
      const headerRow = wsItens.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };

      for (const item of itens || []) {
        wsItens.addRow({
          data: item.data_transacao,
          tipo: item.tipo_transacao,
          valor_extrato: item.valor_extrato,
          descricao_extrato: item.descricao_extrato,
          documento: item.documento_extrato || '—',
          status_auditoria: item.status_auditoria,
          score_confianca: `${Number(item.score_confianca).toFixed(0)}%`,
          fornecedor_ca: item.fornecedor_cliente_ca || '—',
          categoria_ca: item.categoria_ca || '—',
          valor_ca: item.valor_ca !== null ? item.valor_ca : '—',
          diferenca_valor: item.diferenca_valor > 0 ? item.diferenca_valor : 0,
          conciliado_ca: item.conciliado_no_ca ? 'SIM' : 'NÃO',
          status_governanca: item.status_governanca,
          motivo_diagnostico: item.detalhes_diagnostico?.motivo || '—',
          justificativa: item.motivo_justificativa || '—'
        });
      }

      const buffer = await workbook.xlsx.writeBuffer();

      return new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="Auditoria_Conciliacao_${sessao.arquivo_nome.replace(/[^a-zA-Z0-9_-]/g, '_')}.xlsx"`
        }
      });
    }

    // 4. Retorno para Impressão / Visualização em PDF
    return NextResponse.json({
      sucesso: true,
      sessao,
      itens,
      exportadoEm: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('[API /auditoria-conciliacao/exportar] Erro na exportação:', error);
    return NextResponse.json(
      { erro: error?.message || 'Falha ao exportar relatório de auditoria.' },
      { status: 500 }
    );
  }
}
