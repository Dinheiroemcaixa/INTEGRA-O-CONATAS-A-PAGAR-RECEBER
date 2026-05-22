import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { listarContasFinanceiras, refreshToken as refreshCA } from '@/lib/conta-azul/api'

export const runtime = 'nodejs'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const empresa_id = searchParams.get('empresa_id')

  if (!empresa_id) {
    return NextResponse.json({ error: 'empresa_id obrigatório' }, { status: 400 })
  }

  const { data: empresa, error: errEmp } = await supabaseAdmin
    .from('empresas')
    .select('*')
    .eq('id', empresa_id)
    .single()

  if (errEmp || !empresa) {
    return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 })
  }

  if (!empresa.access_token_conta_azul) {
    return NextResponse.json({ error: 'Empresa sem token CA' }, { status: 401 })
  }

  let accessToken = empresa.access_token_conta_azul
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
      await supabaseAdmin
        .from('empresas')
        .update({
          access_token_conta_azul: novosTokens.access_token,
          refresh_token_conta_azul: novosTokens.refresh_token,
          data_expiracao_token: new Date(Date.now() + novosTokens.expires_in * 1000).toISOString(),
        })
        .eq('id', empresa_id)
    } catch {
      return NextResponse.json({ error: 'Token expirado. Reconecte.' }, { status: 401 })
    }
  }

  try {
    const contas = await listarContasFinanceiras(accessToken)
    return NextResponse.json({ contas })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erro ao buscar contas' }, { status: 500 })
  }
}
