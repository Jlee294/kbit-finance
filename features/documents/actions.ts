'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { uploadDocumentSchema, type DocEntityType } from './schema'
import { listDocumentsForEntity, type Document } from './queries'

/** Wrapper Server Action để client component fetch docs theo entity. */
export async function listDocumentsAction(
  entityType: DocEntityType,
  entityId: string,
): Promise<Document[]> {
  return listDocumentsForEntity(entityType, entityId)
}

/** Lấy document_type_id mặc định (theo code) — auto-create nếu chưa có. */
export async function getOrCreateDocTypeId(code: string, name: string): Promise<string> {
  const supabase = await createClient()
  const { data: existing } = await supabase
    .from('document_types')
    .select('id')
    .eq('code', code)
    .maybeSingle()
  if (existing) return existing.id
  const { data: created, error } = await supabase
    .from('document_types')
    .insert({ code, name })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return created.id
}

export async function uploadDocument(input: unknown): Promise<string> {
  const data = uploadDocumentSchema.parse(input)
  const supabase = await createClient()

  // Get current user id for uploaded_by
  const { data: { user } } = await supabase.auth.getUser()
  let uploadedById: string | null = null
  if (user) {
    const { data: row } = await supabase
      .from('users')
      .select('id')
      .eq('auth_id', user.id)
      .single()
    uploadedById = row?.id ?? null
  }

  const { data: doc, error } = await supabase
    .from('documents')
    .insert({
      document_type_id: data.document_type_id,
      entity_type: data.entity_type,
      entity_id: data.entity_id,
      file_name: data.file_name,
      file_url: data.file_url ?? null,
      drive_file_id: data.drive_file_id ?? null,
      uploaded_by: uploadedById,
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)

  revalidatePath('/chung-tu')
  return doc.id as string
}

export async function verifyDocument(documentId: string): Promise<void> {
  const supabase = await createClient()

  // Get current user id
  const { data: { user } } = await supabase.auth.getUser()
  let verifiedById: string | null = null
  if (user) {
    const { data: row } = await supabase
      .from('users')
      .select('id')
      .eq('auth_id', user.id)
      .single()
    verifiedById = row?.id ?? null
  }

  const { error } = await supabase
    .from('documents')
    .update({ is_verified: true, verified_by: verifiedById })
    .eq('id', documentId)

  if (error) throw new Error(error.message)

  revalidatePath('/chung-tu')
}

export async function unverifyDocument(documentId: string): Promise<void> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('documents')
    .update({ is_verified: false, verified_by: null })
    .eq('id', documentId)

  if (error) throw new Error(error.message)

  revalidatePath('/chung-tu')
}

export async function deleteDocument(documentId: string): Promise<void> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('documents')
    .delete()
    .eq('id', documentId)

  if (error) throw new Error(error.message)

  revalidatePath('/chung-tu')
}
