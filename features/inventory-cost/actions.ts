'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { openingStockSchema, closePeriodSchema } from './schema'

/** Khai số dư đầu kỳ kho (SL + đơn giá vốn) cho 1 mã ở 1 tháng mốc. */
export async function setOpeningStock(input: unknown): Promise<{ error?: string }> {
  const data = openingStockSchema.parse(input)
  const supabase = await createClient()
  const { error } = await supabase.rpc('kbit_set_opening_stock', {
    p_product_id:   data.product_id,
    p_warehouse_id: data.warehouse_id,
    p_period:       data.period,
    p_qty:          data.qty,
    p_unit_cost:    data.unit_cost,
  })
  if (error) return { error: error.message }
  // KTT fix: opening phải nhảy ngay lên các view liên quan
  revalidatePath('/kho/so-du-dau-ky')
  revalidatePath('/kho')               // bảng tồn kho chính
  revalidatePath('/kho/lich-su')       // sổ kho hiện 'opening'
  revalidatePath('/kho/gia-von')       // giá vốn moving avg
  return {}
}

/** Chốt giá vốn 1 kỳ (tháng): tính BQ + gán giá vốn xuất + dòng đơn bán + gối đầu. */
export async function closePeriod(input: unknown): Promise<{ error?: string }> {
  const { period, company_id } = closePeriodSchema.parse(input)
  const supabase = await createClient()
  const { error } = await supabase.rpc('kbit_close_inventory_cost', { p_period: period, p_company_id: company_id })
  if (error) return { error: error.message }
  revalidatePath('/kho')
  revalidatePath('/bao-cao/lai-gop')
  return {}
}
