import { cookies } from 'next/headers'
import { todayLocal } from '@/lib/format'
import { isDemoMode } from '@/lib/demo'
import { GLA_COMPANY_ID } from '@/lib/gla-data'

export const GLOBAL_COMPANY_COOKIE = 'kbit_company'
export const GLOBAL_YEAR_COOKIE = 'kbit_year'

/** Đọc lựa chọn Công ty + Năm toàn cục (từ cookie). Năm mặc định = năm hiện tại. */
export async function getGlobalFilter(): Promise<{ companyId: string | null; year: string }> {
  if (isDemoMode()) return { companyId: GLA_COMPANY_ID, year: '2026' }

  const c = await cookies()
  const companyId = c.get(GLOBAL_COMPANY_COOKIE)?.value || null
  const year = c.get(GLOBAL_YEAR_COOKIE)?.value || todayLocal().slice(0, 4)
  return { companyId, year }
}
