'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatVND, formatKRW } from '@/lib/format'
import { ImportOrderForm } from './ImportOrderForm'
import { PageHeader } from '@/components/shared/PageHeader'
import { PAGE_WRAPPER, DIALOG_LG, LIST_WRAP, LIST_THEAD, LIST_ROW } from '@/lib/ui-tokens'
import type { ImportOrderRow } from '../queries'

type SimpleOption  = { id: string; name: string }
type SupplierOpt   = { id: string; code: string; name: string }
type ProductOpt    = { id: string; code: string; name: string; unit?: string | null }
type ProjectOpt    = { id: string; code: string; name: string; company_id: string }
type UserOpt       = { id: string; name: string }
type WarehouseOpt  = { id: string; code: string; name: string; company_id?: string; is_default?: boolean }

interface Props {
  rows:        ImportOrderRow[]
  canWrite:    boolean
  companies:   SimpleOption[]
  suppliers:   SupplierOpt[]
  products:    ProductOpt[]
  projects:    ProjectOpt[]
  users?:      UserOpt[]
  warehouses?: WarehouseOpt[]
}

export function ImportOrderTable({ rows, canWrite, companies, suppliers, products, projects, users = [], warehouses = [] }: Props) {
  const router = useRouter()
  const [addOpen, setAddOpen] = useState(false)

  const fmtAmt = (row: ImportOrderRow, val: number) =>
    row.currency === 'KRW' ? formatKRW(val) : formatVND(val)

  // Tổng cộng để so với Bảng kê mua vào (tách VND/KRW vì hỗn hợp tiền tệ)
  const totals = rows.reduce(
    (acc, r) => {
      if (r.currency === 'KRW') {
        acc.krw += Number(r.cost_total) || 0
        acc.krwOutstanding += Number(r.outstanding) || 0
      } else {
        acc.vnd += Number(r.cost_total) || 0
        acc.vndOutstanding += Number(r.outstanding) || 0
      }
      return acc
    },
    { vnd: 0, krw: 0, vndOutstanding: 0, krwOutstanding: 0 },
  )

  return (
    <div className={PAGE_WRAPPER}>
      <PageHeader
        title="Nhật ký mua vào"
        subtitle={`${rows.length} hóa đơn`}
        actions={canWrite ? (
          <>
            <a href="/nhap-khau/import-xml"
              className="h-9 px-3 inline-flex items-center text-sm rounded-md border border-gray-200 bg-white hover:bg-gray-50 transition-colors">
              ↥ Import XML
            </a>
            <Button onClick={() => setAddOpen(true)}>+ Thêm hóa đơn mua vào</Button>
          </>
        ) : undefined}
      />

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent showCloseButton={false} className={DIALOG_LG}>
          <DialogHeader>
            <DialogTitle>Tạo hóa đơn mua vào (nhập khẩu / mua trong nước)</DialogTitle>
          </DialogHeader>
          <ImportOrderForm
            companies={companies} suppliers={suppliers}
            products={products} projects={projects}
            users={users} warehouses={warehouses}
            onDone={() => setAddOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {rows.length === 0 ? (
        <div className="rounded-lg border bg-white p-10 text-center text-gray-400">
          Chưa có hóa đơn mua vào nào
        </div>
      ) : (
        <div className={LIST_WRAP}>
          <table className="w-full text-sm">
            <thead className={LIST_THEAD}>
              <tr>
                <th className="px-4 py-3 text-left">Mã đơn</th>
                <th className="px-4 py-3 text-left">Ngày</th>
                <th className="px-4 py-3 text-left">NCC</th>
                <th className="px-4 py-3 text-center">Loại</th>
                <th className="px-4 py-3 text-center">Tiền</th>
                <th className="px-4 py-3 text-right">Giá vốn lô</th>
                <th className="px-4 py-3 text-right">Còn nợ NCC</th>
                <th className="px-4 py-3 text-center">Nội bộ</th>
                {canWrite && <th className="px-4 py-3 text-center">Sửa</th>}
              </tr>
            </thead>
            <tbody>
              {/* Dòng TỔNG CỘNG — so với Bảng kê mua vào */}
              <tr className="bg-brand-50/60 font-semibold text-brand-800 border-b-2 border-brand-200">
                <td className="px-4 py-2.5" colSpan={5}>
                  TỔNG CỘNG <span className="text-xs font-normal text-brand-700">({rows.length} hóa đơn)</span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <div>{formatVND(totals.vnd)}</div>
                  {totals.krw > 0 && (
                    <div className="text-xs font-normal text-orange-700">{formatKRW(totals.krw)}</div>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <div>{totals.vndOutstanding > 0 ? formatVND(totals.vndOutstanding) : '—'}</div>
                  {totals.krwOutstanding > 0 && (
                    <div className="text-xs font-normal text-orange-700">{formatKRW(totals.krwOutstanding)}</div>
                  )}
                </td>
                <td className="px-4 py-2.5" colSpan={canWrite ? 2 : 1}></td>
              </tr>
              {rows.map((row) => (
                <tr key={row.id}
                  className={LIST_ROW}
                  onClick={() => router.push(`/nhap-khau/${row.id}`)}>
                  <td className="px-4 py-3 font-mono text-gray-800">{row.order_code}</td>
                  <td className="px-4 py-3 text-gray-600">{row.order_date}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {(row.suppliers as { name: string } | null)?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      row.order_type === 'domestic' ? 'bg-brand-50 text-brand-700' : 'bg-amber-50 text-amber-700'
                    }`}>
                      {row.order_type === 'domestic' ? 'Trong nước' : 'Nhập khẩu'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${row.currency === 'KRW' ? 'bg-orange-50 text-orange-700' : 'bg-brand-50 text-brand-800'}`}>
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
                    <span className={row.outstanding > 0 ? 'font-semibold text-amber-700' : 'text-brand-700'}>
                      {row.outstanding > 0 ? fmtAmt(row, row.outstanding) : '✓ Đã thanh toán'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {row.is_intercompany
                      ? <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">Nội bộ</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  {canWrite && (
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={(e) => { e.stopPropagation(); router.push(`/nhap-khau/${row.id}?edit=1`) }}
                        className="text-xs font-medium text-brand-700 hover:underline"
                      >
                        Sửa
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
