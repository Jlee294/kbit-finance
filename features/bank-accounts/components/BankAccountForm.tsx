'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { createBankAccount, updateBankAccount } from '../actions'
import { FORM_GRID, FORM_COL_FULL } from '@/lib/ui-tokens'

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
        <div className={`space-y-1 ${FORM_COL_FULL}`}>
          <Label>Tên tài khoản</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="KBIT - Vietcombank VNĐ" required />
        </div>
        <div className="space-y-1">
          <Label>Loại tiền</Label>
          <select value={currency} onChange={(e) => setCurrency(e.target.value as 'VND' | 'KRW')} className={sel}>
            <option value="VND">VNĐ</option>
            <option value="KRW">KRW</option>
          </select>
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
