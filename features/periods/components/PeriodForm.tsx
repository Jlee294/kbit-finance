'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { createPeriod } from '../actions'

interface Company { id: string; code: string; name: string }

interface Props {
  initial?: { id?: string }
  onDone: () => void
}

export function PeriodForm({ onDone }: Props) {
  const router = useRouter()
  const [companies, setCompanies] = useState<Company[]>([])
  const [companyId, setCompanyId] = useState('')
  const [period, setPeriod] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const sb = createClient()
    sb.from('companies').select('id, code, name').order('code').then(({ data }) => {
      if (data) setCompanies(data)
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await createPeriod({ company_id: companyId, period })
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
        <Label>Công ty</Label>
        <Select value={companyId} onValueChange={(v) => setCompanyId(v ?? '')} required>
          <SelectTrigger><SelectValue placeholder="Chọn công ty" /></SelectTrigger>
          <SelectContent>
            {companies.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.code} — {c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>Kỳ (YYYY-MM)</Label>
        <Input
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          placeholder="2026-05"
          pattern="\d{4}-\d{2}"
          required
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>Hủy</Button>
        <Button type="submit" disabled={saving}>{saving ? 'Đang lưu...' : 'Tạo kỳ'}</Button>
      </div>
    </form>
  )
}
