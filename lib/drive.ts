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
 * Chia sẻ file với user cụ thể (type=user, role=reader).
 * Lưu ý: KHÔNG dùng type=anyone — giữ tài liệu riêng tư trong org.
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
 * Dùng chung cho upload-init route và tests.
 */
export function buildFolderPath(opts: {
  companyName: string
  year: string | number
  entityType: 'customer_order' | 'supplier_order' | 'income' | 'expense'
}): string[] {
  const ENTITY_LABEL: Record<string, string> = {
    customer_order: 'Đơn hàng KH',
    supplier_order: 'Đơn hàng NCC',
    income:         'Thu tiền',
    expense:        'Chi phí',
  }
  return [
    opts.companyName,
    String(opts.year),
    ENTITY_LABEL[opts.entityType] ?? opts.entityType,
  ]
}
