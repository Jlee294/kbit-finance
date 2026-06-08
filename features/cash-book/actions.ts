'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import { cashBookSchema } from './schema'

export interface ActionResult { error?: string }

export async function createCashEntry(input: unknown): Promise<ActionResult> {
  try {
    const data = cashBookSchema.parse(input)
    const supabase = await createClient()
    const me = await getCurrentUser()
    const { error } = await supabase.from('cash_book').insert({
      ...data,
      status: 'confirmed',          // vào báo cáo dòng tiền + công nợ (0040); cash_book không có luồng duyệt riêng
      created_by: me?.id ?? null,
    })
    if (error) return { error: error.message }
    revalidatePath('/chung-tu-khac')
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Lỗi không xác định' }
  }
}

export async function updateCashEntry(id: string, input: unknown): Promise<ActionResult> {
  try {
    const data = cashBookSchema.parse(input)
    const supabase = await createClient()
    const { error } = await supabase
      .from('cash_book')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/chung-tu-khac')
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Lỗi không xác định' }
  }
}

export async function deleteCashEntry(id: string): Promise<ActionResult> {
  try {
    const supabase = await createClient()
    const { error } = await supabase.from('cash_book').delete().eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/chung-tu-khac')
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Lỗi không xác định' }
  }
}
