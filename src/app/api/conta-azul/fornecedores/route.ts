import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { refreshToken as refreshCA } from '@/lib/conta-azul/api'

export const runtime = 'nodejs'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BASE_URL = 'https://api-v2.contaazul.com/v1'

async function listarFornecedores(accessToken: string, busca?: string) {
  const todos: { id: string; nome: string }[] = []
  let pagina = 1

  while (true) {
    const params = new URLSearchParams({ pagina: String(pagina), tamanho_pagina: '100', tipo_perfil: 'Fornecedor' })
    if (busca && busca.trim().length >= 2) params.set('busca', busca.trim())

    const res = await fetch(`${BASE_URL}/pessoas?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!res.ok) break

    const data = await res.json()
    const itens: { id: string; nome: string }[] = data.itens || data.items || data.content || data.data || []
    if (itens.length === 0) break

    todos.push(...itens.map((p: { id: string; nome: string }) => ({ id: p.id, nome: p.nome })))
    if (itens.length < 100) break
    if (++pagina > 10) break // máx 1000 fornecedores
  }

  return todos
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const empresa_id = searchParams.get('empresa_id')
  const busca      = searchParams.get('busca') || undefined

  if (!empresa_id) return NextResponse.json({ error: 'empresa_id obrigatório' }, { status: 400 })

  const { data: empresa, error: errEmp } = await supabaseAdmin
    .from('empresas').select('*').eq('id', empresa_id).single()

  if (errEmp || !empresa) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 })
  if (!empresa.access_token_conta_azul) return NextResponse.json({ error: 'Empresa sem token CA' }, { status: 401 })

  let accessToken = empresa.access_token_conta_azul
  const expiracao = empresa.data_expiracao_token ? new Date(empresa.data_expiracao_token) : null
  const tokenExpirado = expiracao && expiracao <= new Date(Date.now() + 5 * 60 * 1000)

  if (tokenExpirado && empresa.refresh_token_conta_azul) {
    try {
      const novos = await refreshCA(empresa.refresh_token_conta_azul, process.env.CONTA_AZUL_CLIENT_ID!, process.env.CONTA_AZUL_CLIENT_SECRET!)
      accessToken = novos.access_token
      await supabaseAdmin.from('empresas').update({
        access_token_conta_azul: novos.access_token,
        refresh_token_conta_azul: novos.refresh_token,
        data_expiracao_token: new Date(Date.now() + novos.expires_in * 1000).toISOString(),
      }).eq('id', empresa_id)
    } catch {
      return NextResponse.json({ error: 'Token expirado. Reconecte o Conta Azul.' }, { status: 401 })
    }
  }

  try {
    const fornecedores = await listarFornecedores(accessToken, busca)
    return NextResponse.json({ fornecedores })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro ao buscar fornecedores' }, { status: 500 })
  }
}
