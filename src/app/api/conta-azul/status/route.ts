import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  getValidToken,
  TokenError,
  ConnectionErrorCategory,
  isAccessTokenValid,
  decodeDistributedRefreshLock,
  isDistributedRefreshLockActive,
  isDistributedRefreshLockExpired,
} from '@/lib/conta-azul/token-manager'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface EmpresaConnectionStatus {
  empresa_id: string
  modulo: 'financeiro' | 'vendas'
  status: 'CONECTADA' | 'ATENCAO' | 'DESCONECTADA'
  conectado: boolean
  operacional: boolean
  renovado?: boolean
  expira_em?: string | null
  motivo?: string
  categoria_erro?: ConnectionErrorCategory
}

function sanitizePublicExpirationIso(rawExp: string | null | undefined): string | null {
  if (!rawExp || typeof rawExp !== 'string' || rawExp.trim().length === 0) return null
  if (decodeDistributedRefreshLock(rawExp) !== null) return null
  return rawExp
}

async function evaluateEmpresaStatus(
  id: string,
  modulo: 'financeiro' | 'vendas',
  empresaRow?: Record<string, any> | null,
  allowRefresh: boolean = true
): Promise<EmpresaConnectionStatus> {
  const isVendas = modulo === 'vendas'
  const tokenKey = isVendas ? 'access_token_conta_azul_vendas' : 'access_token_conta_azul'
  const refreshKey = isVendas ? 'refresh_token_conta_azul_vendas' : 'refresh_token_conta_azul'
  const expiracaoKey = isVendas ? 'data_expiracao_token_vendas' : 'data_expiracao_token'

  let row = empresaRow
  if (!row) {
    const { data, error } = await supabaseAdmin
      .from('empresas')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !data) {
      return {
        empresa_id: id,
        modulo,
        status: 'DESCONECTADA',
        conectado: false,
        operacional: false,
        motivo: 'Empresa não encontrada',
        categoria_erro: 'DISCONNECTED',
      }
    }
    row = data
  }

  const targetRow = row!
  const isConnectedFlag = targetRow[isVendas ? 'conta_azul_vendas_connected' : 'conta_azul_connected']
  const hasAccessToken = typeof targetRow[tokenKey] === 'string' && targetRow[tokenKey].trim().length > 0
  const hasRefreshToken = typeof targetRow[refreshKey] === 'string' && targetRow[refreshKey].trim().length > 0

  if (isConnectedFlag === false || (!hasAccessToken && !hasRefreshToken)) {
    return {
      empresa_id: id,
      modulo,
      status: 'DESCONECTADA',
      conectado: false,
      operacional: false,
      motivo: 'Empresa desconectada ou sem credenciais OAuth salvas.',
      categoria_erro: 'DISCONNECTED',
    }
  }

  if (!allowRefresh) {
    if (isDistributedRefreshLockActive(targetRow[expiracaoKey])) {
      return {
        empresa_id: id,
        modulo,
        status: 'ATENCAO',
        conectado: true,
        operacional: true,
        renovado: false,
        expira_em: null,
        motivo: 'Renovação automática de token em andamento.',
      }
    }

    if (isDistributedRefreshLockExpired(targetRow[expiracaoKey])) {
      if (hasRefreshToken) {
        return {
          empresa_id: id,
          modulo,
          status: 'ATENCAO',
          conectado: true,
          operacional: false,
          renovado: false,
          expira_em: null,
          motivo: 'Bloqueio de renovação anterior expirou; aguardando renovação automática.',
        }
      }
      return {
        empresa_id: id,
        modulo,
        status: 'DESCONECTADA',
        conectado: false,
        operacional: false,
        expira_em: null,
        motivo: 'Sessão expirada sem refresh_token.',
        categoria_erro: 'DISCONNECTED',
      }
    }

    if (isAccessTokenValid(targetRow, tokenKey, expiracaoKey)) {
      return {
        empresa_id: id,
        modulo,
        status: 'CONECTADA',
        conectado: true,
        operacional: true,
        renovado: false,
        expira_em: sanitizePublicExpirationIso(targetRow[expiracaoKey]),
      }
    }

    if (hasRefreshToken) {
      return {
        empresa_id: id,
        modulo,
        status: 'ATENCAO',
        conectado: true,
        operacional: true,
        renovado: false,
        expira_em: sanitizePublicExpirationIso(targetRow[expiracaoKey]),
        motivo: 'Token próximo de expirar ou aguardando renovação automática.',
      }
    }

    return {
      empresa_id: id,
      modulo,
      status: 'DESCONECTADA',
      conectado: false,
      operacional: false,
      expira_em: null,
      motivo: 'Sessão expirada sem refresh_token.',
      categoria_erro: 'DISCONNECTED',
    }
  }

  try {
    const result = await getValidToken(id, modulo)
    return {
      empresa_id: id,
      modulo,
      status: 'CONECTADA',
      conectado: true,
      operacional: true,
      renovado: Boolean(hasAccessToken && result.accessToken !== targetRow[tokenKey]),
      expira_em: sanitizePublicExpirationIso(result.empresa?.[expiracaoKey] ?? targetRow[expiracaoKey]),
    }
  } catch (err: any) {
    if (err instanceof TokenError) {
      if (err.statusCode === 401) {
        return {
          empresa_id: id,
          modulo,
          status: 'DESCONECTADA',
          conectado: false,
          operacional: false,
          motivo: err.message,
          categoria_erro: err.category,
        }
      }
      return {
        empresa_id: id,
        modulo,
        status: 'ATENCAO',
        conectado: true,
        operacional: false,
        motivo: err.message,
        categoria_erro: err.category,
      }
    }

    return {
      empresa_id: id,
      modulo,
      status: 'ATENCAO',
      conectado: true,
      operacional: false,
      motivo: err?.message || 'Erro inesperado ao verificar status da conexão.',
      categoria_erro: 'TRANSIENT_ERROR',
    }
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const rawModulo = searchParams.get('modulo')
  const modulo: 'financeiro' | 'vendas' = rawModulo === 'vendas' ? 'vendas' : 'financeiro'
  const renovarParam = searchParams.get('renovar')
  const empresaAtivaId = searchParams.get('empresa_ativa_id')?.trim() || ''

  const singleId = searchParams.get('empresa_id')?.trim() || ''
  const multiIdsRaw = searchParams.get('empresa_ids')?.trim() || ''

  const ids = Array.from(
    new Set(
      [
        ...(singleId ? [singleId] : []),
        ...(multiIdsRaw ? multiIdsRaw.split(',').map((s) => s.trim()).filter(Boolean) : []),
      ]
    )
  )

  if (ids.length === 0) {
    return NextResponse.json(
      { error: 'Informe empresa_id ou empresa_ids na query string.' },
      { status: 400 }
    )
  }

  const { data: rows } = await supabaseAdmin
    .from('empresas')
    .select('*')
    .in('id', ids)

  const rowsById = new Map<string, Record<string, any>>()
  if (Array.isArray(rows)) {
    for (const r of rows) {
      if (r && r.id) rowsById.set(r.id, r)
    }
  }

  const statuses: Record<string, EmpresaConnectionStatus> = {}
  const lista: EmpresaConnectionStatus[] = []

  // Processa sequencialmente ou em lote controlado para evitar Thundering Herd
  for (const id of ids) {
    const shouldRefresh =
      renovarParam === 'true'
        ? true
        : renovarParam === 'false'
          ? false
          : ids.length === 1 || id === empresaAtivaId
    const itemStatus = await evaluateEmpresaStatus(id, modulo, rowsById.get(id), shouldRefresh)
    statuses[id] = itemStatus
    lista.push(itemStatus)
  }

  if (singleId && !multiIdsRaw && ids.length === 1) {
    return NextResponse.json({
      ...statuses[singleId],
      statuses,
      empresas: lista,
    })
  }

  return NextResponse.json({
    modulo,
    statuses,
    empresas: lista,
  })
}
