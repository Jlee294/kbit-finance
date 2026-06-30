'use client'

import { TXN_TYPE_LABELS, ISSUE_REASON_LABELS, type IssueReason } from '../schema'
import type { TxnRow } from '../queries'
import { useT } from '@/lib/i18n/client'

const TYPE_COLOR: Record<string, string> = {
  receipt:         'bg-brand-50 text-brand-700',
  issue:           'bg-red-50 text-red-700',
  transfer_out:    'bg-orange-50 text-orange-700',
  transfer_in:     'bg-brand-50 text-brand-800',
  order_deduction: 'bg-purple-50 text-purple-700',
  adjustment:      'bg-gray-100 text-gray-600',
}

export function TransactionHistory({ rows }: { rows: TxnRow[] }) {
  const t = useT()
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border bg-white shadow-sm px-6 py-10 text-center text-sm text-gray-400">
        {t('Chưa có phát sinh xuất nhập kho nào.')}
      </div>
    )
  }

  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase font-montserrat font-semibold">
            <th className="px-4 py-3 text-left">{t('Ngày')}</th>
            <th className="px-4 py-3 text-left">{t('Công ty')}</th>
            <th className="px-4 py-3 text-left">{t('Loại')}</th>
            <th className="px-4 py-3 text-left">{t('Kho')}</th>
            <th className="px-4 py-3 text-left">{t('Sản phẩm')}</th>
            <th className="px-4 py-3 text-right">{t('SL')}</th>
            <th className="px-4 py-3 text-left">{t('Lý do / Ghi chú')}</th>
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
                  {t(TXN_TYPE_LABELS[r.txn_type] ?? r.txn_type)}
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
                  <span className="text-gray-600">{t(ISSUE_REASON_LABELS[r.reason as IssueReason])} </span>
                )}
                {r.note && <span>{r.note}</span>}
                {r.ref_order_id && (
                  <span className="text-purple-500"> {t('[Đơn hàng]')}</span>
                )}
                {!r.has_invoice && (
                  <span className="ml-1 text-[10px] font-medium bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">{t('⚠ Chưa có HĐ')}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
