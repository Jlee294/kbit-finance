'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatVND } from '@/lib/format'
import { computeOrderTotals } from '../status'
import { createOrder, updateOrder } from '../actions'
import type { OrderDetail } from '../queries'
import type { CreateOrderInput } from '../schema'

// ── Prop types ────────────────────────────────────────────────────────────────

type SimpleOption    = { id: string; name: string }
type CustomerOption  = { id: string; code: string; name: string }
type ProjectOption   = { id: string; code: string; name: string; company_id: string }
type ProductOption   = { id: string; code: string; name: string }

interface Props {
  companies: SimpleOption[]
  customers: CustomerOption[]
  projects:  ProjectOption[]
  products:  ProductOption[]
  initial?:  OrderDetail
  onDone?:   () => void
}

// ── Item row state ────────────────────────────────────────────────────────────

type ItemRow = {
  key:         number
  product_id:  string
  description: string
  qty:         string
  unit_price:  string
  lot_no:      string
  expiry_date: string
}

let nextKey = 1
function newRow(): ItemRow {
  return {
    key: nextKey++,
    product_id:  '',
    description: '',
    qty:         '1',
    unit_price:  '0',
    lot_no:      '',
    expiry_date: '',
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function OrderForm({ companies, customers, projects, products, initial, onDone }: Props) {
  const router  = useRouter()
  const isEdit  = !!initial?.id

  // ── Header state ─────────────────────────────────────────────────────────
  const [companyId,     setCompanyId]     = useState(initial?.company?.id   ?? '')
  const [customerId,    setCustomerId]    = useState(initial?.customer?.id  ?? '')
  const [projectId,     setProjectId]     = useState(initial?.project?.id   ?? '')
  const [orderDate,     setOrderDate]     = useState(initial?.order_date    ?? new Date().toISOString().slice(0, 10))
  const [deliveryDate,  setDeliveryDate]  = useState(initial?.delivery_date ?? '')
  const [fulfillment,   setFulfillment]   = useState(initial?.fulfillment_status ?? 'confirmed')
  const [lotNo,         setLotNo]         = useState(initial?.lot_no        ?? '')
  const [expiryDate,    setExpiryDate]    = useState(initial?.expiry_date   ?? '')
  const [isIntercompany, setIsIntercompany] = useState(initial?.is_intercompany ?? false)
  const [counterpartId,  setCounterpartId]  = useState(initial?.counterpart_company_id ?? '')

  // ── Charge state ─────────────────────────────────────────────────────────
  const [discountPct,  setDiscountPct]  = useState(String(initial?.discount_pct  ?? 0))
  const [vatPct,       setVatPct]       = useState(String(initial?.vat_pct       ?? 0))
  const [shippingFee,  setShippingFee]  = useState(String(initial?.shipping_fee  ?? 0))

  // ── Items state ───────────────────────────────────────────────────────────
  const [items, setItems] = useState<ItemRow[]>(() => {
    if (initial?.items && initial.items.length > 0) {
      return initial.items.map((it) => ({
        key:         nextKey++,
        product_id:  it.product_id  ?? '',
        description: it.description ?? '',
        qty:         String(it.qty),
        unit_price:  String(it.unit_price),
        lot_no:      it.lot_no      ?? '',
        expiry_date: it.expiry_date ?? '',
      }))
    }
    return [newRow()]
  })

  const [error,  setError]  = useState('')
  const [saving, setSaving] = useState(false)

  // ── Derived totals ────────────────────────────────────────────────────────
  const itemsForCalc = items.map((r) => ({
    qty:        parseFloat(r.qty)        || 0,
    unit_price: parseFloat(r.unit_price) || 0,
  }))
  const totals = computeOrderTotals(
    itemsForCalc,
    parseFloat(discountPct)  || 0,
    parseFloat(vatPct)       || 0,
    parseFloat(shippingFee)  || 0,
  )

  // ── Filtered projects ─────────────────────────────────────────────────────
  const filteredProjects = companyId
    ? projects.filter((p) => p.company_id === companyId)
    : projects

  // ── Item helpers ──────────────────────────────────────────────────────────
  function addRow() { setItems((prev) => [...prev, newRow()]) }

  function removeRow(key: number) {
    setItems((prev) => prev.filter((r) => r.key !== key))
  }

  function updateRow(key: number, patch: Partial<ItemRow>) {
    setItems((prev) => prev.map((r) => r.key === key ? { ...r, ...patch } : r))
  }

  function handleProductChange(key: number, productId: string) {
    const prod = products.find((p) => p.id === productId)
    updateRow(key, {
      product_id:  productId,
      description: prod ? prod.name : '',
    })
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      const payload: CreateOrderInput = {
        company_id:    companyId,
        project_id:    projectId || null,
        customer_id:   customerId,
        order_date:    orderDate,
        delivery_date: deliveryDate || null,
        fulfillment_status: fulfillment as CreateOrderInput['fulfillment_status'],
        lot_no:        lotNo     || null,
        expiry_date:   expiryDate || null,
        is_intercompany: isIntercompany,
        counterpart_company_id: isIntercompany ? (counterpartId || null) : null,
        discount_pct:  parseFloat(discountPct) || 0,
        vat_pct:       parseFloat(vatPct)      || 0,
        shipping_fee:  parseFloat(shippingFee) || 0,
        items: items.map((it) => ({
          product_id:  it.product_id  || null,
          description: it.description || null,
          qty:         parseFloat(it.qty)        || 1,
          unit_price:  parseFloat(it.unit_price) || 0,
          lot_no:      it.lot_no      || null,
          expiry_date: it.expiry_date || null,
        })),
      }

      if (isEdit && initial?.id) {
        await updateOrder(initial.id, payload)
        router.refresh(); onDone?.()
      } else {
        const result = await createOrder(payload)
        router.push(`/don-hang/${result.id}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra')
    } finally {
      setSaving(false)
    }
  }

  // ── Shared input className ────────────────────────────────────────────────
  const sel = 'w-full h-9 rounded-lg border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50'
  const numInput = 'h-8 w-full rounded border border-input bg-transparent px-2 text-sm text-right focus:outline-none focus:ring-1 focus:ring-ring/50'

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* ─ Header fields ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">

        <div className="space-y-1">
          <Label>Công ty <span className="text-red-500">*</span></Label>
          <select value={companyId}
            onChange={(e) => { setCompanyId(e.target.value); setProjectId('') }}
            required className={sel}>
            <option value="">— Chọn công ty —</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="space-y-1">
          <Label>Khách hàng <span className="text-red-500">*</span></Label>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}
            required className={sel}>
            <option value="">— Chọn khách hàng —</option>
            {customers.map((c) => <option key={c.id} value={c.id}>[{c.code}] {c.name}</option>)}
          </select>
        </div>

        <div className="space-y-1">
          <Label>Dự án</Label>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={sel}>
            <option value="">— Không có —</option>
            {filteredProjects.map((p) => <option key={p.id} value={p.id}>[{p.code}] {p.name}</option>)}
          </select>
        </div>

        <div className="space-y-1">
          <Label>Trạng thái giao hàng</Label>
          <select value={fulfillment} onChange={(e) => setFulfillment(e.target.value)} className={sel}>
            <option value="draft">Nháp</option>
            <option value="confirmed">Đã xác nhận</option>
            <option value="awaiting_goods">Đang chờ hàng</option>
            <option value="delivered">Đã giao</option>
          </select>
        </div>

        <div className="space-y-1">
          <Label>Ngày đặt hàng <span className="text-red-500">*</span></Label>
          <Input type="date" value={orderDate}
            onChange={(e) => setOrderDate(e.target.value)} required />
        </div>

        <div className="space-y-1">
          <Label>Ngày giao dự kiến</Label>
          <Input type="date" value={deliveryDate}
            onChange={(e) => setDeliveryDate(e.target.value)} />
        </div>

        <div className="space-y-1">
          <Label>Số lô đơn hàng (Lot No.)</Label>
          <Input value={lotNo} onChange={(e) => setLotNo(e.target.value)}
            placeholder="VD: LOT-001" />
        </div>

        <div className="space-y-1">
          <Label>Ngày hết hạn đơn hàng</Label>
          <Input type="date" value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)} />
        </div>
      </div>

      {/* ─ Intercompany ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <input id="intercompany" type="checkbox" checked={isIntercompany}
          onChange={(e) => setIsIntercompany(e.target.checked)}
          className="h-4 w-4 rounded border-input" />
        <Label htmlFor="intercompany">Giao dịch nội bộ (intercompany)</Label>
        {isIntercompany && (
          <select value={counterpartId} onChange={(e) => setCounterpartId(e.target.value)}
            required={isIntercompany}
            className={`ml-4 flex-1 ${sel}`}>
            <option value="">— Công ty đối tác —</option>
            {companies.filter((c) => c.id !== companyId).map((c) =>
              <option key={c.id} value={c.id}>{c.name}</option>
            )}
          </select>
        )}
      </div>

      {/* ─ Items table ───────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-medium text-sm text-gray-700">Dòng hàng</h3>
          <Button type="button" variant="outline" size="sm" onClick={addRow}>+ Thêm dòng</Button>
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-gray-50 text-gray-600 text-xs">
              <tr>
                <th className="px-2 py-2 text-left w-[22%]">Sản phẩm</th>
                <th className="px-2 py-2 text-left w-[18%]">Mô tả</th>
                <th className="px-2 py-2 text-right w-[7%]">SL</th>
                <th className="px-2 py-2 text-right w-[13%]">Đơn giá</th>
                <th className="px-2 py-2 text-right w-[11%]">Thành tiền</th>
                <th className="px-2 py-2 text-left w-[12%]">Lot No.</th>
                <th className="px-2 py-2 text-left w-[13%]">Exp Date</th>
                <th className="px-2 py-2 w-[4%]"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => {
                const lineTotal = (parseFloat(row.qty) || 0) * (parseFloat(row.unit_price) || 0)
                return (
                  <tr key={row.key} className="border-t">
                    <td className="px-2 py-1">
                      <select value={row.product_id}
                        onChange={(e) => handleProductChange(row.key, e.target.value)}
                        className="w-full h-8 rounded border border-input bg-transparent px-2 text-sm">
                        <option value="">— Chọn SP —</option>
                        {products.map((p) =>
                          <option key={p.id} value={p.id}>[{p.code}] {p.name}</option>
                        )}
                      </select>
                    </td>
                    <td className="px-2 py-1">
                      <input type="text" value={row.description}
                        onChange={(e) => updateRow(row.key, { description: e.target.value })}
                        className="w-full h-8 rounded border border-input bg-transparent px-2 text-sm"
                        placeholder="Mô tả..." />
                    </td>
                    <td className="px-2 py-1">
                      <input type="number" min="0.01" step="any" value={row.qty}
                        onChange={(e) => updateRow(row.key, { qty: e.target.value })}
                        className={numInput} />
                    </td>
                    <td className="px-2 py-1">
                      <input type="number" min="0" step="any" value={row.unit_price}
                        onChange={(e) => updateRow(row.key, { unit_price: e.target.value })}
                        className={numInput} />
                    </td>
                    <td className="px-3 py-1 text-right text-gray-700 whitespace-nowrap text-xs">
                      {formatVND(lineTotal)}
                    </td>
                    <td className="px-2 py-1">
                      <input type="text" value={row.lot_no}
                        onChange={(e) => updateRow(row.key, { lot_no: e.target.value })}
                        className="w-full h-8 rounded border border-input bg-transparent px-2 text-sm"
                        placeholder="LOT-001" />
                    </td>
                    <td className="px-2 py-1">
                      <input type="date" value={row.expiry_date}
                        onChange={(e) => updateRow(row.key, { expiry_date: e.target.value })}
                        className="w-full h-8 rounded border border-input bg-transparent px-2 text-sm" />
                    </td>
                    <td className="px-2 py-1 text-center">
                      <button type="button" onClick={() => removeRow(row.key)}
                        disabled={items.length === 1}
                        className="text-gray-400 hover:text-red-500 disabled:opacity-30"
                        title="Xoá dòng">✕</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─ Charges + totals ──────────────────────────────────────────────── */}
      <div className="flex justify-end">
        <div className="w-full max-w-sm space-y-2 text-sm">

          {/* Tiểu tổng */}
          <div className="flex justify-between text-gray-600 border-b pb-2">
            <span>Tiểu tổng</span>
            <span className="font-medium text-gray-900">{formatVND(totals.subtotal)}</span>
          </div>

          {/* Chiết khấu */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-gray-600">
              <span>Chiết khấu</span>
              <div className="flex items-center gap-1">
                <input type="number" min="0" max="100" step="0.01" value={discountPct}
                  onChange={(e) => setDiscountPct(e.target.value)}
                  className="w-16 h-7 rounded border border-input bg-transparent px-2 text-right text-sm" />
                <span className="text-gray-500">%</span>
              </div>
            </div>
            <span className="text-red-600 font-medium">
              {totals.discountAmount > 0 ? `- ${formatVND(totals.discountAmount)}` : '—'}
            </span>
          </div>

          {/* VAT */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-gray-600">
              <span>VAT</span>
              <div className="flex items-center gap-1">
                <input type="number" min="0" max="100" step="0.01" value={vatPct}
                  onChange={(e) => setVatPct(e.target.value)}
                  className="w-16 h-7 rounded border border-input bg-transparent px-2 text-right text-sm" />
                <span className="text-gray-500">%</span>
              </div>
            </div>
            <span className="text-blue-600 font-medium">
              {totals.vatAmount > 0 ? `+ ${formatVND(totals.vatAmount)}` : '—'}
            </span>
          </div>

          {/* Phí vận chuyển */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-gray-600">Phí vận chuyển</span>
            <input type="number" min="0" step="1000" value={shippingFee}
              onChange={(e) => setShippingFee(e.target.value)}
              className="w-36 h-7 rounded border border-input bg-transparent px-2 text-right text-sm" />
          </div>

          {/* Grand total */}
          <div className="flex justify-between border-t pt-2 font-semibold text-base">
            <span>Tổng thanh toán</span>
            <span className="text-gray-900">{formatVND(totals.grandTotal)}</span>
          </div>
        </div>
      </div>

      {/* ─ Error / actions ───────────────────────────────────────────────── */}
      {error && (
        <p className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="flex justify-end gap-2">
        {onDone && (
          <Button type="button" variant="outline" onClick={onDone} disabled={saving}>Hủy</Button>
        )}
        <Button type="submit" disabled={saving}>
          {saving ? 'Đang lưu...' : isEdit ? 'Cập nhật đơn' : 'Tạo đơn hàng'}
        </Button>
      </div>
    </form>
  )
}
