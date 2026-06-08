'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { taxTypeSchema } from './schema'

function revalidate() {
  revalidatePath('/danh-muc/loai-thue')
  revalidatePath('/lich-thue')
  revalidatePath('/ke-hoach-thue')
}

export async function createTaxType(input: unknown): Promise<string> {
  const data = taxTypeSchema.parse(input)
  const supabase = await createClient()
  const { data: row, error } = await supabase
    .from('tax_types')
    .insert({ code: data.code, name: data.name, sort_order: data.sort_order, is_active: data.is_active })
    .select('id')
    .single()
  if (error) {
    if (error.code === '23505') throw new Error(`Mã loại thuế "${data.code}" đã tồn tại`)
    throw new Error(error.message)
  }
  revalidate()
  return row.id as string
}

export async function updateTaxType(id: string, input: unknown): Promise<void> {
  const data = taxTypeSchema.parse(input)
  const supabase = await createClient()
  const { error } = await supabase
    .from('tax_types')
    .update({ code: data.code, name: data.name, sort_order: data.sort_order, is_active: data.is_active })
    .eq('id', id)
  if (error) {
    if (error.code === '23505') throw new Error(`Mã loại thuế "${data.code}" đã tồn tại`)
    throw new Error(error.message)
  }
  revalidate()
}
