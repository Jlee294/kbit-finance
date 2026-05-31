'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { supplierImportSchema } from './schema'
import { allocateUnitCost } from './cost'

/** Tạo đơn nhập khẩu mới. Trả về id đơn vừa tạo. */
export async function createImportOrder(input: unknown): Promise<string> {
  const data = supplierImportSchema.parse(input)
  const supabase = await createClient()

  // (1) Chèn header. KHÔNG gửi cost_total / outstanding (GENERATED ALWAYS).
  //     order_type cố định 'import'. C4/D4: ghi exchange_rate khi KRW.
  const { items, ...header } = data
  const { data: order, error: e1 } = await supabase
    .from('supplier_orders')
    .insert({ ...header, order_type: 'import' })
    .select('id')
    .single()
  if (e1) throw new Error(e1.message)

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

  // (3) Chèn dòng hàng kèm unit_cost. KHÔNG gửi line_total (generated).
  const rows = items.map((it, i) => ({
    order_id:    order.id,
    product_id:  it.product_id  ?? null,
    description: it.description ?? null,
    qty:         it.qty,
    unit_price:  it.unit_price,
    unit_cost:   unitCosts[i],
  }))
  const { error: e2 } = await supabase.from('supplier_order_items').insert(rows)
  if (e2) throw new Error(e2.message)

  revalidatePath('/nhap-khau')
  return order.id
}

/** Sửa đơn nhập khẩu: cập nhật header + thay toàn bộ dòng (xóa rồi chèn lại + phân bổ lại). */
export async function updateImportOrder(id: string, input: unknown): Promise<void> {
  const data = supplierImportSchema.parse(input)
  const supabase = await createClient()
  const { items, ...header } = data

  const { error: e1 } = await supabase
    .from('supplier_orders')
    .update({ ...header, order_type: 'import' })
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
  }))
  const { error: e2 } = await supabase.from('supplier_order_items').insert(rows)
  if (e2) throw new Error(e2.message)

  revalidatePath('/nhap-khau')
  revalidatePath(`/nhap-khau/${id}`)
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
