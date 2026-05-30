'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatVND } from '@/lib/format'
import { createOrder, updateOrder } from '../actions'
import type { OrderDetail } from '../queries'
import type { CreateOrderInput } from '../schema'

// ── Prop types ────────────────────────────────────────────────────────────────

type SimpleOption = { id: string; name: string }
type CustomerOption = { id: string; code: string; name: string }
type ProjectOption  = { id: string; code: string; name: string; company_id: string }
type ProductOption  = { id: string; code: string; name: string }

interface Props {
  companies: SimpleOption[]
  customers: CustomerOption[]
  projects: ProjectOption[]
  products: ProductOption[]
  initial?: OrderDetail
  onDone?: () => void
}

// ── Item row state ────────────────────────────────────────────────────────────

type ItemRow = {
  key: number   // react key (local, not DB id)
  product_id: string
  description: string
  qty: string
  unit_price: string
}

let nextKey = 1
function newRow(): ItemRow {
  return { key: nextKey++, product_id: '', description: '', qty: '1', unit_price: '0' }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function OrderForm({ companies, customers, projects, products, initial, onDone }: Props) {
  const router = useRouter()
  const isEdit = !!initial?.id

  // ── Header state ─────────────────────────────────────────────────────────
  const [companyId, setCompanyId]     = useState(initial?.company?.id ?? '')
  const [customerId, setCustomerId]   = useState(initial?.customer?.id ?? '')
  const [projectId, setProjectId]     = useState(initial?.project?.id ?? '')
  const [orderDate, setOrderDate]     = useState(initial?.order_date ?? new Date().toISOString().slice(0, 10))
  const [deliveryDate, setDeliveryDate] = useState(initial?.delivery_date ?? '')
  const [fulfillment, setFulfillment] = useState(initial?.fulfillment_status ?? 'confirmed')
  const [lotNo, setLotNo]             = useState(initial?.lot_no ?? '')
  const [expiryDate, setExpiryDate]   = useState(initial?.expiry_date ?? '')
  const [isIntercompany, setIsIntercompany] = useState(initial?.is_intercompany ?? false)
  const [counterpartId, setCounterpartId]   = useState(initial?.counterpart_company_id ?? '')

  // ── Items state ───────────────────────────────────────────────────────────
  const [items, setItems] = useState<ItemRow[]>(() => {
    if (initial?.items && initial.items.length > 0) {
      return initial.items.map((it) => ({
        key: nextKey++,
        product_id: it.product_id ?? '',
        description: it.description ?? '',
        qty: String(it.qty),
        unit_price: String(it.unit_price),
      }))
    }
    return [newRow()]
  })

  const [error, setError]   = useState('')
  const [saving, setSaving] = useState(false)

  // ── Filtered projects (chỉ hiện dự án của công ty đã chọn) ───────────────
  const filteredProjects = companyId
    ? projects.filter((p) => p.company_id === companyId)
    : projects

  // ── Grand total (preview) ─────────────────────────────────────────────────
  const grandTotal = items.reduce((s, it) => {
    const qty = parseFloat(it.qty) || 0
    const price = parseFloat(it.unit_price) || 0
    return s + qty * price
  }, 0)

  // ── Item helpers ──────────────────────────────────────────────────────────
  function addRow() {
    setItems((prev) => [...prev, newRow()])
  }

  function removeRow(key: number) {
    setItems((prev) => prev.filter((r) => r.key !== key))
  }

  function updateRow(key: number, patch: Partial<ItemRow>) {
    setItems((prev) => prev.map((r) => r.key === key ? { ...r, ...patch } : r))
  }

  function handleProductChange(key: number, productId: string) {
    const prod = products.find((p) => p.id === productId)
    updateRow(key, {
      product_id: productId,
      description: prod ? prod.name : '',
    })
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')

    try {
      const payload: CreateOrderInput = {
        company_id: companyId,
        project_id: projectId || null,
        customer_id: customerId,
        order_date: orderDate,
        delivery_date: deliveryDate || null,
        fulfillment_status: fulfillment as CreateOrderInput['fulfillment_status'],
        lot_no: lotNo || null,
        expiry_date: expiryDate || null,
        is_intercompany: isIntercompany,
        counterpart_company_id: isIntercompany ? (counterpartId || null) : null,
        items: items.map((it) => ({
          product_id: it.product_id || null,
          description: it.description || null,
          qty: parseFloat(it.qty) || 1,
          unit_price: parseFloat(it.unit_price) || 0,
        })),
      }

      if (isEdit && initial?.id) {
        await updateOrder(initial.id, payload)
        router.refresh()
        onDone?.()
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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* ─ Header fields ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">

        {/* Công ty */}
        <div className="space-y-1">
          <Label>Công ty <span className="text-red-500">*</span></Label>
          <select
            value={companyId}
            onChange={(e) => { setCompanyId(e.target.value); setProjectId('') }}
            required
            className="w-full h-9 rounded-lg border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
          >
            <option value="">— Chọn công ty —</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Khách hàng */}
        <div className="space-y-1">
          <Label>Khách hàng <span className="text-red-500">*</span></Label>
          <select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            required
            className="w-full h-9 rounded-lg border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
          >
            <option value="">— Chọn khách hàng —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>[{c.code}] {c.name}</option>
            ))}
          </select>
        </div>

        {/* Dự án (tuỳ chọn) */}
        <div className="space-y-1">
          <Label>Dự án</Label>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full h-9 rounded-lg border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
          >
            <option value="">— Không có —</option>
            {filteredProjects.map((p) => (
              <option key={p.id} value={p.id}>[{p.code}] {p.name}</option>
            ))}
          </select>
        </div>

        {/* Trạng thái giao hàng */}
        <div className="space-y-1">
          <Label>Trạng thái giao hàng</Label>
          <select
            value={fulfillment}
            onChange={(e) => setFulfillment(e.target.value)}
            className="w-full h-9 rounded-lg border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
          >
            <option value="draft">Nháp</option>
            <option value="confirmed">Đã xác nhận</option>
            <option value="awaiting_goods">Đang chờ hàng</option>
            <option value="delivered">Đã giao</option>
          </select>
        </div>

        {/* Ngày đặt hàng */}
        <div className="space-y-1">
          <Label>Ngày đặt hàng <span className="text-red-500">*</span></Label>
          <Input
            type="date"
            value={orderDate}
            onChange={(e) => setOrderDate(e.target.value)}
            required
          />
        </div>

        {/* Ngày giao dự kiến */}
        <div className="space-y-1">
          <Label>Ngày giao dự kiến</Label>
          <Input
            type="date"
            value={deliveryDate}
            onChange={(e) => setDeliveryDate(e.target.value)}
          />
        </div>

        {/* Số lô */}
        <div className="space-y-1">
          <Label>Số lô (Lot No.)</Label>
          <Input
            value={lotNo}
            onChange={(e) => setLotNo(e.target.value)}
            placeholder="VD: LOT-001"
          />
        </div>

        {/* Ngày hết hạn */}
        <div className="space-y-1">
          <Label>Ngày hết hạn</Label>
          <Input
            type="date"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
          />
        </div>
      </div>

      {/* ─ Intercompany ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <input
          id="intercompany"
          type="checkbox"
          checked={isIntercompany}
          onChange={(e) => setIsIntercompany(e.target.checked)}
          className="h-4 w-4 rounded border-input"
        />
        <Label htmlFor="intercompany">Giao dịch nội bộ (intercompany)</Label>
        {isIntercompany && (
          <select
            value={counterpartId}
            onChange={(e) => setCounterpartId(e.target.value)}
            required={isIntercompany}
            className="ml-4 h-9 flex-1 rounded-lg border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
          >
            <option value="">— Công ty đối tác —</option>
            {companies.filter((c) => c.id !== companyId).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* ─ Items table ───────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-medium text-sm text-gray-700">Dòng hàng</h3>
          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            + Thêm dòng
          </Button>
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-3 py-2 text-left w-[30%]">Sản phẩm</th>
                <th className="px-3 py-2 text-left w-[28%]">Mô tả</th>
                <th className="px-3 py-2 text-right w-[10%]">SL</th>
                <th className="px-3 py-2 text-right w-[16%]">Đơn giá</th>
                <th className="px-3 py-2 text-right w-[12%]">Thành tiền</th>
                <th className="px-3 py-2 w-[4%]"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => {
                const lineTotal = (parseFloat(row.qty) || 0) * (parseFloat(row.unit_price) || 0)
                return (
                  <tr key={row.key} className="border-t">
                    <td className="px-2 py-1">
                      <select
                        value={row.product_id}
                        onChange={(e) => handleProductChange(row.key, e.target.value)}
                        className="w-full h-8 rounded border border-input bg-transparent px-2 text-sm"
                      >
                        <option value="">— Chọn SP —</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>[{p.code}] {p.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="text"
                        value={row.description}
                        onChange={(e) => updateRow(row.key, { description: e.target.value })}
                        className="w-full h-8 rounded border border-input bg-transparent px-2 text-sm"
                        placeholder="Mô tả..."
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        min="0.01"
                        step="any"
                        value={row.qty}
                        onChange={(e) => updateRow(row.key, { qty: e.target.value })}
                        className="w-full h-8 rounded border border-input bg-transparent px-2 text-sm text-right"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={row.unit_price}
                        onChange={(e) => updateRow(row.key, { unit_price: e.target.value })}
                        className="w-full h-8 rounded border border-input bg-transparent px-2 text-sm text-right"
                      />
                    </td>
                    <td className="px-3 py-1 text-right text-gray-700 whitespace-nowrap">
                      {formatVND(lineTotal)}
                    </td>
                    <td className="px-2 py-1 text-center">
                      <button
                        type="button"
                        onClick={() => removeRow(row.key)}
                        disabled={items.length === 1}
                        className="text-gray-400 hover:text-red-500 disabled:opacity-30"
                        title="Xoá dòng"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="bg-gray-50">
              <tr>
                <td colSpan={4} className="px-3 py-2 text-right font-medium text-gray-700">
                  Tổng cộng
                </td>
                <td className="px-3 py-2 text-right font-semibold text-gray-900">
                  {formatVND(grandTotal)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ─ Error / actions ───────────────────────────────────────────────── */}
      {error && (
        <p className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="flex justify-end gap-2">
        {onDone && (
          <Button type="button" variant="outline" onClick={onDone} disabled={saving}>
            Hủy
          </Button>
        )}
        <Button type="submit" disabled={saving}>
          {saving ? 'Đang lưu...' : isEdit ? 'Cập nhật đơn' : 'Tạo đơn hàng'}
        </Button>
      </div>
    </form>
  )
}
