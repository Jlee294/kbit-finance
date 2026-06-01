import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Sidebar } from './Sidebar'
import { ChatWidgetLazy } from '@/components/chat/ChatWidgetLazy'

async function SignOutButton() {
  async function signOut() {
    'use server'
    const supabase = await createClient()
    await supabase.auth.signOut()
    redirect('/login')
  }
  return (
    <form action={signOut}>
      <Button variant="outline" size="sm" type="submit" className="w-full">
        Đăng xuất
      </Button>
    </form>
  )
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getCurrentUser()
  if (!me) redirect('/login')

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* ── Sidebar ─────────────────────────────────────── */}
      <aside className="w-56 shrink-0 flex flex-col bg-white border-r border-gray-200 min-h-screen sticky top-0 h-screen shadow-sm">
        {/* Logo — brand color block */}
        <div className="px-5 py-4 border-b border-gray-100 bg-brand-800 flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-white/10 flex items-center justify-center font-bold text-white text-xs">
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
      </aside>

      {/* ── Main content ────────────────────────────────── */}
      <main className="flex-1 p-6 overflow-auto">
        {children}
      </main>

      {/* ── AI Chatbot ──────────────────────────────────── */}
      <ChatWidgetLazy />
    </div>
  )
}
