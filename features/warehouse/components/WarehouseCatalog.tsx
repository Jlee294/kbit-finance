'use client'

import { CatalogPage } from '@/components/catalog/CatalogPage'
import { WarehouseForm } from './WarehouseForm'
import { Badge } from '@/components/ui/badge'
import { useT } from '@/lib/i18n/client'

type Warehouse = {
  id: string
  code: string
  name: string
  note: string | null
  is_active: boolean
  is_default: boolean
  company_id: string
  company_name: string
}

export function WarehouseCatalog({ rows, canWrite }: { rows: Warehouse[]; canWrite: boolean }) {
  const t = useT()
  return (
    <CatalogPage
      title="Kho"
      rows={rows}
      canWrite={canWrite}
      FormComponent={WarehouseForm}
      columns={[
        { key: 'company_name', label: 'Công ty' },
        { key: 'code', label: 'Mã kho' },
        { key: 'name', label: 'Tên kho' },
        { key: 'note', label: 'Ghi chú', render: (r) => r.note ?? '—' },
        { key: 'is_default', label: 'Kho chính', render: (r) => r.is_default ? <Badge variant="default">{t('★ Kho chính')}</Badge> : <span className="text-gray-300">—</span> },
        { key: 'is_active', label: 'Trạng thái', render: (r) => <Badge variant={r.is_active ? 'default' : 'secondary'}>{r.is_active ? t('Hoạt động') : t('Dừng')}</Badge> },
      ]}
    />
  )
}
