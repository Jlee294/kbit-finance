import { createClient } from '@/lib/supabase/server'

export async function listCompanies() {
  const supabase = await createClient()
  const { data, error } = await supabase.from('companies').select('*').order('code')
  if (error) throw new Error(error.message)
  return data ?? []
}
