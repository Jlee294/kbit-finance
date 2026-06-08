'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatVND, formatKRW, todayLocal } from '@/lib/format'
import { fxGainLoss, krwToVnd } from '../fx'
import { payKrSupplierOrder } from '../actions'
import type { KrUnpaidOrder } from '../queries'

interface Props {
  orders:    KrUnpaidOrder[]
  krwBanks:  { id: string; name: string; company_id: string }[]
  onDone:    () => void
}

export function KrSupplierPayForm({ orders, krwBanks, onDone }: Props) {
  const router = useRouter()

  const [orderId,     setOrderId]     = useState('')
  const [bankId,      setBankId]      = useState('')
  const [amountKrw,   setAmountKrw]   = useState('')
  const [rateSettled, setRateSettled] = useState('')
  const [rateBooked,  setRateBooked]  = useState('')  // fallback — chỉ khi đơn null
  const [txnDate,     setTxnDate]     = useState(todayLocal())
  const [note,        setNote]        = useState('')
  const [dinhKhoanNo, setDinhKhoanNo] = useState('')
  const [dinhKhoanCo, setDinhKhoanCo] = useState('')

  const [error,  setError]  = useState('')
  const [saving, setSaving] = useState(false)

  const sel = 'w-full h-9 rounded-lg border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50'

  const selectedOrder = orders.find((o) => o.id === orderId) ?? null

  // Khi chọn đơn → đặt trước amountKrw = outstanding
  useEffect(() => {
    if (selectedOrder) {
      setAmountKrw(String(selectedOrder.outstanding))
    }
  }, [orderId, selectedOrder])

  const krw            = parseFloat(amountKrw)    || 0
  const rateS          = parseFloat(rateSettled)  || 0
  // D4: rate_booked từ đơn (ưu tiên), fallback form
  const rateB          = selectedOrder?.exchange_rate ?? (parseFloat(rateBooked) || 0)
  const orderHasRate   = selectedOrder?.exchange_rate != null

  const vndPreview     = krw > 0 && rateS > 0 ? krwToVnd(krw, rateS) : 0
  const gainLossPreview = krw > 0 && rateS > 0 && rateB > 0
    ? fxGainLoss(krw, rateB, rateS)
    : null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      await payKrSupplierOrder({
        supplier_order_id: orderId,
        bank_account_id:   bankId,
        amount_krw:        krw,
        rate_settled:      rateS,
        txn_date:          txnDate,
        // D4: chỉ gửi rate_booked khi đơn chưa có (fallback)
        rate_booked:       orderHasRate ? null : (parseFloat(rateBooked) || null),
        note:              note || null,
        dinh_khoan_no:     dinhKhoanNo || null,
        dinh_khoan_co:     dinhKhoanCo || null,
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
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* ── Chọn đơn NCC ─────────────────────────────────────────── */}
      <div className="space-y-1">
        <Label>Đơn NCC KRW còn nợ <span className="text-red-500">*</span></Label>
        <select value={orderId} onChange={(e) => setOrderId(e.target.value)} required className={sel}>
          <option value="">— Chọn đơn —</option>
          {orders.map((o) => (
            <option key={o.id} value={o.id}>
              {o.order_code} — {(o.suppliers as { name: string } | null)?.name ?? '?'} — còn nợ {formatKRW(o.outstanding)}
            </option>
          ))}
        </select>
        {selectedOrder && (
          <div className="rounded-lg bg-gray-50 border px-3 py-2 text-xs space-y-0.5 mt-1">
            <p><span className="text-gray-500">Ngày đặt:</span> {selectedOrder.order_date}</p>
            <p><span className="text-gray-500">Còn nợ:</span> <strong>{formatKRW(selectedOrder.outstanding)}</strong></p>
            <p>
              <span className="text-gray-500">Tỷ giá ghi nợ:</span>{' '}
              {orderHasRate
                ? <strong className="text-brand-800">{selectedOrder.exchange_rate} VNĐ/KRW (từ đơn — không thể sửa)</strong>
                : <span className="text-amber-600">Chưa có — cần nhập thủ công</span>
              }
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">

        <div className="space-y-1">
          <Label>Tài khoản KRW chi <span className="text-red-500">*</span></Label>
          <select value={bankId} onChange={(e) => setBankId(e.target.value)} required className={sel}>
            <option value="">— Chọn tài khoản —</option>
            {krwBanks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>

        <div className="space-y-1">
          <Label>Ngày trả <span className="text-red-500">*</span></Label>
          <Input type="date" value={txnDate} onChange={(e) => setTxnDate(e.target.value)} required />
        </div>

        <div className="space-y-1">
          <Label>Số KRW trả lần này <span className="text-red-500">*</span></Label>
          <Input type="number" min="1" step="1"
            value={amountKrw} onChange={(e) => setAmountKrw(e.target.value)}
            placeholder={selectedOrder ? String(selectedOrder.outstanding) : '0'}
            required />
          {krw > 0 && <p className="text-xs text-gray-500 mt-0.5">{formatKRW(krw)}</p>}
          {selectedOrder && krw > selectedOrder.outstanding && (
            <p className="text-xs text-red-600 mt-0.5">⚠️ Vượt quá số còn nợ {formatKRW(selectedOrder.outstanding)}</p>
          )}
        </div>

        <div className="space-y-1">
          <Label>Tỷ giá lúc trả (rate_settled) <span className="text-red-500">*</span></Label>
          <Input type="number" min="0.001" step="0.001"
            value={rateSettled} onChange={(e) => setRateSettled(e.target.value)}
            placeholder="VD: 18.5" required />
        </div>

        {/* D4: ô rate_booked CHỈ hiện khi đơn chưa có exchange_rate */}
        {selectedOrder && !orderHasRate && (
          <div className="space-y-1 col-span-2">
            <Label>
              Tỷ giá lúc ghi nợ (rate_booked) <span className="text-red-500">*</span>
              <span className="ml-1 text-xs text-amber-600 font-normal">(đơn chưa có — nhập thủ công)</span>
            </Label>
            <Input type="number" min="0.001" step="0.001"
              value={rateBooked} onChange={(e) => setRateBooked(e.target.value)}
              placeholder="VD: 18" required={!orderHasRate} />
          </div>
        )}

        <div className="space-y-1">
          <Label>Định khoản Nợ</Label>
          <Input value={dinhKhoanNo} onChange={(e) => setDinhKhoanNo(e.target.value)} placeholder="VD: 331" />
        </div>

        <div className="space-y-1">
          <Label>Định khoản Có</Label>
          <Input value={dinhKhoanCo} onChange={(e) => setDinhKhoanCo(e.target.value)} placeholder="VD: 112" />
        </div>

        <div className="space-y-1 col-span-2">
          <Label>Ghi chú</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: Trả đơn PO-KR-TEST-01..." />
        </div>
      </div>

      {/* ── Tóm tắt + Chênh lệch tỷ giá ────────────────────────── */}
      {krw > 0 && rateS > 0 && (
        <div className="rounded-lg bg-gray-50 border px-4 py-3 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-600">Số KRW trả:</span>
            <span className="font-medium">{formatKRW(krw)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Tỷ giá trả (rate_settled):</span>
            <span>{rateS} VNĐ/KRW</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Thực chi VNĐ:</span>
            <span className="font-semibold">{formatVND(vndPreview)}</span>
          </div>
          {rateB > 0 && (
            <>
              <div className="flex justify-between text-gray-500">
                <span>Tỷ giá ghi nợ (rate_booked):</span>
                <span>{rateB} VNĐ/KRW</span>
              </div>
              {gainLossPreview !== null && (
                <div className={`flex justify-between font-bold pt-1 border-t ${gainLossPreview >= 0 ? 'text-brand-700' : 'text-red-600'}`}>
                  <span>{gainLossPreview >= 0 ? '✅ Lãi tỷ giá:' : '⚠️ Lỗ tỷ giá:'}</span>
                  <span>{gainLossPreview >= 0 ? '+' : ''}{formatVND(gainLossPreview)}</span>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {error && <p className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone} disabled={saving}>Hủy</Button>
        <Button type="submit" disabled={saving || !orderId}>
          {saving ? 'Đang lưu...' : 'Xác nhận trả nợ NCC'}
        </Button>
      </div>
    </form>
  )
}
