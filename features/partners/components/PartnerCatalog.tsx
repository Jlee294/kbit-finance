'use client'

import { useState, type ComponentProps } from 'react'
import { CustomerCatalog } from '@/features/customers/components/CustomerCatalog'
import { SupplierCatalog } from '@/features/suppliers/components/SupplierCatalog'

type Tab = 'khach-hang' | 'nha-cung-cap'
type CustomerRows = ComponentProps<typeof CustomerCatalog>['rows']
type SupplierRows = ComponentProps<typeof SupplierCatalog>['rows']

/**
 * Gộp Khách hàng + Nhà cung cấp vào 1 trang "Đối tác" với 2 tab.
 * Mỗi tab tái dùng nguyên catalog cũ (không đụng dữ liệu/schema).
 */
export function PartnerCatalog({
  customers, suppliers, canWrite, defaultTab = 'khach-hang',
}: {
  customers: CustomerRows
  suppliers: SupplierRows
  canWrite: boolean
  defaultTab?: Tab
}) {
  const [tab, setTab] = useState<Tab>(defaultTab)
  const tabCls = (active: boolean) =>
    `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      active ? 'border-brand-600 text-brand-800' : 'border-transparent text-gray-500 hover:text-gray-800'
    }`
  return (
    <div>
      <div className="px-6 pt-6">
        <div className="flex gap-1 border-b border-gray-200">
          <button type="button" className={tabCls(tab === 'khach-hang')} onClick={() => setTab('khach-hang')}>
            Khách hàng <span className="ml-1 text-xs text-gray-400">({customers.length})</span>
          </button>
          <button type="button" className={tabCls(tab === 'nha-cung-cap')} onClick={() => setTab('nha-cung-cap')}>
            Nhà cung cấp <span className="ml-1 text-xs text-gray-400">({suppliers.length})</span>
          </button>
        </div>
      </div>
      {tab === 'khach-hang'
        ? <CustomerCatalog rows={customers} canWrite={canWrite} />
        : <SupplierCatalog rows={suppliers} canWrite={canWrite} />}
    </div>
  )
}
