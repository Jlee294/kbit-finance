import { listCustomers } from '@/features/customers/queries'
import { getCurrentUser, canApprove } from '@/lib/auth'
import { CatalogPage } from '@/components/catalog/CatalogPage'
import { CustomerForm } from '@/features/customers/components/CustomerForm'
import { formatVND } from '@/lib/format'

export default async function CustomerPage() {
  const [me, rows] = await Promise.all([getCurrentUser(), listCustomers()])
  const write = me ? canApprove(me.role) : false

  return (
    <CatalogPage
      title="Khách hàng"
      rows={rows}
      canWrite={write}
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
