'use server'

import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, canEdit } from '@/lib/auth'
import { isDemoMode } from '@/lib/demo'
import { GLA_DATA } from '@/lib/gla-data'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { bankOpeningSchema, demoBankOpeningSchema } from './schema'
import { toDemoOpeningCookieName } from './demo-opening'

export interface BankOpeningActionResult {
  ok: boolean
  error?: string
}

export async function upsertBankOpening(input: unknown): Promise<BankOpeningActionResult> {
  try {
    if (isDemoMode()) {
      const data = demoBankOpeningSchema.parse(input)
      if (data.company_id !== GLA_DATA.company.id
          || data.bank_account_id !== GLA_DATA.bankAccount.id) {
        return { ok: false, error: 'Tài khoản ngân hàng không thuộc công ty GLA local.' }
      }
      const cookieStore = await cookies()
      cookieStore.set(
        toDemoOpeningCookieName(data.bank_account_id, data.year),
        String(data.amount),
        {
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
          maxAge: 60 * 60 * 24 * 365,
        },
      )
      revalidatePath('/ngan-hang')
      return { ok: true }
    }
    const me = await getCurrentUser()
    if (!me || !canEdit(me.role)) {
      return { ok: false, error: 'Không có quyền khai số dư đầu kỳ ngân hàng.' }
    }
    const data = bankOpeningSchema.parse(input)
    const supabase = await createClient()

    // Không tin company_id từ trình duyệt: xác nhận tài khoản thực sự thuộc công ty
    // và người dùng nhìn thấy tài khoản đó qua RLS.
    const { data: bankAccount, error: accountError } = await supabase
      .from('bank_accounts')
      .select('id, company_id')
      .eq('id', data.bank_account_id)
      .eq('company_id', data.company_id)
      .single()
    if (accountError || !bankAccount) {
      return { ok: false, error: 'Tài khoản ngân hàng không thuộc công ty đã chọn.' }
    }

    const { error } = await supabase
      .from('bank_opening_balances')
      .upsert({
        company_id: bankAccount.company_id,
        bank_account_id: bankAccount.id,
        year: data.year,
        amount: data.amount,
        note: data.note || null,
        created_by: me.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'bank_account_id,year' })
    if (error) {
      console.error('[upsertBankOpening]', error.message)
      return { ok: false, error: 'Không lưu được số dư đầu kỳ ngân hàng.' }
    }

    revalidatePath('/ngan-hang')
    return { ok: true }
  } catch {
    return { ok: false, error: 'Dữ liệu số dư đầu kỳ ngân hàng không hợp lệ.' }
  }
}

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
