'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createManufacturer, updateManufacturer } from '../actions'
import { FORM_GRID, FORM_COL_FULL } from '@/lib/ui-tokens'

interface Props {
  initial?: { id?: string; code?: string; name?: string; country?: string; phone?: string | null; email?: string | null; address?: string | null; note?: string | null; is_active?: boolean }
  onDone: () => void
}

export function ManufacturerForm({ initial, onDone }: Props) {
  const router = useRouter()
  const [code, setCode] = useState(initial?.code ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [country, setCountry] = useState(initial?.country ?? 'KR')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [email, setEmail] = useState(initial?.email ?? '')
  const [address, setAddress] = useState(initial?.address ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [isActive, setIsActive] = useState(initial?.is_active ?? true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    const payload = { code, name, country, phone: phone || null, email: email || null, address: address || null, note: note || null, is_active: isActive }
    const result = initial?.id
      ? await updateManufacturer(initial.id, payload)
      : await createManufacturer(payload)
    setSaving(false)
    if (result?.error) { setError(result.error); return }
    router.refresh(); onDone()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className={FORM_GRID}>
        <div className="space-y-1">
          <Label>Mã nhà máy</Label>
          <Input value={code} onChange={e => setCode(e.target.value)} placeholder="COSMAX" required />
        </div>
        <div className="space-y-1">
          <Label>Tên nhà máy</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Cosmax Co., Ltd." required />
        </div>
        <div className="space-y-1">
          <Label>Quốc gia</Label>
          <select value={country} onChange={e => setCountry(e.target.value)}
            className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40">
            <option value="KR">Hàn Quốc</option>
            <option value="VN">Việt Nam</option>
            <option value="CN">Trung Quốc</option>
            <option value="JP">Nhật Bản</option>
            <option value="US">Mỹ</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label>Điện thoại</Label>
          <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+82-..." />
        </div>
        <div className="space-y-1">
          <Label>Email</Label>
          <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="contact@factory.com" />
        </div>
        <div className="space-y-1">
          <Label>Địa chỉ</Label>
          <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="Seoul, Korea" />
        </div>
        <div className={`${FORM_COL_FULL} space-y-1`}>
          <Label>Ghi chú</Label>
          <Input value={note} onChange={e => setNote(e.target.value)} placeholder="Chuyên sản xuất mỹ phẩm OEM/ODM..." />
        </div>
        <div className={`${FORM_COL_FULL} flex items-center gap-2`}>
          <input id="mfr-active" type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} className="h-4 w-4" />
          <Label htmlFor="mfr-active" className="cursor-pointer">Đang hoạt động</Label>
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>Hủy</Button>
        <Button type="submit" disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu'}</Button>
      </div>
    </form>
  )
}
