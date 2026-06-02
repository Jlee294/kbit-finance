/**
 * POST /api/drive/upload-init
 *
 * Server tạo thư mục Drive + trả về session URL để browser upload trực tiếp.
 * Không có bytes nào đi qua server — tránh giới hạn 4.5MB serverless.
 *
 * Body JSON:
 *   entity_type  — 'income' | 'expense' | 'customer_order' | 'supplier_order'
 *   entity_id    — UUID của entity
 *   file_name    — tên file (VD: "HD_001.pdf")
 *   mime_type    — MIME type (VD: "application/pdf")
 *   file_size    — kích thước file tính bằng byte
 *
 * Response JSON:
 *   session_url  — URL để PUT file bytes (có thời hạn 7 ngày)
 *   folder_id    — Google Drive folder ID (lưu vào documents.drive_folder_id)
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, canEdit } from '@/lib/auth'
import { ensureFolderPath, initResumableUpload, buildFolderPath } from '@/lib/drive'

const bodySchema = z.object({
  entity_type: z.enum(['customer_order', 'supplier_order', 'income', 'expense', 'cash_book']),
  entity_id:   z.string().uuid(),
  file_name:   z.string().min(1).max(200),
  mime_type:   z.string().min(1),
  file_size:   z.number().int().positive().max(100 * 1024 * 1024), // max 100MB
})

export async function POST(req: NextRequest) {
  // ── Auth + role check ──────────────────────────────────────────────────────
  const me = await getCurrentUser()
  if (!me) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!canEdit(me.role)) {
    return NextResponse.json({ error: 'Không có quyền upload' }, { status: 403 })
  }
  const supabase = await createClient()

  // ── Validate body ─────────────────────────────────────────────────────────
  let body: z.infer<typeof bodySchema>
  try {
    body = bodySchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const { entity_type, entity_id, file_name, mime_type, file_size } = body

  // ── Resolve company / year / month / project từ entity ───────────────────
  const now = new Date()
  let companyName  = ''
  let year         = String(now.getFullYear())
  let month        = String(now.getMonth() + 1).padStart(2, '0')
  let projectName: string | null = null
  let entityResolved = false

  /** Parse YYYY-MM-DD → tách year + month */
  function setDateFields(dateStr: string | undefined | null) {
    if (!dateStr) return
    const m = dateStr.match(/^(\d{4})-(\d{2})/)
    if (m) { year = m[1]; month = m[2] }
  }

  try {
    if (entity_type === 'income') {
      const { data } = await supabase
        .from('income_transactions')
        .select('txn_date, companies!company_id(name), projects!project_id(name)')
        .eq('id', entity_id)
        .single()
      if (data) {
        companyName = (data.companies as any)?.name ?? ''
        projectName = (data.projects as any)?.name ?? null
        setDateFields(data.txn_date)
        entityResolved = !!companyName
      }
    } else if (entity_type === 'expense') {
      const { data } = await supabase
        .from('expense_transactions')
        .select('txn_date, companies!company_id(name), projects!project_id(name)')
        .eq('id', entity_id)
        .single()
      if (data) {
        companyName = (data.companies as any)?.name ?? ''
        projectName = (data.projects as any)?.name ?? null
        setDateFields(data.txn_date)
        entityResolved = !!companyName
      }
    } else if (entity_type === 'customer_order') {
      const { data } = await supabase
        .from('customer_orders')
        .select('order_date, companies(name), projects(name)')
        .eq('id', entity_id)
        .single()
      if (data) {
        companyName = (data.companies as any)?.name ?? ''
        projectName = (data.projects as any)?.name ?? null
        setDateFields(data.order_date)
        entityResolved = !!companyName
      }
    } else if (entity_type === 'supplier_order') {
      const { data } = await supabase
        .from('supplier_orders')
        .select('order_date, companies(name), projects(name)')
        .eq('id', entity_id)
        .single()
      if (data) {
        companyName = (data.companies as any)?.name ?? ''
        projectName = (data.projects as any)?.name ?? null
        setDateFields(data.order_date)
        entityResolved = !!companyName
      }
    } else if (entity_type === 'cash_book') {
      const { data } = await supabase
        .from('cash_book')
        .select('txn_date, companies!company_id(name)')
        .eq('id', entity_id)
        .single()
      if (data) {
        companyName = (data.companies as any)?.name ?? ''
        setDateFields(data.txn_date)
        entityResolved = !!companyName
      }
    }
  } catch (err) {
    console.error('[drive/upload-init] entity lookup failed:', err)
    return NextResponse.json({ error: 'Không tìm thấy entity' }, { status: 404 })
  }

  if (!entityResolved) {
    return NextResponse.json({ error: 'Entity không tồn tại hoặc không có quyền truy cập' }, { status: 404 })
  }

  // ── Tạo/tìm thư mục Drive ─────────────────────────────────────────────────
  const segments = buildFolderPath({
    companyName, year, month, projectName,
    entityType: entity_type,
  })

  try {
    const folderId    = await ensureFolderPath(segments)
    const sessionUrl  = await initResumableUpload({
      folderId,
      fileName:  file_name,
      mimeType:  mime_type,
      fileSize:  file_size,
    })

    return NextResponse.json({ session_url: sessionUrl, folder_id: folderId })
  } catch (err: any) {
    console.error('[drive/upload-init]', err)
    return NextResponse.json(
      { error: err.message ?? 'Drive error' },
      { status: 502 }
    )
  }
}
