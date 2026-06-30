'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { setOpeningStock } from '@/features/inventory-cost/actions'
import { PageHeader } from '@/components/shared/PageHeader'
import { PAGE_WRAPPER } from '@/lib/ui-tokens'
import { formatVND } from '@/lib/format'
import { useT } from '@/lib/i18n/client'

interface Product { id: string; code: string; name: string }
interface Warehouse { id: string; code: string; name: string }
interface Opening { product_id: string; warehouse_id: string; qty: number; unit_cost: number; value: number; product: string; warehouse: string }
interface StockItem { warehouse_id: string; warehouse_name: string; product_id: string; product_code: string; product_name: string; qty_on_hand: number }

export function OpeningBalanceClient({ period, canWrite, products, warehouses, openings, currentStock }: {
  period: string; canWrite: boolean; products: Product[]; warehouses: Warehouse[]; openings: Opening[]; currentStock: StockItem[]
}) {
  const router = useRouter()
  const t = useT()
  const [productId, setProductId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [qty, setQty] = useState('')
  const [unitCost, setUnitCost] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function prefill(s: StockItem) {
    setProductId(s.product_id); setWarehouseId(s.warehouse_id); setQty(String(s.qty_on_hand))
  }

  async function save() {
    setSaving(true); setError('')
    const r = await setOpeningStock({ product_id: productId, warehouse_id: warehouseId, period, qty, unit_cost: unitCost })
    setSaving(false)
    if (r.error) { setError(r.error); return }
    setProductId(''); setWarehouseId(''); setQty(''); setUnitCost(''); router.refresh()
  }

  return (
    <div className={PAGE_WRAPPER}>
      <PageHeader title={t('Số dư đầu kỳ kho')} subtitle={t('Khai SL tồn + đơn giá vốn đầu kỳ cho từng mã TẠI TỪNG KHO (làm 1 lần khi bắt đầu áp dụng giá vốn)')} />

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500">{t('Kỳ mốc')}</label>
          <input type="month" value={period} onChange={e => router.push(`/kho/so-du-dau-ky?period=${e.target.value}`)}
            className="h-9 rounded-md border border-gray-200 px-3 text-sm" />
        </div>
        <span className="text-xs text-gray-400">{t('Công ty chọn ở thanh trên cùng')}</span>
      </div>

      {canWrite && (
        <div className="rounded-xl border bg-white p-4 grid grid-cols-5 gap-3 items-end">
          <div className="space-y-1 col-span-2">
            <label className="text-xs text-gray-500">{t('Mã hàng')}</label>
            <select value={productId} onChange={e => setProductId(e.target.value)} className="w-full h-9 rounded-md border border-gray-200 px-3 text-sm">
              <option value="">{t('— Chọn mã —')}</option>
              {products.map(p => <option key={p.id} value={p.id}>[{p.code}] {p.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-500">{t('Kho')}</label>
            <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)} className="w-full h-9 rounded-md border border-gray-200 px-3 text-sm">
              <option value="">{t('— Chọn kho —')}</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-500">{t('SL tồn đầu')}</label>
            <input type="number" min="0" step="any" value={qty} onChange={e => setQty(e.target.value)} className="w-full h-9 rounded-md border border-gray-200 px-3 text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-500">{t('Đơn giá vốn')}</label>
            <input type="number" min="0" step="any" value={unitCost} onChange={e => setUnitCost(e.target.value)} className="w-full h-9 rounded-md border border-gray-200 px-3 text-sm" />
          </div>
          <div className="col-span-5 flex items-center gap-3">
            <button onClick={save} disabled={saving || !productId || !warehouseId} className="h-9 px-4 bg-brand-800 text-white text-sm rounded-md hover:bg-brand-700 disabled:opacity-50">
              {saving ? t('Đang lưu...') : t('Lưu số dư đầu kỳ')}
            </button>
            {error && <span className="text-sm text-red-600">{error}</span>}
          </div>
        </div>
      )}

      {/* Tồn kho hiện có — tham chiếu khi khai số dư đầu (KTT) */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">
          {t('Tồn kho hiện có (theo từng kho)')}
          {canWrite && <span className="ml-2 text-xs font-normal text-gray-400">{t('— bấm 1 dòng để điền nhanh SL vào ô khai bên trên')}</span>}
        </h3>
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-montserrat text-xs font-semibold tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">{t('Kho')}</th>
                <th className="px-4 py-3 text-left">{t('Mã hàng')}</th>
                <th className="px-4 py-3 text-left">{t('Tên hàng')}</th>
                <th className="px-4 py-3 text-right">{t('SL tồn hiện có')}</th>
              </tr>
            </thead>
            <tbody>
              {currentStock.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">{t('Chưa có tồn kho')}</td></tr>
              ) : currentStock.map((s, i) => (
                <tr key={`${s.warehouse_id}-${s.product_id}-${i}`}
                  className={`border-t ${canWrite ? 'cursor-pointer hover:bg-brand-50/40' : ''}`}
                  onClick={canWrite ? () => prefill(s) : undefined}>
                  <td className="px-4 py-3 text-gray-600">{s.warehouse_name}</td>
                  <td className="px-4 py-3 font-mono text-gray-800">{s.product_code}</td>
                  <td className="px-4 py-3 text-gray-700">{s.product_name}</td>
                  <td className="px-4 py-3 text-right font-medium">{s.qty_on_hand.toLocaleString('vi-VN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <h3 className="text-sm font-semibold text-gray-700 mb-2">{t('Số dư đầu kỳ đã khai')}</h3>
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-montserrat text-xs font-semibold tracking-wide">
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
