'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { uploadDocumentSchema } from './schema'

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
