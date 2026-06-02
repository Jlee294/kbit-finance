import Link from 'next/link'
import { listPurchaseInvoices } from '@/features/invoices/queries'
import { listCompanies } from '@/features/companies/queries'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatsCard } from '@/components/shared/StatsCard'
import { FilterBar, FilterField, FilterSubmit, FILTER_CONTROL } from '@/components/shared/FilterBar'
import { EmptyState } from '@/components/shared/EmptyState'
import { PAGE_WRAPPER } from '@/lib/ui-tokens'

export const dynamic = 'force-dynamic'

function fmtVND(v: number) { return v.toLocaleString('vi-VN') }
function fmtDate(s: string | null) { return s ? new Date(s).toLocaleDateString('vi-VN') : '—' }

const ORDER_TYPE_LABEL: Record<string, string> = {
  domestic: 'Trong nước',
  import:   'Nhập khẩu',
}

export default async function BangKeMuaVaoPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; from?: string; to?: string }>
}) {
  const sp = await searchParams
  const [rows, companies] = await Promise.all([
    listPurchaseInvoices({
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
    <div className={PAGE_WRAPPER}>
      <PageHeader
        title="Bảng kê mua vào"
        subtitle={`Mỗi hóa đơn 1 dòng — lấy từ Nhật ký mua vào (${rows.length} hóa đơn)`}
      />

      <div className="grid grid-cols-3 gap-3">
        <StatsCard label="Tổng tiền hàng (chưa VAT)" value={`${fmtVND(totalSubtotal)} đ`} accent="neutral" />
        <StatsCard label="Tổng VAT"                  value={`${fmtVND(totalVat)} đ`}      accent="info" />
        <StatsCard label="Tổng cộng"                 value={`${fmtVND(totalGrand)} đ`}    accent="brand" />
      </div>

      <FilterBar>
        <FilterField label="Công ty">
          <select name="company" defaultValue={sp.company ?? ''} className={`${FILTER_CONTROL} min-w-[160px]`}>
            <option value="">Tất cả</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </FilterField>
        <FilterField label="Từ ngày">
          <input type="date" name="from" defaultValue={sp.from ?? ''} className={FILTER_CONTROL} />
        </FilterField>
        <FilterField label="Đến ngày">
          <input type="date" name="to" defaultValue={sp.to ?? ''} className={FILTER_CONTROL} />
        </FilterField>
        <FilterSubmit />
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState
          icon="📥"
          title="Chưa có hóa đơn mua vào nào"
          description="Vào Nhật ký mua vào để tạo hóa đơn đầu tiên, hoặc import từ XML"
        />
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-x-auto">
          <table className="w-full text-xs min-w-[1400px]">
            <thead>
              <tr className="border-b border-brand-100 bg-brand-50/60 text-[10px] text-brand-800 font-semibold tracking-wide">
                <th className="px-2 py-2 text-left">Mẫu HĐ</th>
                <th className="px-2 py-2 text-left">Ký hiệu</th>
                <th className="px-2 py-2 text-left">Số HĐ</th>
                <th className="px-2 py-2 text-left">Ngày HĐ</th>
                <th className="px-2 py-2 text-left">Nhà cung cấp</th>
                <th className="px-2 py-2 text-left">MST NCC</th>
                <th className="px-2 py-2 text-left">Mặt hàng</th>
                <th className="px-2 py-2 text-right">Thành tiền</th>
                <th className="px-2 py-2 text-right">VAT</th>
                <th className="px-2 py-2 text-right">Tổng HĐ</th>
                <th className="px-2 py-2 text-left">Loại</th>
                <th className="px-2 py-2 text-left">Mã đơn</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-brand-50/40">
                  <td className="px-2 py-1.5 text-gray-500">{r.invoice_template ?? '—'}</td>
                  <td className="px-2 py-1.5 text-gray-500">{r.invoice_symbol ?? '—'}</td>
                  <td className="px-2 py-1.5 font-mono">{r.invoice_no ?? '—'}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-gray-500">{fmtDate(r.invoice_date ?? r.order_date)}</td>
                  <td className="px-2 py-1.5 text-gray-800">
                    {r.supplier_name}
                    <span className="text-[10px] text-gray-400 ml-1">[{r.supplier_code}]</span>
                  </td>
                  <td className="px-2 py-1.5 font-mono text-gray-500">{r.supplier_tax_code ?? '—'}</td>
                  <td className="px-2 py-1.5 text-gray-600 max-w-[200px] truncate" title={r.noi_dung}>{r.noi_dung || '—'}</td>
                  <td className="px-2 py-1.5 text-right text-gray-700">{fmtVND(r.subtotal)}</td>
                  <td className="px-2 py-1.5 text-right text-brand-800">{fmtVND(r.vat_amount)}</td>
                  <td className="px-2 py-1.5 text-right font-medium text-gray-900">{fmtVND(r.grand_total)}</td>
                  <td className="px-2 py-1.5">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                      {ORDER_TYPE_LABEL[r.order_type] ?? r.order_type}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    <Link href={`/nhap-khau/${r.id}`} className="font-mono text-[10px] text-brand-700 hover:underline">
                      {r.order_code}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-brand-50/40 font-semibold text-gray-900 border-t border-brand-100">
                <td colSpan={7} className="px-2 py-2 text-right text-xs">Tổng cộng:</td>
                <td className="px-2 py-2 text-right text-xs">{fmtVND(totalSubtotal)}</td>
                <td className="px-2 py-2 text-right text-xs text-brand-800">{fmtVND(totalVat)}</td>
                <td className="px-2 py-2 text-right text-xs">{fmtVND(totalGrand)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
