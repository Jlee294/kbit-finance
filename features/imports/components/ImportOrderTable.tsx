'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatVND, formatKRW } from '@/lib/format'
import { ImportOrderForm } from './ImportOrderForm'
import { PageHeader } from '@/components/shared/PageHeader'
import { PAGE_WRAPPER, DIALOG_LG, LIST_WRAP, LIST_THEAD, LIST_ROW } from '@/lib/ui-tokens'
import { useT } from '@/lib/i18n/client'
import type { ImportOrderRow } from '../queries'

type SimpleOption  = { id: string; name: string }
type SupplierOpt   = { id: string; code: string; name: string }
type ProductOpt    = { id: string; code: string; name: string; unit?: string | null }
type ProjectOpt    = { id: string; code: string; name: string; company_id: string }
type UserOpt       = { id: string; name: string }
type WarehouseOpt  = { id: string; code: string; name: string; company_id?: string; is_default?: boolean }
type OperationOpt  = { id: string; code: string; name: string; group_name: string | null }

interface Props {
  rows:        ImportOrderRow[]
  canWrite:    boolean
  companies:   SimpleOption[]
  suppliers:   SupplierOpt[]
  products:    ProductOpt[]
  projects:    ProjectOpt[]
  users?:      UserOpt[]
  warehouses?: WarehouseOpt[]
  operations?: OperationOpt[]
}

export function ImportOrderTable({ rows, canWrite, companies, suppliers, products, projects, users = [], warehouses = [], operations = [] }: Props) {
  const router = useRouter()
  const t = useT()
  const [addOpen, setAddOpen] = useState(false)

  const fmtAmt = (row: ImportOrderRow, val: number) =>
    row.currency === 'KRW' ? formatKRW(val) : formatVND(val)

  // Tách Tiền hàng / VAT / Thành tiền (theo nguyên tệ của đơn)
  function splitAmounts(r: ImportOrderRow) {
    const net   = Number(r.goods_value) || 0
    const vat   = r.vat_amount != null ? Number(r.vat_amount) : (Number(r.vat_import) || 0)
    return { net, vat, total: net + vat }
  }

  // Tổng cộng để so với Bảng kê mua vào (tách VND/KRW vì hỗn hợp tiền tệ)
  const totals = rows.reduce(
    (acc, r) => {
      const { net, vat, total } = splitAmounts(r)
      const bucket = r.currency === 'KRW' ? 'krw' : 'vnd'
      acc[bucket].net   += net
      acc[bucket].vat   += vat
      acc[bucket].total += total
      return acc
    },
    { vnd: { net: 0, vat: 0, total: 0 }, krw: { net: 0, vat: 0, total: 0 } },
  )

  return (
    <div className={PAGE_WRAPPER}>
      <PageHeader
        title={t('Nhật ký mua vào')}
        subtitle={`${rows.length} ${t('hóa đơn')}`}
        actions={canWrite ? (
          <>
            <a href="/nhap-khau/import-xml"
              className="h-9 px-3 inline-flex items-center text-sm rounded-md border border-gray-200 bg-white hover:bg-gray-50 transition-colors">
              ↥ Import XML
            </a>
            <Button onClick={() => setAddOpen(true)}>{t('+ Thêm hóa đơn mua vào')}</Button>
          </>
        ) : undefined}
      />

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent showCloseButton={false} className={DIALOG_LG}>
          <DialogHeader>
            <DialogTitle>{t('Tạo hóa đơn mua vào (nhập khẩu / mua trong nước)')}</DialogTitle>
          </DialogHeader>
          <ImportOrderForm
            companies={companies} suppliers={suppliers}
            products={products} projects={projects}
            users={users} warehouses={warehouses}
            operations={operations}
            onDone={() => setAddOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {rows.length === 0 ? (
        <div className="rounded-lg border bg-white p-10 text-center text-gray-400">
          {t('Chưa có hóa đơn mua vào nào')}
        </div>
      ) : (
        <div className={LIST_WRAP}>
          <table className="w-full text-sm">
            <thead className={LIST_THEAD}>
              <tr>
                <th className="px-4 py-3 text-left">{t('Mã đơn')}</th>
                <th className="px-4 py-3 text-left">{t('Số HĐ')}</th>
                <th className="px-4 py-3 text-left">{t('Ngày')}</th>
                <th className="px-4 py-3 text-left">{t('NCC')}</th>
                <th className="px-4 py-3 text-center">{t('Loại')}</th>
                <th className="px-4 py-3 text-center">{t('Tiền tệ')}</th>
                <th className="px-4 py-3 text-right">{t('Tiền hàng')}</th>
                <th className="px-4 py-3 text-right">{t('VAT')}</th>
                <th className="px-4 py-3 text-right">{t('Thành tiền')}</th>
                <th className="px-4 py-3 text-center">{t('Nội bộ')}</th>
                {canWrite && <th className="px-4 py-3 text-center">{t('Sửa')}</th>}
              </tr>
            </thead>
            <tbody>
              {/* Dòng TỔNG CỘNG — so với Bảng kê mua vào */}
              <tr className="bg-brand-50/60 font-semibold text-brand-800 border-b-2 border-brand-200">
                <td className="px-4 py-2.5" colSpan={6}>
                  {t('TỔNG CỘNG')} <span className="text-xs font-normal text-brand-700">({rows.length} {t('hóa đơn')})</span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <div>{formatVND(totals.vnd.net)}</div>
                  {totals.krw.net > 0 && <div className="text-xs font-normal text-orange-700">{formatKRW(totals.krw.net)}</div>}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <div>{formatVND(totals.vnd.vat)}</div>
                  {totals.krw.vat > 0 && <div className="text-xs font-normal text-orange-700">{formatKRW(totals.krw.vat)}</div>}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <div>{formatVND(totals.vnd.total)}</div>
                  {totals.krw.total > 0 && <div className="text-xs font-normal text-orange-700">{formatKRW(totals.krw.total)}</div>}
                </td>
                <td className="px-4 py-2.5" colSpan={canWrite ? 2 : 1}></td>
              </tr>
              {rows.map((row) => {
                const { net, vat, total } = splitAmounts(row)
                return (
                <tr key={row.id}
                  className={LIST_ROW}
                  onClick={() => router.push(`/nhap-khau/${row.id}`)}>
                  <td className="px-4 py-3 font-mono text-gray-800">{row.order_code}</td>
                  <td className="px-4 py-3 font-mono text-gray-700 whitespace-nowrap">
                    {row.invoice_no
                      ? <>{row.invoice_symbol && <span className="text-gray-400">{row.invoice_symbol} </span>}{row.invoice_no}</>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{row.order_date}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {(row.suppliers as { name: string } | null)?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      row.order_type === 'domestic' ? 'bg-brand-50 text-brand-700' : 'bg-amber-50 text-amber-700'
                    }`}>
                      {row.order_type === 'domestic' ? t('Trong nước') : t('Nhập khẩu')}
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
                  <td className="px-4 py-3 text-right text-gray-700">{fmtAmt(row, net)}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{vat > 0 ? fmtAmt(row, vat) : '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-800">{fmtAmt(row, total)}</td>
                  <td className="px-4 py-3 text-center">
                    {row.is_intercompany
                      ? <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">{t('Nội bộ')}</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  {canWrite && (
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={(e) => { e.stopPropagation(); router.push(`/nhap-khau/${row.id}?edit=1`) }}
                        className="text-xs font-medium text-brand-700 hover:underline"
                      >
                        {t('Sửa')}
                      </button>
                    </td>
                  )}
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
