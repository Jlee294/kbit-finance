/**
 * POST /api/admin/migrate-drive-folders
 *
 * One-shot migration: di chuyển các file Drive từ cây thư mục cũ
 *   /{Công ty}/{Năm}/{Đơn hàng KH|Đơn hàng NCC|Thu tiền|Chi phí}
 * sang cây thư mục mới (theo KTT):
 *   /{Công ty}/{Năm}/{Tháng}/{Dự án | Chung}/{Bán ra | Mua vào | Ngân hàng | Khác}
 *
 * Hoạt động:
 *   1. Query tất cả documents có drive_file_id
 *   2. Với mỗi doc, query entity → lấy company/year/month/project
 *   3. Tính folder path mới qua buildFolderPath()
 *   4. ensureFolderPath → tạo/tìm folder mới
 *   5. moveFile(fileId, newFolderId, oldParents) — di chuyển
 *
 * Bảo mật: chỉ admin chạy được. Trả về JSON report số file đã move/skip/fail.
 * Idempotent: chạy lại nhiều lần OK (file đã ở folder đúng → no-op).
 *
 * Body JSON (optional):
 *   { dry_run: true }   — chỉ in plan, không thực sự move
 *   { limit: 100 }      — chỉ xử lý N file đầu (test trước)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ensureFolderPath, buildFolderPath, moveFile, getFileParents } from '@/lib/drive'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300  // 5 phút cho job dài

interface DocEntity {
  id:            string
  entity_type:   'customer_order' | 'supplier_order' | 'income' | 'expense' | 'cash_book'
  entity_id:     string
  drive_file_id: string
  file_name:     string
}

interface MigrationItem {
  doc_id:     string
  file_name:  string
  status:     'moved' | 'skipped' | 'failed' | 'no_change'
  old_path?:  string
  new_path?:  string
  error?:     string
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()

  // ── Auth: chỉ admin ──────────────────────────────────────────────────────
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Phải đăng nhập' }, { status: 401 })

  const { data: userRow } = await supabase
    .from('users').select('role').eq('auth_id', user.id).single()
  if (userRow?.role !== 'admin') {
    return NextResponse.json({ error: 'Chỉ admin mới chạy được migration' }, { status: 403 })
  }

  // ── Parse options ────────────────────────────────────────────────────────
  let dryRun = false
  let limit = 1000
  try {
    const body = await req.json()
    dryRun = !!body.dry_run
    if (typeof body.limit === 'number') limit = Math.min(body.limit, 5000)
  } catch { /* no body → defaults */ }

  // ── M1: Lock chống chạy song song (chỉ với run thật, dry_run không cần) ──
  const LOCK_KEY = 'migrate-drive-folders'
  if (!dryRun) {
    const { data: gotLock, error: lockErr } = await supabase.rpc('kbit_try_lock', {
      p_key: LOCK_KEY, p_ttl_seconds: 600,
    })
    if (lockErr) return NextResponse.json({ error: 'Lỗi lock: ' + lockErr.message }, { status: 500 })
    if (!gotLock) {
      return NextResponse.json(
        { error: 'Migration đang chạy (bởi admin khác hoặc lần chạy trước chưa xong). Thử lại sau ít phút.' },
        { status: 409 },
      )
    }
  }

  try {
    return await runMigration(supabase, dryRun, limit)
  } finally {
    if (!dryRun) {
      await supabase.rpc('kbit_release_lock', { p_key: LOCK_KEY }).then(() => {}, () => {})
    }
  }
}

async function runMigration(
  supabase: Awaited<ReturnType<typeof createClient>>,
  dryRun: boolean,
  limit: number,
): Promise<NextResponse> {

  // ── Lấy danh sách documents cần migrate ──────────────────────────────────
  const { data: docs, error } = await supabase
    .from('documents')
    .select('id, entity_type, entity_id, drive_file_id, file_name')
    .not('drive_file_id', 'is', null)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!docs || docs.length === 0) {
    return NextResponse.json({ message: 'Không có file nào cần migrate', items: [] })
  }

  // ── Process từng doc ─────────────────────────────────────────────────────
  const items: MigrationItem[] = []
  let movedCount = 0, skippedCount = 0, failedCount = 0

  for (const d of docs as DocEntity[]) {
    try {
      // Resolve company/year/month/project từ entity
      const entityInfo = await resolveEntity(supabase, d.entity_type, d.entity_id)
      if (!entityInfo) {
        items.push({ doc_id: d.id, file_name: d.file_name, status: 'skipped', error: 'Entity không tồn tại' })
        skippedCount++
        continue
      }

      const newSegments = buildFolderPath({
        companyName: entityInfo.companyName,
        year:        entityInfo.year,
        month:       entityInfo.month,
        projectName: entityInfo.projectName,
        entityType:  d.entity_type,
      })
      const newPath = '/' + newSegments.join('/')

      if (dryRun) {
        items.push({ doc_id: d.id, file_name: d.file_name, status: 'no_change', new_path: newPath })
        continue
      }

      // Tạo/tìm folder mới
      const newFolderId = await ensureFolderPath(newSegments)

      // Lấy parents hiện tại (folder cũ)
      const oldParents = await getFileParents(d.drive_file_id)

      // Nếu đã ở folder mới rồi → skip
      if (oldParents.includes(newFolderId)) {
        items.push({ doc_id: d.id, file_name: d.file_name, status: 'no_change', new_path: newPath })
        skippedCount++
        continue
      }

      // Move
      await moveFile(d.drive_file_id, newFolderId, oldParents)
      items.push({ doc_id: d.id, file_name: d.file_name, status: 'moved', new_path: newPath })
      movedCount++
    } catch (err: any) {
      items.push({ doc_id: d.id, file_name: d.file_name, status: 'failed', error: err.message })
      failedCount++
    }
  }

  return NextResponse.json({
    summary: {
      total:   docs.length,
      moved:   movedCount,
      skipped: skippedCount,
      failed:  failedCount,
      dry_run: dryRun,
    },
    items,
  })
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function resolveEntity(
  supabase: any,
  entityType: DocEntity['entity_type'],
  entityId: string,
): Promise<{ companyName: string; year: string; month: string; projectName: string | null } | null> {
  let row: any = null

  if (entityType === 'income') {
    const { data } = await supabase.from('income_transactions')
      .select('txn_date, companies!company_id(name), projects!project_id(name)')
      .eq('id', entityId).single()
    row = data
    if (!row) return null
    return parseRow(row, row.txn_date)
  }
  if (entityType === 'expense') {
    const { data } = await supabase.from('expense_transactions')
      .select('txn_date, companies!company_id(name), projects!project_id(name)')
      .eq('id', entityId).single()
    row = data
    if (!row) return null
    return parseRow(row, row.txn_date)
  }
  if (entityType === 'customer_order') {
    const { data } = await supabase.from('customer_orders')
      .select('order_date, companies(name), projects(name)')
      .eq('id', entityId).single()
    row = data
    if (!row) return null
    return parseRow(row, row.order_date)
  }
  if (entityType === 'supplier_order') {
    const { data } = await supabase.from('supplier_orders')
      .select('order_date, companies(name), projects(name)')
      .eq('id', entityId).single()
    row = data
    if (!row) return null
    return parseRow(row, row.order_date)
  }
  if (entityType === 'cash_book') {
    const { data } = await supabase.from('cash_book')
      .select('txn_date, companies!company_id(name)')
      .eq('id', entityId).single()
    row = data
    if (!row) return null
    return parseRow({ ...row, projects: null }, row.txn_date)
  }
  return null
}

function parseRow(row: any, dateStr: string | null): {
  companyName: string; year: string; month: string; projectName: string | null
} {
  const companyName = row?.companies?.name ?? 'KBIT'
  const projectName = row?.projects?.name ?? null
  let year  = String(new Date().getFullYear())
  let month = String(new Date().getMonth() + 1).padStart(2, '0')
  if (dateStr) {
    const m = dateStr.match(/^(\d{4})-(\d{2})/)
    if (m) { year = m[1]; month = m[2] }
  }
  return { companyName, year, month, projectName }
}
