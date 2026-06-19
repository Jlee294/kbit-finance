import Link from 'next/link'
import { listSalesInvoices } from '@/features/invoices/queries'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatsCard } from '@/components/shared/StatsCard'
import { FilterBar, FilterReset } from '@/components/shared/FilterBar'
import { PeriodFields } from '@/components/shared/PeriodFields'
import { AutoSubmit } from '@/components/shared/AutoSubmit'
import { EmptyState } from '@/components/shared/EmptyState'
import { PAGE_WRAPPER } from '@/lib/ui-tokens'
import { getGlobalFilter } from '@/lib/global-filter'
import { resolveRange } from '@/lib/date-range'
import { getT } from '@/lib/i18n/server'

export const dynamic = 'force-dynamic'

function fmtVND(v: number) { return v.toLocaleString('vi-VN') }
function fmtDate(s: string | null) { return s ? new Date(s).toLocaleDateString('vi-VN') : '—' }

export default async function BangKeBanRaPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>
}) {
  const t = await getT()
  const sp = await searchParams
  const { companyId, year } = await getGlobalFilter()
  const range = resolveRange(year, sp.period, sp.from, sp.to)
  const rows = await listSalesInvoices({
    companyId: companyId || undefined,
    from:      range.from,
    to:        range.to,
    limit:     500,
  })

  const totalSubtotal = rows.reduce((s, r) => s + r.subtotal,    0)
  const totalVat      = rows.reduce((s, r) => s + r.vat_amount,  0)
  const totalGrand    = rows.reduce((s, r) => s + r.grand_total, 0)

  return (
    <div className={PAGE_WRAPPER}>
      <PageHeader
        title={t('Bảng kê bán ra')}
        subtitle={`${t('Kê theo ngày hóa đơn · lọc theo công ty & năm đang chọn')} — ${rows.length} ${t('hóa đơn')} (${range.from} → ${range.to})`}
      />

      <div className="grid grid-cols-3 gap-3">
        <StatsCard label="Tổng tiền hàng (chưa VAT)" value={`${fmtVND(totalSubtotal)} đ`} accent="neutral" />
        <StatsCard label="Tổng VAT"                  value={`${fmtVND(totalVat)} đ`}      accent="info" />
        <StatsCard label="Tổng cộng"                 value={`${fmtVND(totalGrand)} đ`}    accent="brand" />
      </div>

      <FilterBar>
        <AutoSubmit />
        <PeriodFields period={sp.period} from={sp.from} to={sp.to} />
        <FilterReset href="/bang-ke-ban-ra" />
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState
          icon="📋"
          title={t('Không có hóa đơn bán ra trong kỳ')}
          description="Đổi công ty/năm ở thanh trên, hoặc đổi tháng/khoảng ngày."
        />
      ) : (
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-x-auto">
          <table className="w-full text-xs min-w-[1300px]">
            <thead>
              <tr className="border-b border-brand-100 bg-brand-50/60 text-[10px] text-brand-800 font-semibold tracking-wide">
                <th className="px-2 py-2 text-left">{t('Mẫu HĐ')}</th>
                <th className="px-2 py-2 text-left">{t('Ký hiệu')}</th>
                <th className="px-2 py-2 text-left">{t('Số HĐ')}</th>
                <th className="px-2 py-2 text-left">{t('Ngày HĐ')}</th>
                <th className="px-2 py-2 text-left">{t('Ngày đơn')}</th>
                <th className="px-2 py-2 text-left">{t('Khách hàng')}</th>
                <th className="px-2 py-2 text-left">{t('MST')}</th>
                <th className="px-2 py-2 text-left">{t('Nội dung')}</th>
                <th className="px-2 py-2 text-right">{t('Thành tiền')}</th>
                <th className="px-2 py-2 text-right">{t('Thuế suất')}</th>
                <th className="px-2 py-2 text-right">VAT</th>
                <th className="px-2 py-2 text-right">{t('Tổng HĐ')}</th>
                <th className="px-2 py-2 text-left">{t('Mã đơn')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr className="bg-brand-50/50 font-semibold text-gray-900 border-b-2 border-brand-200">
                <td colSpan={8} className="px-2 py-2 text-right text-xs">TỔNG CỘNG ({rows.length} HĐ):</td>
                <td className="px-2 py-2 text-right text-xs">{fmtVND(totalSubtotal)}</td>
                <td></td>
                <td className="px-2 py-2 text-right text-xs text-brand-800">{fmtVND(totalVat)}</td>
                <td className="px-2 py-2 text-right text-xs">{fmtVND(totalGrand)}</td>
                <td></td>
              </tr>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-brand-50/40">
                  <td className="px-2 py-1.5 text-gray-500">{r.invoice_template ?? '—'}</td>
                  <td className="px-2 py-1.5 text-gray-500">{r.invoice_symbol ?? '—'}</td>
                  <td className="px-2 py-1.5 font-mono">{r.invoice_no ?? '—'}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-gray-500">{fmtDate(r.invoice_date)}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-gray-400">{fmtDate(r.order_date)}</td>
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
              <tr className="bg-brand-50/40 font-semibold text-gray-900 border-t border-brand-100">
                <td colSpan={8} className="px-2 py-2 text-right text-xs">Tổng cộng:</td>
                <td className="px-2 py-2 text-right text-xs">{fmtVND(totalSubtotal)}</td>
                <td></td>
                <td className="px-2 py-2 text-right text-xs text-brand-800">{fmtVND(totalVat)}</td>
                <td className="px-2 py-2 text-right text-xs">{fmtVND(totalGrand)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
      </div>
      )}
    </div>
  )
}
