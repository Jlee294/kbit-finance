'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { productSchema } from './schema'

export interface ActionResult { error?: string }

/** Mã hàng gọn — chỉ 3 trường, KHÔNG đụng giá vốn/giá niêm yết. */
const quickProductSchema = z.object({
  code: z.string().min(1, 'Bắt buộc'),
  name: z.string().min(1, 'Bắt buộc'),
  unit: z.string().min(1, 'Bắt buộc'),
})

export interface QuickProductOption { id: string; code: string; name: string; unit: string }

export async function suggestProductCode(brandCode: string, mfrCode: string): Promise<string> {
  const prefix = `${brandCode}-${mfrCode}-`
  const supabase = await createClient()
  const { data } = await supabase
    .from('products')
    .select('code')
    .ilike('code', `${prefix}%`)
    .order('code', { ascending: false })
    .limit(1)
  let seq = 1
  if (data?.length) {
    const last = data[0].code.slice(prefix.length)
    const n = parseInt(last, 10)
    if (!isNaN(n)) seq = n + 1
  }
  return `${prefix}${String(seq).padStart(3, '0')}`
}

export async function createProduct(input: unknown): Promise<ActionResult> {
  try {
    const { formula_id, ...data } = productSchema.parse(input)
    const supabase = await createClient()
    const { data: row, error } = await supabase
      .from('products')
      .insert(data)
      .select('id')
      .single()
    if (error) return { error: error.message }
    if (formula_id && row) {
      await supabase
        .from('formula_products')
        .insert({ formula_id, product_id: row.id })
    }
    revalidatePath('/danh-muc/san-pham')
    revalidatePath('/danh-muc/nha-may')
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Lỗi không xác định' }
  }
}

export async function updateProduct(id: string, input: unknown): Promise<ActionResult> {
  try {
    const data = productSchema.parse(input)
    const supabase = await createClient()
    const { error } = await supabase.from('products').update(data).eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/danh-muc/san-pham')
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Lỗi không xác định' }
  }
}

/**
 * Tạo mã hàng nhanh (chỉ mã/tên/ĐVT) — dùng cho danh mục Mã hàng và khi
 * thêm mã ngay lúc nhập hóa đơn. Trả về mã hàng vừa tạo để form chọn ngay.
 */
export async function quickCreateProduct(
  input: unknown,
): Promise<{ error?: string; product?: QuickProductOption }> {
  try {
    const data = quickProductSchema.parse(input)
    const supabase = await createClient()
    const { data: row, error } = await supabase
      .from('products')
      .insert(data)
      .select('id, code, name, unit')
      .single()
    if (error) return { error: error.message }
    revalidatePath('/danh-muc/ma-hang')
    revalidatePath('/danh-muc/san-pham')
    return { product: row as QuickProductOption }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Lỗi không xác định' }
  }
}

/** Sửa mã hàng gọn — CHỈ cập nhật mã/tên/ĐVT, không động đến giá vốn. */
export async function quickUpdateProduct(id: string, input: unknown): Promise<ActionResult> {
  try {
    const data = quickProductSchema.parse(input)
    const supabase = await createClient()
    const { error } = await supabase.from('products').update(data).eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/danh-muc/ma-hang')
    revalidatePath('/danh-muc/san-pham')
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Lỗi không xác định' }
  }
}
