import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ─── GET: Buscar notas emitidas (Produtos via Conta Azul ou Serviços via Gov.br) ───
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const empresa_id = searchParams.get('empresa_id')
    const tipo = searchParams.get('tipo') || 'produtos' // 'produtos' ou 'servicos'
    const data_inicio = searchParams.get('data_inicio')
    const data_fim = searchParams.get('data_fim')
    const busca = searchParams.get('busca')

    if (!empresa_id) {
      return NextResponse.json({ error: 'empresa_id obrigatorio' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    let vendasFormatadas: any[] = []

    // ────────────────────────────────────────────────────────
    // ABA SERVIÇOS: Consulta DIRETA no Supabase (Gov.br / Emissor Nacional)
    // ────────────────────────────────────────────────────────
    if (tipo === 'servicos') {
      let query = supabase
        .from('vendas_importadas')
        .select('*')
        .eq('empresa_id', empresa_id)
        .in('status', ['enviado', 'cancelado'])
        .order('updated_at', { ascending: false })

      if (data_inicio) query = query.gte('data_venda', data_inicio)
      if (data_fim) query = query.lte('data_venda', data_fim)

      const { data: vendasServico, error: errServ } = await query

      if (errServ) {
        console.error('[notas-emitidas] Erro ao buscar vendas_importadas:', errServ)
        throw errServ
      }

      let vendas = vendasServico || []
      if (busca) {
        const b = busca.toLowerCase()
        vendas = vendas.filter((v: any) => {
          const nomeCliente = (v.cliente || '').toLowerCase()
          const numOS = String(v.os_numero || '')
          const doc = String(v.dados_datacar?.cliente_cpf_cnpj || '')
          const numNfse = String(v.dados_datacar?.numero_nfse || v.conta_azul_id || '')
          return nomeCliente.includes(b) || numOS.includes(b) || doc.includes(b) || numNfse.includes(b)
        })
      }

      vendasFormatadas = vendas.map((v: any) => ({
        id: v.id,
        cliente: v.cliente,
        os_numero: v.os_numero || 'S/N',
        data_venda: v.data_venda,
        valor_total: Number(v.valor_total) || 0,
        status: v.status,
        erro_mensagem: v.erro_mensagem || (v.status === 'cancelado' ? 'NFS-e Cancelada' : 'NFS-e Emitida via Gov.br'),
        conta_azul_id: v.conta_azul_id || v.dados_datacar?.numero_nfse || v.os_numero,
        updated_at: v.updated_at || new Date().toISOString(),
        created_at: v.created_at || new Date().toISOString(),
        dados_datacar: v.dados_datacar || {},
        itens: v.itens || [],
        metadata: {
          numero_nfse: v.dados_datacar?.numero_nfse || v.conta_azul_id || v.os_numero,
          chave_acesso: v.dados_datacar?.chave_acesso || null,
          cliente_cpf_cnpj: v.dados_datacar?.cliente_cpf_cnpj || null,
          dados_dps: v.dados_datacar?.dados_dps || null,
          fiscal: v.dados_datacar?.fiscal || null,
          itens: v.itens || []
        }
      }))

      return NextResponse.json({ notas: vendasFormatadas })
    }

    // ────────────────────────────────────────────────────────
    // ABA PRODUTOS: Consulta via API Conta Azul
    // ────────────────────────────────────────────────────────
    if (tipo === 'produtos') {
      const { getValidToken } = await import('@/lib/conta-azul/token-manager')

      let accessToken: string
      try {
        const tokenRes = await getValidToken(empresa_id, 'vendas')
        accessToken = tokenRes.accessToken
      } catch {
        try {
          const tokenResFin = await getValidToken(empresa_id, 'financeiro')
          accessToken = tokenResFin.accessToken
        } catch {
          return NextResponse.json({ 
            notas: [], 
            aviso: 'Empresa nao conectada ao Conta Azul.' 
          })
        }
      }

      const CA_BASE = 'https://api-v2.contaazul.com/v1'

      const hoje = new Date()
      const trintaDiasAtras = new Date()
      trintaDiasAtras.setDate(hoje.getDate() - 30)

      const dtInicial = data_inicio || trintaDiasAtras.toISOString().split('T')[0]
      const dtFinal = data_fim || hoje.toISOString().split('T')[0]

      let todasNotas: any[] = []
      let pagina = 1
      const tamanhoPagina = 50
      let erroCA = null

      while (pagina <= 5) {
        const urlVendas = `${CA_BASE}/vendas?tamanho_pagina=${tamanhoPagina}&pagina=${pagina}&data_emissao_de=${dtInicial}&data_emissao_ate=${dtFinal}`
        const resCa = await fetch(urlVendas, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        })

        if (!resCa.ok) {
          const txt = await resCa.text()
          console.error(`[notas-emitidas] Erro CA Produtos pagina ${pagina}:`, resCa.status, txt)
          erroCA = `Erro ${resCa.status}: ${txt}`
          break
        }

        const dataCa = await resCa.json()
        const itensDaPagina = dataCa.itens || dataCa.items || (Array.isArray(dataCa) ? dataCa : [])

        if (itensDaPagina.length === 0) break
        todasNotas.push(...itensDaPagina)

        if (itensDaPagina.length < tamanhoPagina) break
        pagina++
      }

      let notasFiltradas = todasNotas
      if (busca) {
        const b = busca.toLowerCase()
        notasFiltradas = notasFiltradas.filter((v: any) => {
          const nomeCliente = v.destinatario?.nome || v.destinatario?.razao_social || v.tomador?.nome || v.cliente?.nome || v.nome_cliente || v.customer?.name || ''
          const numNota = String(v.numero_nota || v.numero || v.number || '')
          const doc = String(v.destinatario?.documento || v.tomador?.documento || v.documento || '')
          const chave = String(v.chave_acesso || '')
          return nomeCliente.toLowerCase().includes(b) || numNota.includes(b) || doc.includes(b) || chave.includes(b)
        })
      }

      vendasFormatadas = notasFiltradas.map((v: any) => {
        const nomeCliente = v.destinatario?.nome || v.destinatario?.razao_social || v.tomador?.nome || v.tomador?.razao_social || v.cliente?.nome || v.nome_cliente || v.customer?.name || 'Cliente CA'
        const docCliente = v.destinatario?.documento || v.destinatario?.cpf || v.destinatario?.cnpj || v.tomador?.documento || v.documento || null
        const numNota = String(v.numero_nota || v.numero || v.serie_numero || v.number || 'S/N')
        const dataEmissao = v.data_emissao || v.data_autorizacao || v.emissao || v.data_venda || v.created_at || null
        const valorTotal = Number(v.valor_total || v.valor_nota || v.total || v.valor_composicao?.valor_liquido || 0)
        const statusRaw = (v.status || v.situacao?.nome || v.situacao || '').toString().toUpperCase()
        const isCancelado = statusRaw.includes('CANCEL')

        return {
          id: v.id || v.id_nota || numNota,
          cliente: nomeCliente,
          os_numero: numNota,
          data_venda: dataEmissao,
          valor_total: valorTotal,
          status: isCancelado ? 'cancelado' : 'enviado',
          erro_mensagem: v.chave_acesso ? `Chave: ${v.chave_acesso}` : 'Sincronizado do Conta Azul (NF-e)',
          conta_azul_id: v.id || numNota,
          updated_at: dataEmissao || new Date().toISOString(),
          created_at: dataEmissao || new Date().toISOString(),
          dados_datacar: {
            cliente_cpf_cnpj: docCliente,
            chave_acesso: v.chave_acesso || null,
            serie: v.serie || null,
            id_venda: v.id_venda || null
          },
          metadata: {
            cliente_cpf_cnpj: docCliente,
            chave_acesso: v.chave_acesso || null,
            serie: v.serie || null
          }
        }
      })

      return NextResponse.json({ notas: vendasFormatadas })
    }

    return NextResponse.json({ notas: [] })

  } catch (err: any) {
    console.error('[notas-emitidas] Erro fatal:', err)
    return NextResponse.json(
      { error: err.message || 'Erro interno do servidor' }, 
      { status: err.statusCode || 500 }
    )
  }
}

// ─── POST: Cancelar uma nota emitida de serviço ──────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { empresa_id, nota_id, acao } = body

    if (!empresa_id || !nota_id || !acao) {
      return NextResponse.json({ error: 'empresa_id, nota_id e acao sao obrigatorios' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    if (acao === 'cancelar') {
      const { data: nota, error: notaErr } = await supabase
        .from('vendas_importadas')
        .select('id, status, os_numero')
        .eq('id', nota_id)
        .eq('empresa_id', empresa_id)
        .single()

      if (notaErr || !nota) {
        return NextResponse.json({ error: 'Nota nao encontrada' }, { status: 404 })
      }

      if (nota.status === 'cancelado') {
        return NextResponse.json({ error: 'Nota ja esta cancelada' }, { status: 400 })
      }

      const { error: updateErr } = await supabase
        .from('vendas_importadas')
        .update({
          status: 'cancelado',
          erro_mensagem: 'NFS-e Cancelada em ' + new Date().toLocaleDateString('pt-BR') + ' - Cancelamento Gov.br'
        })
        .eq('id', nota_id)

      if (updateErr) {
        return NextResponse.json({ error: 'Erro ao cancelar: ' + updateErr.message }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        mensagem: 'NFS-e da OS #' + nota.os_numero + ' cancelada com sucesso.'
      })
    }

    return NextResponse.json({ error: 'Acao desconhecida' }, { status: 400 })

  } catch (err: any) {
    console.error('[notas-emitidas] Erro ao executar acao:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
