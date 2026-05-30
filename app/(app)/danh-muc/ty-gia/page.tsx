import { listExchangeRates } from '@/features/exchange-rates/queries'
import { getCurrentUser, canApprove } from '@/lib/auth'
import { CatalogPage } from '@/components/catalog/CatalogPage'
import { ExchangeRateForm } from '@/features/exchange-rates/components/ExchangeRateForm'

export default async function ExchangeRatePage() {
  const [me, rows] = await Promise.all([getCurrentUser(), listExchangeRates()])
  const write = me ? canApprove(me.role) : false

  return (
    <CatalogPage
      title="Tỷ giá"
      rows={rows}
      canWrite={write}
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
