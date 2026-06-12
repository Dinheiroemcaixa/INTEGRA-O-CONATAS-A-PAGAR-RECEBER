import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { listarFornecedores, refreshToken as refreshCA } from '@/lib/conta-azul/api'
import { normalizarNome } from '@/lib/parsers/fornecedores-contaazul'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { empresa_id } = body

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
        const { error: errUpdate } = await supabaseAdmin
          .from('empresas')
          .update({
            access_token_conta_azul: novosTokens.access_token,
            refresh_token_conta_azul: novosTokens.refresh_token || empresa.refresh_token_conta_azul,
            data_expiracao_token: new Date(Date.now() + (novosTokens.expires_in || 3600) * 1000).toISOString(),
          })
          .eq('id', empresa_id)
          
        if (errUpdate) throw new Error(`Falha ao salvar novos tokens: ${errUpdate.message}`)
      } catch {
        return NextResponse.json({ error: 'Token expirado. Reconecte.' }, { status: 401 })
      }
    }

    const fornecedoresCA = await listarFornecedores(accessToken)

    if (fornecedoresCA.length === 0) {
      return NextResponse.json({ success: true, count: 0, message: 'Nenhum fornecedor encontrado no Conta Azul.' })
    }

    // Preparar os registros para o banco de dados
    const registros = fornecedoresCA.map((f) => ({
      empresa_id: empresa.id,
      nome: f.nome,
      cnpj: f.documento || null,
      categoria_padrao: null, // A API não traz categoria padrão aqui
      nome_normalizado: normalizarNome(f.nome),
    }))

    // Limpar os antigos
    await supabaseAdmin.from('fornecedores_contaazul').delete().eq('empresa_id', empresa.id)

    // Inserir os novos em lotes de 500
    for (let i = 0; i < registros.length; i += 500) {
      const lote = registros.slice(i, i + 500)
      const { error } = await supabaseAdmin.from('fornecedores_contaazul').insert(lote)
      if (error) {
        throw new Error(`Erro ao inserir lote: ${error.message}`)
      }
    }

    return NextResponse.json({ success: true, count: registros.length })
  } catch (err: any) {
    console.error('Erro sincronizar fornecedores:', err)
    return NextResponse.json({ error: err.message || 'Erro ao sincronizar fornecedores' }, { status: 500 })
  }
}
