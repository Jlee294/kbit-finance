'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createSupplier, updateSupplier } from '../actions'

interface Props {
  initial?: { id?: string; code?: string; name?: string; country?: string; phone?: string | null; note?: string | null }
  onDone: () => void
}

export function SupplierForm({ initial, onDone }: Props) {
  const router = useRouter()
  const [code, setCode] = useState(initial?.code ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [country, setCountry] = useState<'VN' | 'KR'>((initial?.country as 'VN' | 'KR') ?? 'VN')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const payload = { code, name, country, phone: phone || null, note: note || null }
      if (initial?.id) {
        await updateSupplier(initial.id, payload)
      } else {
        await createSupplier(payload)
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
          <Label>Mã NCC</Label>
          <Input value={code} onChange={(e) => setCode(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label>Tên nhà cung cấp</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Quốc gia</Label>
        <Select value={country} onValueChange={(v) => setCountry(v as 'VN' | 'KR')}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="VN">Việt Nam</SelectItem>
            <SelectItem value="KR">Hàn Quốc</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>Điện thoại</Label>
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Ghi chú</Label>
        <Input value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>Hủy</Button>
        <Button type="submit" disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu'}</Button>
      </div>
    </form>
  )
}
