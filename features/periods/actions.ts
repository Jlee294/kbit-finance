'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import { z } from 'zod'

const periodSchema = z.object({
  company_id: z.string().uuid(),
  period: z.string().regex(/^\d{4}-\d{2}$/, 'Định dạng YYYY-MM'),
})

export async function createPeriod(input: unknown) {
  const data = periodSchema.parse(input)
  const supabase = await createClient()
  const { error } = await supabase.from('accounting_periods').insert(data)
  if (error) throw new Error(error.message)
  revalidatePath('/danh-muc/ky-ke-toan')
}

export async function lockPeriod(id: string) {
  const me = await getCurrentUser()
  const supabase = await createClient()
  const { error } = await supabase.from('accounting_periods').update({
    status: 'locked',
    locked_at: new Date().toISOString(),
    locked_by: me?.id,
  }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/danh-muc/ky-ke-toan')
}

export async function unlockPeriod(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('accounting_periods').update({
    status: 'open',
    locked_at: null,
    locked_by: null,
  }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/danh-muc/ky-ke-toan')
}
