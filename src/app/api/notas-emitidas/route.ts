import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ─── GET: Buscar notas emitidas ─────────────────────────────────────────────
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

    const { getValidToken } = await import('@/lib/conta-azul/token-manager')

    // 1. Obter Token Válido (priorizando o módulo correto e com fallback seguro)
    let accessToken: string | null = null
    let moduloUsado = tipo === 'produtos' ? 'vendas' : 'financeiro'

    try {
      const tokenRes = await getValidToken(empresa_id, tipo === 'produtos' ? 'vendas' : 'financeiro')
      accessToken = tokenRes.accessToken
    } catch (ePrimeiro) {
      try {
        // Fallback para o outro módulo (caso a empresa use uma única conta para tudo)
        const fallbackModulo = tipo === 'produtos' ? 'financeiro' : 'vendas'
        const tokenRes = await getValidToken(empresa_id, fallbackModulo)
        accessToken = tokenRes.accessToken
        moduloUsado = fallbackModulo
      } catch (eSegundo: any) {
        return NextResponse.json({ 
          error: eSegundo.message || 'Empresa nao conectada ao Conta Azul. Conecte a conta nas configuracoes de Empresas.' 
        }, { status: 401 })
      }
    }

    const CA_BASE = 'https://api-v2.contaazul.com/v1'
    let vendasFormatadas: any[] = []

    // Formatar datas obrigatorias YYYY-MM-DD
    const hojeStr = new Date().toISOString().slice(0, 10)
    const trintaDiasAtras = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
    const dtInicial = data_inicio ? data_inicio.slice(0, 10) : trintaDiasAtras
    const dtFinal = data_fim ? data_fim.slice(0, 10) : hojeStr

    // ────────────────────────────────────────────────────────
    // ABA PRODUTOS: /v1/notas-fiscais (Conforme documentacao oficial)
    // ────────────────────────────────────────────────────────
    if (tipo === 'produtos') {
      let todasNotas: any[] = []
      let pagina = 1
      let totalPaginas = 1
      let erroCA: string | null = null

      while (pagina <= totalPaginas && pagina <= 10) {
        const url = CA_BASE + '/notas-fiscais?data_inicial=' + dtInicial + '&data_final=' + dtFinal + '&pagina=' + pagina + '&tamanho_pagina=100'
        console.log('[notas-emitidas] Buscando NF-e de Produtos pag ' + pagina + ' (' + moduloUsado + '): ' + url)

        const resCa = await fetch(url, { 
          headers: { 'Authorization': 'Bearer ' + accessToken } 
        })

        if (!resCa.ok) {
          const errTxt = await resCa.text().catch(() => '')
          console.error('[notas-emitidas] Erro CA Produtos pag ' + pagina + ':', resCa.status, errTxt)
          if (pagina === 1) {
            erroCA = 'Conta Azul (' + resCa.status + '): ' + errTxt.substring(0, 200)
          }
          break
        }

        const dataCa = await resCa.json()
        const itens = dataCa.itens || dataCa.items || (Array.isArray(dataCa) ? dataCa : [])
        todasNotas.push(...itens)

        if (dataCa.paginacao && typeof dataCa.paginacao.total_paginas === 'number') {
          totalPaginas = dataCa.paginacao.total_paginas
        } else if (itens.length < 100) {
          break
        }

        pagina++
      }

      if (erroCA && todasNotas.length === 0) {
        console.warn('[notas-emitidas] Retornando lista vazia devido a erro da API Conta Azul:', erroCA)
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
          erro_mensagem: v.chave_acesso ? 'Chave: ' + v.chave_acesso : 'Sincronizado do Conta Azul (NF-e)',
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
    }

    // ────────────────────────────────────────────────────────
    // ABA SERVIÇOS: /v1/notas-fiscais-servico
    // ────────────────────────────────────────────────────────
    if (tipo === 'servicos') {
      const dIni = new Date(dtInicial + 'T00:00:00Z')
      const dFim = new Date(dtFinal + 'T23:59:59Z')
      
      const chunks: { inicio: string, fim: string }[] = []
      let atual = new Date(dIni)
      
      while (atual <= dFim) {
        let chunkFim = new Date(atual)
        chunkFim.setDate(chunkFim.getDate() + 14)
        if (chunkFim > dFim) chunkFim = new Date(dFim)
        
        chunks.push({
          inicio: atual.toISOString().split('T')[0],
          fim: chunkFim.toISOString().split('T')[0]
        })
        
        atual.setDate(atual.getDate() + 15)
      }

      let todasVendasServico: any[] = []
      let erroCA = null

      const fetchPromises = chunks.map(async chunk => {
        const url = CA_BASE + '/notas-fiscais-servico?tamanho_pagina=100&data_competencia_de=' + chunk.inicio + '&data_competencia_ate=' + chunk.fim
        console.log('[notas-emitidas] Buscando notas fiscais de SERVICO:', url)
        const resCa = await fetch(url, { headers: { 'Authorization': 'Bearer ' + accessToken } })
        
        if (resCa.ok) {
          const dataCa = await resCa.json()
          return dataCa.itens || dataCa.items || []
        } else {
          const txt = await resCa.text()
          console.error('[notas-emitidas] Erro CA Servicos chunk ' + chunk.inicio + '-' + chunk.fim + ':', resCa.status, txt)
          erroCA = 'Erro ' + resCa.status + ': ' + txt
          return []
        }
      })

      const arraysDeVendas = await Promise.all(fetchPromises)
      arraysDeVendas.forEach(arr => { todasVendasServico.push(...arr) })

      const vendasUnicas = Array.from(new Map(todasVendasServico.map(item => [item.id || item.numero, item])).values())

      let vendas = vendasUnicas
      if (busca) {
        const b = busca.toLowerCase()
        vendas = vendas.filter((v: any) => {
          const nomeCliente = v.nome_cliente || v.cliente?.nome || v.customer?.name || ''
          return nomeCliente.toLowerCase().includes(b)
        })
      }

      vendasFormatadas = vendas.map((v: any) => ({
        id: v.id || v.numero?.toString() || Math.random().toString(),
        cliente: v.nome_cliente || v.cliente?.nome || v.customer?.name || 'Cliente CA',
        os_numero: (v.numero || v.serie_numero || v.numero_nfse || v.number || 'S/N').toString(),
        data_venda: v.data_emissao || v.data_competencia || v.data_venda || null,
        valor_total: v.valor_total || v.valor_servico || v.valor_composicao?.valor_liquido || 0,
        status: (v.status || v.situacao?.nome || v.situacao || '').toString().toUpperCase().includes('CANCEL') ? 'cancelado' : 'enviado',
        erro_mensagem: 'Sincronizado do Conta Azul (NFS-e)',
        conta_azul_id: v.id || v.numero?.toString() || null,
        updated_at: v.data_emissao || new Date().toISOString(),
        created_at: v.data_emissao || new Date().toISOString()
      }))
    }

    return NextResponse.json({ notas: vendasFormatadas })

  } catch (err: any) {
    console.error('[notas-emitidas] Erro fatal:', err)
    return NextResponse.json(
      { error: err.message || 'Erro interno do servidor' }, 
      { status: err.statusCode || 500 }
    )
  }
}

// ─── POST: Cancelar uma nota emitida ─────────────────────────────────────────
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
          erro_mensagem: 'NFS-e Cancelada em ' + new Date().toLocaleDateString('pt-BR') + ' - Cancelamento interno'
        })
        .eq('id', nota_id)

      if (updateErr) {
        return NextResponse.json({ error: 'Erro ao cancelar: ' + updateErr.message }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        mensagem: 'Nota da OS #' + nota.os_numero + ' cancelada com sucesso.'
      })
    }

    return NextResponse.json({ error: 'Acao desconhecida' }, { status: 400 })

  } catch (err: any) {
    console.error('[notas-emitidas] Erro ao executar acao:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
