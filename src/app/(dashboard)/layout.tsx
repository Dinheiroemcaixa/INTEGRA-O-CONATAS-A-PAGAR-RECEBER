import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { EmpresaProvider } from '@/contexts/EmpresaContext'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <EmpresaProvider>
      <div className="flex h-screen bg-dark-950 overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header user={user} />
          <main className="flex-1 overflow-y-auto p-6">
            {children}
          </main>
        </div>
      </div>
    </EmpresaProvider>
  )
}
