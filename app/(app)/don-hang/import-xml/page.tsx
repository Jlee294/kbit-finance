import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentUser, canEdit } from '@/lib/auth'
import { listCompanies } from '@/features/companies/queries'
import { listProjects }  from '@/features/projects/queries'
import { listProducts }  from '@/features/products/queries'
import { listWarehouses } from '@/features/warehouse/queries'
import { listUsers }     from '@/features/users/queries'
import { SalesInvoiceXmlImporter } from '@/features/xml-imports/components/SalesInvoiceXmlImporter'

export const dynamic = 'force-dynamic'

export default async function ImportSalesInvoiceXmlPage() {
  const me = await getCurrentUser()
  if (!me || !canEdit(me.role)) redirect('/don-hang')

  const [companies, projects, products, warehouses, users] = await Promise.all([
    listCompanies(),
    listProjects(),
    listProducts(),
    listWarehouses(),
    listUsers(),
  ])

  return (
    <div className="space-y-5 p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/don-hang" className="hover:text-gray-900">Nhật ký bán ra</Link>
        <span>/</span>
        <span className="font-medium text-gray-900">Import XML</span>
      </div>

      <div>
        <h1 className="text-xl font-semibold text-gray-900">Import hóa đơn bán ra từ XML</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Upload file XML hóa đơn bán ra (xuất từ phần mềm hóa đơn điện tử) — hệ thống tự đọc và tạo đơn hàng.
        </p>
      </div>

      <SalesInvoiceXmlImporter
        companies={companies.map(c => ({ id: c.id, name: c.name }))}
        projects={projects.map(p => ({ id: p.id, code: p.code, name: p.name, company_id: p.company_id }))}
        products={products.map(p => ({ id: p.id, code: p.code, name: p.name }))}
        warehouses={warehouses.map(w => ({ id: w.id, code: w.code, name: w.name }))}
        users={users.map(u => ({ id: u.id, name: u.full_name }))}
      />
    </div>
  )
}
