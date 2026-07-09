'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { manufacturerSchema, manufacturerPriceSchema } from './schema'

interface ActionResult { error?: string }

export async function createManufacturer(input: unknown): Promise<ActionResult> {
  const data = manufacturerSchema.parse(input)
  const supabase = await createClient()
  const { error } = await supabase.from('manufacturers').insert(data)
  if (error) return { error: error.message }
  revalidatePath('/danh-muc/nha-may')
  return {}
}

export async function updateManufacturer(id: string, input: unknown): Promise<ActionResult> {
  const data = manufacturerSchema.parse(input)
  const supabase = await createClient()
  const { error } = await supabase.from('manufacturers').update(data).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/danh-muc/nha-may')
  return {}
}

export async function createManufacturerPrice(input: unknown): Promise<ActionResult> {
  const data = manufacturerPriceSchema.parse(input)
  const supabase = await createClient()
  const { error } = await supabase.from('manufacturer_prices').insert(data)
  if (error) return { error: error.message }
  await syncPriceToProduct(supabase, data.manufacturer_id, data.product_id)
  revalidatePath('/danh-muc/nha-may')
  revalidatePath('/danh-muc/san-pham')
  revalidatePath('/danh-muc/ma-hang')
  return {}
}

export async function updateManufacturerPrice(id: string, input: unknown): Promise<ActionResult> {
  const data = manufacturerPriceSchema.parse(input)
  const supabase = await createClient()
  const { error } = await supabase.from('manufacturer_prices').update(data).eq('id', id)
  if (error) return { error: error.message }
  await syncPriceToProduct(supabase, data.manufacturer_id, data.product_id)
  revalidatePath('/danh-muc/nha-may')
  revalidatePath('/danh-muc/san-pham')
  revalidatePath('/danh-muc/ma-hang')
  return {}
}

export async function deleteManufacturerPrice(id: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: row } = await supabase
    .from('manufacturer_prices')
    .select('manufacturer_id, product_id')
    .eq('id', id)
    .single()
  const { error } = await supabase.from('manufacturer_prices').delete().eq('id', id)
  if (error) return { error: error.message }
  if (row) await syncPriceToProduct(supabase, row.manufacturer_id, row.product_id)
  revalidatePath('/danh-muc/nha-may')
  revalidatePath('/danh-muc/san-pham')
  revalidatePath('/danh-muc/ma-hang')
  return {}
}

/**
 * Đồng bộ giá nhà máy MỚI NHẤT → giá chất (cost_material) trên products.
 * Lấy dòng có effective_date gần nhất cho cặp (manufacturer, product).
 * Đồng thời gán manufacturer_id nếu sản phẩm chưa có.
 */
async function syncPriceToProduct(
  supabase: Awaited<ReturnType<typeof createClient>>,
  manufacturerId: string,
  productId: string,
) {
  const { data: latest } = await supabase
    .from('manufacturer_prices')
    .select('unit_price, currency')
    .eq('manufacturer_id', manufacturerId)
    .eq('product_id', productId)
    .order('effective_date', { ascending: false })
    .limit(1)
    .single()

  if (latest) {
    await supabase.from('products').update({
      cost_material: latest.unit_price,
      cost_material_curr: latest.currency,
      manufacturer_id: manufacturerId,
    }).eq('id', productId)
  }
}
