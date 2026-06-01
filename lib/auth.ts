import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export type UserRole = 'admin' | 'ceo' | 'chief_accountant' | 'accountant' | 'viewer'

export interface CurrentUser {
  id: string
  full_name: string
  role: UserRole
}

/**
 * React cache() — dedup per request.
 * Layout + page cùng gọi getCurrentUser() chỉ tốn 1 lần DB round-trip.
 *
 * Tối ưu: dùng getClaims() (decode JWT cục bộ, không hit Supabase Auth)
 * thay vì getUser() (gọi network). Tiết kiệm 100-300ms mỗi request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient()

  // getClaims() — local JWT decode, no network
  const { data: claimsData } = await supabase.auth.getClaims()
  const authId = claimsData?.claims?.sub
  if (!authId) return null

  const { data } = await supabase
    .from('users')
    .select('id, full_name, role')
    .eq('auth_id', authId)
    .single()
  return data as CurrentUser | null
})

export function canEdit(role: UserRole) {
  return ['admin', 'chief_accountant', 'accountant'].includes(role)
}

export function canApprove(role: UserRole) {
  return ['admin', 'chief_accountant'].includes(role)
}

export function isAdmin(role: UserRole) {
  return role === 'admin'
}

/** Xem giá vốn + danh mục brand — chỉ admin và CEO */
export function canViewCosts(role: UserRole) {
  return role === 'admin' || role === 'ceo'
}
