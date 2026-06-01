import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export const listSuppliers = cache(async () => {
  const supabase = await createClient()
  const { data, error } = await supabase.from('suppliers').select('*').order('code')
  if (error) { console.error('[listSuppliers]', error.message); return [] }
  return data ?? []
})
