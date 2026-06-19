import { getCurrentUser, canEdit, canViewCosts } from '@/lib/auth'
import { listProducts } from '@/features/products/queries'
import { listStock } from '@/features/warehouse/queries'
import { listMovingCostByProduct } from '@/features/inventory-cost/queries'
import { MaHangCatalog, type MaHangRow } from '@/features/products/components/MaHangCatalog'

export const dynamic = 'force-dynamic'

export default async function MaHangPage() {
  const [me, products, stock, costMap] = await Promise.all([
    getCurrentUser(),
    listProducts(),
    listStock(),
    listMovingCostByProduct(),
  ])
  const showCost = !!me && canViewCosts(me.role)

  // Tổng tồn kho theo từng mã hàng (cộng mọi kho)
  const stockByProduct = new Map<string, number>()
  for (const s of stock) {
    stockByProduct.set(s.product_id, (stockByProduct.get(s.product_id) ?? 0) + s.qty_on_hand)
  }

  const rows: MaHangRow[] = products.map((p) => {
    const qty = stockByProduct.get(p.id) ?? 0
    const c   = costMap.get(p.id)
    return {
      id:          p.id,
      code:        p.code,
      name:        p.name,
      unit:        p.unit,
      qty_on_hand: qty,
      // Thành tiền tồn = SL × giá vốn BQ (chỉ vai trò xem giá vốn mới thấy)
      stock_value: showCost ? Math.round(qty * (c?.avg ?? 0)) : null,
    }
  })

  return <MaHangCatalog rows={rows} canWrite={!!me && canEdit(me.role)} showCost={showCost} />
}
