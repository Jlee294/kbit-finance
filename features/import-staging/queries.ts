import { isDemoMode } from '@/lib/demo'
import { createClient } from '@/lib/supabase/server'

export interface ImportBatchCheckRow {
  id: string
  check_code: string
  status: 'pending' | 'passed' | 'failed' | 'explained'
  expected_value: number | null
  actual_value: number | null
  difference: number
  source_ref: string | null
  explanation: string | null
}

export interface ImportBatchRow {
  id: string
  company_id: string
  company_name: string
  period_from: string
  period_to: string
  status: string
  total_files: number
  total_rows: number
  error_count: number
  warning_count: number
  posted_at: string | null
  created_at: string
  checks: ImportBatchCheckRow[]
}

export async function listImportBatches(opts: {
  companyId?: string
  year?: number
} = {}): Promise<ImportBatchRow[]> {
  if (isDemoMode()) return []

  const supabase = await createClient()
  let query = supabase
    .from('import_batches')
    .select(`
      id, company_id, period_from, period_to, status,
      total_files, total_rows, error_count, warning_count, posted_at, created_at,
      companies!company_id(name),
      import_checks(
        id, check_code, status, expected_value, actual_value,
        difference, source_ref, explanation
      )
    `)
    .order('created_at', { ascending: false })
    .limit(20)

  if (opts.companyId) query = query.eq('company_id', opts.companyId)
  if (opts.year) {
    query = query
      .gte('period_from', `${opts.year}-01-01`)
      .lte('period_from', `${opts.year}-12-31`)
  }

  const { data, error } = await query
  if (error) {
    console.error('[listImportBatches]', error.message)
    return []
  }

  return ((data ?? []) as any[]).map((batch) => ({
    id: batch.id,
    company_id: batch.company_id,
    company_name: batch.companies?.name ?? '',
    period_from: batch.period_from,
    period_to: batch.period_to,
    status: batch.status,
    total_files: Number(batch.total_files),
    total_rows: Number(batch.total_rows),
    error_count: Number(batch.error_count),
    warning_count: Number(batch.warning_count),
    posted_at: batch.posted_at,
    created_at: batch.created_at,
    checks: ((batch.import_checks ?? []) as any[]).map((check) => ({
      ...check,
      expected_value: check.expected_value == null ? null : Number(check.expected_value),
      actual_value: check.actual_value == null ? null : Number(check.actual_value),
      difference: Number(check.difference),
    })),
  }))
}
