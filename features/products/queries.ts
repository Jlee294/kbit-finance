import { createClient } from '@/lib/supabase/server'

export async function listProducts() {
  const supabase = await createClient()
  const { data, error } = await supabase.from('products').select('*').order('code')
  if (error) throw new Error(error.message)
  return data ?? []
}
