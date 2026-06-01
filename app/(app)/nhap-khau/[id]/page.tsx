import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getCurrentUser, canEdit } from '@/lib/auth'
import { getImportOrder } from '@/features/imports/queries'
import { listCompanies }  from '@/features/companies/queries'
import { listSuppliers }  from '@/features/suppliers/queries'
import { listProducts }   from '@/features/products/queries'
import { listProjects }   from '@/features/projects/queries'
import { formatVND, formatKRW } from '@/lib/format'
import { ImportOrderDetailClient } from '@/features/imports/components/ImportOrderDetailClient'

export const dynamic = 'force-dynamic'

export default async function ImportOrderDetailPage({ params }: { params: { id: string } }) {
  const { id } = await params as unknown as { id: string }

  const [me, order, companies, suppliersRaw, productsRaw, projects] = await Promise.all([
    getCurrentUser(),
    getImportOrder(id).catch(() => null),
    listCompanies(),
    listSuppliers(),
    listProducts(),
    listProjects(),
  ])

  if (!order) notFound()

  const canWrite  = !!me && canEdit(me.role)
  const suppliers = suppliersRaw.map((s) => ({ id: s.id, code: s.code as string, name: s.name }))
  const products  = productsRaw.map((p) => ({ id: p.id, code: p.code as string, name: p.name, unit: p.unit as string | null }))
  const isKrw     = order.currency === 'KRW'
  const rate      = isKrw ? (order.exchange_rate ?? 1) : 1

  const fmtNative = (n: number) => isKrw ? formatKRW(n) : formatVND(n)
  const totalPayable = order.goods_value + order.import_duty + order.vat_import + order.other_fees

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* ── Breadcrumb ───────────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/nhap-khau" className="hover:text-gray-700">Nhập khẩu</Link>
        <span>/</span>
        <span className="font-medium text-gray-800">{order.order_code}</span>
      </div>

      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="rounded-xl border bg-white shadow-sm p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{order.order_code}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              NCC: <strong>{(order.suppliers as { name: string } | null)?.name ?? '—'}</strong>
              {' · '}Ngày: {order.order_date}
              {' · '}Công ty: {(order.companies as { name: string } | null)?.name ?? '—'}
            </p>
          </div>
          <div className="flex gap-2">
            {canWrite && (
              <ImportOrderDetailClient
                order={order}
                companies={companies.map((c) => ({ id: c.id, name: c.name }))}
                suppliers={suppliers}
                products={products}
                projects={projects.map((p) => ({ id: p.id, code: p.code, name: p.name, company_id: p.company_id }))}
              />
            )}
          </div>
        </div>

        {/* ── Giá vốn lô ───────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 pt-2 border-t">
          <div className="space-y-2 text-sm">
            <p className="font-semibold text-gray-700 mb-1">Chi phí nhập khẩu ({order.currency})</p>
            <div className="flex justify-between text-gray-600">
              <span>Giá mua hàng:</span><span>{fmtNative(order.goods_value)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Thuế nhập khẩu:</span><span>{fmtNative(order.import_duty)}</span>
            </div>
            <div className="flex justify-between text-gray-500 text-xs">
              <span>VAT khâu NK (khấu trừ riêng):</span><span>{fmtNative(order.vat_import)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Phí khác (HQ, vận chuyển...):</span><span>{fmtNative(order.other_fees)}</span>
            </div>
            <div className="flex justify-between font-bold text-brand-800 border-t pt-1">
              <span>Giá vốn lô (cost_total):</span>
              <span>{fmtNative(order.cost_total)}</span>
            </div>
            <p className="text-xs text-gray-400">= Mua + thuế NK + phí khác (không gồm VAT)</p>
            {isKrw && rate > 0 && (
              <div className="flex justify-between text-brand-700 text-xs">
                <span>Quy VNĐ (×{rate}):</span>
                <span>{formatVND(order.cost_total * rate)}</span>
              </div>
            )}
          </div>

          {/* ── Công nợ NCC ─────────────────────────────────────── */}
          <div className="space-y-2 text-sm">
            <p className="font-semibold text-gray-700 mb-1">Công nợ NCC ({order.currency})</p>
            <div className="flex justify-between text-gray-600">
              <span>Tổng phải trả:</span>
              <span>{fmtNative(totalPayable)}</span>
            </div>
            <div className="flex justify-between text-green-700">
              <span>Đã trả:</span><span>{fmtNative(order.amount_paid)}</span>
            </div>
            <div className={`flex justify-between font-bold border-t pt-1 ${order.outstanding > 0 ? 'text-amber-700' : 'text-green-700'}`}>
              <span>Còn nợ (outstanding):</span>
              <span>{order.outstanding > 0 ? fmtNative(order.outstanding) : '✓ Đã thanh toán'}</span>
            </div>
            {canWrite && order.outstanding > 0 && (
              <ImportOrderDetailClient
                order={order}
                mode="pay"
                companies={[]}
                suppliers={[]}
                products={[]}
                projects={[]}
              />
            )}
          </div>
        </div>

        {order.is_intercompany && (
          <div className="rounded-lg bg-purple-50 border border-purple-100 px-4 py-2 text-xs text-purple-700">
            🔗 Giao dịch nội bộ — loại trừ khi hợp nhất báo cáo Group
          </div>
        )}
      </div>

      {/* ── Dòng hàng ───────────────────────────────────────────── */}
      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b bg-gray-50">
          <h2 className="font-semibold text-gray-800">Dòng hàng</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-600 text-xs border-b bg-gray-50">
              <th className="px-4 py-3 text-left">Sản phẩm</th>
              <th className="px-4 py-3 text-left">Mô tả</th>
              <th className="px-4 py-3 text-right">Số lượng</th>
              <th className="px-4 py-3 text-right">Đơn giá ({order.currency})</th>
              <th className="px-4 py-3 text-right">Thành tiền ({order.currency})</th>
              <th className="px-4 py-3 text-right">
                Giá vốn/đv (VNĐ)
                <span className="block text-gray-400 font-normal">unit_cost</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {order.supplier_order_items.map((item) => {
              const prod = item.products as { code: string; name: string; unit: string | null } | null
              return (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-700">
                    {prod ? `[${prod.code}] ${prod.name}` : <span className="text-gray-400">—</span>}
                    {prod?.unit && <span className="text-xs text-gray-400 ml-1">({prod.unit})</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{item.description ?? '—'}</td>
                  <td className="px-4 py-3 text-right">{item.qty.toLocaleString('vi-VN')}</td>
                  <td className="px-4 py-3 text-right">{fmtNative(item.unit_price)}</td>
                  <td className="px-4 py-3 text-right">{fmtNative(item.line_total)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-brand-800">
                    {item.unit_cost != null ? formatVND(item.unit_cost) : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Hồ sơ nhập khẩu (checklist tĩnh — upload Phase 6) ─── */}
      <div className="rounded-xl border bg-white shadow-sm p-6">
        <h2 className="font-semibold text-gray-800 mb-3">Hồ sơ nhập khẩu</h2>
        <p className="text-xs text-gray-400 mb-3">Gắn chứng từ ở Phase 6</p>
        <ul className="space-y-1.5 text-sm text-gray-600">
          {[
            'Hóa đơn thương mại (Commercial Invoice)',
            'Phiếu đóng gói (Packing List)',
            'Vận đơn (Bill of Lading / Airway Bill)',
            'Tờ khai hải quan (Customs Declaration)',
            'Giấy nộp thuế nhập khẩu & VAT',
            'Giấy chứng nhận chất lượng (COA — Certificate of Analysis)',
          ].map((doc) => (
            <li key={doc} className="flex items-center gap-2">
              <span className="h-4 w-4 rounded border border-gray-300 inline-block flex-shrink-0" />
              {doc}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
