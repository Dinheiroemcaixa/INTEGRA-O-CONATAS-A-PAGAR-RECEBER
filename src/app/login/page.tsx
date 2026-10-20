import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import LoginPageClient from './LoginPageClient'

export const metadata = {
  title: 'Entrar | DCX LINK',
  description: 'Acesse sua conta no DCX LINK — O elo entre seus sistemas para gestão financeira, conciliação e automação fiscal.',
}

export default async function LoginPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    redirect('/dashboard')
  }

  return <LoginPageClient />
}
