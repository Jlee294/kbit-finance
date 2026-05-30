import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getCurrentUser, canEdit, canApprove } from '@/lib/auth'
import { getOrder } from '@/features/orders/queries'
import { listCompanies } from '@/features/companies/queries'
import { listCustomers } from '@/features/customers/queries'
import { listProjects } from '@/features/projects/queries'
import { listProducts } from '@/features/products/queries'
import { FulfillmentBadge, PaymentBadge } from '@/features/orders/components/StatusBadges'
import { OrderDetailActions } from '@/features/orders/components/OrderDetailActions'
import { formatVND, formatDate } from '@/lib/format'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

export default async function OrderDetailPage({ params }: Props) {
  const { id } = await params

  const [me, order] = await Promise.all([getCurrentUser(), getOrder(id)])
  if (!order) notFound()

  const write = !!me && canEdit(me.role)
  const approve = !!me && canApprove(me.role)

  // Fetch master data only when user can edit (for the edit form)
  const [companies, customers, projects, products] = write
    ? await Promise.all([listCompanies(), listCustomers(), listProjects(), listProducts()])
    : [[], [], [], []]

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/don-hang" className="hover:text-gray-900">Đơn hàng</Link>
        <span>/</span>
        <span className="font-mono font-medium text-gray-900">{order.order_code}</span>
      </div>

      {/* Header card */}
      <div className="rounded-xl border bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold font-mono text-gray-900">{order.order_code}</h1>
            <p className="text-gray-600 mt-1">
              {order.customer.name}{' '}
              <span className="text-gray-400">[{order.customer.code}]</span>
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <FulfillmentBadge status={order.fulfillment_status} />
            <PaymentBadge status={order.payment_status} />
          </div>
        </div>

        {/* Meta grid */}
        <div className="mt-5 grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <Row label="Ngày đặt hàng"  value={formatDate(order.order_date)} />
          {order.delivery_date && (
            <Row label="Ngày giao dự kiến" value={formatDate(order.delivery_date)} />
          )}
          <Row label="Công ty"        value={order.company.name} />
          {order.project && (
            <Row label="Dự án"        value={order.project.name} />
          )}
          {order.lot_no && (
            <Row label="Số lô"        value={order.lot_no} />
          )}
          {order.expiry_date && (
            <Row label="Hạn sử dụng"  value={formatDate(order.expiry_date)} />
          )}
          {order.is_intercompany && order.counterpart_company && (
            <Row label="Công ty đối tác" value={order.counterpart_company.name} />
          )}
        </div>

        {/* Financial summary */}
        <div className="mt-6 grid grid-cols-3 gap-4">
          <FinCard label="Tổng cộng"   value={formatVND(Number(order.grand_total))} />
          <FinCard label="Đã thanh toán" value={formatVND(Number(order.amount_paid))} />
          <FinCard
            label="Còn lại"
            value={formatVND(Number(order.outstanding))}
            highlight={Number(order.outstanding) > 0}
          />
        </div>
      </div>

      {/* Items table */}
      <div className="rounded-xl border bg-white overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h2 className="font-medium text-gray-900">Dòng hàng</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left">Sản phẩm</th>
              <th className="px-4 py-3 text-left">Mô tả</th>
              <th className="px-4 py-3 text-right">SL</th>
              <th className="px-4 py-3 text-right">Đơn giá</th>
              <th className="px-4 py-3 text-right">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((it) => (
              <tr key={it.id} className="border-t">
                <td className="px-4 py-3 text-gray-700">
                  {it.product
                    ? <><span className="font-medium">{it.product.name}</span>{' '}<span className="text-xs text-gray-400">[{it.product.code}]</span></>
                    : <span className="text-gray-400">—</span>}
                </td>
                <td className="px-4 py-3 text-gray-600">{it.description ?? '—'}</td>
                <td className="px-4 py-3 text-right">{Number(it.qty).toLocaleString('vi-VN')}</td>
                <td className="px-4 py-3 text-right">{formatVND(Number(it.unit_price))}</td>
                <td className="px-4 py-3 text-right font-medium">{formatVND(Number(it.line_total))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t bg-gray-50">
            <tr>
              <td colSpan={4} className="px-4 py-3 text-right font-medium text-gray-700">Tổng cộng</td>
              <td className="px-4 py-3 text-right font-bold text-gray-900">{formatVND(Number(order.grand_total))}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Action buttons (edit, advance status, delete) */}
      <OrderDetailActions
        order={order}
        canWrite={write}
        canApprove={approve}
        companies={companies.map((c) => ({ id: c.id, name: c.name }))}
        customers={customers}
        projects={projects.map((p) => ({ id: p.id, code: p.code, name: p.name, company_id: p.company_id }))}
        products={products.map((p) => ({ id: p.id, code: p.code, name: p.name }))}
      />
    </div>
  )
}

// ── Helper sub-components ─────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-gray-500 w-36 shrink-0">{label}</span>
      <span className="text-gray-900">{value}</span>
    </div>
  )
}

function FinCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg bg-gray-50 px-4 py-3">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`font-semibold text-lg ${highlight ? 'text-orange-600' : 'text-gray-900'}`}>{value}</p>
    </div>
  )
}
