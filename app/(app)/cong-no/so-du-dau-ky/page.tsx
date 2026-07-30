import { getCurrentUser, canEdit } from '@/lib/auth'
import { getGlobalFilter } from '@/lib/global-filter'
import { listCustomers } from '@/features/customers/queries'
import { listSuppliers } from '@/features/suppliers/queries'
import { listDebtOpenings } from '@/features/debts/queries'
import { DebtOpeningClient } from './DebtOpeningClient'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const { companyId, year } = await getGlobalFilter()
  const numYear = Number(year)
  const [me, customers, suppliers, arOpenings, apOpenings] = await Promise.all([
    getCurrentUser(),
    listCustomers(),
    listSuppliers(),
    listDebtOpenings(numYear, companyId || undefined, 'customer'),
    listDebtOpenings(numYear, companyId || undefined, 'supplier'),
  ])
  return (
    <DebtOpeningClient
      year={numYear}
      canWrite={!!me && canEdit(me.role)}
      customers={customers.map((c: any) => ({ id: c.id, code: c.code ?? '', name: c.name }))}
      suppliers={suppliers.map((s: any) => ({ id: s.id, code: s.code ?? '', name: s.name }))}
      arOpenings={arOpenings}
      apOpenings={apOpenings}
    />
  )
}
