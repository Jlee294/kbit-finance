'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { supplierSchema } from './schema'

export async function createSupplier(input: unknown) {
  const data = supplierSchema.parse(input)
  const supabase = await createClient()
  const { error } = await supabase.from('suppliers').insert(data)
  if (error) throw new Error(error.message)
  revalidatePath('/danh-muc/nha-cung-cap')
}

export async function updateSupplier(id: string, input: unknown) {
  const data = supplierSchema.parse(input)
  const supabase = await createClient()
  const { error } = await supabase.from('suppliers').update(data).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/danh-muc/nha-cung-cap')
}
