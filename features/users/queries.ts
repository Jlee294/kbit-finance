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
