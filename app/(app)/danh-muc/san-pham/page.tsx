import { redirect } from 'next/navigation'
import { getCurrentUser, canViewCosts } from '@/lib/auth'
import { listBrands } from '@/features/brands/queries'
import { listProductsDetail, getLatestRates } from '@/features/products/queries'
import { ProductCatalog } from '@/features/products/components/ProductCatalog'

export const dynamic = 'force-dynamic'

export default async function ProductPage() {
  const me = await getCurrentUser()

  // Chỉ admin + CEO mới được vào trang này
  if (!me || !canViewCosts(me.role)) redirect('/')

  const [brands, products, rates] = await Promise.all([
    listBrands(),
    listProductsDetail(),
    getLatestRates(),
  ])

  // CEO chỉ xem, không sửa được
  const canWrite = me.role === 'admin'

  return (
    <ProductCatalog
      brands={brands}
      products={products}
      rates={rates}
      canWrite={canWrite}
    />
  )
}
