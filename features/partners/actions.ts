'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, canEdit } from '@/lib/auth'

/**
 * KTT (B3): Đối tác (KH/NCC) phải tự đồng bộ từ form nhập — không bắt người dùng
 * vào danh mục tạo trước. Server Action này dùng chung cho các form đơn bán / mua /
 * thu / chi để tạo nhanh đối tác ngay khi nhập, không cần mở danh mục.
 *
 * Auto-gen code nếu user không nhập (KH-YYYYMMDD-XXXX / NCC-...). Tax code chỉ để
 * link XML import sau này.
 */

const quickCustomerSchema = z.object({
  name:     z.string().min(1).max(200).trim(),
  tax_code: z.string().optional().nullable(),
  phone:    z.string().optional().nullable(),
  note:     z.string().optional().nullable(),
})

const quickSupplierSchema = quickCustomerSchema.extend({
  country: z.enum(['VN', 'KR']).default('VN'),
})

function genCode(prefix: 'KH' | 'NCC'): string {
  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const rand = Math.floor(Math.random() * 9000 + 1000)
  return `${prefix}-${ymd}-${rand}`
}

export async function quickCreateCustomer(input: unknown): Promise<
  { ok: true; id: string; code: string; name: string } | { ok: false; error: string }
> {
  const me = await getCurrentUser()
  if (!me) return { ok: false, error: 'Unauthorized' }
  if (!canEdit(me.role)) return { ok: false, error: 'Không có quyền tạo khách hàng' }

  let data: z.infer<typeof quickCustomerSchema>
  try { data = quickCustomerSchema.parse(input) }
  catch (e: any) { return { ok: false, error: e.errors?.[0]?.message ?? 'Dữ liệu không hợp lệ' } }

  const supabase = await createClient()

  // Tránh trùng theo MST nếu có → trả về dòng đã tồn tại
  if (data.tax_code) {
    const { data: existed } = await supabase
      .from('customers').select('id, code, name')
      .eq('tax_code', data.tax_code).maybeSingle()
    if (existed) return { ok: true, id: existed.id, code: existed.code, name: existed.name }
  }

  const code = genCode('KH')
  const { data: newRow, error } = await supabase
    .from('customers')
    .insert({ ...data, code, is_active: true })
    .select('id, code, name')
    .single()
  if (error) return { ok: false, error: error.message }

  revalidatePath('/danh-muc/khach-hang')
  revalidatePath('/danh-muc/doi-tac')
  return { ok: true, id: newRow.id, code: newRow.code, name: newRow.name }
}

export async function quickCreateSupplier(input: unknown): Promise<
  { ok: true; id: string; code: string; name: string } | { ok: false; error: string }
> {
  const me = await getCurrentUser()
  if (!me) return { ok: false, error: 'Unauthorized' }
  if (!canEdit(me.role)) return { ok: false, error: 'Không có quyền tạo NCC' }

  let data: z.infer<typeof quickSupplierSchema>
  try { data = quickSupplierSchema.parse(input) }
  catch (e: any) { return { ok: false, error: e.errors?.[0]?.message ?? 'Dữ liệu không hợp lệ' } }

  const supabase = await createClient()

  if (data.tax_code) {
    const { data: existed } = await supabase
      .from('suppliers').select('id, code, name')
      .eq('tax_code', data.tax_code).maybeSingle()
    if (existed) return { ok: true, id: existed.id, code: existed.code, name: existed.name }
  }

  const code = genCode('NCC')
  const { data: newRow, error } = await supabase
    .from('suppliers')
    .insert({ ...data, code, is_active: true })
    .select('id, code, name')
    .single()
  if (error) return { ok: false, error: error.message }

  revalidatePath('/danh-muc/nha-cung-cap')
  revalidatePath('/danh-muc/doi-tac')
  return { ok: true, id: newRow.id, code: newRow.code, name: newRow.name }
}
