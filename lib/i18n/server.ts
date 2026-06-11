import { cookies } from 'next/headers'
import { LOCALE_COOKIE, parseLocale, type Locale } from './config'
import { EN } from './en'

/** Locale hiện tại từ cookie (server components / actions / route handlers). */
export async function getLocale(): Promise<Locale> {
  const store = await cookies()
  return parseLocale(store.get(LOCALE_COOKIE)?.value)
}

/**
 * Hàm dịch cho SERVER components:
 *   const t = await getT()
 *   <PageHeader title={t('Báo cáo')} />
 * Chuỗi chưa có trong từ điển EN → trả nguyên tiếng Việt.
 */
export async function getT(): Promise<(s: string) => string> {
  const locale = await getLocale()
  if (locale === 'en') return (s: string) => EN[s] ?? s
  return (s: string) => s
}
