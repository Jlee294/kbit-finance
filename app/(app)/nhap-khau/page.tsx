import { getCurrentUser, canEdit } from '@/lib/auth'
import { listImportOrders }  from '@/features/imports/queries'
import { listCompanies }     from '@/features/companies/queries'
import { listSuppliers }     from '@/features/suppliers/queries'
import { listProducts }      from '@/features/products/queries'
import { listProjects }      from '@/features/projects/queries'
import { listUsers }         from '@/features/users/queries'
import { listWarehouses }    from '@/features/warehouse/queries'
import { ImportOrderTable }  from '@/features/imports/components/ImportOrderTable'

export const dynamic = 'force-dynamic'

export default async function NhapKhauPage() {
  const [me, orders, companies, suppliersRaw, productsRaw, projects, users, warehouses] = await Promise.all([
    getCurrentUser(),
    listImportOrders(),
    listCompanies(),
    listSuppliers(),
    listProducts(),
    listProjects(),
    listUsers(),
    listWarehouses(),
  ])

  const suppliers = suppliersRaw.map((s) => ({ id: s.id, code: s.code as string, name: s.name }))
  const products  = productsRaw.map((p) => ({ id: p.id, code: p.code as string, name: p.name, unit: p.unit as string | null }))

  return (
    <ImportOrderTable
      rows={orders}
      canWrite={!!me && canEdit(me.role)}
      companies={companies.map((c) => ({ id: c.id, name: c.name }))}
      suppliers={suppliers}
      products={products}
      projects={projects.map((p) => ({ id: p.id, code: p.code, name: p.name, company_id: p.company_id }))}
      users={users.map((u) => ({ id: u.id, name: u.full_name }))}
      warehouses={warehouses.map((w) => ({ id: w.id, code: w.code, name: w.name }))}
    />
  )
}
