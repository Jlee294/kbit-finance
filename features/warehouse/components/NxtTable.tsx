'use client'

import { useRouter } from 'next/navigation'
import { formatVND } from '@/lib/format'
import type { NxtRow, Warehouse } from '../queries'

const num = (n: number) => n.toLocaleString('vi-VN')

export function NxtTable({ fromPeriod, toPeriod, warehouseId, warehouses, rows }: {
  fromPeriod: string; toPeriod: string; warehouseId: string; warehouses: Warehouse[]; rows: NxtRow[]
}) {
  const router = useRouter()
  const go = (from: string, to: string, wh: string) =>
    router.push(`/kho?from=${from}&to=${to}&wh=${wh}`)

  const isRange = fromPeriod !== toPeriod
  const kyLabel = isRange ? `${fromPeriod} → ${toPeriod}` : fromPeriod

  // Tổng giá trị tồn (dòng tổng KTT yêu cầu)
  const totals = rows.reduce(
    (a, r) => {
      a.open  += r.value_open;  a.in   += r.value_in
      a.out   += r.value_out;   a.close += r.value_close
      return a
    },
    { open: 0, in: 0, out: 0, close: 0 },
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500">Từ tháng</label>
          <input type="month" value={fromPeriod}
            onChange={e => go(e.target.value, e.target.value > toPeriod ? e.target.value : toPeriod, warehouseId)}
            className="h-9 rounded-md border border-gray-200 px-3 text-sm" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500">Đến tháng</label>
          <input type="month" value={toPeriod} min={fromPeriod}
            onChange={e => go(fromPeriod, e.target.value, warehouseId)}
            className="h-9 rounded-md border border-gray-200 px-3 text-sm" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500">Kho</label>
          <select value={warehouseId} onChange={e => go(fromPeriod, toPeriod, e.target.value)}
            className="h-9 rounded-md border border-gray-200 px-3 text-sm">
            <option value="all">Tất cả kho</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <span className="text-xs text-gray-400">Công ty chọn ở thanh trên cùng</span>
      </div>

      <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
        {rows.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-gray-400">Không có phát sinh/tồn trong kỳ {kyLabel}.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-100 bg-brand-50/60 text-xs text-brand-800 font-semibold">
                <th rowSpan={2} className="px-3 py-2 text-left align-bottom">Mã hàng</th>
                <th rowSpan={2} className="px-3 py-2 text-left align-bottom border-l">Tên hàng</th>
                <th colSpan={2} className="px-3 py-2 text-center border-l">Tồn đầu kỳ</th>
                <th colSpan={2} className="px-3 py-2 text-center border-l">Nhập trong kỳ</th>
                <th colSpan={2} className="px-3 py-2 text-center border-l">Xuất trong kỳ</th>
                <th colSpan={2} className="px-3 py-2 text-center border-l">Tồn cuối kỳ</th>
                <th rowSpan={2} className="px-3 py-2 text-right align-bottom border-l">Đơn giá BQ</th>
              </tr>
              <tr className="border-b border-brand-100 bg-brand-50/40 text-[11px] text-brand-700 font-medium">
                <th className="px-3 py-1.5 text-right border-l">SL</th><th className="px-3 py-1.5 text-right">Thành tiền</th>
                <th className="px-3 py-1.5 text-right border-l">SL</th><th className="px-3 py-1.5 text-right">Thành tiền</th>
                <th className="px-3 py-1.5 text-right border-l">SL</th><th className="px-3 py-1.5 text-right">Thành tiền</th>
                <th className="px-3 py-1.5 text-right border-l">SL</th><th className="px-3 py-1.5 text-right">Thành tiền</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {/* Dòng TỔNG giá trị */}
              <tr className="bg-brand-50/60 font-semibold text-brand-800 border-b-2 border-brand-200">
                <td className="px-3 py-2" colSpan={2}>TỔNG GIÁ TRỊ <span className="text-xs font-normal text-brand-700">({rows.length} mặt hàng)</span></td>
                <td className="px-3 py-2 text-right border-l">—</td><td className="px-3 py-2 text-right">{formatVND(totals.open)}</td>
                <td className="px-3 py-2 text-right border-l">—</td><td className="px-3 py-2 text-right">{formatVND(totals.in)}</td>
                <td className="px-3 py-2 text-right border-l">—</td><td className="px-3 py-2 text-right">{formatVND(totals.out)}</td>
                <td className="px-3 py-2 text-right border-l">—</td><td className="px-3 py-2 text-right">{formatVND(totals.close)}</td>
                <td className="px-3 py-2 text-right border-l"></td>
              </tr>
              {rows.map(r => {
                const neg = r.qty_close < 0
                return (
                  <tr key={r.product_id} className={`hover:bg-brand-50/40 ${neg ? 'bg-red-50' : ''}`}>
                    <td className="px-3 py-2 font-mono text-gray-800">{r.code}</td>
                    <td className="px-3 py-2 border-l font-medium text-gray-800">{r.name}</td>
                    <td className="px-3 py-2 text-right border-l">{num(r.qty_open)}</td><td className="px-3 py-2 text-right text-gray-600">{formatVND(r.value_open)}</td>
                    <td className="px-3 py-2 text-right border-l">{num(r.qty_in)}</td><td className="px-3 py-2 text-right text-gray-600">{formatVND(r.value_in)}</td>
                    <td className="px-3 py-2 text-right border-l">{num(r.qty_out)}</td><td className="px-3 py-2 text-right text-gray-600">{formatVND(r.value_out)}</td>
                    <td className={`px-3 py-2 text-right border-l font-semibold ${neg ? 'text-red-600' : 'text-gray-800'}`}>{num(r.qty_close)}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{formatVND(r.value_close)}</td>
                    <td className="px-3 py-2 text-right border-l text-gray-600">{formatVND(r.avg_cost)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
