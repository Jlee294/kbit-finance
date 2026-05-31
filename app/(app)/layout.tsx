import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Sidebar } from './Sidebar'
import { ChatWidget } from '@/components/chat/ChatWidget'

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
      <aside className="w-56 shrink-0 flex flex-col bg-white border-r min-h-screen sticky top-0 h-screen">
        {/* Logo */}
        <div className="px-5 py-4 border-b">
          <span className="font-bold text-base text-gray-900">KBIT Finance</span>
        </div>

        {/* Nav groups */}
        <Sidebar role={me.role} />

        {/* User info + sign out */}
        <div className="px-4 py-4 border-t space-y-2">
          <div className="text-xs text-gray-600 leading-tight">
            <p className="font-semibold truncate">{me.full_name}</p>
            <p className="text-gray-400 capitalize">{me.role.replace('_', ' ')}</p>
          </div>
          <SignOutButton />
        </div>
      </aside>

      {/* ── Main content ────────────────────────────────── */}
      <main className="flex-1 p-6 overflow-auto">
        {children}
      </main>

      {/* ── AI Chatbot ──────────────────────────────────── */}
      <ChatWidget />
    </div>
  )
}
