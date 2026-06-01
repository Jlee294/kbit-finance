'use client'

import { useState } from 'react'
import { VerifyDocButton } from '@/features/documents/components/VerifyDocButton'
import type { Document } from '@/features/documents/queries'
import type { DocumentType } from '@/features/document-types/queries'

const ENTITY_LABELS: Record<string, string> = {
  customer_order: 'Đơn hàng',
  supplier_order: 'Đơn nhập khẩu',
  income: 'Thu tiền',
  expense: 'Chi phí',
}

interface Props {
  docs: Document[]
  docTypes: DocumentType[]
  canWrite: boolean
  canVerify: boolean
}

export function DocumentListClient({ docs, docTypes: _docTypes, canWrite: _canWrite, canVerify }: Props) {
  const [filter, setFilter] = useState<'all' | 'verified' | 'unverified'>('all')

  const filtered = docs.filter((d) => {
    if (filter === 'verified') return d.is_verified
    if (filter === 'unverified') return !d.is_verified
    return true
  })

  const unverifiedCount = docs.filter((d) => !d.is_verified).length

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center gap-4">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg text-sm">
          {(['all', 'unverified', 'verified'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-md transition-colors ${
                filter === f ? 'bg-white shadow-sm font-medium text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {f === 'all' ? `Tất cả (${docs.length})` : f === 'unverified' ? `Chờ xác nhận (${unverifiedCount})` : `Đã xác nhận (${docs.length - unverifiedCount})`}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-400 text-sm">Không có chứng từ nào.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 uppercase border-b bg-gray-50">
                <th className="px-4 py-3 text-left">Loại CT</th>
                <th className="px-4 py-3 text-left">Tên file</th>
                <th className="px-4 py-3 text-left">Đối tượng</th>
                <th className="px-4 py-3 text-left">Ngày đính kèm</th>
                <th className="px-4 py-3 text-center">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((doc) => {
                const dt = doc.document_types
                return (
                  <tr key={doc.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs bg-brand-50 text-brand-800 px-1.5 py-0.5 rounded">
                        {dt?.code ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {doc.drive_file_id || doc.file_url ? (
                        <a href={`/api/files/${doc.id}`} target="_blank" rel="noopener noreferrer"
                          className="hover:underline text-brand-700">
                          {doc.file_name}
                        </a>
                      ) : doc.file_name}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {ENTITY_LABELS[doc.entity_type] ?? doc.entity_type}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {new Date(doc.created_at).toLocaleDateString('vi-VN')}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <VerifyDocButton
                        documentId={doc.id}
                        isVerified={doc.is_verified}
                        canApprove={canVerify}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
