import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

const navItems = [
  { href: '/don-hang', label: 'Đơn hàng' },
  { href: '/danh-muc/cong-ty', label: 'Công ty' },
  { href: '/danh-muc/du-an', label: 'Dự án' },
  { href: '/danh-muc/khach-hang', label: 'Khách hàng' },
  { href: '/danh-muc/nha-cung-cap', label: 'Nhà cung cấp' },
  { href: '/danh-muc/tai-khoan-ngan-hang', label: 'Tài khoản NH' },
  { href: '/danh-muc/san-pham', label: 'Sản phẩm' },
  { href: '/danh-muc/ty-gia', label: 'Tỷ giá' },
  { href: '/danh-muc/ky-ke-toan', label: 'Kỳ kế toán' },
]

async function SignOutButton() {
  async function signOut() {
    'use server'
    const supabase = await createClient()
    await supabase.auth.signOut()
    redirect('/login')
  }
  return (
    <form action={signOut}>
      <Button variant="outline" size="sm" type="submit">Đăng xuất</Button>
    </form>
  )
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getCurrentUser()
  if (!me) redirect('/login')

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="font-bold text-lg text-gray-900">KBIT Finance</span>
          <nav className="flex gap-1 text-sm">
            {navItems.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="px-3 py-1.5 rounded-md text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">
            {me.full_name} <span className="text-gray-400">({me.role})</span>
          </span>
          <SignOutButton />
        </div>
      </header>
      <main className="p-6">{children}</main>
    </div>
  )
}
