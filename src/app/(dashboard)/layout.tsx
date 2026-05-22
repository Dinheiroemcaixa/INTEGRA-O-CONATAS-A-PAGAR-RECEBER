import { EmpresaProvider } from '@/contexts/EmpresaContext'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import AuthGuard from '@/components/AuthGuard'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthGuard>
      <EmpresaProvider>
        <div className="flex h-screen bg-dark-950 overflow-hidden">
          <Sidebar />
          <div className="flex-1 flex flex-col overflow-hidden">
            <Header />
            <main className="flex-1 overflow-y-auto p-6">
              {children}
            </main>
          </div>
        </div>
      </EmpresaProvider>
    </AuthGuard>
  )
}
