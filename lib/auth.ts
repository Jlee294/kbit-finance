import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export type UserRole = 'admin' | 'chief_accountant' | 'accountant' | 'viewer'

export interface CurrentUser {
  id: string
  full_name: string
  role: UserRole
}

/**
 * React cache() — dedup per request.
 * Layout + page cùng gọi getCurrentUser() chỉ tốn 1 lần DB round-trip.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('users')
    .select('id, full_name, role')
    .eq('auth_id', user.id)
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
