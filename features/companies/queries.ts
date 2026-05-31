import { unstable_cache } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'

async function _listCompanies() {
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('companies').select('*').order('code')
  if (error) {
    // Gracefully degrade — sẽ hiện [] thay vì crash trang
    // Nguyên nhân thường gặp: SUPABASE_SERVICE_ROLE_KEY chưa set trên Vercel
    console.error('[listCompanies]', error.message)
    return []
  }
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
