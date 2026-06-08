'use server'

import { cookies } from 'next/headers'
import { GLOBAL_COMPANY_COOKIE, GLOBAL_YEAR_COOKIE } from '@/lib/global-filter'

const ONE_YEAR = 60 * 60 * 24 * 365

/** Lưu công ty đang xem (toàn cục) vào cookie. Client gọi xong nên router.refresh(). */
export async function setGlobalCompany(companyId: string) {
  const c = await cookies()
  c.set(GLOBAL_COMPANY_COOKIE, companyId, { maxAge: ONE_YEAR, sameSite: 'lax', path: '/' })
}

/** Lưu năm làm việc (toàn cục) vào cookie. */
export async function setGlobalYear(year: string) {
  const c = await cookies()
  c.set(GLOBAL_YEAR_COOKIE, year, { maxAge: ONE_YEAR, sameSite: 'lax', path: '/' })
}
