import { getCurrentUser, canEdit } from '@/lib/auth'
import { listImportOrders }  from '@/features/imports/queries'
import { listCompanies }     from '@/features/companies/queries'
import { listSuppliers }     from '@/features/suppliers/queries'
import { listProducts }      from '@/features/products/queries'
import { listProjects }      from '@/features/projects/queries'
import { listUsers }         from '@/features/users/queries'
import { listWarehouses }    from '@/features/warehouse/queries'
import { listOperations }    from '@/features/operation-library/queries'
import { getGlobalFilter }   from '@/lib/global-filter'
import { ImportOrderTable }  from '@/features/imports/components/ImportOrderTable'
import { listAccountingCategories } from '@/features/accounting-categories/queries'

export const dynamic = 'force-dynamic'

export default async function NhapKhauPage() {
  const { companyId } = await getGlobalFilter()
  const [me, orders] = await Promise.all([
    getCurrentUser(),
    listImportOrders(companyId || undefined),
  ])

  const canWrite = !!me && canEdit(me.role)

  // Master data is only needed by the create/edit form. In local viewer mode,
  // avoiding these remote queries keeps the imported GLA journal fully offline.
  const [companies, suppliersRaw, productsRaw, projects, users, warehouses, operations, categories] = canWrite
    ? await Promise.all([
        listCompanies(),
        listSuppliers(),
        listProducts(),
        listProjects(),
        listUsers(),
        listWarehouses(),
        listOperations(),
        listAccountingCategories(),
      ])
    : [[], [], [], [], [], [], [], []]

  const suppliers = suppliersRaw.map((s) => ({ id: s.id, code: s.code as string, name: s.name }))
  const products  = productsRaw.map((p) => ({ id: p.id, code: p.code as string, name: p.name, unit: p.unit as string | null }))

  return (
    <ImportOrderTable
      rows={orders}
      canWrite={canWrite}
      companies={companies.map((c) => ({ id: c.id, name: c.name }))}
      suppliers={suppliers}
      products={products}
      projects={projects.map((p) => ({ id: p.id, code: p.code, name: p.name, company_id: p.company_id }))}
      users={users.map((u) => ({ id: u.id, name: u.full_name }))}
      warehouses={warehouses.map((w) => ({ id: w.id, code: w.code, name: w.name, company_id: w.company_id, is_default: w.is_default }))}
      operations={operations.map((o) => ({ id: o.id, code: o.code, name: o.name, group_name: o.group_name }))}
      categories={categories}
    />
  )
}
