import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export const listBankAccounts = cache(async () => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('bank_accounts')
    .select('*, companies(code, name)')
    .order('name')
  if (error) { console.error('[listBankAccounts]', error.message); return [] }
  return data ?? []
})
