/**
 * Đồng bộ kho theo mã hàng cho đơn BÁN — 1 nguồn sự thật dùng chung cho
 * createOrder / updateOrder / setFulfillmentStatus.
 *
 * Quyết định trừ kho (PURE, test được): trừ ⇔
 *   - chưa trừ (stockDeducted = false), VÀ
 *   - đơn KHÔNG ở trạng thái Nháp (draft), VÀ
 *   - có ít nhất 1 dòng có mã hàng (hasItemWithProduct), VÀ
 *   - có kho để trừ (hasWarehouse: kho đơn hoặc kho chính công ty).
 */
export function shouldDeductOrderStock(o: {
  fulfillmentStatus: string
  stockDeducted: boolean
  hasItemWithProduct: boolean
  hasWarehouse: boolean
  cameFromDraftOrNew: boolean   // đơn MỚI tạo, hoặc VỪA rời Nháp. false = đơn cũ đã non-draft
}): boolean {
  return (
    !o.stockDeducted &&
    o.fulfillmentStatus !== 'draft' &&
    o.hasItemWithProduct &&
    o.hasWarehouse &&
    // KHÔNG trừ hồi tố đơn cũ "không trừ kho" (đã non-draft từ trước mà chưa trừ) — giữ số lịch sử.
    o.cameFromDraftOrNew
  )
}

import { createClient } from '@/lib/supabase/server'
import { deductOrderStock } from '@/features/warehouse/actions'
import { defaultWarehouseId } from '@/features/warehouse/queries'

/**
 * Trừ kho cho 1 đơn bán NẾU đủ điều kiện (shouldDeductOrderStock).
 * Gọi sau khi tạo đơn, sửa đơn, hoặc đổi trạng thái khỏi Nháp → đảm bảo MỌI đường vào
 * đều đồng bộ kho. Tự dùng kho chính của công ty khi đơn chưa gán kho.
 * Idempotent: đơn đã trừ (stock_deducted) hoặc còn Nháp → bỏ qua.
 */
export async function maybeDeductOrderStock(
  orderId: string,
  opts?: { previousStatus?: string },   // bỏ trống = đơn mới tạo; có = sửa/đổi trạng thái (chỉ trừ nếu trước đó là Nháp)
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: order } = await supabase
    .from('customer_orders')
    .select('id, company_id, fulfillment_status, warehouse_id, stock_deducted, order_date')
    .eq('id', orderId)
    .single()
  if (!order) return {}
  if (order.stock_deducted || order.fulfillment_status === 'draft') return {}

  // Đơn mới (không truyền previousStatus) hoặc đơn VỪA rời Nháp → được trừ.
  // Đơn cũ đã non-draft mà chưa trừ (legacy "không trừ kho") → KHÔNG trừ hồi tố.
  const cameFromDraftOrNew = opts?.previousStatus === undefined || opts.previousStatus === 'draft'

  const { data: itemRows } = await supabase
    .from('customer_order_items')
    .select('product_id, qty')
    .eq('order_id', orderId)
  const stockItems = (itemRows ?? [])
    .filter((r) => !!r.product_id)
    .map((r) => ({ product_id: r.product_id as string, quantity: Number(r.qty) }))

  // Kho để trừ: kho đã gán trên đơn, nếu chưa có → kho chính của công ty.
  let warehouseId = order.warehouse_id as string | null
  if (!warehouseId) warehouseId = await defaultWarehouseId(order.company_id as string)

  if (!shouldDeductOrderStock({
    fulfillmentStatus: order.fulfillment_status as string,
    stockDeducted: order.stock_deducted as boolean,
    hasItemWithProduct: stockItems.length > 0,
    hasWarehouse: !!warehouseId,
    cameFromDraftOrNew,
  })) return {}

  // Đơn chưa lưu kho mà trừ từ kho chính → ghi kho đã dùng vào đơn (để sửa/hoàn kho sau biết kho nào).
  if (!order.warehouse_id && warehouseId) {
    await supabase.from('customer_orders').update({ warehouse_id: warehouseId }).eq('id', orderId)
  }

  return deductOrderStock(orderId, warehouseId as string, stockItems, order.order_date as string)
}
