import { listSuppliers } from '@/features/suppliers/queries'
import { getCurrentUser, canApprove } from '@/lib/auth'
import { CatalogPage } from '@/components/catalog/CatalogPage'
import { SupplierForm } from '@/features/suppliers/components/SupplierForm'

export default async function SupplierPage() {
  const [me, rows] = await Promise.all([getCurrentUser(), listSuppliers()])
  const write = me ? canApprove(me.role) : false

  return (
    <CatalogPage
      title="Nhà cung cấp"
      rows={rows}
      canWrite={write}
      FormComponent={SupplierForm}
      columns={[
        { key: 'code', label: 'Mã' },
        { key: 'name', label: 'Tên NCC' },
        { key: 'country', label: 'Quốc gia', render: (r) => r.country === 'VN' ? 'Việt Nam' : 'Hàn Quốc' },
        { key: 'phone', label: 'Điện thoại', render: (r) => r.phone ?? '' },
      ]}
    />
  )
}
