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

    // Điều chỉnh tồn kho qua hàm atomic
    const { error: rpcErr } = await supabase.rpc('kbit_adjust_stock', {
      p_warehouse_id: data.warehouse_id,
      p_product_id:   data.product_id,
      p_delta:        data.qty,
    })
    if (rpcErr) return { error: rpcErr.message }

    // Ghi sổ cái
    const { error: txnErr } = await supabase.from('warehouse_transactions').insert({
      txn_type:     'receipt',
      warehouse_id: data.warehouse_id,
      product_id:   data.product_id,
      qty:          data.qty,
      txn_date:     data.txn_date,
      note:         data.note ?? null,
      created_by:   me?.id ?? null,
    })
    if (txnErr) return { error: txnErr.message }

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

    // Kiểm tra tồn kho trước
    const { data: stock } = await supabase
      .from('warehouse_stock')
      .select('qty_on_hand')
      .eq('warehouse_id', data.warehouse_id)
      .eq('product_id', data.product_id)
      .single()

    const available = stock?.qty_on_hand ?? 0
    if (available < data.qty) {
      return { error: `Không đủ tồn kho. Hiện có: ${available} — yêu cầu: ${data.qty}` }
    }

    const { error: rpcErr } = await supabase.rpc('kbit_adjust_stock', {
      p_warehouse_id: data.warehouse_id,
      p_product_id:   data.product_id,
      p_delta:        -data.qty,
    })
    if (rpcErr) return { error: rpcErr.message }

    const { error: txnErr } = await supabase.from('warehouse_transactions').insert({
      txn_type:     'issue',
      warehouse_id: data.warehouse_id,
      product_id:   data.product_id,
      qty:          data.qty,
      reason:       data.reason,
      txn_date:     data.txn_date,
      note:         data.note ?? null,
      created_by:   me?.id ?? null,
    })
    if (txnErr) return { error: txnErr.message }

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

    // Kiểm tra tồn kho nguồn
    const { data: stock } = await supabase
      .from('warehouse_stock')
      .select('qty_on_hand')
      .eq('warehouse_id', data.from_warehouse_id)
      .eq('product_id', data.product_id)
      .single()

    const available = stock?.qty_on_hand ?? 0
    if (available < data.qty) {
      return { error: `Kho nguồn không đủ tồn. Hiện có: ${available} — yêu cầu: ${data.qty}` }
    }

    // Luân chuyển atomic qua RPC (trừ kho nguồn + cộng kho đích trong 1 DB transaction)
    const { error: rpcErr } = await supabase.rpc('kbit_transfer_stock', {
      p_from_warehouse: data.from_warehouse_id,
      p_to_warehouse:   data.to_warehouse_id,
      p_product_id:     data.product_id,
      p_qty:            data.qty,
    })
    if (rpcErr) return { error: rpcErr.message }

    // Ghi 2 dòng sổ cái (dùng cùng transfer_id để liên kết)
    const transferId = crypto.randomUUID()
    const { error: txnErr } = await supabase.from('warehouse_transactions').insert([
      {
        txn_type:          'transfer_out',
        warehouse_id:      data.from_warehouse_id,
        to_warehouse_id:   data.to_warehouse_id,
        product_id:        data.product_id,
        qty:               data.qty,
        txn_date:          data.txn_date,
        note:              data.note ?? null,
        ref_transfer_id:   transferId,
        created_by:        me?.id ?? null,
      },
      {
        txn_type:          'transfer_in',
        warehouse_id:      data.to_warehouse_id,
        product_id:        data.product_id,
        qty:               data.qty,
        txn_date:          data.txn_date,
        note:              data.note ?? null,
        ref_transfer_id:   transferId,
        created_by:        me?.id ?? null,
      },
    ])
    if (txnErr) return { error: txnErr.message }

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

    // Trừ từng mặt hàng
    for (const item of items) {
      if (!item.product_id) continue

      const { error: rpcErr } = await supabase.rpc('kbit_adjust_stock', {
        p_warehouse_id: warehouseId,
        p_product_id:   item.product_id,
        p_delta:        -item.quantity,
      })
      if (rpcErr) return { error: rpcErr.message }

      await supabase.from('warehouse_transactions').insert({
        txn_type:     'order_deduction',
        warehouse_id: warehouseId,
        product_id:   item.product_id,
        qty:          item.quantity,
        txn_date:     new Date().toISOString().split('T')[0],
        ref_order_id: orderId,
        created_by:   me?.id ?? null,
      })
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
