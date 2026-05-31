import { unstable_cache } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'

export interface DocumentType {
  id: string
  code: string
  name: string
}

async function _listDocumentTypes(): Promise<DocumentType[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('document_types')
    .select('id, code, name')
    .order('code')
  if (error) {
    console.error('[listDocumentTypes]', error.message)
    return []
  }
  return (data ?? []) as DocumentType[]
}

/**
 * Cache 5 phút — loại chứng từ rất ít thay đổi.
 * Sau khi mutate, actions gọi revalidateTag('document-types').
 */
export const listDocumentTypes = unstable_cache(
  _listDocumentTypes,
  ['document-types'],
  { revalidate: 300, tags: ['document-types'] },
)
