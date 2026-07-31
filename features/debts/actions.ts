'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getGlobalFilter } from '@/lib/global-filter'
import { canApprove, canEdit, getCurrentUser } from '@/lib/auth'
import { debtOpeningSchema } from './schema'

export async function setDebtOpening(input: unknown): Promise<{ error?: string }> {
  const currentUser = await getCurrentUser()
  if (!currentUser || !canEdit(currentUser.role)) {
    return { error: 'Không có quyền khai báo số dư công nợ đầu kỳ' }
  }
  const parsed = debtOpeningSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' }
  const data = parsed.data

  const { companyId } = await getGlobalFilter()
  if (!companyId) return { error: 'Chưa chọn công ty' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('debt_opening_balances')
    .upsert({
      company_id:    companyId,
      partner_type:  data.partner_type,
      partner_id:    data.partner_id,
      year:          data.year,
      debit_amount:  data.debit_amount,
      credit_amount: data.credit_amount,
      note:          data.note || null,
      updated_at:    new Date().toISOString(),
    }, { onConflict: 'company_id,partner_type,partner_id,year' })

  if (error) return { error: error.message }
  revalidatePath('/cong-no')
  revalidatePath('/cong-no/so-du-dau-ky')
  return {}
}

export async function deleteDebtOpening(id: string): Promise<{ error?: string }> {
  const currentUser = await getCurrentUser()
  if (!currentUser || !canApprove(currentUser.role)) {
    return { error: 'Chỉ Admin, CEO hoặc Kế toán trưởng được xóa số dư đầu kỳ' }
  }
  const supabase = await createClient()
  const { error } = await supabase
    .from('debt_opening_balances')
    .delete()
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/cong-no')
  revalidatePath('/cong-no/so-du-dau-ky')
  return {}
}
