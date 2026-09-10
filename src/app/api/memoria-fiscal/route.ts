import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Tabela de correspondência padrão NCM -> CEST
function sugerirCestPorNcm(ncmStr: string): string {
  const limpo = ncmStr.replace(/\D/g, '').trim()
  if (!limpo) return ''
  const cap4 = limpo.slice(0, 4)
  const mapa: Record<string, string> = {
    '4011': '1600100', '4012': '1600100', '4013': '1600200', '8708': '0107500',
    '8421': '0101700', '8413': '0103200', '6813': '0100700', '8482': '0102500',
    '8483': '0102600', '8511': '0104300', '8512': '0104700', '7320': '0101100',
    '7326': '1006200', '4016': '0100900', '4010': '0100600', '8544': '0107300',
    '3917': '0100200', '3926': '1002000', '3208': '2400100', '2710': '0600100',
    '3819': '0600400', '3820': '0600500', '3824': '1600100',
  }
  return mapa[cap4] || ''
}

/**
 * Salva/atualiza a Memória Fiscal dos produtos de uma venda.
 * Persiste tanto por código quanto por família/descrição para aprendizado contínuo.
 */
export async function POST(req: NextRequest) {
  try {
    const { empresa_id, itens } = await req.json()

    if (!empresa_id || !itens || !Array.isArray(itens)) {
      return NextResponse.json({ error: 'empresa_id e itens são obrigatórios' }, { status: 400 })
    }

    let salvos = 0
    let erros = 0

    for (const item of itens) {
      const codigo = String(item.codigo || '').toUpperCase().trim()
      const descricao = String(item.descricao || '').trim()
      const ncm = item.ncm ? String(item.ncm).replace(/\D/g, '') : null
      let cest = item.cest ? String(item.cest).replace(/\D/g, '') : null

      if (ncm && !cest) {
        cest = sugerirCestPorNcm(ncm) || null
      }

      // Só salva se tem pelo menos um dado fiscal preenchido
      const temDadoFiscal = ncm || cest || item.tipo_produto || item.origem || item.unidade_medida
      if (!temDadoFiscal) continue

      // 1. Salva por código exato (se houver código)
      if (codigo) {
        try {
          const { error } = await supabaseAdmin
            .from('memoria_fiscal')
            .upsert({
              empresa_id,
              codigo,
              descricao: descricao || null,
              ncm,
              cest,
              tipo_produto: item.tipo_produto || '00 - Merc. para Revenda',
              origem: item.origem || '0 - Nacional',
              unidade_medida: item.unidade_medida || 'UN',
              updated_at: new Date().toISOString(),
            }, {
              onConflict: 'empresa_id,codigo'
            })

          if (error) {
            console.error(`[memoria-fiscal] Erro ao salvar código ${codigo}:`, error)
            erros++
          } else {
            salvos++
          }
        } catch {
          erros++
        }
      }

      // 2. Salva também por família e descrição completa para aprendizado inteligente
      if (descricao && ncm) {
        const descNorm = descricao.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
        const palavras = descNorm.split(/[\s/,;()-]+/).filter(Boolean)
        const primeiraPalavra = palavras[0]

        const chavesParaSalvar = [descNorm]
        if (primeiraPalavra && primeiraPalavra.length >= 2) {
          chavesParaSalvar.push(primeiraPalavra)
        }
        if (palavras.length >= 2) {
          chavesParaSalvar.push(`${palavras[0]} ${palavras[1]}`)
        }

        for (const palavraChave of chavesParaSalvar) {
          try {
            await supabaseAdmin
              .from('memoria_fiscal_familia')
              .upsert({
                empresa_id,
                palavra_chave: palavraChave,
                ncm,
                cest,
                tipo_produto: item.tipo_produto || '00 - Merc. para Revenda',
                origem: item.origem || '0 - Nacional',
                unidade_medida: item.unidade_medida || 'UN',
                updated_at: new Date().toISOString(),
              }, {
                onConflict: 'empresa_id,palavra_chave'
              })
          } catch {}
        }
      }
    }

    return NextResponse.json({ salvos, erros })
  } catch (err: unknown) {
    console.error('[memoria-fiscal] Erro:', err)
    const msg = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * Busca a Memória Fiscal para uma lista de produtos.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const empresa_id = searchParams.get('empresa_id')
    const codigos = searchParams.get('codigos')

    if (!empresa_id) {
      return NextResponse.json({ error: 'empresa_id é obrigatório' }, { status: 400 })
    }

    const mapaExata: Record<string, any> = {}
    const mapaFamilia: Record<string, any> = {}

    // 1. Carrega dados de fallback da base geral
    const { data: todasFamilias } = await supabaseAdmin
      .from('memoria_fiscal_familia')
      .select('*')
      .limit(3000)

    if (todasFamilias) {
      for (const item of todasFamilias) {
        mapaFamilia[item.palavra_chave.toUpperCase().trim()] = item
      }
    }

    if (codigos) {
      const listaCodigos = codigos.split(',').map(c => c.trim().toUpperCase()).filter(Boolean)
      if (listaCodigos.length > 0) {
        const { data: todosCodigos } = await supabaseAdmin
          .from('memoria_fiscal')
          .select('*')
          .in('codigo', listaCodigos)

        if (todosCodigos) {
          for (const item of todosCodigos) {
            mapaExata[item.codigo.toUpperCase().trim()] = item
          }
        }
      }
    }

    // 2. Sobrescreve com dados específicos da empresa atual (prioridade)
    const { data: dataFamiliaEmpresa } = await supabaseAdmin
      .from('memoria_fiscal_familia')
      .select('*')
      .eq('empresa_id', empresa_id)

    if (dataFamiliaEmpresa) {
      for (const item of dataFamiliaEmpresa) {
        mapaFamilia[item.palavra_chave.toUpperCase().trim()] = item
      }
    }

    if (codigos) {
      const listaCodigos = codigos.split(',').map(c => c.trim().toUpperCase()).filter(Boolean)
      if (listaCodigos.length > 0) {
        const { data: dataExataEmpresa } = await supabaseAdmin
          .from('memoria_fiscal')
          .select('*')
          .eq('empresa_id', empresa_id)
          .in('codigo', listaCodigos)

        if (dataExataEmpresa) {
          for (const item of dataExataEmpresa) {
            mapaExata[item.codigo.toUpperCase().trim()] = item
          }
        }
      }
    }

    return NextResponse.json({ memoria: mapaExata, memoria_familia: mapaFamilia })
  } catch (err: unknown) {
    console.error('[memoria-fiscal] Erro:', err)
    const msg = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
