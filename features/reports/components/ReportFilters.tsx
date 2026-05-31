'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'

interface Company  { id: string; name: string }
interface Project  { id: string; name: string }

interface Props {
  companies:  Company[]
  projects:   Project[]
  /** current values */
  companyId?: string
  projectId?: string
  from?:      string
  to?:        string
  /** 'company' | 'consolidated' */
  mode:       'company' | 'consolidated'
}

export function ReportFilters({ companies, projects, companyId, projectId, from, to, mode }: Props) {
  const router       = useRouter()
  const searchParams = useSearchParams()

  const push = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) params.set(key, value)
      else params.delete(key)
      router.push(`?${params.toString()}`)
    },
    [router, searchParams],
  )

  return (
    <div className="flex flex-wrap gap-3 items-end bg-white rounded-xl border px-4 py-3 shadow-sm">
      {mode === 'company' && (
        <div className="space-y-1">
          <p className="text-xs text-gray-500">Pháp nhân</p>
          <select
            className="h-8 rounded-md border text-sm px-2 bg-white min-w-[160px]"
            value={companyId ?? ''}
            onChange={(e) => push('company', e.target.value)}
          >
            <option value="">— Chọn công ty —</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      {mode === 'company' && projects.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-gray-500">Dự án</p>
          <select
            className="h-8 rounded-md border text-sm px-2 bg-white min-w-[140px]"
            value={projectId ?? ''}
            onChange={(e) => push('project', e.target.value)}
          >
            <option value="">Tất cả</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="space-y-1">
        <p className="text-xs text-gray-500">Từ ngày</p>
        <input
          type="date"
          className="h-8 rounded-md border text-sm px-2 bg-white"
          value={from ?? ''}
          onChange={(e) => push('from', e.target.value)}
        />
      </div>

      <div className="space-y-1">
        <p className="text-xs text-gray-500">Đến ngày</p>
        <input
          type="date"
          className="h-8 rounded-md border text-sm px-2 bg-white"
          value={to ?? ''}
          onChange={(e) => push('to', e.target.value)}
        />
      </div>

      {(companyId || projectId || from || to) && (
        <button
          onClick={() => router.push('?')}
          className="text-xs text-gray-400 hover:text-gray-600 underline self-end mb-1"
        >
          Xóa lọc
        </button>
      )}
    </div>
  )
}
