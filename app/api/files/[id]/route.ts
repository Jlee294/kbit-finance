/**
 * GET /api/files/[id]
 *
 * Proxy endpoint cho documents — stream file từ Google Drive về user
 * mà KHÔNG bao giờ expose URL Drive trực tiếp.
 *
 * Bảo mật:
 *   1. Bắt buộc đăng nhập (Supabase auth)
 *   2. RLS check user có quyền xem document đó không
 *   3. Service Account fetch file từ Drive (private folder)
 *   4. Stream bytes về user
 *   5. Audit log mọi truy cập
 *
 * URL Drive không bao giờ leak ra browser — kể cả attacker
 * lấy được DB cũng không vào được Drive vì SA credentials chỉ ở server.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { downloadFile, getFileMetadata } from '@/lib/drive'

// File có thể >4.5MB nên cần Node runtime (Edge có limit body 4.5MB)
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  const { id: docId } = await ctx.params

  // ── 1. Authen ─────────────────────────────────────────────────────────────
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Phải đăng nhập' }, { status: 401 })
  }

  // ── 2. Lookup document + RLS check (Supabase tự enforce qua auth client) ─
  const { data: doc, error } = await supabase
    .from('documents')
    .select('id, file_name, drive_file_id, entity_type, entity_id')
    .eq('id', docId)
    .single()

  if (error || !doc) {
    return NextResponse.json({ error: 'Không tìm thấy file' }, { status: 404 })
  }
  if (!doc.drive_file_id) {
    return NextResponse.json({ error: 'File chưa được upload lên Drive' }, { status: 410 })
  }

  // ── 3. Audit log (best-effort) ────────────────────────────────────────────
  const { data: userRow } = await supabase
    .from('users')
    .select('id, full_name, role')
    .eq('auth_id', user.id)
    .single()

  const isDownload = req.nextUrl.searchParams.get('download') === '1'

  await supabase.from('file_access_log').insert({
    document_id: docId,
    user_id:     userRow?.id ?? null,
    user_email:  user.email ?? null,
    user_role:   userRow?.role ?? null,
    action:      isDownload ? 'download' : 'view',
    ip_address:  req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    user_agent:  req.headers.get('user-agent')?.slice(0, 500) ?? null,
  })

  // ── 4. Lấy metadata + stream file từ Drive ────────────────────────────────
  let driveRes: Response
  try {
    driveRes = await downloadFile(doc.drive_file_id)
  } catch (e) {
    console.error('[files/proxy] Drive download failed', e)
    return NextResponse.json({ error: 'Lỗi tải file từ Drive' }, { status: 502 })
  }

  // ── 5. Stream response về browser ─────────────────────────────────────────
  const contentType = driveRes.headers.get('content-type') ?? 'application/octet-stream'
  const contentLength = driveRes.headers.get('content-length')

  // Encode filename theo RFC 5987 để hỗ trợ tiếng Việt
  const safeName = encodeURIComponent(doc.file_name).replace(/['()]/g, escape)
  const disposition = isDownload
    ? `attachment; filename*=UTF-8''${safeName}`
    : `inline; filename*=UTF-8''${safeName}`

  const headers = new Headers({
    'Content-Type':        contentType,
    'Content-Disposition': disposition,
    'Cache-Control':       'private, no-store',  // Không cache (sensitive)
    'X-Content-Type-Options': 'nosniff',
  })
  if (contentLength) headers.set('Content-Length', contentLength)

  return new NextResponse(driveRes.body, { status: 200, headers })
}
