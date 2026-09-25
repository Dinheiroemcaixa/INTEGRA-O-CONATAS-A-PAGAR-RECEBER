import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import LoginPageClient from './LoginPageClient'

export const metadata = {
  title: 'Entrar | Connecta AI',
  description: 'Acesse a plataforma Connecta AI para gestão financeira, integração Datacar, Conta Azul e emissão de notas fiscais.',
}

export default async function LoginPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    redirect('/dashboard')
  }

  return <LoginPageClient />
}
