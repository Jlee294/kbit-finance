import { getCurrentUser, canEdit } from '@/lib/auth'
import { listProducts } from '@/features/products/queries'
import { listStock } from '@/features/warehouse/queries'
import { MaHangCatalog, type MaHangRow } from '@/features/products/components/MaHangCatalog'

export const dynamic = 'force-dynamic'

export default async function MaHangPage() {
  const [me, products, stock] = await Promise.all([
    getCurrentUser(),
    listProducts(),
    listStock(),
  ])

  // Tổng tồn kho theo từng mã hàng (cộng mọi kho)
  const stockByProduct = new Map<string, number>()
  for (const s of stock) {
    stockByProduct.set(s.product_id, (stockByProduct.get(s.product_id) ?? 0) + s.qty_on_hand)
  }

  const rows: MaHangRow[] = products.map((p) => ({
    id:          p.id,
    code:        p.code,
    name:        p.name,
    unit:        p.unit,
    qty_on_hand: stockByProduct.get(p.id) ?? 0,
  }))

  return <MaHangCatalog rows={rows} canWrite={!!me && canEdit(me.role)} />
}
