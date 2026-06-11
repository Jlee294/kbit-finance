/**
 * KTT i18n: cấu hình ngôn ngữ giao diện.
 *
 * Pattern: GETTEXT-STYLE — tiếng Việt trong code là chuỗi GỐC (source string).
 *   • locale = 'vi' → t() trả nguyên chuỗi (không cần từ điển vi)
 *   • locale = 'en' → t() tra từ điển EN; KHÔNG có bản dịch → fallback tiếng Việt
 * → Rollout dần từng module không bao giờ vỡ UI (chuỗi chưa dịch hiện tiếng Việt).
 *
 * Khi thêm chuỗi mới: chỉ cần thêm 1 dòng vào lib/i18n/en.ts.
 */

export const LOCALES = ['vi', 'en'] as const
export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'vi'
export const LOCALE_COOKIE = 'kbit-locale'

export function parseLocale(v: string | undefined | null): Locale {
  return v === 'en' ? 'en' : 'vi'
}
