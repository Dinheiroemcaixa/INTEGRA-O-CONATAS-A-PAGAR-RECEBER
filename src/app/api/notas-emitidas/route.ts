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
    // ABA PRODUTOS: Consulta via API Oficial de Notas Fiscais (v1) Conta Azul
    // Endpoint: GET /v1/notas-fiscais
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
            aviso: 'Empresa não conectada ao Conta Azul.' 
          })
        }
      }

      const CA_BASE = 'https://api-v2.contaazul.com/v1'

      const hoje = new Date()
      let dtInicial = data_inicio
      let dtFinal = data_fim

      if (!dtFinal) {
        dtFinal = hoje.toISOString().split('T')[0]
      }
      if (!dtInicial) {
        const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
        dtInicial = primeiroDiaMes.toISOString().split('T')[0]
      }

      // Se vier em formato DD/MM/YYYY, converter para YYYY-MM-DD
      if (dtInicial.includes('/')) {
        const [d, m, y] = dtInicial.split('/')
        dtInicial = `${y}-${m}-${d}`
      }
      if (dtFinal.includes('/')) {
        const [d, m, y] = dtFinal.split('/')
        dtFinal = `${y}-${m}-${d}`
      }

      let todasNotas: any[] = []
      let pagina = 1
      let totalPaginas = 1
      const tamanhoPagina = 100

      // 1. Busca todas as notas fiscais emitidas no período via endpoint oficial /v1/notas-fiscais
      while (pagina <= totalPaginas && pagina <= 20) {
        const urlNotas = `${CA_BASE}/notas-fiscais?data_inicial=${dtInicial}&data_final=${dtFinal}&pagina=${pagina}&tamanho_pagina=${tamanhoPagina}`
        const resCa = await fetch(urlNotas, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        })

        if (!resCa.ok) {
          const txt = await resCa.text().catch(() => '')
          console.error(`[notas-emitidas] Erro CA /notas-fiscais página ${pagina}:`, resCa.status, txt)
          break
        }

        const dataCa = await resCa.json()
        const itensDaPagina = dataCa.itens || dataCa.items || (Array.isArray(dataCa) ? dataCa : [])

        if (itensDaPagina.length === 0) break
        todasNotas.push(...itensDaPagina)

        if (dataCa.paginacao && dataCa.paginacao.total_paginas) {
          totalPaginas = Number(dataCa.paginacao.total_paginas)
        } else {
          if (itensDaPagina.length < tamanhoPagina) break
        }
        pagina++
      }

      // 2. Busca vendas em paralelo para enriquecer o valor total de cada nota
      const vendasMapPorNum = new Map<number, any>()
      const vendasMapPorNome = new Map<string, any>()

      try {
        const urlVendas = `${CA_BASE}/venda/busca?data_inicio=${dtInicial}&data_fim=${dtFinal}&pagina=1&tamanho_pagina=200`
        const resVendas = await fetch(urlVendas, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        })
        if (resVendas.ok) {
          const dataVendas = await resVendas.json()
          const itensV = dataVendas.itens || dataVendas.items || []
          itensV.forEach((v: any) => {
            if (v.numero) vendasMapPorNum.set(Number(v.numero), v)
            if (v.cliente && v.cliente.nome) {
              vendasMapPorNome.set(v.cliente.nome.toLowerCase().trim(), v)
            }
          })
        }
      } catch (eVendas) {
        console.warn('[notas-emitidas] Aviso ao buscar vendas para enriquecimento:', eVendas)
      }

      // 3. Filtrar por busca textual (se fornecida)
      let notasFiltradas = todasNotas
      if (busca) {
        const b = busca.toLowerCase().trim()
        notasFiltradas = notasFiltradas.filter((nota: any) => {
          const nome = (nota.nome_destinatario || '').toLowerCase()
          const num = String(nota.numero_nota || '')
          const chave = String(nota.chave_acesso || '').toLowerCase()
          return nome.includes(b) || num.includes(b) || chave.includes(b)
        })
      }

      // 4. Formatar para a interface da aplicação
      vendasFormatadas = notasFiltradas.map((nota: any) => {
        const nomeCliente = nota.nome_destinatario || 'Cliente CA'
        const numNota = String(nota.numero_nota || 'S/N')
        const dataEmissao = nota.data_emissao || nota.data_autorizacao || null
        const statusRaw = (nota.status || '').toString().toUpperCase()
        const isCancelado = statusRaw.includes('CANCEL')
        
        const matchVenda = vendasMapPorNum.get(Number(nota.numero_nota)) || vendasMapPorNome.get(nomeCliente.toLowerCase().trim())
        const valorTotal = Number(nota.valor_total || nota.valor_nota || matchVenda?.total || 0)

        return {
          id: nota.chave_acesso || numNota,
          cliente: nomeCliente,
          os_numero: numNota,
          data_venda: dataEmissao,
          valor_total: valorTotal,
          status: isCancelado ? 'cancelado' : 'enviado',
          erro_mensagem: nota.chave_acesso ? `Chave: ${nota.chave_acesso}` : 'NF-e Emitida no Conta Azul',
          conta_azul_id: nota.chave_acesso || numNota,
          updated_at: dataEmissao || new Date().toISOString(),
          created_at: dataEmissao || new Date().toISOString(),
          dados_datacar: {
            cliente: nomeCliente,
            chave_acesso: nota.chave_acesso || null,
            numero_nota: nota.numero_nota,
            serie: nota.serie || '1',
            id_venda: matchVenda?.id || null
          },
          metadata: {
            chave_acesso: nota.chave_acesso || null,
            numero_nota: nota.numero_nota,
            serie: nota.serie || '1',
            status: nota.status
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
