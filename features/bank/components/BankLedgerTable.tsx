'use client'

import Link from 'next/link'
import { useState } from 'react'
import { BankRowEditDialog } from './BankRowEditDialog'
import type { BankRow } from '../queries'

type PartnerOption = { id: string; code: string; name: string }

interface Props {
  rows: BankRow[]
  canWrite?: boolean
  customers?: PartnerOption[]
  suppliers?: PartnerOption[]
  krSuppliers?: PartnerOption[]
}

function fmtVND(v: number) { return v.toLocaleString('vi-VN') + ' đ' }
function fmtAmount(v: number, curr: string) {
  if (curr === 'KRW') return v.toLocaleString('ko-KR') + ' ₩'
  if (curr === 'USD') return '$' + v.toLocaleString('en-US')
  return v.toLocaleString('vi-VN') + ' đ'
}
function fmtDate(s: string) { return new Date(s).toLocaleDateString('vi-VN') }

export function BankLedgerTable({
  rows,
  canWrite = false,
  customers = [],
  suppliers = [],
  krSuppliers = [],
}: Props) {
  const [editRow, setEditRow] = useState<BankRow | null>(null)

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border bg-white shadow-sm px-6 py-10 text-center text-sm text-gray-400">
        Không có giao dịch ngân hàng nào trong phạm vi lọc.
      </div>
    )
  }

  return (
    <>
      <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[1100px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase font-montserrat font-semibold tracking-wide">
              <th className="px-3 py-2.5 text-left w-[8%]">Ngày</th>
              <th className="px-3 py-2.5 text-center w-[6%]">Loại</th>
              <th className="px-3 py-2.5 text-left w-[16%]">Tài khoản ngân hàng</th>
              <th className="px-3 py-2.5 text-left w-[14%]">Đối tác</th>
              <th className="px-3 py-2.5 text-right w-[13%]">Số tiền</th>
              <th className="px-3 py-2.5 text-right w-[11%]">Quy VNĐ</th>
              <th className="px-3 py-2.5 text-left w-[11%]">Công ty</th>
              <th className="px-3 py-2.5 text-left w-[14%]">Ghi chú</th>
              {canWrite && <th className="px-3 py-2.5 text-center w-[7%]">Sửa</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => {
              const href = r.direction === 'thu' ? `/thu-tien/${r.id}` :
                            r.region === 'KR'    ? `/chi-kr/${r.id}`   :
                                                    `/chi-vn/${r.id}`
              return (
                <tr key={r.direction + ':' + r.id} className="hover:bg-brand-50/40">
                  <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{fmtDate(r.txn_date)}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      r.direction === 'thu' ? 'bg-brand-50 text-brand-700' : 'bg-red-50 text-red-600'
                    }`}>
                      {r.direction === 'thu' ? 'Thu' : (r.region === 'KR' ? 'Chi KR' : 'Chi VN')}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-700 text-xs">{r.bank_account_name ?? '—'}</td>
                  <td className="px-3 py-2 text-gray-800">
                    {r.partner_name ?? <span className="text-gray-400 italic text-xs">Chưa gán</span>}
                    {r.is_unassigned && <span className="ml-1 text-[10px] text-amber-600">·chưa gắn đơn</span>}
                  </td>
                  <td className={`px-3 py-2 text-right font-medium ${
                    r.direction === 'thu' ? 'text-brand-700' : 'text-red-600'
                  }`}>
                    {r.direction === 'thu' ? '+ ' : '− '}{fmtAmount(r.amount_local, r.currency)}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-500 text-xs">
                    {r.currency !== 'VND' && '≈ '}{fmtVND(r.amount_vnd)}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">{r.company_name ?? '—'}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">
                    {r.note ?? '—'}
                    <Link href={href} className="ml-1 text-brand-600 hover:underline text-[10px]">↗</Link>
                  </td>
                  {canWrite && (
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => setEditRow(r)}
                        className="text-xs font-medium text-brand-700 hover:underline"
                        title="Sửa đối tác / ghi chú"
                      >
                        Sửa
                      </button>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <BankRowEditDialog
        row={editRow}
        customers={customers}
        suppliers={suppliers}
        krSuppliers={krSuppliers}
        onClose={() => setEditRow(null)}
      />
    </>
  )
}
