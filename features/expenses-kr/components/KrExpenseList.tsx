'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatVND, formatKRW } from '@/lib/format'
import { KrExpenseForm } from './KrExpenseForm'
import { KrSupplierPayForm } from './KrSupplierPayForm'
import { DIALOG_MD } from '@/lib/ui-tokens'
import type { KrExpenseRow, KrUnpaidOrder } from '../queries'

const STATUS_LABEL: Record<string, string> = {
  draft: 'Nháp', confirmed: 'Xác nhận', approved: 'Đã duyệt', void: 'Hủy',
}
const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600', confirmed: 'bg-brand-100 text-brand-800',
  approved: 'bg-green-100 text-green-700', void: 'bg-red-100 text-red-600',
}
const KIND_LABEL: Record<string, string> = { goods: 'Tiền hàng', service: 'Dịch vụ' }

type SimpleOption   = { id: string; name: string }
type BankOption     = { id: string; name: string; company_id: string }
type SupplierOption = { id: string; code: string; name: string }
type ProjectOption  = { id: string; code: string; name: string; company_id: string }

interface Props {
  expenses:     KrExpenseRow[]
  unpaidOrders: KrUnpaidOrder[]
  canWrite:     boolean
  companies:    SimpleOption[]
  krwBanks:     BankOption[]
  krSuppliers:  SupplierOption[]
  projects:     ProjectOption[]
}

export function KrExpenseList({
  expenses, unpaidOrders, canWrite,
  companies, krwBanks, krSuppliers, projects,
}: Props) {
  const [addOpen, setAddOpen]   = useState(false)
  const [payOpen, setPayOpen]   = useState(false)

  const totalVnd = expenses.reduce((s, e) => s + Number(e.amount_vnd), 0)
  const totalKrw = expenses.reduce((s, e) => s + Number(e.amount_krw), 0)

  return (
    <div className="space-y-6">

      {/* ── Summary ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500 mb-1">Tổng chi KR (VNĐ)</p>
          <p className="text-2xl font-bold text-red-600">{formatVND(totalVnd)}</p>
          <p className="text-xs text-gray-400 mt-1">{expenses.length} phiếu</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500 mb-1">Tổng chi KR (KRW)</p>
          <p className="text-2xl font-bold text-gray-700">{formatKRW(totalKrw)}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500 mb-1">Đơn NCC còn nợ</p>
          <p className="text-2xl font-bold text-amber-600">{unpaidOrders.length} đơn</p>
          {unpaidOrders.length > 0 && (
            <p className="text-xs text-gray-400 mt-1">
              {formatKRW(unpaidOrders.reduce((s, o) => s + Number(o.outstanding), 0))}
            </p>
          )}
        </div>
      </div>

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Chi phí Hàn Quốc ({expenses.length})</h2>
        {canWrite && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setPayOpen(true)} disabled={unpaidOrders.length === 0}>
              Trả công nợ NCC
            </Button>
            <Button onClick={() => setAddOpen(true)}>+ Thêm chi KR</Button>
          </div>
        )}
      </div>

      {/* ── Add expense dialog ───────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent showCloseButton={false} className={DIALOG_MD}>
          <DialogHeader>
            <DialogTitle>Tạo phiếu chi Hàn Quốc</DialogTitle>
          </DialogHeader>
          <KrExpenseForm
            companies={companies}
            krwBanks={krwBanks}
            krSuppliers={krSuppliers}
            projects={projects}
            onDone={() => setAddOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* ── Pay supplier dialog ─────────────────────────────────── */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent showCloseButton={false} className={DIALOG_MD}>
          <DialogHeader>
            <DialogTitle>Trả công nợ NCC ngoại tệ KRW</DialogTitle>
          </DialogHeader>
          <KrSupplierPayForm
            orders={unpaidOrders}
            krwBanks={krwBanks}
            onDone={() => setPayOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* ── Expense table ────────────────────────────────────────── */}
      {expenses.length === 0 ? (
        <div className="rounded-lg border bg-white p-10 text-center text-gray-400">
          Chưa có phiếu chi KR nào
        </div>
      ) : (
        <div className="rounded-xl border bg-white overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
                <th className="px-4 py-3 text-left">Ngày</th>
                <th className="px-4 py-3 text-left">Ghi chú</th>
                <th className="px-4 py-3 text-left">Công ty</th>
                <th className="px-4 py-3 text-left">NCC</th>
                <th className="px-4 py-3 text-left">Loại</th>
                <th className="px-4 py-3 text-right">KRW</th>
                <th className="px-4 py-3 text-right">Tỷ giá</th>
                <th className="px-4 py-3 text-right">VNĐ</th>
                <th className="px-4 py-3 text-center">VAT</th>
                <th className="px-4 py-3 text-center">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {expenses.map((exp) => (
                <tr key={exp.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap text-gray-700">{exp.txn_date}</td>
                  <td className="px-4 py-3 text-gray-600 max-w-[180px]">
                    <span className="line-clamp-1">{exp.note || <span className="text-gray-300">—</span>}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {(exp.companies as { name: string } | null)?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {(exp.suppliers as { name: string } | null)?.name ?? <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      exp.expense_kind === 'service'
                        ? 'bg-orange-50 text-orange-700'
                        : 'bg-brand-50 text-brand-800'
                    }`}>
                      {KIND_LABEL[exp.expense_kind] ?? exp.expense_kind}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">
                    {formatKRW(exp.amount_krw)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500 text-xs">
                    {exp.exchange_rate}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">
                    {formatVND(exp.amount_vnd)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {exp.has_vat
                      ? <span className="text-xs bg-brand-50 text-brand-800 px-2 py-0.5 rounded-full">VAT</span>
                      : <span className="text-gray-300">—</span>
                    }
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

      {/* ── Unpaid supplier orders ───────────────────────────────── */}
      {unpaidOrders.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Đơn NCC KRW còn nợ ({unpaidOrders.length})</h2>
          <div className="rounded-xl border bg-white overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-amber-50 text-amber-800 text-xs uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Mã đơn</th>
                  <th className="px-4 py-3 text-left">NCC</th>
                  <th className="px-4 py-3 text-left">Ngày đặt</th>
                  <th className="px-4 py-3 text-right">Đã trả (KRW)</th>
                  <th className="px-4 py-3 text-right">Còn nợ (KRW)</th>
                  <th className="px-4 py-3 text-right">Tỷ giá ghi nợ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {unpaidOrders.map((o) => (
                  <tr key={o.id} className="hover:bg-amber-50/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-gray-700">{o.order_code}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {(o.suppliers as { name: string } | null)?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{o.order_date}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{formatKRW(o.amount_paid)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-amber-700">{formatKRW(o.outstanding)}</td>
                    <td className="px-4 py-3 text-right text-xs">
                      {o.exchange_rate != null
                        ? <span className="text-brand-800">{o.exchange_rate}</span>
                        : <span className="text-amber-600">Chưa có</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
