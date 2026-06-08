'use server'

import { revalidatePath }  from 'next/cache'
import { createClient }    from '@/lib/supabase/server'
import { createTaskSchema } from './schema'
import { todayLocal, formatLocalDate } from '@/lib/format'

// ── Tạo task thủ công ─────────────────────────────────────────────────────────
export async function createTask(raw: unknown) {
  const parsed = createTaskSchema.safeParse(raw)
  if (!parsed.success) throw new Error(parsed.error.issues.map((e: any) => e.message).join('; '))

  const supabase = await createClient()
  const { error } = await supabase.from('tasks').insert({
    title:          parsed.data.title,
    due_date:       parsed.data.due_date || null,
    assigned_to:    parsed.data.assigned_to ?? null,
    note:           parsed.data.note ?? null,
    status:         'open',
    auto_generated: false,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/cong-viec')
}

// ── Đổi trạng thái ────────────────────────────────────────────────────────────
export async function updateTaskStatus(id: string, status: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('tasks').update({ status }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/cong-viec')
}

// ── Auto-task (idempotent) ────────────────────────────────────────────────────
// Tạo task cho 3 tình huống: (a) thiếu chứng từ, (b) thuế đến hạn, (c) draft tồn >7 ngày.
// Trước khi insert: kiểm tra đã có task auto chưa done cùng entity → bỏ qua.
export async function generateAutoTasks(companyId: string): Promise<{ created: number; scanned: number }> {
  const supabase = await createClient()

  type Cand = {
    title:               string
    related_entity_type: string
    related_entity_id:   string
    due_date?:           string
  }
  const cands: Cand[] = []

  // ── (a) Thiếu chứng từ bắt buộc ──────────────────────────────────────────
  const { data: exps } = await supabase
    .from('expense_transactions')
    .select('id, operation_id')
    .eq('company_id', companyId)
    .in('status', ['draft', 'confirmed'])
    .not('operation_id', 'is', null)

  if (exps && exps.length > 0) {
    const opIds = [...new Set(exps.map(e => e.operation_id as string))]
    const { data: ops } = await supabase
      .from('operation_library')
      .select('id, required_doc_type_ids, name')
      .in('id', opIds)
    const opMap = new Map((ops ?? []).map(o => [o.id, { req: (o.required_doc_type_ids ?? []) as string[], name: o.name as string }]))

    const expIds = exps.map(e => e.id)
    const { data: docs } = await supabase
      .from('documents')
      .select('entity_id, document_type_id, is_verified')
      .eq('entity_type', 'expense')
      .in('entity_id', expIds)
      .eq('is_verified', true)

    const verifiedMap = new Map<string, Set<string>>()
    for (const d of docs ?? []) {
      if (!verifiedMap.has(d.entity_id)) verifiedMap.set(d.entity_id, new Set())
      verifiedMap.get(d.entity_id)!.add(d.document_type_id)
    }

    for (const exp of exps) {
      const op = opMap.get(exp.operation_id as string)
      if (!op || op.req.length === 0) continue
      const verified = verifiedMap.get(exp.id) ?? new Set()
      const hasAll   = op.req.every(id => verified.has(id))
      if (!hasAll) {
        cands.push({
          title:               `Bổ sung chứng từ: ${op.name}`,
          related_entity_type: 'expense_transactions',
          related_entity_id:   exp.id,
        })
      }
    }
  }

  // ── (b) Nghĩa vụ thuế đến hạn ≤7 ngày ────────────────────────────────────
  const soon = formatLocalDate(new Date(Date.now() + 7 * 86_400_000))
  const today = todayLocal()
  const { data: taxes } = await supabase
    .from('tax_compliance_calendar')
    .select('id, tax_type, period, due_date')
    .eq('company_id', companyId)
    .eq('status', 'pending')
    .lte('due_date', soon)
  for (const t of taxes ?? []) {
    cands.push({
      title:               `Nộp ${t.tax_type} kỳ ${t.period} (hạn ${t.due_date})`,
      related_entity_type: 'tax_compliance_calendar',
      related_entity_id:   t.id,
      due_date:            t.due_date,
    })
  }

  // ── (c) Giao dịch draft tồn >7 ngày ──────────────────────────────────────
  // D15: expense/income dùng 'status'; customer_orders dùng 'fulfillment_status'.
  const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString()

  const [expDrafts, incDrafts, coDrafts] = await Promise.all([
    supabase.from('expense_transactions')
      .select('id').eq('company_id', companyId).eq('status', 'draft').lt('created_at', cutoff),
    supabase.from('income_transactions')
      .select('id').eq('company_id', companyId).eq('status', 'draft').lt('created_at', cutoff),
    supabase.from('customer_orders')
      .select('id').eq('company_id', companyId).eq('fulfillment_status', 'draft').lt('created_at', cutoff),
  ])
  for (const d of expDrafts.data ?? [])
    cands.push({ title: 'Xử lý chi phí draft tồn >7 ngày', related_entity_type: 'expense_transactions', related_entity_id: d.id })
  for (const d of incDrafts.data ?? [])
    cands.push({ title: 'Xử lý phiếu thu draft tồn >7 ngày', related_entity_type: 'income_transactions', related_entity_id: d.id })
  for (const d of coDrafts.data ?? [])
    cands.push({ title: 'Xử lý đơn KH draft tồn >7 ngày', related_entity_type: 'customer_orders', related_entity_id: d.id })

  // ── Idempotent: bỏ ứng viên đã có task auto chưa done cùng entity ─────────
  let created = 0
  for (const c of cands) {
    const { data: existed } = await supabase
      .from('tasks')
      .select('id')
      .eq('auto_generated', true)
      .eq('related_entity_type', c.related_entity_type)
      .eq('related_entity_id',   c.related_entity_id)
      .neq('status', 'done')
      .limit(1)
    if (existed && existed.length > 0) continue

    const { error } = await supabase.from('tasks').insert({
      ...c,
      status:         'open',
      auto_generated: true,
    })
    if (error) throw new Error(error.message)
    created++
  }

  revalidatePath('/cong-viec')
  return { created, scanned: cands.length }
}
