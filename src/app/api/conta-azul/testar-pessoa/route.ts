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

export async function POST(req: NextRequest) {
  try {
    const { empresa_id } = await req.json()

    const { data: empresa } = await supabaseAdmin
      .from('empresas')
      .select('*')
      .eq('id', empresa_id)
      .single()

    if (!empresa?.access_token_conta_azul) {
      return NextResponse.json({ error: 'Empresa não conectada' }, { status: 400 })
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
        }).eq('id', empresa_id)
      } catch { /* ignore */ }
    }

    const resultados: Record<string, unknown>[] = []

    // Primeiro: buscar um cliente existente para ver o formato que a CA retorna
    try {
      const busca = await fetch(`${CA_BASE}/pessoas?pagina=1&tamanho_pagina=5&tipo_perfil=Cliente`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      })
      const buscaData = await busca.json()
      const lista = buscaData.itens || buscaData.items || (Array.isArray(buscaData) ? buscaData : [])
      resultados.push({
        teste: 'BUSCA_CLIENTES_EXISTENTES',
        status: busca.status,
        total: lista.length,
        primeiro_cliente: lista.length > 0 ? lista[0] : null,
        campos_primeiro_cliente: lista.length > 0 ? Object.keys(lista[0]) : [],
      })
    } catch (e: any) {
      resultados.push({ teste: 'BUSCA_CLIENTES_EXISTENTES', erro: e.message })
    }

    // Testa diferentes payloads de criação (nome fictício que depois deletamos)
    const nomeTest = `__TESTE_API_${Date.now()}`

    const payloads = [
      {
        label: 'tipo_perfil_string',
        body: { nome: nomeTest, tipo_pessoa: 'Física', tipo_perfil: 'Cliente', ativo: true, cpf: '00000000191' }
      },
      {
        label: 'tipos_perfil_array',
        body: { nome: nomeTest + '_2', tipo_pessoa: 'Física', tipos_perfil: ['Cliente'], ativo: true, cpf: '00000000272' }
      },
      {
        label: 'perfis_array',
        body: { nome: nomeTest + '_3', tipo_pessoa: 'Física', perfis: ['Cliente'], ativo: true, cpf: '00000000353' }
      },
      {
        label: 'sem_perfil_com_tipo',
        body: { nome: nomeTest + '_4', tipo_pessoa: 'Física', ativo: true, cpf: '00000000434' }
      },
      {
        label: 'tipo_perfil_array_objetos',
        body: { nome: nomeTest + '_5', tipo_pessoa: 'Física', tipo_perfil: ['Cliente'], ativo: true, cpf: '00000000515' }
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
          ok: res.ok,
          body_enviado: body,
          resposta: resJson || resText,
        })
      } catch (e: any) {
        resultados.push({ teste: label, erro: e.message, body_enviado: body })
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
      mensagem: 'Teste de criação de pessoa na API Conta Azul',
      total_testes: resultados.length,
      resultados,
      ids_deletados: idsParaDeletar,
    })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
