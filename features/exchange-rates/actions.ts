'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { exchangeRateSchema } from './schema'

export async function createExchangeRate(input: unknown) {
  const data = exchangeRateSchema.parse(input)
  const supabase = await createClient()
  const { error } = await supabase.from('exchange_rates').insert(data)
  if (error) throw new Error(error.message)
  revalidatePath('/danh-muc/ty-gia')
}

export async function updateExchangeRate(id: string, input: unknown) {
  const data = exchangeRateSchema.parse(input)
  const supabase = await createClient()
  const { error } = await supabase.from('exchange_rates').update(data).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/danh-muc/ty-gia')
}
