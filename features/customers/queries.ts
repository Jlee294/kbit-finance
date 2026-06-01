import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export const listCustomers = cache(async () => {
  const supabase = await createClient()
  const { data, error } = await supabase.from('customers').select('*').order('code')
  if (error) { console.error('[listCustomers]', error.message); return [] }
  return data ?? []
})
