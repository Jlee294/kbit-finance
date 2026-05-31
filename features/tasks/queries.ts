import { createClient }  from '@/lib/supabase/server'
import type { TaskStatus } from './schema'

export interface TaskRow {
  id:                   string
  title:                string
  status:               TaskStatus
  due_date:             string | null
  auto_generated:       boolean
  related_entity_type:  string | null
  related_entity_id:    string | null
  assigned_to:          string | null
  note:                 string | null
  created_at:           string
  // joined
  assignee_name?:       string | null
}

export interface TaskFilter {
  status?:        TaskStatus | ''
  autoOnly?:      boolean
  assignedTo?:    string
}

export async function listTasks(filter: TaskFilter = {}): Promise<TaskRow[]> {
  const supabase = await createClient()
  let q = supabase
    .from('tasks')
    .select('id, title, status, due_date, auto_generated, related_entity_type, related_entity_id, assigned_to, note, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  if (filter.status)     q = q.eq('status', filter.status)
  if (filter.autoOnly)   q = q.eq('auto_generated', true)
  if (filter.assignedTo) q = q.eq('assigned_to', filter.assignedTo)

  const { data, error } = await q
  if (error) throw new Error(error.message)

  const rows = (data ?? []) as TaskRow[]

  // Resolve assignee names
  const userIds = [...new Set(rows.map(r => r.assigned_to).filter(Boolean))] as string[]
  if (userIds.length > 0) {
    const { data: users } = await supabase
      .from('users').select('id, full_name').in('id', userIds)
    const nameMap = new Map((users ?? []).map(u => [u.id, u.full_name]))
    rows.forEach(r => { r.assignee_name = r.assigned_to ? (nameMap.get(r.assigned_to) ?? null) : null })
  }

  return rows
}
