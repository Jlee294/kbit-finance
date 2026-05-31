import { TAX_TYPE_LABELS, type TaxType } from '../schema'
import type { TaxPlanLine }              from '../schema'

function fmt(v: number) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency', currency: 'VND', maximumFractionDigits: 0,
  }).format(v)
}

function fmtDiff(diff: number) {
  const sign = diff > 0 ? '+' : ''
  const cls  = diff > 0 ? 'text-red-600' : diff < 0 ? 'text-green-600' : 'text-gray-500'
  return <span className={`font-mono ${cls}`}>{sign}{fmt(diff)}</span>
}

interface Props {
  lines:   TaxPlanLine[]
  actuals: Partial<Record<string, number | null>>
}

export function PlanVsActualTable({ lines, actuals }: Props) {
  if (lines.length === 0) {
    return (
      <p className="px-5 py-6 text-sm text-gray-400 text-center">Chưa có kế hoạch nào.</p>
    )
  }

  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-xs text-gray-500 uppercase">
            <th className="px-4 py-3 text-left">Loại thuế</th>
            <th className="px-4 py-3 text-left">Kỳ</th>
            <th className="px-4 py-3 text-right">Kế hoạch</th>
            <th className="px-4 py-3 text-right">Thực tế</th>
            <th className="px-4 py-3 text-right">Chênh lệch</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {lines.map((l, i) => {
            const actual = actuals[l.tax_type]
            const hasActual = actual != null
            const diff = hasActual ? actual - l.planned_amount : null
            return (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 text-gray-700 text-xs font-medium">
                  {TAX_TYPE_LABELS[l.tax_type as TaxType] ?? l.tax_type}
                </td>
                <td className="px-4 py-2.5 text-gray-500 text-xs font-mono">{l.period}</td>
                <td className="px-4 py-2.5 text-right font-mono text-gray-700">
                  {fmt(l.planned_amount)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-gray-900">
                  {hasActual ? fmt(actual!) : (
                    <span className="text-gray-400 text-xs">chưa có nguồn</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {diff != null ? fmtDiff(diff) : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
