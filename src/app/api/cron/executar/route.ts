import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function getHoraBrasilia(): string {
  const date = new Date()
  const dtf = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
  return dtf.format(date) // "22:00"
}

function getDiaDaSemanaBrasilia(): string {
  const date = new Date()
  // Melhor abordagem manual:
  const offset = -3 // BRT approx (sem h de verão)
  const utcDate = new Date(date.getTime() + (date.getTimezoneOffset() * 60000))
  const brDate = new Date(utcDate.getTime() + (offset * 3600000))
  
  // getDay(): 0 = Dom, 1 = Seg...
  // Nosso BD usa 1=Seg...7=Dom.
  let dia = brDate.getDay()
  if (dia === 0) dia = 7
  return dia.toString()
}

export async function GET(req: NextRequest) {
  try {
    // 1. Validar Segurança
    // A Vercel envia Authorization: Bearer <CRON_SECRET>
    const authHeader = req.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    
    // Desativando validação rígida caso estejamos testando sem o env configurado.
    // O ideal é sempre ter o CRON_SECRET no painel da Vercel.
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Identificar a hora atual no Brasil
    const horaAtual = getHoraBrasilia()
    const diaAtual = getDiaDaSemanaBrasilia()
    
    // Buscar todos os agendamentos ativos
    const { data: agendamentos, error } = await supabaseAdmin
      .from('agendamentos')
      .select('*')
      .eq('ativo', true)
      
    if (error) throw error

    // Filtrar apenas os que devem rodar AGORA (mesma hora, e contêm o dia de hoje)
    // Extrai apenas a hora ("22:00" -> "22", para ser flexível caso atrase uns minutos)
    const horaAtualHora = horaAtual.split(':')[0]
    
    const agendamentosValidos = agendamentos.filter(a => {
      if (!a.dias_semana || !a.dias_semana.includes(diaAtual)) return false
      if (!a.horario) return false
      
      const horaAgendadaHora = a.horario.split(':')[0]
      return horaAgendadaHora === horaAtualHora
    })

    if (agendamentosValidos.length === 0) {
      return NextResponse.json({ message: 'Nenhum agendamento para esta hora', horaAtual, diaAtual })
    }

    // 3. Executar cada agendamento
    const resultados = []
    
    // Criar host base para fetch interno
    // Em Vercel, req.nextUrl.origin funciona bem.
    const baseUrl = req.nextUrl.origin

    for (const agendamento of agendamentosValidos) {
      const { empresa_id, tipo, acao } = agendamento
      let logDetalhes: any = { importados: 0, enviados: 0, erros_envio: 0 }
      let statusAgendamento = 'sucesso'

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

            // Salva as contas no banco para permitir o envio ou controle
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

      // 4. Salvar histórico e atualizar último status
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

      resultados.push({ empresa_id, tipo, status: statusAgendamento })
    }

    return NextResponse.json({ message: 'Executado com sucesso', resultados })
  } catch (err: any) {
    console.error('Erro na execução do Cron:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
