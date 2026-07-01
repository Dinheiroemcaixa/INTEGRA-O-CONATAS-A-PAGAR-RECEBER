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

export async function GET(req: NextRequest) {
  try {
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
    const ts = Date.now()

    // perfis é []models.PersonProfilesCreate — array de objetos
    // Testar diferentes formatos do objeto interno
    const payloads = [
      {
        label: 'TESTE_RESPOSTA_CRIACAO',
        body: { nome: `TESTE_RESPOSTA_${ts}`, tipo_pessoa: 'Física', perfis: [{ tipo_perfil: 'Cliente' }], ativo: true }
      }
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
        if (res.ok && (resJson?.id || resJson?.uuid)) idsParaDeletar.push(resJson.id || resJson.uuid)
        resultados.push({ teste: label, status: res.status, SUCESSO: res.ok, body_enviado: body, resposta_json: resJson, resposta_texto: resText })
      } catch (e: any) {
        resultados.push({ teste: label, SUCESSO: false, erro: e.message })
      }
    }

    for (const id of idsParaDeletar) {
      try { await fetch(`${CA_BASE}/pessoas/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${accessToken}` } }) } catch {}
    }

    return NextResponse.json({ empresa: empresa.nome, total_testes: resultados.length, resultados, ids_deletados: idsParaDeletar })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
