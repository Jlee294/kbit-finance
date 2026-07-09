'use client'

import { CatalogPage } from '@/components/catalog/CatalogPage'
import { ManufacturerForm } from './ManufacturerForm'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'

const COUNTRY_LABELS: Record<string, string> = {
  KR: 'Hàn Quốc', VN: 'Việt Nam', CN: 'Trung Quốc', JP: 'Nhật Bản', US: 'Mỹ',
}

type Manufacturer = {
  id: string
  code: string
  name: string
  country: string
  phone: string | null
  email: string | null
  note: string | null
  is_active: boolean
  product_count: number
}

export function ManufacturerCatalog({ rows, canWrite }: { rows: Manufacturer[]; canWrite: boolean }) {
  return (
    <CatalogPage
      title="Nhà máy"
      subtitle={`${rows.length} nhà máy sản xuất`}
      rows={rows}
      canWrite={canWrite}
      FormComponent={ManufacturerForm}
      columns={[
        { key: 'code', label: 'Mã', render: r => (
          <Link href={`/danh-muc/nha-may/${r.id}`} className="font-mono text-primary hover:underline">
            {r.code}
          </Link>
        )},
        { key: 'name', label: 'Tên nhà máy', render: r => (
          <Link href={`/danh-muc/nha-may/${r.id}`} className="hover:text-primary">
            {r.name}
          </Link>
        )},
        { key: 'country', label: 'Quốc gia', render: r => COUNTRY_LABELS[r.country] ?? r.country },
        { key: 'phone', label: 'Liên hệ', render: r => r.phone || r.email || '—' },
        { key: 'product_count', label: 'Sản phẩm', render: r => (
          <Badge variant={r.product_count > 0 ? 'default' : 'secondary'}>
            {r.product_count} SP
          </Badge>
        )},
        { key: 'is_active', label: 'Trạng thái', render: r => (
          <Badge variant={r.is_active ? 'default' : 'secondary'}>{r.is_active ? 'Hoạt động' : 'Dừng'}</Badge>
        )},
      ]}
    />
  )
}
