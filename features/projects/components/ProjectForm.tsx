'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { createProject, updateProject } from '../actions'

interface Company { id: string; code: string; name: string }

interface Props {
  initial?: { id?: string; company_id?: string; code?: string; name?: string; start_date?: string | null; end_date?: string | null }
  onDone: () => void
}

export function ProjectForm({ initial, onDone }: Props) {
  const router = useRouter()
  const [companies, setCompanies] = useState<Company[]>([])
  const [companyId, setCompanyId] = useState(initial?.company_id ?? '')
  const [code, setCode] = useState(initial?.code ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [startDate, setStartDate] = useState(initial?.start_date ?? '')
  const [endDate, setEndDate] = useState(initial?.end_date ?? '')
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
      const payload = { company_id: companyId, code, name, start_date: startDate || null, end_date: endDate || null }
      if (initial?.id) {
        await updateProject(initial.id, payload)
      } else {
        await createProject(payload)
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
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Mã dự án</Label>
          <Input value={code} onChange={(e) => setCode(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label>Tên dự án</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Ngày bắt đầu</Label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Ngày kết thúc</Label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
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
