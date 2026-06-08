import { getCurrentUser, canEdit } from '@/lib/auth'
import {
  listKrExpenses,
  listKrSuppliers,
  listKrwBankAccounts,
  getKrSupplierOrdersUnpaid,
} from '@/features/expenses-kr/queries'
import { listCompanies } from '@/features/companies/queries'
import { listProjects }  from '@/features/projects/queries'
import { getGlobalFilter } from '@/lib/global-filter'
import { KrExpenseList } from '@/features/expenses-kr/components/KrExpenseList'

export const dynamic = 'force-dynamic'

export default async function ChiKrPage() {
  const { companyId } = await getGlobalFilter()
  const [me, expenses, krSuppliers, krwBanks, unpaidOrders, companies, projects] =
    await Promise.all([
      getCurrentUser(),
      listKrExpenses(companyId || undefined),
      listKrSuppliers(),
      listKrwBankAccounts(),
      getKrSupplierOrdersUnpaid(),
      listCompanies(),
      listProjects(),
    ])

  return (
    <KrExpenseList
      expenses={expenses}
      unpaidOrders={unpaidOrders}
      canWrite={!!me && canEdit(me.role)}
      companies={companies.map((c) => ({ id: c.id, name: c.name }))}
      krwBanks={krwBanks}
      krSuppliers={krSuppliers.map((s) => ({ id: s.id, code: s.code as string, name: s.name }))}
      projects={projects.map((p) => ({ id: p.id, code: p.code, name: p.name, company_id: p.company_id }))}
    />
  )
}
