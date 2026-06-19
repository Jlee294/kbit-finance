import { getCurrentUser, canEdit } from '@/lib/auth'
import { listCashBook } from '@/features/cash-book/queries'
import { listCompanies } from '@/features/companies/queries'
import { listUsers } from '@/features/users/queries'
import { listCustomers } from '@/features/customers/queries'
import { listSuppliers } from '@/features/suppliers/queries'
import { CashBookTable } from '@/features/cash-book/components/CashBookTable'
import { PageHeader } from '@/components/shared/PageHeader'
import { FilterBar, FilterField, FilterReset, FILTER_CONTROL } from '@/components/shared/FilterBar'
import { PeriodFields } from '@/components/shared/PeriodFields'
import { AutoSubmit } from '@/components/shared/AutoSubmit'
import { getGlobalFilter } from '@/lib/global-filter'
import { resolveRange } from '@/lib/date-range'
import { PAGE_WRAPPER } from '@/lib/ui-tokens'

export const dynamic = 'force-dynamic'

export default async function ChungTuKhacPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; period?: string; from?: string; to?: string }>
}) {
  const sp = await searchParams
  const { companyId, year } = await getGlobalFilter()
  const range = resolveRange(year, sp.period, sp.from, sp.to)
  const [me, rows, companies, users, customersRaw, suppliersRaw] = await Promise.all([
    getCurrentUser(),
    listCashBook({
      companyId: companyId || undefined,
      direction: sp.type || undefined,
      from:      range.from,
      to:        range.to,
      limit:     500,
    }),
    listCompanies(),
    listUsers(),
    listCustomers(),
    listSuppliers(),
  ])

  const canWrite = !!me && canEdit(me.role)

  return (
    <div className={PAGE_WRAPPER}>
      <PageHeader
        title="Chứng từ khác"
        subtitle="Phát sinh kế toán linh tinh (thu/chi tiền mặt, điều chỉnh nội bộ, định khoản tay…) — theo công ty & năm đang chọn"
      />

      <FilterBar>
        <AutoSubmit />
        <FilterField label="Loại">
          <select name="type" defaultValue={sp.type ?? ''} className={FILTER_CONTROL}>
            <option value="">Tất cả</option>
            <option value="thu">Thu</option>
            <option value="chi">Chi</option>
          </select>
        </FilterField>
        <PeriodFields period={sp.period} from={sp.from} to={sp.to} />
        <FilterReset href="/chung-tu-khac" />
      </FilterBar>

      <CashBookTable
        rows={rows}
        companies={companies.map(c => ({ id: c.id, name: c.name }))}
        users={users.map(u => ({ id: u.id, name: u.full_name }))}
        customers={customersRaw.map(c => ({ id: c.id, code: c.code as string, name: c.name }))}
        suppliers={suppliersRaw.map(s => ({ id: s.id, code: s.code as string, name: s.name }))}
        canWrite={canWrite}
      />
    </div>
  )
}
