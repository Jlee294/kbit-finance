'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, isAdmin } from '@/lib/auth'

/**
 * Gán/bỏ gán công ty cho 1 user (admin only).
 * Set toàn bộ danh sách công ty user được phép — đơn giản hóa: xóa hết rồi insert lại.
 */
export async function setUserCompanies(userId: string, companyIds: string[]): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getCurrentUser()
  if (!me) return { ok: false, error: 'Unauthorized' }
  if (!isAdmin(me.role)) return { ok: false, error: 'Chỉ admin được phân quyền công ty' }

  const supabase = await createClient()

  // Xóa hết gán cũ
  const { error: delErr } = await supabase.from('user_companies').delete().eq('user_id', userId)
  if (delErr) return { ok: false, error: delErr.message }

  // Insert danh sách mới (nếu có)
  if (companyIds.length > 0) {
    const rows = companyIds.map((company_id) => ({ user_id: userId, company_id }))
    const { error: insErr } = await supabase.from('user_companies').insert(rows)
    if (insErr) return { ok: false, error: insErr.message }
  }

  revalidatePath('/danh-muc/phan-quyen-cong-ty')
  return { ok: true }
}
