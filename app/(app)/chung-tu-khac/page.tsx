import { getCurrentUser, canEdit } from '@/lib/auth'
import { listCashBook } from '@/features/cash-book/queries'
import { listCompanies } from '@/features/companies/queries'
import { CashBookTable } from '@/features/cash-book/components/CashBookTable'

export const dynamic = 'force-dynamic'

export default async function ChungTuKhacPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; type?: string; from?: string; to?: string }>
}) {
  const sp = await searchParams
  const [me, rows, companies] = await Promise.all([
    getCurrentUser(),
    listCashBook({
      companyId: sp.company || undefined,
      direction: sp.type || undefined,
      from:      sp.from || undefined,
      to:        sp.to || undefined,
      limit:     500,
    }),
    listCompanies(),
  ])

  const canWrite = !!me && canEdit(me.role)

  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Chứng từ khác</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Các phát sinh kế toán linh tinh (phiếu thu/chi tiền mặt, điều chỉnh nội bộ, định khoản tay…)
        </p>
      </div>

      {/* Filters */}
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
          <p className="text-xs text-gray-500">Loại</p>
          <select name="type" defaultValue={sp.type ?? ''}
            className="h-8 rounded-md border text-sm px-2 bg-white">
            <option value="">Tất cả</option>
            <option value="thu">Thu</option>
            <option value="chi">Chi</option>
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
        <button type="submit" className="h-8 px-3 bg-gray-100 text-gray-700 rounded-md text-sm hover:bg-gray-200">
          Lọc
        </button>
      </form>

      <CashBookTable
        rows={rows}
        companies={companies.map(c => ({ id: c.id, name: c.name }))}
        canWrite={canWrite}
      />
    </div>
  )
}
