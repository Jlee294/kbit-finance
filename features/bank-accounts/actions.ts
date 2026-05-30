'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { bankAccountSchema } from './schema'

export async function createBankAccount(input: unknown) {
  const data = bankAccountSchema.parse(input)
  const supabase = await createClient()
  const { error } = await supabase.from('bank_accounts').insert(data)
  if (error) throw new Error(error.message)
  revalidatePath('/danh-muc/tai-khoan-ngan-hang')
}

export async function updateBankAccount(id: string, input: unknown) {
  const data = bankAccountSchema.parse(input)
  const supabase = await createClient()
  const { error } = await supabase.from('bank_accounts').update(data).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/danh-muc/tai-khoan-ngan-hang')
}
