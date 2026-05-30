'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { customerSchema } from './schema'

export async function createCustomer(input: unknown) {
  const data = customerSchema.parse(input)
  const supabase = await createClient()
  const { error } = await supabase.from('customers').insert(data)
  if (error) throw new Error(error.message)
  revalidatePath('/danh-muc/khach-hang')
}

export async function updateCustomer(id: string, input: unknown) {
  const data = customerSchema.parse(input)
  const supabase = await createClient()
  const { error } = await supabase.from('customers').update(data).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/danh-muc/khach-hang')
}
