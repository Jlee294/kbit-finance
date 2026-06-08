'use client'

import { CatalogPage, type Column } from '@/components/catalog/CatalogPage'
import { QuickProductForm } from './QuickProductForm'

export interface MaHangRow {
  id:          string
  code:        string
  name:        string
  unit:        string
  qty_on_hand: number
}

const columns: Column<MaHangRow>[] = [
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

export function MaHangCatalog({ rows, canWrite }: { rows: MaHangRow[]; canWrite: boolean }) {
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
