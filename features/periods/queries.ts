import { createClient } from '@/lib/supabase/server'

export async function listPeriods() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('accounting_periods')
    .select('*, companies(code, name), users!locked_by(full_name)')
    .order('period', { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}
