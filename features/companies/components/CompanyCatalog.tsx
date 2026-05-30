'use client'

import { CatalogPage } from '@/components/catalog/CatalogPage'
import { CompanyForm } from './CompanyForm'
import { Badge } from '@/components/ui/badge'

type Company = { id: string; code: string; name: string; country: string; base_currency: string; is_active: boolean }

export function CompanyCatalog({ rows, canWrite }: { rows: Company[]; canWrite: boolean }) {
  return (
    <CatalogPage
      title="Công ty / Pháp nhân"
      rows={rows}
      canWrite={canWrite}
      FormComponent={CompanyForm}
      columns={[
        { key: 'code', label: 'Mã' },
        { key: 'name', label: 'Tên công ty' },
        { key: 'country', label: 'Quốc gia', render: (r) => r.country === 'VN' ? 'Việt Nam' : 'Hàn Quốc' },
        { key: 'base_currency', label: 'Tiền tệ', render: (r) => <Badge variant="outline">{r.base_currency}</Badge> },
        { key: 'is_active', label: 'Trạng thái', render: (r) => <Badge variant={r.is_active ? 'default' : 'secondary'}>{r.is_active ? 'Hoạt động' : 'Dừng'}</Badge> },
      ]}
    />
  )
}
