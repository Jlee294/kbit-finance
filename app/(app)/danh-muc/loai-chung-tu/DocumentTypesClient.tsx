'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DocumentTypeForm } from '@/features/document-types/components/DocumentTypeForm'
import type { DocumentType } from '@/features/document-types/queries'
import { DIALOG_SM } from '@/lib/ui-tokens'

interface Props {
  items: DocumentType[]
  canWrite: boolean
}

export function DocumentTypesClient({ items, canWrite }: Props) {
  const [addOpen, setAddOpen] = useState(false)
  const [editItem, setEditItem] = useState<DocumentType | null>(null)

  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
        <p className="font-semibold text-gray-800">{items.length} loại chứng từ</p>
        {canWrite && (
          <Button size="sm" onClick={() => setAddOpen(true)}>+ Thêm mới</Button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="px-6 py-8 text-center text-gray-400 text-sm">
          Chưa có loại chứng từ nào.{canWrite ? ' Thêm mới bằng nút bên trên.' : ''}
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 uppercase border-b bg-gray-50">
              <th className="px-6 py-3 text-left">Mã</th>
              <th className="px-6 py-3 text-left">Tên</th>
              {canWrite && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50">
                <td className="px-6 py-3 font-mono text-brand-800 font-medium">{item.code}</td>
                <td className="px-6 py-3 text-gray-700">{item.name}</td>
                {canWrite && (
                  <td className="px-4 py-3 text-right">
                    <button
                      className="text-xs text-gray-400 hover:text-brand-700"
                      onClick={() => setEditItem(item)}
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
        <DialogContent showCloseButton={false} className={DIALOG_SM}>
          <DialogHeader><DialogTitle>Thêm loại chứng từ</DialogTitle></DialogHeader>
          <DocumentTypeForm onDone={() => setAddOpen(false)} />
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editItem} onOpenChange={(o) => !o && setEditItem(null)}>
        <DialogContent showCloseButton={false} className={DIALOG_SM}>
          <DialogHeader><DialogTitle>Sửa loại chứng từ</DialogTitle></DialogHeader>
          {editItem && (
            <DocumentTypeForm editItem={editItem} onDone={() => setEditItem(null)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
