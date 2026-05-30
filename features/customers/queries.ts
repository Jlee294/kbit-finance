import { createClient } from '@/lib/supabase/server'

export async function listCustomers() {
  const supabase = await createClient()
  const { data, error } = await supabase.from('customers').select('*').order('code')
  if (error) throw new Error(error.message)
  return data ?? []
}
