'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { canApprove, canEdit, getCurrentUser } from '@/lib/auth'
import { cashBookSchema, cashOpeningSchema } from './schema'

export interface ActionResult { error?: string }

async function requireCashEditor() {
  const me = await getCurrentUser()
  if (!me || !canEdit(me.role)) throw new Error('Không có quyền sửa sổ tiền mặt')
  return me
}

async function requireCashApprover() {
  const me = await getCurrentUser()
  if (!me || !canApprove(me.role)) throw new Error('Cần quyền kế toán trưởng hoặc admin')
  return me
}

export async function createCashEntry(input: unknown): Promise<ActionResult> {
  try {
    const data = cashBookSchema.parse(input)
    const supabase = await createClient()
    const me = await requireCashEditor()
    const { error } = await supabase.from('cash_book').insert({
      ...data,
      status: 'confirmed',          // vào báo cáo dòng tiền + công nợ (0040); cash_book không có luồng duyệt riêng
      created_by: me?.id ?? null,
    })
    if (error) return { error: error.message }
    revalidatePath('/chung-tu-khac')
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Lỗi không xác định' }
  }
}

export async function updateCashEntry(id: string, input: unknown): Promise<ActionResult> {
  try {
    const data = cashBookSchema.parse(input)
    await requireCashEditor()
    const supabase = await createClient()
    const { error } = await supabase
      .from('cash_book')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/chung-tu-khac')
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Lỗi không xác định' }
  }
}

export async function deleteCashEntry(id: string): Promise<ActionResult> {
  try {
    await requireCashApprover()
    const supabase = await createClient()
    const { error } = await supabase.from('cash_book').delete().eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/chung-tu-khac')
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Lỗi không xác định' }
  }
}

export async function upsertCashOpening(input: unknown): Promise<ActionResult> {
  try {
    const data = cashOpeningSchema.parse(input)
    const me = await requireCashEditor()
    const supabase = await createClient()
    const { error } = await supabase
      .from('cash_opening_balances')
      .upsert({
        ...data,
        note: data.note ?? null,
        created_by: me.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'company_id,year' })
    if (error) return { error: error.message }
    revalidatePath('/chung-tu-khac')
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Lỗi không xác định' }
  }
}
