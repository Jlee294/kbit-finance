/**
 * lib/drive.ts — Google Drive helpers
 *
 * Chiến lược upload (H2 — tránh giới hạn 4.5MB serverless):
 *   Server: tạo thư mục + cấp resumable session URL
 *   Browser: PUT bytes THẲNG vào Drive (không qua server)
 *
 * Cấu trúc thư mục (theo GOOGLE_DRIVE_PARENT_FOLDER_ID):
 *   /{CompanyName}/{Year}/{EntityFolder}/filename
 *   VD: /KBIT Corp/2025/Thu tiền/HD_001.pdf
 *
 * Env vars cần thiết:
 *   GOOGLE_DRIVE_PARENT_FOLDER_ID  — ID thư mục gốc trên Drive
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL
 *   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
 */

import { getAccessToken, DRIVE_SCOPE } from './google'

const API        = 'https://www.googleapis.com/drive/v3'
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'

// ─── Internal helpers ────────────────────────────────────────────────────────

async function driveGet(path: string, token: string): Promise<Response> {
  return fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
}

async function drivePost(path: string, token: string, body: unknown): Promise<Response> {
  return fetch(`${API}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** Tìm subfolder theo tên trong parentId. Trả null nếu không tìm thấy. */
async function findFolder(token: string, name: string, parentId: string): Promise<string | null> {
  const q = `mimeType='application/vnd.google-apps.folder' and name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and trashed=false`
  const res = await driveGet(`/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`, token)
  if (!res.ok) return null
  const { files } = await res.json() as { files: { id: string }[] }
  return files?.[0]?.id ?? null
}

/** Tạo subfolder. */
async function createFolder(token: string, name: string, parentId: string): Promise<string> {
  const res = await drivePost('/files', token, {
    name,
    mimeType: 'application/vnd.google-apps.folder',
    parents: [parentId],
  })
  if (!res.ok) throw new Error(`Drive: tạo thư mục "${name}" thất bại (${res.status})`)
  const { id } = await res.json() as { id: string }
  return id
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Đảm bảo chuỗi thư mục tồn tại, tạo nếu thiếu.
 * Bắt đầu từ GOOGLE_DRIVE_PARENT_FOLDER_ID.
 *
 * @example
 *   await ensureFolderPath(['KBIT Corp', '2025', 'Thu tiền'])
 *   // → ID của thư mục "Thu tiền"
 */
export async function ensureFolderPath(segments: string[]): Promise<string> {
  const rootId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID
  if (!rootId) throw new Error('GOOGLE_DRIVE_PARENT_FOLDER_ID chưa được cấu hình')

  const token = await getAccessToken(DRIVE_SCOPE)
  let parentId = rootId

  for (const seg of segments) {
    const existing = await findFolder(token, seg, parentId)
    parentId = existing ?? await createFolder(token, seg, parentId)
  }

  return parentId
}

/**
 * Khởi tạo resumable upload session trên Google Drive.
 * Trả về session URI để browser PUT file bytes trực tiếp.
 *
 * Lưu ý: session URI có hiệu lực 7 ngày, chứa token nên phải bảo mật.
 */
export async function initResumableUpload(opts: {
  folderId: string
  fileName: string
  mimeType: string
  fileSize: number
}): Promise<string> {
  const token = await getAccessToken(DRIVE_SCOPE)

  const res = await fetch(`${UPLOAD_API}/files?uploadType=resumable`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Upload-Content-Type': opts.mimeType,
      'X-Upload-Content-Length': String(opts.fileSize),
    },
    body: JSON.stringify({
      name: opts.fileName,
      parents: [opts.folderId],
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Drive: init resumable upload thất bại (${res.status}): ${body}`)
  }

  const sessionUri = res.headers.get('location')
  if (!sessionUri) throw new Error('Drive: response thiếu Location header')
  return sessionUri
}

/**
 * Lấy webViewLink của file đã upload.
 * Dùng để lưu vào documents.file_url.
 */
export async function getFileWebViewLink(fileId: string): Promise<string> {
  const token = await getAccessToken(DRIVE_SCOPE)
  const res = await driveGet(`/files/${fileId}?fields=webViewLink`, token)
  if (!res.ok) throw new Error(`Drive: lấy webViewLink thất bại (${res.status})`)
  const { webViewLink } = await res.json() as { webViewLink: string }
  return webViewLink
}

/**
 * Lấy parents (folder cha) hiện tại của file.
 * Dùng cho migration: cần biết folder cũ để remove trước khi add folder mới.
 */
export async function getFileParents(fileId: string): Promise<string[]> {
  const token = await getAccessToken(DRIVE_SCOPE)
  const res = await driveGet(`/files/${fileId}?fields=parents`, token)
  if (!res.ok) throw new Error(`Drive: lấy parents thất bại (${res.status})`)
  const { parents } = await res.json() as { parents?: string[] }
  return parents ?? []
}

/**
 * Di chuyển file sang folder mới (PATCH với addParents + removeParents).
 * Drive API không có "move" thuần — phải dùng update parents.
 */
export async function moveFile(fileId: string, newParentId: string, oldParentIds?: string[]): Promise<void> {
  const token = await getAccessToken(DRIVE_SCOPE)
  const removeStr = oldParentIds && oldParentIds.length > 0
    ? `&removeParents=${oldParentIds.join(',')}`
    : ''
  const url = `${UPLOAD_API.replace('/upload', '')}/files/${fileId}?addParents=${newParentId}${removeStr}&fields=id,parents`
  const res = await fetch(`${API}/files/${fileId}?addParents=${newParentId}${removeStr}&fields=id,parents`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Drive: move thất bại (${res.status}): ${errText}`)
  }
}

/**
 * Lấy metadata file (name, mimeType, size) để proxy stream.
 */
export async function getFileMetadata(fileId: string): Promise<{
  name: string
  mimeType: string
  size: string
} | null> {
  const token = await getAccessToken(DRIVE_SCOPE)
  const res = await driveGet(`/files/${fileId}?fields=name,mimeType,size`, token)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Drive: lấy metadata thất bại (${res.status})`)
  return await res.json() as { name: string; mimeType: string; size: string }
}

/**
 * Stream file content từ Drive về (dùng cho proxy endpoint).
 * Trả về Response object — caller có thể pipe body sang client.
 *
 * Bảo mật: chỉ Service Account access được file → server đóng vai trò
 * gatekeeper, đã verify user authen + có quyền xem trước khi gọi.
 */
export async function downloadFile(fileId: string): Promise<Response> {
  const token = await getAccessToken(DRIVE_SCOPE)
  const res = await fetch(`${API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Drive: download thất bại (${res.status})`)
  return res
}

/**
 * Chia sẻ file với user cụ thể (type=user, role=reader).
 * Lưu ý: KHÔNG dùng type=anyone — giữ tài liệu riêng tư trong org.
 *
 * NOTE: Với architecture Proxy (Cách 2), KHÔNG cần share với user nữa —
 * vì proxy endpoint /api/files/[id] đã handle authen + stream.
 * Function này giữ lại cho trường hợp cần grant access đặc biệt.
 */
export async function shareWithUser(fileId: string, email: string): Promise<void> {
  const token = await getAccessToken(DRIVE_SCOPE)
  await drivePost(`/files/${fileId}/permissions`, token, {
    type: 'user',
    role: 'reader',
    emailAddress: email,
  })
}

/**
 * Lấy folder path segments cho entity.
 * Cấu trúc cây thư mục (theo yêu cầu Kế toán trưởng):
 *
 *   {Tên công ty} / {Năm} / {Tháng} / {Dự án | "Chung"} / {Bán ra | Mua vào | Ngân hàng | Khác}
 *
 * Ví dụ:
 *   "KBIT Aesthetic" / "2026" / "05" / "Chung" / "Bán ra"
 *   "KBIT Aesthetic" / "2026" / "05" / "Dự án ABC" / "Mua vào"
 */
export function buildFolderPath(opts: {
  companyName: string
  year:        string | number
  month?:      string | number | null    // 1-12, padded "01"-"12"
  projectName?: string | null            // tên dự án; nếu rỗng → "Chung"
  entityType:  'customer_order' | 'supplier_order' | 'income' | 'expense' | 'cash_book'
}): string[] {
  const ENTITY_CATEGORY: Record<string, string> = {
    customer_order: 'Bán ra',
    supplier_order: 'Mua vào',
    income:         'Ngân hàng',
    expense:        'Ngân hàng',
    cash_book:      'Khác',
  }
  const month = opts.month != null
    ? String(opts.month).padStart(2, '0')
    : String(new Date().getMonth() + 1).padStart(2, '0')
  const project = (opts.projectName?.trim() || 'Chung')

  return [
    opts.companyName,
    String(opts.year),
    `Tháng ${month}`,
    project,
    ENTITY_CATEGORY[opts.entityType] ?? 'Khác',
  ]
}
