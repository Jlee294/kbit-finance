'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatVND, todayLocal } from '@/lib/format'
import { createExpenseVn, payVnSupplier } from '../actions'

type SimpleOption  = { id: string; name: string }
type BankOption    = { id: string; name: string; currency: string; company_id: string }
type ProjectOption = { id: string; code: string; name: string; company_id: string }
type SupplierOption = { id: string; code: string; name: string }
type SupplierOrderOption = { id: string; order_code: string; supplier_id: string; outstanding: number }

interface Props {
  companies:      SimpleOption[]
  bankAccounts:   BankOption[]
  projects:       ProjectOption[]
  suppliers:      SupplierOption[]
  supplierOrders?: SupplierOrderOption[]
  onDone:         () => void
}

const EXPENSE_CATEGORIES = [
  'Văn phòng phẩm', 'Lương & thưởng', 'Marketing', 'Chi phí vận chuyển',
  'Thuế & phí', 'Công tác phí', 'Sửa chữa & bảo dưỡng', 'Điện / Nước / Internet',
  'R&D', 'Khác',
]

export function ExpenseVnForm({ companies, bankAccounts, projects, suppliers, supplierOrders = [], onDone }: Props) {
  const router = useRouter()

  // Header
  const [companyId,   setCompanyId]   = useState('')
  const [bankId,      setBankId]      = useState('')
  const [txnDate,     setTxnDate]     = useState(todayLocal())
  const [amountVnd,   setAmountVnd]   = useState('')
  const [note,        setNote]        = useState('')
  const [projectId,   setProjectId]   = useState('')
  const [supplierId,  setSupplierId]  = useState('')
  const [supplierOrderId, setSupplierOrderId] = useState('')
  const [category,    setCategory]    = useState('')

  // Trục 1: VAT
  const [hasVat,    setHasVat]    = useState(false)
  const [vatAmount, setVatAmount] = useState('')

  // Trục 2: Chi hộ
  const [isChiHo,    setIsChiHo]    = useState(false)
  const [chiHoPerson, setChiHoPerson] = useState('')

  // Nội bộ
  const [isIntercompany,          setIsIntercompany]          = useState(false)
  const [counterpartCompanyId, setCounterpartCompanyId] = useState('')

  // Định khoản tay (áp cho cả chi thường lẫn trả nợ NCC)
  const [dinhKhoanNo, setDinhKhoanNo] = useState('')
  const [dinhKhoanCo, setDinhKhoanCo] = useState('')

  const [error,  setError]  = useState('')
  const [saving, setSaving] = useState(false)

  const sel = 'w-full h-9 rounded-lg border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50'

  const filteredBanks    = companyId ? bankAccounts.filter((b) => b.company_id === companyId) : bankAccounts
  const filteredProjects = companyId ? projects.filter((p) => p.company_id === companyId)     : projects
  const counterpartCompanies = companies.filter((c) => c.id !== companyId)
  // Đơn NCC (VNĐ) còn nợ của nhà cung cấp đã chọn — để trả công nợ
  const ordersForSupplier = supplierId ? supplierOrders.filter((o) => o.supplier_id === supplierId) : []
  const isPayingDebt = !!supplierOrderId

  const amt = parseFloat(amountVnd) || 0
  const vat = parseFloat(vatAmount) || 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      if (isPayingDebt) {
        // Thanh toán công nợ NCC: vừa ghi phiếu chi vừa giảm nợ (atomic)
        await payVnSupplier({
          supplier_order_id: supplierOrderId,
          bank_account_id:   bankId,
          amount_vnd:        amt,
          txn_date:          txnDate,
          note:              note || null,
          dinh_khoan_no:     dinhKhoanNo || null,
          dinh_khoan_co:     dinhKhoanCo || null,
        })
        router.refresh()
        onDone()
        return
      }
      await createExpenseVn({
        company_id:               companyId,
        bank_account_id:          bankId,
        txn_date:                 txnDate,
        amount_vnd:               amt,
        note:                     note || null,
        has_vat:                  hasVat,
        vat_amount:               vat,
        is_chi_ho:                isChiHo,
        chi_ho_person:            isChiHo ? chiHoPerson : null,
        expense_category:         category || null,
        is_intercompany:          isIntercompany,
        counterpart_company_id:   isIntercompany ? counterpartCompanyId : null,
        project_id:               projectId || null,
        supplier_id:              supplierId || null,
        dinh_khoan_no:            dinhKhoanNo || null,
        dinh_khoan_co:            dinhKhoanCo || null,
      })
      router.refresh()
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* ── Thông tin cơ bản ─────────────────────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Thông tin cơ bản</h3>
        <div className="grid grid-cols-2 gap-4">

          <div className="space-y-1">
            <Label>Công ty <span className="text-red-500">*</span></Label>
            <select value={companyId}
              onChange={(e) => { setCompanyId(e.target.value); setBankId(''); setProjectId('') }}
              required className={sel}>
              <option value="">— Chọn công ty —</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <Label>Tài khoản chi <span className="text-red-500">*</span></Label>
            <select value={bankId} onChange={(e) => setBankId(e.target.value)} required className={sel}>
              <option value="">— Chọn tài khoản —</option>
              {filteredBanks.map((b) => (
                <option key={b.id} value={b.id}>{b.name} ({b.currency})</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <Label>Số tiền chi (VNĐ) <span className="text-red-500">*</span></Label>
            <Input type="number" min="1" step="1"
              value={amountVnd} onChange={(e) => setAmountVnd(e.target.value)}
              placeholder="VD: 5000000" required />
            {amt > 0 && <p className="text-xs text-gray-500 mt-0.5">{formatVND(amt)}</p>}
          </div>

          <div className="space-y-1">
            <Label>Ngày chi <span className="text-red-500">*</span></Label>
            <Input type="date" value={txnDate} onChange={(e) => setTxnDate(e.target.value)} required />
          </div>

          <div className="space-y-1">
            <Label>Nhà cung cấp</Label>
            <select value={supplierId} onChange={(e) => { setSupplierId(e.target.value); setSupplierOrderId('') }} className={sel}>
              <option value="">— Không có —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>[{s.code}] {s.name}</option>)}
            </select>
          </div>

          {ordersForSupplier.length > 0 && (
            <div className="space-y-1">
              <Label>Trả cho đơn mua <span className="text-xs text-gray-400 font-normal">(giảm công nợ)</span></Label>
              <select value={supplierOrderId}
                onChange={(e) => {
                  const oid = e.target.value
                  setSupplierOrderId(oid)
                  const o = supplierOrders.find((x) => x.id === oid)
                  if (o && !amountVnd) setAmountVnd(String(o.outstanding))
                }}
                className={sel}>
                <option value="">— Không (chi phí thường) —</option>
                {ordersForSupplier.map((o) => (
                  <option key={o.id} value={o.id}>{o.order_code} — còn nợ {formatVND(o.outstanding)}</option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1">
            <Label>Dự án</Label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={sel}>
              <option value="">— Không có —</option>
              {filteredProjects.map((p) => <option key={p.id} value={p.id}>[{p.code}] {p.name}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <Label>Loại chi phí</Label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={sel}>
              <option value="">— Chọn —</option>
              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <Label>Định khoản Nợ</Label>
            <Input value={dinhKhoanNo} onChange={(e) => setDinhKhoanNo(e.target.value)} placeholder="VD: 642" />
          </div>

          <div className="space-y-1">
            <Label>Định khoản Có</Label>
            <Input value={dinhKhoanCo} onChange={(e) => setDinhKhoanCo(e.target.value)} placeholder="VD: 112" />
          </div>

          <div className="space-y-1 col-span-2">
            <Label>Ghi chú</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Mô tả khoản chi..." />
          </div>
        </div>
      </div>

      {isPayingDebt && (
        <div className="rounded-lg bg-brand-50 border border-brand-100 px-4 py-3 text-sm text-brand-800">
          Đang <strong>thanh toán công nợ</strong> cho đơn mua đã chọn — phiếu chi này sẽ tự động <strong>giảm nợ phải trả</strong> của đơn đó.
          <span className="block text-xs text-gray-500 mt-1">(Các mục VAT / chi hộ / nội bộ không áp dụng khi trả công nợ.)</span>
        </div>
      )}

      {!isPayingDebt && (<>
      {/* ── Trục 1: Hóa đơn VAT ────────────────────────────────── */}
      <div className="border border-gray-200 rounded-lg p-4 space-y-3 border-l-2 border-l-brand-500">
        <div className="flex items-center gap-2">
          <input id="hasVat" type="checkbox" checked={hasVat}
            onChange={(e) => { setHasVat(e.target.checked); if (!e.target.checked) setVatAmount('') }}
            className="h-4 w-4 rounded border-gray-300" />
          <Label htmlFor="hasVat" className="cursor-pointer font-medium">
            Có hóa đơn VAT
          </Label>
        </div>
        {hasVat && (
          <div className="grid grid-cols-2 gap-4 pl-6">
            <div className="space-y-1">
              <Label>Số tiền VAT <span className="text-red-500">*</span></Label>
              <Input type="number" min="1" step="1"
                value={vatAmount} onChange={(e) => setVatAmount(e.target.value)}
                placeholder="VD: 500000" required={hasVat} />
              {vat > 0 && <p className="text-xs text-gray-500 mt-0.5">{formatVND(vat)}</p>}
            </div>
            {amt > 0 && vat > 0 && (
              <div className="space-y-1">
                <Label className="text-gray-500">Giá trước VAT</Label>
                <p className="h-9 flex items-center text-sm font-medium">
                  {formatVND(amt - vat)}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Trục 2: Chi hộ ─────────────────────────────────────── */}
      <div className="border border-gray-200 rounded-lg p-4 space-y-3 border-l-2 border-l-brand-500">
        <div className="flex items-center gap-2">
          <input id="isChiHo" type="checkbox" checked={isChiHo}
            onChange={(e) => { setIsChiHo(e.target.checked); if (!e.target.checked) setChiHoPerson('') }}
            className="h-4 w-4 rounded border-gray-300" />
          <Label htmlFor="isChiHo" className="cursor-pointer font-medium">
            Chi hộ (sẽ thu lại — không tính vào chi phí công ty)
          </Label>
        </div>
        {isChiHo && (
          <div className="pl-6 space-y-1">
            <Label>Tên người được chi hộ <span className="text-red-500">*</span></Label>
            <Input value={chiHoPerson} onChange={(e) => setChiHoPerson(e.target.value)}
              placeholder="VD: Anh Hưng, Chị Lan..." required={isChiHo} />
            {amt > 0 && (
              <p className="text-xs text-amber-600 mt-1">
                Sẽ tạo khoản phải thu lại {formatVND(amt)} từ {chiHoPerson || '...'}
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Giao dịch nội bộ ──────────────────────────────────── */}
      <div className="border border-gray-200 rounded-lg p-4 space-y-3 border-l-2 border-l-brand-500">
        <div className="flex items-center gap-2">
          <input id="isInterco" type="checkbox" checked={isIntercompany}
            onChange={(e) => { setIsIntercompany(e.target.checked); if (!e.target.checked) setCounterpartCompanyId('') }}
            className="h-4 w-4 rounded border-gray-300" />
          <Label htmlFor="isInterco" className="cursor-pointer font-medium">
            Giao dịch nội bộ (giữa các công ty trong hệ thống)
          </Label>
        </div>
        {isIntercompany && (
          <div className="pl-6 space-y-1">
            <Label>Công ty đối ứng <span className="text-red-500">*</span></Label>
            <select value={counterpartCompanyId}
              onChange={(e) => setCounterpartCompanyId(e.target.value)}
              required={isIntercompany} className={sel}>
              <option value="">— Chọn công ty —</option>
              {counterpartCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* ── Tóm tắt ────────────────────────────────────────────── */}
      {amt > 0 && (
        <div className="rounded-lg bg-gray-50 border px-4 py-3 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-600">Tổng chi:</span>
            <span className="font-semibold">{formatVND(amt)}</span>
          </div>
          {hasVat && vat > 0 && (
            <div className="flex justify-between text-gray-500">
              <span>Trong đó VAT:</span>
              <span>{formatVND(vat)}</span>
            </div>
          )}
          {isChiHo && (
            <div className="flex justify-between text-amber-600">
              <span>Chi hộ (phải thu lại):</span>
              <span>{formatVND(amt)}</span>
            </div>
          )}
          {!isChiHo && (
            <div className="flex justify-between font-semibold text-red-600 pt-1 border-t">
              <span>Chi phí công ty:</span>
              <span>{formatVND(amt)}</span>
            </div>
          )}
        </div>
      )}
      </>)}

      {error && (
        <p className="rounded-md bg-danger-50 px-4 py-2 text-sm text-danger-700">{error}</p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone} disabled={saving}>Hủy</Button>
        <Button type="submit" disabled={saving}>
          {saving ? 'Đang lưu...' : (isPayingDebt ? 'Ghi chi & giảm nợ NCC' : 'Ghi phiếu chi')}
        </Button>
      </div>
    </form>
  )
}
