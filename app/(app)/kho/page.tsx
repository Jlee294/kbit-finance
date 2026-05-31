import Link from 'next/link'
import { listWarehouses, listStock } from '@/features/warehouse/queries'
import { StockTable } from '@/features/warehouse/components/StockTable'

export const dynamic = 'force-dynamic'

export default async function KhoPage() {
  const [warehouses, stock] = await Promise.all([listWarehouses(), listStock()])

  const totalSkus = new Set(stock.map(r => r.product_id)).size
  const lowStock = stock.filter(r => r.qty_on_hand <= 5)

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Kho hàng</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {totalSkus} mặt hàng · {warehouses.length} kho
            {lowStock.length > 0 && (
              <span className="ml-2 text-amber-600 font-medium">⚠ {lowStock.length} mặt hàng sắp hết</span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/kho/nhap"
            className="h-8 px-3 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 flex items-center gap-1">
            + Nhập kho
          </Link>
          <Link href="/kho/xuat"
            className="h-8 px-3 bg-red-500 text-white rounded-md text-sm hover:bg-red-600 flex items-center gap-1">
            − Xuất kho
          </Link>
          <Link href="/kho/luan-chuyen"
            className="h-8 px-3 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 flex items-center gap-1">
            ⇄ Luân chuyển
          </Link>
          <Link href="/kho/lich-su"
            className="h-8 px-3 bg-gray-100 text-gray-700 rounded-md text-sm hover:bg-gray-200 flex items-center">
            Lịch sử
          </Link>
        </div>
      </div>

      <StockTable warehouses={warehouses} stock={stock} />
    </div>
  )
}
