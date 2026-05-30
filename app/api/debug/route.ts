import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()

  // Kiểm tra auth session
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({
      step: 'auth',
      status: 'FAIL — không tìm thấy session',
      authError,
    })
  }

  // Kiểm tra bảng public.users
  const { data: dbUser, error: dbError } = await supabase
    .from('users')
    .select('id, full_name, role, is_active')
    .eq('auth_id', user.id)
    .single()

  return NextResponse.json({
    step: 'db',
    auth: { id: user.id, email: user.email },
    dbUser,
    dbError: dbError?.message ?? null,
  })
}
