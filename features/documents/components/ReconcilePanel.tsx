'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { UploadDocumentForm } from './UploadDocumentForm'
import { VerifyDocButton } from './VerifyDocButton'
import { deleteDocument } from '../actions'
import type { DocEntityType } from '../schema'
import type { Document } from '../queries'
import type { DocumentType } from '@/features/document-types/queries'

interface RequiredDocType {
  id: string
  code: string
  name: string
}

interface Props {
  entityType: DocEntityType
  entityId: string
  /** Required doc types from the operation (may be empty) */
  requiredDocTypes: RequiredDocType[]
  /** All docs already attached to this entity */
  docs: Document[]
  /** All available doc types (for upload form) */
  allDocTypes: DocumentType[]
  canEdit: boolean
  canApprove: boolean
}

export function ReconcilePanel({
  entityType,
  entityId,
  requiredDocTypes,
  docs,
  allDocTypes,
  canEdit,
  canApprove,
}: Props) {
  const router = useRouter()
  const [uploadOpen, setUploadOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function handleDelete(id: string) {
    if (!confirm('Xóa chứng từ này?')) return
    setDeletingId(id)
    try {
      await deleteDocument(id)
      router.refresh()
    } finally {
      setDeletingId(null)
    }
  }

  // Build reconcile status per required type
  const verifiedTypeIds = new Set(docs.filter((d) => d.is_verified).map((d) => d.document_type_id))
  const isComplete = requiredDocTypes.length === 0 || requiredDocTypes.every((rt) => verifiedTypeIds.has(rt.id))

  return (
    <div className="space-y-3">
      {/* Status banner */}
      {requiredDocTypes.length > 0 && (
        <div className={`rounded-lg px-4 py-2.5 text-sm flex items-center gap-2
          ${isComplete ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-amber-50 border border-amber-200 text-amber-800'}`}>
          {isComplete ? '✅ Đủ hồ sơ bắt buộc' : '⚠️ Thiếu hồ sơ bắt buộc — không thể xác nhận chi phí'}
          {!isComplete && (
            <span className="font-semibold">
              : {requiredDocTypes.filter((rt) => !verifiedTypeIds.has(rt.id)).map((rt) => rt.code).join(', ')}
            </span>
          )}
        </div>
      )}

      {/* Required checklist */}
      {requiredDocTypes.length > 0 && (
        <div className="rounded-lg border p-3 bg-gray-50 space-y-1.5">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Checklist bắt buộc</p>
          {requiredDocTypes.map((rt) => {
            const ok = verifiedTypeIds.has(rt.id)
            return (
              <div key={rt.id} className="flex items-center gap-2 text-sm">
                <span>{ok ? '✅' : '⬜'}</span>
                <span className="font-mono text-xs text-brand-800">[{rt.code}]</span>
                <span className={ok ? 'text-gray-700' : 'text-gray-500'}>{rt.name}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Attached docs list */}
      {docs.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 border-b">
              <th className="py-1.5 text-left">Loại</th>
              <th className="py-1.5 text-left">Tên file</th>
              <th className="py-1.5 text-center">Trạng thái</th>
              {canEdit && <th className="py-1.5" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {docs.map((doc) => {
              const dt = doc.document_types
              return (
                <tr key={doc.id} className="hover:bg-gray-50">
                  <td className="py-2 pr-3">
                    <span className="font-mono text-xs bg-brand-50 text-brand-800 px-1.5 py-0.5 rounded">
                      {dt?.code ?? '—'}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-gray-700">
                    {doc.drive_file_id || doc.file_url ? (
                      <a href={`/api/files/${doc.id}`} target="_blank" rel="noopener noreferrer"
                        className="hover:underline text-brand-700">
                        {doc.file_name}
                      </a>
                    ) : (
                      doc.file_name
                    )}
                  </td>
                  <td className="py-2 text-center">
                    <VerifyDocButton
                      documentId={doc.id}
                      isVerified={doc.is_verified}
                      canApprove={canApprove}
                    />
                  </td>
                  {canEdit && (
                    <td className="py-2 pl-2">
                      <button
                        onClick={() => handleDelete(doc.id)}
                        disabled={deletingId === doc.id}
                        className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
                      >
                        Xóa
                      </button>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {docs.length === 0 && (
        <p className="text-sm text-gray-400 italic">Chưa có chứng từ đính kèm.</p>
      )}

      {/* Upload button */}
      {canEdit && (
        <>
          <Button size="sm" variant="outline" onClick={() => setUploadOpen(true)}>
            + Đính kèm chứng từ
          </Button>
          <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
            <DialogContent showCloseButton={false} className="max-w-md">
              <DialogHeader>
                <DialogTitle>Đính kèm chứng từ</DialogTitle>
              </DialogHeader>
              <UploadDocumentForm
                entityType={entityType}
                entityId={entityId}
                docTypes={allDocTypes}
                onDone={() => setUploadOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  )
}
