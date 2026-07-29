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

    // ────────────────────────────────────────────────────────
    // ABA PRODUTOS: Tentar buscar direto do Conta Azul
    // ────────────────────────────────────────────────────────
    if (tipo === 'produtos') {
      try {
        const { getValidToken } = await import('@/lib/conta-azul/token-manager')
        const { accessToken } = await getValidToken(empresa_id)
        
        // Tenta usar API v1 de Sales que suporta filtro de data (emission_start/end)
        const dInicio = data_inicio ? new Date(data_inicio + 'T00:00:00Z').toISOString() : undefined
        const dFim = data_fim ? new Date(data_fim + 'T23:59:59Z').toISOString() : undefined
        
        let url = `https://api.contaazul.com/v1/sales?size=100`
        if (dInicio) url += `&emission_start=${dInicio}`
        if (dFim) url += `&emission_end=${dFim}`
        
        const resCa = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` }})
        
        if (resCa.ok) {
          const dataCa = await resCa.json()
          let vendas = dataCa || []
          
          if (busca) {
            const b = busca.toLowerCase()
            vendas = vendas.filter((v: any) => v.customer?.name?.toLowerCase().includes(b))
          }

          const notas = vendas.map((v: any) => ({
            id: v.id,
            cliente: v.customer?.name || 'Cliente CA',
            os_numero: v.number?.toString() || 'S/N',
            data_venda: v.emission?.split('T')[0] || v.emission || null,
            valor_total: v.total || 0,
            status: v.status === 'COMMITTED' ? 'enviado' : (v.status === 'CANCELLED' ? 'cancelado' : 'enviado'),
            erro_mensagem: 'Sincronizado do Conta Azul',
            conta_azul_id: v.id,
            updated_at: new Date().toISOString()
          }))
          
          return NextResponse.json({ notas })
        } else {
          console.warn("[notas-emitidas] Conta Azul API retornou erro:", resCa.status, "Fazendo fallback para banco local.")
        }
      } catch (err) {
        console.error("[notas-emitidas] Erro ao buscar no CA:", err)
      }
    }

    // ────────────────────────────────────────────────────────
    // ABA SERVIÇOS (Ou Fallback de Produtos): Banco Local
    // ────────────────────────────────────────────────────────
    
    // Busca até 1000 notas mais recentes e filtra em memória para evitar bugs do Postgrest com datas e nulos
    let { data: todasNotas, error } = await supabase
      .from('vendas_importadas')
      .select('*')
      .eq('empresa_id', empresa_id)
      .in('status', ['enviado', 'cancelado'])
      .order('updated_at', { ascending: false })
      .limit(1000)

    if (error) {
      console.error('[notas-emitidas] Erro ao buscar DB local:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    let notas = todasNotas || []

    // 1. Filtro de Tipo
    if (tipo === 'produtos') {
      notas = notas.filter(n => n.conta_azul_id && n.conta_azul_id.trim() !== '')
    } else {
      notas = notas.filter(n => !n.conta_azul_id || n.conta_azul_id.trim() === '' || (n.erro_mensagem && n.erro_mensagem.includes('Gov.br')))
    }

    // 2. Filtro de Datas (garantindo formato e horas)
    if (data_inicio) {
      notas = notas.filter(n => n.data_venda && n.data_venda >= data_inicio)
    }
    if (data_fim) {
      // Adiciona o fim do dia para garantir que pegue o dia atual inteiro
      notas = notas.filter(n => n.data_venda && n.data_venda <= `${data_fim}T23:59:59`)
    }

    // 3. Filtro de Busca (Nome do Cliente)
    if (busca) {
      const b = busca.toLowerCase()
      notas = notas.filter(n => n.cliente && n.cliente.toLowerCase().includes(b))
    }

    return NextResponse.json({ notas: notas.slice(0, 200) })

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
