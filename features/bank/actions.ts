'use server'

import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, canEdit } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

/**
 * Sửa nghiệp vụ ngân hàng (chỉ partner + note):
 * - Phục vụ yêu cầu KTT: sửa các nghiệp vụ chưa gắn công nợ hoặc gắn sai.
 * - Không động đến số tiền/ngày/tài khoản để tránh phá khớp số dư.
 *
 * direction = 'thu' → income_transactions (customer_id)
 * direction = 'chi' → expense_transactions (supplier_id)
 */
export async function updateBankRowPartner(input: {
  id: string
  direction: 'thu' | 'chi'
  partnerId: string | null   // null = bỏ gắn (treo lại làm cọc/chưa gắn)
  note: string | null
}) {
  const me = await getCurrentUser()
  if (!me) return { ok: false as const, error: 'Unauthorized' }
  if (!canEdit(me.role)) return { ok: false as const, error: 'Không có quyền sửa' }

  const supabase = await createClient()
  const { id, direction, partnerId, note } = input

  if (direction === 'thu') {
    const { error } = await supabase
      .from('income_transactions')
      .update({
        customer_id:    partnerId,
        note:           note ?? null,
        is_unassigned:  partnerId === null,
      })
      .eq('id', id)
    if (error) return { ok: false as const, error: error.message }
  } else {
    const { error } = await supabase
      .from('expense_transactions')
      .update({
        supplier_id: partnerId,
        note:        note ?? null,
      })
      .eq('id', id)
    if (error) return { ok: false as const, error: error.message }
  }

  revalidatePath('/ngan-hang')
  revalidatePath('/cong-no')
  return { ok: true as const }
}
