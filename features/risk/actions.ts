'use server'

import { revalidatePath }              from 'next/cache'
import { createClient }                from '@/lib/supabase/server'
import { thresholdSchema }             from './schema'
import { INDICATORS, indicatorsOfGroup, type RiskGroup } from './indicators'
import { computeAllIndicators }        from './compute'
import { lightForIndicator, pickThreshold, rollupGroup, rollupOverall, type Light } from './lights'

// ── Upsert ngưỡng ─────────────────────────────────────────────────────────────
export async function upsertThreshold(raw: unknown) {
  const parsed = thresholdSchema.safeParse(raw)
  if (!parsed.success) throw new Error(parsed.error.issues.map((e: any) => e.message).join('; '))

  const supabase = await createClient()
  const { error } = await supabase
    .from('risk_thresholds')
    .upsert(
      {
        company_id:     parsed.data.company_id,
        indicator_code: parsed.data.indicator_code,
        yellow_at:      parsed.data.yellow_at,
        red_at:         parsed.data.red_at,
      },
      { onConflict: 'company_id,indicator_code' },
    )
  if (error) throw new Error(error.message)
  revalidatePath('/rui-ro')
  revalidatePath('/rui-ro/nguong')
}

// ── Xóa ngưỡng ────────────────────────────────────────────────────────────────
export async function deleteThreshold(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('risk_thresholds').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/rui-ro')
  revalidatePath('/rui-ro/nguong')
}

// ── Chấm điểm 1 nút ───────────────────────────────────────────────────────────
export async function runAssessment(companyId: string, period?: string) {
  const supabase = await createClient()

  // 1) Tính giá trị + lấy ngưỡng song song
  const [values, thrResult] = await Promise.all([
    computeAllIndicators(companyId, period),
    supabase
      .from('risk_thresholds')
      .select('company_id, indicator_code, yellow_at, red_at'),
  ])
  if (thrResult.error) throw new Error(thrResult.error.message)
  const thresholds = thrResult.data ?? []

  // 2) Đèn từng chỉ tiêu
  const perIndicator = INDICATORS.map(ind => {
    const t    = pickThreshold(thresholds, ind.code, companyId)
    const { light, configured } = lightForIndicator(
      values[ind.code] ?? 0,
      ind.direction,
      t,
    )
    return {
      code:       ind.code,
      group:      ind.group as RiskGroup,
      value:      values[ind.code] ?? 0,
      yellow_at:  t?.yellow_at ?? null,
      red_at:     t?.red_at    ?? null,
      light,
      configured,
    }
  })

  // 3) Đèn từng nhóm + tổng (A6)
  const groups = {} as Record<RiskGroup, Light>
  ;(['finance', 'debt', 'tax', 'documents', 'operations'] as RiskGroup[]).forEach(g => {
    groups[g] = rollupGroup(
      indicatorsOfGroup(g).map(i => perIndicator.find(p => p.code === i.code)!.light),
    )
  })
  const overall = rollupOverall(groups)

  // 4) Ghi risk_assessments (RLS: chỉ admin/KTT — policy risk_assess_w)
  const scores = { indicators: perIndicator, groups }
  const { error } = await supabase
    .from('risk_assessments')
    .insert({ company_id: companyId, scores, overall })
  if (error) throw new Error(error.message)

  revalidatePath('/rui-ro')
  return { overall, groups }
}
