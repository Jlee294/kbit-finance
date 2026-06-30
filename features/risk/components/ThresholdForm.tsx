'use client'

import { useState, useTransition } from 'react'
import { toast }                   from 'sonner'
import { INDICATORS, GROUP_LABELS } from '../indicators'
import { upsertThreshold }          from '../actions'

interface Company { id: string; name: string }

interface Props {
  companies: Company[]
}

export function ThresholdForm({ companies }: Props) {
  const [pending, startTransition] = useTransition()
  const [form, setForm] = useState({
    company_id:     '',          // '' = áp chung
    indicator_code: INDICATORS[0].code,
    yellow_at:      '',
    red_at:         '',
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      try {
        await upsertThreshold({
          company_id:     form.company_id || null,
          indicator_code: form.indicator_code,
          yellow_at:      form.yellow_at ? Number(form.yellow_at) : null,
          red_at:         form.red_at    ? Number(form.red_at)    : null,
        })
        toast.success('Đã lưu ngưỡng')
        setForm(f => ({ ...f, yellow_at: '', red_at: '' }))
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Lỗi')
      }
    })
  }

  // Group indicators for display
  const grouped = Object.entries(GROUP_LABELS) as [string, string][]

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-white shadow-sm p-5 space-y-4">
      <h3 className="text-sm font-semibold text-gray-800">Thêm / cập nhật ngưỡng</h3>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Công ty */}
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Công ty</label>
          <select
            className="w-full h-8 rounded-md border text-sm px-2 bg-white"
            value={form.company_id}
            onChange={e => setForm(f => ({ ...f, company_id: e.target.value }))}
          >
            <option value="">— Áp chung —</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {/* Chỉ tiêu */}
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Chỉ tiêu</label>
          <select
            className="w-full h-8 rounded-md border text-sm px-2 bg-white"
            value={form.indicator_code}
            onChange={e => setForm(f => ({ ...f, indicator_code: e.target.value }))}
          >
            {grouped.map(([g, glabel]) => (
              <optgroup key={g} label={glabel}>
                {INDICATORS.filter(i => i.group === g).map(i => (
                  <option key={i.code} value={i.code}>{i.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Ngưỡng vàng */}
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Ngưỡng vàng</label>
          <input
            type="number"
            className="w-full h-8 rounded-md border text-sm px-2"
            placeholder="để trống = không đặt"
            value={form.yellow_at}
            onChange={e => setForm(f => ({ ...f, yellow_at: e.target.value }))}
          />
        </div>

        {/* Ngưỡng đỏ */}
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Ngưỡng đỏ</label>
          <input
            type="number"
            className="w-full h-8 rounded-md border text-sm px-2"
            placeholder="để trống = không đặt"
            value={form.red_at}
            onChange={e => setForm(f => ({ ...f, red_at: e.target.value }))}
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="px-4 py-1.5 bg-primary text-white text-sm rounded-lg hover:bg-primary-700
                   disabled:opacity-50 transition-colors"
      >
        {pending ? 'Đang lưu...' : 'Lưu ngưỡng'}
      </button>
    </form>
  )
}
