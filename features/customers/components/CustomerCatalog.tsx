'use client'

import { CatalogPage } from '@/components/catalog/CatalogPage'
import { CustomerForm } from './CustomerForm'
import { formatVND } from '@/lib/format'

type Customer = { id: string; code: string; name: string; phone: string | null; prepaid_balance: number }

export function CustomerCatalog({ rows, canWrite }: { rows: Customer[]; canWrite: boolean }) {
  return (
    <CatalogPage
      title="Khách hàng"
      rows={rows}
      canWrite={canWrite}
      FormComponent={CustomerForm}
      columns={[
        { key: 'code', label: 'Mã' },
        { key: 'name', label: 'Tên khách hàng' },
        { key: 'phone', label: 'Điện thoại', render: (r) => r.phone ?? '' },
        { key: 'prepaid_balance', label: 'Số dư trả trước', render: (r) => formatVND(Number(r.prepaid_balance)) },
      ]}
    />
  )
}
