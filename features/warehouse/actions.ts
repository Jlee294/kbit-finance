'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import { receiptSchema, issueSchema, transferSchema, warehouseAdminSchema } from './schema'

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
      p_unit_cost:    data.unit_cost ?? null,
    })
    if (error) return { error: error.message }

    // KTT C3: nếu user tick "Chưa có hóa đơn" → update dòng kho vừa ghi
    if (data.has_invoice === false) {
      await supabase
        .from('warehouse_transactions')
        .update({ has_invoice: false })
        .eq('warehouse_id', data.warehouse_id)
        .eq('product_id', data.product_id)
        .eq('txn_date', data.txn_date)
        .eq('txn_type', 'receipt')
        .order('created_at', { ascending: false })
        .limit(1)
    }

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

    // KTT C3: cờ "chưa có HĐ" cho xuất kho
    if (data.has_invoice === false) {
      await supabase
        .from('warehouse_transactions')
        .update({ has_invoice: false })
        .eq('warehouse_id', data.warehouse_id)
        .eq('product_id', data.product_id)
        .eq('txn_date', data.txn_date)
        .eq('txn_type', 'issue')
        .order('created_at', { ascending: false })
        .limit(1)
    }

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
  orderDate?: string,   // ghi đúng ngày đơn vào sổ kho → chốt giá vốn lọc đúng kỳ
): Promise<ActionResult> {
  try {
    const supabase = await createClient()
    const me = await getCurrentUser()

    // CHO PHÉP KHO ÂM (Anh Thịnh chốt): bán quá tồn vẫn ghi nhận, tồn xuống âm và hiện đỏ
    // ở trang Kho. KHÔNG chặn báo lỗi nữa — RPC kbit_deduct_order_batch tự cho âm (mig 0027).

    // Trừ CẢ LÔ qua kbit_deduct_order_batch: ghi sổ kho nhiều dòng trong 1 GIAO DỊCH
    // (nguyên tử) — lỗi giữa chừng → toàn bộ rollback, không để dòng trước trừ lén tồn.
    const stockItems = items
      .filter((it) => it.product_id)
      .map((it) => ({ product_id: it.product_id, qty: it.quantity }))
    if (stockItems.length > 0) {
      const { error } = await supabase.rpc('kbit_deduct_order_batch', {
        p_warehouse_id: warehouseId,
        p_order_id:     orderId,
        p_items:        stockItems,
        p_created_by:   me?.id ?? null,
        ...(orderDate ? { p_txn_date: orderDate } : {}),
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

// ── Quản lý kho (danh mục) ────────────────────────────────────────────────────

export async function createWarehouse(input: unknown): Promise<ActionResult> {
  try {
    const data = warehouseAdminSchema.parse(input)
    const supabase = await createClient()
    // Đặt làm kho chính → gỡ cờ chính ở các kho khác cùng công ty (ràng buộc 1 chính/công ty).
    if (data.is_default) {
      await supabase.from('warehouses').update({ is_default: false })
        .eq('company_id', data.company_id).eq('is_default', true)
    }
    const { error } = await supabase.from('warehouses').insert(data)
    if (error) return { error: error.message }
    revalidatePath('/danh-muc/kho')
    revalidatePath('/kho')
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Lỗi không xác định' }
  }
}

export async function updateWarehouse(id: string, input: unknown): Promise<ActionResult> {
  try {
    const data = warehouseAdminSchema.parse(input)
    const supabase = await createClient()
    // Đặt làm kho chính → gỡ cờ chính ở các kho KHÁC cùng công ty trước khi lưu.
    if (data.is_default) {
      await supabase.from('warehouses').update({ is_default: false })
        .eq('company_id', data.company_id).eq('is_default', true).neq('id', id)
    }
    const { error } = await supabase.from('warehouses').update(data).eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/danh-muc/kho')
    revalidatePath('/kho')
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Lỗi không xác định' }
  }
}
