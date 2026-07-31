'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createAccountingCategory } from '../actions'
import type { AccountingCategory, AccountingTreatment } from '../queries'

const LABELS: Record<AccountingTreatment, string> = {
  inventory: 'Hàng tồn kho',
  expense: 'Chi phí trong kỳ',
  prepaid: 'Chi phí trả trước',
  tool: 'Công cụ dụng cụ',
  fixed_asset: 'Tài sản cố định',
  tax_fee: 'Thuế, phí',
  pass_through: 'Thu hộ / chi hộ',
  contract_penalty: 'Phạt hợp đồng',
  other: 'Khác',
}

export function AccountingCategoryCatalog({
  rows,
  companies,
  canWrite,
}: {
  rows: AccountingCategory[]
  companies: { id: string; name: string }[]
  canWrite: boolean
}) {
  const router = useRouter()
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? '')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [treatment, setTreatment] = useState<AccountingTreatment>('expense')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const result = await createAccountingCategory({ company_id: companyId, code, name, treatment })
    setSaving(false)
    if (result.error) return setError(result.error)
    setCode('')
    setName('')
    router.refresh()
  }

  return (
    <div className="space-y-4">
      {canWrite && (
        <form onSubmit={submit} className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-5 md:items-end">
            <div className="space-y-1">
              <Label>Công ty</Label>
              <select required value={companyId} onChange={(e) => setCompanyId(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
                <option value="">— Chọn —</option>
                {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Mã</Label>
              <Input required value={code} onChange={(e) => setCode(e.target.value)} placeholder="VD: PHI_SÀN" />
            </div>
            <div className="space-y-1">
              <Label>Tên phân loại</Label>
              <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Phí sàn TMĐT" />
            </div>
            <div className="space-y-1">
              <Label>Cách xử lý</Label>
              <select value={treatment} onChange={(e) => setTreatment(e.target.value as AccountingTreatment)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
                {Object.entries(LABELS).filter(([value]) => value !== 'inventory').map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={saving}>{saving ? 'Đang lưu...' : '+ Tạo phân loại'}</Button>
          </div>
          {error && <p className="mt-2 text-sm text-danger-700">{error}</p>}
        </form>
      )}

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">Mã</th>
              <th className="px-4 py-3 text-left">Tên</th>
              <th className="px-4 py-3 text-left">Cách xử lý</th>
              <th className="px-4 py-3 text-left">Phạm vi</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-3 font-mono">{row.code}</td>
                <td className="px-4 py-3">{row.name}</td>
                <td className="px-4 py-3">{LABELS[row.treatment]}</td>
                <td className="px-4 py-3 text-gray-500">{row.company_id ? 'Riêng công ty' : 'Mặc định hệ thống'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
