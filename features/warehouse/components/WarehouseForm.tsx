'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { createWarehouse, updateWarehouse } from '../actions'
import { FORM_GRID, FORM_COL_FULL } from '@/lib/ui-tokens'

interface Company { id: string; code: string; name: string }

interface Props {
  initial?: { id?: string; company_id?: string; code?: string; name?: string; note?: string | null; is_active?: boolean; is_default?: boolean }
  onDone: () => void
}

export function WarehouseForm({ initial, onDone }: Props) {
  const router = useRouter()
  const [companies, setCompanies] = useState<Company[]>([])
  const [companyId, setCompanyId] = useState(initial?.company_id ?? '')
  const [code, setCode] = useState(initial?.code ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [isActive, setIsActive] = useState(initial?.is_active ?? true)
  const [isDefault, setIsDefault] = useState(initial?.is_default ?? false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const sel = 'w-full h-9 rounded-lg border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50'

  useEffect(() => {
    const sb = createClient()
    sb.from('companies').select('id, code, name').order('code').then(({ data }) => {
      if (data) setCompanies(data as Company[])
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const payload = { company_id: companyId, code, name, note: note || null, is_active: isActive, is_default: isDefault }
      const result = initial?.id
        ? await updateWarehouse(initial.id, payload)
        : await createWarehouse(payload)
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
        <div className={`${FORM_COL_FULL} space-y-1`}>
          <Label>Công ty</Label>
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} required className={sel}>
            <option value="">Chọn công ty</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label>Mã kho</Label>
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="KHO-HN" required />
        </div>
        <div className="space-y-1">
          <Label>Tên kho</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Kho Hà Nội" required />
        </div>
        <div className={`${FORM_COL_FULL} space-y-1`}>
          <Label>Ghi chú</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Tùy chọn" />
        </div>
        <div className={`${FORM_COL_FULL} flex items-center gap-2`}>
          <input id="wh-active" type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4" />
          <Label htmlFor="wh-active" className="cursor-pointer">Đang hoạt động <span className="text-xs text-gray-400 font-normal">(bỏ tích để dừng kho — không hiện khi nhập/xuất)</span></Label>
        </div>
        <div className={`${FORM_COL_FULL} flex items-center gap-2`}>
          <input id="wh-default" type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="h-4 w-4" />
          <Label htmlFor="wh-default" className="cursor-pointer">Kho chính <span className="text-xs text-gray-400 font-normal">(tự dùng khi tạo đơn bán/mua không chọn kho — mỗi công ty 1 kho chính)</span></Label>
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
