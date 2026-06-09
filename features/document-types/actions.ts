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

/**
 * KTT E4: Tạo nhanh loại chứng từ ngay trong form Nghiệp vụ (Thư viện NV).
 * Tránh phải nhảy sang menu Danh mục → tạo → quay lại.
 * Auto-gen code từ name nếu user không nhập code.
 */
export async function quickCreateDocType(input: {
  code?: string
  name: string
}): Promise<{ ok: true; id: string; code: string; name: string } | { ok: false; error: string }> {
  const name = input.name.trim()
  if (!name) return { ok: false, error: 'Tên không được trống' }

  // Auto-gen code nếu user không nhập: viết hoa + bỏ dấu + thay khoảng trắng
  let code = (input.code ?? '').trim().toUpperCase()
  if (!code) {
    code = name
      .normalize('NFD').replace(/[̀-ͯ]/g, '')   // bỏ dấu tiếng Việt
      .replace(/đ/gi, 'd')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 30)
  }
  if (!code) code = `DT_${Date.now().toString(36).toUpperCase()}`

  const supabase = await createClient()
  // Tránh trùng → nếu code đã tồn tại, trả về dòng đó
  const { data: existing } = await supabase
    .from('document_types')
    .select('id, code, name')
    .eq('code', code)
    .maybeSingle()
  if (existing) return { ok: true, id: existing.id, code: existing.code, name: existing.name }

  const { data: row, error } = await supabase
    .from('document_types')
    .insert({ code, name })
    .select('id, code, name')
    .single()
  if (error) return { ok: false, error: error.message }

  revalidatePath('/danh-muc/loai-chung-tu')
  revalidateTag('document-types', {})
  return { ok: true, id: row.id, code: row.code, name: row.name }
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
