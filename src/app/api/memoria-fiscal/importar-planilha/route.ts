import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Tabela de correspondência padrão NCM -> CEST se a planilha não trouxer o CEST
function sugerirCestPorNcm(ncmStr: string): string {
  const limpo = ncmStr.replace(/\D/g, '').trim()
  if (!limpo) return ''
  const cap4 = limpo.slice(0, 4)
  const mapa: Record<string, string> = {
    '4011': '1600100', // Pneus novos
    '4012': '1600100', // Pneus recauchutados
    '4013': '1600200', // Câmaras de ar
    '8708': '0107500', // Partes e acessórios de veículos
    '8421': '0101700', // Filtros
    '8413': '0103200', // Bombas
    '6813': '0100700', // Pastilhas e guarnições de fricção
    '8482': '0102500', // Rolamentos
    '8483': '0102600', // Árvores de transmissão
    '8511': '0104300', // Velas e bobinas de ignição
    '8512': '0104700', // Aparelhos de iluminação/sinalização
    '7320': '0101100', // Molas e folhas de molas
    '7326': '1006200', // Abraçadeiras e outras obras de ferro/aço
    '4016': '0100900', // Coxins e juntas de borracha vulcanizada
    '4010': '0100600', // Correias de transmissão
    '8544': '0107300', // Cabos elétricos
    '3917': '0100200', // Tubos e mangueiras plásticas
    '3926': '1002000', // Outras obras de plástico
    '3208': '2400100', // Tintas e vernizes
    '2710': '0600100', // Óleos lubrificantes
    '3819': '0600400', // Fluidos para freios hidráulicos
    '3820': '0600500', // Fluidos anticongelantes/radiador
    '3824': '1600100', // Graxas e outros
  }
  return mapa[cap4] || ''
}

/**
 * Importa uma planilha Excel do fiscal contendo Descrição, NCM e CEST.
 * Extrai a primeira palavra da descrição como "palavra-chave" (família do produto)
 * e salva na tabela memoria_fiscal_familia.
 * 
 * Também salva cada produto individual na tabela memoria_fiscal (pelo código, se presente).
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const empresa_id = formData.get('empresa_id') as string | null

    if (!file || !empresa_id) {
      return NextResponse.json(
        { error: 'Arquivo e empresa_id são obrigatórios' },
        { status: 400 }
      )
    }

    // Ler o arquivo Excel
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'Planilha vazia ou sem dados válidos' },
        { status: 400 }
      )
    }

    // Detectar nomes das colunas flexíveis
    const primeiraLinha = rows[0]
    const colunas = Object.keys(primeiraLinha)
    
    const findCol = (termos: string[]) => {
      return colunas.find(col => {
        const norm = col.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
        return termos.some(t => norm.includes(t))
      })
    }

    const colDescricao = findCol(['DESCRICAO', 'PRODUTO', 'ITEM', 'DESC', 'NOME', 'ESPECIFICACAO'])
    const colNCM = findCol(['NCM', 'CLASSIFICACAO', 'FISCAL', 'COD NCM'])
    const colCEST = findCol(['CEST', 'COD CEST'])
    const colCodigo = findCol(['CODIGO', 'COD', 'REF', 'REFERENCIA'])

    if (!colDescricao && !colNCM) {
      return NextResponse.json(
        { error: 'Não encontrei as colunas DESCRIÇÃO e NCM na planilha. Verifique o cabeçalho.' },
        { status: 400 }
      )
    }

    let salvos = 0
    let erros = 0
    let ignorados = 0

    // Mapa para evitar duplicatas de família
    const familiasProcessadas = new Map<string, { ncm: string; cest: string }>()

    for (const row of rows) {
      const descricao = String(row[colDescricao!] || '').trim()
      const ncmRaw = String(row[colNCM!] || '').trim()
      let cestRaw = colCEST ? String(row[colCEST] || '').trim() : ''
      const codigoRaw = colCodigo ? String(row[colCodigo] || '').trim() : ''

      // Limpar NCM e CEST para conter somente dígitos
      const ncm = ncmRaw.replace(/\D/g, '')
      let cest = cestRaw.replace(/\D/g, '')

      // Se não veio CEST na planilha, deduz pelo NCM padrão
      if (ncm && !cest) {
        cest = sugerirCestPorNcm(ncm)
      }

      if (!descricao || !ncm) {
        ignorados++
        continue
      }

      // Normalizar termos
      const descLimpa = descricao.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
      const palavras = descLimpa.split(/[\s/,;()-]+/).filter(Boolean)
      const primeiraPalavra = palavras[0]
      const descricaoCompleta = descLimpa.replace(/\s+/g, ' ').trim()

      if (!primeiraPalavra || primeiraPalavra.length < 2) {
        ignorados++
        continue
      }

      // Guardar a descrição completa
      if (!familiasProcessadas.has(descricaoCompleta) || (cest && !familiasProcessadas.get(descricaoCompleta)?.cest)) {
        familiasProcessadas.set(descricaoCompleta, { ncm, cest })
      }

      // Guardar a primeira palavra como família
      if (!familiasProcessadas.has(primeiraPalavra) || (cest && !familiasProcessadas.get(primeiraPalavra)?.cest)) {
        familiasProcessadas.set(primeiraPalavra, { ncm, cest })
      }

      // Se tiver mais de uma palavra, guardar também o prefixo de 2 palavras (ex: PASTILHA FREIO, FILTRO OLEO)
      if (palavras.length >= 2) {
        const prefixo2 = `${palavras[0]} ${palavras[1]}`
        if (!familiasProcessadas.has(prefixo2) || (cest && !familiasProcessadas.get(prefixo2)?.cest)) {
          familiasProcessadas.set(prefixo2, { ncm, cest })
        }
      }

      // Se tiver código, salva também na memoria_fiscal (por código exato)
      if (codigoRaw) {
        try {
          const { error } = await supabaseAdmin
            .from('memoria_fiscal')
            .upsert({
              empresa_id,
              codigo: codigoRaw.toUpperCase().trim(),
              descricao,
              ncm: ncm || null,
              cest: cest || null,
              origem: '0 - Nacional',
              tipo_produto: '00 - Merc. para Revenda',
              unidade_medida: 'UN',
              updated_at: new Date().toISOString(),
            }, {
              onConflict: 'empresa_id,codigo'
            })
          if (error) {
            console.warn(`[importar-planilha] Erro ao salvar código ${codigoRaw}:`, error)
          }
        } catch (e) {
          console.warn(`[importar-planilha] Erro ao salvar código ${codigoRaw}:`, e)
        }
      }
    }

    // Salvar todas as famílias identificadas
    for (const [palavraChave, dados] of familiasProcessadas.entries()) {
      try {
        const { error } = await supabaseAdmin
          .from('memoria_fiscal_familia')
          .upsert({
            empresa_id,
            palavra_chave: palavraChave,
            ncm: dados.ncm || null,
            cest: dados.cest || null,
            tipo_produto: '00 - Merc. para Revenda',
            origem: '0 - Nacional',
            unidade_medida: 'UN',
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'empresa_id,palavra_chave'
          })

        if (error) {
          console.error(`[importar-planilha] Erro ao salvar família ${palavraChave}:`, error)
          erros++
        } else {
          salvos++
        }
      } catch (e) {
        console.error(`[importar-planilha] Erro ao salvar família ${palavraChave}:`, e)
        erros++
      }
    }

    return NextResponse.json({
      salvos,
      erros,
      ignorados,
      totalLinhas: rows.length,
      familiasEncontradas: familiasProcessadas.size,
      exemplos: Array.from(familiasProcessadas.entries()).slice(0, 10).map(
        ([chave, dados]) => `${chave} → NCM: ${dados.ncm}${dados.cest ? `, CEST: ${dados.cest}` : ''}`
      )
    })
  } catch (err: unknown) {
    console.error('[importar-planilha] Erro:', err)
    const msg = err instanceof Error ? err.message : 'Erro interno ao processar planilha'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
