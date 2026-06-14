'use server'

import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getCurrentUser, isAdmin, type UserRole } from '@/lib/auth'

const VALID_ROLES: UserRole[] = ['admin', 'ceo', 'chief_accountant', 'accountant', 'viewer']

/** Guard chung: chỉ admin được quản lý user. */
async function requireAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getCurrentUser()
  if (!me) return { ok: false, error: 'Unauthorized' }
  if (!isAdmin(me.role)) return { ok: false, error: 'Chỉ admin được quản lý người dùng' }
  return { ok: true }
}

/**
 * Gán/bỏ gán công ty cho 1 user (admin only).
 * Set toàn bộ danh sách công ty user được phép — xóa hết rồi insert lại.
 */
export async function setUserCompanies(userId: string, companyIds: string[]): Promise<{ ok: true } | { ok: false; error: string }> {
  const g = await requireAdmin()
  if (!g.ok) return g

  const supabase = await createClient()
  const { error: delErr } = await supabase.from('user_companies').delete().eq('user_id', userId)
  if (delErr) return { ok: false, error: delErr.message }

  if (companyIds.length > 0) {
    const rows = companyIds.map((company_id) => ({ user_id: userId, company_id }))
    const { error: insErr } = await supabase.from('user_companies').insert(rows)
    if (insErr) return { ok: false, error: insErr.message }
  }

  revalidatePath('/danh-muc/phan-quyen-cong-ty')
  return { ok: true }
}

/**
 * KTT: Tạo tài khoản user mới qua UI (admin only).
 * Dùng service-role admin API: tạo Auth user + insert public.users + gán công ty.
 * Email auto-confirm (nội bộ — không cần user xác nhận email).
 */
export async function createUserAccount(input: {
  email:       string
  password:    string
  full_name:   string
  role:        string
  companyIds?: string[]
}): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const g = await requireAdmin()
  if (!g.ok) return g

  const email = input.email.trim().toLowerCase()
  const fullName = input.full_name.trim()
  const role = input.role as UserRole

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'Email không hợp lệ' }
  if (!fullName) return { ok: false, error: 'Tên không được trống' }
  if (!input.password || input.password.length < 6) return { ok: false, error: 'Mật khẩu tối thiểu 6 ký tự' }
  if (!VALID_ROLES.includes(role)) return { ok: false, error: 'Vai trò không hợp lệ' }

  const svc = createServiceClient()

  // 1. Tạo Auth user (auto-confirm — nội bộ)
  const { data: authData, error: authErr } = await svc.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })
  if (authErr) {
    const msg = /already.*registered|exists/i.test(authErr.message)
      ? `Email "${email}" đã tồn tại`
      : authErr.message
    return { ok: false, error: msg }
  }
  const authId = authData.user?.id
  if (!authId) return { ok: false, error: 'Không tạo được tài khoản Auth' }

  // 2. Insert public.users (dùng service client — bỏ qua RLS users_w)
  const { data: userRow, error: insErr } = await svc
    .from('users')
    .insert({ auth_id: authId, email, full_name: fullName, role, is_active: true })
    .select('id')
    .single()
  if (insErr) {
    // Rollback Auth user nếu insert profile lỗi (tránh user mồ côi)
    await svc.auth.admin.deleteUser(authId).catch(() => {})
    return { ok: false, error: 'Lỗi tạo hồ sơ: ' + insErr.message }
  }

  // 3. Gán công ty (nếu có)
  if (input.companyIds && input.companyIds.length > 0) {
    const rows = input.companyIds.map((company_id) => ({ user_id: userRow.id, company_id }))
    await svc.from('user_companies').insert(rows).then(() => {}, () => {})
  }

  revalidatePath('/danh-muc/phan-quyen-cong-ty')
  return { ok: true, userId: userRow.id }
}

/** Đổi vai trò user (admin only). KHÔNG cho tự hạ quyền chính mình để tránh khóa cứng. */
export async function updateUserRole(userId: string, role: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getCurrentUser()
  if (!me) return { ok: false, error: 'Unauthorized' }
  if (!isAdmin(me.role)) return { ok: false, error: 'Chỉ admin được đổi vai trò' }
  if (!VALID_ROLES.includes(role as UserRole)) return { ok: false, error: 'Vai trò không hợp lệ' }
  if (userId === me.id && role !== 'admin') {
    return { ok: false, error: 'Không thể tự hạ quyền admin của chính mình' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('users').update({ role }).eq('id', userId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/danh-muc/phan-quyen-cong-ty')
  return { ok: true }
}

/** Khóa / mở khóa user (admin only). Không tự khóa chính mình. */
export async function setUserActive(userId: string, isActive: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getCurrentUser()
  if (!me) return { ok: false, error: 'Unauthorized' }
  if (!isAdmin(me.role)) return { ok: false, error: 'Chỉ admin được khóa/mở user' }
  if (userId === me.id && !isActive) return { ok: false, error: 'Không thể tự khóa chính mình' }

  const supabase = await createClient()
  const { error } = await supabase.from('users').update({ is_active: isActive }).eq('id', userId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/danh-muc/phan-quyen-cong-ty')
  return { ok: true }
}

/** Đặt lại mật khẩu user (admin only) — dùng service admin API. */
export async function resetUserPassword(userId: string, newPassword: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const g = await requireAdmin()
  if (!g.ok) return g
  if (!newPassword || newPassword.length < 6) return { ok: false, error: 'Mật khẩu tối thiểu 6 ký tự' }

  const svc = createServiceClient()
  // Lấy auth_id từ users
  const { data: u } = await svc.from('users').select('auth_id').eq('id', userId).single()
  if (!u?.auth_id) return { ok: false, error: 'Không tìm thấy tài khoản' }

  const { error } = await svc.auth.admin.updateUserById(u.auth_id, { password: newPassword })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
