import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { listarFornecedores } from '@/lib/conta-azul/api'
import { getValidToken, TokenError } from '@/lib/conta-azul/token-manager'
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

    // Obter token válido (com renovação automática)
    let accessToken: string
    let empresa: Record<string, any>
    try {
      const result = await getValidToken(empresa_id)
      accessToken = result.accessToken
      empresa = result.empresa
    } catch (e) {
      if (e instanceof TokenError) {
        return NextResponse.json({ error: e.message }, { status: e.statusCode })
      }
      throw e
    }

    const fornecedoresCA = await listarFornecedores(accessToken)

    if (fornecedoresCA.length === 0) {
      return NextResponse.json({ success: true, count: 0, message: 'Nenhum fornecedor encontrado no Conta Azul.' })
    }

    // ======================================================================
    // IMPORTANTE: Preservar as categorias personalizadas salvas pelo usuário.
    // Antes de apagar, criamos um mapa de nome_normalizado → categoria_padrao.
    // Assim, ao reinserir, as preferências do usuário são mantidas.
    // ======================================================================
    const { data: existentes } = await supabaseAdmin
      .from('fornecedores_contaazul')
      .select('nome_normalizado, categoria_padrao')
      .eq('empresa_id', empresa.id)
      .not('categoria_padrao', 'is', null)

    const categoriasSalvas = new Map<string, string>()
    if (existentes) {
      for (const f of existentes) {
        if (f.nome_normalizado && f.categoria_padrao) {
          categoriasSalvas.set(f.nome_normalizado, f.categoria_padrao)
        }
      }
    }

    // Preparar os registros para o banco de dados, restaurando categoria salva
    const registros = fornecedoresCA.map((f) => {
      const nomeNorm = normalizarNome(f.nome)
      const categoriaPreservada = categoriasSalvas.get(nomeNorm) || null
      return {
        empresa_id: empresa.id,
        nome: f.nome,
        cnpj: f.documento || null,
        categoria_padrao: categoriaPreservada, // ← restaura a categoria que o usuário salvou
        nome_normalizado: nomeNorm,
      }
    })

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

    return NextResponse.json({ 
      success: true, 
      count: registros.length,
      categoriasPreservadas: categoriasSalvas.size
    })
  } catch (err: any) {
    console.error('Erro sincronizar fornecedores:', err)
    return NextResponse.json({ error: err.message || 'Erro ao sincronizar fornecedores' }, { status: 500 })
  }
}
