'use client'

import { CatalogPage } from '@/components/catalog/CatalogPage'
import { ProjectForm } from './ProjectForm'

type Project = { id: string; code: string; name: string; start_date: string | null; end_date: string | null; companies: { code: string } | null }

export function ProjectCatalog({ rows, canWrite }: { rows: Project[]; canWrite: boolean }) {
  return (
    <CatalogPage
      title="Dự án"
      rows={rows}
      canWrite={canWrite}
      FormComponent={ProjectForm}
      columns={[
        { key: 'code', label: 'Mã' },
        { key: 'name', label: 'Tên dự án' },
        { key: 'companies', label: 'Công ty', render: (r) => r.companies?.code ?? '' },
        { key: 'start_date', label: 'Bắt đầu', render: (r) => r.start_date ?? '' },
        { key: 'end_date', label: 'Kết thúc', render: (r) => r.end_date ?? '' },
      ]}
    />
  )
}
