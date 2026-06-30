'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale } from '@/lib/i18n/client'
import { setLocale } from '@/lib/i18n/actions'
import type { Locale } from '@/lib/i18n/config'

/** Toggle VI | EN — lưu cookie rồi refresh để server components render lại theo locale mới. */
export function LanguageSwitcher() {
  const locale = useLocale()
  const router = useRouter()
  const [pending, start] = useTransition()

  function switchTo(l: Locale) {
    if (l === locale || pending) return
    start(async () => {
      await setLocale(l)
      router.refresh()
    })
  }

  const btn = (l: Locale, label: string) => (
    <button
      type="button"
      onClick={() => switchTo(l)}
      disabled={pending}
      className={`px-2 py-0.5 text-xs font-semibold rounded transition-colors ${
        locale === l
          ? 'bg-primary text-white'
          : 'text-gray-500 hover:text-brand-800 hover:bg-brand-50'
      }`}
      aria-pressed={locale === l}
    >
      {label}
    </button>
  )

  return (
    <div className="flex items-center gap-0.5 rounded-md border border-gray-200 bg-white p-0.5" title="Ngôn ngữ / Language">
      {btn('vi', 'VI')}
      {btn('en', 'EN')}
    </div>
  )
}
