import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentUser, canApprove } from '@/lib/auth'
import { listCompanies } from '@/features/companies/queries'
import { listProjects }  from '@/features/projects/queries'
import { NewPlanForm }   from '@/features/tax-plans/components/NewPlanForm'
import { PageHeader }    from '@/components/shared/PageHeader'
import { PAGE_WRAPPER }  from '@/lib/ui-tokens'

export const dynamic = 'force-dynamic'

export default async function NewTaxPlanPage() {
  const me = await getCurrentUser()
  if (!me || !canApprove(me.role)) redirect('/ke-hoach-thue')

  const [companies, projects] = await Promise.all([listCompanies(), listProjects()])

  return (
    <div className={`${PAGE_WRAPPER} max-w-3xl mx-auto`}>
      <PageHeader
        title="Tạo kế hoạch thuế"
        subtitle="Chọn công ty + dự án (nếu có) + năm để bắt đầu nhập theo mẫu 16 chỉ tiêu"
        breadcrumb={
          <>
            <Link href="/ke-hoach-thue" className="hover:text-brand-700">Kế hoạch thuế</Link>
            <span className="mx-1.5">/</span>
            <span className="font-medium text-gray-900">Tạo mới</span>
          </>
        }
      />

      <NewPlanForm
        companies={companies.map((c: any) => ({ id: c.id, name: c.name }))}
        projects={projects.map((p: any) => ({ id: p.id, name: p.name, code: p.code, company_id: p.company_id }))}
      />
    </div>
  )
}
