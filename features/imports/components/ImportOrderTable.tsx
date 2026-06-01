'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatVND, formatKRW } from '@/lib/format'
import { ImportOrderForm } from './ImportOrderForm'
import type { ImportOrderRow } from '../queries'

type SimpleOption  = { id: string; name: string }
type SupplierOpt   = { id: string; code: string; name: string }
type ProductOpt    = { id: string; code: string; name: string; unit?: string | null }
type ProjectOpt    = { id: string; code: string; name: string; company_id: string }

interface Props {
  rows:      ImportOrderRow[]
  canWrite:  boolean
  companies: SimpleOption[]
  suppliers: SupplierOpt[]
  products:  ProductOpt[]
  projects:  ProjectOpt[]
}

export function ImportOrderTable({ rows, canWrite, companies, suppliers, products, projects }: Props) {
  const router = useRouter()
  const [addOpen, setAddOpen] = useState(false)

  const fmtAmt = (row: ImportOrderRow, val: number) =>
    row.currency === 'KRW' ? formatKRW(val) : formatVND(val)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Nhật ký mua vào — {rows.length} hóa đơn</h2>
        {canWrite && (
          <Button onClick={() => setAddOpen(true)}>+ Thêm đơn nhập khẩu</Button>
        )}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent showCloseButton={false} className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tạo đơn nhập khẩu</DialogTitle>
          </DialogHeader>
          <ImportOrderForm
            companies={companies} suppliers={suppliers}
            products={products} projects={projects}
            onDone={() => setAddOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {rows.length === 0 ? (
        <div className="rounded-lg border bg-white p-10 text-center text-gray-400">
          Chưa có đơn nhập khẩu nào
        </div>
      ) : (
        <div className="rounded-xl border bg-white overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
                <th className="px-4 py-3 text-left">Mã đơn</th>
                <th className="px-4 py-3 text-left">Ngày</th>
                <th className="px-4 py-3 text-left">NCC</th>
                <th className="px-4 py-3 text-center">Tiền</th>
                <th className="px-4 py-3 text-right">Giá vốn lô</th>
                <th className="px-4 py-3 text-right">Còn nợ NCC</th>
                <th className="px-4 py-3 text-center">Nội bộ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr key={row.id}
                  className="hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => router.push(`/nhap-khau/${row.id}`)}>
                  <td className="px-4 py-3 font-mono text-gray-800">{row.order_code}</td>
                  <td className="px-4 py-3 text-gray-600">{row.order_date}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {(row.suppliers as { name: string } | null)?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${row.currency === 'KRW' ? 'bg-orange-50 text-orange-700' : 'bg-blue-50 text-blue-700'}`}>
                      {row.currency}
                      {row.currency === 'KRW' && row.exchange_rate && (
                        <span className="ml-1 text-gray-500">@{row.exchange_rate}</span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-800">
                    {fmtAmt(row, row.cost_total)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={row.outstanding > 0 ? 'font-semibold text-amber-700' : 'text-green-700'}>
                      {row.outstanding > 0 ? fmtAmt(row, row.outstanding) : '✓ Đã thanh toán'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {row.is_intercompany
                      ? <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">Nội bộ</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
