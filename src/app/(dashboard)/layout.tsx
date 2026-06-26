import { EmpresaProvider } from '@/contexts/EmpresaContext'
import { AppConfigProvider } from '@/contexts/AppConfigContext'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import AuthGuard from '@/components/AuthGuard'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <AppConfigProvider>
        <EmpresaProvider>
          <div className="flex h-screen bg-dark-950 overflow-hidden">
            <Sidebar />
            <div className="flex-1 flex flex-col overflow-hidden">
              <Header />
              <main className="flex-1 overflow-y-auto p-6 relative">
                {children}
                {/* Connecta AI — canto inferior esquerdo */}
                <div className="fixed bottom-4 left-6 z-10 flex items-center gap-2 pointer-events-none select-none">
                  <div className="w-5 h-5 bg-brand-600 rounded-md flex items-center justify-center shadow-sm">
                    <span className="text-white font-black text-[10px]">$</span>
                  </div>
                  <span className="text-white/40 text-xs font-semibold tracking-wide">Connecta AI</span>
                </div>
                {/* Watermark dev — sutil, canto inferior direito */}
                <span className="fixed bottom-3 right-4 text-[9px] text-dark-800 select-none pointer-events-none z-0">
                  dev: AH Cardoso
                </span>
              </main>
            </div>
          </div>
        </EmpresaProvider>
      </AppConfigProvider>
    </AuthGuard>
  )
}
