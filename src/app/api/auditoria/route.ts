import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  executarConsistencia,
  executarSemelhantes,
  executarDuplicidades,
  executarHistorico
} from '@/lib/auditoria'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      modulo,
      empresa_id,
      periodo,
      marco_zero,
      confianca_minima,
      amostra_minima,
      limiar_similaridade,
      tolerancia_dias
    } = body

    if (!empresa_id) {
      return NextResponse.json(
        { error: 'Parâmetro obrigatório ausente: empresa_id' },
        { status: 400 }
      )
    }

    if (!modulo) {
      return NextResponse.json(
        { error: 'Parâmetro obrigatório ausente: modulo ("consistencia" | "semelhantes" | "duplicidades" | "historico")' },
        { status: 400 }
      )
    }

    switch (modulo) {
      case 'consistencia': {
        const resultado = await executarConsistencia(supabaseAdmin, {
          empresa_id,
          periodo,
          marco_zero,
          confianca_minima: confianca_minima ? Number(confianca_minima) : 80,
          amostra_minima: amostra_minima ? Number(amostra_minima) : 3
        })
        return NextResponse.json({ success: true, modulo, ...resultado })
      }

      case 'semelhantes': {
        const resultado = await executarSemelhantes(supabaseAdmin, {
          empresa_id,
          limiar_similaridade: limiar_similaridade ? Number(limiar_similaridade) : 85
        })
        return NextResponse.json({ success: true, modulo, ...resultado })
      }

      case 'duplicidades': {
        const resultado = await executarDuplicidades(supabaseAdmin, {
          empresa_id,
          periodo,
          tolerancia_dias: tolerancia_dias ? Number(tolerancia_dias) : 3
        })
        return NextResponse.json({ success: true, modulo, ...resultado })
      }

      case 'historico': {
        const resultado = await executarHistorico(supabaseAdmin, {
          empresa_id
        })
        return NextResponse.json({ success: true, modulo, ...resultado })
      }

      default:
        return NextResponse.json(
          {
            error: `Módulo inválido: "${modulo}". Opções válidas: consistencia, semelhantes, duplicidades, historico.`
          },
          { status: 400 }
        )
    }
  } catch (err: any) {
    console.error('Erro na rota POST /api/auditoria:', err)
    return NextResponse.json(
      { error: err.message || 'Erro interno ao processar auditoria' },
      { status: 500 }
    )
  }
}
