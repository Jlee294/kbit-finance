'use client'

import { CatalogPage } from '@/components/catalog/CatalogPage'
import { CompanyForm } from './CompanyForm'
import { Badge } from '@/components/ui/badge'
import { useT } from '@/lib/i18n/client'

type Company = { id: string; code: string; name: string; country: string; base_currency: string; is_active: boolean }

export function CompanyCatalog({ rows, canWrite }: { rows: Company[]; canWrite: boolean }) {
  const t = useT()
  return (
    <CatalogPage
      title="Công ty / Pháp nhân"
      rows={rows}
      canWrite={canWrite}
      FormComponent={CompanyForm}
      columns={[
        { key: 'code', label: 'Mã' },
        { key: 'name', label: 'Tên công ty' },
        { key: 'country', label: 'Quốc gia', render: (r) => r.country === 'VN' ? t('Việt Nam') : t('Hàn Quốc') },
        { key: 'base_currency', label: 'Tiền tệ', render: (r) => <Badge variant="outline">{r.base_currency}</Badge> },
        { key: 'is_active', label: 'Trạng thái', render: (r) => <Badge variant={r.is_active ? 'default' : 'secondary'}>{r.is_active ? t('Hoạt động') : t('Dừng')}</Badge> },
      ]}
    />
  )
}
