import { unstable_cache } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

async function _listCompanies() {
  const supabase = await createClient()
  const { data, error } = await supabase.from('companies').select('*').order('code')
  if (error) throw new Error(error.message)
  return data ?? []
}

/**
 * Cache 30s — companies hiếm khi thêm/sửa.
 * Sau khi mutate, actions gọi revalidateTag('companies').
 */
export const listCompanies = unstable_cache(
  _listCompanies,
  ['companies'],
  { revalidate: 30, tags: ['companies'] },
)
