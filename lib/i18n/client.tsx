'use client'

/**
 * i18n phía CLIENT: provider giữ locale (từ cookie, truyền qua layout) +
 * hook useT() cho mọi client component.
 *
 *   const t = useT()
 *   <Button>{t('Lưu')}</Button>
 */

import { createContext, useContext, type ReactNode } from 'react'
import { DEFAULT_LOCALE, type Locale } from './config'
import { EN } from './en'

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE)

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
}

export function useLocale(): Locale {
  return useContext(LocaleContext)
}

export function useT(): (s: string) => string {
  const locale = useLocale()
  if (locale === 'en') return (s: string) => EN[s] ?? s
  return (s: string) => s
}
