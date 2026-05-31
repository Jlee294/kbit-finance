import Link from 'next/link'
import { getCurrentUser, canApprove } from '@/lib/auth'
import { listPendingIncome, listPendingExpense } from '@/features/approvals/queries'
import { listPeriods } from '@/features/periods/queries'
import { lockPeriod, unlockPeriod } from '@/features/periods/actions'
import { ApproveButton } from '@/features/approvals/components/ApproveButton'
import { formatVND } from '@/lib/format'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

export default async function DuyetKhoaKyPage() {
  const [me, pendingIncome, pendingExpense, periods] = await Promise.all([
    getCurrentUser(),
    listPendingIncome(),
    listPendingExpense(),
    listPeriods(),
  ])

  const approve = !!me && canApprove(me.role)
  const totalPending = pendingIncome.length + pendingExpense.length

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Duyệt & Khóa kỳ</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Kiểm soát luồng duyệt giao dịch và khóa kỳ kế toán
          </p>
        </div>
        <Link href="/duyet-khoa-ky/audit">
          <Button variant="outline" size="sm">Lịch sử thao tác →</Button>
        </Link>
      </div>

      {/* ── Hàng chờ duyệt ─────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-gray-800">Hàng chờ duyệt</h2>
          {totalPending > 0 && (
            <span className="text-xs bg-amber-100 text-amber-700 font-semibold px-2 py-0.5 rounded-full">
              {totalPending}
            </span>
          )}
        </div>

        {/* Thu tiền */}
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b bg-gray-50">
            <p className="font-medium text-sm text-gray-700">
              Thu tiền
              {pendingIncome.length > 0 && (
                <span className="ml-2 text-xs text-amber-600">({pendingIncome.length} chờ)</span>
              )}
            </p>
          </div>
          {pendingIncome.length === 0 ? (
            <div className="px-5 py-4 text-sm text-gray-400">Không có khoản thu nào chờ duyệt.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b bg-gray-50">
                  <th className="px-4 py-2.5 text-left">Ngày</th>
                  <th className="px-4 py-2.5 text-left">Công ty</th>
                  <th className="px-4 py-2.5 text-left">Khách hàng</th>
                  <th className="px-4 py-2.5 text-right">Số tiền</th>
                  <th className="px-4 py-2.5 text-left">Ghi chú</th>
                  <th className="px-4 py-2.5 text-left">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pendingIncome.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{row.txn_date}</td>
                    <td className="px-4 py-2.5 text-gray-700 text-xs">
                      {(row.companies as { name: string } | null)?.name ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 text-gray-700 text-xs">
                      {(row.customers as { name: string } | null)?.name ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium text-green-700">
                      {formatVND(row.amount)}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs max-w-[180px] truncate">
                      {row.note ?? '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <ApproveButton kind="income" id={row.id} status={row.status} canApprove={approve} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Chi phí */}
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b bg-gray-50">
            <p className="font-medium text-sm text-gray-700">
              Chi phí
              {pendingExpense.length > 0 && (
                <span className="ml-2 text-xs text-amber-600">({pendingExpense.length} chờ)</span>
              )}
            </p>
          </div>
          {pendingExpense.length === 0 ? (
            <div className="px-5 py-4 text-sm text-gray-400">Không có khoản chi nào chờ duyệt.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b bg-gray-50">
                  <th className="px-4 py-2.5 text-left">Ngày</th>
                  <th className="px-4 py-2.5 text-left">Công ty</th>
                  <th className="px-4 py-2.5 text-right">Số tiền</th>
                  <th className="px-4 py-2.5 text-left">Ghi chú</th>
                  <th className="px-4 py-2.5 text-left">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pendingExpense.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{row.txn_date}</td>
                    <td className="px-4 py-2.5 text-gray-700 text-xs">
                      {(row.companies as { name: string } | null)?.name ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium text-red-700">
                      {formatVND(row.amount_vnd)}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs max-w-[180px] truncate">
                      {row.note ?? '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <ApproveButton kind="expense" id={row.id} status={row.status} canApprove={approve} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* ── Khóa kỳ ─────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="font-semibold text-gray-800">Kỳ kế toán</h2>
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          {periods.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">
              Chưa có kỳ kế toán.{' '}
              <Link href="/danh-muc/ky-ke-toan" className="text-blue-600 hover:underline">
                Tạo kỳ ở đây →
              </Link>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b bg-gray-50">
                  <th className="px-4 py-3 text-left">Kỳ</th>
                  <th className="px-4 py-3 text-left">Công ty</th>
                  <th className="px-4 py-3 text-center">Trạng thái</th>
                  <th className="px-4 py-3 text-left">Khóa lúc</th>
                  <th className="px-4 py-3 text-left">Người khóa</th>
                  {approve && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {periods.map((p) => {
                  const co = p.companies as { name: string; code: string } | null
                  const locker = p.users as { full_name: string } | null
                  const isLocked = p.status === 'locked'
                  return (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono font-medium text-gray-800">{p.period}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{co?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          isLocked
                            ? 'bg-red-50 text-red-700'
                            : 'bg-green-50 text-green-700'
                        }`}>
                          {isLocked ? '🔒 Đã khóa' : '🔓 Đang mở'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {p.locked_at ? new Date(p.locked_at).toLocaleString('vi-VN') : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{locker?.full_name ?? '—'}</td>
                      {approve && (
                        <td className="px-4 py-3 text-right">
                          <form
                            action={isLocked
                              ? unlockPeriod.bind(null, p.id)
                              : lockPeriod.bind(null, p.id)
                            }
                          >
                            <Button
                              size="sm"
                              variant={isLocked ? 'outline' : 'default'}
                              type="submit"
                              className="text-xs"
                            >
                              {isLocked ? 'Mở kỳ' : 'Khóa kỳ'}
                            </Button>
                          </form>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
        <p className="text-xs text-gray-400">
          * Kỳ đã khóa: DB sẽ từ chối mọi giao dịch có ngày thuộc kỳ đó (income, expense, đơn hàng, nhập khẩu).
        </p>
      </section>
    </div>
  )
}
