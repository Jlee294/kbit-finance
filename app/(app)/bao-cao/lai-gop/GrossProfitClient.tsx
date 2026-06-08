'use client'

import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/shared/PageHeader'
import { PAGE_WRAPPER } from '@/lib/ui-tokens'
import { formatVND } from '@/lib/format'
import type { GrossSummary, GrossLine } from '@/features/inventory-cost/avg-cost'

export function GrossProfitClient({ summary, year, month, companyName }: {
  summary: GrossSummary; year: string; month: string; companyName: string
}) {
  const router = useRouter()
  const t = summary.total
  const kyLabel = month ? `Tháng ${month}/${year}` : `Cả năm ${year}`
  return (
    <div className={PAGE_WRAPPER}>
      <PageHeader title="Lãi gộp" subtitle={`${companyName} · ${kyLabel} — doanh thu − giá vốn hàng bán (chỉ đơn đã chốt giá vốn)`} />

      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-sm text-gray-500">Tháng</label>
        <select value={month} onChange={e => router.push(`/bao-cao/lai-gop?month=${e.target.value}`)}
          className="h-9 rounded-md border border-gray-200 px-3 text-sm">
          <option value="">Cả năm</option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>Tháng {m}</option>)}
        </select>
        <span className="text-xs text-gray-400">Công ty &amp; năm chọn ở thanh trên cùng</span>
      </div>

      {t.revenue === 0 && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded px-3 py-2">
          Kỳ này chưa có lãi gộp. Hãy <b>Chốt giá vốn</b> ở mục <b>Kho → Giá vốn &amp; chốt kỳ</b>, hoặc đổi công ty / năm / tháng ở trên.
        </p>
      )}

      <div className="grid grid-cols-4 gap-3">
        <Stat label="Doanh thu bán" value={formatVND(t.revenue)} />
        <Stat label="Giá vốn hàng bán" value={formatVND(t.cogs)} />
        <Stat label="Lãi gộp" value={formatVND(t.profit)} accent />
        <Stat label="Tỷ suất lãi gộp" value={`${t.margin}%`} />
      </div>

      <Section title="Theo mã hàng" firstCol="Mã hàng" lines={summary.byProduct} />
      <Section title="Theo đơn bán" firstCol="Đơn" lines={summary.byOrder} />
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-semibold ${accent ? 'text-brand-800' : 'text-gray-900'}`}>{value}</p>
    </div>
  )
}

function Section({ title, firstCol, lines }: { title: string; firstCol: string; lines: GrossLine[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-2">{title}</h3>
      <div className="rounded-xl border bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-brand-100 bg-brand-50/60 text-brand-800 text-xs font-semibold tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left">{firstCol}</th>
              <th className="px-4 py-3 text-right">Doanh thu</th>
              <th className="px-4 py-3 text-right">Giá vốn</th>
              <th className="px-4 py-3 text-right">Lãi gộp</th>
              <th className="px-4 py-3 text-right">%</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">—</td></tr>
            ) : lines.map(l => (
              <tr key={l.key} className="border-t">
                <td className="px-4 py-3">{l.label}</td>
                <td className="px-4 py-3 text-right">{formatVND(l.revenue)}</td>
                <td className="px-4 py-3 text-right">{formatVND(l.cogs)}</td>
                <td className={`px-4 py-3 text-right font-medium ${l.profit >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatVND(l.profit)}</td>
                <td className="px-4 py-3 text-right">{l.margin}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
