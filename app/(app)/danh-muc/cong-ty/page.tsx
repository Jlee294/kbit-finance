import { listCompanies } from '@/features/companies/queries'
import { getCurrentUser, canApprove } from '@/lib/auth'
import { CompanyCatalog } from '@/features/companies/components/CompanyCatalog'

export const dynamic = 'force-dynamic'

export default async function CompanyPage() {
  const [me, rows] = await Promise.all([getCurrentUser(), listCompanies()])
  return <CompanyCatalog rows={rows} canWrite={me ? canApprove(me.role) : false} />
}
