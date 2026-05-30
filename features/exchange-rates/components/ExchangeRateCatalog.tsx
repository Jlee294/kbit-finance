'use client'

import { CatalogPage } from '@/components/catalog/CatalogPage'
import { ExchangeRateForm } from './ExchangeRateForm'

type ExchangeRate = { id: string; rate_date: string; currency_from: string; currency_to: string; rate: number; source: string | null }

export function ExchangeRateCatalog({ rows, canWrite }: { rows: ExchangeRate[]; canWrite: boolean }) {
  return (
    <CatalogPage
      title="Tỷ giá"
      rows={rows}
      canWrite={canWrite}
      FormComponent={ExchangeRateForm}
      columns={[
        { key: 'rate_date', label: 'Ngày' },
        { key: 'currency_from', label: 'Từ' },
        { key: 'currency_to', label: 'Sang' },
        { key: 'rate', label: 'Tỷ giá', render: (r) => Number(r.rate).toLocaleString('vi-VN') },
        { key: 'source', label: 'Nguồn', render: (r) => r.source ?? '' },
      ]}
    />
  )
}
