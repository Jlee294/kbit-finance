'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { markFiled, updateFiledDate, markUnfiled } from '../actions'

interface Props {
  id:         string
  status:     'pending' | 'filed' | 'overdue'
  due_date:   string
  filed_date: string | null
  canEdit:    boolean
}

function diffDays(filed: string, due: string): number {
  const f = new Date(filed).getTime()
  const d = new Date(due).getTime()
  return Math.round((f - d) / 86_400_000)
}

export function FiledDateCell({ id, status, due_date, filed_date, canEdit }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [editing, setEditing] = useState(false)
  const [date, setDate] = useState(filed_date ?? new Date().toISOString().slice(0, 10))

  // ── Chưa nộp ─────────────────────────────────────────────────────
  if (status !== 'filed') {
    if (!canEdit) return <span className="text-xs text-gray-400">—</span>
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => { await markFiled(id); router.refresh() })}
        className="text-xs font-medium text-brand-700 hover:bg-brand-50 px-2 py-0.5 rounded border border-brand-200"
      >
        {pending ? '...' : '✓ Đã nộp'}
      </button>
    )
  }

  // ── Đã nộp ──────────────────────────────────────────────────────
  const days  = filed_date ? diffDays(filed_date, due_date) : 0
  const late  = days > 0
  const onTime = days <= 0

  if (editing && canEdit) {
    return (
      <div className="flex items-center gap-1">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-7 px-1.5 text-xs rounded border border-gray-300"
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => {
            try { await updateFiledDate(id, date); router.refresh(); setEditing(false) }
            catch (e: any) { alert(e.message) }
          })}
          className="text-xs text-brand-700 hover:underline px-1"
        >Lưu</button>
        <button type="button" onClick={() => { setEditing(false); setDate(filed_date ?? '') }} className="text-xs text-gray-400 hover:underline">×</button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-gray-700">
        {filed_date ? new Date(filed_date).toLocaleDateString('vi-VN') : '—'}
      </span>
      {filed_date && (
        late ? (
          <span className="text-[10px] bg-danger-50 text-danger-700 px-1.5 py-0.5 rounded font-semibold" title={`Trễ ${days} ngày so với hạn ${due_date}`}>
            Trễ {days}d
          </span>
        ) : onTime && (
          <span className="text-[10px] bg-success-50 text-success-700 px-1.5 py-0.5 rounded font-semibold" title="Nộp đúng hoặc trước hạn">
            ✓ Đúng hạn
          </span>
        )
      )}
      {canEdit && (
        <>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-[10px] text-gray-400 hover:text-brand-700"
            title="Sửa ngày nộp"
          >✏️</button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!confirm('Bỏ đánh dấu đã nộp?')) return
              start(async () => { await markUnfiled(id); router.refresh() })
            }}
            className="text-[10px] text-gray-400 hover:text-red-600"
            title="Bỏ đánh dấu nộp"
          >↺</button>
        </>
      )}
    </div>
  )
}
