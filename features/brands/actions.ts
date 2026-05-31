'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { brandSchema } from './schema'

export interface ActionResult { error?: string }

export async function createBrand(input: unknown): Promise<ActionResult> {
  try {
    const data = brandSchema.parse(input)
    const supabase = await createClient()
    const { error } = await supabase.from('brands').insert(data)
    if (error) return { error: error.message }
    revalidatePath('/danh-muc/san-pham')
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Lỗi không xác định' }
  }
}

export async function updateBrand(id: string, input: unknown): Promise<ActionResult> {
  try {
    const data = brandSchema.parse(input)
    const supabase = await createClient()
    const { error } = await supabase.from('brands').update(data).eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/danh-muc/san-pham')
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Lỗi không xác định' }
  }
}
