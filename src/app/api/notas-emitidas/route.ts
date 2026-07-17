import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ─── GET: Buscar notas emitidas (status = 'enviado' ou 'cancelado') ─────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const empresa_id = searchParams.get('empresa_id')
    const tipo = searchParams.get('tipo') || 'servicos' // 'servicos' ou 'produtos'
    const data_inicio = searchParams.get('data_inicio')
    const data_fim = searchParams.get('data_fim')
    const busca = searchParams.get('busca')

    if (!empresa_id) {
      return NextResponse.json({ error: 'empresa_id obrigatório' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // Filtra vendas com status 'enviado' ou 'cancelado' (i.e., que já passaram pelo envio)
    let query = supabase
      .from('vendas_importadas')
      .select('*')
      .eq('empresa_id', empresa_id)
      .in('status', ['enviado', 'cancelado'])
      .order('updated_at', { ascending: false })

    // Filtro de tipo: serviços = forma_pagamento com indicador de serviço
    // Na prática, vendas importadas do Datacar para Gov.br são serviços
    if (tipo === 'produtos') {
      // Produtos são os enviados para Conta Azul (têm conta_azul_id preenchido)
      query = query.not('conta_azul_id', 'is', null)
    } else {
      // Serviços são os emitidos via Gov.br (erro_mensagem contém 'Gov.br' ou conta_azul_id é null)
      query = query.or('conta_azul_id.is.null,erro_mensagem.ilike.%Gov.br%')
    }

    if (data_inicio) {
      query = query.gte('data_venda', data_inicio)
    }
    if (data_fim) {
      query = query.lte('data_venda', data_fim)
    }
    if (busca) {
      query = query.ilike('cliente', `%${busca}%`)
    }

    // Limitar a 200 registros
    query = query.limit(200)

    const { data, error } = await query

    if (error) {
      console.error('[notas-emitidas] Erro ao buscar:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ notas: data || [] })

  } catch (err: any) {
    console.error('[notas-emitidas] Erro fatal:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// ─── POST: Cancelar uma nota emitida ─────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { empresa_id, nota_id, acao } = body

    if (!empresa_id || !nota_id || !acao) {
      return NextResponse.json({ error: 'empresa_id, nota_id e acao são obrigatórios' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    if (acao === 'cancelar') {
      // Verifica se a nota existe e pertence à empresa
      const { data: nota, error: notaErr } = await supabase
        .from('vendas_importadas')
        .select('id, status, os_numero')
        .eq('id', nota_id)
        .eq('empresa_id', empresa_id)
        .single()

      if (notaErr || !nota) {
        return NextResponse.json({ error: 'Nota não encontrada' }, { status: 404 })
      }

      if (nota.status === 'cancelado') {
        return NextResponse.json({ error: 'Nota já está cancelada' }, { status: 400 })
      }

      // Atualiza o status para cancelado
      const { error: updateErr } = await supabase
        .from('vendas_importadas')
        .update({
          status: 'cancelado',
          erro_mensagem: `NFS-e Cancelada em ${new Date().toLocaleDateString('pt-BR')} — Cancelamento interno (simulado)`
        })
        .eq('id', nota_id)

      if (updateErr) {
        return NextResponse.json({ error: 'Erro ao cancelar: ' + updateErr.message }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        mensagem: `NFS-e da OS #${nota.os_numero} cancelada com sucesso.`
      })
    }

    return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 })

  } catch (err: any) {
    console.error('[notas-emitidas] Erro ao executar ação:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
