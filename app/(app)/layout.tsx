import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getGlobalFilter } from '@/lib/global-filter'
import { listCompanies } from '@/features/companies/queries'
import { todayLocal } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Sidebar } from './Sidebar'
import { ResizableSidebar } from './ResizableSidebar'
import { GlobalFilterBar } from '@/components/shared/GlobalFilterBar'
import { ChatWidgetLazy } from '@/components/chat/ChatWidgetLazy'
import { I18nProvider } from '@/lib/i18n/client'
import { getLocale, getT } from '@/lib/i18n/server'

async function SignOutButton() {
  const t = await getT()
  async function signOut() {
    'use server'
    const supabase = await createClient()
    await supabase.auth.signOut()
    redirect('/login')
  }
  return (
    <form action={signOut}>
      <Button variant="outline" size="sm" type="submit" className="w-full">
        {t('Đăng xuất')}
      </Button>
    </form>
  )
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getCurrentUser()
  if (!me) redirect('/login')

  const [gf, companies, locale] = await Promise.all([getGlobalFilter(), listCompanies(), getLocale()])
  const curY = Number(todayLocal().slice(0, 4))
  const years = [curY - 2, curY - 1, curY, curY + 1].map(String)

  return (
    <I18nProvider locale={locale}>
    <div className="flex min-h-screen bg-gray-50">
      {/* ── Sidebar (co giãn được — kéo cạnh phải) ──────── */}
      <ResizableSidebar>
        {/* Logo — brand color block */}
        <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-br from-brand-600 to-brand-500 flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-white/15 flex items-center justify-center font-bold text-white text-xs">
            K
          </div>
          <div className="leading-tight">
            <p className="font-semibold text-sm text-white">KBIT</p>
            <p className="text-[10px] text-white/60 uppercase tracking-wider">Finance</p>
          </div>
        </div>

        {/* Nav groups */}
        <Sidebar role={me.role} />

        {/* User info + sign out */}
        <div className="px-4 py-4 border-t border-gray-100 space-y-2 bg-gray-50">
          <div className="text-xs leading-tight">
            <p className="font-semibold text-gray-900 truncate">{me.full_name}</p>
            <p className="text-brand-700 capitalize">{me.role.replace('_', ' ')}</p>
          </div>
          <SignOutButton />
        </div>
      </ResizableSidebar>

      {/* ── Main content ────────────────────────────────── */}
      <main className="flex-1 overflow-auto flex flex-col">
        <GlobalFilterBar
          companies={companies.map((c) => ({ id: c.id, name: c.name }))}
          companyId={gf.companyId}
          year={gf.year}
          years={years}
        />
        <div className="flex-1 p-6">{children}</div>
      </main>

      {/* ── AI Chatbot ──────────────────────────────────── */}
      <ChatWidgetLazy />
    </div>
    </I18nProvider>
  )
}
