import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createClient(supabaseUrl, supabaseKey);
}

/**
 * GET /api/auditoria-conciliacao/sessoes/[id]
 * 
 * Retorna dados detalhados da sessão e itens paginados com filtros avançados.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sessaoId = params.id;
    if (!sessaoId) {
      return NextResponse.json({ erro: 'ID da sessão não informado.' }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '25', 10)));
    
    // Filtros
    const statusAuditoria = searchParams.get('status_auditoria');
    const statusGovernanca = searchParams.get('status_governanca');
    const scoreMin = searchParams.get('score_min') ? parseFloat(searchParams.get('score_min')!) : null;
    const scoreMax = searchParams.get('score_max') ? parseFloat(searchParams.get('score_max')!) : null;
    const fornecedor = searchParams.get('fornecedor');
    const categoria = searchParams.get('categoria');
    const dataInicio = searchParams.get('data_inicio');
    const dataFim = searchParams.get('data_fim');
    const busca = searchParams.get('busca');
    const ordenarPor = searchParams.get('ordenar_por') || 'score_asc';

    const supabase = getSupabase();

    // 1. Busca os dados de cabeçalho da Sessão
    const { data: sessao, error: erroSessao } = await supabase
      .from('auditoria_conciliacao_sessoes')
      .select('*')
      .eq('id', sessaoId)
      .single();

    if (erroSessao || !sessao) {
      return NextResponse.json({ erro: 'Sessão de auditoria não encontrada.' }, { status: 404 });
    }

    // 2. Montagem da Query de Itens com Índices Otimizados (Migração 047)
    const offset = (page - 1) * limit;
    let queryItens = supabase
      .from('auditoria_conciliacao_itens')
      .select('*', { count: 'exact' })
      .eq('sessao_id', sessaoId);

    if (statusAuditoria) {
      queryItens = queryItens.eq('status_auditoria', statusAuditoria);
    }

    if (statusGovernanca) {
      queryItens = queryItens.eq('status_governanca', statusGovernanca);
    }

    if (scoreMin !== null && !isNaN(scoreMin)) {
      queryItens = queryItens.gte('score_confianca', scoreMin);
    }

    if (scoreMax !== null && !isNaN(scoreMax)) {
      queryItens = queryItens.lte('score_confianca', scoreMax);
    }

    if (fornecedor) {
      queryItens = queryItens.ilike('fornecedor_cliente_ca', `%${fornecedor}%`);
    }

    if (categoria) {
      queryItens = queryItens.ilike('categoria_ca', `%${categoria}%`);
    }

    if (dataInicio) {
      queryItens = queryItens.gte('data_transacao', dataInicio);
    }

    if (dataFim) {
      queryItens = queryItens.lte('data_transacao', dataFim);
    }

    if (busca) {
      // Busca combinada em descrição ou documento
      queryItens = queryItens.or(`descricao_extrato.ilike.%${busca}%,documento_extrato.ilike.%${busca}%,fornecedor_cliente_ca.ilike.%${busca}%`);
    }

    // Ordenação utilizando os índices
    switch (ordenarPor) {
      case 'score_asc':
        queryItens = queryItens.order('score_confianca', { ascending: true });
        break;
      case 'score_desc':
        queryItens = queryItens.order('score_confianca', { ascending: false });
        break;
      case 'data_asc':
        queryItens = queryItens.order('data_transacao', { ascending: true });
        break;
      case 'data_desc':
        queryItens = queryItens.order('data_transacao', { ascending: false });
        break;
      case 'valor_desc':
        queryItens = queryItens.order('valor_extrato', { ascending: false });
        break;
      default:
        queryItens = queryItens.order('score_confianca', { ascending: true });
    }

    queryItens = queryItens.range(offset, offset + limit - 1);

    const { data: itens, count: totalItens, error: erroItens } = await queryItens;

    if (erroItens) {
      console.error('[API /auditoria-conciliacao/sessoes/[id]] Erro ao buscar itens:', erroItens);
      return NextResponse.json({ erro: erroItens.message }, { status: 500 });
    }

    const total = totalItens || 0;
    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      sucesso: true,
      sessao,
      itens: itens || [],
      paginacao: {
        page,
        limit,
        total,
        totalPages
      }
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });

  } catch (error: any) {
    console.error('[API /auditoria-conciliacao/sessoes/[id]] Erro inesperado:', error);
    return NextResponse.json(
      { erro: error?.message || 'Falha ao buscar detalhes da sessão de auditoria.' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/auditoria-conciliacao/sessoes/[id]
 * 
 * Permite justificar item ou finalizar a sessão de auditoria.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sessaoId = params.id;
    const body = await req.json();
    const supabase = getSupabase();

    // Ação 1: Justificar ou validar um item específico
    if (body.tipoAcao === 'ATUALIZAR_ITEM' && body.itemId) {
      const { statusGovernanca, motivoJustificativa, usuario } = body;

      const { data: itemAtualizado, error } = await supabase
        .from('auditoria_conciliacao_itens')
        .update({
          status_governanca: statusGovernanca,
          motivo_justificativa: motivoJustificativa || null,
          justificado_por: usuario || 'Sistema',
          justificado_em: new Date().toISOString()
        })
        .eq('id', body.itemId)
        .eq('sessao_id', sessaoId)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ erro: error.message }, { status: 500 });
      }

      return NextResponse.json({ sucesso: true, item: itemAtualizado });
    }

    // Ação 2: Finalizar ou Reabrir Sessão
    if (body.tipoAcao === 'STATUS_SESSAO') {
      const { statusAuditoria, usuario } = body;
      const { data: sessaoAtualizada, error } = await supabase
        .from('auditoria_conciliacao_sessoes')
        .update({
          status_auditoria: statusAuditoria,
          data_finalizacao: statusAuditoria === 'FINALIZADA' ? new Date().toISOString() : null,
          finalizado_por: statusAuditoria === 'FINALIZADA' ? (usuario || 'Usuário') : null
        })
        .eq('id', sessaoId)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ erro: error.message }, { status: 500 });
      }

      return NextResponse.json({ sucesso: true, sessao: sessaoAtualizada });
    }

    return NextResponse.json({ erro: 'Ação não reconhecida.' }, { status: 400 });

  } catch (error: any) {
    console.error('[API /auditoria-conciliacao/sessoes/[id]] Erro no PATCH:', error);
    return NextResponse.json(
      { erro: error?.message || 'Falha ao atualizar sessão ou item.' },
      { status: 500 }
    );
  }
}
