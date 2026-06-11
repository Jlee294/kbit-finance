'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, canEdit, canApprove } from '@/lib/auth'
import {
  createOrderSchema,
  updateOrderSchema,
  type CreateOrderInput,
  type UpdateOrderInput,
  FULFILLMENT,
} from './schema'
import { computeOrderTotals, derivePaymentStatus } from './status'
import { buildOrderCode, orderCodePrefix } from './order-code'
import { getNextOrderSeq } from './queries'
import { defaultWarehouseId } from '@/features/warehouse/queries'
import { deductOrderStock }   from '@/features/warehouse/actions'
import { computeStockDeltas } from './stock-deltas'
import { maybeDeductOrderStock } from './stock-sync'

// ── Helpers ───────────────────────────────────────────────────────────────────

async function requireEditor() {
  const user = await getCurrentUser()
  if (!user || !canEdit(user.role)) {
    throw new Error('Không có quyền thực hiện thao tác này')
  }
  return user
}

async function requireApprover() {
  const user = await getCurrentUser()
  if (!user || !canApprove(user.role)) {
    throw new Error('Cần quyền kế toán trưởng hoặc admin')
  }
  return user
}

// ── createOrder ───────────────────────────────────────────────────────────────

/**
 * Tạo đơn hàng mới với retry khi trùng mã (race condition).
 * Tối đa 3 lần thử.
 */
export async function createOrder(raw: CreateOrderInput) {
  const user = await requireEditor()
  const supabase = await createClient()

  const input = createOrderSchema.parse(raw)

  // C1: chặn chọn kho thuộc CÔNG TY KHÁC (kbit_deduct_order_item suy công ty TỪ kho
  // → nếu kho khác công ty của đơn sẽ trừ nhầm tồn + sai giá vốn). Chốt ở server.
  if (input.warehouse_id) {
    const { data: wh } = await supabase.from('warehouses').select('company_id').eq('id', input.warehouse_id).single()
    if (wh && wh.company_id !== input.company_id) {
      throw new Error('Kho xuất hàng không thuộc công ty của đơn. Vui lòng chọn kho của đúng công ty.')
    }
  }

  // B: không chọn kho → tự dùng kho chính của công ty (để tự đồng bộ kho theo mã hàng).
  if (!input.warehouse_id) input.warehouse_id = await defaultWarehouseId(input.company_id)

  const { grandTotal } = computeOrderTotals(
    input.items,
    input.discount_pct,
    input.vat_pct,
    input.shipping_fee,
  )
  const paymentStatus = derivePaymentStatus(grandTotal, 0)

  // Lấy customer code để build mã đơn
  const { data: customer, error: custErr } = await supabase
    .from('customers')
    .select('code')
    .eq('id', input.customer_id)
    .single()
  if (custErr || !customer) throw new Error('Không tìm thấy khách hàng')

  const MAX_RETRY = 3
  for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
    const seq = await getNextOrderSeq(customer.code, input.order_date)
    const orderCode = buildOrderCode(customer.code, input.order_date, seq)

    // Insert đơn hàng
    const { data: order, error: orderErr } = await supabase
      .from('customer_orders')
      .insert({
        company_id: input.company_id,
        project_id: input.project_id ?? null,
        customer_id: input.customer_id,
        order_code: orderCode,
        order_date: input.order_date,
        delivery_date: input.delivery_date ?? null,
        grand_total: grandTotal,
        amount_paid: 0,
        fulfillment_status: input.fulfillment_status,
        payment_status: paymentStatus,
        lot_no: input.lot_no ?? null,
        expiry_date: input.expiry_date ?? null,
        is_intercompany: input.is_intercompany,
        counterpart_company_id: input.counterpart_company_id ?? null,
        discount_pct: input.discount_pct,
        vat_pct: input.vat_pct,
        shipping_fee: input.shipping_fee,
        warehouse_id: input.warehouse_id ?? null,
        // Hóa đơn
        invoice_template:  input.invoice_template  ?? null,
        invoice_symbol:    input.invoice_symbol    ?? null,
        invoice_no:        input.invoice_no        ?? null,
        invoice_date:      input.invoice_date      ?? null,
        customer_tax_code: input.customer_tax_code ?? null,
        vat_amount:        input.vat_amount        ?? null,
        dinh_khoan_no:     input.dinh_khoan_no     ?? null,
        dinh_khoan_co:     input.dinh_khoan_co     ?? null,
        nhan_su_thuc_hien: input.nhan_su_thuc_hien ?? null,
        created_by: user.id,
      })
      .select('id, order_code')
      .single()

    if (orderErr) {
      // 23505 = unique_violation (trùng order_code — race condition)
      if (orderErr.code === '23505' && attempt < MAX_RETRY - 1) continue
      throw new Error(orderErr.message)
    }

    // Insert các dòng hàng
    const items = input.items.map((it) => ({
      order_id: order.id,
      product_id: it.product_id ?? null,
      description: it.description ?? null,
      qty: it.qty,
      unit_price: it.unit_price,
      lot_no: it.lot_no ?? null,
      expiry_date: it.expiry_date ?? null,
    }))

    const { error: itemsErr } = await supabase
      .from('customer_order_items')
      .insert(items)

    if (itemsErr) {
      // Rollback: xoá đơn vừa tạo
      await supabase.from('customer_orders').delete().eq('id', order.id)
      throw new Error(itemsErr.message)
    }

    // Tự động trừ kho theo mã hàng (kho chính nếu không chọn) — 1 nguồn sự thật ở stock-sync.
    // Dòng không mã hàng bị bỏ qua; đơn Nháp chưa trừ; cho phép kho âm.
    const ds = await maybeDeductOrderStock(order.id)
    if (ds.error) {
      await supabase.from('customer_orders').delete().eq('id', order.id)  // rollback đơn vừa tạo
      throw new Error(ds.error)
    }

    revalidatePath('/don-hang')
    revalidatePath('/kho')
    return { id: order.id, orderCode: order.order_code }
  }

  throw new Error('Không thể tạo đơn hàng — vui lòng thử lại')
}

// ── updateOrder ───────────────────────────────────────────────────────────────

/**
 * Cập nhật đơn hàng (chỉ khi chưa giao — draft / confirmed / awaiting_goods).
 * Xoá toàn bộ items cũ và tạo lại.
 */
export async function updateOrder(id: string, raw: UpdateOrderInput) {
  await requireEditor()
  const supabase = await createClient()

  const input = updateOrderSchema.parse(raw)

  // Kiểm tra đơn có tồn tại và chưa delivered
  const { data: existing, error: fetchErr } = await supabase
    .from('customer_orders')
    .select('id, fulfillment_status, amount_paid, stock_deducted, warehouse_id')
    .eq('id', id)
    .single()

  if (fetchErr || !existing) throw new Error('Không tìm thấy đơn hàng')
  if (existing.fulfillment_status === 'delivered') {
    throw new Error('Không thể sửa đơn đã giao')
  }

  // C1: chặn chọn kho thuộc CÔNG TY KHÁC (kbit_deduct_order_item / kbit_adjust_stock
  // suy công ty TỪ kho → trừ nhầm tồn + sai giá vốn). Chốt ở server trước khi điều chỉnh tồn.
  if (input.warehouse_id) {
    const { data: wh } = await supabase.from('warehouses').select('company_id').eq('id', input.warehouse_id).single()
    if (wh && wh.company_id !== input.company_id) {
      throw new Error('Kho xuất hàng không thuộc công ty của đơn. Vui lòng chọn kho của đúng công ty.')
    }
  }

  // B: giữ kho cũ nếu không chọn; đơn cũ chưa có kho → dùng kho chính của công ty.
  if (!input.warehouse_id) input.warehouse_id = existing.warehouse_id ?? await defaultWarehouseId(input.company_id)

  // BLOCKER 6: nếu đơn ĐÃ trừ kho, đọc dòng hàng CŨ trước khi xóa để điều chỉnh
  // tồn theo số mới (hoàn phần cũ, trừ phần mới — cho phép âm).
  let oldStockItems: { product_id: string | null; qty: number }[] = []
  if (existing.stock_deducted) {
    const { data: oldRows } = await supabase
      .from('customer_order_items')
      .select('product_id, qty')
      .eq('order_id', id)
    oldStockItems = (oldRows ?? []).map((r) => ({ product_id: r.product_id, qty: Number(r.qty) }))
  }

  const { grandTotal } = computeOrderTotals(
    input.items,
    input.discount_pct,
    input.vat_pct,
    input.shipping_fee,
  )
  const paymentStatus = derivePaymentStatus(grandTotal, Number(existing.amount_paid))

  // Cập nhật đơn hàng
  const { error: updateErr } = await supabase
    .from('customer_orders')
    .update({
      company_id: input.company_id,
      project_id: input.project_id ?? null,
      customer_id: input.customer_id,
      order_date: input.order_date,
      delivery_date: input.delivery_date ?? null,
      grand_total: grandTotal,
      fulfillment_status: input.fulfillment_status,
      payment_status: paymentStatus,
      lot_no: input.lot_no ?? null,
      expiry_date: input.expiry_date ?? null,
      is_intercompany: input.is_intercompany,
      counterpart_company_id: input.counterpart_company_id ?? null,
      discount_pct: input.discount_pct,
      vat_pct: input.vat_pct,
      shipping_fee: input.shipping_fee,
      warehouse_id: input.warehouse_id ?? null,
      invoice_template:  input.invoice_template  ?? null,
      invoice_symbol:    input.invoice_symbol    ?? null,
      invoice_no:        input.invoice_no        ?? null,
      invoice_date:      input.invoice_date      ?? null,
      customer_tax_code: input.customer_tax_code ?? null,
      vat_amount:        input.vat_amount        ?? null,
      dinh_khoan_no:     input.dinh_khoan_no     ?? null,
      dinh_khoan_co:     input.dinh_khoan_co     ?? null,
      nhan_su_thuc_hien: input.nhan_su_thuc_hien ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (updateErr) throw new Error(updateErr.message)

  // Xoá items cũ, insert lại
  const { error: delErr } = await supabase
    .from('customer_order_items')
    .delete()
    .eq('order_id', id)

  if (delErr) throw new Error(delErr.message)

  const items = input.items.map((it) => ({
    order_id: id,
    product_id: it.product_id ?? null,
    description: it.description ?? null,
    qty: it.qty,
    unit_price: it.unit_price,
    lot_no: it.lot_no ?? null,
    expiry_date: it.expiry_date ?? null,
  }))

  const { error: itemsErr } = await supabase
    .from('customer_order_items')
    .insert(items)

  if (itemsErr) throw new Error(itemsErr.message)

  // BLOCKER 6: điều chỉnh tồn kho theo chênh lệch dòng hàng cũ ↔ mới (cho phép âm).
  if (existing.stock_deducted) {
    const deltas = computeStockDeltas(
      oldStockItems,
      input.items.map((it) => ({ product_id: it.product_id ?? null, qty: it.qty })),
      existing.warehouse_id,
      input.warehouse_id ?? null,
    )
    if (deltas.length > 0) {
      const me = await getCurrentUser()
      for (const d of deltas) {
        // kbit_adjust_stock TỰ ghi dòng sổ 'adjustment' (qty mang dấu + unit_cost) atomic;
        // không ghi tay nữa để báo cáo NXT/khóa sổ tính đúng (0032).
        const { error: adjErr } = await supabase.rpc('kbit_adjust_stock', {
          p_warehouse_id: d.warehouse_id,
          p_product_id:   d.product_id,
          p_delta:        d.delta,
          p_txn_date:     input.order_date,
          p_note:         d.delta > 0 ? `Hoàn kho do sửa đơn ${id}` : `Trừ thêm kho do sửa đơn ${id}`,
          p_created_by:   me?.id ?? null,
        })
        if (adjErr) throw new Error(`Không điều chỉnh được tồn kho: ${adjErr.message}`)
      }
    }
  } else {
    // Đơn CHƯA trừ kho → chỉ trừ nếu TRƯỚC khi sửa là Nháp (vừa xác nhận).
    // Đơn cũ "không trừ kho" (đã non-draft từ trước) KHÔNG bị trừ hồi tố → giữ số lịch sử.
    const ds = await maybeDeductOrderStock(id, { previousStatus: existing.fulfillment_status })
    if (ds.error) throw new Error(ds.error)
  }

  revalidatePath('/don-hang')
  revalidatePath(`/don-hang/${id}`)
  revalidatePath('/kho')
}

// ── setFulfillmentStatus ──────────────────────────────────────────────────────

/**
 * Chuyển trạng thái giao hàng.
 * - draft → confirmed: mọi người có quyền edit
 * - confirmed → awaiting_goods / delivered: cần quyền approve
 * - Không cho phép quay lại trạng thái trước
 */
const FULFILLMENT_ORDER = FULFILLMENT  // ['draft','confirmed','awaiting_goods','delivered']

export async function setFulfillmentStatus(
  id: string,
  newStatus: typeof FULFILLMENT[number],
) {
  const supabase = await createClient()

  const { data: order, error: fetchErr } = await supabase
    .from('customer_orders')
    .select('id, fulfillment_status')
    .eq('id', id)
    .single()

  if (fetchErr || !order) throw new Error('Không tìm thấy đơn hàng')

  const currentIdx = FULFILLMENT_ORDER.indexOf(order.fulfillment_status as typeof FULFILLMENT[number])
  const newIdx = FULFILLMENT_ORDER.indexOf(newStatus)

  if (newIdx <= currentIdx) {
    throw new Error('Không thể quay lại trạng thái trước')
  }

  // Chuyển sang confirmed: chỉ cần editor
  // Chuyển sang awaiting_goods / delivered: cần approver
  if (newIdx >= 2) {
    await requireApprover()
  } else {
    await requireEditor()
  }

  const { error: updateErr } = await supabase
    .from('customer_orders')
    .update({ fulfillment_status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (updateErr) throw new Error(updateErr.message)

  // Bịt lỗ hổng: chuyển TỪ Nháp sang xác nhận → tự trừ kho. Đơn cũ đã non-draft KHÔNG trừ hồi tố.
  const ds = await maybeDeductOrderStock(id, { previousStatus: order.fulfillment_status })
  if (ds.error) throw new Error(ds.error)

  revalidatePath('/don-hang')
  revalidatePath(`/don-hang/${id}`)
  revalidatePath('/kho')
}

// ── deleteOrder ───────────────────────────────────────────────────────────────

/**
 * Xoá đơn hàng — chỉ khi còn ở draft và chưa có thanh toán.
 */
export async function deleteOrder(id: string) {
  await requireEditor()
  const supabase = await createClient()

  const { data: order, error: fetchErr } = await supabase
    .from('customer_orders')
    .select('id, fulfillment_status, amount_paid')
    .eq('id', id)
    .single()

  if (fetchErr || !order) throw new Error('Không tìm thấy đơn hàng')
  if (order.fulfillment_status !== 'draft') {
    throw new Error('Chỉ xoá được đơn ở trạng thái Nháp')
  }
  if (Number(order.amount_paid) > 0) {
    throw new Error('Đơn đã có thanh toán, không thể xoá')
  }

  const { error } = await supabase
    .from('customer_orders')
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message)

  revalidatePath('/don-hang')
}

/**
 * KTT H2: Đẩy đơn bán (chưa có stock_deducted) vào kho thủ công.
 * Cho đơn cũ không tự trừ kho khi tạo / order_date trước khi có kho / draft sau đó duyệt.
 */
export async function pushOrderToStock(orderId: string): Promise<{ ok: true; pushed: number } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data: order } = await supabase
    .from('customer_orders')
    .select('id, company_id, fulfillment_status, warehouse_id, stock_deducted, order_date')
    .eq('id', orderId)
    .single()
  if (!order) return { ok: false, error: 'Không tìm thấy đơn' }
  if (order.stock_deducted) return { ok: false, error: 'Đơn đã trừ kho rồi. Vào Kho → Lịch sử xem dòng.' }
  if (order.fulfillment_status === 'draft') return { ok: false, error: 'Đơn còn Nháp — chuyển sang Đã xác nhận / Đã giao trước khi đẩy kho.' }

  let warehouseId: string | null = order.warehouse_id as string | null
  if (!warehouseId) {
    warehouseId = await defaultWarehouseId(order.company_id as string)
    if (!warehouseId) return { ok: false, error: 'Công ty này chưa có kho. Vào Danh mục → Kho để tạo trước.' }
    await supabase.from('customer_orders').update({ warehouse_id: warehouseId }).eq('id', orderId)
  }

  const { data: items } = await supabase
    .from('customer_order_items')
    .select('product_id, qty')
    .eq('order_id', orderId)

  const stockItems = (items ?? [])
    .filter((r: any) => !!r.product_id)
    .map((r: any) => ({ product_id: r.product_id, quantity: Number(r.qty) }))

  if (stockItems.length === 0) {
    return { ok: false, error: 'Đơn không có dòng nào gắn Mã hàng. Sửa đơn rồi đẩy lại.' }
  }

  const res = await deductOrderStock(orderId, warehouseId, stockItems, order.order_date as string)
  if (res.error) return { ok: false, error: res.error }

  revalidatePath('/don-hang')
  revalidatePath(`/don-hang/${orderId}`)
  revalidatePath('/kho')
  revalidatePath('/kho/lich-su')
  return { ok: true, pushed: stockItems.length }
}
