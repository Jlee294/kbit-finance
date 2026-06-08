'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { quickCreateProduct, quickUpdateProduct, type QuickProductOption } from '../actions'

interface Props {
  /** Khi sửa: truyền mã hàng hiện có (có id). Khi thêm mới: bỏ trống. */
  initial?: { id?: string; code?: string; name?: string; unit?: string }
  onDone: () => void
  /** Khi tạo mới xong (dùng cho tạo inline trong form đơn) — nhận mã hàng vừa tạo. */
  onCreated?: (product: QuickProductOption) => void
}

export function QuickProductForm({ initial, onDone, onCreated }: Props) {
  const [code, setCode] = useState(initial?.code ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [unit, setUnit] = useState(initial?.unit ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      if (initial?.id) {
        const r = await quickUpdateProduct(initial.id, { code, name, unit })
        if (r.error) { setError(r.error); return }
      } else {
        const r = await quickCreateProduct({ code, name, unit })
        if (r.error) { setError(r.error); return }
        if (r.product) onCreated?.(r.product)
      }
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <Label>Mã hàng <span className="text-red-500">*</span></Label>
        <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="VD: SP001" required />
      </div>
      <div className="space-y-1">
        <Label>Tên hàng <span className="text-red-500">*</span></Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên hàng hóa" required />
      </div>
      <div className="space-y-1">
        <Label>Đơn vị tính <span className="text-red-500">*</span></Label>
        <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="cái / hộp / kg" required />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone} disabled={busy}>Hủy</Button>
        <Button type="submit" disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu'}</Button>
      </div>
    </form>
  )
}
