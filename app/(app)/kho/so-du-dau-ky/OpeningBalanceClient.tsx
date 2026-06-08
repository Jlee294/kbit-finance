'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { setOpeningStock } from '@/features/inventory-cost/actions'
import { PageHeader } from '@/components/shared/PageHeader'
import { PAGE_WRAPPER } from '@/lib/ui-tokens'
import { formatVND } from '@/lib/format'

interface Product { id: string; code: string; name: string }
interface Warehouse { id: string; code: string; name: string }
interface Opening { product_id: string; warehouse_id: string; qty: number; unit_cost: number; value: number; product: string; warehouse: string }

export function OpeningBalanceClient({ period, canWrite, products, warehouses, openings }: {
  period: string; canWrite: boolean; products: Product[]; warehouses: Warehouse[]; openings: Opening[]
}) {
  const router = useRouter()
  const [productId, setProductId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [qty, setQty] = useState('')
  const [unitCost, setUnitCost] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setSaving(true); setError('')
    const r = await setOpeningStock({ product_id: productId, warehouse_id: warehouseId, period, qty, unit_cost: unitCost })
    setSaving(false)
    if (r.error) { setError(r.error); return }
    setProductId(''); setWarehouseId(''); setQty(''); setUnitCost(''); router.refresh()
  }

  return (
    <div className={PAGE_WRAPPER}>
      <PageHeader title="Số dư đầu kỳ kho" subtitle="Khai SL tồn + đơn giá vốn đầu kỳ cho từng mã TẠI TỪNG KHO (làm 1 lần khi bắt đầu áp dụng giá vốn)" />

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500">Kỳ mốc</label>
          <input type="month" value={period} onChange={e => router.push(`/kho/so-du-dau-ky?period=${e.target.value}`)}
            className="h-9 rounded-md border border-gray-200 px-3 text-sm" />
        </div>
        <span className="text-xs text-gray-400">Công ty chọn ở thanh trên cùng</span>
      </div>

      {canWrite && (
        <div className="rounded-xl border bg-white p-4 grid grid-cols-5 gap-3 items-end">
          <div className="space-y-1 col-span-2">
            <label className="text-xs text-gray-500">Mã hàng</label>
            <select value={productId} onChange={e => setProductId(e.target.value)} className="w-full h-9 rounded-md border border-gray-200 px-3 text-sm">
              <option value="">— Chọn mã —</option>
              {products.map(p => <option key={p.id} value={p.id}>[{p.code}] {p.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-500">Kho</label>
            <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)} className="w-full h-9 rounded-md border border-gray-200 px-3 text-sm">
              <option value="">— Chọn kho —</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-500">SL tồn đầu</label>
            <input type="number" min="0" step="any" value={qty} onChange={e => setQty(e.target.value)} className="w-full h-9 rounded-md border border-gray-200 px-3 text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-500">Đơn giá vốn</label>
            <input type="number" min="0" step="any" value={unitCost} onChange={e => setUnitCost(e.target.value)} className="w-full h-9 rounded-md border border-gray-200 px-3 text-sm" />
          </div>
          <div className="col-span-5 flex items-center gap-3">
            <button onClick={save} disabled={saving || !productId || !warehouseId} className="h-9 px-4 bg-brand-800 text-white text-sm rounded-md hover:bg-brand-700 disabled:opacity-50">
              {saving ? 'Đang lưu...' : 'Lưu số dư đầu kỳ'}
            </button>
            {error && <span className="text-sm text-red-600">{error}</span>}
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-brand-100 bg-brand-50/60 text-brand-800 text-xs font-semibold tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left">Mã hàng</th>
              <th className="px-4 py-3 text-left">Kho</th>
              <th className="px-4 py-3 text-right">SL tồn đầu</th>
              <th className="px-4 py-3 text-right">Đơn giá vốn</th>
              <th className="px-4 py-3 text-right">Giá trị đầu</th>
            </tr>
          </thead>
          <tbody>
            {openings.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Chưa khai số dư đầu kỳ nào cho kỳ {period}</td></tr>
            ) : openings.map((o, i) => (
              <tr key={`${o.product_id}-${o.warehouse_id}-${i}`} className="border-t">
                <td className="px-4 py-3">{o.product}</td>
                <td className="px-4 py-3">{o.warehouse}</td>
                <td className="px-4 py-3 text-right">{o.qty.toLocaleString('vi-VN')}</td>
                <td className="px-4 py-3 text-right">{formatVND(o.unit_cost)}</td>
                <td className="px-4 py-3 text-right">{formatVND(o.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
