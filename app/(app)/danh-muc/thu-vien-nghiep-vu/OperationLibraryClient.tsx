'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { OperationForm } from '@/features/operation-library/components/OperationForm'
import type { Operation } from '@/features/operation-library/queries'
import type { DocumentType } from '@/features/document-types/queries'
import { DIALOG_LG } from '@/lib/ui-tokens'

interface Props {
  operations: Operation[]
  docTypes: DocumentType[]
  canWrite: boolean
}

export function OperationLibraryClient({ operations, docTypes, canWrite }: Props) {
  const [addOpen, setAddOpen] = useState(false)
  const [editItem, setEditItem] = useState<Operation | null>(null)

  const docTypeMap = new Map(docTypes.map((d) => [d.id, d]))

  function renderDocBadges(ids: string[]) {
    if (!ids || ids.length === 0) return <span className="text-gray-400 text-xs">—</span>
    return (
      <div className="flex flex-wrap gap-1">
        {ids.map((id) => {
          const dt = docTypeMap.get(id)
          return dt ? (
            <span key={id} className="text-xs bg-brand-50 text-brand-800 px-1.5 py-0.5 rounded font-mono">
              {dt.code}
            </span>
          ) : null
        })}
      </div>
    )
  }

  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
        <p className="font-semibold text-gray-800">{operations.length} nghiệp vụ</p>
        {canWrite && (
          <Button size="sm" onClick={() => setAddOpen(true)}>+ Thêm mới</Button>
        )}
      </div>

      {operations.length === 0 ? (
        <div className="px-6 py-8 text-center text-gray-400 text-sm">
          Chưa có nghiệp vụ nào.{canWrite ? ' Thêm mới bằng nút bên trên.' : ''}
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 uppercase border-b bg-gray-50">
              <th className="px-4 py-3 text-left">Mã</th>
              <th className="px-4 py-3 text-left">Tên</th>
              <th className="px-4 py-3 text-left">Nhóm</th>
              <th className="px-4 py-3 text-left">Hồ sơ bắt buộc</th>
              <th className="px-4 py-3 text-left">Thuế GTGT</th>
              <th className="px-4 py-3 text-center">TNDN</th>
              {canWrite && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {operations.map((op) => (
              <tr key={op.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-brand-800 font-medium text-xs">{op.code}</td>
                <td className="px-4 py-3 text-gray-700">{op.name}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{op.group_name ?? '—'}</td>
                <td className="px-4 py-3">{renderDocBadges(op.required_doc_type_ids)}</td>
                <td className="px-4 py-3 text-gray-600 text-xs">{op.tax_gtgt ?? '—'}</td>
                <td className="px-4 py-3 text-center">
                  {op.tax_tndn_deductible
                    ? <span className="text-brand-700 text-xs">✓ Được trừ</span>
                    : <span className="text-gray-300 text-xs">—</span>}
                </td>
                {canWrite && (
                  <td className="px-4 py-3 text-right">
                    <button
                      className="text-xs text-gray-400 hover:text-brand-700"
                      onClick={() => setEditItem(op)}
                    >
                      Sửa
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent showCloseButton={false} className={DIALOG_LG}>
          <DialogHeader><DialogTitle>Thêm nghiệp vụ</DialogTitle></DialogHeader>
          <OperationForm docTypes={docTypes} onDone={() => setAddOpen(false)} />
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editItem} onOpenChange={(o) => !o && setEditItem(null)}>
        <DialogContent showCloseButton={false} className={DIALOG_LG}>
          <DialogHeader><DialogTitle>Sửa nghiệp vụ — {editItem?.code}</DialogTitle></DialogHeader>
          {editItem && (
            <OperationForm editItem={editItem} docTypes={docTypes} onDone={() => setEditItem(null)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
