'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { lockPeriodsBulk, unlockPeriodsBulk } from '../actions'

type CompanyOption = { id: string; name: string; code: string }

interface Props {
  companies: CompanyOption[]
  defaultYear: string
}

const SEL = 'h-9 rounded-md border border-gray-300 bg-white px-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100'

export function BulkLockPanel({ companies, defaultYear }: Props) {
  const router = useRouter()
  const [companyId, setCompanyId] = useState<string>(companies[0]?.id ?? '')
  const [year,      setYear]      = useState<string>(defaultYear)
  const [pending,   start]        = useTransition()
  const [msg,       setMsg]       = useState<string>('')

  function call(scope: 'quarter' | 'year', action: 'lock' | 'unlock', quarter?: number) {
    if (!companyId) { setMsg('Vui lòng chọn công ty'); return }
    const fn = action === 'lock' ? lockPeriodsBulk : unlockPeriodsBulk
    const label = scope === 'year' ? 'cả năm' : `Q${quarter}`
    const verb  = action === 'lock' ? 'Khóa' : 'Mở khóa'
    if (!confirm(`${verb} ${label} năm ${year}?`)) return
    setMsg('')
    start(async () => {
      const res = await fn({ company_id: companyId, year, scope, quarter })
      if (!res.ok) { setMsg('Lỗi: ' + res.error); return }
      setMsg(`✓ ${verb} ${label} năm ${year}: ${res.ok && (res as { locked?: number; unlocked?: number }).locked || (res as { unlocked?: number }).unlocked} tháng`)
      router.refresh()
    })
  }

  // Năm hiện hành ± 2 năm
  const cur = Number(defaultYear) || new Date().getFullYear()
  const years = [cur - 2, cur - 1, cur, cur + 1].map(String)

  return (
    <div className="rounded-xl border border-brand-100 bg-brand-50/30 px-5 py-4 space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="font-semibold text-sm text-brand-800">Khóa / Mở nhanh theo quý hoặc năm</h3>
        <span className="text-xs text-gray-500">— tự tạo kỳ tháng nếu chưa có</span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-gray-700">
          Công ty:&nbsp;
          <select className={SEL + ' min-w-[200px]'} value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="text-sm text-gray-700">
          Năm:&nbsp;
          <select className={SEL} value={year} onChange={(e) => setYear(e.target.value)}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <span className="text-xs text-gray-500 mr-1">Khóa:</span>
        {[1, 2, 3, 4].map((q) => (
          <Button key={'lk' + q} size="sm" variant="outline" disabled={pending}
                  onClick={() => call('quarter', 'lock', q)}>🔒 Q{q}</Button>
        ))}
        <Button size="sm" disabled={pending}
                onClick={() => call('year', 'lock')}>🔒 Cả năm</Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-500 mr-1">Mở khóa:</span>
        {[1, 2, 3, 4].map((q) => (
          <Button key={'ul' + q} size="sm" variant="outline" disabled={pending}
                  onClick={() => call('quarter', 'unlock', q)}>🔓 Q{q}</Button>
        ))}
        <Button size="sm" variant="outline" disabled={pending}
                onClick={() => call('year', 'unlock')}>🔓 Cả năm</Button>
      </div>

      {msg && (
        <p className={`text-sm ${msg.startsWith('✓') ? 'text-brand-700' : 'text-red-600'}`}>{msg}</p>
      )}
    </div>
  )
}
