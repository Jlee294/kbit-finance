'use client'

import { useState } from 'react'
import { AUDITABLE_TABLES, TABLE_LABELS } from '../constants'
import type { AuditEntry } from '../queries'

interface UserOption { id: string; full_name: string }

interface Props {
  entries:  AuditEntry[]
  users:    UserOption[]
  /** current filter values (from server) */
  tableFilter?:  string
  byFilter?:     string
  periodFilter?: string
}

const ACTION_CLS: Record<string, string> = {
  INSERT: 'bg-green-50 text-green-700',
  UPDATE: 'bg-brand-50  text-brand-800',
  DELETE: 'bg-red-50   text-red-700',
}


export function AuditTable({ entries, users, tableFilter = '', byFilter = '', periodFilter = '' }: Props) {
  const [table,  setTable]  = useState(tableFilter)
  const [byUser, setByUser] = useState(byFilter)
  const [period, setPeriod] = useState(periodFilter)

  // Client-side filter on top of server data (fast, no round-trip)
  const filtered = entries.filter((e) => {
    if (table  && e.table_name  !== table)  return false
    if (byUser && e.changed_by  !== byUser) return false
    if (period) {
      const start = new Date(`${period}-01`)
      const [y, m] = period.split('-').map(Number)
      const end = m === 12 ? new Date(`${y + 1}-01-01`) : new Date(`${y}-${String(m + 1).padStart(2, '0')}-01`)
      const at = new Date(e.changed_at)
      if (at < start || at >= end) return false
    }
    return true
  })

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <p className="text-xs text-gray-500">Bảng dữ liệu</p>
          <select
            className="h-8 rounded-md border text-sm px-2 bg-white"
            value={table}
            onChange={(e) => setTable(e.target.value)}
          >
            <option value="">Tất cả</option>
            {AUDITABLE_TABLES.map((t) => (
              <option key={t} value={t}>{TABLE_LABELS[t] ?? t}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-gray-500">Người thao tác</p>
          <select
            className="h-8 rounded-md border text-sm px-2 bg-white"
            value={byUser}
            onChange={(e) => setByUser(e.target.value)}
          >
            <option value="">Tất cả</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.full_name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-gray-500">Kỳ (YYYY-MM)</p>
          <input
            type="month"
            className="h-8 rounded-md border text-sm px-2 bg-white"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          />
        </div>
        {(table || byUser || period) && (
          <button
            onClick={() => { setTable(''); setByUser(''); setPeriod('') }}
            className="text-xs text-gray-400 hover:text-gray-600 underline self-end mb-0.5"
          >
            Xóa lọc
          </button>
        )}
        <span className="text-xs text-gray-400 self-end mb-1">{filtered.length} bản ghi</span>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-gray-400">Không có bản ghi nào.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 uppercase border-b bg-gray-50">
                <th className="px-4 py-3 text-left">Thời gian</th>
                <th className="px-4 py-3 text-left">Bảng</th>
                <th className="px-4 py-3 text-center">Hành động</th>
                <th className="px-4 py-3 text-left">Người</th>
                <th className="px-4 py-3 text-left">Record ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-600 text-xs whitespace-nowrap">
                    {new Date(e.changed_at).toLocaleString('vi-VN')}
                  </td>
                  <td className="px-4 py-2.5 text-gray-700 text-xs font-mono">
                    {TABLE_LABELS[e.table_name] ?? e.table_name}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${ACTION_CLS[e.action] ?? 'bg-gray-100 text-gray-600'}`}>
                      {e.action}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-700 text-xs">
                    {e.changer_name ?? <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-gray-400 text-xs">
                    {e.record_id ? e.record_id.slice(0, 8) + '…' : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
