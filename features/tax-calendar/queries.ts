import { createClient } from '@/lib/supabase/server'
import { todayLocal, formatLocalDate } from '@/lib/format'

export interface CalendarItem {
  id:         string
  company_id: string
  tax_type:   string
  period:     string
  due_date:   string
  status:     'pending' | 'filed' | 'overdue'
  note:       string | null
}

export async function listCalendar(companyId: string): Promise<CalendarItem[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tax_compliance_calendar')
    .select('id, company_id, tax_type, period, due_date, status, note')
    .eq('company_id', companyId)
    .order('due_date', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as CalendarItem[]
}

export async function listDueSoon(companyId: string): Promise<CalendarItem[]> {
  const supabase = await createClient()
  const today    = todayLocal()
  const soon     = formatLocalDate(new Date(Date.now() + 7 * 86_400_000))
  const { data, error } = await supabase
    .from('tax_compliance_calendar')
    .select('id, company_id, tax_type, period, due_date, status, note')
    .eq('company_id', companyId)
    .eq('status', 'pending')
    .gte('due_date', today)
    .lte('due_date', soon)
    .order('due_date')
  if (error) throw new Error(error.message)
  return (data ?? []) as CalendarItem[]
}

export async function listOverdue(companyId: string): Promise<CalendarItem[]> {
  const supabase = await createClient()
  const today    = todayLocal()
  const { data, error } = await supabase
    .from('tax_compliance_calendar')
    .select('id, company_id, tax_type, period, due_date, status, note')
    .eq('company_id', companyId)
    .eq('status', 'pending')
    .lt('due_date', today)
    .order('due_date')
  if (error) throw new Error(error.message)
  return (data ?? []) as CalendarItem[]
}
