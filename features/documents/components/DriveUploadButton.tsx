'use client'
/**
 * DriveUploadButton — Upload file thẳng lên Google Drive từ browser.
 *
 * Flow:
 *   1. User chọn file
 *   2. Gọi POST /api/drive/upload-init → nhận session_url + folder_id
 *   3. Browser PUT bytes trực tiếp vào Drive qua XHR (có progress bar)
 *   4. Gọi uploadDocument() Server Action để lưu metadata vào DB
 *
 * Không có bytes nào đi qua server — an toàn với giới hạn 4.5MB serverless.
 */

import { useRef, useState, useTransition } from 'react'
import { uploadDocument } from '../actions'

interface Props {
  entityType: 'customer_order' | 'supplier_order' | 'income' | 'expense'
  entityId: string
  documentTypeId: string
  label?: string
  onDone?: (docId: string) => void
}

export function DriveUploadButton({
  entityType,
  entityId,
  documentTypeId,
  label = 'Upload lên Drive',
  onDone,
}: Props) {
  const fileRef    = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [error,    setError]    = useState<string | null>(null)
  const [,         startTx]     = useTransition()

  async function handleFile(file: File) {
    setError(null)
    setProgress(0)

    // ── Bước 1: Lấy resumable session URL từ server ────────────────────────
    let sessionUrl: string
    try {
      const initRes = await fetch('/api/drive/upload-init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_type: entityType,
          entity_id:   entityId,
          file_name:   file.name,
          mime_type:   file.type || 'application/octet-stream',
          file_size:   file.size,
        }),
      })

      if (!initRes.ok) {
        const { error: msg } = await initRes.json().catch(() => ({ error: 'Server error' }))
        throw new Error(msg ?? `Lỗi ${initRes.status}`)
      }

      const json = await initRes.json()
      sessionUrl = json.session_url
    } catch (e: any) {
      setError(`Không thể khởi tạo upload: ${e.message}`)
      setProgress(null)
      return
    }

    // ── Bước 2: PUT bytes trực tiếp vào Drive (có progress) ───────────────
    const fileId = await new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest()

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          setProgress(Math.round((e.loaded / e.total) * 100))
        }
      })

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const resp = JSON.parse(xhr.responseText) as { id: string }
            resolve(resp.id)
          } catch {
            reject(new Error('Drive response không hợp lệ'))
          }
        } else {
          reject(new Error(`Drive upload thất bại (${xhr.status})`))
        }
      })

      xhr.addEventListener('error', () => reject(new Error('Lỗi mạng khi upload')))
      xhr.addEventListener('abort', () => reject(new Error('Upload bị huỷ')))

      xhr.open('PUT', sessionUrl)
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
      xhr.send(file)
    }).catch((e: Error) => {
      setError(e.message)
      setProgress(null)
      return null
    })

    if (!fileId) return

    // ── Bước 3: Lưu metadata vào DB qua Server Action ─────────────────────
    // KHÔNG lưu URL Drive trực tiếp — chỉ lưu drive_file_id.
    // User truy cập qua /api/files/[docId] proxy (có authen + audit log).
    startTx(async () => {
      try {
        const docId = await uploadDocument({
          document_type_id: documentTypeId,
          entity_type:      entityType,
          entity_id:        entityId,
          file_name:        file.name,
          drive_file_id:    fileId,
          file_url:         null,
        })
        setProgress(null)
        onDone?.(docId)
      } catch (e: any) {
        setError(`Lưu metadata thất bại: ${e.message}`)
        setProgress(null)
      }
    })
  }

  const isLoading = progress !== null

  return (
    <div className="inline-flex flex-col gap-1">
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.docx,.doc"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void handleFile(f)
          e.target.value = '' // reset để upload cùng file lại được
        }}
      />

      <button
        type="button"
        disabled={isLoading}
        onClick={() => fileRef.current?.click()}
        className="inline-flex items-center gap-1.5 h-8 px-3 text-sm rounded-md border bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isLoading ? (
          <>
            <span className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            {progress}%
          </>
        ) : (
          <>
            <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            {label}
          </>
        )}
      </button>

      {isLoading && (
        <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600 max-w-[200px]">{error}</p>
      )}
    </div>
  )
}
