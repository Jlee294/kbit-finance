import { listProjects } from '@/features/projects/queries'
import { getCurrentUser, canApprove } from '@/lib/auth'
import { CatalogPage } from '@/components/catalog/CatalogPage'
import { ProjectForm } from '@/features/projects/components/ProjectForm'

export default async function ProjectPage() {
  const [me, rows] = await Promise.all([getCurrentUser(), listProjects()])
  const write = me ? canApprove(me.role) : false

  return (
    <CatalogPage
      title="Dự án"
      rows={rows}
      canWrite={write}
      FormComponent={ProjectForm}
      columns={[
        { key: 'code', label: 'Mã' },
        { key: 'name', label: 'Tên dự án' },
        { key: 'companies', label: 'Công ty', render: (r) => (r.companies as { code: string } | null)?.code ?? '' },
        { key: 'start_date', label: 'Bắt đầu', render: (r) => r.start_date ?? '' },
        { key: 'end_date', label: 'Kết thúc', render: (r) => r.end_date ?? '' },
      ]}
    />
  )
}
