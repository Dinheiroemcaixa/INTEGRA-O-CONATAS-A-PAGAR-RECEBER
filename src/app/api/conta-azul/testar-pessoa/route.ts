import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { refreshToken as refreshCA } from '@/lib/conta-azul/api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CA_BASE = 'https://api-v2.contaazul.com/v1'

// GET para poder testar direto no navegador (basta abrir a URL)
export async function GET(req: NextRequest) {
  try {
    // Pega a primeira empresa conectada ao Conta Azul
    const { data: empresas } = await supabaseAdmin
      .from('empresas')
      .select('*')
      .not('access_token_conta_azul', 'is', null)
      .limit(1)

    const empresa = empresas?.[0]
    if (!empresa?.access_token_conta_azul) {
      return NextResponse.json({ error: 'Nenhuma empresa conectada ao CA' }, { status: 400 })
    }

    let accessToken = empresa.access_token_conta_azul

    // Refresh token se necessário
    const expiracao = empresa.data_expiracao_token ? new Date(empresa.data_expiracao_token) : null
    const agora = new Date()
    const tokenExpirado = expiracao && expiracao <= new Date(agora.getTime() + 5 * 60 * 1000)
    if (tokenExpirado && empresa.refresh_token_conta_azul) {
      try {
        const novosTokens = await refreshCA(
          empresa.refresh_token_conta_azul,
          process.env.CONTA_AZUL_CLIENT_ID!,
          process.env.CONTA_AZUL_CLIENT_SECRET!
        )
        accessToken = novosTokens.access_token
        await supabaseAdmin.from('empresas').update({
          access_token_conta_azul: novosTokens.access_token,
          refresh_token_conta_azul: novosTokens.refresh_token || empresa.refresh_token_conta_azul,
          data_expiracao_token: new Date(Date.now() + (novosTokens.expires_in || 3600) * 1000).toISOString(),
        }).eq('id', empresa.id)
      } catch { /* ignore */ }
    }

    const resultados: Record<string, unknown>[] = []

    // 1. Buscar clientes existentes para ver o formato que a CA retorna
    try {
      const busca = await fetch(`${CA_BASE}/pessoas?pagina=1&tamanho_pagina=3`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      })
      const buscaText = await busca.text()
      let buscaData: any = null
      try { buscaData = JSON.parse(buscaText) } catch {}
      
      if (buscaData) {
        const lista = buscaData.itens || buscaData.items || (Array.isArray(buscaData) ? buscaData : [])
        resultados.push({
          teste: '0_BUSCA_PESSOAS_EXISTENTES',
          status: busca.status,
          total: lista.length,
          primeiro_pessoa_COMPLETA: lista.length > 0 ? lista[0] : null,
          campos: lista.length > 0 ? Object.keys(lista[0]) : [],
        })
      } else {
        resultados.push({ teste: '0_BUSCA_PESSOAS_EXISTENTES', status: busca.status, resposta_raw: buscaText })
      }
    } catch (e: any) {
      resultados.push({ teste: '0_BUSCA_PESSOAS_EXISTENTES', erro: e.message })
    }

    // 2. Testar diferentes payloads de criação
    const ts = Date.now()
    const payloads = [
      {
        label: '1_tipo_perfil_string_Cliente',
        body: { nome: `TESTE_${ts}_1`, tipo_pessoa: 'Física', tipo_perfil: 'Cliente', ativo: true, cpf: '00000000191' }
      },
      {
        label: '2_tipos_perfil_array',
        body: { nome: `TESTE_${ts}_2`, tipo_pessoa: 'Física', tipos_perfil: ['Cliente'], ativo: true, cpf: '00000000272' }
      },
      {
        label: '3_perfis_array',
        body: { nome: `TESTE_${ts}_3`, tipo_pessoa: 'Física', perfis: ['Cliente'], ativo: true, cpf: '00000000353' }
      },
      {
        label: '4_sem_perfil',
        body: { nome: `TESTE_${ts}_4`, tipo_pessoa: 'Física', ativo: true, cpf: '00000000434' }
      },
      {
        label: '5_cliente_sem_acento_fisica',
        body: { nome: `TESTE_${ts}_5`, tipo_pessoa: 'Fisica', tipo_perfil: 'Cliente', ativo: true, cpf: '00000000515' }
      },
    ]

    const idsParaDeletar: string[] = []

    for (const { label, body } of payloads) {
      try {
        const res = await fetch(`${CA_BASE}/pessoas`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const resText = await res.text()
        let resJson: any = null
        try { resJson = JSON.parse(resText) } catch {}
        
        if (res.ok && resJson?.id) {
          idsParaDeletar.push(resJson.id)
        }

        resultados.push({
          teste: label,
          status: res.status,
          SUCESSO: res.ok,
          body_enviado: body,
          resposta: resJson || resText,
        })
      } catch (e: any) {
        resultados.push({ teste: label, SUCESSO: false, erro: e.message, body_enviado: body })
      }
    }

    // Limpar: deletar os contatos de teste criados
    for (const id of idsParaDeletar) {
      try {
        await fetch(`${CA_BASE}/pessoas/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${accessToken}` },
        })
      } catch { /* ignore */ }
    }

    return NextResponse.json({
      mensagem: '🔍 Resultado do teste de criação de pessoa na API Conta Azul',
      empresa: empresa.nome,
      total_testes: resultados.length,
      resultados,
      ids_criados_e_deletados: idsParaDeletar,
    }, { status: 200 })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
