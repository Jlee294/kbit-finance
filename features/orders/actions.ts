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
import { deductOrderStock } from '@/features/warehouse/actions'

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

    // Tự động trừ kho nếu đơn không phải nháp và có chọn kho
    if (input.warehouse_id && input.fulfillment_status !== 'draft') {
      const stockItems = input.items
        .filter((it) => !!it.product_id)
        .map((it) => ({ product_id: it.product_id!, quantity: it.qty }))

      if (stockItems.length > 0) {
        const deductResult = await deductOrderStock(order.id, input.warehouse_id, stockItems)
        if (deductResult.error) {
          // Rollback: xoá đơn vừa tạo
          await supabase.from('customer_orders').delete().eq('id', order.id)
          throw new Error(deductResult.error)
        }
      }
    }

    revalidatePath('/don-hang')
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
  // Nếu đã trừ kho, không cho thay đổi kho hoặc số lượng
  if (existing.stock_deducted) {
    const warehouseChanged = (input.warehouse_id ?? null) !== (existing.warehouse_id ?? null)
    if (warehouseChanged) throw new Error('Đơn đã xuất kho — không thể đổi kho')
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

  revalidatePath('/don-hang')
  revalidatePath(`/don-hang/${id}`)
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

  revalidatePath('/don-hang')
  revalidatePath(`/don-hang/${id}`)
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
