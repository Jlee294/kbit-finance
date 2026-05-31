import { getCurrentUser, canApprove } from '@/lib/auth'
import { listBrands } from '@/features/brands/queries'
import { listProductsDetail, getLatestRates } from '@/features/products/queries'
import { ProductCatalog } from '@/features/products/components/ProductCatalog'

export const dynamic = 'force-dynamic'

export default async function ProductPage() {
  const [me, brands, products, rates] = await Promise.all([
    getCurrentUser(),
    listBrands(),
    listProductsDetail(),
    getLatestRates(),
  ])

  const canWrite = me ? canApprove(me.role) : false

  return (
    <ProductCatalog
      brands={brands}
      products={products}
      rates={rates}
      canWrite={canWrite}
    />
  )
}
