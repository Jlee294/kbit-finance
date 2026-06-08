'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createTaxType, updateTaxType } from '../actions'
import type { TaxType } from '../queries'

interface Props {
  editItem?: TaxType
  onDone?: () => void
}

export function TaxTypeForm({ editItem, onDone }: Props) {
  const router = useRouter()
  const [code, setCode] = useState(editItem?.code ?? '')
  const [name, setName] = useState(editItem?.name ?? '')
  const [sortOrder, setSortOrder] = useState(String(editItem?.sort_order ?? 0))
  const [isActive, setIsActive] = useState(editItem?.is_active ?? true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const payload = { code, name, sort_order: parseInt(sortOrder) || 0, is_active: isActive }
      if (editItem) await updateTaxType(editItem.id, payload)
      else await createTaxType(payload)
      router.refresh()
      onDone?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <Label>Mã loại thuế <span className="text-red-500">*</span></Label>
        <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="VD: GTGT, TNDN, TNCN..." required disabled={!!editItem} className={editItem ? 'opacity-60 cursor-not-allowed' : ''} />
        <p className="text-xs text-gray-400">{editItem ? 'Không đổi mã loại thuế đang dùng (giữ nhãn cho dữ liệu cũ). Cần đổi thì sửa ô Tên hoặc ẩn rồi tạo mã mới.' : 'Tự động chữ HOA. Ví dụ: GTGT'}</p>
      </div>
      <div className="space-y-1">
        <Label>Tên loại thuế <span className="text-red-500">*</span></Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Thuế GTGT" required />
      </div>
      <div className="space-y-1">
        <Label>Thứ tự hiển thị</Label>
        <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} placeholder="0" />
        <p className="text-xs text-gray-400">Số nhỏ hiện trước trong danh sách chọn.</p>
      </div>
      <div className="flex items-center gap-2">
        <input id="tt-active" type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4" />
        <Label htmlFor="tt-active" className="cursor-pointer">Đang sử dụng <span className="text-xs text-gray-400 font-normal">(bỏ tích để ẩn — không hiện khi tạo lịch/kế hoạch thuế, dữ liệu cũ giữ nguyên)</span></Label>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => onDone?.()} disabled={saving}>Hủy</Button>
        <Button type="submit" disabled={saving}>{saving ? 'Đang lưu...' : editItem ? 'Cập nhật' : 'Thêm mới'}</Button>
      </div>
    </form>
  )
}
