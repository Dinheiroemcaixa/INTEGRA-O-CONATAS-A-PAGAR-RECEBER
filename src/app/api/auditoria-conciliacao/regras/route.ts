import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isAuditoriaConciliacaoHabilitada } from '@/lib/auditoria-conciliacao/feature-flags';
import { sanitizarDescricao } from '@/lib/auditoria-conciliacao/normalizador';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * POST /api/auditoria-conciliacao/regras
 * Cria ou atualiza regra persistente de aprendizagem De-Para (Fase 3):
 * - Fornecedor: grava em fornecedor_depara
 * - Categoria: grava em fornecedor_regras
 */
export async function POST(req: NextRequest) {
  try {
    const habilitado = await isAuditoriaConciliacaoHabilitada();
    if (!habilitado) {
      return NextResponse.json(
        { erro: 'Módulo de Auditoria desativado pelo Kill Switch.' },
        { status: 503 }
      );
    }

    const body = await req.json();
    const { empresa_id, tipo_regra, termo_original, valor_correto, conta_azul_id } = body;

    if (!empresa_id || !tipo_regra || !termo_original || !valor_correto) {
      return NextResponse.json(
        { erro: 'Campos obrigatórios: empresa_id, tipo_regra (FORNECEDOR | CATEGORIA), termo_original e valor_correto.' },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const termoNormalizado = sanitizarDescricao(termo_original).toUpperCase();

    if (tipo_regra === 'FORNECEDOR') {
      const payload: Record<string, any> = {
        empresa_id,
        nome_original: termo_original.trim(),
        nome_original_normalizado: termoNormalizado,
        nome_corrigido: valor_correto.trim(),
        updated_at: new Date().toISOString()
      };
      if (conta_azul_id) {
        payload.conta_azul_contato_id = conta_azul_id;
      }

      const { error } = await supabaseAdmin
        .from('fornecedor_depara')
        .upsert(payload, {
          onConflict: 'empresa_id,nome_original_normalizado'
        });

      if (error) {
        console.error('[API /auditoria-conciliacao/regras] Erro ao salvar regra de fornecedor:', error);
        return NextResponse.json({ erro: error.message }, { status: 500 });
      }

      return NextResponse.json({
        sucesso: true,
        tipo: 'FORNECEDOR',
        mensagem: `Regra de De-Para memorizada: "${termo_original}" → "${valor_correto}"`
      });
    }

    if (tipo_regra === 'CATEGORIA') {
      // Salva regra de associação de categoria
      const { data: regraExistente } = await supabaseAdmin
        .from('fornecedor_regras')
        .select('id')
        .eq('empresa_id', empresa_id)
        .eq('fornecedor_nome', termoNormalizado)
        .maybeSingle();

      let erroCat = null;
      if (regraExistente) {
        const { error } = await supabaseAdmin
          .from('fornecedor_regras')
          .update({
            categoria_nome: valor_correto.trim(),
            ativo: true,
            updated_at: new Date().toISOString()
          })
          .eq('id', regraExistente.id);
        erroCat = error;
      } else {
        const { error } = await supabaseAdmin
          .from('fornecedor_regras')
          .insert({
            empresa_id,
            fornecedor_nome: termoNormalizado,
            categoria_nome: valor_correto.trim(),
            tipo_regra: 'PADRAO',
            prioridade: 10,
            ativo: true
          });
        erroCat = error;
      }

      if (erroCat) {
        console.error('[API /auditoria-conciliacao/regras] Erro ao salvar regra de categoria:', erroCat);
        return NextResponse.json({ erro: erroCat.message }, { status: 500 });
      }

      return NextResponse.json({
        sucesso: true,
        tipo: 'CATEGORIA',
        mensagem: `Regra de Categoria memorizada: "${termo_original}" → "${valor_correto}"`
      });
    }

    return NextResponse.json({ erro: 'tipo_regra inválido. Utilize FORNECEDOR ou CATEGORIA.' }, { status: 400 });

  } catch (err: any) {
    console.error('[API /auditoria-conciliacao/regras] Erro interno:', err);
    return NextResponse.json({ erro: err?.message || 'Erro interno ao salvar regra' }, { status: 500 });
  }
}

/**
 * GET /api/auditoria-conciliacao/regras?empresa_id=...
 * Lista todas as regras de aprendizagem ativas
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const empresa_id = searchParams.get('empresa_id');

    if (!empresa_id) {
      return NextResponse.json({ erro: 'empresa_id obrigatório' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    const [
      { data: regrasFornecedor, error: errForn },
      { data: regrasCategoria, error: errCat }
    ] = await Promise.all([
      supabaseAdmin
        .from('fornecedor_depara')
        .select('id, empresa_id, nome_original, nome_original_normalizado, nome_corrigido, updated_at')
        .eq('empresa_id', empresa_id)
        .order('updated_at', { ascending: false }),
      supabaseAdmin
        .from('fornecedor_regras')
        .select('id, empresa_id, fornecedor_nome, categoria_nome, ativo, updated_at')
        .eq('empresa_id', empresa_id)
        .eq('ativo', true)
        .order('updated_at', { ascending: false })
    ]);

    if (errForn) {
      console.warn('[API /auditoria-conciliacao/regras] Erro ao buscar fornecedor_depara:', errForn);
    }
    if (errCat) {
      console.warn('[API /auditoria-conciliacao/regras] Erro ao buscar fornecedor_regras:', errCat);
    }

    return NextResponse.json({
      fornecedores: regrasFornecedor || [],
      categorias: regrasCategoria || []
    });

  } catch (err: any) {
    return NextResponse.json({ erro: err?.message || 'Erro ao buscar regras' }, { status: 500 });
  }
}

/**
 * DELETE /api/auditoria-conciliacao/regras?id=...&tipo=FORNECEDOR|CATEGORIA
 */
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const tipo = searchParams.get('tipo') || 'FORNECEDOR';

    if (!id) {
      return NextResponse.json({ erro: 'ID da regra obrigatório' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    if (tipo === 'CATEGORIA') {
      const { error } = await supabaseAdmin.from('fornecedor_regras').delete().eq('id', id);
      if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
    } else {
      const { error } = await supabaseAdmin.from('fornecedor_depara').delete().eq('id', id);
      if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
    }

    return NextResponse.json({ sucesso: true });
  } catch (err: any) {
    return NextResponse.json({ erro: err?.message || 'Erro ao excluir regra' }, { status: 500 });
  }
}
