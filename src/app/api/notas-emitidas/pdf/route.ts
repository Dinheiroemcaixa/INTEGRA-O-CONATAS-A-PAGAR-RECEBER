import { NextRequest, NextResponse } from 'next/server'
import { GET as getDanfe } from '../danfe/route'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return getDanfe(req)
}
