import Link from 'next/link'
import { listWarehouses, listStock } from '@/features/warehouse/queries'
import { StockTable } from '@/features/warehouse/components/StockTable'
import { PageHeader } from '@/components/shared/PageHeader'
import { PAGE_WRAPPER } from '@/lib/ui-tokens'

export const dynamic = 'force-dynamic'

export default async function KhoPage() {
  const [warehouses, stock] = await Promise.all([listWarehouses(), listStock()])

  const totalSkus = new Set(stock.map(r => r.product_id)).size
  const lowStock = stock.filter(r => r.qty_on_hand <= 5)

  return (
    <div className={PAGE_WRAPPER}>
      <PageHeader
        title="Kho hàng"
        subtitle={
          <>
            {totalSkus} mặt hàng · {warehouses.length} kho
            {lowStock.length > 0 && (
              <span className="ml-2 text-warning-700 font-medium">⚠ {lowStock.length} mặt hàng sắp hết</span>
            )}
          </>
        }
        actions={
          <>
            <Link href="/kho/nhap"
              className="h-9 px-3.5 bg-success-500 text-white rounded-lg text-sm font-medium hover:bg-success-700 transition-colors flex items-center">
              Nhập kho
            </Link>
            <Link href="/kho/xuat"
              className="h-9 px-3.5 bg-danger-500 text-white rounded-lg text-sm font-medium hover:bg-danger-700 transition-colors flex items-center">
              Xuất kho
            </Link>
            <Link href="/kho/luan-chuyen"
              className="h-9 px-3.5 bg-brand-800 text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors flex items-center">
              Luân chuyển
            </Link>
            <Link href="/kho/lich-su"
              className="h-9 px-3.5 bg-white text-gray-700 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors flex items-center">
              Lịch sử
            </Link>
          </>
        }
      />

      <StockTable warehouses={warehouses} stock={stock} />
    </div>
  )
}
