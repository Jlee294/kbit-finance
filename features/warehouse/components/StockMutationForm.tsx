'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { receiveStock, issueStock, transferStock } from '../actions'
import { ISSUE_REASONS, ISSUE_REASON_LABELS } from '../schema'
import type { Warehouse } from '../queries'
import { todayLocal } from '@/lib/format'
import { useT } from '@/lib/i18n/client'

interface Product { id: string; code: string; name: string; unit: string | null }

type Mode = 'receipt' | 'issue' | 'transfer'

interface Props {
  initialMode?: Mode
  warehouses: Warehouse[]
  products: Product[]
}

const MODE_LABELS: Record<Mode, string> = {
  receipt:  '+ Nhập kho',
  issue:    '− Xuất kho',
  transfer: '⇄ Luân chuyển',
}

export function StockMutationForm({ initialMode = 'receipt', warehouses, products }: Props) {
  const router = useRouter()
  const today = todayLocal()
  const t = useT()

  const [mode, setMode] = useState<Mode>(initialMode)
  const [warehouseId, setWarehouseId] = useState('')
  const [toWarehouseId, setToWarehouseId] = useState('')
  const [productId, setProductId] = useState('')
  const [qty, setQty] = useState('')
  const [unitCost, setUnitCost] = useState('')
  const [reason, setReason] = useState<string>('sale')
  const [txnDate, setTxnDate] = useState(today)
  const [note, setNote] = useState('')
  const [noInvoice, setNoInvoice] = useState(false)   // KTT C3
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
      result = await receiveStock({ warehouse_id: warehouseId, product_id: productId, qty, txn_date: txnDate, note, unit_cost: unitCost || null, has_invoice: !noInvoice })
    } else if (mode === 'issue') {
      result = await issueStock({ warehouse_id: warehouseId, product_id: productId, qty, reason, txn_date: txnDate, note, has_invoice: !noInvoice })
    } else {
      result = await transferStock({ from_warehouse_id: warehouseId, to_warehouse_id: toWarehouseId, product_id: productId, qty, txn_date: txnDate, note })
    }

    setSaving(false)
    if (result.error) {
      setError(result.error)
    } else {
      setSuccess(`✅ ${t(MODE_LABELS[mode])} ${t('thành công!')}`)
      setProductId('')
      setQty('')
      setUnitCost('')
      setNote('')
      setNoInvoice(false)
      router.refresh()
    }
  }

  const fieldCls = 'w-full h-9 rounded-md border border-gray-200 text-sm px-3 focus:outline-none focus:ring-2 focus:ring-blue-300'

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Loại phiếu — chọn ngay trong popup (gộp Nhập/Xuất/Luân chuyển) */}
      <div className="space-y-1">
        <label className="text-xs text-gray-500">{t('Loại phiếu')}</label>
        <select value={mode} onChange={e => setMode(e.target.value as Mode)} className={fieldCls}>
          <option value="receipt">{t('+ Nhập kho')}</option>
          <option value="issue">{t('− Xuất kho')}</option>
          <option value="transfer">{t('⇄ Luân chuyển')}</option>
        </select>
      </div>

      {/* Kho nguồn */}
      <div className="space-y-1">
        <label className="text-xs text-gray-500">
          {mode === 'transfer' ? t('Kho nguồn') : t('Kho')}
        </label>
        <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)} required className={fieldCls}>
          <option value="">{t('— Chọn kho —')}</option>
          {warehouses.map(w => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
      </div>

      {/* Kho đích (chỉ cho transfer) */}
      {mode === 'transfer' && (
        <div className="space-y-1">
          <label className="text-xs text-gray-500">{t('Kho đích')}</label>
          <select value={toWarehouseId} onChange={e => setToWarehouseId(e.target.value)} required className={fieldCls}>
            <option value="">{t('— Chọn kho đích —')}</option>
            {warehouses.filter(w => w.id !== warehouseId).map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Sản phẩm */}
      <div className="space-y-1">
        <label className="text-xs text-gray-500">{t('Sản phẩm')}</label>
        <select value={productId} onChange={e => setProductId(e.target.value)} required className={fieldCls}>
          <option value="">{t('— Chọn sản phẩm —')}</option>
          {products.map(p => (
            <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Số lượng */}
        <div className="space-y-1">
          <label className="text-xs text-gray-500">{t('Số lượng')}</label>
          <input
            type="number" min="0.001" step="any"
            value={qty} onChange={e => setQty(e.target.value)}
            required placeholder="0"
            className={fieldCls}
          />
        </div>

        {/* Ngày */}
        <div className="space-y-1">
          <label className="text-xs text-gray-500">{t('Ngày')}</label>
          <input type="date" value={txnDate} onChange={e => setTxnDate(e.target.value)} required className={fieldCls} />
        </div>
      </div>

      {/* Đơn giá vốn (chỉ cho nhập kho) */}
      {mode === 'receipt' && (
        <div className="space-y-1">
          <label className="text-xs text-gray-500">{t('Đơn giá vốn (₫/đơn vị)')}</label>
          <input
            type="number" min="0" step="any"
            value={unitCost} onChange={e => setUnitCost(e.target.value)}
            placeholder={t('Giá vốn nhập / đơn vị')}
            className={fieldCls}
          />
        </div>
      )}

      {/* Lý do (chỉ cho issue) */}
      {mode === 'issue' && (
        <div className="space-y-1">
          <label className="text-xs text-gray-500">{t('Lý do xuất')}</label>
          <select value={reason} onChange={e => setReason(e.target.value)} required className={fieldCls}>
            {ISSUE_REASONS.map(r => (
              <option key={r} value={r}>{ISSUE_REASON_LABELS[r]}</option>
            ))}
          </select>
        </div>
      )}

      {/* Ghi chú */}
      <div className="space-y-1">
        <label className="text-xs text-gray-500">{t('Ghi chú (tùy chọn)')}</label>
        <input
          value={note} onChange={e => setNote(e.target.value)}
          placeholder={t('Ghi chú...')}
          className={fieldCls}
        />
      </div>

      {/* KTT C3: cờ chưa có hóa đơn (chỉ cho nhập/xuất kho thủ công) */}
      {mode !== 'transfer' && (
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={noInvoice}
            onChange={(e) => setNoInvoice(e.target.checked)}
            className="rounded border-gray-300 text-brand-700 focus:ring-brand-500"
          />
          <span>{t('Chưa có hóa đơn')} <span className="text-xs text-gray-400">{t('(sẽ bổ sung sau)')}</span></span>
        </label>
      )}

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      {success && <p className="text-sm text-brand-700 bg-brand-50 rounded-lg px-3 py-2">{success}</p>}

      <button
        type="submit" disabled={saving}
        className="w-full h-9 bg-primary text-white text-sm font-medium rounded-md hover:bg-primary-700 disabled:opacity-50"
      >
        {saving ? t('Đang xử lý...') : t(MODE_LABELS[mode])}
      </button>
    </form>
  )
}
