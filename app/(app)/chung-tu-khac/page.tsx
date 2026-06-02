import { getCurrentUser, canEdit } from '@/lib/auth'
import { listCashBook } from '@/features/cash-book/queries'
import { listCompanies } from '@/features/companies/queries'
import { listUsers } from '@/features/users/queries'
import { CashBookTable } from '@/features/cash-book/components/CashBookTable'
import { PageHeader } from '@/components/shared/PageHeader'
import { FilterBar, FilterField, FilterSubmit, FILTER_CONTROL } from '@/components/shared/FilterBar'
import { PAGE_WRAPPER } from '@/lib/ui-tokens'

export const dynamic = 'force-dynamic'

export default async function ChungTuKhacPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; type?: string; from?: string; to?: string }>
}) {
  const sp = await searchParams
  const [me, rows, companies, users] = await Promise.all([
    getCurrentUser(),
    listCashBook({
      companyId: sp.company || undefined,
      direction: sp.type || undefined,
      from:      sp.from || undefined,
      to:        sp.to || undefined,
      limit:     500,
    }),
    listCompanies(),
    listUsers(),
  ])

  const canWrite = !!me && canEdit(me.role)

  return (
    <div className={PAGE_WRAPPER}>
      <PageHeader
        title="Chứng từ khác"
        subtitle="Phát sinh kế toán linh tinh (phiếu thu/chi tiền mặt, điều chỉnh nội bộ, định khoản tay…)"
      />

      <FilterBar>
        <FilterField label="Công ty">
          <select name="company" defaultValue={sp.company ?? ''} className={`${FILTER_CONTROL} min-w-[160px]`}>
            <option value="">Tất cả</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </FilterField>
        <FilterField label="Loại">
          <select name="type" defaultValue={sp.type ?? ''} className={FILTER_CONTROL}>
            <option value="">Tất cả</option>
            <option value="thu">Thu</option>
            <option value="chi">Chi</option>
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

      <CashBookTable
        rows={rows}
        companies={companies.map(c => ({ id: c.id, name: c.name }))}
        users={users.map(u => ({ id: u.id, name: u.full_name }))}
        canWrite={canWrite}
      />
    </div>
  )
}
