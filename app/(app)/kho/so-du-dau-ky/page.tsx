import { getCurrentUser, canEdit } from '@/lib/auth'
import { listProducts } from '@/features/products/queries'
import { listWarehouses } from '@/features/warehouse/queries'
import { listCompanies } from '@/features/companies/queries'
import { listOpeningBalances } from '@/features/inventory-cost/queries'
import { todayLocal } from '@/lib/format'
import { getGlobalFilter } from '@/lib/global-filter'
import { OpeningBalanceClient } from './OpeningBalanceClient'

export const dynamic = 'force-dynamic'

export default async function Page({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const sp = await searchParams
  const { companyId: gCompany, year } = await getGlobalFilter()
  const companies = await listCompanies()
  const companyId = gCompany || companies[0]?.id
  const defMonth = year === todayLocal().slice(0, 4) ? todayLocal().slice(5, 7) : '01'
  const period = sp.period || `${year}-${defMonth}`
  const [me, products, warehouses, openings] = await Promise.all([
    getCurrentUser(),
    listProducts(),
    listWarehouses(companyId),
    listOpeningBalances(period, companyId),
  ])
  return (
    <OpeningBalanceClient
      period={period}
      canWrite={!!me && canEdit(me.role)}
      products={products.map((p: any) => ({ id: p.id, code: p.code as string, name: p.name }))}
      warehouses={warehouses.map((w: any) => ({ id: w.id, code: w.code as string, name: w.name }))}
      openings={openings}
    />
  )
}
