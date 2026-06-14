'use client'

import { CatalogPage } from '@/components/catalog/CatalogPage'
import { SupplierForm } from './SupplierForm'
import { useT } from '@/lib/i18n/client'

type Supplier = { id: string; code: string; name: string; country: string; phone: string | null }

export function SupplierCatalog({ rows, canWrite }: { rows: Supplier[]; canWrite: boolean }) {
  const t = useT()
  return (
    <CatalogPage
      title="Nhà cung cấp"
      rows={rows}
      canWrite={canWrite}
      FormComponent={SupplierForm}
      columns={[
        { key: 'code', label: 'Mã' },
        { key: 'name', label: 'Tên NCC' },
        { key: 'country', label: 'Quốc gia', render: (r) => r.country === 'VN' ? t('Việt Nam') : t('Hàn Quốc') },
        { key: 'phone', label: 'Điện thoại', render: (r) => r.phone ?? '' },
      ]}
    />
  )
}
