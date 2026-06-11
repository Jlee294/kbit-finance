'use server'

import { cookies } from 'next/headers'
import { LOCALE_COOKIE, parseLocale } from './config'

/** Đổi ngôn ngữ giao diện — lưu cookie 1 năm, caller tự router.refresh(). */
export async function setLocale(locale: string): Promise<void> {
  const store = await cookies()
  store.set(LOCALE_COOKIE, parseLocale(locale), {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  })
}
