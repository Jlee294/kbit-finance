// ── Tính giá trị 8 chỉ tiêu từ dữ liệu thật ─────────────────────────────────
// D17/I9: chỉ tiêu tài chính/công nợ lấy số TỪ RPC Phase 8 (getCompanyReport).
//         Số dư tiền từ v_bank_balances (Phase 2 — 1 nguồn sự thật, C2/D2).
//         KHÔNG viết lại công thức đã chuẩn hoá ở Phase 8.

import { createClient }    from '@/lib/supabase/server'
import { getCompanyReport } from '@/features/reports/queries'

// ── OVERDUE_DEBT ─────────────────────────────────────────────────────────────
// Tổng outstanding đơn KH quá hạn giao = delivery_date < today, outstanding > 0.
// I3: loại nội bộ (nợ nội bộ không phải rủi ro thu hồi).
// I2: loại đơn draft chưa phát sinh công nợ.
export async function computeOverdueDebt(companyId: string): Promise<number> {
  const supabase = await createClient()
  const today    = new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('customer_orders')
    .select('outstanding')
    .eq('company_id',     companyId)
    .eq('is_intercompany', false)
    .neq('fulfillment_status', 'draft')
    .gt('outstanding', 0)
    .lt('delivery_date', today)
  if (error) throw new Error(error.message)
  return (data ?? []).reduce((s, r) => s + Number(r.outstanding ?? 0), 0)
}

// ── DSO (Days Sales Outstanding) ─────────────────────────────────────────────
// Công thức: ar_outstanding / total_income × số ngày kỳ (mặc định 30 ngày).
// Lấy số từ RPC Phase 8 — KHÔNG tự dựng lại.
export async function computeDSO(
  companyId: string,
  from?: string,
  to?:   string,
): Promise<number> {
  const report = await getCompanyReport({ companyId, from, to })
  if (!report.total_income || report.total_income === 0) return 0
  const days = 30 // kỳ mặc định
  return (report.ar_outstanding / report.total_income) * days
}

// ── NET_CASHFLOW ──────────────────────────────────────────────────────────────
// Bóc field net_cash_flow từ RPC Phase 8.
export async function computeNetCashflow(
  companyId: string,
  from?: string,
  to?:   string,
): Promise<number> {
  const report = await getCompanyReport({ companyId, from, to })
  return report.net_cash_flow
}

// ── CASH_BALANCE ──────────────────────────────────────────────────────────────
// Tổng số dư tiền từ v_bank_balances (Phase 2) cho mọi tài khoản thuộc công ty.
// Dùng 2 bước để tránh ambiguous FK join trong PostgREST.
export async function computeCashBalance(companyId: string): Promise<number> {
  const supabase = await createClient()
  // Bước 1: lấy id các tài khoản của công ty
  const { data: accounts, error: ae } = await supabase
    .from('bank_accounts')
    .select('id')
    .eq('company_id', companyId)
  if (ae) throw new Error(ae.message)
  const ids = (accounts ?? []).map(a => a.id)
  if (ids.length === 0) return 0

  // Bước 2: tổng balance từ v_bank_balances
  const { data, error } = await supabase
    .from('v_bank_balances')
    .select('balance')
    .in('bank_account_id', ids)
  if (error) throw new Error(error.message)
  return (data ?? []).reduce((s, r) => s + Number((r as any).balance ?? 0), 0)
}

// ── TAX_DUE_SOON ──────────────────────────────────────────────────────────────
// Đếm tax_compliance_calendar pending, due_date ∈ [today, today+7].
export async function computeTaxDueSoon(companyId: string): Promise<number> {
  const supabase = await createClient()
  const today  = new Date().toISOString().slice(0, 10)
  const soon   = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
  const { count, error } = await supabase
    .from('tax_compliance_calendar')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('status', 'pending')
    .gte('due_date', today)
    .lte('due_date', soon)
  if (error) throw new Error(error.message)
  return count ?? 0
}

// ── TAX_OVERDUE ───────────────────────────────────────────────────────────────
// Đếm tax_compliance_calendar pending, due_date < today.
export async function computeTaxOverdue(companyId: string): Promise<number> {
  const supabase = await createClient()
  const today = new Date().toISOString().slice(0, 10)
  const { count, error } = await supabase
    .from('tax_compliance_calendar')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('status', 'pending')
    .lt('due_date', today)
  if (error) throw new Error(error.message)
  return count ?? 0
}

// ── MISSING_DOCS ──────────────────────────────────────────────────────────────
// Đếm expense_transactions có operation_id (checklist bắt buộc) nhưng chưa đủ
// chứng từ verified. Dùng logic Phase 6: required_doc_type_ids vs verified docs.
export async function computeMissingDocs(companyId: string): Promise<number> {
  const supabase = await createClient()

  // Lấy expense pending có operation_id
  const { data: exps, error: ee } = await supabase
    .from('expense_transactions')
    .select('id, operation_id')
    .eq('company_id', companyId)
    .in('status', ['draft', 'confirmed'])
    .not('operation_id', 'is', null)
  if (ee) throw new Error(ee.message)
  if (!exps || exps.length === 0) return 0

  // Lấy required_doc_type_ids từ operation_library một lần
  const opIds = [...new Set(exps.map(e => e.operation_id as string))]
  const { data: ops, error: oe } = await supabase
    .from('operation_library')
    .select('id, required_doc_type_ids')
    .in('id', opIds)
  if (oe) throw new Error(oe.message)
  const opMap = new Map((ops ?? []).map(o => [o.id, (o.required_doc_type_ids ?? []) as string[]]))

  // Lấy documents đã verified cho các expense này
  const expIds = exps.map(e => e.id)
  const { data: docs, error: de } = await supabase
    .from('documents')
    .select('entity_id, document_type_id, is_verified')
    .eq('entity_type', 'expense')
    .in('entity_id', expIds)
    .eq('is_verified', true)
  if (de) throw new Error(de.message)

  // Group verified doc_type_ids by expense
  const verifiedMap = new Map<string, Set<string>>()
  for (const d of docs ?? []) {
    if (!verifiedMap.has(d.entity_id)) verifiedMap.set(d.entity_id, new Set())
    verifiedMap.get(d.entity_id)!.add(d.document_type_id)
  }

  // Đếm expense thiếu ít nhất 1 required doc type
  let missing = 0
  for (const exp of exps) {
    const required = opMap.get(exp.operation_id as string) ?? []
    if (required.length === 0) continue
    const verified = verifiedMap.get(exp.id) ?? new Set()
    const hasAll   = required.every(id => verified.has(id))
    if (!hasAll) missing++
  }
  return missing
}

// ── STALE_DRAFTS ──────────────────────────────────────────────────────────────
// Đếm giao dịch tồn nháp >7 ngày.
// D15: customer_orders dùng fulfillment_status='draft', KHÔNG cột 'status'.
//      supplier_orders không có fulfillment_status → bỏ qua.
export async function computeStaleDrafts(companyId: string): Promise<number> {
  const supabase = await createClient()
  const cutoff   = new Date(Date.now() - 7 * 86_400_000).toISOString()

  const [ie, ii, co] = await Promise.all([
    supabase.from('expense_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId).eq('status', 'draft').lt('created_at', cutoff),
    supabase.from('income_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId).eq('status', 'draft').lt('created_at', cutoff),
    supabase.from('customer_orders')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId).eq('fulfillment_status', 'draft').lt('created_at', cutoff),
  ])
  if (ie.error) throw new Error(ie.error.message)
  if (ii.error) throw new Error(ii.error.message)
  if (co.error) throw new Error(co.error.message)
  return (ie.count ?? 0) + (ii.count ?? 0) + (co.count ?? 0)
}

// ── computeAllIndicators ──────────────────────────────────────────────────────
// Gọi song song tất cả chỉ tiêu → Record<code, number>.
// from/to tùy chọn — dùng cho NET_CASHFLOW, DSO (kỳ đang xem).
export async function computeAllIndicators(
  companyId: string,
  period?:   string,      // 'YYYY-MM' — tính from/to
): Promise<Record<string, number>> {
  let from: string | undefined
  let to:   string | undefined
  if (period) {
    const [y, m] = period.split('-').map(Number)
    from = `${period}-01`
    const last = new Date(y, m, 0).getDate()
    to = `${period}-${String(last).padStart(2, '0')}`
  }

  const [
    overdueDebt,
    dso,
    netCashflow,
    cashBalance,
    taxDueSoon,
    taxOverdue,
    missingDocs,
    staleDrafts,
  ] = await Promise.all([
    computeOverdueDebt(companyId),
    computeDSO(companyId, from, to),
    computeNetCashflow(companyId, from, to),
    computeCashBalance(companyId),
    computeTaxDueSoon(companyId),
    computeTaxOverdue(companyId),
    computeMissingDocs(companyId),
    computeStaleDrafts(companyId),
  ])

  return {
    OVERDUE_DEBT: overdueDebt,
    DSO:          dso,
    NET_CASHFLOW: netCashflow,
    CASH_BALANCE: cashBalance,
    TAX_DUE_SOON: taxDueSoon,
    TAX_OVERDUE:  taxOverdue,
    MISSING_DOCS: missingDocs,
    STALE_DRAFTS: staleDrafts,
  }
}
