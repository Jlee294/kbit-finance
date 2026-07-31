import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { DEMO_COMPANIES, isDemoMode } from '@/lib/demo'

/**
 * React cache() — dedup per request (layout + page dùng chung 1 lần DB).
 * Dùng auth client để RLS hoạt động đúng. Không cần SUPABASE_SERVICE_ROLE_KEY.
 */
export const listCompanies = cache(async () => {
  if (isDemoMode()) return DEMO_COMPANIES

  const supabase = await createClient()
  const { data, error } = await supabase.from('companies').select('*').order('code')
  if (error) {
    console.error('[listCompanies]', error.message)
    return []
  }
  return data ?? []
})
