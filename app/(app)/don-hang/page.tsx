import { getCurrentUser, canEdit } from '@/lib/auth'
import { listOrders } from '@/features/orders/queries'
import { getGlobalFilter } from '@/lib/global-filter'
import { listCompanies } from '@/features/companies/queries'
import { listCustomers } from '@/features/customers/queries'
import { listProjects } from '@/features/projects/queries'
import { listProducts } from '@/features/products/queries'
import { listWarehouses } from '@/features/warehouse/queries'
import { listUsers } from '@/features/users/queries'
import { OrderList } from '@/features/orders/components/OrderList'

export const dynamic = 'force-dynamic'

export default async function OrdersPage() {
  const { companyId } = await getGlobalFilter()
  const [me, { rows, total }] = await Promise.all([
    getCurrentUser(),
    listOrders({ companyId: companyId || undefined, pageSize: 50 }),
  ])

  const canWrite = !!me && canEdit(me.role)

  // Master data chỉ cần cho form tạo đơn (popup) — chỉ fetch khi có quyền ghi
  const [companies, customers, projects, products, warehouses, users] = canWrite
    ? await Promise.all([listCompanies(), listCustomers(), listProjects(), listProducts(), listWarehouses(), listUsers()])
    : [[], [], [], [], [], []]

  return (
    <OrderList
      initialRows={rows}
      total={total}
      canWrite={canWrite}
      companies={companies.map((c) => ({ id: c.id, name: c.name }))}
      customers={customers}
      projects={projects.map((p) => ({ id: p.id, code: p.code, name: p.name, company_id: p.company_id }))}
      products={products.map((p) => ({ id: p.id, code: p.code, name: p.name }))}
      warehouses={warehouses.map((w) => ({ id: w.id, code: w.code, name: w.name, company_id: w.company_id, is_default: w.is_default }))}
      users={users.map((u) => ({ id: u.id, name: u.full_name }))}
    />
  )
}
