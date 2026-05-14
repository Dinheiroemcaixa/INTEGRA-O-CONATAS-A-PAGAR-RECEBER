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
  // API v2 Conta Azul - campos em português conforme validação da API
  data_competencia: string      // YYYY-MM-DD (obrigatório)
  valor: number                 // (obrigatório)
  observacao?: string
  descricao: string             // (obrigatório)
  contato?: string              // UUID do contato
  conta_financeira?: string     // UUID da conta financeira
  condicao_pagamento: {         // (obrigatório)
    parcelas: Array<{
      descricao: string
      data_vencimento: string   // YYYY-MM-DD
      nota?: string
      detalhe_valor: {          // (obrigatório - "composição de valor")
        valor_bruto: number
        valor_liquido: number
        multa?: number
        juros?: number
        desconto?: number
        taxa?: number
      }
    }>
  }
  rateio: Array<{               // (obrigatório na v2)
    id_categoria?: string
    categoria_id?: string
    valor?: number
    value?: number
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
    `${BASE_URL}/financeiro/contas-financeiras?size=50`,
    `${BASE_URL}/contas-financeiras?size=50`,
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
  const todasCategoriasEncontradas = new Map<string, { id: string; nome: string; tipo?: string }>()
  const endpoints = [
    `${BASE_URL}/financeiro/categorias?tipo=DESPESA&size=100`,
    `${BASE_URL}/financeiro/categorias?size=100`,
    `${BASE_URL}/categorias?tipo=DESPESA&size=100`,
    `${BASE_URL}/categorias?size=100`,
    `${BASE_URL}/financeiro/categorias-financeiras?size=100`,
  ]

  for (const endpoint of endpoints) {
    try {
      // Loop para buscar múltiplas páginas (até 5 páginas de 100 itens para segurança)
      for (let page = 0; page < 5; page++) {
        const urlComPagina = `${endpoint}${endpoint.includes('?') ? '&' : '?'}page=${page}&size=100`
        const res = await fetch(urlComPagina, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        })
        
        if (!res.ok) break // Se falhar esta página, tenta o próximo endpoint
        
        const data = await res.json()
        let listaRaw: any[] = []
        if (Array.isArray(data)) {
          listaRaw = data
        } else if (data.content && Array.isArray(data.content)) {
          listaRaw = data.content
        } else if (data.items && Array.isArray(data.items)) {
          listaRaw = data.items
        } else if (data.itens && Array.isArray(data.itens)) {
          listaRaw = data.itens
        } else if (data.data && Array.isArray(data.data)) {
          listaRaw = data.data
        }
        
        if (listaRaw.length === 0) break // Fim das páginas
        
        const achatarCategorias = (itens: any[]): any[] => {
          let resultado: any[] = []
          for (const item of itens) {
            resultado.push({
              id: item.id || item.uuid || item.categoryId || item.guid,
              nome: item.nome || item.name || item.descricao || item.description || 'Categoria',
              tipo: item.tipo || item.type
            })
            const filhos = item.children || item.sub_categories || item.subcategorias || item.itens || item.items || item.nodes
            if (filhos && Array.isArray(filhos) && filhos.length > 0) {
              resultado = resultado.concat(achatarCategorias(filhos))
            }
          }
          return resultado
        }

        const achatadas = achatarCategorias(listaRaw)
        for (const cat of achatadas) {
          if (cat.id && !todasCategoriasEncontradas.has(cat.id)) {
            const ehReceita = cat.tipo === 'RECEITA' || cat.tipo === 'REVENUE' || cat.tipo === 'INCOME'
            if (!ehReceita) {
              todasCategoriasEncontradas.set(cat.id, cat)
            }
          }
        }

        // Se a página veio com menos itens que o solicitado (100), provavelmente é a última página
        if (listaRaw.length < 100) break
      }
    } catch (e) {
      console.warn(`[categorias] erro em ${endpoint}:`, e)
    }
  }

  const resultadoFinal = Array.from(todasCategoriasEncontradas.values())
  console.log(`[categorias] Total carregado: ${resultadoFinal.length}`)
  return resultadoFinal
}

// ─── Listar / Criar Contato ───────────────────────────────────────────────────

export async function buscarOuCriarContato(
  accessToken: string,
  nome: string
): Promise<string | undefined> {
  try {
    // Buscar contato por nome
    const busca = await fetch(
      `${BASE_URL}/contatos?nome=${encodeURIComponent(nome)}&page=0&size=50`,
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
    
    const errText = await criar.text()
    throw new Error(`Erro ao criar contato '${nome}': ${criar.status} - ${errText}`)
  } catch (e: any) {
    console.error(`[buscarOuCriarContato] erro:`, e)
    throw e
  }
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
