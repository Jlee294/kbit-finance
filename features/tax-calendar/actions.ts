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

// ─────────────────────────────────────────────────────────────────────────────
// KTT D1: Lập lịch cả năm tự động — đầu năm bấm 1 nút sinh toàn bộ nghĩa vụ thuế
//   GTGT/TNDN/TNCN/BHXH/BCTC cho cty đó cả năm. Upsert idempotent: chạy 2 lần
//   không tạo trùng (dùng onConflict company_id+tax_type+period).
// ─────────────────────────────────────────────────────────────────────────────

type Frequency = 'monthly' | 'quarterly' | 'yearly'

interface CalendarTemplate {
  tax_type:   string
  frequency:  Frequency
  /** Tháng hạn nộp sau kỳ (1=tháng kế, 2=2 tháng sau...) */
  due_offset_months: number
  /** Ngày hạn trong tháng đó (1-31). 0 = ngày cuối tháng. */
  due_day:    number
  note:       string
}

/** Preset chuẩn nghĩa vụ thuế VN — KTT có thể chỉnh sau */
const DEFAULT_TEMPLATES: CalendarTemplate[] = [
  // GTGT theo quý: hạn 30 ngày sau cuối quý → ngày 30 tháng kế quý
  { tax_type: 'GTGT', frequency: 'quarterly', due_offset_months: 1, due_day: 30, note: 'Thuế GTGT — tờ khai quý' },
  // TNDN tạm tính theo quý: hạn 30 ngày sau cuối quý
  { tax_type: 'TNDN', frequency: 'quarterly', due_offset_months: 1, due_day: 30, note: 'Thuế TNDN — tạm tính quý' },
  // TNCN theo tháng: hạn ngày 20 tháng kế
  { tax_type: 'TNCN', frequency: 'monthly',   due_offset_months: 1, due_day: 20, note: 'Thuế TNCN — tờ khai tháng' },
  // BHXH theo tháng: hạn cuối tháng phát sinh
  { tax_type: 'BHXH', frequency: 'monthly',   due_offset_months: 0, due_day: 0,  note: 'BHXH — đóng cuối tháng' },
  // BCTC năm: hạn 31/3 năm sau
  { tax_type: 'BCTC', frequency: 'yearly',    due_offset_months: 3, due_day: 31, note: 'Báo cáo tài chính năm — quyết toán' },
]

function lastDayOfMonth(y: number, m1to12: number): number {
  return new Date(y, m1to12, 0).getDate()
}

function fmtDate(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Sinh danh sách nghĩa vụ cho 1 template trong năm yearStr ('YYYY'). */
function buildItemsForTemplate(t: CalendarTemplate, yearStr: string) {
  const year = Number(yearStr)
  const items: { period: string; due_date: string; tax_type: string; note: string }[] = []

  const periods: { period: string; refMonth: number }[] = []
  if (t.frequency === 'monthly') {
    for (let m = 1; m <= 12; m++) periods.push({ period: `${yearStr}-${String(m).padStart(2, '0')}`, refMonth: m })
  } else if (t.frequency === 'quarterly') {
    for (let q = 1; q <= 4; q++) periods.push({ period: `${yearStr}-Q${q}`, refMonth: q * 3 })
  } else {
    periods.push({ period: yearStr, refMonth: 12 })
  }

  for (const { period, refMonth } of periods) {
    // Tháng hạn = refMonth + offset (wrap-around sang năm sau OK)
    let dueY = year, dueM = refMonth + t.due_offset_months
    while (dueM > 12) { dueM -= 12; dueY += 1 }
    const dueDay = t.due_day === 0 ? lastDayOfMonth(dueY, dueM) : Math.min(t.due_day, lastDayOfMonth(dueY, dueM))
    items.push({ period, due_date: fmtDate(dueY, dueM, dueDay), tax_type: t.tax_type, note: t.note })
  }
  return items
}

/**
 * Lập lịch tuân thủ thuế cả năm cho 1 công ty từ preset.
 * Idempotent — upsert (company+tax_type+period).
 * Trả về { created, skipped } để UI hiện kết quả.
 */
export async function generateYearlyCalendar(companyId: string, year: string): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  if (!/^\d{4}$/.test(year)) return { ok: false, error: 'Năm không hợp lệ' }
  const supabase = await createClient()

  const allItems: { company_id: string; tax_type: string; period: string; due_date: string; status: string; note: string }[] = []
  for (const t of DEFAULT_TEMPLATES) {
    for (const it of buildItemsForTemplate(t, year)) {
      allItems.push({
        company_id: companyId,
        tax_type:   it.tax_type,
        period:     it.period,
        due_date:   it.due_date,
        status:     'pending',
        note:       it.note,
      })
    }
  }

  // Chunk vào 1 upsert duy nhất
  const { error } = await supabase
    .from('tax_compliance_calendar')
    .upsert(allItems, { onConflict: 'company_id,tax_type,period', ignoreDuplicates: true })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/lich-thue')
  return { ok: true, count: allItems.length }
}
