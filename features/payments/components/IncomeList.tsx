'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatVND, formatDate } from '@/lib/format'
import { IncomeForm } from './IncomeForm'
import type { IncomeRow, BankBalance } from '../queries'

type SimpleOption   = { id: string; name: string }
type CustomerOption = { id: string; code: string; name: string }
type BankOption     = { id: string; name: string; currency: string; company_id: string }
type ProjectOption  = { id: string; code: string; name: string; company_id: string }

const STATUS_LABEL: Record<string, string> = {
  draft:     'Nháp',
  confirmed: 'Đã xác nhận',
  approved:  'Đã duyệt',
  void:      'Huỷ',
}

const STATUS_COLOR: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-600',
  confirmed: 'bg-blue-100 text-blue-700',
  approved:  'bg-green-100 text-green-700',
  void:      'bg-red-100 text-red-600',
}

interface Props {
  incomes:     IncomeRow[]
  balances:    BankBalance[]
  canWrite:    boolean
  companies:   SimpleOption[]
  customers:   CustomerOption[]
  bankAccounts: BankOption[]
  projects:    ProjectOption[]
}

export function IncomeList({
  incomes, balances, canWrite,
  companies, customers, bankAccounts, projects,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  return (
    <div className="space-y-6">

      {/* ─ Số dư ngân hàng ─────────────────────────────────────────── */}
      {balances.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
            Số dư tài khoản ngân hàng
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {balances.map((b) => (
              <div key={b.bank_account_id} className="rounded-xl border bg-white px-4 py-3">
                <p className="text-xs text-gray-500 truncate">{b.name}</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">
                  {formatVND(b.balance)}
                </p>
                <p className="text-xs text-gray-400">{b.currency}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─ Header + nút thêm ───────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Phiếu thu</h1>
          <p className="text-sm text-gray-500 mt-0.5">{incomes.length.toLocaleString('vi-VN')} phiếu</p>
        </div>
        {canWrite && (
          <Button onClick={() => setOpen(true)}>+ Thêm phiếu thu</Button>
        )}
      </div>

      {/* ─ Bảng phiếu thu ──────────────────────────────────────────── */}
      {incomes.length === 0 ? (
        <div className="rounded-xl border bg-white px-6 py-12 text-center text-gray-400">
          Chưa có phiếu thu nào
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Ngày</th>
                <th className="px-4 py-3 text-left">Khách hàng</th>
                <th className="px-4 py-3 text-left">Tài khoản</th>
                <th className="px-4 py-3 text-right">Số tiền</th>
                <th className="px-4 py-3 text-center">Trạng thái</th>
                <th className="px-4 py-3 text-left">Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {incomes.map((inc) => (
                <tr key={inc.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                    {formatDate(inc.txn_date)}
                  </td>
                  <td className="px-4 py-3 text-gray-900">
                    {inc.customers?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">
                    {inc.bank_accounts?.name ?? '—'}
                    {inc.bank_accounts?.currency && (
                      <span className="ml-1 text-gray-400">({inc.bank_accounts.currency})</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">
                    {formatVND(Number(inc.amount))}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1.5 flex-wrap">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR[inc.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {STATUS_LABEL[inc.status] ?? inc.status}
                      </span>
                      {inc.is_unassigned && (
                        <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-700">
                          Tiền cọc
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs max-w-[180px] truncate">
                    {inc.note ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ─ Dialog thêm phiếu thu ───────────────────────────────────── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false} className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Thêm phiếu thu</DialogTitle>
          </DialogHeader>
          <IncomeForm
            companies={companies}
            customers={customers}
            bankAccounts={bankAccounts}
            projects={projects}
            onDone={() => { setOpen(false); router.refresh() }}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
