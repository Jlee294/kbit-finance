import { unstable_cache } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

async function _listProjects() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('projects')
    .select('*, companies(code, name)')
    .order('code')
  if (error) throw new Error(error.message)
  return data ?? []
}

/**
 * Cache 60s — projects ít thay đổi.
 * Sau khi mutate, actions gọi revalidateTag('projects').
 */
export const listProjects = unstable_cache(
  _listProjects,
  ['projects'],
  { revalidate: 60, tags: ['projects'] },
)
