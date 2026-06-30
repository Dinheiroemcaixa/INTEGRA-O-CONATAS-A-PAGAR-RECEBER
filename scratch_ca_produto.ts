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

  console.log('Buscando 1 produto para ver a estrutura...')
  const res = await fetch('https://api.contaazul.com/v1/produtos?tamanho_pagina=5', {
    headers: { 'Authorization': `Bearer ${access_token}` }
  })
  const data = await res.json()
  console.log(JSON.stringify(data.filter(p => p.unidade_medida)[0] || data[0], null, 2))
}

run()
