import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Middleware gọn nhẹ — chỉ check JWT trong cookie (KHÔNG roundtrip Supabase Auth).
 *
 * Trước đây dùng `supabase.auth.getUser()` → mỗi request gọi tới Supabase Auth
 * tốn 100-300ms. Đổi sang `getClaims()` để decode JWT cục bộ (vẫn verify chữ ký
 * qua JWKS cache). Việc verify revocation server-side để các page tự xử lý.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options))
        },
      },
    },
  )

  // getClaims() decode JWT cục bộ — nhanh hơn getUser() rất nhiều
  let authed = false
  try {
    const { data } = await supabase.auth.getClaims()
    authed = !!data?.claims?.sub
  } catch {
    authed = false
  }

  if (!authed && !request.nextUrl.pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return response
}

export const config = {
  // Loại trừ: _next/data (RSC prefetch), file tĩnh, login
  matcher: [
    '/((?!_next/static|_next/image|_next/data|favicon.ico|robots.txt|sitemap.xml|login).*)',
  ],
}
