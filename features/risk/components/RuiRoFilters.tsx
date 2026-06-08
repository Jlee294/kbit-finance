'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { RunAssessmentButton }         from './RunAssessmentButton'

interface Company { id: string; name: string }

interface Props {
  companyId?: string
  period?:    string
  canRun:     boolean
}

export function RuiRoFilters({ companyId, period, canRun }: Props) {
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
