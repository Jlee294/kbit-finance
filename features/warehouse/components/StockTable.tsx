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
          className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            activeWh === 'all'
              ? 'bg-brand-800 text-white shadow-sm'
              : 'bg-white border border-gray-200 text-gray-600 hover:bg-brand-50/40 hover:text-brand-800 hover:border-brand-200'
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
              className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activeWh === wh.id
                  ? 'bg-brand-800 text-white shadow-sm'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-brand-50/40 hover:text-brand-800 hover:border-brand-200'
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
              <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase font-montserrat font-semibold">
                <th className="px-4 py-3 text-left">Sản phẩm</th>
                {activeWh === 'all' && <th className="px-4 py-3 text-left">Kho</th>}
                <th className="px-4 py-3 text-left">ĐVT</th>
                <th className="px-4 py-3 text-right">Tồn kho</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((r, i) => {
                const neg = r.qty_on_hand < 0
                const low = !neg && r.qty_on_hand <= 5
                return (
                  <tr key={i} className={`hover:bg-brand-50/40 ${neg ? 'bg-red-50' : low ? 'bg-warning-50' : ''}`}>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-gray-800">{r.product_name}</p>
                      <p className="text-xs text-gray-400">{r.product_code}</p>
                    </td>
                    {activeWh === 'all' && (
                      <td className="px-4 py-2.5 text-gray-600">{r.warehouse_name}</td>
                    )}
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{r.unit ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`font-semibold ${neg ? 'text-red-600' : low ? 'text-amber-600' : 'text-gray-800'}`}>
                        {r.qty_on_hand.toLocaleString('vi-VN')}
                      </span>
                      {neg ? (
                        <span className="ml-1.5 text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                          Âm kho
                        </span>
                      ) : low ? (
                        <span className="ml-1.5 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                          Sắp hết
                        </span>
                      ) : null}
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
