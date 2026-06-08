import { getCurrentUser, canEdit } from '@/lib/auth'
import {
  listExpensesVN,
  listOutstandingReceivables,
  sumCompanyExpenseVN,
  sumOutstandingChiHo,
} from '@/features/expenses-vn/queries'
import { listCompanies }  from '@/features/companies/queries'
import { listProjects }   from '@/features/projects/queries'
import { listSuppliers }  from '@/features/suppliers/queries'
import { listUnpaidVndSupplierOrders } from '@/features/imports/queries'
import { createClient }   from '@/lib/supabase/server'
import { getGlobalFilter } from '@/lib/global-filter'
import { ExpenseVnList }  from '@/features/expenses-vn/components/ExpenseVnList'

export const dynamic = 'force-dynamic'

export default async function ExpenseVnPage() {
  const supabase = await createClient()
  const { companyId } = await getGlobalFilter()

  const [me, expenses, receivables, companyTotal, outstandingTotal, companies, projects, bankRes, suppliersRaw, importOrders] =
    await Promise.all([
      getCurrentUser(),
      listExpensesVN(companyId || undefined),
      listOutstandingReceivables(),
      sumCompanyExpenseVN(),
      sumOutstandingChiHo(),
      listCompanies(),
      listProjects(),
      supabase.from('bank_accounts').select('id, name, currency, company_id').eq('is_active', true).order('name'),
      listSuppliers(),
      listUnpaidVndSupplierOrders(),
    ])

  const bankAccounts = (bankRes.data ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    currency: b.currency,
    company_id: b.company_id,
  }))

  const suppliers = suppliersRaw.map((s) => ({
    id:   s.id,
    code: s.code as string,
    name: s.name,
  }))

  // Đơn NCC trong nước (VNĐ) còn nợ — đã gọn sẵn { id, order_code, supplier_id, outstanding }
  const supplierOrders = importOrders

  return (
    <ExpenseVnList
      expenses={expenses}
      receivables={receivables}
      companyExpenseTotal={companyTotal}
      outstandingTotal={outstandingTotal}
      canWrite={!!me && canEdit(me.role)}
      companies={companies.map((c) => ({ id: c.id, name: c.name }))}
      bankAccounts={bankAccounts}
      projects={projects.map((p) => ({ id: p.id, code: p.code, name: p.name, company_id: p.company_id }))}
      suppliers={suppliers}
      supplierOrders={supplierOrders}
    />
  )
}
