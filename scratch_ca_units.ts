import { createClient } from '@supabase/supabase-js'
import { refreshToken } from './src/lib/conta-azul/api'
import fs from 'fs'

const envRaw = fs.readFileSync('.env.local', 'utf8')
const env = envRaw.split('\n').reduce((acc, line) => {
  const [key, ...value] = line.split('=')
  if (key && value) acc[key.trim()] = value.join('=').trim()
  return acc
}, {} as Record<string, string>)

async function run() {
  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL!,
    env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: empresas } = await supabase.from('empresas').select('*')
  const empresa = empresas?.[0]
  
  if (!empresa) return console.log('Empresa nao encontrada')

  const access_token = await refreshToken(
    empresa.id,
    empresa.ca_access_token,
    empresa.ca_refresh_token,
    empresa.ca_token_expires_at
  )

  const urls = [
    'https://api.contaazul.com/v1/unidades-medida',
    'https://api.contaazul.com/v1/produtos/unidades-medida',
    'https://api.contaazul.com/produtos/unidades-medida',
    'https://api.contaazul.com/v1/produtos?tamanho_pagina=1'
  ]

  for (const url of urls) {
    console.log('Testando:', url)
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${access_token}` } })
    console.log(res.status, await res.text().catch(() => ''))
  }
}

run()
