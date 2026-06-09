'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { generateYearlyCalendar } from '../actions'

interface Props {
  companyId: string
  defaultYear?: string
}

export function GenerateYearlyButton({ companyId, defaultYear }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(false)
  const [year, setYear] = useState(defaultYear ?? String(new Date().getFullYear()))
  const [msg, setMsg] = useState('')

  function run() {
    start(async () => {
      const res = await generateYearlyCalendar(companyId, year)
      if (!res.ok) { setMsg('Lỗi: ' + res.error); return }
      setMsg(`✓ Đã lập lịch ${res.count} nghĩa vụ thuế năm ${year}`)
      router.refresh()
      setTimeout(() => setOpen(false), 1500)
    })
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="text-xs">
        📅 Lập lịch cả năm
      </Button>
    )
  }

  return (
    <div className="rounded-md border border-brand-200 bg-brand-50/40 px-3 py-2 flex flex-wrap items-center gap-2">
      <span className="text-xs text-brand-800 font-medium">Năm:</span>
      <input
        type="number" min="2020" max="2100"
        value={year} onChange={(e) => setYear(e.target.value)}
        className="h-7 w-20 px-2 text-xs rounded-md border border-gray-300"
      />
      <Button size="sm" onClick={run} disabled={pending} className="text-xs h-7">
        {pending ? 'Đang lập…' : 'Lập lịch'}
      </Button>
      <Button size="sm" variant="outline" onClick={() => { setOpen(false); setMsg('') }} disabled={pending} className="text-xs h-7">Hủy</Button>
      {msg && (
        <span className={`text-xs ${msg.startsWith('✓') ? 'text-brand-700' : 'text-red-600'}`}>{msg}</span>
      )}
    </div>
  )
}
