import { EmpresaProvider } from '@/contexts/EmpresaContext'
import { SidebarProvider } from '@/contexts/SidebarContext'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import AuthGuard from '@/components/AuthGuard'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <EmpresaProvider>
        <SidebarProvider>
          <div className="flex h-screen bg-slate-50 dark:bg-dark-950 text-slate-800 dark:text-slate-100 transition-colors duration-200 overflow-hidden">
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
              <Header />
              <main className="flex-1 overflow-y-auto p-3.5 sm:p-5 lg:p-6 relative custom-scrollbar">
                {children}
                {/* Watermark dev — sutil, canto inferior direito */}
                <span className="fixed bottom-3 right-4 text-[9px] text-dark-800 select-none pointer-events-none z-0">
                  dev: AH Cardoso
                </span>
              </main>
            </div>
          </div>
        </SidebarProvider>
      </EmpresaProvider>
    </AuthGuard>
  )
}
