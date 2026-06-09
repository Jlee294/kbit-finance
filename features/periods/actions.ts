'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, canApprove } from '@/lib/auth'
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
  revalidatePath('/duyet-khoa-ky')
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
  revalidatePath('/duyet-khoa-ky')
}

export async function unlockPeriod(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('accounting_periods').update({
    status: 'open',
    locked_at: null,
    locked_by: null,
  }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/duyet-khoa-ky')
}

// ─────────────────────────────────────────────────────────────────────────
// KTT yêu cầu (B1): Khóa kỳ theo QUÝ hoặc NĂM
// Cách: upsert (auto-tạo) + lock cùng lúc nhiều kỳ tháng. Trigger DB vẫn check
// theo từng tháng, nên khóa Q1 = khóa luôn 3 tháng 01/02/03 của năm.
// ─────────────────────────────────────────────────────────────────────────

const bulkLockSchema = z.object({
  company_id: z.string().uuid(),
  year:       z.string().regex(/^\d{4}$/),
  scope:      z.enum(['quarter', 'year']),
  quarter:    z.number().int().min(1).max(4).optional(),  // bắt buộc nếu scope=quarter
})

function monthsFor(scope: 'quarter' | 'year', year: string, quarter?: number): string[] {
  if (scope === 'year') {
    return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
  }
  if (!quarter) throw new Error('Thiếu quarter cho scope=quarter')
  const start = (quarter - 1) * 3 + 1
  return [start, start + 1, start + 2].map((m) => `${year}-${String(m).padStart(2, '0')}`)
}

/** Khóa nhiều kỳ tháng cùng lúc (theo quý hoặc cả năm) — tự upsert nếu chưa có. */
export async function lockPeriodsBulk(input: unknown) {
  const me = await getCurrentUser()
  if (!me) return { ok: false as const, error: 'Unauthorized' }
  if (!canApprove(me.role)) return { ok: false as const, error: 'Chỉ admin/giám đốc/KTT/CEO mới được khóa kỳ' }

  const data = bulkLockSchema.parse(input)
  const supabase = await createClient()
  const months   = monthsFor(data.scope, data.year, data.quarter)
  const now      = new Date().toISOString()

  // Upsert (idempotent) — nếu kỳ chưa có thì tạo open, sau đó update khóa
  const upRows = months.map((period) => ({ company_id: data.company_id, period }))
  const { error: upErr } = await supabase
    .from('accounting_periods')
    .upsert(upRows, { onConflict: 'company_id,period', ignoreDuplicates: true })
  if (upErr) return { ok: false as const, error: upErr.message }

  const { error } = await supabase
    .from('accounting_periods')
    .update({ status: 'locked', locked_at: now, locked_by: me.id })
    .eq('company_id', data.company_id)
    .in('period', months)
  if (error) return { ok: false as const, error: error.message }

  revalidatePath('/duyet-khoa-ky')
  return { ok: true as const, locked: months.length }
}

/** Mở khóa nhiều kỳ tháng cùng lúc (theo quý hoặc cả năm). */
export async function unlockPeriodsBulk(input: unknown) {
  const me = await getCurrentUser()
  if (!me) return { ok: false as const, error: 'Unauthorized' }
  if (!canApprove(me.role)) return { ok: false as const, error: 'Chỉ admin/giám đốc/KTT/CEO mới được mở kỳ' }

  const data = bulkLockSchema.parse(input)
  const supabase = await createClient()
  const months   = monthsFor(data.scope, data.year, data.quarter)

  const { error } = await supabase
    .from('accounting_periods')
    .update({ status: 'open', locked_at: null, locked_by: null })
    .eq('company_id', data.company_id)
    .in('period', months)
  if (error) return { ok: false as const, error: error.message }

  revalidatePath('/duyet-khoa-ky')
  return { ok: true as const, unlocked: months.length }
}
