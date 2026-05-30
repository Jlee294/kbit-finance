'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { productSchema } from './schema'

export async function createProduct(input: unknown) {
  const data = productSchema.parse(input)
  const supabase = await createClient()
  const { error } = await supabase.from('products').insert(data)
  if (error) throw new Error(error.message)
  revalidatePath('/danh-muc/san-pham')
}

export async function updateProduct(id: string, input: unknown) {
  const data = productSchema.parse(input)
  const supabase = await createClient()
  const { error } = await supabase.from('products').update(data).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/danh-muc/san-pham')
}
