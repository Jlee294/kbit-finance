'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { upsertBankOpening } from '../actions'
import { bankOpeningSchema, demoBankOpeningSchema } from '../schema'
import { canEnterBankOpening } from '../demo-opening'
import type { BankAccountOption, BankAccountSummary } from '../queries'

function fmtAmount(value: number, currency: string) {
  if (currency === 'KRW') return `${value.toLocaleString('ko-KR')} ₩`
  if (currency === 'USD') return `$${value.toLocaleString('en-US')}`
  return `${value.toLocaleString('vi-VN')} đ`
}

export function BankOpeningBalances({
  summaries,
  accounts,
  selectedCompanyId,
  selectedBankAccountId,
  year,
  canWrite,
  demoMode,
}: {
  summaries: BankAccountSummary[]
  accounts: BankAccountOption[]
  selectedCompanyId: string
  selectedBankAccountId: string
  year: number
  canWrite: boolean
  demoMode: boolean
}) {
  const availableAccounts = useMemo(
    () => accounts.filter((account) =>
      (!selectedCompanyId || account.company_id === selectedCompanyId)
      && (!selectedBankAccountId || account.id === selectedBankAccountId)),
    [accounts, selectedBankAccountId, selectedCompanyId],
  )
  const [bankAccountId, setBankAccountId] = useState(availableAccounts[0]?.id ?? '')
  const [amount, setAmount] = useState('0')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const editable = canEnterBankOpening({ canWrite, demoMode })

  useEffect(() => {
    if (!availableAccounts.some((account) => account.id === bankAccountId)) {
      setBankAccountId(availableAccounts[0]?.id ?? '')
    }
  }, [availableAccounts, bankAccountId])

  useEffect(() => {
    const current = summaries.find((summary) => summary.bankAccountId === bankAccountId)
    setAmount(String(current?.declaredOpening ?? 0))
  }, [bankAccountId, summaries])

  async function saveOpening(event: React.FormEvent) {
    event.preventDefault()
    const account = availableAccounts.find((item) => item.id === bankAccountId)
    if (!account) return
    setSaving(true)
    setError('')
    setMessage('')
    const candidate = {
      company_id: account.company_id,
      bank_account_id: account.id,
      year,
      amount: Number(amount),
      note: note || null,
    }

    const parsed = demoMode
      ? demoBankOpeningSchema.safeParse(candidate)
      : bankOpeningSchema.safeParse(candidate)
    if (!parsed.success) {
      setSaving(false)
      setError(parsed.error.issues[0]?.message ?? 'Số dư đầu kỳ không hợp lệ.')
      return
    }

    const result = await upsertBankOpening(parsed.data)
    setSaving(false)
    if (!result.ok) {
      setError(result.error ?? 'Không lưu được số dư đầu kỳ.')
      return
    }
    setMessage(demoMode
      ? 'Đã lưu số dư đầu kỳ trên bản local.'
      : 'Đã lưu số dư đầu kỳ ngân hàng.')
    window.location.reload()
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-800">Số dư đầu kỳ ngân hàng</h2>
        <p className="mt-1 text-xs text-gray-500">
          Khai một lần cho từng tài khoản tại ngày 01/01/{year}. Số dư cuối kỳ được tự tính bằng đầu kỳ + tiền vào − tiền ra.
        </p>
      </div>

      {summaries.length === 0 ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Chưa có tài khoản ngân hàng phù hợp với công ty và bộ lọc đang chọn.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-100">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 text-left">Tài khoản</th>
                <th className="px-3 py-2 text-left">Công ty</th>
                <th className="px-3 py-2 text-right">Khai đầu năm</th>
                <th className="px-3 py-2 text-right">Đầu khoảng lọc</th>
                <th className="px-3 py-2 text-right">Tiền vào</th>
                <th className="px-3 py-2 text-right">Tiền ra</th>
                <th className="px-3 py-2 text-right">Cuối khoảng lọc</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {summaries.map((summary) => (
                <tr key={summary.bankAccountId}>
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-800">{summary.bankAccountName}</div>
                    <div className="text-xs text-gray-400">
                      {summary.accountNo || 'Chưa có số tài khoản'} · {summary.currency}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">{summary.companyName || '—'}</td>
                  <td className="px-3 py-2 text-right">{fmtAmount(summary.declaredOpening, summary.currency)}</td>
                  <td className="px-3 py-2 text-right">{fmtAmount(summary.opening, summary.currency)}</td>
                  <td className="px-3 py-2 text-right text-emerald-700">{fmtAmount(summary.receipts, summary.currency)}</td>
                  <td className="px-3 py-2 text-right text-red-600">{fmtAmount(summary.payments, summary.currency)}</td>
                  <td className="px-3 py-2 text-right font-semibold text-gray-900">{fmtAmount(summary.closing, summary.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editable ? (
        availableAccounts.length > 0 && (
          <form onSubmit={saveOpening} className="grid gap-3 rounded-lg border border-brand-100 bg-brand-50 p-3 lg:grid-cols-[2fr_1fr_2fr_auto] lg:items-end">
            <div className="space-y-1">
              <Label htmlFor="bank-opening-account">Tài khoản ngân hàng</Label>
              <select
                id="bank-opening-account"
                value={bankAccountId}
                onChange={(event) => setBankAccountId(event.target.value)}
                className="h-9 w-full rounded-md border border-input bg-white px-3 text-sm"
                required
              >
                {availableAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} · {account.account_no || 'chưa có STK'} · {account.currency}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="bank-opening-amount">Số dư 01/01/{year}</Label>
              <Input
                id="bank-opening-amount"
                type="number"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="bank-opening-note">Ghi chú</Label>
              <Input
                id="bank-opening-note"
                value={note}
                maxLength={500}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Ví dụ: Theo SPNH ngày 01/01"
              />
            </div>
            <Button type="submit" disabled={saving || !bankAccountId}>
              {saving ? 'Đang lưu...' : 'Lưu đầu kỳ'}
            </Button>
          </form>
        )
      ) : (
        <p className="text-xs text-gray-400">
          Chế độ hiện tại chỉ xem. Admin hoặc kế toán có quyền sửa sẽ thấy biểu mẫu khai báo tại đây.
        </p>
      )}

      {message && <p className="text-sm text-emerald-700">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  )
}
