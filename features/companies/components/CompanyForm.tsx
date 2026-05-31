'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createCompany, updateCompany } from '../actions'

interface Props {
  initial?: { id?: string; code?: string; name?: string; country?: string; base_currency?: string }
  onDone: () => void
}

export function CompanyForm({ initial, onDone }: Props) {
  const router = useRouter()
  const [code, setCode] = useState(initial?.code ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [country, setCountry] = useState<'VN' | 'KR'>((initial?.country as 'VN' | 'KR') ?? 'VN')
  const [currency, setCurrency] = useState<'VND' | 'KRW'>((initial?.base_currency as 'VND' | 'KRW') ?? 'VND')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const payload = { code, name, country, base_currency: currency }
      const result = initial?.id
        ? await updateCompany(initial.id, payload)
        : await createCompany(payload)
      if (result?.error) {
        setError(result.error)
        return
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
      <div className="space-y-1">
        <Label>Mã công ty</Label>
        <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="KBIT" required />
      </div>
      <div className="space-y-1">
        <Label>Tên công ty</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="KBIT Holdings" required />
      </div>
      <div className="grid grid-cols-2 gap-4">
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
          <Label>Tiền tệ gốc</Label>
          <Select value={currency} onValueChange={(v) => setCurrency(v as 'VND' | 'KRW')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="VND">VNĐ</SelectItem>
              <SelectItem value="KRW">KRW</SelectItem>
            </SelectContent>
          </Select>
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
