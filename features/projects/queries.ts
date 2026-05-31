import { unstable_cache } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'

async function _listProjects() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('projects')
    .select('*, companies(code, name)')
    .order('code')
  if (error) {
    console.error('[listProjects]', error.message)
    return []
  }
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
