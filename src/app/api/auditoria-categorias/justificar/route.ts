import { NextRequest, NextResponse } from 'next/server'
import { salvarJustificativaDivergencia, StatusJustificativa } from '@/lib/auditoria-categorias/servico'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STATUS_VALIDOS: StatusJustificativa[] = ['PENDENTE', 'JUSTIFICADA', 'CORRIGIDA']

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      empresa_id,
      conta_azul_id,
      fornecedor_nome,
      categoria_original,
      categoria_sugerida,
      status_divergencia,
      motivo_justificativa,
      usuario_email
    } = body

    // 1. Validacao de campos obrigatorios
    if (!empresa_id || typeof empresa_id !== 'string') {
      return NextResponse.json(
        { error: 'O campo empresa_id e obrigatorio e deve ser uma string.' },
        { status: 400 }
      )
    }

    if (!conta_azul_id || typeof conta_azul_id !== 'string') {
      return NextResponse.json(
        { error: 'O campo conta_azul_id e obrigatorio e deve ser uma string.' },
        { status: 400 }
      )
    }

    if (!status_divergencia || !STATUS_VALIDOS.includes(status_divergencia)) {
      return NextResponse.json(
        { error: 'O campo status_divergencia deve ser PENDENTE, JUSTIFICADA ou CORRIGIDA.' },
        { status: 400 }
      )
    }

    if (!fornecedor_nome || typeof fornecedor_nome !== 'string') {
      return NextResponse.json(
        { error: 'O campo fornecedor_nome e obrigatorio.' },
        { status: 400 }
      )
    }

    if (!categoria_original || typeof categoria_original !== 'string') {
      return NextResponse.json(
        { error: 'O campo categoria_original e obrigatorio.' },
        { status: 400 }
      )
    }

    // 2. Execucao de persistencia controlada no Supabase
    const registro = await salvarJustificativaDivergencia({
      empresaId: empresa_id.trim(),
      contaAzulId: conta_azul_id.trim(),
      fornecedorNome: fornecedor_nome.trim(),
      categoriaOriginal: categoria_original.trim(),
      categoriaSugerida: categoria_sugerida ? categoria_sugerida.trim() : null,
      statusDivergencia: status_divergencia as StatusJustificativa,
      motivoJustificativa: motivo_justificativa ? String(motivo_justificativa).trim() : null,
      usuarioEmail: usuario_email ? String(usuario_email).trim() : null
    })

    return NextResponse.json({
      success: true,
      mensagem: 'Justificativa contábil gravada com sucesso.',
      dado: registro
    })
  } catch (error: any) {
    console.error('[API /api/auditoria-categorias/justificar] Erro:', error)
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao gravar justificativa contábil.' },
      { status: 500 }
    )
  }
}
