import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createClient(supabaseUrl, supabaseKey);
}

/**
 * GET /api/auditoria-conciliacao/sessoes?empresaId=...&page=1&limit=10
 * 
 * Lista o histórico de sessões de auditoria de conciliação bancária da empresa.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const empresaId = searchParams.get('empresaId');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '10', 10)));
    const status = searchParams.get('status');

    if (!empresaId) {
      return NextResponse.json(
        { erro: 'Parâmetro obrigatório "empresaId" não fornecido.' },
        { status: 400 }
      );
    }

    const supabase = getSupabase();
    const offset = (page - 1) * limit;

    let query = supabase
      .from('auditoria_conciliacao_sessoes')
      .select('*', { count: 'exact' })
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status_auditoria', status);
    }

    const { data: sessoes, count, error } = await query;

    if (error) {
      console.error('[API /auditoria-conciliacao/sessoes] Erro ao listar sessões:', error);
      return NextResponse.json({ erro: error.message }, { status: 500 });
    }

    const total = count || 0;
    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      sucesso: true,
      sessoes: sessoes || [],
      paginacao: {
        page,
        limit,
        total,
        totalPages
      }
    });

  } catch (error: any) {
    console.error('[API /auditoria-conciliacao/sessoes] Erro inesperado:', error);
    return NextResponse.json(
      { erro: error?.message || 'Falha ao buscar sessões de auditoria.' },
      { status: 500 }
    );
  }
}
