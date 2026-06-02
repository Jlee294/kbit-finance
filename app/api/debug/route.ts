import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  // Chỉ cho phép trong development
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 404 })
  }

  const supabase = await createClient()
  const svc = createServiceClient()

  // ── 1. Auth session ───────────────────────────────────────────────────────
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({
      step: 'auth',
      status: 'FAIL — không tìm thấy session. Hãy đăng nhập trước rồi mở lại URL này.',
      authError,
    })
  }

  // ── 1b. Admin-only ──────────────────────────────────────────────────────
  const { data: dbUser } = await supabase
    .from('users')
    .select('id, full_name, role, is_active')
    .eq('auth_id', user.id)
    .single()

  if (dbUser?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  // ── 2. public.users (already fetched above for admin check) ────────────

  // ── 3a. companies via service client (unstable_cache path) ──────────────────
  const { data: companies, error: companiesError } = await svc
    .from('companies')
    .select('id, code, name')
    .order('code')
    .limit(5)

  // ── 3b. companies via auth client (same as Server Action insert path) ────────
  const { data: companiesAuth, error: companiesAuthError } = await supabase
    .from('companies')
    .select('id, code, name')
    .order('code')
    .limit(10)

  // ── 4. listTasks (cookie client, exact same query as cong-viec page) ──────
  const { data: tasks, error: tasksError } = await supabase
    .from('tasks')
    .select('id, title, status, due_date, auto_generated, related_entity_type, related_entity_id, assigned_to, note, created_at')
    .order('created_at', { ascending: false })
    .limit(5)

  // ── 5. Column existence check ─────────────────────────────────────────────
  const { data: columns, error: columnsError } = await svc
    .from('information_schema.columns' as any)
    .select('column_name')
    .eq('table_schema', 'public')
    .eq('table_name', 'tasks')

  // ── 6. Try insert test (dry-run using auth client) ───────────────────────────
  // Chỉ test RLS policy cho companies INSERT, không thực sự insert
  const { error: insertTestError } = await supabase
    .rpc('kbit_can_approve' as any)

  return NextResponse.json({
    auth: { id: user.id, email: user.email },
    dbUser: dbUser ?? null,
    dbError: null,
    // Service client (no auth → needs SUPABASE_SERVICE_ROLE_KEY)
    companiesSvc: companies ?? [],
    companiesSvcError: companiesError?.message ?? null,
    // Auth client (with cookie session → should work for admin)
    companiesAuth: companiesAuth ?? [],
    companiesAuthError: companiesAuthError?.message ?? null,
    tasks: tasks?.slice(0, 2) ?? [],
    tasksError: tasksError?.message ?? null,
    taskColumns: columns?.map((c: any) => c.column_name) ?? [],
    columnsError: columnsError?.message ?? null,
    // Can this user call kbit_can_approve()?
    canApproveRpc: insertTestError ? `ERROR: ${insertTestError.message}` : 'OK',
  })
}
