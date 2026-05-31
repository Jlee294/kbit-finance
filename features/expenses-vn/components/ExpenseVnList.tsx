'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatVND } from '@/lib/format'
import { ExpenseVnForm } from './ExpenseVnForm'
import { ReceivableCollectDialog } from './ReceivableCollectDialog'
import type { ExpenseVnRow, ReceivableRow } from '../queries'

const STATUS_LABEL: Record<string, string> = {
  draft:     'Nháp',
  confirmed: 'Xác nhận',
  approved:  'Đã duyệt',
  void:      'Hủy',
}
const STATUS_COLOR: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-600',
  confirmed: 'bg-blue-100 text-blue-700',
  approved:  'bg-green-100 text-green-700',
  void:      'bg-red-100 text-red-600',
}

type SimpleOption  = { id: string; name: string }
type BankOption    = { id: string; name: string; currency: string; company_id: string }
type ProjectOption = { id: string; code: string; name: string; company_id: string }
type SupplierOption = { id: string; code: string; name: string }

interface OutstandingReceivable {
  id: string
  person: string
  amount: number
  collected_amount: number
  status: string
  expense_transactions: {
    id: string
    txn_date: string
    note: string | null
    company_id: string
    companies: { name: string } | null
  } | null
}

interface Props {
  expenses:     ExpenseVnRow[]
  receivables:  OutstandingReceivable[]
  companyExpenseTotal: number
  outstandingTotal: number
  canWrite:     boolean
  companies:    SimpleOption[]
  bankAccounts: BankOption[]
  projects:     ProjectOption[]
  suppliers:    SupplierOption[]
}

export function ExpenseVnList({
  expenses,
  receivables,
  companyExpenseTotal,
  outstandingTotal,
  canWrite,
  companies,
  bankAccounts,
  projects,
  suppliers,
}: Props) {
  const [addOpen, setAddOpen]         = useState(false)
  const [collectTarget, setCollectTarget] = useState<OutstandingReceivable | null>(null)

  return (
    <div className="space-y-6">

      {/* ── Summary Cards ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500 mb-1">Chi phí công ty (VN, confirmed+)</p>
          <p className="text-2xl font-bold text-red-600">{formatVND(companyExpenseTotal)}</p>
          <p className="text-xs text-gray-400 mt-1">Không bao gồm chi hộ</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500 mb-1">Chi hộ chưa thu lại</p>
          <p className="text-2xl font-bold text-amber-600">{formatVND(outstandingTotal)}</p>
          <p className="text-xs text-gray-400 mt-1">{receivables.length} khoản đang outstanding</p>
        </div>
      </div>

      {/* ── Header row ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Phiếu chi VN ({expenses.length})</h2>
        {canWrite && (
          <Button onClick={() => setAddOpen(true)}>+ Thêm phiếu chi</Button>
        )}
      </div>

      {/* ── Add Dialog ──────────────────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent showCloseButton={false} className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tạo phiếu chi VN</DialogTitle>
          </DialogHeader>
          <ExpenseVnForm
            companies={companies}
            bankAccounts={bankAccounts}
            projects={projects}
            suppliers={suppliers}
            onDone={() => setAddOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* ── Expense table ───────────────────────────────────────────── */}
      {expenses.length === 0 ? (
        <div className="rounded-lg border bg-white p-10 text-center text-gray-400">
          Chưa có phiếu chi nào
        </div>
      ) : (
        <div className="rounded-xl border bg-white overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
                <th className="px-4 py-3 text-left">Ngày</th>
                <th className="px-4 py-3 text-left">Ghi chú</th>
                <th className="px-4 py-3 text-left">Công ty</th>
                <th className="px-4 py-3 text-left">TK Chi</th>
                <th className="px-4 py-3 text-left">Loại</th>
                <th className="px-4 py-3 text-right">Số tiền</th>
                <th className="px-4 py-3 text-center">VAT</th>
                <th className="px-4 py-3 text-center">Chi hộ</th>
                <th className="px-4 py-3 text-center">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {expenses.map((exp) => (
                <tr key={exp.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{exp.txn_date}</td>
                  <td className="px-4 py-3 text-gray-600 max-w-[220px]">
                    <span className="line-clamp-1">{exp.note || <span className="text-gray-300">—</span>}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {(exp.companies as { name: string } | null)?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {(exp.bank_accounts as { name: string; currency: string } | null)?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {exp.expense_category ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">
                    {formatVND(exp.amount_vnd)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {exp.has_vat ? (
                      <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                        {formatVND(exp.vat_amount)}
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {exp.is_chi_ho ? (
                      <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">
                        {exp.chi_ho_person}
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[exp.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {STATUS_LABEL[exp.status] ?? exp.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Outstanding chi hộ table ─────────────────────────────────── */}
      {receivables.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Chi hộ chưa thu lại ({receivables.length})</h2>
          <div className="rounded-xl border bg-white overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-amber-50 text-amber-800 text-xs uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Người</th>
                  <th className="px-4 py-3 text-left">Ngày chi</th>
                  <th className="px-4 py-3 text-left">Mô tả</th>
                  <th className="px-4 py-3 text-right">Tổng</th>
                  <th className="px-4 py-3 text-right">Đã thu</th>
                  <th className="px-4 py-3 text-right">Còn lại</th>
                  {canWrite && <th className="px-4 py-3 text-center">Thao tác</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {receivables.map((r) => {
                  const remaining = r.amount - r.collected_amount
                  return (
                    <tr key={r.id} className="hover:bg-amber-50/30 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900">{r.person}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {r.expense_transactions?.txn_date ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500 max-w-[200px]">
                        <span className="line-clamp-1">{r.expense_transactions?.note ?? '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">{formatVND(r.amount)}</td>
                      <td className="px-4 py-3 text-right text-green-700">
                        {r.collected_amount > 0 ? formatVND(r.collected_amount) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-amber-700">{formatVND(remaining)}</td>
                      {canWrite && (
                        <td className="px-4 py-3 text-center">
                          <Button size="sm" variant="outline"
                            onClick={() => setCollectTarget(r)}>
                            Thu lại
                          </Button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Collect Dialog ─────────────────────────────────────────── */}
      {collectTarget && (
        <ReceivableCollectDialog
          receivable={{
            id:               collectTarget.id,
            person:           collectTarget.person,
            amount:           collectTarget.amount,
            collected_amount: collectTarget.collected_amount,
            expense_txn_date: collectTarget.expense_transactions?.txn_date,
            expense_note:     collectTarget.expense_transactions?.note,
          }}
          open={!!collectTarget}
          onOpenChange={(open) => { if (!open) setCollectTarget(null) }}
        />
      )}
    </div>
  )
}
