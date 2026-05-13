/**
 * Cliente da API do Conta Azul - NOVA API v2
 * Documentação: https://developers.contaazul.com/
 * Base URL: https://api-v2.contaazul.com/v1/
 * Auth URL: https://auth.contaazul.com/oauth2/
 *
 * ATENÇÃO: A API legada foi desligada em Out/2025. Este client usa a nova API v2.
 */

const BASE_URL = 'https://api-v2.contaazul.com/v1'
const AUTH_URL = 'https://auth.contaazul.com/oauth2/token'
const AUTHORIZE_URL = 'https://auth.contaazul.com/oauth2/authorize'

export interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
}

export interface ContaFinanceira {
  id: string
  descricao: string
  tipo?: string
}

export interface ContatoCA {
  id: string
  nome: string
}

export interface ContaPagarPayload {
  // API v2 Conta Azul - documentação: developers.contaazul.com
  data_competencia: string      // YYYY-MM-DD (obrigatório)
  valor: number                 // (obrigatório)
  observacao: string            // (obrigatório)
  descricao: string             // (obrigatório)
  contato?: string              // UUID do contato
  conta_financeira?: string     // UUID da conta financeira
  condicao_pagamento: {         // (obrigatório)
    parcelas: Array<{
      descricao: string
      data_vencimento: string   // YYYY-MM-DD
      nota: string
      conta_financeira?: string
      detalhe_valor: {
        valor_bruto: number
        valor_liquido: number   // (obrigatório na v2)
        multa?: number
        juros?: number
        desconto?: number
        taxa?: number
      }
    }>
  }
  rateio?: Array<{              // (obrigatório na v2 - ao menos 1)
    categoria_id: string
    valor: number
  }>
}

export interface ContaPagarResponse {
  protocolId: string
  status: 'PENDING' | 'SUCCESS' | 'ERROR'
  createdAt: string
}

// ─── OAuth2: Trocar código por token ─────────────────────────────────────────

export async function getTokenComCodigo(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string
): Promise<TokenResponse> {
  const credenciais = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const res = await fetch(AUTH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credenciais}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Erro ao obter token: ${res.status} - ${err}`)
  }
  return res.json()
}

// ─── OAuth2: Renovar token ────────────────────────────────────────────────────

export async function refreshToken(
  refreshTokenStr: string,
  clientId: string,
  clientSecret: string
): Promise<TokenResponse> {
  const credenciais = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const res = await fetch(AUTH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credenciais}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshTokenStr,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Erro ao renovar token: ${res.status} - ${err}`)
  }
  return res.json()
}

// ─── Listar Contas Financeiras ────────────────────────────────────────────────

export async function listarContasFinanceiras(
  accessToken: string
): Promise<ContaFinanceira[]> {
  const endpoints = [
    `${BASE_URL}/financeiro/contas-financeiras`,
    `${BASE_URL}/contas-financeiras`,
  ]

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      })
      if (!res.ok) continue
      const data = await res.json()
      // A resposta pode ser array direto ou { content: [...] } ou { itens: [...] }
      const lista = Array.isArray(data) ? data : (data.content ?? data.items ?? data.itens ?? data.data ?? [])
      if (lista.length > 0) return lista
    } catch (e) {
      console.warn(`[contas-financeiras] erro em ${endpoint}:`, e)
    }
  }
  return []
}

// ─── Listar Categorias Financeiras ─────────────────────────────────────────────

export async function listarCategorias(
  accessToken: string
): Promise<Array<{ id: string; nome: string }>> {
  // Tentar múltiplos endpoints possíveis para categorias no Conta Azul v2
  const endpoints = [
    `${BASE_URL}/financeiro/categorias?tipo=DESPESA`,
    `${BASE_URL}/financeiro/categorias`,
    `${BASE_URL}/categorias?tipo=DESPESA`,
    `${BASE_URL}/categorias`,
    `${BASE_URL}/financeiro/categorias-financeiras`,
  ]

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      })
      
      console.log(`[categorias] ${endpoint} -> ${res.status}`)
      
      if (!res.ok) {
        const errText = await res.text()
        console.warn(`[categorias] erro em ${endpoint}: ${res.status} - ${errText}`)
        continue
      }
      
      const data = await res.json()
      console.log(`[categorias] resposta de ${endpoint.split('?')[0]}:`, JSON.stringify(data).substring(0, 500))
      
      let lista: any[] = []
      if (Array.isArray(data)) {
        lista = data
      } else if (data.content && Array.isArray(data.content)) {
        lista = data.content
      } else if (data.items && Array.isArray(data.items)) {
        lista = data.items
      } else if (data.itens && Array.isArray(data.itens)) {
        lista = data.itens
      } else if (data.data && Array.isArray(data.data)) {
        lista = data.data
      }
      
      if (lista.length > 0) {
        // Normalizar campos - a API pode retornar 'name' ou 'nome', 'uuid' ou 'id'
        const categoriasNormalizadas = lista.map(c => ({
          id: c.id || c.uuid || c.categoryId || c.guid,
          nome: c.nome || c.name || c.descricao || c.description || 'Categoria',
          tipo: c.tipo || c.type
        })).filter(c => c.id)

        // Se o endpoint não for específico de despesa, tentamos filtrar as de despesa se houver o campo tipo
        if (!endpoint.includes('tipo=DESPESA')) {
          const despesas = categoriasNormalizadas.filter(c => 
            !c.tipo || c.tipo === 'DESPESA' || c.tipo === 'EXPENSE' || c.tipo === 'OUTGOING'
          )
          if (despesas.length > 0) return despesas
        }

        return categoriasNormalizadas
      }
    } catch (e) {
      console.warn(`[categorias] erro em ${endpoint}:`, e)
    }
  }

  return []
}

// ─── Listar / Criar Contato ───────────────────────────────────────────────────

export async function buscarOuCriarContato(
  accessToken: string,
  nome: string
): Promise<string | undefined> {
  try {
    // Buscar contato por nome
    const busca = await fetch(
      `${BASE_URL}/contatos?nome=${encodeURIComponent(nome)}&page=0&size=5`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    )
    if (busca.ok) {
      const data = await busca.json()
      const lista: ContatoCA[] = Array.isArray(data) ? data : (data.content ?? data.items ?? [])
      if (lista.length > 0) return lista[0].id
    }

    // Criar contato se não existir
    const criar = await fetch(`${BASE_URL}/contatos`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ nome, tipo_pessoa: 'PJ', ativo: true }),
    })
    if (criar.ok) {
      const novo: ContatoCA = await criar.json()
      return novo.id
    }
  } catch { /* ignora - contato é opcional */ }
  return undefined
}

// ─── Criar Conta a Pagar ──────────────────────────────────────────────────────

export async function criarContaPagar(
  accessToken: string,
  payload: ContaPagarPayload
): Promise<ContaPagarResponse> {
  const res = await fetch(
    `${BASE_URL}/financeiro/eventos-financeiros/contas-a-pagar`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  )

  if (res.status === 401) throw new Error('TOKEN_EXPIRADO')

  if (!res.ok) {
    const errBody = await res.text()
    // Mostrar a resposta da API primeiro (mais útil para debug)
    const mensagem = `[${res.status}] ${errBody}`
    throw new Error(mensagem)
  }

  return res.json()
}

// ─── URL de Autorização OAuth2 ────────────────────────────────────────────────

export function getUrlAutorizacao(
  clientId: string,
  redirectUri: string,
  state?: string
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'openid profile aws.cognito.signin.user.admin',
    ...(state ? { state } : {}),
  })
  return `${AUTHORIZE_URL}?${params}`
}
