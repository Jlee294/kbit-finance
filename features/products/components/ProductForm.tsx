'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createProduct, updateProduct } from '../actions'

interface Props {
  initial?: { id?: string; code?: string; name?: string; unit?: string }
  onDone: () => void
}

export function ProductForm({ initial, onDone }: Props) {
  const router = useRouter()
  const [code, setCode] = useState(initial?.code ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [unit, setUnit] = useState(initial?.unit ?? 'cái')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const payload = { code, name, unit }
      if (initial?.id) {
        await updateProduct(initial.id, payload)
      } else {
        await createProduct(payload)
      }
      router.refresh()
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Mã sản phẩm</Label>
          <Input value={code} onChange={(e) => setCode(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label>Đơn vị</Label>
          <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="cái / hộp / kg" required />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Tên sản phẩm</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>Hủy</Button>
        <Button type="submit" disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu'}</Button>
      </div>
    </form>
  )
}
