import { canEdit, getCurrentUser } from '@/lib/auth'
import { listCompanies } from '@/features/companies/queries'
import { listAccountingCategories } from '@/features/accounting-categories/queries'
import { AccountingCategoryCatalog } from '@/features/accounting-categories/components/AccountingCategoryCatalog'
import { PageHeader } from '@/components/shared/PageHeader'
import { PAGE_WRAPPER } from '@/lib/ui-tokens'

export const dynamic = 'force-dynamic'

export default async function AccountingCategoriesPage() {
  const [me, rows, companies] = await Promise.all([
    getCurrentUser(),
    listAccountingCategories(),
    listCompanies(),
  ])

  return (
    <div className={PAGE_WRAPPER}>
      <PageHeader
        title="Phân loại khoản mua không qua kho"
        subtitle="Chi phí, trả trước, CCDC, tài sản, thuế/phí, thu hộ chi hộ, phạt hợp đồng và danh mục tự tạo."
      />
      <AccountingCategoryCatalog
        rows={rows}
        companies={companies.map((company) => ({ id: company.id, name: company.name }))}
        canWrite={!!me && canEdit(me.role)}
      />
    </div>
  )
}
