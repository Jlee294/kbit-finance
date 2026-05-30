'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createExchangeRate, updateExchangeRate } from '../actions'

interface Props {
  initial?: { id?: string; currency_from?: string; currency_to?: string; rate?: number; rate_date?: string; source?: string | null }
  onDone: () => void
}

export function ExchangeRateForm({ initial, onDone }: Props) {
  const router = useRouter()
  const [from, setFrom] = useState<'VND' | 'KRW'>((initial?.currency_from as 'VND' | 'KRW') ?? 'KRW')
  const [to, setTo] = useState<'VND' | 'KRW'>((initial?.currency_to as 'VND' | 'KRW') ?? 'VND')
  const [rate, setRate] = useState(initial?.rate?.toString() ?? '')
  const [rateDate, setRateDate] = useState(initial?.rate_date ?? '')
  const [source, setSource] = useState(initial?.source ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const payload = { currency_from: from, currency_to: to, rate: parseFloat(rate), rate_date: rateDate, source: source || null }
      if (initial?.id) {
        await updateExchangeRate(initial.id, payload)
      } else {
        await createExchangeRate(payload)
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
          <Label>Từ tiền tệ</Label>
          <Select value={from} onValueChange={(v) => setFrom(v as 'VND' | 'KRW')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="KRW">KRW</SelectItem>
              <SelectItem value="VND">VND</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Sang tiền tệ</Label>
          <Select value={to} onValueChange={(v) => setTo(v as 'VND' | 'KRW')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="VND">VND</SelectItem>
              <SelectItem value="KRW">KRW</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Tỷ giá</Label>
          <Input type="number" step="0.000001" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="18.5" required />
        </div>
        <div className="space-y-1">
          <Label>Ngày áp dụng</Label>
          <Input type="date" value={rateDate} onChange={(e) => setRateDate(e.target.value)} required />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Nguồn</Label>
        <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Vietcombank / NHNN" />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>Hủy</Button>
        <Button type="submit" disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu'}</Button>
      </div>
    </form>
  )
}
