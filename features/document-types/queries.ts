import { createClient } from '@/lib/supabase/server'

export interface DocumentType {
  id: string
  code: string
  name: string
}

export async function listDocumentTypes(): Promise<DocumentType[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('document_types')
    .select('id, code, name')
    .order('code')
  if (error) throw new Error(error.message)
  return (data ?? []) as DocumentType[]
}
