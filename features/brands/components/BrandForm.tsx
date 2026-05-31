'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createBrand, updateBrand } from '../actions'

interface Props {
  initial?: { id?: string; code?: string; name?: string; sort_order?: number }
  onDone:  () => void
}

export function BrandForm({ initial, onDone }: Props) {
  const router     = useRouter()
  const [code,  setCode]  = useState(initial?.code  ?? '')
  const [name,  setName]  = useState(initial?.name  ?? '')
  const [order, setOrder] = useState(String(initial?.sort_order ?? 0))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    const payload = { code, name, sort_order: parseInt(order) || 0 }
    const result = initial?.id
      ? await updateBrand(initial.id, payload)
      : await createBrand(payload)
    if (result?.error) { setError(result.error); setSaving(false); return }
    router.refresh(); onDone()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Mã brand <span className="text-red-500">*</span></Label>
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="VD: SOME" required />
        </div>
        <div className="space-y-1">
          <Label>Thứ tự hiển thị</Label>
          <Input type="number" min="0" value={order} onChange={(e) => setOrder(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Tên brand <span className="text-red-500">*</span></Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Some Brand" required />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>Hủy</Button>
        <Button type="submit" disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu'}</Button>
      </div>
    </form>
  )
}
