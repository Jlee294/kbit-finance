import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { isDemoMode } from '@/lib/demo'
import { GLA_DATA } from '@/lib/gla-data'

export const listSuppliers = cache(async () => {
  if (isDemoMode()) {
    return GLA_DATA.suppliers.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      tax_code: row.taxCode,
      is_active: row.isActive,
    }))
  }

  const supabase = await createClient()
  const { data, error } = await supabase.from('suppliers').select('*').order('code')
  if (error) { console.error('[listSuppliers]', error.message); return [] }
  return data ?? []
})
