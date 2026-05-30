import { createClient } from '@/lib/supabase/server'

export async function listBankAccounts() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('bank_accounts')
    .select('*, companies(code, name)')
    .order('name')
  if (error) throw new Error(error.message)
  return data ?? []
}
