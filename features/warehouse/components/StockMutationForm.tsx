'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { receiveStock, issueStock, transferStock } from '../actions'
import { ISSUE_REASONS, ISSUE_REASON_LABELS } from '../schema'
import type { Warehouse } from '../queries'

interface Product { id: string; code: string; name: string; unit: string | null }

type Mode = 'receipt' | 'issue' | 'transfer'

interface Props {
  mode: Mode
  warehouses: Warehouse[]
  products: Product[]
}

const MODE_LABELS: Record<Mode, string> = {
  receipt:  '+ Nhập kho',
  issue:    '− Xuất kho',
  transfer: '⇄ Luân chuyển',
}

export function StockMutationForm({ mode, warehouses, products }: Props) {
  const router = useRouter()
  const today = new Date().toISOString().split('T')[0]

  const [warehouseId, setWarehouseId] = useState('')
  const [toWarehouseId, setToWarehouseId] = useState('')
  const [productId, setProductId] = useState('')
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState<string>('sale')
  const [txnDate, setTxnDate] = useState(today)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    let result: { error?: string }

    if (mode === 'receipt') {
      result = await receiveStock({ warehouse_id: warehouseId, product_id: productId, qty, txn_date: txnDate, note })
    } else if (mode === 'issue') {
      result = await issueStock({ warehouse_id: warehouseId, product_id: productId, qty, reason, txn_date: txnDate, note })
    } else {
      result = await transferStock({ from_warehouse_id: warehouseId, to_warehouse_id: toWarehouseId, product_id: productId, qty, txn_date: txnDate, note })
    }

    setSaving(false)
    if (result.error) {
      setError(result.error)
    } else {
      setSuccess(`✅ ${MODE_LABELS[mode]} thành công!`)
      setProductId('')
      setQty('')
      setNote('')
      router.refresh()
    }
  }

  const fieldCls = 'w-full h-9 rounded-md border border-gray-200 text-sm px-3 focus:outline-none focus:ring-2 focus:ring-blue-300'

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Kho nguồn */}
      <div className="space-y-1">
        <label className="text-xs text-gray-500">
          {mode === 'transfer' ? 'Kho nguồn' : 'Kho'}
        </label>
        <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)} required className={fieldCls}>
          <option value="">— Chọn kho —</option>
          {warehouses.map(w => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
      </div>

      {/* Kho đích (chỉ cho transfer) */}
      {mode === 'transfer' && (
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Kho đích</label>
          <select value={toWarehouseId} onChange={e => setToWarehouseId(e.target.value)} required className={fieldCls}>
            <option value="">— Chọn kho đích —</option>
            {warehouses.filter(w => w.id !== warehouseId).map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Sản phẩm */}
      <div className="space-y-1">
        <label className="text-xs text-gray-500">Sản phẩm</label>
        <select value={productId} onChange={e => setProductId(e.target.value)} required className={fieldCls}>
          <option value="">— Chọn sản phẩm —</option>
          {products.map(p => (
            <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Số lượng */}
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Số lượng</label>
          <input
            type="number" min="0.001" step="any"
            value={qty} onChange={e => setQty(e.target.value)}
            required placeholder="0"
            className={fieldCls}
          />
        </div>

        {/* Ngày */}
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Ngày</label>
          <input type="date" value={txnDate} onChange={e => setTxnDate(e.target.value)} required className={fieldCls} />
        </div>
      </div>

      {/* Lý do (chỉ cho issue) */}
      {mode === 'issue' && (
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Lý do xuất</label>
          <select value={reason} onChange={e => setReason(e.target.value)} required className={fieldCls}>
            {ISSUE_REASONS.map(r => (
              <option key={r} value={r}>{ISSUE_REASON_LABELS[r]}</option>
            ))}
          </select>
        </div>
      )}

      {/* Ghi chú */}
      <div className="space-y-1">
        <label className="text-xs text-gray-500">Ghi chú (tùy chọn)</label>
        <input
          value={note} onChange={e => setNote(e.target.value)}
          placeholder="Ghi chú..."
          className={fieldCls}
        />
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      {success && <p className="text-sm text-green-600 bg-green-50 rounded-lg px-3 py-2">{success}</p>}

      <button
        type="submit" disabled={saving}
        className="w-full h-9 bg-brand-800 text-white text-sm font-medium rounded-md hover:bg-brand-700 disabled:opacity-50"
      >
        {saving ? 'Đang xử lý...' : MODE_LABELS[mode]}
      </button>
    </form>
  )
}
