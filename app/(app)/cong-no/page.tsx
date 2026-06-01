import {
  listAccountsReceivable,
  listAccountsPayable,
  listInternalReceivables,
  listUnassignedDeposits,
} from '@/features/debts/queries'
import { listCompanies } from '@/features/companies/queries'

export const dynamic = 'force-dynamic'

function fmtVND(v: number) { return v.toLocaleString('vi-VN') + ' đ' }
function fmtDate(s: string | null) { return s ? new Date(s).toLocaleDateString('vi-VN') : '—' }
function daysSince(s: string | null) {
  if (!s) return 0
  const ms = Date.now() - new Date(s).getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

export default async function CongNoPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>
}) {
  const sp = await searchParams
  const [ar, ap, ir, deposits, companies] = await Promise.all([
    listAccountsReceivable({ companyId: sp.company || undefined }),
    listAccountsPayable({   companyId: sp.company || undefined }),
    listInternalReceivables(),
    listUnassignedDeposits(),
    listCompanies(),
  ])

  const totalAr   = ar.reduce((s, r) => s + r.outstanding, 0)
  const totalAp   = ap.reduce((s, r) => s + r.outstanding, 0)
  const totalIr   = ir.reduce((s, r) => s + r.outstanding, 0)
  const totalDep  = deposits.reduce((s, r) => s + r.amount_vnd, 0)
  const netDebt   = totalAr + totalIr - totalAp - totalDep   // ròng (+ là đối ứng cho ta nợ ta, - là ta nợ)

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Công nợ</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Tổng hợp tự động từ Nhật ký bán/mua, Ngân hàng, Chứng từ khác
        </p>
      </div>

      {/* Filter */}
      <form method="get" className="flex flex-wrap gap-3 bg-white rounded-xl border px-4 py-3 shadow-sm items-end">
        <div className="space-y-1">
          <p className="text-xs text-gray-500">Công ty</p>
          <select name="company" defaultValue={sp.company ?? ''}
            className="h-8 rounded-md border text-sm px-2 bg-white min-w-[180px]">
            <option value="">Tất cả</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <button type="submit" className="h-8 px-3 bg-gray-100 text-gray-700 rounded-md text-sm hover:bg-gray-200">
          Lọc
        </button>
      </form>

      {/* 4 KPI cards — accent border-top theo loại */}
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 border-t-4 border-t-warning-500 shadow-sm">
          <p className="text-xs text-gray-500 font-medium">Phải thu KH</p>
          <p className="text-lg font-semibold text-warning-700 mt-1">{fmtVND(totalAr)}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">{ar.length} khách hàng</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 border-t-4 border-t-danger-500 shadow-sm">
          <p className="text-xs text-gray-500 font-medium">Phải trả NCC</p>
          <p className="text-lg font-semibold text-danger-700 mt-1">{fmtVND(totalAp)}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">{ap.length} nhà cung cấp</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 border-t-4 border-t-brand-500 shadow-sm">
          <p className="text-xs text-gray-500 font-medium">Chi hộ chưa thu lại</p>
          <p className="text-lg font-semibold text-brand-700 mt-1">{fmtVND(totalIr)}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">{ir.length} nhân viên</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 border-t-4 border-t-info-500 shadow-sm">
          <p className="text-xs text-gray-500 font-medium">Thu cọc chưa gắn đơn</p>
          <p className="text-lg font-semibold text-info-700 mt-1">{fmtVND(totalDep)}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">{deposits.length} phiếu</p>
        </div>
      </div>

      {/* Net summary — gradient brand */}
      <div className={`rounded-xl px-5 py-4 shadow-sm ${
        netDebt >= 0
          ? 'bg-gradient-to-r from-brand-800 to-brand-700 text-white'
          : 'bg-gradient-to-r from-danger-700 to-danger-500 text-white'
      }`}>
        <p className="text-xs uppercase tracking-wider font-semibold opacity-80">
          Công nợ ròng (Phải thu − Phải trả − Thu cọc)
        </p>
        <p className="text-2xl font-bold mt-1">
          {netDebt >= 0 ? '' : '−'}{fmtVND(Math.abs(netDebt))}
        </p>
        <p className="text-xs opacity-75 mt-1">
          {netDebt >= 0
            ? 'Đối tác đang nợ ta nhiều hơn ta nợ họ'
            : 'Ta đang nợ đối tác nhiều hơn họ nợ ta'}
        </p>
      </div>

      {/* AR — Phải thu KH */}
      <Section title="Phải thu khách hàng (AR)" count={ar.length}>
        {ar.length === 0 ? (
          <Empty>Không có công nợ phải thu</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[10px] text-gray-500 uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Khách hàng</th>
                <th className="px-3 py-2 text-left">Công ty</th>
                <th className="px-3 py-2 text-right">Số đơn</th>
                <th className="px-3 py-2 text-right">Tổng đơn</th>
                <th className="px-3 py-2 text-right">Đã thu</th>
                <th className="px-3 py-2 text-right">Còn phải thu</th>
                <th className="px-3 py-2 text-right">Đơn cũ nhất</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {ar.map((r) => {
                const days = daysSince(r.oldest_date)
                return (
                  <tr key={r.customer_id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-800 text-xs">
                      {r.customer_name}
                      <span className="text-[10px] text-gray-400 ml-1">[{r.customer_code}]</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">{r.company_name ?? '—'}</td>
                    <td className="px-3 py-2 text-right text-xs text-gray-600">{r.orders_count}</td>
                    <td className="px-3 py-2 text-right text-xs text-gray-700">{fmtVND(r.total_amount)}</td>
                    <td className="px-3 py-2 text-right text-xs text-green-700">{fmtVND(r.total_paid)}</td>
                    <td className="px-3 py-2 text-right text-xs font-semibold text-amber-700">{fmtVND(r.outstanding)}</td>
                    <td className="px-3 py-2 text-right text-xs">
                      <span className={days > 60 ? 'text-red-600 font-medium' : 'text-gray-500'}>
                        {fmtDate(r.oldest_date)} <span className="text-[10px] text-gray-400">({days}d)</span>
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-semibold">
                <td colSpan={5} className="px-3 py-2 text-right text-xs">Tổng:</td>
                <td className="px-3 py-2 text-right text-sm text-amber-700">{fmtVND(totalAr)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        )}
      </Section>

      {/* AP — Phải trả NCC */}
      <Section title="Phải trả nhà cung cấp (AP)" count={ap.length}>
        {ap.length === 0 ? (
          <Empty>Không có công nợ phải trả</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[10px] text-gray-500 uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Nhà cung cấp</th>
                <th className="px-3 py-2 text-left">Công ty</th>
                <th className="px-3 py-2 text-right">Số đơn</th>
                <th className="px-3 py-2 text-right">Tổng đơn (VNĐ)</th>
                <th className="px-3 py-2 text-right">Đã trả</th>
                <th className="px-3 py-2 text-right">Còn phải trả</th>
                <th className="px-3 py-2 text-right">Đơn cũ nhất</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {ap.map((r) => {
                const days = daysSince(r.oldest_date)
                return (
                  <tr key={r.supplier_id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-800 text-xs">
                      {r.supplier_name}
                      <span className="text-[10px] text-gray-400 ml-1">[{r.supplier_code}]</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">{r.company_name ?? '—'}</td>
                    <td className="px-3 py-2 text-right text-xs text-gray-600">{r.orders_count}</td>
                    <td className="px-3 py-2 text-right text-xs text-gray-700">{fmtVND(r.total_amount)}</td>
                    <td className="px-3 py-2 text-right text-xs text-green-700">{fmtVND(r.total_paid)}</td>
                    <td className="px-3 py-2 text-right text-xs font-semibold text-red-600">{fmtVND(r.outstanding)}</td>
                    <td className="px-3 py-2 text-right text-xs">
                      <span className={days > 60 ? 'text-red-600 font-medium' : 'text-gray-500'}>
                        {fmtDate(r.oldest_date)} <span className="text-[10px] text-gray-400">({days}d)</span>
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-semibold">
                <td colSpan={5} className="px-3 py-2 text-right text-xs">Tổng:</td>
                <td className="px-3 py-2 text-right text-sm text-red-600">{fmtVND(totalAp)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        )}
      </Section>

      {/* IR — Chi hộ nhân viên */}
      <Section title="Chi hộ chưa thu lại (nhân viên)" count={ir.length}>
        {ir.length === 0 ? (
          <Empty>Không có khoản chi hộ nào chưa thu</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[10px] text-gray-500 uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Nhân viên</th>
                <th className="px-3 py-2 text-left">Ngày chi</th>
                <th className="px-3 py-2 text-left">Nội dung</th>
                <th className="px-3 py-2 text-right">Tiền chi hộ</th>
                <th className="px-3 py-2 text-right">Đã thu lại</th>
                <th className="px-3 py-2 text-right">Còn phải thu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {ir.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-800 text-xs">{r.person}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{fmtDate(r.txn_date)}</td>
                  <td className="px-3 py-2 text-xs text-gray-600 max-w-[300px] truncate" title={r.note ?? ''}>{r.note ?? '—'}</td>
                  <td className="px-3 py-2 text-right text-xs text-gray-700">{fmtVND(r.amount)}</td>
                  <td className="px-3 py-2 text-right text-xs text-green-700">{fmtVND(r.collected_amount)}</td>
                  <td className="px-3 py-2 text-right text-xs font-semibold text-purple-700">{fmtVND(r.outstanding)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-semibold">
                <td colSpan={5} className="px-3 py-2 text-right text-xs">Tổng:</td>
                <td className="px-3 py-2 text-right text-sm text-purple-700">{fmtVND(totalIr)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </Section>

      {/* Deposits — Thu cọc chưa gắn đơn */}
      <Section title="Phiếu thu cọc chưa gắn đơn" count={deposits.length}>
        {deposits.length === 0 ? (
          <Empty>Không có phiếu cọc nào chưa gắn đơn</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[10px] text-gray-500 uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Khách hàng</th>
                <th className="px-3 py-2 text-left">Ngày thu</th>
                <th className="px-3 py-2 text-right">Số tiền</th>
                <th className="px-3 py-2 text-left">Ghi chú</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {deposits.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-800 text-xs">{r.customer_name || <span className="text-gray-400">—</span>}</td>
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
