'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatVND, formatKRW } from '@/lib/format'
import { ImportOrderForm } from './ImportOrderForm'
import { recordSupplierPayment } from '../actions'
import { payVnSupplier } from '@/features/expenses-vn/actions'
import type { ImportOrderDetail } from '../queries'

type SimpleOption  = { id: string; name: string }
type SupplierOpt   = { id: string; code: string; name: string }
type ProductOpt    = { id: string; code: string; name: string; unit?: string | null }
type ProjectOpt    = { id: string; code: string; name: string; company_id: string }

interface Props {
  order:     ImportOrderDetail
  mode?:     'edit' | 'pay'  // default = 'edit' (hiện cả 2 nút)
  companies: SimpleOption[]
  suppliers: SupplierOpt[]
  products:  ProductOpt[]
  projects:  ProjectOpt[]
  autoEdit?: boolean
  bankAccounts?: { id: string; name: string; currency: string }[]
}

export function ImportOrderDetailClient({ order, mode, companies, suppliers, products, projects, autoEdit, bankAccounts = [] }: Props) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(!!autoEdit)
  const [payOpen,  setPayOpen]  = useState(false)
  const [payAmt,   setPayAmt]   = useState('')
  const [payBankId, setPayBankId] = useState('')
  const [payDate,  setPayDate]  = useState(new Date().toISOString().slice(0, 10))
  const [payError, setPayError] = useState('')
  const [paying,   setPaying]   = useState(false)

  const isKrw = order.currency === 'KRW'
  const fmtNative = (n: number) => isKrw ? formatKRW(n) : formatVND(n)

  async function handlePay(e: React.FormEvent) {
    e.preventDefault()
    setPaying(true); setPayError('')
    try {
      if (order.currency === 'VND') {
        // VNĐ: tạo phiếu chi + giảm nợ (atomic) — cần tài khoản & ngày
        await payVnSupplier({
          supplier_order_id: order.id,
          bank_account_id:   payBankId,
          amount_vnd:        parseFloat(payAmt),
          txn_date:          payDate,
          note:              `Thanh toán đơn ${order.order_code}`,
        })
      } else {
        // KRW: giữ đường cũ (cộng amount_paid nguyên tệ)
        await recordSupplierPayment(order.id, { amount: parseFloat(payAmt) })
      }
      router.refresh()
      setPayOpen(false)
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Có lỗi xảy ra')
    } finally {
      setPaying(false)
    }
  }

  if (mode === 'pay') {
    return (
      <>
        <Button size="sm" variant="outline" onClick={() => setPayOpen(true)}>
          Ghi thanh toán NCC
        </Button>

        <Dialog open={payOpen} onOpenChange={setPayOpen}>
          <DialogContent showCloseButton={false} className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Ghi thanh toán NCC</DialogTitle>
            </DialogHeader>
            <div className="rounded-lg bg-gray-50 border px-4 py-3 text-sm space-y-1 mb-4">
              <div className="flex justify-between">
                <span className="text-gray-500">Còn nợ:</span>
                <span className="font-semibold text-amber-700">{fmtNative(order.outstanding)}</span>
              </div>
            </div>
            <form onSubmit={handlePay} className="space-y-4">
              {order.currency === 'VND' && (
                <>
                  <div className="space-y-1">
                    <Label>Tài khoản chi <span className="text-red-500">*</span></Label>
                    <select value={payBankId} onChange={(e) => setPayBankId(e.target.value)} required
                      className="w-full h-9 rounded-lg border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50">
                      <option value="">— Chọn tài khoản —</option>
                      {bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.currency})</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>Ngày chi <span className="text-red-500">*</span></Label>
                    <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} required />
                  </div>
                </>
              )}
              <div className="space-y-1">
                <Label>Số tiền trả ({order.currency}) <span className="text-red-500">*</span></Label>
                <Input type="number" min="1" step="1"
                  value={payAmt} onChange={(e) => setPayAmt(e.target.value)}
                  placeholder={String(order.outstanding)} required />
                {parseFloat(payAmt) > 0 && (
                  <p className="text-xs text-gray-500">{fmtNative(parseFloat(payAmt))}</p>
                )}
              </div>
              {payError && <p className="text-sm text-red-600">{payError}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setPayOpen(false)} disabled={paying}>Hủy</Button>
                <Button type="submit" disabled={paying}>
                  {paying ? 'Đang lưu...' : 'Xác nhận'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </>
    )
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>Sửa đơn</Button>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent showCloseButton={false} className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Sửa đơn nhập khẩu — {order.order_code}</DialogTitle>
          </DialogHeader>
          <ImportOrderForm
            companies={companies} suppliers={suppliers}
            products={products} projects={projects}
            editOrder={order}
            onDone={() => { setEditOpen(false); router.refresh() }}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
