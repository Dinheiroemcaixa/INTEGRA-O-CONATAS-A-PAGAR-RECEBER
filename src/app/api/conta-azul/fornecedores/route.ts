import { NextRequest, NextResponse } from 'next/server'
import { getValidToken, TokenError } from '@/lib/conta-azul/token-manager'

export const runtime = 'nodejs'

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

  // Obter token válido (com renovação automática)
  let accessToken: string
  try {
    const result = await getValidToken(empresa_id)
    accessToken = result.accessToken
  } catch (e) {
    if (e instanceof TokenError) {
      return NextResponse.json({ error: e.message }, { status: e.statusCode })
    }
    throw e
  }

  try {
    const fornecedores = await listarFornecedores(accessToken, busca)
    return NextResponse.json({ fornecedores })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro ao buscar fornecedores' }, { status: 500 })
  }
}
