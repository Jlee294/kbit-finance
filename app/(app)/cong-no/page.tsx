import {
  listInternalReceivables,
  listUnassignedDeposits,
  getReceivableLedger,
  getPayableLedger,
} from '@/features/debts/queries'
import { CongNoLedger } from '@/features/debts/components/CongNoLedger'
import { depositNeedsAllocation } from '@/features/debts/warnings'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatsCard } from '@/components/shared/StatsCard'
import { FilterBar, FilterField, FILTER_CONTROL } from '@/components/shared/FilterBar'
import { AutoSubmit } from '@/components/shared/AutoSubmit'
import { getGlobalFilter } from '@/lib/global-filter'
import { PAGE_WRAPPER } from '@/lib/ui-tokens'
import { getT } from '@/lib/i18n/server'

export const dynamic = 'force-dynamic'

function fmtVND(v: number) { return Math.round(v).toLocaleString('vi-VN') + ' đ' }
function fmtDate(s: string | null) { return s ? new Date(s).toLocaleDateString('vi-VN') : '—' }

export default async function CongNoPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>
}) {
  const t = await getT()
  const sp = await searchParams
  const gf = await getGlobalFilter()
  const year = parseInt(gf.year, 10)
  const companyId = gf.companyId || undefined
  const type = sp.type || 'ar'

  const [ar, ap, ir, deposits] = await Promise.all([
    getReceivableLedger(year, companyId),
    getPayableLedger(year, companyId),
    listInternalReceivables(),
    listUnassignedDeposits(),
  ])

  const totalArClose = ar.reduce((s, r) => s + (r.closing > 0 ? r.closing : 0), 0)
  const totalApClose = ap.reduce((s, r) => s + (r.closing > 0 ? r.closing : 0), 0)
  const totalIr  = ir.reduce((s, r) => s + r.outstanding, 0)
  const totalDep = deposits.reduce((s, r) => s + r.amount_vnd, 0)

  return (
    <div className={PAGE_WRAPPER}>
      <PageHeader
        title={t('Công nợ')}
        subtitle={`${t('Công nợ')} ${year} — ${t('phải thu (131) & phải trả (331). Bấm 1 dòng để xem chi tiết.')}`}
      />

      <FilterBar>
        <AutoSubmit />
        <FilterField label={t('Loại công nợ')}>
          <select name="type" defaultValue={type} className={`${FILTER_CONTROL} min-w-[160px]`}>
            <option value="ar">{t('Phải thu khách hàng')}</option>
            <option value="ap">{t('Phải trả nhà cung cấp')}</option>
            <option value="ir">{t('Chi hộ nhân viên')}</option>
            <option value="deposit">{t('Thu cọc chưa gắn')}</option>
          </select>
        </FilterField>
      </FilterBar>

      <div className="grid grid-cols-4 gap-3">
        <StatsCard label={t('Phải thu cuối kỳ')} value={fmtVND(totalArClose)} accent="warning" footer={`${ar.length} ${t('khách hàng')}`} />
        <StatsCard label={t('Phải trả cuối kỳ')} value={fmtVND(totalApClose)} accent="danger"  footer={`${ap.length} ${t('nhà cung cấp')}`} />
        <StatsCard label={t('Chi hộ chưa thu lại')} value={fmtVND(totalIr)} accent="brand" footer={`${ir.length} ${t('nhân viên')}`} />
        <StatsCard label={t('Thu cọc chưa gắn đơn')} value={fmtVND(totalDep)} accent="info" footer={`${deposits.length} ${t('phiếu')}`} />
      </div>

      {type === 'ar' && (
        <CongNoLedger title={t('Công nợ phải thu khách hàng (TK 131)')} rows={ar} kind="AR" hrefBase="/don-hang" />
      )}
      {type === 'ap' && (
        <CongNoLedger title={t('Công nợ phải trả nhà cung cấp (TK 331)')} rows={ap} kind="AP" hrefBase="/nhap-khau" />
      )}

      {/* IR — Chi hộ nhân viên */}
      {type === 'ir' && (
      <Section title={t('Chi hộ chưa thu lại (nhân viên)')} count={ir.length}>
        {ir.length === 0 ? (
          <Empty>{t('Không có khoản chi hộ nào chưa thu')}</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[10px] text-gray-500 uppercase">
              <tr>
                <th className="px-3 py-2 text-left">{t('Nhân viên')}</th>
                <th className="px-3 py-2 text-left">{t('Ngày chi')}</th>
                <th className="px-3 py-2 text-left">{t('Nội dung')}</th>
                <th className="px-3 py-2 text-right">{t('Tiền chi hộ')}</th>
                <th className="px-3 py-2 text-right">{t('Đã thu lại')}</th>
                <th className="px-3 py-2 text-right">{t('Còn phải thu')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {ir.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-800 text-xs">{r.person}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{fmtDate(r.txn_date)}</td>
                  <td className="px-3 py-2 text-xs text-gray-600 max-w-[300px] truncate" title={r.note ?? ''}>{r.note ?? '—'}</td>
                  <td className="px-3 py-2 text-right text-xs text-gray-700">{fmtVND(r.amount)}</td>
                  <td className="px-3 py-2 text-right text-xs text-brand-700">{fmtVND(r.collected_amount)}</td>
                  <td className="px-3 py-2 text-right text-xs font-semibold text-purple-700">{fmtVND(r.outstanding)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-semibold">
                <td colSpan={5} className="px-3 py-2 text-right text-xs">{t('Tổng:')}</td>
                <td className="px-3 py-2 text-right text-sm text-purple-700">{fmtVND(totalIr)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </Section>
      )}

      {/* Deposits — Thu cọc chưa gắn đơn */}
      {type === 'deposit' && (
      <Section title={t('Phiếu thu cọc chưa gắn đơn')} count={deposits.length}>
        {deposits.length === 0 ? (
          <Empty>{t('Không có phiếu cọc nào chưa gắn đơn')}</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[10px] text-gray-500 uppercase">
              <tr>
                <th className="px-3 py-2 text-left">{t('Khách hàng')}</th>
                <th className="px-3 py-2 text-left">{t('Ngày thu')}</th>
                <th className="px-3 py-2 text-right">{t('Số tiền')}</th>
                <th className="px-3 py-2 text-left">{t('Ghi chú')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {deposits.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-800 text-xs">
                    {r.customer_name || <span className="text-gray-400">—</span>}
                    {depositNeedsAllocation(r, ar) ? <span className="block text-[10px] text-amber-700 font-medium">{t('⚠ Khách đang có đơn nợ — nên gắn tiền vào đơn')}</span> : null}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">{fmtDate(r.txn_date)}</td>
                  <td className="px-3 py-2 text-right text-xs text-brand-800 font-medium">
                    {r.currency !== 'VND' && r.amount.toLocaleString() + ' ' + r.currency + ' / '}
                    {fmtVND(r.amount_vnd)}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">{r.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
      )}
    </div>
  )
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-700 mb-2 flex items-baseline gap-2">
        {title}
        <span className="text-xs text-gray-400 font-normal">({count})</span>
      </h2>
      <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
        {children}
      </div>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-6 py-8 text-center text-sm text-gray-400">{children}</div>
}
