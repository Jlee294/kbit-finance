'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createCompany, updateCompany } from '../actions'
import { FORM_GRID } from '@/lib/ui-tokens'

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

  const sel = 'w-full h-9 rounded-lg border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50'

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
      <div className={FORM_GRID}>
        <div className="space-y-1">
          <Label>Mã công ty</Label>
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="KBIT" required />
        </div>
        <div className="space-y-1">
          <Label>Tên công ty</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="KBIT Holdings" required />
        </div>
        <div className="space-y-1">
          <Label>Quốc gia</Label>
          <select value={country} onChange={(e) => setCountry(e.target.value as 'VN' | 'KR')} className={sel}>
            <option value="VN">Việt Nam</option>
            <option value="KR">Hàn Quốc</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label>Tiền tệ gốc</Label>
          <select value={currency} onChange={(e) => setCurrency(e.target.value as 'VND' | 'KRW')} className={sel}>
            <option value="VND">VNĐ</option>
            <option value="KRW">KRW</option>
          </select>
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
