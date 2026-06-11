'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { setGlobalCompany, setGlobalYear } from '@/features/global-filter/actions'
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher'
import { useT } from '@/lib/i18n/client'

interface Props {
  companies: { id: string; name: string }[]
  companyId: string | null
  year: string
  years: string[]
}

/** Thanh chọn Công ty + Năm TOÀN CỤC (đầu app). Lưu cookie → mọi trang số liệu lọc theo. */
export function GlobalFilterBar({ companies, companyId, year, years }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const t = useT()

  const onCompany = (v: string) => start(async () => { await setGlobalCompany(v); router.refresh() })
  const onYear = (v: string) => start(async () => { await setGlobalYear(v); router.refresh() })

  const sel = 'h-8 rounded-md border border-gray-200 bg-white px-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-500/40 disabled:opacity-60'

  return (
    <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-gray-200 bg-white/95 px-6 py-2.5 shadow-sm backdrop-blur">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">{t('Đang xem')}</span>
      <select aria-label={t('Công ty')} value={companyId ?? ''} onChange={(e) => onCompany(e.target.value)} disabled={pending} className={`${sel} min-w-[200px] text-brand-800`}>
        <option value="">{t('— Tất cả công ty —')}</option>
        {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <select aria-label={t('Năm')} value={year} onChange={(e) => onYear(e.target.value)} disabled={pending} className={sel}>
        {years.map((y) => <option key={y} value={y}>{t('Năm')} {y}</option>)}
      </select>
      {pending && <span className="text-xs text-gray-400">{t('Đang cập nhật…')}</span>}

      {/* Ngôn ngữ giao diện — góc phải */}
      <div className="ml-auto">
        <LanguageSwitcher />
      </div>
    </div>
  )
}
