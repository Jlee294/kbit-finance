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
  const [rows] = useState<OrderListRow[]>(initialRows)
  const [addOpen, setAddOpen] = useState(false)

  return (
    <div className={PAGE_WRAPPER}>
      <PageHeader
        title="Nhật ký bán ra"
        subtitle={`${total.toLocaleString('vi-VN')} đơn / hóa đơn bán ra`}
        actions={canWrite ? (
          <>
            <a href="/don-hang/import-xml"
              className="h-9 px-3 inline-flex items-center text-sm rounded-md border border-gray-200 bg-white hover:bg-gray-50 transition-colors">
              ↥ Import XML
            </a>
            <Button onClick={() => setAddOpen(true)}>
              + Tạo đơn hàng
            </Button>
          </>
        ) : undefined}
      />

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent showCloseButton={false} className={DIALOG_LG}>
          <DialogHeader>
            <DialogTitle>Tạo đơn hàng bán ra</DialogTitle>
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
          title="Chưa có đơn hàng nào"
          description="Bấm + Tạo đơn hàng để thêm đơn đầu tiên, hoặc import từ XML"
          action={canWrite ? (
            <Button onClick={() => setAddOpen(true)}>+ Tạo đơn hàng</Button>
          ) : undefined}
        />
      ) : (
        <div className={LIST_WRAP}>
          <table className="w-full text-sm">
            <thead className={LIST_THEAD}>
              <tr>
                <th className="px-4 py-3 text-left">Mã đơn</th>
                <th className="px-4 py-3 text-left">Khách hàng</th>
                <th className="px-4 py-3 text-left">Công ty</th>
                <th className="px-4 py-3 text-left">Ngày</th>
                <th className="px-4 py-3 text-right">Tổng tiền</th>
                <th className="px-4 py-3 text-right">Còn lại</th>
                <th className="px-4 py-3 text-center">Giao hàng</th>
                <th className="px-4 py-3 text-center">Thanh toán</th>
                {canWrite && <th className="px-4 py-3 text-center">Sửa</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
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
                  <td className="px-4 py-3 text-gray-900">
                    <span className="font-medium">{row.customer.name}</span>
                    <span className="ml-1.5 text-xs text-gray-400">[{row.customer.code}]</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{row.company.name}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {formatDate(row.order_date)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">
                    {formatVND(Number(row.grand_total))}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">
                    {Number(row.outstanding) > 0
                      ? formatVND(Number(row.outstanding))
                      : <span className="text-brand-700">—</span>}
                  </td>
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
                          Sửa
                        </Link>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
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
