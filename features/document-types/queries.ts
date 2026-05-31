import { unstable_cache } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export interface DocumentType {
  id: string
  code: string
  name: string
}

async function _listDocumentTypes(): Promise<DocumentType[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('document_types')
    .select('id, code, name')
    .order('code')
  if (error) throw new Error(error.message)
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
