'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { formatVND, formatDate } from '@/lib/format'
import { FulfillmentBadge, PaymentBadge } from './StatusBadges'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { PAGE_WRAPPER } from '@/lib/ui-tokens'
import type { OrderListRow } from '../queries'

interface Props {
  initialRows: OrderListRow[]
  total: number
  canWrite: boolean
}

export function OrderList({ initialRows, total, canWrite }: Props) {
  const router = useRouter()
  const [rows] = useState<OrderListRow[]>(initialRows)

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
            <Button onClick={() => router.push('/don-hang/tao-moi')}>
              + Tạo đơn hàng
            </Button>
          </>
        ) : undefined}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon="📄"
          title="Chưa có đơn hàng nào"
          description="Bấm + Tạo đơn hàng để thêm đơn đầu tiên, hoặc import từ XML"
          action={canWrite ? (
            <Button onClick={() => router.push('/don-hang/tao-moi')}>+ Tạo đơn hàng</Button>
          ) : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-brand-100 bg-brand-50/60 text-brand-800 text-xs font-semibold tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Mã đơn</th>
                <th className="px-4 py-3 text-left">Khách hàng</th>
                <th className="px-4 py-3 text-left">Công ty</th>
                <th className="px-4 py-3 text-left">Ngày</th>
                <th className="px-4 py-3 text-right">Tổng tiền</th>
                <th className="px-4 py-3 text-right">Còn lại</th>
                <th className="px-4 py-3 text-center">Giao hàng</th>
                <th className="px-4 py-3 text-center">Thanh toán</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-t hover:bg-brand-50/40 transition-colors cursor-pointer"
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
                      : <span className="text-green-600">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <FulfillmentBadge status={row.fulfillment_status} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <PaymentBadge status={row.payment_status} />
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
