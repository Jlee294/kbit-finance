'use client'

/**
 * EntityFilesButton — Nút "📎 N file" hiện cạnh mỗi row.
 * Click → mở Dialog hiện danh sách file đã đính + nút upload mới.
 *
 * Dùng được cho mọi entity_type (customer_order, supplier_order,
 * income, expense, cash_book).
 */

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DriveUploadButton } from './DriveUploadButton'
import { listDocumentsAction, getOrCreateDocTypeId } from '../actions'
import type { Document } from '../queries'
import type { DocEntityType } from '../schema'

interface Props {
  entityType: DocEntityType
  entityId: string
  /** Code mặc định nếu doc_type chưa tồn tại (vd: 'OTHER', 'INVOICE') */
  defaultDocTypeCode?: string
  defaultDocTypeName?: string
  canWrite?: boolean
}

export function EntityFilesButton({
  entityType, entityId,
  defaultDocTypeCode = 'OTHER',
  defaultDocTypeName = 'Chứng từ khác',
  canWrite = true,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [docs, setDocs] = useState<Document[]>([])
  const [docTypeId, setDocTypeId] = useState<string>('')
  const [loading, setLoading] = useState(false)

  async function refresh() {
    setLoading(true)
    try {
      const list = await listDocumentsAction(entityType, entityId)
      setDocs(list)
    } finally { setLoading(false) }
  }

  useEffect(() => {
    if (open) {
      refresh()
      // Lấy doc_type_id mặc định (auto-create nếu chưa có)
      getOrCreateDocTypeId(defaultDocTypeCode, defaultDocTypeName)
        .then(setDocTypeId)
        .catch(console.error)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}
        className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600"
        title="Tài liệu đính kèm"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
        </svg>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Tài liệu đính kèm</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {loading ? (
              <p className="text-sm text-gray-500">Đang tải...</p>
            ) : docs.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Chưa có tài liệu nào</p>
            ) : (
              <ul className="divide-y rounded-lg border bg-white">
                {docs.map((d) => (
                  <li key={d.id} className="flex items-center justify-between px-3 py-2 hover:bg-gray-50">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-gray-400 shrink-0">📄</span>
                      <a
                        href={`/api/files/${d.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline truncate"
                      >
                        {d.file_name}
                      </a>
                    </div>
                    <a
                      href={`/api/files/${d.id}?download=1`}
                      className="text-xs text-gray-400 hover:text-gray-700 shrink-0 ml-2"
                      title="Tải về"
                    >
                      ⬇
                    </a>
                  </li>
                ))}
              </ul>
            )}

            {canWrite && docTypeId && (
              <div className="border-t pt-3">
                <p className="text-xs text-gray-500 mb-2">Đính kèm file mới:</p>
                <DriveUploadButton
                  entityType={entityType as any}
                  entityId={entityId}
                  documentTypeId={docTypeId}
                  label="Upload file"
                  onDone={() => { refresh(); router.refresh() }}
                />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
