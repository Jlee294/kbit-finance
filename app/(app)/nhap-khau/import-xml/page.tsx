import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentUser, canEdit } from '@/lib/auth'
import { listCompanies } from '@/features/companies/queries'
import { listProjects }  from '@/features/projects/queries'
import { listProducts }  from '@/features/products/queries'
import { listWarehouses } from '@/features/warehouse/queries'
import { listUsers }     from '@/features/users/queries'
import { InvoiceXmlImporter } from '@/features/xml-imports/components/InvoiceXmlImporter'
import { PageHeader } from '@/components/shared/PageHeader'

export const dynamic = 'force-dynamic'

export default async function ImportInvoiceXmlPage() {
  const me = await getCurrentUser()
  if (!me || !canEdit(me.role)) redirect('/nhap-khau')

  const [companies, projects, products, warehouses, users] = await Promise.all([
    listCompanies(),
    listProjects(),
    listProducts(),
    listWarehouses(),
    listUsers(),
  ])

  return (
    <div className="space-y-6 p-6 max-w-6xl mx-auto">
      <PageHeader
        title="Import hóa đơn mua vào từ XML"
        subtitle="File XML chuẩn TT 78/2021 — tự đọc và tạo hóa đơn mua vào"
        breadcrumb={
          <>
            <Link href="/nhap-khau" className="hover:text-brand-700">Nhật ký mua vào</Link>
            <span className="mx-1.5">/</span>
            <span className="font-medium text-gray-900">Import XML</span>
          </>
        }
      />

      <InvoiceXmlImporter
        companies={companies.map(c => ({ id: c.id, name: c.name }))}
        projects={projects.map(p => ({ id: p.id, code: p.code, name: p.name, company_id: p.company_id }))}
        products={products.map(p => ({ id: p.id, code: p.code, name: p.name }))}
        warehouses={warehouses.map(w => ({ id: w.id, code: w.code, name: w.name }))}
        users={users.map(u => ({ id: u.id, name: u.full_name }))}
      />
    </div>
  )
}
