'use server'

import { revalidatePath }     from 'next/cache'
import { createClient }       from '@/lib/supabase/server'
import { calendarItemSchema } from './schema'

export async function upsertCalendarItem(raw: unknown) {
  const parsed = calendarItemSchema.safeParse(raw)
  if (!parsed.success) throw new Error(parsed.error.issues.map((e: any) => e.message).join('; '))

  const supabase = await createClient()
  const { error } = await supabase
    .from('tax_compliance_calendar')
    .upsert(
      {
        company_id: parsed.data.company_id,
        tax_type:   parsed.data.tax_type,
        period:     parsed.data.period,
        due_date:   parsed.data.due_date,
        status:     parsed.data.status,
        note:       parsed.data.note ?? null,
      },
      { onConflict: 'company_id,tax_type,period' },
    )
  if (error) throw new Error(error.message)
  revalidatePath('/lich-thue')
}

export async function markFiled(id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('tax_compliance_calendar')
    .update({ status: 'filed' })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/lich-thue')
}

export async function deleteCalendarItem(id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('tax_compliance_calendar')
    .delete()
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/lich-thue')
}
