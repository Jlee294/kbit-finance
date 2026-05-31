'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { RunAssessmentButton }         from './RunAssessmentButton'

interface Company { id: string; name: string }

interface Props {
  companies:  Company[]
  companyId?: string
  period?:    string
  canRun:     boolean
}

export function RuiRoFilters({ companies, companyId, period, canRun }: Props) {
  const router       = useRouter()
  const searchParams = useSearchParams()

  function navigate(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else        params.delete(key)
    router.push(`?${params.toString()}`)
  }

  return (
    <div className="flex flex-wrap gap-3 items-end bg-white rounded-xl border px-4 py-3 shadow-sm">
      <div className="space-y-1">
        <p className="text-xs text-gray-500">Công ty</p>
        <select
          className="h-8 rounded-md border text-sm px-2 bg-white min-w-[160px]"
          value={companyId ?? ''}
          onChange={e => navigate('company', e.target.value)}
        >
          <option value="">— Chọn công ty —</option>
          {companies.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <p className="text-xs text-gray-500">Kỳ (YYYY-MM)</p>
        <input
          type="month"
          className="h-8 rounded-md border text-sm px-2 bg-white"
          value={period ?? ''}
          onChange={e => navigate('period', e.target.value)}
        />
      </div>

      {companyId && canRun && (
        <div className="ml-auto">
          <RunAssessmentButton companyId={companyId} period={period} />
        </div>
      )}
    </div>
  )
}
