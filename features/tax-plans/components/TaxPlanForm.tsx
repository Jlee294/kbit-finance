'use client'

import { useState, useTransition } from 'react'
import { toast }                   from 'sonner'
import { upsertTaxPlan }           from '../actions'
import { TAX_TYPES, TAX_TYPE_LABELS } from '../schema'
import type { TaxPlanLine }        from '../schema'

interface Props {
  companyId: string
  year:      number
  lines:     TaxPlanLine[]
}

export function TaxPlanForm({ companyId, year, lines: initialLines }: Props) {
  const [pending, startTransition] = useTransition()
  const [lines, setLines] = useState<TaxPlanLine[]>(initialLines)
  const [newLine, setNewLine] = useState<TaxPlanLine>({
    tax_type:       'GTGT',
    period:         `${year}-01`,
    planned_amount: 0,
  })

  function addLine() {
    setLines(prev => [...prev, newLine])
  }

  function removeLine(i: number) {
    setLines(prev => prev.filter((_, idx) => idx !== i))
  }

  function save() {
    startTransition(async () => {
      try {
        await upsertTaxPlan({
          company_id: companyId,
          year,
          plan_data:  { lines },
        })
        toast.success('Đã lưu kế hoạch thuế')
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Lỗi')
      }
    })
  }

  return (
    <div className="rounded-xl border bg-white shadow-sm p-5 space-y-4">
      <h3 className="text-sm font-semibold text-gray-800">Kế hoạch thuế năm {year}</h3>

      {/* Thêm dòng */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Loại thuế</label>
          <select
            className="w-full h-8 rounded-md border text-sm px-2 bg-white"
            value={newLine.tax_type}
            onChange={e => setNewLine(l => ({ ...l, tax_type: e.target.value as any }))}
          >
            {TAX_TYPES.map(t => <option key={t} value={t}>{TAX_TYPE_LABELS[t]}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Kỳ (YYYY-MM hoặc YYYY-Qx)</label>
          <input
            className="w-full h-8 rounded-md border text-sm px-2"
            value={newLine.period}
            onChange={e => setNewLine(l => ({ ...l, period: e.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Kế hoạch (VND)</label>
          <input
            type="number"
            min={0}
            className="w-full h-8 rounded-md border text-sm px-2"
            value={newLine.planned_amount}
            onChange={e => setNewLine(l => ({ ...l, planned_amount: Number(e.target.value) }))}
          />
        </div>
        <button
          type="button"
          onClick={addLine}
          className="h-8 px-3 bg-gray-100 text-gray-700 rounded-md text-sm hover:bg-gray-200"
        >
          + Thêm dòng
        </button>
      </div>

      {/* Danh sách dòng hiện tại */}
      {lines.length > 0 && (
        <table className="w-full text-xs border rounded-lg overflow-hidden">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-3 py-2 text-left text-gray-500">Loại</th>
              <th className="px-3 py-2 text-left text-gray-500">Kỳ</th>
              <th className="px-3 py-2 text-right text-gray-500">Kế hoạch</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {lines.map((l, i) => (
              <tr key={i}>
                <td className="px-3 py-1.5">{TAX_TYPE_LABELS[l.tax_type]}</td>
                <td className="px-3 py-1.5 font-mono">{l.period}</td>
                <td className="px-3 py-1.5 text-right font-mono">
                  {new Intl.NumberFormat('vi-VN').format(l.planned_amount)}
                </td>
                <td className="px-3 py-1.5 text-right">
                  <button onClick={() => removeLine(i)} className="text-red-400 hover:text-red-600">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <button
        onClick={save}
        disabled={pending}
        className="px-4 py-1.5 bg-brand-800 text-white text-sm rounded-lg hover:bg-brand-700 disabled:opacity-50"
      >
        {pending ? 'Đang lưu...' : 'Lưu kế hoạch'}
      </button>
    </div>
  )
}
