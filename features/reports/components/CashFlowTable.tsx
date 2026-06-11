'use client'

import { useT } from '@/lib/i18n/client'

function fmt(value: number, currency: string) {
  return new Intl.NumberFormat('vi-VN', {
    style:           'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

interface Row {
  label:    string
  value:    number
  bold?:    boolean
  positive?: boolean   // colors by sign when true
}

interface Props {
  rows:     Row[]
  currency: string
}

export function CashFlowTable({ rows, currency }: Props) {
  const t = useT()
  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-xs text-gray-500 uppercase">
            <th className="px-5 py-3 text-left">{t('Chỉ tiêu')}</th>
            <th className="px-5 py-3 text-right">{t('Giá trị')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r, i) => {
            let valueClass = 'text-gray-900'
            if (r.positive !== undefined) {
              valueClass = r.value >= 0 ? 'text-brand-700' : 'text-red-600'
            }
            return (
              <tr key={i} className={r.bold ? 'bg-gray-50' : ''}>
                <td className={`px-5 py-2.5 text-gray-700 ${r.bold ? 'font-semibold' : ''}`}>
                  {r.label}
                </td>
                <td className={`px-5 py-2.5 text-right font-mono ${valueClass} ${r.bold ? 'font-semibold' : ''}`}>
                  {fmt(r.value, currency)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
