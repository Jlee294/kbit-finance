'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { createBankAccount, updateBankAccount } from '../actions'

interface Company { id: string; code: string; name: string }

interface Props {
  initial?: { id?: string; company_id?: string; name?: string; currency?: string; account_no?: string | null }
  onDone: () => void
}

export function BankAccountForm({ initial, onDone }: Props) {
  const router = useRouter()
  const [companies, setCompanies] = useState<Company[]>([])
  const [companyId, setCompanyId] = useState(initial?.company_id ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [currency, setCurrency] = useState<'VND' | 'KRW'>((initial?.currency as 'VND' | 'KRW') ?? 'VND')
  const [accountNo, setAccountNo] = useState(initial?.account_no ?? '')
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
      const payload = { company_id: companyId, name, currency, account_no: accountNo || null }
      if (initial?.id) {
        await updateBankAccount(initial.id, payload)
      } else {
        await createBankAccount(payload)
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
      <div className="space-y-1">
        <Label>Tên tài khoản</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="KBIT - Vietcombank VNĐ" required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Loại tiền</Label>
          <Select value={currency} onValueChange={(v) => setCurrency(v as 'VND' | 'KRW')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="VND">VNĐ</SelectItem>
              <SelectItem value="KRW">KRW</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Số tài khoản</Label>
          <Input value={accountNo} onChange={(e) => setAccountNo(e.target.value)} />
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
