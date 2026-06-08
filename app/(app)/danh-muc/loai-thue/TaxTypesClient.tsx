'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TaxTypeForm } from '@/features/tax-types/components/TaxTypeForm'
import type { TaxType } from '@/features/tax-types/queries'
import { DIALOG_SM } from '@/lib/ui-tokens'

interface Props {
  items: TaxType[]
  canWrite: boolean
}

export function TaxTypesClient({ items, canWrite }: Props) {
  const [addOpen, setAddOpen] = useState(false)
  const [editItem, setEditItem] = useState<TaxType | null>(null)

  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
        <p className="font-semibold text-gray-800">{items.length} loại thuế</p>
        {canWrite && <Button size="sm" onClick={() => setAddOpen(true)}>+ Thêm mới</Button>}
      </div>

      {items.length === 0 ? (
        <div className="px-6 py-8 text-center text-gray-400 text-sm">
          Chưa có loại thuế nào.{canWrite ? ' Thêm mới bằng nút bên trên.' : ''}
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 uppercase border-b bg-gray-50">
              <th className="px-6 py-3 text-left">Mã</th>
              <th className="px-6 py-3 text-left">Tên</th>
              <th className="px-4 py-3 text-center">Thứ tự</th>
              <th className="px-4 py-3 text-center">Trạng thái</th>
              {canWrite && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((item) => (
              <tr key={item.id} className={`hover:bg-gray-50 ${item.is_active ? '' : 'opacity-60'}`}>
                <td className="px-6 py-3 font-mono text-brand-800 font-medium">{item.code}</td>
                <td className="px-6 py-3 text-gray-700">{item.name}</td>
                <td className="px-4 py-3 text-center text-gray-500">{item.sort_order}</td>
                <td className="px-4 py-3 text-center">
                  <Badge variant={item.is_active ? 'default' : 'secondary'}>{item.is_active ? 'Đang dùng' : 'Ẩn'}</Badge>
                </td>
                {canWrite && (
                  <td className="px-4 py-3 text-right">
                    <button className="text-xs text-gray-400 hover:text-brand-700" onClick={() => setEditItem(item)}>Sửa</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent showCloseButton={false} className={DIALOG_SM}>
          <DialogHeader><DialogTitle>Thêm loại thuế</DialogTitle></DialogHeader>
          <TaxTypeForm onDone={() => setAddOpen(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editItem} onOpenChange={(o) => !o && setEditItem(null)}>
        <DialogContent showCloseButton={false} className={DIALOG_SM}>
          <DialogHeader><DialogTitle>Sửa loại thuế</DialogTitle></DialogHeader>
          {editItem && <TaxTypeForm editItem={editItem} onDone={() => setEditItem(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}
