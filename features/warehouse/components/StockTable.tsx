'use client'

import { useState } from 'react'
import type { StockRow, Warehouse } from '../queries'

interface Props {
  warehouses: Warehouse[]
  stock: StockRow[]
}

export function StockTable({ warehouses, stock }: Props) {
  const [activeWh, setActiveWh] = useState<string>('all')

  const filtered = activeWh === 'all'
    ? stock
    : stock.filter(r => r.warehouse_id === activeWh)

  return (
    <div className="space-y-4">
      {/* Tabs kho */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setActiveWh('all')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            activeWh === 'all' ? 'bg-blue-600 text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'
          }`}
        >
          Tất cả ({stock.length})
        </button>
        {warehouses.map(wh => {
          const count = stock.filter(r => r.warehouse_id === wh.id).length
          return (
            <button
              key={wh.id}
              onClick={() => setActiveWh(wh.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activeWh === wh.id ? 'bg-blue-600 text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'
              }`}
            >
              {wh.name} ({count})
            </button>
          )
        })}
      </div>

      {/* Bảng tồn kho */}
      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-gray-400">
            Không có tồn kho nào.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-xs text-gray-500 uppercase">
                <th className="px-4 py-3 text-left">Sản phẩm</th>
                {activeWh === 'all' && <th className="px-4 py-3 text-left">Kho</th>}
                <th className="px-4 py-3 text-left">ĐVT</th>
                <th className="px-4 py-3 text-right">Tồn kho</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((r, i) => {
                const low = r.qty_on_hand <= 5
                return (
                  <tr key={i} className={`hover:bg-gray-50 ${low ? 'bg-amber-50' : ''}`}>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-gray-800">{r.product_name}</p>
                      <p className="text-xs text-gray-400">{r.product_code}</p>
                    </td>
                    {activeWh === 'all' && (
                      <td className="px-4 py-2.5 text-gray-600">{r.warehouse_name}</td>
                    )}
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{r.unit ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`font-semibold ${low ? 'text-amber-600' : 'text-gray-800'}`}>
                        {r.qty_on_hand.toLocaleString('vi-VN')}
                      </span>
                      {low && (
                        <span className="ml-1.5 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                          Sắp hết
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
