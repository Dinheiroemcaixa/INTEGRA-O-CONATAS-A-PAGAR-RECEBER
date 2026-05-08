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
        multa?: number
        juros?: number
        valor_liquido?: number
        desconto?: number
        taxa?: number
      }
    }>
  }
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
  // Nova API usa Basic Auth com client_id:client_secret em Base64
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
    const mensagem = `HTTP_${res.status}__ENDPOINT:${BASE_URL}/financeiro/eventos-financeiros/contas-a-pagar__PAYLOAD:${JSON.stringify(payload)}__RESPONSE:${errBody}`
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
