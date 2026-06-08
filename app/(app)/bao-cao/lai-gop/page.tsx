import { grossProfit } from '@/features/inventory-cost/queries'
import { listCompanies } from '@/features/companies/queries'
import { getGlobalFilter } from '@/lib/global-filter'
import { resolveRange } from '@/lib/date-range'
import { GrossProfitClient } from './GrossProfitClient'

export const dynamic = 'force-dynamic'

export default async function Page({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sp = await searchParams
  const { companyId: gCompany, year } = await getGlobalFilter()
  const companies = await listCompanies()
  const companyId = gCompany || companies[0]?.id   // lãi gộp theo 1 công ty (giá vốn riêng từng cty)
  const range = resolveRange(year, sp.month)
  const summary = await grossProfit(range.from, range.to, companyId)
  return (
    <GrossProfitClient
      summary={summary}
      year={year}
      month={sp.month ?? ''}
      companyName={companies.find(c => c.id === companyId)?.name ?? '(chưa có công ty)'}
    />
  )
}
