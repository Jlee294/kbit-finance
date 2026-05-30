import { createClient } from '@/lib/supabase/server'

export async function listSuppliers() {
  const supabase = await createClient()
  const { data, error } = await supabase.from('suppliers').select('*').order('code')
  if (error) throw new Error(error.message)
  return data ?? []
}
