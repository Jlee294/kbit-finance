'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { documentTypeSchema } from './schema'

export async function createDocumentType(input: unknown): Promise<string> {
  const data = documentTypeSchema.parse(input)
  const supabase = await createClient()

  const { data: row, error } = await supabase
    .from('document_types')
    .insert({ code: data.code, name: data.name })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') throw new Error(`Mã "${data.code}" đã tồn tại`)
    throw new Error(error.message)
  }

  revalidatePath('/danh-muc/loai-chung-tu')
  revalidateTag('document-types', {})
  return row.id as string
}

export async function updateDocumentType(id: string, input: unknown): Promise<void> {
  const data = documentTypeSchema.parse(input)
  const supabase = await createClient()

  const { error } = await supabase
    .from('document_types')
    .update({ code: data.code, name: data.name })
    .eq('id', id)

  if (error) {
    if (error.code === '23505') throw new Error(`Mã "${data.code}" đã tồn tại`)
    throw new Error(error.message)
  }

  revalidatePath('/danh-muc/loai-chung-tu')
  revalidateTag('document-types', {})
}
