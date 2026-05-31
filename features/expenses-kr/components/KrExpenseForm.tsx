'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatVND, formatKRW } from '@/lib/format'
import { krwToVnd } from '../fx'
import { createKrExpense } from '../actions'

type SimpleOption  = { id: string; name: string }
type SupplierOption = { id: string; code: string; name: string }
type BankOption    = { id: string; name: string; company_id: string }
type ProjectOption = { id: string; code: string; name: string; company_id: string }

interface Props {
  companies:    SimpleOption[]
  krwBanks:     BankOption[]
  krSuppliers:  SupplierOption[]
  projects:     ProjectOption[]
  onDone:       () => void
}

export function KrExpenseForm({ companies, krwBanks, krSuppliers, projects, onDone }: Props) {
  const router = useRouter()

  const [companyId,   setCompanyId]   = useState('')
  const [bankId,      setBankId]      = useState('')
  const [supplierId,  setSupplierId]  = useState('')
  const [amountKrw,   setAmountKrw]   = useState('')
  const [rate,        setRate]        = useState('')
  const [txnDate,     setTxnDate]     = useState(new Date().toISOString().slice(0, 10))
  const [kind,        setKind]        = useState<'goods' | 'service'>('goods')
  const [hasVat,      setHasVat]      = useState(false)
  const [vatAmount,   setVatAmount]   = useState('')
  const [note,        setNote]        = useState('')
  const [projectId,   setProjectId]   = useState('')
  const [isInterco,   setIsInterco]   = useState(false)
  const [counterpartId, setCounterpartId] = useState('')

  const [error,  setError]  = useState('')
  const [saving, setSaving] = useState(false)

  const sel = 'w-full h-9 rounded-lg border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50'

  const filteredBanks    = companyId ? krwBanks.filter((b) => b.company_id === companyId) : krwBanks
  const filteredProjects = companyId ? projects.filter((p) => p.company_id === companyId) : projects
  const counterpartList  = companies.filter((c) => c.id !== companyId)

  const krw = parseFloat(amountKrw) || 0
  const rateVal = parseFloat(rate) || 0
  const vndPreview = krw > 0 && rateVal > 0 ? krwToVnd(krw, rateVal) : 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      const result = await createKrExpense({
        company_id:             companyId,
        bank_account_id:        bankId,
        supplier_id:            supplierId || null,
        amount_krw:             krw,
        exchange_rate:          rateVal,
        txn_date:               txnDate,
        expense_kind:           kind,
        has_vat:                hasVat,
        vat_amount:             hasVat ? (parseFloat(vatAmount) || 0) : 0,
        note:                   note || null,
        project_id:             projectId || null,
        is_intercompany:        isInterco,
        counterpart_company_id: isInterco ? counterpartId : null,
      })
      router.refresh()
      if (result.fctWarning) {
        // ⏳ A2: nhắc FCT cho phí dịch vụ KR
        alert('⚠️ Phí dịch vụ cho đối tác Hàn — kiểm tra thuế nhà thầu (FCT) trước khi duyệt.')
      }
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* ── Thông tin cơ bản ─────────────────────────────────────── */}
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
          <Label>Tài khoản KRW <span className="text-red-500">*</span></Label>
          <select value={bankId} onChange={(e) => setBankId(e.target.value)} required className={sel}>
            <option value="">— Chọn tài khoản —</option>
            {filteredBanks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>

        <div className="space-y-1">
          <Label>Số tiền (KRW) <span className="text-red-500">*</span></Label>
          <Input type="number" min="1" step="1"
            value={amountKrw} onChange={(e) => setAmountKrw(e.target.value)}
            placeholder="VD: 1000000" required />
          {krw > 0 && <p className="text-xs text-gray-500 mt-0.5">{formatKRW(krw)}</p>}
        </div>

        <div className="space-y-1">
          <Label>Tỷ giá KRW/VNĐ <span className="text-red-500">*</span></Label>
          <Input type="number" min="0.001" step="0.001"
            value={rate} onChange={(e) => setRate(e.target.value)}
            placeholder="VD: 18.5" required />
          {vndPreview > 0 && (
            <p className="text-xs text-blue-600 mt-0.5 font-medium">
              ≈ {formatVND(vndPreview)}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <Label>Ngày chi <span className="text-red-500">*</span></Label>
          <Input type="date" value={txnDate} onChange={(e) => setTxnDate(e.target.value)} required />
        </div>

        <div className="space-y-1">
          <Label>Loại chi <span className="text-red-500">*</span></Label>
          <select value={kind} onChange={(e) => setKind(e.target.value as 'goods' | 'service')} required className={sel}>
            <option value="goods">Tiền hàng (goods)</option>
            <option value="service">Phí dịch vụ (service)</option>
          </select>
          {/* ⏳ A2: cảnh báo FCT */}
          {kind === 'service' && (
            <p className="text-xs text-orange-600 mt-1 font-medium">
              ⚠️ Phí dịch vụ KR — kiểm tra thuế nhà thầu (FCT) trước khi duyệt
            </p>
          )}
        </div>

        <div className="space-y-1">
          <Label>NCC Hàn Quốc</Label>
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={sel}>
            <option value="">— Không có —</option>
            {krSuppliers.map((s) => <option key={s.id} value={s.id}>[{s.code}] {s.name}</option>)}
          </select>
        </div>

        <div className="space-y-1">
          <Label>Dự án</Label>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={sel}>
            <option value="">— Không có —</option>
            {filteredProjects.map((p) => <option key={p.id} value={p.id}>[{p.code}] {p.name}</option>)}
          </select>
        </div>

        <div className="space-y-1 col-span-2">
          <Label>Ghi chú</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Mô tả khoản chi..." />
        </div>
      </div>

      {/* ── Hóa đơn VAT ─────────────────────────────────────────── */}
      <div className="border rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <input id="hasVatKr" type="checkbox" checked={hasVat}
            onChange={(e) => { setHasVat(e.target.checked); if (!e.target.checked) setVatAmount('') }}
            className="h-4 w-4 rounded border-gray-300" />
          <Label htmlFor="hasVatKr" className="cursor-pointer font-medium">Có hóa đơn VAT</Label>
        </div>
        {hasVat && (
          <div className="pl-6 space-y-1">
            <Label>Số tiền VAT (KRW) <span className="text-red-500">*</span></Label>
            <Input type="number" min="1" step="1"
              value={vatAmount} onChange={(e) => setVatAmount(e.target.value)}
              placeholder="VD: 100000" required={hasVat} />
          </div>
        )}
      </div>

      {/* ── Giao dịch nội bộ ────────────────────────────────────── */}
      <div className="border rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <input id="isIntercoKr" type="checkbox" checked={isInterco}
            onChange={(e) => { setIsInterco(e.target.checked); if (!e.target.checked) setCounterpartId('') }}
            className="h-4 w-4 rounded border-gray-300" />
          <Label htmlFor="isIntercoKr" className="cursor-pointer font-medium">
            Giao dịch nội bộ (phía công ty đối ứng cũng phải gắn cờ)
          </Label>
        </div>
        {isInterco && (
          <div className="pl-6 space-y-1">
            <Label>Công ty đối ứng <span className="text-red-500">*</span></Label>
            <select value={counterpartId} onChange={(e) => setCounterpartId(e.target.value)}
              required={isInterco} className={sel}>
              <option value="">— Chọn công ty —</option>
              {counterpartList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* ── Tóm tắt ─────────────────────────────────────────────── */}
      {vndPreview > 0 && (
        <div className="rounded-lg bg-gray-50 border px-4 py-3 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-600">Số tiền KRW:</span>
            <span className="font-medium">{formatKRW(krw)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Tỷ giá:</span>
            <span>{rateVal} VNĐ/KRW</span>
          </div>
          <div className="flex justify-between font-semibold text-red-600 pt-1 border-t">
            <span>Quy đổi VNĐ:</span>
            <span>{formatVND(vndPreview)}</span>
          </div>
        </div>
      )}

      {error && <p className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone} disabled={saving}>Hủy</Button>
        <Button type="submit" disabled={saving}>
          {saving ? 'Đang lưu...' : 'Ghi phiếu chi KR'}
        </Button>
      </div>
    </form>
  )
}
