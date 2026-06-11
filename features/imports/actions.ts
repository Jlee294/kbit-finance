'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { supplierImportSchema } from './schema'
import { allocateUnitCost } from './cost'
import { buildOrderCode } from '@/features/orders/order-code'
import { getNextSupplierOrderSeq } from './queries'
import { defaultWarehouseId } from '@/features/warehouse/queries'

/** Tạo đơn nhập khẩu mới. Trả về id đơn vừa tạo. */
export async function createImportOrder(input: unknown): Promise<string> {
  const data = supplierImportSchema.parse(input)
  const supabase = await createClient()

  // C-1: chặn chọn kho thuộc CÔNG TY KHÁC (kbit_receive_stock suy công ty TỪ kho
  // → nếu kho khác công ty của đơn sẽ cộng nhầm tồn + sai giá vốn). Chốt ở server.
  if (data.warehouse_id) {
    const { data: wh } = await supabase.from('warehouses').select('company_id').eq('id', data.warehouse_id).single()
    if (wh && wh.company_id !== data.company_id) {
      throw new Error('Kho nhập hàng không thuộc công ty của đơn. Vui lòng chọn kho của đúng công ty.')
    }
  }

  // B: không chọn kho → tự dùng kho chính của công ty (tự cộng tồn theo mã hàng).
  if (!data.warehouse_id) {
    const def = await defaultWarehouseId(data.company_id)
    if (def) data.warehouse_id = def
  }

  // (1) Chèn header. KHÔNG gửi cost_total / outstanding (GENERATED ALWAYS).
  //     order_type cố định 'import'. C4/D4: ghi exchange_rate khi KRW.
  const { items, order_code: rawCode, ...rest } = data
  const header = { ...rest, order_type: rest.order_type ?? 'import' }
  const manualCode = rawCode?.trim() || null

  // Mã đơn: nếu người dùng để trống → tự sinh <mãNCC>-MMYY-NN, retry chống trùng
  // (sao quy ước createOrder bên bán). Nếu gõ tay → dùng thẳng mã đó.
  let order: { id: string } | null = null
  if (manualCode) {
    const { data: o, error } = await supabase
      .from('supplier_orders')
      .insert({ ...header, order_code: manualCode })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    order = o
  } else {
    const { data: sup } = await supabase
      .from('suppliers').select('code').eq('id', header.supplier_id).single()
    const supCode = (sup?.code as string | undefined)?.trim() || 'NCC'
    for (let attempt = 0; attempt < 3; attempt++) {
      const seq  = await getNextSupplierOrderSeq(supCode, header.order_date)
      const code = buildOrderCode(supCode, header.order_date, seq)
      const { data: o, error } = await supabase
        .from('supplier_orders')
        .insert({ ...header, order_code: code })
        .select('id')
        .single()
      if (error) {
        if (error.code === '23505' && attempt < 2) continue  // trùng mã (race) → thử lại
        throw new Error(error.message)
      }
      order = o
      break
    }
  }
  if (!order) throw new Error('Không thể tạo mã đơn — vui lòng thử lại')

  // (2) Tính costTotalVnd để phân bổ unit_cost (C3/D3):
  //     cost_total lô NGUYÊN TỆ = goods_value + import_duty + other_fees (KHÔNG gồm vat_import)
  //     Đơn KRW → nhân exchange_rate ra VND; đơn VND → rate = 1
  const costTotalFc  = data.goods_value + data.import_duty + data.other_fees
  const rate         = data.currency === 'KRW' ? data.exchange_rate! : 1
  const costTotalVnd = costTotalFc * rate

  const unitCosts = allocateUnitCost(
    items.map((it) => ({ qty: it.qty, unit_price: it.unit_price })),
    costTotalVnd,
  )

  // (3) Chèn dòng hàng kèm unit_cost + KTT G: lot_no, expiry_date. KHÔNG gửi line_total (generated).
  const rows = items.map((it, i) => ({
    order_id:    order.id,
    product_id:  it.product_id  ?? null,
    description: it.description ?? null,
    qty:         it.qty,
    unit_price:  it.unit_price,
    unit_cost:   unitCosts[i],
    lot_no:      it.lot_no      || null,
    expiry_date: it.expiry_date || null,
  }))
  const { error: e2 } = await supabase.from('supplier_order_items').insert(rows)
  if (e2) throw new Error(e2.message)

  // Tự động cộng tồn kho — dùng kbit_receive_stock_batch (nguyên tử).
  // KTT G: pass lot_no + expiry_date xuống warehouse_transactions để query HSD sau.
  if (data.warehouse_id) {
    const stockItems = items
      .map((it, i) => ({
        product_id:  it.product_id,
        qty:         it.qty,
        unit_cost:   unitCosts[i],
        lot_no:      it.lot_no      || null,
        expiry_date: it.expiry_date || null,
      }))
      .filter((it) => it.product_id)
    if (stockItems.length > 0) {
      const { error: rpcErr } = await supabase.rpc('kbit_receive_stock_batch', {
        p_warehouse_id: data.warehouse_id,
        p_items:        stockItems,
        p_txn_date:     data.order_date,
        p_note:         `Nhập từ đơn ${order.id}`,
        p_created_by:   null,
      })
      if (rpcErr) {
        // Batch nguyên tử: kho CHƯA ghi gì → chỉ xóa đơn vừa tạo cho sạch.
        await supabase.from('supplier_order_items').delete().eq('order_id', order.id)
        await supabase.from('supplier_orders').delete().eq('id', order.id)
        throw new Error(`Không cộng được tồn kho: ${rpcErr.message}`)
      }
      await supabase.from('supplier_orders').update({ stock_added: true }).eq('id', order.id)
    }
  }

  revalidatePath('/nhap-khau')
  revalidatePath('/kho')
  return order.id
}

/** Sửa đơn nhập khẩu: cập nhật header + thay toàn bộ dòng (xóa rồi chèn lại + phân bổ lại). */
export async function updateImportOrder(id: string, input: unknown): Promise<void> {
  const data = supplierImportSchema.parse(input)
  const supabase = await createClient()
  const { items, ...header } = data

  // C-1: chặn chọn kho thuộc CÔNG TY KHÁC (kbit_receive_stock suy công ty TỪ kho).
  // Chốt ở server trước khi đụng tồn.
  if (data.warehouse_id) {
    const { data: wh } = await supabase.from('warehouses').select('company_id').eq('id', data.warehouse_id).single()
    if (wh && wh.company_id !== data.company_id) {
      throw new Error('Kho nhập hàng không thuộc công ty của đơn. Vui lòng chọn kho của đúng công ty.')
    }
  }

  // Bảo vệ tồn kho: nếu đơn ĐÃ nhập kho, không cho đổi mã hàng / số lượng / kho
  // (vì updateImportOrder không tự điều chỉnh tồn kho → sẽ làm lệch số). Vẫn cho
  // sửa thông tin hóa đơn, đơn giá, ghi chú... (không ảnh hưởng tồn kho).
  const { data: cur } = await supabase
    .from('supplier_orders')
    .select('stock_added, warehouse_id')
    .eq('id', id)
    .single()
  if (cur?.stock_added) {
    const { data: oldItems } = await supabase
      .from('supplier_order_items')
      .select('product_id, qty')
      .eq('order_id', id)
    const stockSignature = (rows: { product_id?: string | null; qty: number | string }[]) => {
      const m = new Map<string, number>()
      for (const r of rows) {
        if (!r.product_id) continue
        m.set(r.product_id, (m.get(r.product_id) ?? 0) + Number(r.qty))
      }
      return JSON.stringify([...m.entries()].sort())
    }
    const warehouseChanged = (header.warehouse_id ?? null) !== (cur.warehouse_id ?? null)
    const itemsChanged = stockSignature(oldItems ?? []) !== stockSignature(items)
    if (warehouseChanged || itemsChanged) {
      throw new Error(
        'Đơn này đã nhập kho nên không thể đổi mã hàng, số lượng hoặc kho (sẽ làm sai tồn kho). ' +
        'Bạn vẫn sửa được thông tin hóa đơn, đơn giá, ghi chú. Nếu cần đổi mã hàng/số lượng, hãy ' +
        'điều chỉnh ở mục Kho (Nhập/Xuất kho) rồi thử lại, hoặc liên hệ admin.',
      )
    }
  }

  // Sửa đơn KHÔNG đổi mã đơn (giữ mã gốc đã phát hành) → loại order_code khỏi payload update.
  const updateHeader = { ...header, order_type: header.order_type ?? 'import' }
  delete updateHeader.order_code
  const { error: e1 } = await supabase
    .from('supplier_orders')
    .update(updateHeader)
    .eq('id', id)
  if (e1) throw new Error(e1.message)

  // Xóa dòng cũ: RLS soi_del cho kbit_can_edit() → kế toán/KTT sửa được
  const { error: eDel } = await supabase
    .from('supplier_order_items')
    .delete()
    .eq('order_id', id)
  if (eDel) throw new Error(eDel.message)

  // Tính lại unit_cost (C3/D3 — cùng quy ước)
  const costTotalFc  = data.goods_value + data.import_duty + data.other_fees
  const rate         = data.currency === 'KRW' ? data.exchange_rate! : 1
  const costTotalVnd = costTotalFc * rate
  const unitCosts    = allocateUnitCost(
    items.map((it) => ({ qty: it.qty, unit_price: it.unit_price })),
    costTotalVnd,
  )

  const rows = items.map((it, i) => ({
    order_id:    id,
    product_id:  it.product_id  ?? null,
    description: it.description ?? null,
    qty:         it.qty,
    unit_price:  it.unit_price,
    unit_cost:   unitCosts[i],
    lot_no:      it.lot_no      || null,      // KTT G
    expiry_date: it.expiry_date || null,      // KTT G
  }))
  const { error: e2 } = await supabase.from('supplier_order_items').insert(rows)
  if (e2) throw new Error(e2.message)

  revalidatePath('/nhap-khau')
  revalidatePath(`/nhap-khau/${id}`)
}

/**
 * KTT H2: Đẩy đơn nhập (chưa có stock_added) vào kho.
 * Hữu ích cho đơn cũ tạo trước khi có kho hoặc đơn lúc tạo bị skip vì thiếu kho/sản phẩm.
 *
 * Idempotent: nếu đơn đã stock_added=true → không làm gì.
 */
export async function pushImportOrderToStock(orderId: string): Promise<{ ok: true; pushed: number } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data: order, error: oErr } = await supabase
    .from('supplier_orders')
    .select('id, company_id, warehouse_id, stock_added, order_date')
    .eq('id', orderId)
    .single()
  if (oErr) return { ok: false, error: oErr.message }
  if (!order) return { ok: false, error: 'Không tìm thấy đơn' }
  if (order.stock_added) return { ok: false, error: 'Đơn đã đẩy vào kho rồi (stock_added=true). Vào trang Kho → Lịch sử để xem.' }

  // Nếu chưa có warehouse_id → tự pick kho chính của công ty
  let warehouseId: string | null = order.warehouse_id as string | null
  if (!warehouseId) {
    warehouseId = await defaultWarehouseId(order.company_id as string)
    if (!warehouseId) return { ok: false, error: 'Công ty này chưa có kho nào. Vào Danh mục → Kho để tạo kho trước.' }
    // Cập nhật đơn để ghi nhận kho đã chọn
    await supabase.from('supplier_orders').update({ warehouse_id: warehouseId }).eq('id', orderId)
  }

  // Lấy dòng hàng (chỉ những dòng có product_id mới đẩy được)
  const { data: itemsRaw, error: iErr } = await supabase
    .from('supplier_order_items')
    .select('product_id, qty, unit_cost, lot_no, expiry_date')
    .eq('order_id', orderId)
  if (iErr) return { ok: false, error: iErr.message }

  const stockItems = (itemsRaw ?? [])
    .filter((it: any) => !!it.product_id)
    .map((it: any) => ({
      product_id:  it.product_id,
      qty:         it.qty,
      unit_cost:   it.unit_cost,
      lot_no:      it.lot_no      ?? null,
      expiry_date: it.expiry_date ?? null,
    }))

  if (stockItems.length === 0) {
    return { ok: false, error: 'Đơn này không có dòng nào gắn Mã hàng (chỉ có mô tả). Sửa đơn, chọn Mã hàng cho từng dòng rồi đẩy lại.' }
  }

  const { error: rpcErr } = await supabase.rpc('kbit_receive_stock_batch', {
    p_warehouse_id: warehouseId,
    p_items:        stockItems,
    p_txn_date:     order.order_date,
    p_note:         `Đẩy vào kho từ đơn ${orderId}`,
    p_created_by:   null,
  })
  if (rpcErr) return { ok: false, error: 'RPC lỗi: ' + rpcErr.message }

  await supabase.from('supplier_orders').update({ stock_added: true }).eq('id', orderId)

  revalidatePath('/nhap-khau')
  revalidatePath(`/nhap-khau/${orderId}`)
  revalidatePath('/kho')
  revalidatePath('/kho/lich-su')
  return { ok: true, pushed: stockItems.length }
}

/** Ghi thanh toán NCC: cộng dồn amount_paid → DB tự tính lại outstanding. */
export async function recordSupplierPayment(id: string, input: unknown): Promise<void> {
  const { amount } = z.object({ amount: z.coerce.number().positive('Số tiền phải > 0') }).parse(input)
  const supabase = await createClient()

  const { data: cur, error: e0 } = await supabase
    .from('supplier_orders')
    .select('amount_paid')
    .eq('id', id)
    .single()
  if (e0) throw new Error(e0.message)

  const { error } = await supabase
    .from('supplier_orders')
    .update({ amount_paid: Number(cur.amount_paid) + amount })
    .eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath('/nhap-khau')
  revalidatePath(`/nhap-khau/${id}`)
}
