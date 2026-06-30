'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { upsertTaxPlan } from '../actions'
import {
  FIXED_TEMPLATE,
  newEmptyTemplate,
  recomputeTemplate,
  makeSubRow,
  type TemplateRow,
} from '../template'

interface Props {
  companyId: string
  companyName: string
  projectId?: string | null
  projectName?: string | null
  year: number
  /** Dữ liệu hiện có (nếu sửa) — null = tạo mới */
  initial?: { rows: TemplateRow[]; meta?: { from?: string; to?: string; notes?: string } } | null
}

// KTT E3: cho phép thêm sub ở mọi mục input thuần (formula=null, không phải sub)
const PARENTS_ALLOW_SUB = new Set(['1', '2', '4', '6', '7', '8', '10', '11'])

const INPUT = 'w-full h-8 rounded-md border border-gray-300 bg-white px-2 text-sm text-right focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100'

function fmtVND(n: number) {
  return n.toLocaleString('vi-VN')
}
function fmtPct(n: number | null | undefined) {
  if (n == null) return ''
  return (n * 100).toFixed(2) + '%'
}

export function TaxPlanTemplateForm({ companyId, companyName, projectId, projectName, year, initial }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [rows, setRows] = useState<TemplateRow[]>(() =>
    initial?.rows && initial.rows.length > 0 ? initial.rows : newEmptyTemplate().rows,
  )
  const [from, setFrom] = useState(initial?.meta?.from ?? `${year}-01-01`)
  const [to,   setTo]   = useState(initial?.meta?.to   ?? `${year}-12-31`)
  const [notes, setNotes] = useState(initial?.meta?.notes ?? '')

  // Recompute mỗi lần rows thay đổi
  const computed = useMemo(() => recomputeTemplate(rows), [rows])

  function updateAmount(id: string, raw: string) {
    const v = Number(String(raw).replace(/[,\s]/g, '')) || 0
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, amount: v } : r)))
  }

  function updateName(id: string, name: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, name } : r)))
  }

  function addSubRow(parent: string) {
    const name = prompt(`Thêm chỉ tiêu con của "${rows.find((r) => r.id === parent)?.name}":`)
    if (!name?.trim()) return
    setRows((prev) => {
      const next = [...prev]
      const parentIdx = next.findIndex((r) => r.id === parent)
      // Insert ngay sau dòng parent + sau tất cả sub khác của parent
      let insertAt = parentIdx + 1
      while (insertAt < next.length && next[insertAt].parent === parent) insertAt++
      next.splice(insertAt, 0, makeSubRow(parent, name.trim()))
      return next
    })
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id))
  }

  function save() {
    startTransition(async () => {
      try {
        await upsertTaxPlan({
          company_id: companyId,
          project_id: projectId ?? null,
          year,
          plan_data: {
            template: 'kht_v1',
            rows: computed,
            meta: { from, to, notes: notes.trim() || undefined },
          },
        })
        toast.success('Đã lưu kế hoạch thuế')
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Lỗi khi lưu')
      }
    })
  }

  return (
    <div className="space-y-5">
      {/* ── Header thông tin ─────────────────────────────────────────── */}
      <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-4 space-y-2">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div>
            <span className="text-gray-500">Công ty:</span>{' '}
            <span className="font-semibold text-brand-800">{companyName}</span>
          </div>
          <div>
            <span className="text-gray-500">Dự án:</span>{' '}
            <span className="font-semibold text-brand-800">{projectName ?? 'Toàn công ty'}</span>
          </div>
          <div>
            <span className="text-gray-500">Năm:</span>{' '}
            <span className="font-semibold text-brand-800">{year}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm pt-1">
          <div>
            <label className="text-xs text-gray-500 block mb-0.5">Từ ngày</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="h-8 px-2 text-sm rounded-md border border-gray-300 w-full" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-0.5">Đến ngày</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="h-8 px-2 text-sm rounded-md border border-gray-300 w-full" />
          </div>
          <div className="md:col-span-1">
            <label className="text-xs text-gray-500 block mb-0.5">Ghi chú</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Ghi chú nội bộ..." className="h-8 px-2 text-sm rounded-md border border-gray-300 w-full" />
          </div>
        </div>
      </div>

      {/* ── Bảng chỉ tiêu ──────────────────────────────────────────── */}
      <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase font-montserrat font-semibold">
            <tr>
              <th className="px-3 py-2.5 text-left w-[60px]">STT</th>
              <th className="px-3 py-2.5 text-left">Chỉ tiêu</th>
              <th className="px-3 py-2.5 text-right w-[180px]">Số tiền (VND)</th>
              <th className="px-3 py-2.5 text-right w-[90px]">% / DT</th>
              <th className="px-3 py-2.5 text-center w-[80px]"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {computed.map((r) => {
              const isSub    = r.kind === 'sub'
              const isFixed  = r.kind === 'fixed'
              const isParent = PARENTS_ALLOW_SUB.has(r.id)
              const hasSubs  = rows.some((x) => x.parent === r.id && x.kind === 'sub')
              // Read-only nếu: (1) là formula, HOẶC (2) là input-parent đã có sub → auto-sum
              const isFormula = !!r.formula && !(r.formula.startsWith('sum_children') && !hasSubs)
              const isAutoSum = isParent && hasSubs && !r.formula
              const readOnly  = isFormula || isAutoSum
              const indent    = isSub ? 'pl-10' : (r.parent ? 'pl-10' : '')
              return (
                <tr key={r.id} className={`${isFixed && !r.parent ? 'bg-brand-50/20' : ''} hover:bg-brand-50/30`}>
                  <td className={`px-3 py-2 text-gray-700 font-mono text-xs ${isFixed && !r.parent ? 'font-semibold text-brand-800' : ''}`}>{r.id}</td>
                  <td className={`px-3 py-2 ${indent}`}>
                    {isSub ? (
                      <input
                        type="text"
                        value={r.name}
                        onChange={(e) => updateName(r.id, e.target.value)}
                        className="w-full h-7 px-2 text-sm rounded-md border border-gray-200"
                      />
                    ) : (
                      <span className={isFixed && !r.parent ? 'font-semibold text-brand-800' : 'text-gray-800'}>
                        {r.name}
                        {isFormula && <span className="ml-1 text-[10px] text-gray-400">(tự tính)</span>}
                        {isAutoSum  && <span className="ml-1 text-[10px] text-gray-400">(tổng các mục con)</span>}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {readOnly ? (
                      <span className={`font-mono ${isFixed && !r.parent ? 'font-semibold text-brand-800' : 'text-gray-700'}`}>
                        {fmtVND(r.amount)}
                      </span>
                    ) : r.id === '14' ? (
                      // Thuế suất → input dạng % (mặc định 0.20 = 20%)
                      <div className="flex items-center justify-end gap-1">
                        <input
                          type="number" step="0.01" min="0" max="1"
                          value={r.amount}
                          onChange={(e) => updateAmount(r.id, e.target.value)}
                          className={INPUT + ' w-24'}
                        />
                        <span className="text-xs text-gray-400">= {(r.amount * 100).toFixed(1)}%</span>
                      </div>
                    ) : (
                      <input
                        type="number" step="any"
                        value={r.amount || ''}
                        onChange={(e) => updateAmount(r.id, e.target.value)}
                        className={INPUT}
                        placeholder="0"
                      />
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-gray-500 font-mono">{fmtPct(r.pct)}</td>
                  <td className="px-3 py-2 text-center">
                    {isParent && (
                      <button
                        type="button"
                        onClick={() => addSubRow(r.id)}
                        title="Thêm chỉ tiêu con"
                        className="text-xs text-brand-700 hover:underline"
                      >+ Thêm</button>
                    )}
                    {isSub && (
                      <button
                        type="button"
                        onClick={() => removeRow(r.id)}
                        title="Xóa dòng"
                        className="text-xs text-red-500 hover:underline"
                      >✕ Xóa</button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500">
        💡 Các mục <strong>1, 2, 4, 6, 7, 8, 10, 11</strong> cho phép thêm chỉ tiêu con (VD: Doanh thu = bán hàng + dịch vụ + cho thuê...).
        Nếu CHƯA có chỉ tiêu con, bạn nhập trực tiếp vào parent. Khi thêm con, parent sẽ tự tính = tổng các con.
      </p>

      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={() => router.back()} disabled={pending}>Huỷ</Button>
        <Button onClick={save} disabled={pending}>
          {pending ? 'Đang lưu…' : 'Lưu kế hoạch'}
        </Button>
      </div>
    </div>
  )
}
