import Link from 'next/link'
import { listSalesInvoices } from '@/features/invoices/queries'
import { listCompanies } from '@/features/companies/queries'

export const dynamic = 'force-dynamic'

function fmtVND(v: number) { return v.toLocaleString('vi-VN') }
function fmtDate(s: string | null) { return s ? new Date(s).toLocaleDateString('vi-VN') : '—' }

export default async function BangKeBanRaPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; from?: string; to?: string }>
}) {
  const sp = await searchParams
  const [rows, companies] = await Promise.all([
    listSalesInvoices({
      companyId: sp.company || undefined,
      from:      sp.from    || undefined,
      to:        sp.to      || undefined,
      limit:     500,
    }),
    listCompanies(),
  ])

  const totalSubtotal = rows.reduce((s, r) => s + r.subtotal,    0)
  const totalVat      = rows.reduce((s, r) => s + r.vat_amount,  0)
  const totalGrand    = rows.reduce((s, r) => s + r.grand_total, 0)

  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Bảng kê bán ra</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Mỗi hóa đơn 1 dòng — dữ liệu lấy từ Nhật ký bán ra ({rows.length} hóa đơn)
        </p>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border bg-white px-4 py-3">
          <p className="text-xs text-gray-500">Tổng tiền hàng (chưa VAT)</p>
          <p className="text-lg font-semibold text-gray-900">{fmtVND(totalSubtotal)} đ</p>
        </div>
        <div className="rounded-xl border bg-white px-4 py-3">
          <p className="text-xs text-gray-500">Tổng VAT</p>
          <p className="text-lg font-semibold text-brand-800">{fmtVND(totalVat)} đ</p>
        </div>
        <div className="rounded-xl border bg-white px-4 py-3">
          <p className="text-xs text-gray-500">Tổng cộng</p>
          <p className="text-lg font-semibold text-gray-900">{fmtVND(totalGrand)} đ</p>
        </div>
      </div>

      {/* Filter */}
      <form method="get" className="flex flex-wrap gap-3 bg-white rounded-xl border px-4 py-3 shadow-sm items-end">
        <div className="space-y-1">
          <p className="text-xs text-gray-500">Công ty</p>
          <select name="company" defaultValue={sp.company ?? ''}
            className="h-8 rounded-md border text-sm px-2 bg-white min-w-[140px]">
            <option value="">Tất cả</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-gray-500">Từ ngày</p>
          <input type="date" name="from" defaultValue={sp.from ?? ''}
            className="h-8 rounded-md border text-sm px-2 bg-white" />
        </div>
        <div className="space-y-1">
          <p className="text-xs text-gray-500">Đến ngày</p>
          <input type="date" name="to" defaultValue={sp.to ?? ''}
            className="h-8 rounded-md border text-sm px-2 bg-white" />
        </div>
        <button type="submit" className="h-8 px-3 bg-gray-100 text-gray-700 rounded-md text-sm hover:bg-gray-200">Lọc</button>
      </form>

      {/* Table */}
      <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
        {rows.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-gray-400">Chưa có hóa đơn bán ra nào.</div>
        ) : (
          <table className="w-full text-xs min-w-[1300px]">
            <thead>
              <tr className="border-b bg-gray-50 text-[10px] text-gray-500 uppercase">
                <th className="px-2 py-2 text-left">Mẫu HĐ</th>
                <th className="px-2 py-2 text-left">Ký hiệu</th>
                <th className="px-2 py-2 text-left">Số HĐ</th>
                <th className="px-2 py-2 text-left">Ngày HĐ</th>
                <th className="px-2 py-2 text-left">Khách hàng</th>
                <th className="px-2 py-2 text-left">MST</th>
                <th className="px-2 py-2 text-left">Nội dung</th>
                <th className="px-2 py-2 text-right">Thành tiền</th>
                <th className="px-2 py-2 text-right">Thuế suất</th>
                <th className="px-2 py-2 text-right">VAT</th>
                <th className="px-2 py-2 text-right">Tổng HĐ</th>
                <th className="px-2 py-2 text-left">Mã đơn</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-2 py-1.5 text-gray-500">{r.invoice_template ?? '—'}</td>
                  <td className="px-2 py-1.5 text-gray-500">{r.invoice_symbol ?? '—'}</td>
                  <td className="px-2 py-1.5 font-mono">{r.invoice_no ?? '—'}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-gray-500">{fmtDate(r.invoice_date ?? r.order_date)}</td>
                  <td className="px-2 py-1.5 text-gray-800">
                    {r.customer_name}
                    <span className="text-[10px] text-gray-400 ml-1">[{r.customer_code}]</span>
                  </td>
                  <td className="px-2 py-1.5 font-mono text-gray-500">{r.customer_tax_code ?? '—'}</td>
                  <td className="px-2 py-1.5 text-gray-600 max-w-[200px] truncate" title={r.noi_dung}>{r.noi_dung || '—'}</td>
                  <td className="px-2 py-1.5 text-right text-gray-700">{fmtVND(r.subtotal)}</td>
                  <td className="px-2 py-1.5 text-right text-gray-500">{r.vat_pct}%</td>
                  <td className="px-2 py-1.5 text-right text-brand-800">{fmtVND(r.vat_amount)}</td>
                  <td className="px-2 py-1.5 text-right font-medium text-gray-900">{fmtVND(r.grand_total)}</td>
                  <td className="px-2 py-1.5">
                    <Link href={`/don-hang/${r.id}`} className="font-mono text-[10px] text-brand-700 hover:underline">
                      {r.order_code}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-semibold text-gray-900">
                <td colSpan={7} className="px-2 py-2 text-right text-xs">Tổng cộng:</td>
                <td className="px-2 py-2 text-right text-xs">{fmtVND(totalSubtotal)}</td>
                <td></td>
                <td className="px-2 py-2 text-right text-xs text-brand-800">{fmtVND(totalVat)}</td>
                <td className="px-2 py-2 text-right text-xs">{fmtVND(totalGrand)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  )
}
