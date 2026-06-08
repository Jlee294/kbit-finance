'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createCustomer, updateCustomer } from '../actions'
import { FORM_GRID, FORM_COL_FULL } from '@/lib/ui-tokens'

interface Props {
  initial?: { id?: string; code?: string; name?: string; tax_code?: string | null; phone?: string | null; note?: string | null }
  onDone: () => void
}

export function CustomerForm({ initial, onDone }: Props) {
  const router = useRouter()
  const [code, setCode] = useState(initial?.code ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [taxCode, setTaxCode] = useState(initial?.tax_code ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const payload = { code, name, tax_code: taxCode || null, phone: phone || null, note: note || null }
      if (initial?.id) {
        await updateCustomer(initial.id, payload)
      } else {
        await createCustomer(payload)
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
          <Label>Mã KH</Label>
          <Input value={code} onChange={(e) => setCode(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label>Tên khách hàng</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label>Mã số thuế</Label>
          <Input value={taxCode} onChange={(e) => setTaxCode(e.target.value)} placeholder="VD: 0123456789" />
        </div>
        <div className="space-y-1">
          <Label>Điện thoại</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className={`space-y-1 ${FORM_COL_FULL}`}>
          <Label>Ghi chú</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
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
