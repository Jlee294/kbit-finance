'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createDocumentType, updateDocumentType } from '../actions'
import type { DocumentType } from '../queries'

interface Props {
  editItem?: DocumentType
  onDone?: () => void
}

export function DocumentTypeForm({ editItem, onDone }: Props) {
  const router = useRouter()
  const [code, setCode] = useState(editItem?.code ?? '')
  const [name, setName] = useState(editItem?.name ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      if (editItem) {
        await updateDocumentType(editItem.id, { code, name })
      } else {
        await createDocumentType({ code, name })
      }
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
        <Label>Mã loại chứng từ <span className="text-red-500">*</span></Label>
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="VD: VAT_INVOICE, BANK_SLIP, CUSTOMS_DECL..."
          required
        />
        <p className="text-xs text-gray-400">Tự động chuyển chữ HOA. Ví dụ: VAT_INVOICE</p>
      </div>
      <div className="space-y-1">
        <Label>Tên loại chứng từ <span className="text-red-500">*</span></Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="VD: Hóa đơn VAT, Ủy nhiệm chi..."
          required
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => onDone?.()} disabled={saving}>
          Hủy
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? 'Đang lưu...' : editItem ? 'Cập nhật' : 'Thêm mới'}
        </Button>
      </div>
    </form>
  )
}
