import { createClient } from '@/lib/supabase/server'

export interface AuditFilter {
  table?:     string
  changedBy?: string
  period?:    string  // 'YYYY-MM'
}

export interface AuditEntry {
  id:         number
  table_name: string
  record_id:  string | null
  action:     string
  changed_at: string
  changed_by: string | null
  old_data:   Record<string, unknown> | null
  new_data:   Record<string, unknown> | null
  // joined
  changer_name?: string | null
}

export async function listAuditLog(f: AuditFilter = {}): Promise<AuditEntry[]> {
  const supabase = await createClient()

  let q = supabase
    .from('audit_log')
    .select('id, table_name, record_id, action, changed_at, changed_by, old_data, new_data')
    .order('changed_at', { ascending: false })
    .limit(200)

  if (f.table)     q = q.eq('table_name', f.table)
  if (f.changedBy) q = q.eq('changed_by', f.changedBy)
  if (f.period) {
    const [y, m] = f.period.split('-').map(Number)
    const start = `${f.period}-01`
    const next  = m === 12
      ? `${y + 1}-01-01`
      : `${y}-${String(m + 1).padStart(2, '0')}-01`
    q = q.gte('changed_at', start).lt('changed_at', next)
  }

  const { data, error } = await q
  if (error) throw new Error(error.message)

  const rows = (data ?? []) as AuditEntry[]

  // Resolve changed_by → full_name (1 query nếu có dữ liệu)
  const userIds = [...new Set(rows.map((r) => r.changed_by).filter(Boolean))] as string[]
  if (userIds.length > 0) {
    const { data: users } = await supabase
      .from('users')
      .select('id, full_name')
      .in('id', userIds)
    const nameMap = new Map((users ?? []).map((u) => [u.id, u.full_name]))
    rows.forEach((r) => { r.changer_name = r.changed_by ? (nameMap.get(r.changed_by) ?? null) : null })
  }

  return rows
}

export { AUDITABLE_TABLES } from './constants'
