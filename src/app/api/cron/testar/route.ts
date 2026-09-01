import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { empresa_id, tipo } = await req.json()

    if (!empresa_id || !tipo) {
      return NextResponse.json({ error: 'empresa_id e tipo são obrigatórios' }, { status: 400 })
    }

    // Buscar o agendamento
    const { data: agendamento, error } = await supabaseAdmin
      .from('agendamentos')
      .select('*')
      .eq('empresa_id', empresa_id)
      .eq('tipo', tipo)
      .single()
      
    if (error) throw new Error('Agendamento não encontrado')

    const { acao } = agendamento
    let logDetalhes: any = { importados: 0, enviados: 0, erros_envio: 0 }
    let statusAgendamento = 'sucesso'

    const baseUrl = req.nextUrl.origin

    try {
      const dias = parseInt(agendamento.periodo_dias || '7', 10) || 7
      const hojeDate = new Date()
      const passDate = new Date()
      passDate.setDate(hojeDate.getDate() - dias)

      const dtFim = hojeDate.toISOString().split('T')[0]
      const dtIni = passDate.toISOString().split('T')[0]

      let dadosVendasParaEnvio: any[] = []

      // --- AÇÃO: IMPORTAR ---
      if (acao === 'importar' || acao === 'importar_e_enviar') {
        if (tipo === 'contas_pagar') {
          const importRes = await fetch(`${baseUrl}/api/datacar/buscar-contas`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              empresa_id,
              dtIni,
              dtFim,
              tipoPeriodo: agendamento.tipo_periodo || 'venc',
              statusPagamento: agendamento.status_pagamento || 'todas',
              localPagamento: agendamento.local_pagamento || 'todos',
            })
          })
          const importData = await importRes.json()
          if (!importRes.ok) throw new Error(importData.error || 'Erro na importação de contas')

          logDetalhes.importados = importData.total || (importData.dados ? importData.dados.length : 0)

          if (importData.dados && Array.isArray(importData.dados) && importData.dados.length > 0) {
            const itensParaSalvar = importData.dados.map((d: any) => ({
              empresa_id,
              fornecedor: (d.fornecedor || '').trim(),
              valor: d.valor,
              vencimento: d.vencimento || dtFim,
              categoria: d.categoria || 'Materiais para Revenda',
              conta_financeira: d.conta_financeira || null,
              conta_financeira_id: d.conta_financeira_id || null,
              descricao: d.descricao || null,
              doc: d.doc || null,
              emissao: d.emissao || null,
              status: 'pendente',
            }))
            await supabaseAdmin
              .from('contas_pagar_importadas')
              .upsert(itensParaSalvar, {
                onConflict: 'empresa_id,fornecedor,valor,vencimento,doc',
                ignoreDuplicates: true,
              })
          }
        } else {
          // Vendas
          const importRes = await fetch(`${baseUrl}/api/datacar/buscar-vendas`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              empresa_id,
              dtIni,
              dtFim,
              tipoPeriodo: agendamento.tipo_periodo || 'encerramento',
              situacao: agendamento.situacao || 'todas',
            })
          })
          const importData = await importRes.json()
          if (!importRes.ok) throw new Error(importData.error || 'Erro na importação de vendas')

          logDetalhes.importados = importData.total || (importData.vendas ? importData.vendas.length : 0)
          dadosVendasParaEnvio = importData.vendas || []
        }
      }

      // --- AÇÃO: ENVIAR ---
      if (acao === 'enviar' || acao === 'importar_e_enviar') {
        if (tipo === 'contas_pagar') {
          const enviarRes = await fetch(`${baseUrl}/api/conta-azul/enviar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ empresa_id, limite: 50 })
          })
          const enviarData = await enviarRes.json()
          if (!enviarRes.ok) throw new Error(enviarData.error || 'Erro no envio de contas')

          logDetalhes.enviados = enviarData.enviados || 0
          logDetalhes.erros_envio = enviarData.erros || 0
        } else {
          // Vendas
          if (dadosVendasParaEnvio.length > 0) {
            const enviarRes = await fetch(`${baseUrl}/api/conta-azul/enviar-vendas`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                empresa_id,
                vendas: dadosVendasParaEnvio.slice(0, 50)
              })
            })
            const enviarData = await enviarRes.json()
            if (!enviarRes.ok) throw new Error(enviarData.error || 'Erro no envio de vendas')

            logDetalhes.enviados = enviarData.sucessos || 0
            logDetalhes.erros_envio = enviarData.erros || 0
          }
        }

        if (logDetalhes.erros_envio > 0) statusAgendamento = 'parcial'
      }

    } catch (e: any) {
      statusAgendamento = 'erro'
      logDetalhes.erro = e.message
    }

    // Salvar histórico e atualizar último status
    await supabaseAdmin.from('logs_agendamento').insert({
      agendamento_id: agendamento.id,
      empresa_id,
      tipo,
      status: statusAgendamento,
      total_importados: logDetalhes.importados || 0,
      total_enviados: logDetalhes.enviados || 0,
      total_erros: logDetalhes.erros_envio || 0,
      detalhes: logDetalhes
    })

    await supabaseAdmin.from('agendamentos').update({
      ultima_execucao: new Date().toISOString(),
      ultimo_status: statusAgendamento,
      ultimo_log: logDetalhes
    }).eq('id', agendamento.id)

    return NextResponse.json({ message: 'Teste executado', status: statusAgendamento, detalhes: logDetalhes })
  } catch (err: any) {
    console.error('Erro na execução do teste:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
