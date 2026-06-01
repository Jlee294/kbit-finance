import { createClient } from '@/lib/supabase/server'
import type { DocEntityType } from './schema'

export interface Document {
  id: string
  document_type_id: string
  entity_type: DocEntityType
  entity_id: string
  file_name: string
  /** @deprecated — chỉ giữ tương thích ngược. UI mới dùng /api/files/[id]. */
  file_url: string | null
  drive_file_id: string | null
  is_verified: boolean
  verified_by: string | null
  uploaded_by: string | null
  created_at: string
  document_types: { code: string; name: string } | null
}

export async function listDocumentsForEntity(
  entityType: DocEntityType,
  entityId: string,
): Promise<Document[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('documents')
    .select('*, document_types(code, name)')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at')
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as Document[]
}

export async function listAllDocuments(opts?: { limit?: number; offset?: number }): Promise<Document[]> {
  const supabase = await createClient()
  const query = supabase
    .from('documents')
    .select('*, document_types(code, name)')
    .order('created_at', { ascending: false })
  if (opts?.limit) query.limit(opts.limit)
  if (opts?.offset) query.range(opts.offset, opts.offset + (opts.limit ?? 50) - 1)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as Document[]
}
