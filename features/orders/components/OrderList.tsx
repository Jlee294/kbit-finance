'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { formatVND, formatDate } from '@/lib/format'
import { FulfillmentBadge, PaymentBadge } from './StatusBadges'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { OrderForm } from './OrderForm'
import { PAGE_WRAPPER, DIALOG_LG, LIST_WRAP, LIST_THEAD, LIST_ROW } from '@/lib/ui-tokens'
import { useT } from '@/lib/i18n/client'
import type { OrderListRow } from '../queries'

type SimpleOption    = { id: string; name: string }
type CustomerOption  = { id: string; code: string; name: string }
type ProjectOption   = { id: string; code: string; name: string; company_id: string }
type ProductOption   = { id: string; code: string; name: string }
type WarehouseOption = { id: string; code: string; name: string; company_id?: string; is_default?: boolean }
type UserOption      = { id: string; name: string }

interface Props {
  initialRows: OrderListRow[]
  total: number
  canWrite: boolean
  companies:  SimpleOption[]
  customers:  CustomerOption[]
  projects:   ProjectOption[]
  products:   ProductOption[]
  warehouses: WarehouseOption[]
  users:      UserOption[]
}

export function OrderList({ initialRows, total, canWrite, companies, customers, projects, products, warehouses, users }: Props) {
  const router = useRouter()
  const t = useT()
  const [rows] = useState<OrderListRow[]>(initialRows)
  const [addOpen, setAddOpen] = useState(false)

  // VAT + tiền hàng từng đơn (đồng bộ với Bảng kê bán ra)
  function splitAmounts(r: OrderListRow) {
    const total  = Number(r.grand_total) || 0
    const vatPct = Number(r.vat_pct) || 0
    const vat    = r.vat_amount != null
      ? Number(r.vat_amount)
      : (vatPct > 0 ? Math.round(total * vatPct / (100 + vatPct)) : 0)
    return { net: total - vat, vat, total }
  }

  // Tổng cộng cho dòng đầu (để so với Bảng kê bán ra)
  const totals = rows.reduce(
    (acc, r) => {
      const { net, vat, total } = splitAmounts(r)
      acc.net   += net
      acc.vat   += vat
      acc.grand += total
      return acc
    },
    { net: 0, vat: 0, grand: 0 },
  )

  return (
    <div className={PAGE_WRAPPER}>
      <PageHeader
        title={t('Nhật ký bán ra')}
        subtitle={`${total.toLocaleString('vi-VN')} ${t('đơn / hóa đơn bán ra')}`}
        actions={canWrite ? (
          <>
            <a href="/don-hang/import-xml"
              className="h-9 px-3 inline-flex items-center text-sm rounded-md border border-gray-200 bg-white hover:bg-gray-50 transition-colors">
              ↥ Import XML
            </a>
            <Button onClick={() => setAddOpen(true)}>
              {t('+ Tạo đơn hàng')}
            </Button>
          </>
        ) : undefined}
      />

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent showCloseButton={false} className={DIALOG_LG}>
          <DialogHeader>
            <DialogTitle>{t('Tạo đơn hàng bán ra')}</DialogTitle>
          </DialogHeader>
          <OrderForm
            companies={companies}
            customers={customers}
            projects={projects}
            products={products}
            warehouses={warehouses}
            users={users}
            onDone={() => setAddOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {rows.length === 0 ? (
        <EmptyState
          icon="📄"
          title={t('Chưa có đơn hàng nào')}
          description={t('Bấm + Tạo đơn hàng để thêm đơn đầu tiên, hoặc import từ XML')}
          action={canWrite ? (
            <Button onClick={() => setAddOpen(true)}>{t('+ Tạo đơn hàng')}</Button>
          ) : undefined}
        />
      ) : (
        <div className={LIST_WRAP}>
          <table className="w-full text-sm">
            <thead className={LIST_THEAD}>
              <tr>
                <th className="px-4 py-3 text-left">{t('Mã đơn')}</th>
                <th className="px-4 py-3 text-left">{t('Số HĐ')}</th>
                <th className="px-4 py-3 text-left">{t('Khách hàng')}</th>
                <th className="px-4 py-3 text-left">{t('Công ty')}</th>
                <th className="px-4 py-3 text-left">{t('Ngày')}</th>
                <th className="px-4 py-3 text-right">{t('Tiền hàng')}</th>
                <th className="px-4 py-3 text-right">{t('VAT')}</th>
                <th className="px-4 py-3 text-right">{t('Thành tiền')}</th>
                <th className="px-4 py-3 text-center">{t('Giao hàng')}</th>
                <th className="px-4 py-3 text-center">{t('Thanh toán')}</th>
                {canWrite && <th className="px-4 py-3 text-center">{t('Sửa')}</th>}
              </tr>
            </thead>
            <tbody>
              {/* Dòng TỔNG CỘNG — so với Bảng kê bán ra */}
              <tr className="bg-brand-50/60 font-semibold text-brand-800 border-b-2 border-brand-200">
                <td className="px-4 py-2.5" colSpan={5}>
                  {t('TỔNG CỘNG')} <span className="text-xs font-normal text-brand-700">({rows.length} {t('đơn')})</span>
                </td>
                <td className="px-4 py-2.5 text-right">{formatVND(totals.net)}</td>
                <td className="px-4 py-2.5 text-right">{formatVND(totals.vat)}</td>
                <td className="px-4 py-2.5 text-right">{formatVND(totals.grand)}</td>
                <td className="px-4 py-2.5" colSpan={canWrite ? 3 : 2}></td>
              </tr>
              {rows.map((row) => {
                const { net, vat, total } = splitAmounts(row)
                return (
                <tr
                  key={row.id}
                  className={LIST_ROW}
                  onClick={() => router.push(`/don-hang/${row.id}`)}
                >
                  <td className="px-4 py-3 font-mono font-medium text-brand-800">
                    <Link
                      href={`/don-hang/${row.id}`}
                      className="hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {row.order_code}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-700 whitespace-nowrap">
                    {row.invoice_no
                      ? <>{row.invoice_symbol && <span className="text-gray-400">{row.invoice_symbol} </span>}{row.invoice_no}</>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-900">
                    <span className="font-medium">{row.customer.name}</span>
                    <span className="ml-1.5 text-xs text-gray-400">[{row.customer.code}]</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{row.company.name}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {formatDate(row.order_date)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">{formatVND(net)}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{vat > 0 ? formatVND(vat) : '—'}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">{formatVND(total)}</td>
                  <td className="px-4 py-3 text-center">
                    <FulfillmentBadge status={row.fulfillment_status} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <PaymentBadge status={row.payment_status} />
                  </td>
                  {canWrite && (
                    <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      {row.fulfillment_status !== 'delivered' ? (
                        <Link
                          href={`/don-hang/${row.id}?edit=1`}
                          className="text-xs font-medium text-brand-700 hover:underline"
                        >
                          {t('Sửa')}
                        </Link>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
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
