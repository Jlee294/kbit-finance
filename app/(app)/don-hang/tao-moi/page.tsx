import { redirect } from 'next/navigation'
import { getCurrentUser, canEdit } from '@/lib/auth'
import { listCompanies } from '@/features/companies/queries'
import { listCustomers } from '@/features/customers/queries'
import { listProjects } from '@/features/projects/queries'
import { listProducts } from '@/features/products/queries'
import { OrderForm } from '@/features/orders/components/OrderForm'

export default async function NewOrderPage() {
  const me = await getCurrentUser()
  if (!me || !canEdit(me.role)) redirect('/don-hang')

  const [companies, customers, projects, products] = await Promise.all([
    listCompanies(),
    listCustomers(),
    listProjects(),
    listProducts(),
  ])

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Tạo đơn hàng mới</h1>
        <p className="text-sm text-gray-500 mt-0.5">Điền thông tin bên dưới và nhấn Tạo đơn hàng</p>
      </div>

      <div className="rounded-xl border bg-white p-6">
        <OrderForm
          companies={companies.map((c) => ({ id: c.id, name: c.name }))}
          customers={customers}
          projects={projects.map((p) => ({ id: p.id, code: p.code, name: p.name, company_id: p.company_id }))}
          products={products.map((p) => ({ id: p.id, code: p.code, name: p.name }))}
        />
      </div>
    </div>
  )
}
