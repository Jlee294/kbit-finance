'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { createProject, updateProject } from '../actions'
import { FORM_GRID, FORM_COL_FULL } from '@/lib/ui-tokens'

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

  const sel = 'w-full h-9 rounded-lg border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50'

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
      <div className={FORM_GRID}>
        <div className={`space-y-1 ${FORM_COL_FULL}`}>
          <Label>Công ty</Label>
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} required className={sel}>
            <option value="">Chọn công ty</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label>Mã dự án</Label>
          <Input value={code} onChange={(e) => setCode(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label>Tên dự án</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
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
