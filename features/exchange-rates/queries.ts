import { createClient } from '@/lib/supabase/server'

export async function listExchangeRates() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('exchange_rates')
    .select('*')
    .order('rate_date', { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}
