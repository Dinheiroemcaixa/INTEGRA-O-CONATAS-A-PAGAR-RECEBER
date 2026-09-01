import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    { error: 'O espelhamento de conexões foi descontinuado. Por favor, conecte cada empresa diretamente via OAuth.' },
    { status: 400 }
  )
}
