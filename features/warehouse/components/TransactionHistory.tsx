'use client'

import { TXN_TYPE_LABELS, ISSUE_REASON_LABELS, type IssueReason } from '../schema'
import type { TxnRow } from '../queries'

const TYPE_COLOR: Record<string, string> = {
  receipt:         'bg-green-50 text-green-700',
  issue:           'bg-red-50 text-red-700',
  transfer_out:    'bg-orange-50 text-orange-700',
  transfer_in:     'bg-brand-50 text-brand-800',
  order_deduction: 'bg-purple-50 text-purple-700',
  adjustment:      'bg-gray-100 text-gray-600',
}

export function TransactionHistory({ rows }: { rows: TxnRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border bg-white shadow-sm px-6 py-10 text-center text-sm text-gray-400">
        Chưa có phát sinh xuất nhập kho nào.
      </div>
    )
  }

  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-brand-100 bg-brand-50/60 text-xs text-brand-800 font-semibold">
            <th className="px-4 py-3 text-left">Ngày</th>
            <th className="px-4 py-3 text-left">Công ty</th>
            <th className="px-4 py-3 text-left">Loại</th>
            <th className="px-4 py-3 text-left">Kho</th>
            <th className="px-4 py-3 text-left">Sản phẩm</th>
            <th className="px-4 py-3 text-right">SL</th>
            <th className="px-4 py-3 text-left">Lý do / Ghi chú</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map(r => (
            <tr key={r.id} className="hover:bg-brand-50/40">
              <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                {new Date(r.txn_date).toLocaleDateString('vi-VN')}
              </td>
              <td className="px-4 py-2.5 text-gray-600 text-xs">{r.company_name}</td>
              <td className="px-4 py-2.5">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLOR[r.txn_type] ?? 'bg-gray-100 text-gray-600'}`}>
                  {TXN_TYPE_LABELS[r.txn_type] ?? r.txn_type}
                </span>
              </td>
              <td className="px-4 py-2.5 text-gray-700">
                {r.warehouse_name}
                {r.to_warehouse_name && (
                  <span className="text-gray-400"> → {r.to_warehouse_name}</span>
                )}
              </td>
              <td className="px-4 py-2.5">
                <p className="text-gray-800">{r.product_name}</p>
                <p className="text-xs text-gray-400">{r.product_code}</p>
              </td>
              <td className="px-4 py-2.5 text-right font-medium text-gray-800">
                {r.qty.toLocaleString('vi-VN')}
              </td>
              <td className="px-4 py-2.5 text-gray-500 text-xs">
                {r.reason && (
                  <span className="text-gray-600">{ISSUE_REASON_LABELS[r.reason as IssueReason]} </span>
                )}
                {r.note && <span>{r.note}</span>}
                {r.ref_order_id && (
                  <span className="text-purple-500"> [Đơn hàng]</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
