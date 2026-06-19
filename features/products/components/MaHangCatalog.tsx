'use client'

import { CatalogPage, type Column } from '@/components/catalog/CatalogPage'
import { QuickProductForm } from './QuickProductForm'
import { formatVND } from '@/lib/format'

export interface MaHangRow {
  id:          string
  code:        string
  name:        string
  unit:        string
  qty_on_hand: number
  stock_value: number | null   // thành tiền tồn (null nếu không có quyền xem giá vốn)
}

const baseColumns: Column<MaHangRow>[] = [
  { key: 'code', label: 'Mã hàng' },
  { key: 'name', label: 'Tên hàng' },
  { key: 'unit', label: 'ĐVT' },
  {
    key: 'qty_on_hand',
    label: 'Tồn kho',
    render: (r) => (
      <span className={r.qty_on_hand < 0 ? 'text-red-600 font-semibold' : ''}>
        {r.qty_on_hand.toLocaleString('vi-VN')}
      </span>
    ),
  },
]

const costColumn: Column<MaHangRow> = {
  key: 'stock_value',
  label: 'Thành tiền tồn',
  render: (r) => <span className="text-gray-700">{r.stock_value != null ? formatVND(r.stock_value) : '—'}</span>,
}

export function MaHangCatalog({ rows, canWrite, showCost }: { rows: MaHangRow[]; canWrite: boolean; showCost?: boolean }) {
  const columns = showCost ? [...baseColumns, costColumn] : baseColumns
  return (
    <CatalogPage
      title="Mã hàng"
      subtitle={`${rows.length} mã hàng (tồn kho)`}
      rows={rows}
      columns={columns}
      canWrite={canWrite}
      FormComponent={QuickProductForm}
    />
  )
}
