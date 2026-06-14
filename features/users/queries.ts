import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export interface UserOption {
  id:        string
  full_name: string
  role:      string
}

export const listUsers = cache(async (): Promise<UserOption[]> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, role')
    .eq('is_active', true)
    .order('full_name')
  if (error) { console.error('[listUsers]', error.message); return [] }
  return (data ?? []) as UserOption[]
})

export interface UserWithCompanies {
  id:        string
  full_name: string
  role:      string
  is_active: boolean
  company_ids: string[]   // [] = chưa gán (với accountant/viewer = không thấy công ty nào)
}

/** Danh sách user kèm công ty được gán — cho trang Phân quyền (admin). */
export async function listUsersWithCompanies(): Promise<UserWithCompanies[]> {
  const supabase = await createClient()
  const { data: users, error } = await supabase
    .from('users')
    .select('id, full_name, role, is_active')
    .order('full_name')
  if (error) { console.error('[listUsersWithCompanies]', error.message); return [] }

  const { data: links } = await supabase
    .from('user_companies')
    .select('user_id, company_id')
  const byUser = new Map<string, string[]>()
  for (const l of (links ?? []) as { user_id: string; company_id: string }[]) {
    if (!byUser.has(l.user_id)) byUser.set(l.user_id, [])
    byUser.get(l.user_id)!.push(l.company_id)
  }

  return (users ?? []).map((u: any) => ({
    id: u.id, full_name: u.full_name, role: u.role, is_active: u.is_active,
    company_ids: byUser.get(u.id) ?? [],
  }))
}
