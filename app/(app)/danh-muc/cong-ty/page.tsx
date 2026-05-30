import { listCompanies } from '@/features/companies/queries'
import { getCurrentUser, canApprove } from '@/lib/auth'
import { CatalogPage } from '@/components/catalog/CatalogPage'
import { CompanyForm } from '@/features/companies/components/CompanyForm'
import { Badge } from '@/components/ui/badge'

export default async function CompanyPage() {
  const [me, rows] = await Promise.all([getCurrentUser(), listCompanies()])
  const write = me ? canApprove(me.role) : false

  return (
    <CatalogPage
      title="Công ty / Pháp nhân"
      rows={rows}
      canWrite={write}
      FormComponent={CompanyForm}
      columns={[
        { key: 'code', label: 'Mã' },
        { key: 'name', label: 'Tên công ty' },
        { key: 'country', label: 'Quốc gia', render: (r) => r.country === 'VN' ? 'Việt Nam' : 'Hàn Quốc' },
        { key: 'base_currency', label: 'Tiền tệ', render: (r) => (
          <Badge variant="outline">{r.base_currency}</Badge>
        )},
        { key: 'is_active', label: 'Trạng thái', render: (r) => (
          <Badge variant={r.is_active ? 'default' : 'secondary'}>
            {r.is_active ? 'Hoạt động' : 'Dừng'}
          </Badge>
        )},
      ]}
    />
  )
}
