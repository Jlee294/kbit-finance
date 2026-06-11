import { createClient } from '@/lib/supabase/server'
import { todayLocal, formatLocalDate } from '@/lib/format'

export interface CalendarItem {
  id:         string
  company_id: string
  tax_type:   string
  period:     string
  due_date:   string
  filed_date: string | null    // KTT F1: ngày thực tế nộp
  status:     'pending' | 'filed' | 'overdue'
  note:       string | null
}

export async function listCalendar(companyId: string): Promise<CalendarItem[]> {
  const supabase = await createClient()
  // KTT F1: defensive — fallback nếu migration 0044 chưa chạy
  let data: any[] | null = null
  let error: { message: string } | null = null
  const r1 = await supabase
    .from('tax_compliance_calendar')
    .select('id, company_id, tax_type, period, due_date, filed_date, status, note')
    .eq('company_id', companyId)
    .order('due_date', { ascending: true })
  data = r1.data as any
  error = r1.error
  if (error && /filed_date/i.test(error.message)) {
    const fb = await supabase
      .from('tax_compliance_calendar')
      .select('id, company_id, tax_type, period, due_date, status, note')
      .eq('company_id', companyId)
      .order('due_date', { ascending: true })
    data = fb.data as any; error = fb.error
  }
  if (error) throw new Error(error.message)
  return ((data ?? []) as any[]).map((r) => ({
    id:         r.id,
    company_id: r.company_id,
    tax_type:   r.tax_type,
    period:     r.period,
    due_date:   r.due_date,
    filed_date: r.filed_date ?? null,
    status:     r.status,
    note:       r.note ?? null,
  })) as CalendarItem[]
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
