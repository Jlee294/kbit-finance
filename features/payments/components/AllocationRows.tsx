'use client'

import { formatVND } from '@/lib/format'

export type OrderForAlloc = {
  id: string
  order_code: string
  grand_total: number
  outstanding: number
}

export type AllocRow = {
  key:              number
  order_id:         string
  allocated_amount: string
}

let nextKey = 1
export function newAllocRow(): AllocRow {
  return { key: nextKey++, order_id: '', allocated_amount: '' }
}

interface Props {
  rows:       AllocRow[]
  orders:     OrderForAlloc[]
  totalAmount: number   // tổng tiền phiếu thu (để hiển thị còn lại)
  onChange:   (rows: AllocRow[]) => void
}

export function AllocationRows({ rows, orders, totalAmount, onChange }: Props) {
  const totalAllocated = rows.reduce((s, r) => s + (parseFloat(r.allocated_amount) || 0), 0)
  const remaining = totalAmount - totalAllocated

  function addRow() {
    onChange([...rows, newAllocRow()])
  }

  function removeRow(key: number) {
    onChange(rows.filter((r) => r.key !== key))
  }

  function updateRow(key: number, patch: Partial<AllocRow>) {
    onChange(rows.map((r) => r.key === key ? { ...r, ...patch } : r))
  }

  function handleOrderChange(key: number, orderId: string) {
    // Gợi ý số tiền = outstanding của đơn đó
    const order = orders.find((o) => o.id === orderId)
    const suggested = order ? String(Math.min(Number(order.outstanding), remaining + (parseFloat(rows.find(r => r.key === key)?.allocated_amount || '0') || 0))) : ''
    updateRow(key, { order_id: orderId, allocated_amount: suggested })
  }

  // Đơn đã chọn ở các dòng khác (không cho chọn lại)
  const usedOrderIds = new Set(rows.map((r) => r.order_id).filter(Boolean))

  return (
    <div className="space-y-2">
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400 italic">
          Không phân bổ đơn nào → phiếu thu sẽ là tiền cọc (is_unassigned)
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs">
              <tr>
                <th className="px-3 py-2 text-left w-[45%]">Đơn hàng</th>
                <th className="px-3 py-2 text-right w-[25%]">Còn nợ</th>
                <th className="px-3 py-2 text-right w-[25%]">Phân bổ</th>
                <th className="px-3 py-2 w-[5%]"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const order = orders.find((o) => o.id === row.order_id)
                return (
                  <tr key={row.key} className="border-t">
                    <td className="px-2 py-1">
                      <select
                        value={row.order_id}
                        onChange={(e) => handleOrderChange(row.key, e.target.value)}
                        className="w-full h-8 rounded border border-input bg-transparent px-2 text-sm"
                      >
                        <option value="">— Chọn đơn hàng —</option>
                        {orders.map((o) => (
                          <option
                            key={o.id}
                            value={o.id}
                            disabled={usedOrderIds.has(o.id) && o.id !== row.order_id}
                          >
                            {o.order_code} (còn {formatVND(Number(o.outstanding))})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-1 text-right text-gray-500 text-xs">
                      {order ? formatVND(Number(order.outstanding)) : '—'}
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={row.allocated_amount}
                        onChange={(e) => updateRow(row.key, { allocated_amount: e.target.value })}
                        className="w-full h-8 rounded border border-input bg-transparent px-2 text-sm text-right"
                        placeholder="0"
                      />
                    </td>
                    <td className="px-2 py-1 text-center">
                      <button
                        type="button"
                        onClick={() => removeRow(row.key)}
                        className="text-gray-400 hover:text-red-500"
                        title="Xoá dòng"
                      >✕</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={addRow}
          disabled={orders.length === 0}
          className="text-sm text-brand-700 hover:underline disabled:text-gray-400 disabled:no-underline"
        >
          + Thêm đơn phân bổ
        </button>

        <div className="text-sm text-right space-y-0.5">
          <div className="flex gap-4 text-gray-600">
            <span>Đã phân bổ:</span>
            <span className="font-medium text-gray-900">{formatVND(totalAllocated)}</span>
          </div>
          <div className="flex gap-4">
            <span className={remaining < 0 ? 'text-red-600' : 'text-gray-600'}>
              {remaining >= 0 ? 'Còn lại (→ tiền cọc/thừa):' : 'VƯỢT QUÁ:'}
            </span>
            <span className={`font-medium ${remaining < 0 ? 'text-red-600' : remaining > 0 ? 'text-orange-600' : 'text-brand-700'}`}>
              {formatVND(Math.abs(remaining))}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
