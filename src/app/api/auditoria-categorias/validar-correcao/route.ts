import { NextRequest, NextResponse } from 'next/server'
import { validarCorrecaoContaAzul } from '@/lib/auditoria-categorias/servico'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { empresa_id, conta_azul_id, usuario_email } = body

    if (!empresa_id || typeof empresa_id !== 'string') {
      return NextResponse.json(
        { error: 'O campo empresa_id é obrigatório e deve ser uma string.' },
        { status: 400 }
      )
    }

    if (!conta_azul_id || typeof conta_azul_id !== 'string') {
      return NextResponse.json(
        { error: 'O campo conta_azul_id é obrigatório e deve ser uma string.' },
        { status: 400 }
      )
    }

    const resultado = await validarCorrecaoContaAzul({
      empresaId: empresa_id.trim(),
      contaAzulId: conta_azul_id.trim(),
      usuarioEmail: usuario_email ? String(usuario_email).trim() : null
    })

    return NextResponse.json(resultado)
  } catch (error: any) {
    console.error('[API /api/auditoria-categorias/validar-correcao] Erro:', error)
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao validar correção no Conta Azul.' },
      { status: 500 }
    )
  }
}
