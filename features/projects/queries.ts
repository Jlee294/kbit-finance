import { createClient } from '@/lib/supabase/server'

export async function listProjects() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('projects')
    .select('*, companies(code, name)')
    .order('code')
  if (error) throw new Error(error.message)
  return data ?? []
}
