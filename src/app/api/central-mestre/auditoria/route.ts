import { NextRequest, NextResponse } from 'next/server'
import { validarSessaoMaster } from '@/lib/auth/validar-master'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const check = await validarSessaoMaster()
  if (!check.autorizado) return check.responseError!

  const admin = createAdminClient()

  try {
    const { searchParams } = new URL(req.url)
    const limit = parseInt(searchParams.get('limit') || '100', 10)

    const { data: logs, error } = await admin
      .from('auditoria_usuarios_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      sucesso: true,
      logs: logs || [],
      total: logs?.length || 0,
    })
  } catch (err: any) {
    return NextResponse.json({ error: 'Erro ao buscar logs de auditoria: ' + err.message }, { status: 500 })
  }
}
