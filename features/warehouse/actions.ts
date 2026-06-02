'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import { receiptSchema, issueSchema, transferSchema } from './schema'

export interface ActionResult { error?: string }

// ── Nhập kho ─────────────────────────────────────────────────────────────────

export async function receiveStock(input: unknown): Promise<ActionResult> {
  try {
    const data = receiptSchema.parse(input)
    const supabase = await createClient()
    const me = await getCurrentUser()

    const { error } = await supabase.rpc('kbit_receive_stock', {
      p_warehouse_id: data.warehouse_id,
      p_product_id:   data.product_id,
      p_qty:          data.qty,
      p_txn_date:     data.txn_date,
      p_note:         data.note ?? null,
      p_created_by:   me?.id ?? null,
    })
    if (error) return { error: error.message }

    revalidatePath('/kho')
    revalidatePath('/kho/lich-su')
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Lỗi không xác định' }
  }
}

// ── Xuất kho ──────────────────────────────────────────────────────────────────

export async function issueStock(input: unknown): Promise<ActionResult> {
  try {
    const data = issueSchema.parse(input)
    const supabase = await createClient()
    const me = await getCurrentUser()

    const { error } = await supabase.rpc('kbit_issue_stock', {
      p_warehouse_id: data.warehouse_id,
      p_product_id:   data.product_id,
      p_qty:          data.qty,
      p_reason:       data.reason,
      p_txn_date:     data.txn_date,
      p_note:         data.note ?? null,
      p_created_by:   me?.id ?? null,
    })
    if (error) return { error: error.message }

    revalidatePath('/kho')
    revalidatePath('/kho/lich-su')
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Lỗi không xác định' }
  }
}

// ── Luân chuyển giữa kho ─────────────────────────────────────────────────────

export async function transferStock(input: unknown): Promise<ActionResult> {
  try {
    const data = transferSchema.parse(input)
    const supabase = await createClient()
    const me = await getCurrentUser()

    const { error } = await supabase.rpc('kbit_transfer_stock_full', {
      p_from_warehouse: data.from_warehouse_id,
      p_to_warehouse:   data.to_warehouse_id,
      p_product_id:     data.product_id,
      p_qty:            data.qty,
      p_txn_date:       data.txn_date,
      p_note:           data.note ?? null,
      p_created_by:     me?.id ?? null,
    })
    if (error) return { error: error.message }

    revalidatePath('/kho')
    revalidatePath('/kho/lich-su')
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Lỗi không xác định' }
  }
}

// ── Trừ kho theo đơn hàng (gọi từ createOrder) ───────────────────────────────

export async function deductOrderStock(
  orderId: string,
  warehouseId: string,
  items: { product_id: string; quantity: number }[],
): Promise<ActionResult> {
  try {
    const supabase = await createClient()
    const me = await getCurrentUser()

    // Kiểm tra tồn kho tất cả mặt hàng trước
    for (const item of items) {
      if (!item.product_id) continue
      const { data: stock } = await supabase
        .from('warehouse_stock')
        .select('qty_on_hand')
        .eq('warehouse_id', warehouseId)
        .eq('product_id', item.product_id)
        .single()

      const available = stock?.qty_on_hand ?? 0
      if (available < item.quantity) {
        const { data: prod } = await supabase.from('products').select('name').eq('id', item.product_id).single()
        return { error: `Không đủ tồn kho cho "${prod?.name ?? item.product_id}". Có: ${available}` }
      }
    }

    // Trừ từng mặt hàng qua atomic RPC (stock + ledger trong 1 transaction mỗi item)
    for (const item of items) {
      if (!item.product_id) continue

      const { error } = await supabase.rpc('kbit_deduct_order_item', {
        p_warehouse_id: warehouseId,
        p_product_id:   item.product_id,
        p_qty:          item.quantity,
        p_order_id:     orderId,
        p_created_by:   me?.id ?? null,
      })
      if (error) return { error: error.message }
    }

    // Đánh dấu đơn đã trừ kho
    await supabase
      .from('customer_orders')
      .update({ stock_deducted: true })
      .eq('id', orderId)

    revalidatePath('/kho')
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Lỗi không xác định' }
  }
}
