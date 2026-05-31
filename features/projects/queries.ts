import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

/**
 * React cache() — dedup per request. Auth client, không cần service key.
 */
export const listProjects = cache(async () => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('projects')
    .select('*, companies(code, name)')
    .order('code')
  if (error) {
    console.error('[listProjects]', error.message)
    return []
  }
  return data ?? []
})
