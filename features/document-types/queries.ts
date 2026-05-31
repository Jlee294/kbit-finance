import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export interface DocumentType {
  id: string
  code: string
  name: string
}

/**
 * React cache() — dedup per request. Auth client, không cần service key.
 */
export const listDocumentTypes = cache(async (): Promise<DocumentType[]> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('document_types')
    .select('id, code, name')
    .order('code')
  if (error) {
    console.error('[listDocumentTypes]', error.message)
    return []
  }
  return (data ?? []) as DocumentType[]
})
