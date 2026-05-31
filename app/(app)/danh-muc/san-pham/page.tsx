import { listProducts } from '@/features/products/queries'
import { getCurrentUser, canApprove } from '@/lib/auth'
import { CatalogPage } from '@/components/catalog/CatalogPage'
import { ProductForm } from '@/features/products/components/ProductForm'

export const dynamic = 'force-dynamic'

export default async function ProductPage() {
  const [me, rows] = await Promise.all([getCurrentUser(), listProducts()])
  const write = me ? canApprove(me.role) : false
  // Không có render functions → dùng thẳng CatalogPage từ server được
  return (
    <CatalogPage
      title="Sản phẩm"
      rows={rows}
      canWrite={write}
      FormComponent={ProductForm}
      columns={[
        { key: 'code', label: 'Mã' },
        { key: 'name', label: 'Tên sản phẩm' },
        { key: 'unit', label: 'Đơn vị' },
      ]}
    />
  )
}
