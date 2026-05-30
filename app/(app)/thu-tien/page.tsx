import { getCurrentUser, canEdit } from '@/lib/auth'
import { listIncomes, getBankBalances } from '@/features/payments/queries'
import { listCompanies } from '@/features/companies/queries'
import { listCustomers } from '@/features/customers/queries'
import { listProjects } from '@/features/projects/queries'
import { IncomeList } from '@/features/payments/components/IncomeList'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function IncomeListPage() {
  const supabase = await createClient()

  const [me, incomes, balances, companies, customers, projects, bankRes] = await Promise.all([
    getCurrentUser(),
    listIncomes(),
    getBankBalances(),
    listCompanies(),
    listCustomers(),
    listProjects(),
    supabase.from('bank_accounts').select('id, name, currency, company_id').eq('is_active', true).order('name'),
  ])

  const bankAccounts = (bankRes.data ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    currency: b.currency,
    company_id: b.company_id,
  }))

  return (
    <IncomeList
      incomes={incomes}
      balances={balances}
      canWrite={!!me && canEdit(me.role)}
      companies={companies.map((c) => ({ id: c.id, name: c.name }))}
      customers={customers}
      bankAccounts={bankAccounts}
      projects={projects.map((p) => ({ id: p.id, code: p.code, name: p.name, company_id: p.company_id }))}
    />
  )
}
